---
name: Firebase authentication policy
description: The requested authentication provider and app-level data path for Dukaan Saathi.
---

Use Firebase Authentication for Dukaan Saathi accounts and Firebase Admin SDK through the API for Firestore access. Do not reintroduce Clerk.

**Why:** the user explicitly asked to remove Clerk and use Firebase Authentication with Firestore.

**How to apply:** keep client Firebase Auth on the mobile app, verify Firebase ID tokens in the API, and keep Firestore reads and writes on the server-side repository path.

After a new user returns from Firebase’s email-verification link, the verified token and profile API may not become ready at the same time. Retry transient profile-read failures briefly; keep 404 distinct so first-time profile setup still works.

**Why:** the user observed a temporary offline/account error that disappeared once verification finished propagating.

**How to apply:** use bounded retries for transient auth/network/server responses and retain a manual retry for persistent failures; do not hide actual profile or authorization errors.

For the Expo web preview, leave API requests relative so `/api/...` stays on the same Replit preview origin. Native Expo still needs the configured dev-domain base URL.

**Why:** cross-origin bearer-token requests from the Expo preview were preflighting without completing the profile fetch, while the same-origin `/api` route returned profile, order, and catalog responses successfully.

**How to apply:** set no absolute API base URL on web; use the Replit dev domain only for native requests.
