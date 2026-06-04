# Firebase Console Setup Guide

Follow these steps to provision the backend services for the I-World Networks Management Hub.

## 1. Create a New Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and enter `i-world-networks` (or your preferred name).
3. (Optional) Enable Google Analytics for the project.
4. Click **Create project** and wait for provisioning.

## 2. Enable Authentication
1. In the left sidebar, click **Build** > **Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, select **Email/Password**.
4. Enable the **Email/Password** switch and click **Save**.
5. *Note: You will use the application's "Sign Up" portal to register your first supervisor account.*

## 3. Enable Firestore Database
1. In the left sidebar, click **Build** > **Firestore Database**.
2. Click **Create database**.
3. Select **Start in production mode** (The security rules provided in `firestore.rules` will handle access control).
4. Choose a location close to your users (e.g., `europe-west` or `us-central`).
5. Click **Enable**.

## 4. Enable Cloud Storage
1. In the left sidebar, click **Build** > **Storage**.
2. Click **Get Started**.
3. Select **Start in production mode**.
4. Click **Next** and then **Done**.

## 5. Register the Web Application
1. Click the **Project Overview** (gear icon) in the top left and select **Project settings**.
2. Under the **General** tab, scroll down to **Your apps**.
3. Click the **Web icon (</>)**.
4. Register the app as `I-World Management Hub`.
5. Firebase will provide a `firebaseConfig` object. You will need these values for your `.env` file (see `ENVIRONMENT_VARIABLES.md`).

## 6. Add Authorized Domains
1. Go back to **Authentication** > **Settings** > **Authorized domains**.
2. Ensure `localhost` is listed for local development.
3. Add your production domain once the app is deployed.
