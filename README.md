# HIVE CITY — Unified Ecosystem Documentation

> **Move · Connect · Live** — Complete architecture, directory reference, local development guide, and deployment checklist for the **HIVE CITY** User Website (`hivecity_structured/`) and Admin Control Centre (`hivecity_admin/`).

---

## 1. HIVECITY Ecosystem Overview

The HIVECITY platform connects four layers end-to-end:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    PART 1: USER WEBSITE (Static SPA)                    │
│                  D:\project_1\hivecity_structured\                      │
│   index.html · css/styles.css · js/01..03*.js · shop-links.js · assets/ │
└───────────────┬─────────────────────────────────────┬───────────────────┘
                │ Firebase Web SDK                    │ REST API (JSON)
                │ (Auth + Realtime Firestore)         │ http://localhost:3000/api/*
                ▼                                     ▼
┌───────────────────────────────┐     ┌───────────────────────────────────┐
│     FIREBASE CLOUD BACKEND    │     │  PART 2: ADMIN CONTROL CENTRE &   │
│  • Firebase Authentication    │◄───►│     NODE / EXPRESS / tRPC API     │
│    (Email/Pass + Verification │     │     D:\project_1\hivecity_admin\  │
│     + Google Sign-In)         │     │  • React 19 + Vite Admin SPA      │
│  • Cloud Firestore            │     │  • Express REST + tRPC Endpoints  │
│    (Users, Events, Sessions,  │     │  • Firebase Admin SDK + Local     │
│     Nutrients, Shop, Support) │     │    JSON Fallback Stores           │
└───────────────────────────────┘     └─────────────────┬─────────────────┘
                                                        │ Authenticated POST
                                                        │ (Shared Secret Header/Body)
                                                        ▼
                                      ┌───────────────────────────────────┐
                                      │   GOOGLE SHEETS TRACKING ENGINE   │
                                      │      Code.gs (Apps Script)        │
                                      │  Multi-Tab Operational Sync:      │
                                      │  Users · Sponsors · Bookings ·    │
                                      │  Community Sessions ·             │
                                      │  Notifications · Support Centre   │
                                      └───────────────────────────────────┘
```

### How the Parts Connect
1. **User Authentication & Profile Sync:** Athletes register or sign in on the User Website (`hivecity_structured/`) using Firebase Authentication (email verification enforced). On sign-in, profiles persist to Firestore (`users/{uid}`) and asynchronously sync via `POST /api/users/sync` to the Express backend (`hivecity_admin/`) and Google Sheets (`Users` tab).
2. **Admin Publishing → User Website:** Admins manage Events, Community Sessions, Curated Nutrition Recipes, Marketplace Products, Sponsors, and Notification Campaigns in `hivecity_admin/`. Changes are stored in Firestore (with automatic local JSON fallback stores on quota limits) and immediately reflected on the User Website.
3. **User Actions → Admin & Google Sheets:** Event bookings, community session registrations, custom user recipes, reposts, and Help/Support tickets submitted on the User Website flow through the `hivecity_admin/` backend into Firestore and sync to the corresponding Google Sheets tabs via `Code.gs`.

---

## 2. Root Workspace Directory Tree (`D:\project_1\`)

```text
D:\project_1\
├── README.md                                                    # Single unified ecosystem documentation (this file)
├── Code.gs                                                      # Google Apps Script multi-tab sheet sync (synced copy)
├── firestore.rules                                              # Cloud Firestore security rules
├── shop-links.js                                                # Root affiliate catalog backup
├── favicon.ico / favicon.png                                    # Root favicons
├── Hivecity_Events_Calendar_Sidebar_Updated_With_Images_FIXED.html  # Monolithic master backup HTML
├── backup/                                                      # Backup snapshot directory
├── assets/                                                      # Root shared assets mirror (images, recipes, affiliate products)
│
├── hivecity_structured/                                         # PART 1: Modular User Website (Static Frontend)
│   ├── index.html                                               # Entry HTML loading styles, shop-links.js, Firebase & JS modules
│   ├── shop-links.js                                            # Affiliate product catalog & Buy Now URLs
│   ├── favicon.ico / favicon.png                                # Browser favicons
│   ├── css/
│   │   └── styles.css                                           # Full responsive & theme stylesheet (~9,178 lines)
│   ├── js/
│   │   ├── 01-config-and-data.js                                # Firebase init, auth/login/reset flow, routing, data & nutrition core
│   │   ├── 02-core-features.js                                  # Discover scroll FX, events, sessions, social feed, shop, campaigns, help
│   │   └── 03-init-and-events.js                                # Bootstrapping, event listeners & final initializers
│   └── assets/
│       ├── affiliate-products/                                  # Product images referenced by shop-links.js
│       ├── images/                                              # Logos, round favicon, recipe placeholder & extracted webp media
│       └── recipes/                                             # 150 curated local recipe photos (Endurance, Maintenance, Muscle_Building, Weight_Gain, Weight_Loss)
│
└── hivecity_admin/                                              # PART 2: Admin Control Centre & Express/tRPC Backend
    ├── package.json                                             # pnpm scripts & dependency manifest
    ├── tsconfig.json                                            # TypeScript compiler configuration
    ├── vite.config.ts                                           # Vite dev/build config for Admin React SPA
    ├── firebase.json                                            # Firebase CLI rules pointer
    ├── Code.gs                                                  # Google Apps Script multi-tab sync script
    ├── .env / .env.local                                        # Local private secrets (gitignored, never commit)
    ├── drizzle/                                                 # Database migration metadata & snapshots
    ├── shared/
    │   ├── const.ts                                             # Shared app constants & auth error messages
    │   ├── types.ts                                             # Shared TypeScript interfaces
    │   └── _core/errors.ts                                      # Shared error helpers
    ├── client/
    │   ├── index.html                                           # Admin SPA HTML shell
    │   ├── public/                                              # Admin logos, favicons & static assets
    │   └── src/
    │       ├── App.tsx                                          # Main Admin dashboard shell, routing & views
    │       ├── main.tsx / index.css                             # React entrypoint & Tailwind v4 styling
    │       ├── pages/                                           # AdminLogin.tsx, Home.tsx, NotFound.tsx
    │       ├── contexts/                                        # AdminAuthContext.tsx, ThemeContext.tsx
    │       ├── components/                                      # Feature modules + ui/ (Radix UI primitives)
    │       │   ├── EventsHostingStudio.tsx                      # Publish events & nutrition recipes
    │       │   ├── CommunitySessionsAdmin.tsx                   # Manage sessions & participant rosters
    │       │   ├── CampaignStudioAdmin.tsx                      # Create & broadcast notification campaigns
    │       │   ├── NotificationsDeliveryAdmin.tsx               # Campaign delivery logs & resends
    │       │   ├── SupportCentreAdmin.tsx                       # User help ticket triage & status updates
    │       │   ├── AdminUsersRolesView.tsx                      # Admin user management & moderation
    │       │   ├── SettingsAdminView.tsx                        # Platform & Google Apps Script settings
    │       │   └── DashboardLayout.tsx / ErrorBoundary.tsx / Map.tsx
    │       ├── lib/                                             # firebase.ts, trpc.ts, eventsStore.ts, contentStore.ts, imageUpload.ts
    │       ├── data/                                            # nutrientRecipes.ts (curated seed catalog)
    │       └── utils/                                           # bmiNutrientEngine.ts, eventLifecycle.ts (+ Vitest unit tests)
    └── server/
        ├── _core/
        │   ├── index.ts                                         # Express entrypoint, JSON parser, route registration, Vite/static server
        │   ├── trpc.ts / context.ts / cookies.ts                # tRPC procedures (public, protected, admin) & cookie options
        │   ├── env.ts / publicConfig.ts / vite.ts               # Env loader, safe public config, Vite middleware
        │   └── oauth.ts / sdk.ts / systemRouter.ts              # OAuth & system router helpers
        ├── adminAuth.ts                                         # Admin Firebase JWT cookie sessions, user sync, block/restrict, sheet sync
        ├── firebaseAdmin.ts                                     # Firebase Admin SDK initializer + Firestore quota backoff
        ├── eventsRoutes.ts                                      # Events CRUD & event bookings API
        ├── contentRoutes.ts                                     # Nutrients, user recipes, reposts & marketplace API
        ├── communitySessionsRoutes.ts                           # Community sessions, free/paid registrations & payment verification
        ├── sponsorsRoutes.ts                                    # Sponsors CRUD + Google Sheets sync
        ├── campaignsRoutes.ts                                   # Campaign Studio & user notifications API
        ├── supportRoutes.ts                                     # User help form submissions & Admin support ticket management
        ├── financeRoutes.ts                                     # Finance ledger aggregation
        ├── adminHiddenStore.ts / routers.ts / db.ts / storage.ts
        ├── private/                                             # Local Firebase service account JSON (gitignored)
        └── *.test.ts                                            # Vitest test suites (platform, finance, communitySessions, trackingSecurity, auth)
```

---

## 3. Part 1 — User Website (`hivecity_structured/`)

A zero-build, modular static single-page application (SPA) extracted losslessly from the master HTML file so every CSS rule and script runs in deterministic top-to-bottom order with fast initial paint.

### Core Features
- **Authentication & Verification Gate:** Email/password registration (with mandatory email verification), Google Sign-In, Forgot Password flow with `#auth` lock until reset/re-login, instant sign-in with background profile/sheet sync, and live admin-block enforcement.
- **Discover & Activity:** Animated hero orbit, straight-aligned `01–04` activity highlights, daily distance & workout tracker, GPS run timer, and quick links into Activity, Nutrition, Events, and Community.
- **Events Calendar & Bookings:** Interactive event discovery, event detail modal, ticket booking, cancellation, and Overview/Bookings management synced with Admin.
- **Community Sessions & Social Feed:** Stories, athlete posts, likes/comments, following/private-account follow requests, crew chat, and free/paid community session registration.
- **Nutrition & BMI Calculator:** 150 locally-hosted curated recipes across 5 fitness goals (`Endurance`, `Maintenance`, `Muscle Building`, `Weight Gain`, `Weight Loss`), interactive BMI & daily calorie calculator, and a **Create Recipe** studio (`#nutrition?create=1`) accessible directly via **Build your plate**.
- **Affiliate Shop (`Hive Market`):** Search, price sorting, wishlist toggling (synced to Overview), and direct partner **Buy Now** redirect powered by `shop-links.js` plus Admin-published items.
- **Profile & Reposts:** Athlete profile header, avatar upload, clean pill tabs (`POSTS`, `RUNS`, `NUTRITION`, `REPOSTS`), and repost management.
- **Notifications & Help:** Live official announcements from Admin Campaign Studio and a Help/Support ticket form connected to Admin Support Centre.

### File Breakdown
| File / Folder | Purpose |
|---|---|
| `index.html` | Clean HTML shell loading Google Fonts, `shop-links.js`, `css/styles.css`, GSAP/ScrollTrigger, Firebase Compat SDKs, and the three ordered JS bundles. |
| `shop-links.js` | Defines `window.HIVECITY_SHOP_CATALOG` with each product's `id`, `title`, `brand`, `category`, INR `price`, local `image` path, and `affiliateUrl`. |
| `css/styles.css` | All light/dark theme tokens, responsive layouts, animations, social/nutrition/shop/profile styles. |
| `js/01-config-and-data.js` | Firebase initialization, auth handlers, route guard (`go()`), `V.auth`, nutrition & recipe helpers, and core app state. |
| `js/02-core-features.js` | Discover GSAP choreography, Events Calendar, Community Sessions, Social/Profile views, Shop logic, Notifications, and Help form. |
| `js/03-init-and-events.js` | Global event listeners, live Firestore subscriptions, and final startup initialization. |
| `assets/` | Local images (`assets/images/`), 9 affiliate product photos (`assets/affiliate-products/`), and 150 curated recipe photos (`assets/recipes/`). |

### Running Locally (Port `5501`)
Start a lightweight static server from `D:\project_1\hivecity_structured\`:

```powershell
# Option A: Using Node (no extra installs needed)
npx --yes serve D:\project_1\hivecity_structured -l 5501

# Option B: Using Python 3
python -m http.server 5501 --directory D:\project_1\hivecity_structured
```

Open **http://localhost:5501** in your browser. (Ensure `hivecity_admin` is running on port `3000` for live API sync.)

### Adding or Updating Products in `shop-links.js`
1. Drop your product image (`.jpeg`, `.jpg`, `.png`, or `.webp`) into `D:\project_1\hivecity_structured\assets\affiliate-products\`.
2. Open `D:\project_1\hivecity_structured\shop-links.js` and add or edit an entry inside `window.HIVECITY_SHOP_CATALOG`:

```js
{
  id: "shop-item-10",
  category: "Shoes", // Shoes | Apparel | Accessories | Fitness Gear
  brand: "Brand Name",
  title: "Exact Product Display Name",
  name: "Exact Product Display Name",
  price: 1499, // Price in INR
  image: "./assets/affiliate-products/Your Product Image.jpeg",
  img: "./assets/affiliate-products/Your Product Image.jpeg",
  affiliateUrl: "https://example.com/your-affiliate-product-link"
}
```

- Items with a valid `http://` or `https://` `affiliateUrl` automatically appear on the **Shop** page with an active **Buy Now** button.
- Items with `affiliateUrl: ""` stay hidden until a valid link is pasted.

---

## 4. Part 2 — Admin Control Centre & Backend (`hivecity_admin/`)

A full-stack **React 19 + Vite + Tailwind CSS v4 + Express + tRPC + Firebase Admin SDK** dashboard and API server.

### Core Modules
- **Admin Dashboard:** Live KPI overview (users, events, bookings, sessions, recipes, marketplace, support) with responsive mobile/tablet layout.
- **Events Hosting Studio:** Create, edit, complete, and delete events and publish curated Nutrition recipes directly to the User Website.
- **Ticketing & Bookings:** View and manage athlete event registrations synced to Google Sheets (`Ticketing & bookings`).
- **Community Sessions:** Create free or paid sessions, track capacities, inspect participant lists, and verify payment registrations.
- **Nutrition Studio & User Recipes:** Moderate and showcase both Admin-curated and athlete-submitted recipes.
- **Marketplace:** Publish and permanently delete marketplace products across Firestore, backend stores, and User Shop caches.
- **Sponsors:** Manage sponsor packages, links, and sponsorship totals synced to Google Sheets (`sponsors details`).
- **Campaign Studio & Notifications:** Author, broadcast, and resend Run / Food & Beverages announcements pushed to User Notifications.
- **Support Centre:** Triage and update status on user-submitted Help tickets synced to Google Sheets (`Support Centre`).
- **Users & Settings:** View verified/pending athletes, block/restrict accounts in real time, trigger Firestore/Sheets syncs, and configure platform settings.

### File Breakdown
| Path | Responsibility |
|---|---|
| `client/` | React 19 + TypeScript SPA (`App.tsx`, `pages/AdminLogin.tsx`, feature components in `src/components/`, Radix UI primitives in `src/components/ui/`, stores in `src/lib/`). |
| `server/` | Express + tRPC backend (`_core/index.ts`, `adminAuth.ts`, `firebaseAdmin.ts`, and domain route modules for events, content, community sessions, sponsors, campaigns, support, and finance). |
| `shared/` | Shared TypeScript types (`types.ts`), error helpers (`_core/errors.ts`), and constants (`const.ts`). |
| `../firestore.rules` (referenced by `firebase.json`) | Cloud Firestore security rules for Admin, Users, Events, Nutrition, Social Posts, Sessions, Payments, Campaigns, and Support Tickets. |
| `Code.gs` | Google Apps Script Web App handling authenticated server-to-server multi-tab Google Sheets upserts and reads. |
| `package.json` | Defines all `pnpm` scripts, runtime dependencies (`express`, `firebase`, `firebase-admin`, `@trpc/server`, `drizzle-orm`, `react`, `zod`), and dev/test tools (`vite`, `typescript`, `vitest`). |

### Environment Variables Reference (`.env` / `.env.local`)
Place private runtime variables in `D:\project_1\hivecity_admin\.env` and local overrides in `.env.local` (**never commit real values**):

| Variable | File | Description / Placeholder Example |
|---|---|---|
| `NODE_ENV` | `.env` | `development` locally, `production` when shipping |
| `PORT` | `.env` | Server port (default `3000`) |
| `ADMIN_JWT_SECRET` | `.env` | 32+ character random HMAC secret for signing `hive_admin_session` cookies (`<GENERATE_64_CHAR_HEX_SECRET>`) |
| `ADMIN_EMAIL` | `.env.local` | Authorized administrator email(s) (`admin@example.com`) |
| `APPS_SCRIPT_WEB_APP_URL` | `.env.local` | Deployed Google Apps Script `/exec` URL (`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`) |
| `APPS_SCRIPT_SHARED_SECRET` | `.env.local` | Shared secret matching Apps Script Properties (`<GENERATE_64_CHAR_HEX_SECRET>`) |
| `APPS_SCRIPT_SECRET` | `.env` | Optional fallback alias for `APPS_SCRIPT_SHARED_SECRET` (`<GENERATE_64_CHAR_HEX_SECRET>`) |
| `GOOGLE_SHEET_ID` | `.env.local` | Target Google Spreadsheet ID (`<YOUR_GOOGLE_SPREADSHEET_ID>`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | `.env.local` | Optional path to Firebase Admin service account JSON (default lookup: `server/private/firebase-service-account.json`) |
| `ALLOWED_ORIGINS` | `.env` | Comma-separated allowed CORS origins for production (`https://app.example.com,https://admin.example.com`) |

### Exact `pnpm` Commands
Run all commands inside `D:\project_1\hivecity_admin\`:

```powershell
cd D:\project_1\hivecity_admin

# Install dependencies
pnpm install

# Start development server (Express API + Vite HMR on port 3000)
pnpm dev

# TypeScript type-check (tsc --noEmit)
pnpm check

# Run Vitest test suite
pnpm test

# Production build (Vite client bundle -> dist/public + esbuild server -> dist/index.js)
pnpm build

# Start production server (NODE_ENV=production node dist/index.js)
pnpm start
```

---

## 5. End-to-End Integration & Deployment Checklist

### Google Apps Script (`Code.gs`) 6-Tab Sheet Sync Setup
`Code.gs` (synced at both `D:\project_1\Code.gs` and `D:\project_1\hivecity_admin\Code.gs`) synchronizes platform activity into a single Google Spreadsheet with primary-key deduplication across these tabs:

1. **`Users`** — Athlete accounts (`Firebase_UID`, `Email`, `Display_Name`, `Registration_Date`, `Last_SignIn`, `Status`, `Provider`, `Mobile`, `Updated At`).
2. **`sponsors details`** — Sponsor directory & package amounts.
3. **`Ticketing & bookings`** — Event ticket bookings and booking status.
4. **`Community Sessions`** — Session schedules and participant registrations.
5. **`Notifications`** — Broadcast campaign records & delivery logs.
6. **`Support Centre`** — User Help form tickets and Admin resolution statuses.
*(Also includes optional `Revenue & Finance` ledger tab support.)*

**Deployment steps in Google Apps Script:**
1. Open your Google Sheet → **Extensions → Apps Script**.
2. Paste the contents of `Code.gs`, update `SPREADSHEET_ID` with `<YOUR_GOOGLE_SPREADSHEET_ID>`, and save.
3. Open **Project Settings → Script Properties** and add `APPS_SCRIPT_SHARED_SECRET` with the exact same random secret configured in `hivecity_admin/.env.local`.
4. Click **Deploy → Manage deployments → Edit → Version: New version → Deploy** (Execute as: *Me*; Who has access: *Anyone*).
   - Note: `doGet()` returns `403 Forbidden`; all `doPost()` calls strictly validate `APPS_SCRIPT_SHARED_SECRET`.
5. Set the resulting `/exec` Web App URL as `APPS_SCRIPT_WEB_APP_URL` in `hivecity_admin/.env.local`.

---

### Pre-Launch Security Hardening Summary
Before deploying to production, verify every item below:

- **CORS Allowlists:** Replace wildcard/origin-reflecting CORS headers on `/api/*` routes with an explicit origin allowlist (`ALLOWED_ORIGINS`) when `Access-Control-Allow-Credentials: true` is enabled.
- **Rate Limiting & Payload Caps:** Enable `express-rate-limit` on authentication (`/api/admin/firebase-session`), user sync, bookings, and support ticket endpoints, and keep default `express.json()` limits small (`1mb`) except on explicit upload routes.
- **Security Headers:** Enable `helmet()` and `app.disable("x-powered-by")` in `server/_core/index.ts` (enforcing `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`).
- **Admin Cookies & Auth:** Keep `hive_admin_session` strictly `HttpOnly`, `SameSite=Lax`, and `Secure=true` under `NODE_ENV=production`, and verify Firebase ID tokens + ownership (`req.user.uid`) on all user-scoped read/write API endpoints.
- **Firestore Rules:** Deploy hardened `firestore.rules` (`firebase deploy --only firestore:rules`) ensuring `email_verified == true` for admin checks, blocking self-escalation on `users/{uid}` (`role`, `blocked`, `status`), and enforcing document ownership on user-owned collections (`recipes`, `shared_nutrition`, `follows`, `post_reposts`).
- **Secrets, Backups & Git Hygiene:** Never commit `.env`, `.env.local`, `server/private/*.json`, archive `.zip` files containing configs, or runtime `*_store.json` files. Add a root `.gitignore`, restrict Firebase Web API keys by HTTP referrer in Google Cloud Console, rotate any exposed credentials, and resolve `pnpm audit --prod` advisories before shipping.
