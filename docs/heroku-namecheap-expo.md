# Dukaan Saathi: Heroku API + Namecheap DNS + Expo preview APK

This repository contains a pnpm workspace. The **Heroku app serves only the Express API** in `artifacts/api-server`; the Expo app in `artifacts/dukaan-saathi` is built separately with EAS.

## 1. Create the Heroku app

1. Open the Heroku Dashboard and create a Node.js app (choose an available paid dyno plan; Heroku has no traditional free dynos).
2. In **Deploy > Deployment method**, connect **GitHub**, grant Heroku access to **umair-aziz025/dukaan-saathi**, and choose this repository. Never give wider permissions than necessary. Deploy the updated main branch after this pull request is merged.
3. Use Heroku's supported Node.js buildpack. The root `package.json` pins Node 24 and pnpm, and the `heroku-build`/`heroku-postbuild` scripts build **only** `@workspace/api-server`. The root `Procfile` starts `artifacts/api-server/dist/index.mjs`.
4. Under **Settings > Config Vars**, add the following values from the existing backend's secure settings. **Do not enter any secret values into Git or Expo `EXPO_PUBLIC_*` variables.**

| Heroku config var | Required | Purpose |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | Complete Firebase Admin service-account JSON as **one** config-var value (not public). |
| `SESSION_SECRET` | Yes | Strong random, stable backend signing/encryption key. **Retain the existing key** if preserving old hashes and encrypted data. |
| `GEMINI_API_KEY` | For Gemini | Server-side AI calls. |
| `GROQ_API_KEY` | For Groq | Server-side AI and transcription. |
| `ADMIN_EMAILS` | If applicable | Comma-separated administrator email allowlist. |
| `NODE_ENV` | Recommended | `production`. |

**Do not set `PORT` yourself.** Heroku supplies it automatically. Do not add `REPLIT_EXPO_SESSION_SECRET` or `REPLIT_DEV_DOMAIN` to Heroku.

5. Deploy and open `https://<your-heroku-app>.herokuapp.com/api/healthz`; a healthy API returns JSON with status `ok`. This endpoint does not authenticate to Firestore: separately verify sign-in, profile retrieval, catalog, and an authenticated API operation. Check Heroku **More > View logs** if startup fails.

## 2. Map an API subdomain from Namecheap

Prefer an API-only subdomain such as `api.YOUR-DOMAIN.TLD` so existing root-domain websites, email/MX records, and other DNS services remain unchanged.

1. Heroku **Settings > Domains > Add domain**: add `api.YOUR-DOMAIN.TLD`.
2. Copy **the exact DNS target issued by Heroku**, typically ending in `.herokudns.com`. Do not invent it or replace it with an app IP address.
3. If Namecheap is the authoritative DNS host, go to **Domain List > Manage > Advanced DNS > Host Records > Add New Record**:
   - Type: `CNAME Record`
   - Host: `api`
   - Value/Target: **the exact Heroku DNS target**
   - TTL: `Automatic`
4. Remove/replace a conflicting `api` host record only if appropriate. If the domain uses Cloudflare or another DNS provider as its nameservers, add the CNAME *there* instead of Namecheap.
5. Confirm Heroku **Automatic Certificate Management (ACM)** is enabled and wait for DNS validation/HTTPS. Test `https://api.YOUR-DOMAIN.TLD/api/healthz`.

## 3. Point the Expo EAS Android preview build to the backend

In Expo project `@umair6172/dukaan-saathi`, add the following **preview** environment variables (also add them to production when ready):

| EAS env var | Value |
| --- | --- |
| `EXPO_PUBLIC_DOMAIN` | `api.YOUR-DOMAIN.TLD` (host only: no `https://`, no `/api`) |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | The Firebase Web API key |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `dukaan-saathi-18899.firebaseapp.com` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `dukaan-saathi-18899` |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | `1:640716425807:web:641c8294912d612eba383a` |

The app currently constructs `https://${EXPO_PUBLIC_DOMAIN}` in `artifacts/dukaan-saathi/app/_layout.tsx`. The API client's request paths already include `/api`.

The EAS preview profile in `artifacts/dukaan-saathi/eas.json` already produces an Android APK. Build only **after** the domain and API work; `EXPO_PUBLIC_*` values are compiled into the app and changes require a rebuild.

### Notes

- The Firebase `authDomain` is not the API domain. Do not point it at Heroku.
- `FIREBASE_SERVICE_ACCOUNT_JSON`, `GEMINI_API_KEY`, `GROQ_API_KEY`, and `SESSION_SECRET` belong on Heroku and must never be placed in mobile bundles.
- This pull request **only prepares source code for deployment**. It does not connect accounts, create the Heroku app, configure DNS, deploy, or build an APK.
