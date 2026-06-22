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
  return adminDb;
}
