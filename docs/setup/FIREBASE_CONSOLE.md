
# Firebase Console Setup Guide

Follow these steps to provision the backend services for the I-World Networks Management Hub.

## 1. Create a New Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and enter `i-world-networks`.
3. (Optional) Enable Google Analytics for advanced visitor tracking.
4. Click **Create project**.

## 2. Enable Authentication (SUPERVISOR ACCESS)
1. In the left sidebar, click **Build** > **Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, select **Email/Password**.
4. Enable the **Email/Password** switch and click **Save**.

### 🔒 Managing Supervisors (Critical for Security)
Public registration is disabled in the app for security. To grant access to a staff member:
1. Go to the **Users** tab in the Authentication section.
2. Click **Add user**.
3. Enter the staff member's work email and a secure password.
4. Share these credentials with the supervisor. They can now sign in at `/admin/login`.

## 3. Enable Firestore Database
1. In the left sidebar, click **Build** > **Firestore Database**.
2. Click **Create database**.
3. Select **Start in production mode**.
4. Choose a location (e.g., `europe-west` or `us-central`).
5. Click **Enable**.

## 4. Register the Web Application
1. Click the **Project Overview** (gear icon) -> **Project settings**.
2. Under the **General** tab, scroll to **Your apps**.
3. Click the **Web icon (</>)**.
4. Register the app as `I-World Management Hub`.
5. Copy the `firebaseConfig` values to your local `.env` file (see `ENVIRONMENT_VARIABLES.md`).

## 5. Deployment
Ensure your local security rules are deployed to protect the data:
`npx -y firebase-tools@latest deploy --only firestore:rules`
