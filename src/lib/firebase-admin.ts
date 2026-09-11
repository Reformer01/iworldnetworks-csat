import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminApp: App;
let adminDb: Firestore;

export function getAdminApp(): App {
  if (adminApp) return adminApp;

  if (!getApps().length) {
    // On Firebase App Hosting, Application Default Credentials are injected
    // automatically. Locally, set GOOGLE_APPLICATION_CREDENTIALS or provide
    // a service account via FIREBASE_SERVICE_ACCOUNT_JSON env var.
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (serviceAccountJson) {
      // Strip surrounding single or double quotes that dotenv may leave in place
      let raw = serviceAccountJson.trim();
      if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
        raw = raw.slice(1, -1);
      }
      const serviceAccount = JSON.parse(raw);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    } else {
      // Relies on ADC (Application Default Credentials)
      // Works automatically on Firebase App Hosting / GCP environments
      adminApp = initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }
  } else {
    adminApp = getApps()[0];
  }

  return adminApp;
}

export function getAdminFirestore(): Firestore {
  if (adminDb) return adminDb;
  adminDb = getFirestore(getAdminApp());
  // Strip undefined fields before writes. Several admin routes build docs
  // from optional request fields; without this, Firestore rejects the
  // document with "Cannot use undefined as a Firestore value".
  //
  // NOTE: getFirestore() returns the SAME cached Firestore instance per app,
  // but Next.js bundles this module separately per route/instrumentation, so
  // each bundle has its own `adminDb` cache. Calling settings() on an instance
  // already initialized by another bundle throws "settings() can only be
  // called once" — the option is idempotent, so the first caller wins and we
  // must swallow that error here.
  try {
    adminDb.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Already initialized by another bundle; setting is already applied.
  }
  return adminDb;
}
