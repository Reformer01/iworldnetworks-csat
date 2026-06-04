# Environment Variables Setup

To link your local code to the Firebase project, create a file named `.env` in the root directory of this project.

## Required Variables
Copy these keys and fill in the values from your **Firebase Project Settings**:

```text
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## Where to find these values:
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Select your project.
3. Click the **Gear icon** > **Project settings**.
4. Scroll down to **Your apps** > **Web apps**.
5. Look for the `firebaseConfig` object.

## Security Note:
- These variables are prefixed with `NEXT_PUBLIC_` so they are accessible on the client side.
- Firebase handles security through **Security Rules** and **App Check**, so these keys are safe to be public as long as your backend rules are configured correctly.
