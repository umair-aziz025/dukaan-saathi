# Dukaan Saathi Mobile

A neighborhood shopping app where customers discover local shops, merchants manage inventory and pickup orders, and admins oversee the marketplace.

## Run & operate

- Mobile preview: `pnpm --filter @workspace/dukaan-saathi run dev` (managed Expo workflow).
- API: `pnpm --filter @workspace/api-server run dev` (managed API workflow, port 8080).
- Validate: `pnpm run typecheck:libs`, then the `typecheck` script in the mobile, API, and scripts packages.
- Seed development/demo accounts and Firestore data manually: `pnpm --filter @workspace/scripts run seed:demo`.
- Verify Firebase sign-in, email verification, and reset action codes: `pnpm --filter @workspace/scripts run test:auth-flows`; add `-- --send-email-canary` only when you want it to send one verification and one reset email.
- Do not run the demo seed against production data.

## Stack

- pnpm workspace, Expo / React Native, TypeScript, Express.
- Firebase Authentication for accounts and ID tokens.
- Cloud Firestore through Firebase Admin SDK in the API and shared database package.
- Gemini 3.8 Flash is primary, with Gemini 3.7 Flash as a fallback for the app's AI routes.

## Architecture rules

- Use Firebase Authentication; do not reintroduce Clerk.
- The mobile app calls the API and must not read or write Firestore directly.
- API routes verify Firebase ID tokens; role and shop ownership come from Firestore profiles and ownership records.
- Keep order creation, stock updates, idempotency, cancellation/restocking, and audit writes transactional.
- `firestore.rules` denies client access. The server's Firebase Admin SDK is the only application data path.
- `scripts/src/seed-demo.ts` seeds idempotent demo data and assigns a unique random password only to accounts that lack password sign-in. New credentials are written to the private, ignored `generated-artifacts/demo-account-passwords.json` file; never commit or deploy that file.

## Firebase configuration

- Replit Secrets: `FIREBASE_SERVICE_ACCOUNT_JSON`, `SESSION_SECRET`, and `EXPO_PUBLIC_FIREBASE_API_KEY`.
- Shared environment: `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`, and `ADMIN_EMAILS`.
- `GEMINI_API_KEY` is required only for Gemini-powered routes.
- See `docs/firestore-setup.md` for Firebase Console setup, email/password login, reset, and verification steps.

## Source map

- `artifacts/dukaan-saathi/` — Expo app and Firebase client authentication.
- `artifacts/api-server/` — Express API and route handlers.
- `lib/db/` — Firebase Admin initialization, Firestore repository and transactions.
- `lib/api-spec/` and `lib/api-client-react/` — OpenAPI contracts and generated client hooks.
- `scripts/src/seed-demo.ts` — explicit, repeatable demo account/data setup.
- `docs/credits-out-handoff.txt` — notes copied from work in progress when the prior session ran out of credits.
