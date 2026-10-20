<div align="center">

<img src="artifacts/dukaan-saathi/assets/images/dukaan-saathi-professional-logo.png" alt="Dukaan Saathi Logo" width="120" />

# 🛍️ Dukaan Saathi

### Your neighborhood. Your groceries. Your AI Saathi.

**An AI-powered hyperlocal shopping experience connecting nearby customers and local shopkeepers through natural language, voice and smarter inventory management.**

<p>
  <img src="https://img.shields.io/badge/Expo-SDK%2057-000020?style=for-the-badge&logo=expo&logoColor=white" alt="Expo SDK 57"/>
  <img src="https://img.shields.io/badge/React%20Native-0.86-61DAFB?style=for-the-badge&logo=react&logoColor=111827" alt="React Native"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase"/>
</p>
<p>
  <img src="https://img.shields.io/badge/Node.js-24-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24"/>
  <img src="https://img.shields.io/badge/Express-5-111111?style=flat-square&logo=express&logoColor=white" alt="Express 5"/>
  <img src="https://img.shields.io/badge/Gemini%20%2B%20Groq-AI-6441C8?style=flat-square" alt="Gemini and Groq"/>
  <img src="https://img.shields.io/badge/Heroku-Backend-430098?style=flat-square&logo=heroku&logoColor=white" alt="Heroku"/>
  <img src="https://img.shields.io/badge/Expo-EAS%20Build-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo EAS Build"/>
</p>

[✨ Features](#-features) · [📸 Screenshots](#-product-screenshots) · [🤖 AI Models](#-ai-models--api-usage) · [🤝 Team](#-team--individual-contributions) · [🏗️ Architecture](#-system-architecture) · [⚡ Quick Start](#-quick-start) · [🚀 Deployment](#-deployment) · [🔐 Security](#-security--privacy)

</div>

---

## 🌍 Overview

**Dukaan Saathi** ("shop companion") is a neighborhood-first marketplace for shoppers, merchants and administrators. Instead of searching through endless lists, customers can describe what they need in **English, Urdu or Roman Urdu** and review products available from nearby, approved shops.

Shopkeepers can register a store, manage inventory, process pickup orders, and use an AI assistant to **prepare** inventory changes. The assistant never saves a suggested change without the merchant's confirmation.

> **The idea:** Make buying from the shop next door as easy as saying what you need.

**Example — customer:** "5kg atta aur 1kg cheeni chahiye"  
**Saathi:** Finds relevant products from the nearby catalog and helps create a pickup basket.  
**Merchant:** Reviews the resulting order and manages pickup.

## ✨ Features

### 🛒 Customer Experience

- **Nearby stores & catalog:** Location-based discovery of approved neighborhood shops and their available products.
- **Conversational grocery search:** Ask your AI Saathi for individual products or complete shopping lists.
- **Voice notes:** Record, transcribe, edit and submit a request. Gemini is attempted first, with Groq available as a fallback.
- **Shopping basket:** Review quantities, product prices, pack sizes and stock before ordering.
- **Order placement:** Confirm **pay-on-pickup** orders; the backend handles order records and stock updates.
- **Order status & history:** Follow orders, pickup status and in-app order notifications.
- **Mobile notifications:** Opt into Expo push alerts when Android FCM credentials and device permissions are configured.
- **Directions:** Open external Google Maps navigation to the selected shop.

### 🏪 Merchant Workspace

- **Register a shop:** Provide a shop name, public address, contact number and location.
- **Approval-first access:** Inventory tools unlock after administrator approval.
- **Manual product management:** Create, edit and deactivate product listings, including category, pack size, stock and price in PKR.
- **AI inventory assistant:** Describe a proposed create, update or remove action naturally in English, Urdu or Roman Urdu.
- **Merchant microphone:** Record a stock instruction, review the transcript and submit it to the inventory assistant.
- **Review before saving:** Inspect AI-prepared changes and explicitly **confirm** or **cancel** before a product mutation occurs.
- **Order management:** Manage order statuses and pickup verification.
- **Notification center:** View relevant order updates and device notification preferences.

### 🛡️ Administrator & Platform Controls

- Approve or reject merchant shop applications.
- Access administrative overview, order and user workflows.
- Review profile-change requests.
- Apply role-based authorization, validation and rate limiting to backend operations.
- Record audit events for marketplace activity.

## 📸 Product Screenshots

Screenshots from the Android MVP, grouped by account role. Select any screenshot to open the full-size image. Visible personal contact information, precise coordinates, and pickup codes have been redacted for public sharing. Sample products and marketplace figures may contain test data.

### 🏡 Guest & Onboarding

First-time visitors can explore the product, ask Help Saathi about the app, and register for the appropriate role.

<table>
<tr><th align="center">Welcome Screen</th><th align="center">Help Saathi — Guest Assistance</th><th align="center">Account Registration</th></tr>
<tr><td width="33%" align="center"><a href="docs/screenshots/guest-welcome.jpg"><img src="docs/screenshots/guest-welcome.jpg" alt="Welcome Screen" width="100%" /></a></td><td width="33%" align="center"><a href="docs/screenshots/guest-help-saathi.jpg"><img src="docs/screenshots/guest-help-saathi.jpg" alt="Help Saathi — Guest Assistance" width="100%" /></a></td><td width="33%" align="center"><a href="docs/screenshots/guest-signup.jpg"><img src="docs/screenshots/guest-signup.jpg" alt="Account Registration" width="100%" /></a></td></tr>
</table>

### 🛒 Customer Experience

Discover available items from local shops, review catalog prices, and manage pickup orders.

<table>
<tr><th align="center">Nearby Shopping &amp; AI Saathi</th><th align="center">Nearby Product Listings</th><th align="center">Orders &amp; Pickup Code</th></tr>
<tr><td width="33%" align="center"><a href="docs/screenshots/customer-home.jpg"><img src="docs/screenshots/customer-home.jpg" alt="Nearby Shopping &amp; AI Saathi" width="100%" /></a></td><td width="33%" align="center"><a href="docs/screenshots/customer-catalog.jpg"><img src="docs/screenshots/customer-catalog.jpg" alt="Nearby Product Listings" width="100%" /></a></td><td width="33%" align="center"><a href="docs/screenshots/customer-pickup-orders.jpg"><img src="docs/screenshots/customer-pickup-orders.jpg" alt="Orders &amp; Pickup Code" width="100%" /></a></td></tr>
</table>

### 🏪 Merchant Experience

Use multilingual inventory instructions, edit shop details, and track order notifications.

<table>
<tr><th align="center">AI Inventory Proposal &amp; Confirmation</th><th align="center">Shop Profile &amp; Location</th><th align="center">Merchant Order Notifications</th></tr>
<tr><td width="33%" align="center"><a href="docs/screenshots/merchant-inventory-ai.jpg"><img src="docs/screenshots/merchant-inventory-ai.jpg" alt="AI Inventory Proposal &amp; Confirmation" width="100%" /></a></td><td width="33%" align="center"><a href="docs/screenshots/merchant-shop-details.jpg"><img src="docs/screenshots/merchant-shop-details.jpg" alt="Shop Profile &amp; Location" width="100%" /></a></td><td width="33%" align="center"><a href="docs/screenshots/merchant-notifications.jpg"><img src="docs/screenshots/merchant-notifications.jpg" alt="Merchant Order Notifications" width="100%" /></a></td></tr>
</table>

### 🛡️ Admin Experience

Review marketplace activity, inspect pending shops, and filter order records.

<table>
<tr><th align="center">Admin Dashboard Overview</th><th align="center">Shop Approvals &amp; Order Filters</th></tr>
<tr><td width="50%" align="center"><a href="docs/screenshots/admin-overview.jpg"><img src="docs/screenshots/admin-overview.jpg" alt="Admin Dashboard Overview" width="100%" /></a></td><td width="50%" align="center"><a href="docs/screenshots/admin-shop-review.jpg"><img src="docs/screenshots/admin-shop-review.jpg" alt="Shop Approvals &amp; Order Filters" width="100%" /></a></td></tr>
</table>

## 👥 User Roles & Permissions

| Role | Main capabilities |
| --- | --- |
| **Customer** | Discover shops, ask the shopping assistant, assemble a basket, place pickup orders, track status and notifications. |
| **Merchant** | Submit a shop for review; after approval, maintain products, use inventory AI, and fulfill orders. |
| **Administrator** | Review shop applications and profile changes, inspect orders and use administrative oversight endpoints. |

## 🤖 AI-Powered Experiences

### 💬 Shopper Assistant

1. A customer types a request or records a short voice note.
2. The transcription endpoint converts audio into **editable text**.
3. The backend provides the AI with relevant nearby catalog items.
4. Gemini/Groq produces a structured response that the backend validates.
5. The customer sees catalog-grounded suggestions, selects products and explicitly confirms the order.

The model is **not** authorized to invent product IDs or place an order automatically.

### 📦 Merchant Inventory Assistant

1. A merchant types or speaks an instruction, for example: **"Add 12 packs of 250g tea at PKR 450 each."**
2. The API verifies the merchant's identity and approved shop.
3. AI analyzes the request against the merchant's existing inventory.
4. The API returns one proposal: **create**, **update**, **delete** or **clarify**.
5. The merchant checks the product name, unit, category, price and stock.
6. Only pressing **Confirm** sends the corresponding authenticated product mutation; **Cancel** leaves inventory unchanged.

**Important:** If a required detail is unclear, the assistant should ask for clarification rather than inventing an amount or product match.

## 🧠 AI Models & API Usage

The backend uses **server-side AI API calls**, with a **Gemini-first, Groq-fallback** strategy when a configured provider fails, times out, or returns an invalid structured response. Model responses are validated against Zod schemas and the current Firestore catalog/inventory. All model and API identifiers below are **defaults in `artifacts/api-server/src/lib/ai-providers.ts`**; deployment environment variables can override them.

| Provider / model | Model identifier | Role in Dukaan Saathi | API / server-side configuration |
| --- | --- | --- | --- |
| **Google Gemini — Gemini 3.8 Flash** | `gemini-3.8-flash` | Primary natural-language interpretation, catalog-grounded customer product suggestions, merchant inventory proposals, and multimodal audio transcription. | Google Gemini `generateContent` REST API; `GEMINI_API_KEY`, optional `GEMINI_CHAT_MODEL` / `GEMINI_TRANSCRIPTION_MODEL` / `GEMINI_MODEL`. |
| **Groq — GPT OSS 20B** | `openai/gpt-oss-20b` | Fallback for structured shopping and merchant inventory responses when Gemini cannot return a usable result. | Groq chat completions API; `GROQ_API_KEY`, optional `GROQ_CHAT_MODEL`. |
| **Groq — Whisper Large V3 Turbo** | `whisper-large-v3-turbo` | Speech-to-text fallback for English, Urdu, and Roman Urdu customer shopping and merchant inventory voice notes. | Groq audio transcriptions API; `GROQ_API_KEY`, optional `GROQ_TRANSCRIPTION_MODEL`. |

### 🔌 API Endpoints & AI Workflow

1. **`POST /api/dukaan/assistant` — Customer AI:** The app sends a request, coordinates, and optional brief chat history; the server provides a bounded nearby catalog. AI returns `reply`, `productIds` and `needsClarification`. The API validates product IDs against the provided catalog and returns the matching real products. **AI never places an order.**
2. **`POST /api/dukaan/merchant-assistant` — Merchant AI:** An approved merchant supplies a natural-language instruction. The model sees existing inventory and proposes one of `create`, `update`, `delete`, or `clarify`, with a validated product preview. **Only explicit merchant confirmation triggers the product mutation.**
3. **`POST /api/dukaan/transcribe` — Voice notes:** The authenticated user's recorded audio is sent to the backend. Gemini is attempted first; Groq Whisper acts as a fallback. The returned transcript is editable before submission to the appropriate assistant.

**Safety and control:** AI API keys remain on the backend; Firebase ID tokens authenticate requests; Zod validation, role checks, approved-shop checks, and rate limiting protect assistant routes. The **Help Saathi** popup is a separate, deterministic on-device guidance assistant—not a generative model or a live user-data agent.

**Provider note:** The codebase also contains an **optional xAI text-provider integration** if `XAI_API_KEY` is configured. It is not assumed to be enabled in the deployed hackathon demo. The three models in the table are the primary documented Gemini/Groq defaults, not a guarantee of the runtime configuration or provider uptime.

## 🏗️ System Architecture

The mobile app is an Expo/React Native client. Firebase handles authentication, while the hosted Express API owns marketplace data access and contacts AI providers without exposing their keys in the mobile bundle.

~~~mermaid
flowchart TD
  PEOPLE["👥 Customers · Merchants · Admins"]
  MOBILE["📱 Expo + React Native App"]
  AUTH["🔐 Firebase Authentication"]
  DNS["🌐 api.aetheryx.me<br/>Custom HTTPS domain"]
  SERVER["⚙️ Express API<br/>Node.js on Heroku"]
  FIRESTORE["🗄️ Firestore<br/>Firebase Admin SDK"]
  AI["🤖 Gemini + Groq<br/>Chat & transcription"]
  EXPO["🔔 Expo Push Service<br/>Android FCM V1"]
  MAPS["🗺️ Google Maps<br/>External directions"]
  BUILD["📦 Expo EAS Cloud Build<br/>Preview APK / Production AAB"]

  PEOPLE --> MOBILE
  MOBILE <--> AUTH
  MOBILE <-->|"HTTPS REST + Firebase ID token"| DNS
  DNS <--> SERVER
  SERVER <-->|"Authenticated data access"| FIRESTORE
  SERVER <-->|"Server-side AI requests"| AI
  SERVER -->|"Order alerts"| EXPO
  EXPO -->|"Device push"| MOBILE
  MOBILE -->|"Open navigation"| MAPS
  BUILD -.->|"Build / distribute client"| MOBILE

  classDef client fill:#e8f3ed,stroke:#286247,color:#153c2b
  classDef server fill:#eae5f8,stroke:#6946a3,color:#322258
  classDef external fill:#fff4db,stroke:#ad8522,color:#563d0e
  class PEOPLE,MOBILE client
  class DNS,SERVER,BUILD server
  class AUTH,FIRESTORE,AI,EXPO,MAPS external
~~~

### 🔄 Customer Order Flow

~~~mermaid
flowchart LR
  A["🔍 Discover"] --> B["🛒 Review basket"]
  B --> C["✅ Confirm pickup order"]
  C --> D["🏪 Merchant accepts"]
  D --> E["📦 Ready for pickup"]
  E --> F["🔑 Pickup verification"]
  F --> G["🎉 Completed"]
  C -.-> H["↩️ Cancellation when permitted"]
~~~

Firestore transactions are used for critical operations such as order creation, stock decrement and cancellation/restocking. Idempotency records help prevent duplicate order effects.

## 🛠️ Technology Stack

| Component | Technologies |
| --- | --- |
| **Frontend** | Expo SDK 57, React Native, React, TypeScript, Expo Router |
| **User experience** | Custom React Native components, Inter fonts, Expo Audio / Location |
| **State & HTTP** | TanStack Query, generated API client |
| **Backend** | Node.js 24, Express 5, TypeScript, Zod |
| **Authentication** | Firebase Authentication and verified ID tokens |
| **Database** | Cloud Firestore using Firebase Admin SDK |
| **AI** | Google Gemini and Groq |
| **API contract** | OpenAPI, Orval-generated React Query client and Zod schemas |
| **Notifications** | Expo Notifications, Expo Push Service, Android FCM V1 |
| **Maps** | Expo Location and external Google Maps directions |
| **Hosting** | Heroku API, Namecheap DNS, HTTPS |
| **Cloud builds** | Expo Application Services (EAS) |
| **Monorepo** | pnpm workspaces, esbuild |

## 📁 Project Structure

~~~text
dukaan-saathi/
├── artifacts/
│   ├── dukaan-saathi/              # Expo / React Native application
│   │   ├── app/                    # Expo Router screens
│   │   ├── components/             # UI, onboarding and help assistant
│   │   ├── services/               # Auth, notification and app services
│   │   ├── assets/images/          # Application branding
│   │   ├── app.json                # App and native configuration
│   │   ├── eas.json                # EAS build profiles
│   │   └── google-services.json   # Firebase Android client configuration
│   ├── api-server/
│   │   ├── src/routes/            # Express API endpoints
│   │   ├── src/lib/               # AI provider and push integrations
│   │   └── build.mjs              # Server bundle build
│   └── mockup-sandbox/            # UI sandbox
├── lib/
│   ├── api-spec/                   # OpenAPI definition / code generation
│   ├── api-client-react/           # Generated typed HTTP client
│   ├── api-zod/                    # Generated schemas
│   └── db/                         # Firestore access / transactions
├── scripts/                        # Workspace maintenance helpers
├── docs/screenshots/                # Redacted project screenshots by user role
├── docs/
│   ├── firestore-setup.md
│   └── heroku-namecheap-expo.md
├── firestore.rules                 # Deny-all client Firestore access
├── Procfile                        # Heroku web process
├── pnpm-workspace.yaml
├── package.json
└── README.md
~~~

## ⚡ Quick Start

### 📋 Prerequisites

- Node.js **24.x** and pnpm **10.34.5**.
- A Firebase project with Email/Password Authentication and Cloud Firestore enabled.
- A Firebase Admin service account **for the backend**.
- Optional Gemini and Groq API keys for the AI assistants.
- An HTTPS API address for standalone mobile builds.

### 1️⃣ Clone and install

~~~bash
git clone https://github.com/umair-aziz025/dukaan-saathi.git
cd dukaan-saathi
corepack enable
pnpm install --frozen-lockfile
~~~

The repository is currently **private**; authorized GitHub access is required.

### 2️⃣ Configure the backend

The backend requires secure environment variables, provided by your runtime or **Heroku Config Vars**:

~~~dotenv
FIREBASE_SERVICE_ACCOUNT_JSON=<complete-private-service-account-json>
SESSION_SECRET=<long-random-stable-secret>
GEMINI_API_KEY=<server-side-gemini-key>
GROQ_API_KEY=<server-side-groq-key>
ADMIN_EMAILS=<comma-separated-admin-email-list>
~~~

For a **local** API process, set a listening port and build/start the server:

~~~bash
pnpm --filter @workspace/api-server run build
PORT=5000 pnpm --filter @workspace/api-server run start
~~~

Heroku supplies the `PORT` environment variable automatically. Visit `http://localhost:5000/api/healthz` to check the HTTP server.

### 3️⃣ Configure the Expo app

Use the Expo EAS environment-variable interface for standalone builds, or equivalent development variables for local testing:

~~~dotenv
EXPO_PUBLIC_DOMAIN=api.aetheryx.me
EXPO_PUBLIC_FIREBASE_API_KEY=<firebase-web-api-key>
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=dukaan-saathi-18899.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=dukaan-saathi-18899
EXPO_PUBLIC_FIREBASE_APP_ID=<firebase-web-app-id>
~~~

**`EXPO_PUBLIC_DOMAIN` contains only the hostname**—no `https://` or `/api`. The app builds the HTTPS base URL itself.

From the repo root, start the Expo CLI:

~~~bash
pnpm --filter @workspace/dukaan-saathi exec expo start
~~~

The package also includes a Replit-specific development command; the Expo CLI invocation above is the generic route.

### 4️⃣ Test the integration

Check Firebase login, authenticated API calls, catalog retrieval, merchant approval, inventory previews, order creation and real-device notifications. A healthy `/api/healthz` confirms only that the HTTP server responds—not that the AI, Firestore or push providers are fully working.

## 🚀 Deployment

### ☁️ Heroku API and Namecheap DNS

The Express API is hosted via the root `Procfile`, and the app's custom backend hostname is:

**[https://api.aetheryx.me](https://api.aetheryx.me)**  
**Health endpoint:** [https://api.aetheryx.me/api/healthz](https://api.aetheryx.me/api/healthz)

The `api` subdomain's DNS record points to the Heroku-provided target. Private Firebase and AI credentials remain in the server's environment, not Git or Expo.

**Full guide:** [Heroku, Namecheap and Expo setup](docs/heroku-namecheap-expo.md)

### 🤖 Android builds with Expo EAS

Expo project: [Dukaan Saathi on Expo](https://expo.dev/accounts/umair6172/projects/dukaan-saathi/builds)

| Profile | Intended use | Android output |
| --- | --- | --- |
| `preview` | Internal install and testing | `.apk` |
| `production` | Google Play submission | `.aab` |

From the `artifacts/dukaan-saathi` directory:

~~~bash
eas build --platform android --profile preview
# Store-oriented build:
eas build --platform android --profile production
~~~

GitHub-triggered builds must target the Expo project subdirectory. The Android package identifier is `com.dukaansaathi.app`.

For Android remote push, Expo needs the Firebase Android client file and private **FCM V1 service-account credentials** configured in Expo. The private key is **not** the same as `google-services.json`.

### 🍎 iOS Simulator build (no Apple Developer membership)

**iOS simulator compilation: successful.** The Expo GitHub integration compiled an unsigned iOS Simulator app using the `ios-simulator` EAS build profile (with `ios.simulator: true`). The iOS bundle identifier is `com.dukaansaathi.app`.

- **[Download the verified successful Expo build artifact (.tar.gz)](https://expo.dev/artifacts/eas/UoK_4Tlb2sLAbGxy3nTMDn37qA2W-M8gom3rsvedQ3g.tar.gz)**
- [Expo iOS simulator build workflow](https://expo.dev/accounts/umair6172/projects/dukaan-saathi/workflows/01a15a53-031a-7f59-9a2f-ab9449234c6a)
- [Source revision for this build](https://github.com/umair-aziz025/dukaan-saathi/commit/3831d7470b86143dbed1804f2505bfd74d352063)

The archive contains a simulator-only `.app` bundle, **not** a signed `.ipa`. It cannot be installed on a physical iPhone or distributed through TestFlight or the App Store. The cloud compilation succeeded; **functional iOS simulator testing is still pending**.

To request another free iOS simulator build from the `artifacts/dukaan-saathi` directory:

~~~bash
eas build --platform ios --profile ios-simulator
~~~

The iOS simulator archive is linked directly above. GitHub Actions-based release automation is intentionally not configured because repository Actions cannot run with the current billing restriction. Physical-device or App Store distribution requires Apple-managed signing and other store requirements. A completed build alone is not an App Store publication.

## 🔐 Security & Privacy

- **Firebase Authentication:** Signed-in users obtain Firebase ID tokens; protected API routes verify them.
- **Authorization:** Backend role and shop-approval checks restrict merchant and administrator operations.
- **Server-controlled Firestore:** Marketplace data access is performed by the backend's Firebase Admin SDK.
- **Deny-all client rules:** The checked-in [Firestore rules](firestore.rules) disallow direct Firestore client reads and writes.
- **Input validation:** Zod-based request validation and Express API rate limiting.
- **AI review:** Neither customer orders nor merchant inventory mutations are automatically committed from AI text.
- **Cryptographic protection:** The server uses `SESSION_SECRET` for CNIC-related hashes and pickup-code protection.
- **Audit trail:** Marketplace actions generate audit events.
- **Separated secrets:** Backend Firebase Admin keys, Gemini/Groq keys and the FCM private key must never be included in public mobile variables or committed to Git.

> ⚠️ `google-services.json` contains Firebase **Android client configuration**; it is not your secret Firebase Admin key. Rotate any backend key accidentally exposed outside a secure secret manager.

## 🗄️ Firestore Collections

| Collection | Purpose |
| --- | --- |
| `dukaan_users` | App user profiles and roles |
| `dukaan_shops` | Merchant stores and approvals |
| `dukaan_products` | Inventory and stock |
| `dukaan_orders` | Orders and their statuses |
| `dukaan_order_notifications` | In-app updates |
| `dukaan_push_tokens` | Registered device push tokens |
| `dukaan_profile_change_requests` | Profile updates awaiting review |
| `dukaan_profile_change_request_locks` | Profile-request coordination |
| `dukaan_unique_keys` | Uniqueness records |
| `dukaan_shop_owners` | Merchant/shop ownership links |
| `dukaan_order_keys` | Order idempotency keys |
| `dukaan_audit_logs` | Audit logs |

See the [Firestore setup guide](docs/firestore-setup.md) for database setup and demo-data notes.

## 💳 Payment Status

The current order API uses **`pay_on_pickup`**. Live card, JazzCash and Easypaisa charging are **not integrated** yet. A future online payment feature will need an approved gateway, server-side confirmation, verified webhooks and order/payment reconciliation.

## 🧪 Development & Testing

| Command | Purpose |
| --- | --- |
| `pnpm run typecheck` | Type-check libraries and application artifacts |
| `pnpm --filter @workspace/api-server run build` | Bundle the Express backend |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API client and schemas |

**Testing:** Verify AI assistant responses, merchant inventory updates, Firebase sign-in and voice workflows in a dedicated non-production environment before release. Retired demo seeding and authentication/AI test scripts are not included in this repository.

## 📊 Project Status

| Feature | Status |
| --- | --- |
| Firebase Auth + Firestore-backed marketplace | Implemented in code |
| Customer AI suggestions and voice transcription | Implemented |
| Merchant inventory assistant + voice + confirm/cancel | Implemented; device and backend end-to-end testing advised |
| Shop approvals, orders and profiles | Implemented |
| Android preview build configuration | Configured |
| Expo/FCM push integration | Configured; verify notification delivery on device |
| Online payment gateway | Not yet integrated |
| iOS signing and store submission | Not yet configured |

These are **implementation statuses**, not claims that every third-party integration has passed production testing.

## 📚 Documentation

- 📘 [Firebase and Firestore setup](docs/firestore-setup.md)
- ☁️ [Heroku + Namecheap + Expo deployment](docs/heroku-namecheap-expo.md)
- 🧾 [API specification](lib/api-spec/openapi.yaml)
- 🛡️ [Firestore rules](firestore.rules)
- 📦 [Expo Builds](https://expo.dev/accounts/umair6172/projects/dukaan-saathi/builds)
- 📸 [Product screenshots](#-product-screenshots)
- 🧠 [AI model identifiers and API usage](#-ai-models--api-usage)
- 🤝 [Team roles and individual contributions](#-team--individual-contributions)

## 🤝 Team & Individual Contributions

### 👥 Team Members and Roles

| Team member | Role | Primary responsibilities |
| --- | --- | --- |
| **Umair Aziz** | **Team Lead & Full-Stack Developer** | Project planning, technical architecture, AI services, mobile and backend integration, deployment coordination, and GitHub repository management. |
| **Soban Waheed** | **Frontend, AI & Firebase Developer** | Project planning, frontend and user experience, AI services, Firebase integration, customer-facing interfaces, backend integration, and mobile usability testing. |
| **Muhammad Ahsan Ali** | **Merchant Workflows, UI/UX & Quality Assurance** | Merchant inventory and order workflows, responsive design, shopping experience, feature testing, validation, and documentation. |

### 🧩 Individual Team Contributions

**Umair Aziz — Team Lead & Full-Stack Development**

Led project planning and designed the overall technical architecture of Dukaan Saathi. Worked on AI service integration, mobile and backend connectivity, cloud deployment, and coordination of the development process. Managed the GitHub repository, version control, and technical integration between application components.

**Soban Waheed — Frontend, AI & Firebase Development**

Contributed to project planning, frontend development, and user experience design. Worked on AI service integration, Firebase functionality, customer-facing interfaces, and communication between the application and backend. Helped improve mobile usability through interface refinements and testing.

**Muhammad Ahsan Ali — Merchant Workflows, Responsive Design & Quality Assurance**

Contributed to the merchant inventory and order-management workflows. Worked on responsive interface design and the customer shopping experience. Assisted with feature testing, validation of application workflows, identifying usability issues, and preparing project documentation.

## 🤝 Contributing

Authorized collaborators can open a feature branch, keep keys and secrets out of Git, test against non-production services, and submit a pull request for review. Backend changes should be deployed before building a mobile version that depends on them.

## 📬 Maintainer

Developed by **Umair Aziz, Soban Waheed, and Muhammad Ahsan Ali** for the **NYLP AI Hackathon 2026**. Project lead and repository maintainer: **[Umair Aziz](https://github.com/umair-aziz025)**. For the role breakdown, see [Team & Individual Contributions](#-team--individual-contributions). Use the repository's [Issues](https://github.com/umair-aziz025/dukaan-saathi/issues) page for technical feedback when enabled.

---

<div align="center">

**❤️ Made for neighborhood shops, everyday shoppers and more accessible local commerce.**

*Dukaan Saathi — Shop local. Speak naturally. Stay connected.*

</div>
