import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { isAllowedDomain } from '@/lib/admin-config';

let adminApp: App;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (!getApps().length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      let raw = serviceAccountJson.trim();
      if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
        raw = raw.slice(1, -1);
      }
      adminApp = initializeApp({ credential: cert(JSON.parse(raw)), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
    } else {
      adminApp = initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
    }
  } else {
    adminApp = getApps()[0];
  }
  return adminApp;
}

/**
 * Verifies the Firebase ID token from an Authorization header.
 * Returns the decoded token if valid AND the email is from an allowed domain.
 * Returns null otherwise.
 */
export async function verifyAdminToken(authHeader: string | null): Promise<{ uid: string; email: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7);
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    const email = decoded.email;
    if (decoded.email_verified && email && isAllowedDomain(email)) {
      return { uid: decoded.uid, email };
    }
    return null;
  } catch {
    return null;
  }
}
