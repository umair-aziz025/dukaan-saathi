# Firestore setup

This app stores marketplace data in the default Cloud Firestore database for Firebase project `dukaan-saathi-18899`. The API uses the Firebase Admin SDK; the mobile app authenticates with Firebase Auth and calls the API. The mobile app must not read or write Firestore directly.

## One-time Firebase setup

1. In the Firebase Console, open project `dukaan-saathi-18899` and create the default Cloud Firestore database in **Native mode** if it does not already exist.
2. Choose the database location carefully; Firestore's location is difficult to change later. Pick a region that suits the app's users and backend.
3. In **Authentication → Sign-in method**, enable **Email/Password**. The app uses passwords, email verification links, and password-reset links; it does not use email OTP.
4. In **Authentication → Settings → Authorized domains**, add the Replit preview domain and the published app domain when one is created.
5. In **Project settings → General → Your apps**, register a Web app and copy its Firebase client config. It supplies `apiKey`, `authDomain`, `projectId`, and `appId`.
6. Confirm the service account used by `FIREBASE_SERVICE_ACCOUNT_JSON` has Firestore data access (for example, the least-privilege `Cloud Datastore User` role).
7. Keep the service-account JSON in Replit Secrets only. Do not save or commit the JSON file.
8. Keep `firestore.rules` deployed with client access denied. The server's Admin SDK authenticates with IAM and bypasses Firestore Security Rules.

## Replit secrets

- `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase service-account JSON, stored as a Replit Secret.
- `GEMINI_API_KEY` — Gemini API key, stored as a Replit Secret.
- `SESSION_SECRET` — server-side HMAC key for pickup-code digests.
- `EXPO_PUBLIC_FIREBASE_API_KEY` — Web app API key, stored in Replit Secrets; it is included in the client bundle and is not a substitute for Firebase security rules.

## Replit environment variables

- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` — Web app auth domain.
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID` — `dukaan-saathi-18899`.
- `EXPO_PUBLIC_FIREBASE_APP_ID` — Web app ID.
- `ADMIN_EMAILS` — comma-separated admin email allowlist; currently the admin account email.

## Sign-in and demo accounts

- Accounts use email and password. New users receive a verification link; password recovery uses Firebase's reset email. The app does not implement one-time passcodes.
- The demo seed creates the requested seven Firebase Auth users and role profiles without a shared initial password. Each account owner should use **Forgot password** to choose their own password, then verify their email. No reset emails are sent automatically by the seed script.
- Run `pnpm --filter @workspace/scripts run seed:demo` to create/reconcile the demo accounts, three merchant-owned shops, nine merchant products, a public demo catalog, and three demo pickup orders. The script is idempotent and tags seeded records as demo data. It must not be run against production.
- Demo records populate `dukaan_users`, `dukaan_shops`, `dukaan_products`, `dukaan_orders`, `dukaan_unique_keys`, `dukaan_shop_owners`, `dukaan_order_keys`, and `dukaan_audit_logs`.

Use separate, least-privilege credentials for production. Revoke and replace any service-account key that was uploaded or committed to Git.

## Current data behavior

The app creates its collections on the first write. Order creation and stock decrement, idempotency records, cancellation/restocking, and audit events are written in Firestore transactions. There is no automatic migration of historical PostgreSQL records.
