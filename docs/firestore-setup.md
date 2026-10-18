# Firestore setup

This app stores marketplace data in the default Cloud Firestore database for Firebase project `dukaan-saathi-18899`. The API uses the Firebase Admin SDK; the mobile app authenticates with Firebase Auth and calls the API. The mobile app must not read or write Firestore directly.

## One-time Firebase setup

1. In the Firebase Console, open project `dukaan-saathi-18899` and create the default Cloud Firestore database in **Native mode** if it does not already exist.
2. Choose the database location carefully; Firestore's location is difficult to change later. Pick a region that suits the app's users and backend.
3. In **Authentication → Sign-in method**, enable **Email/Password**. The app uses passwords, email verification links, and password-reset links; it does not use email OTP.
4. In **Authentication → Settings → Authorized domains**, add the relevant web app's authorized domains as needed; native Android app configuration is separate.
5. In **Project settings → General → Your apps**, register a Web app and copy its Firebase client config. It supplies `apiKey`, `authDomain`, `projectId`, and `appId`.
6. Confirm the service account used by `FIREBASE_SERVICE_ACCOUNT_JSON` has Firestore data access (for example, the least-privilege `Cloud Datastore User` role).
7. Keep the service-account JSON in Heroku Config Vars or another secure backend secret store only. Do not save or commit the JSON file.
8. Keep `firestore.rules` deployed with client access denied. The server's Admin SDK authenticates with IAM and bypasses Firestore Security Rules.

## Backend credentials (Heroku)

Keep these values in **Heroku Config Vars** for the deployed API, or in a secure local environment when developing. Never commit the service-account file or private keys.

- `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase Admin SDK service-account JSON.
- `GEMINI_API_KEY` — server-side Gemini provider key.
- `GROQ_API_KEY` — server-side Groq provider key.
- `SESSION_SECRET` — stable, private key used to protect pickup-code and identity data.
- `ADMIN_EMAILS` — optional comma-separated admin email allowlist.

## Expo application configuration

Supply these in the Expo EAS **preview** or **production** environment:

- `EXPO_PUBLIC_DOMAIN` — API hostname (for example, `api.aetheryx.me`), without a protocol.
- `EXPO_PUBLIC_FIREBASE_API_KEY` — Firebase client/Web API key.
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` — `dukaan-saathi-18899.firebaseapp.com`.
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID` — `dukaan-saathi-18899`.
- `EXPO_PUBLIC_FIREBASE_APP_ID` — Firebase Web app ID.

Client Firebase configuration does not replace Firestore security rules or server-side authentication. See [Heroku, Namecheap and Expo deployment](heroku-namecheap-expo.md).

## Development and test accounts

- Accounts use Firebase Authentication email/password. New users receive a verification link; password recovery uses Firebase's reset email, not email OTP.
- Older manual Firebase demo seeding and auth-flow test scripts have been removed. This does **not** delete Firebase Auth accounts or Firestore data created by earlier runs.
- Do not test destructive account, order, or stock operations against production data. Use a separate Firebase test project when possible.
- Marketplace collections include `dukaan_users`, `dukaan_shops`, `dukaan_products`, `dukaan_orders`, `dukaan_unique_keys`, `dukaan_shop_owners`, `dukaan_order_keys` and `dukaan_audit_logs`.

## Current data behavior

The app creates its collections on the first write. Order creation and stock decrement, idempotency records, cancellation/restocking, and audit events are written in Firestore transactions. There is no automatic migration of historical PostgreSQL records.
