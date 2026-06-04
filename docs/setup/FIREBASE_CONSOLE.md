
# Firebase Console Setup Guide

Follow these steps to provision the backend services for the I-World Networks Management Hub.

## 1. Create a New Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and enter `i-world-networks`.
3. Click **Create project**.

## 2. Enable Authentication (SUPERVISOR ACCESS)
1. In the left sidebar, click **Build** > **Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, select **Email/Password**.
4. Enable the **Email/Password** switch and click **Save**.

### 🔒 Secure Supervisor Provisioning
Administrative access is restricted to **verified @iworldnetworks.net email addresses**. To grant access:
1. Go to the **Users** tab in the Authentication section.
2. Click **Add user**.
3. **CRITICAL**: Use a corporate email (e.g., `gyang@iworldnetworks.net`) and a strong password.
4. **How to Verify the Email**:
   - **Option A (App UI)**: Attempt to log in to the Management Hub. When the "Verification Required" message appears, click the **"Send Verification Link"** button. An email will be sent to the corporate inbox.
   - **Option B (Manual Bypass)**: If you need to verify an account immediately for testing, you can use the Firebase Admin SDK or manually trigger a password reset from the console which also verifies the email upon completion.
   - **Note**: The user must click the link in the email sent by Firebase to officially unlock the Hub.

## 3. Enable Firestore Database
1. In the left sidebar, click **Build** > **Firestore Database**.
2. Click **Create database**.
3. Select **Start in production mode**.
4. Choose a regional location (e.g., `europe-west`).
5. Click **Enable**.

## 4. Enable AI Services (Gemini)
1. Ensure you have the Gemini API enabled.
2. The app uses `gemini-flash-latest` for high-performance sentiment analysis.

## 5. Deployment of Security Rules
The application includes `firestore.rules` which enforce the corporate domain restriction (`@iworldnetworks.net`). Ensure these are deployed:
`npx -y firebase-tools@latest deploy --only firestore:rules`
