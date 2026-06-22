import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';

for (const envFile of ['.env.local', '.env']) {
  if (existsSync(envFile)) {
    loadDotenv({ path: envFile, override: false });
  }
}

const requiredClientVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const errors = [];
const warnings = [];

for (const name of requiredClientVars) {
  if (!process.env[name]?.trim()) {
    errors.push(`Missing ${name}`);
  }
}

const deployTarget = (
  process.env.DEPLOY_TARGET ||
  (process.env.VERCEL ? 'vercel' : '') ||
  (process.env.FIREBASE_CONFIG || process.env.GOOGLE_CLOUD_PROJECT ? 'firebase' : '') ||
  'local'
).toLowerCase();

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
const googleCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
const hasGoogleRuntimeCredentials = Boolean(
  process.env.FIREBASE_CONFIG ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT
);

if (serviceAccountJson) {
  try {
    const raw = (
      (serviceAccountJson.startsWith("'") && serviceAccountJson.endsWith("'")) ||
      (serviceAccountJson.startsWith('"') && serviceAccountJson.endsWith('"'))
    )
      ? serviceAccountJson.slice(1, -1)
      : serviceAccountJson;
    const parsed = JSON.parse(raw);

    for (const field of ['project_id', 'client_email', 'private_key']) {
      if (!parsed[field]) {
        errors.push(`FIREBASE_SERVICE_ACCOUNT_JSON is missing ${field}`);
      }
    }

    if (
      parsed.project_id &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      parsed.project_id !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    ) {
      errors.push('FIREBASE_SERVICE_ACCOUNT_JSON project_id must match NEXT_PUBLIC_FIREBASE_PROJECT_ID');
    }
  } catch {
    errors.push('FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON');
  }
} else if (deployTarget === 'vercel') {
  errors.push('FIREBASE_SERVICE_ACCOUNT_JSON is required when DEPLOY_TARGET=vercel or VERCEL is set');
} else if (!googleCredentialsPath && !hasGoogleRuntimeCredentials) {
  warnings.push('Firebase Admin SDK credentials were not found. This is acceptable only when the hosting runtime provides ADC.');
}

if (!process.env.GEMINI_API_KEY?.trim() && !process.env.GOOGLE_API_KEY?.trim()) {
  warnings.push('GEMINI_API_KEY or GOOGLE_API_KEY is not set. AI sentiment analysis will be skipped when unavailable.');
}

if (!process.env.SENTRY_DSN?.trim() && !process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
  warnings.push('SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN is not set. Sentry error monitoring will be disabled.');
}

for (const warning of warnings) {
  console.log(`[env] Warning: ${warning}`);
}

if (errors.length > 0) {
  console.error('[env] Invalid deployment environment:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`[env] Environment validation passed for ${deployTarget}.`);
