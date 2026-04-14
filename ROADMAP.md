# AICostCentral — SaaS Transformation Roadmap

> **Current state:** Single-tenant Next.js app on Vercel. No auth, no database, no billing.
> Tracks AI API spend across OpenAI, Anthropic, and Google for one deployment.
>
> **Target:** Full multi-tenant SaaS with auth, encrypted key vault, Stripe billing,
> multi-org/division support, annotations, and advanced trend analysis.

---

## Completed Phases

### Phase 1 — OpenAI Prototype ✅
- Dashboard: overview cards, spend over time, cost by model/key, efficiency table
- Claude Haiku AI analysis: overkill detection, model migration recommendations
- Excel export (5 sheets), Vercel deploy + custom domain

### Phase 2 — Multi-Provider ✅
- Anthropic provider via Admin API (token-count cost calculation)
- Google Gemini via Cloud Monitoring API
- Unified `UsageRow[]` shape across all providers

### Phase 3 — Alerting & Briefs ✅
- Anomaly detection: z-score spike/drop, new model/key signals
- Daily + weekly email briefs (Resend), multi-recipient via `BRIEF_RECIPIENTS`
- Vercel crons: refresh 02:00, brief-daily 07:00, alerts 08:00, brief-weekly Mon 09:00
- Push notifications via Expo + Vercel KV token store
- "Last complete day" logic — briefs always report on finished data, never today's partial

### Phase 3.5 — Repo-Linked Analysis ✅
- GitHub repo URL ↔ API key mapping stored in Vercel KV
- Code scan via GitHub Search API — finds model call sites in linked repos
- Haiku analysis augmented with actual file + line context

### SmartRouter ✅
- Proxy at `/api/v1/chat/completions` — classifies task, routes to cheapest qualifying model
- Pricing catalog: OpenAI, Anthropic, Google, Groq, Mistral
- Virtual key format: `sk-sr-{projectId}-{orgId}` (Phase 2 of router)

### Mobile App ✅
- Expo SDK 52, expo-router, 4 tabs: Dashboard / Alerts / Keys / Settings
- Push notifications, pull-to-refresh, SecureStore for API base URL

---

## SaaS Transformation — 8 Sprints

### Tech Stack Decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Auth** | Clerk | First-class Organizations (roles, invites, org switcher) built in. `clerkMiddleware()` integrates directly into Next.js App Router. Free up to 10K MAU. |
| **Database** | Neon Postgres + Drizzle ORM | Serverless HTTP driver — no connection pool exhaustion on Vercel. Branching per preview deploy. Drizzle has no binary engine (Prisma fails in Vercel bundler). |
| **Key encryption** | AES-256-GCM envelope | Per-org DEK encrypted by master KEK in env var. Attacker needs both DB + env to decrypt. |
| **Billing** | Stripe Checkout + Portal | Standard. Webhook-driven plan sync. |
| **Email** | Resend (existing) | Already integrated. |

### Stripe Plan Tiers

| Plan | Price | Members | Provider Keys | History | Key Features |
|------|-------|---------|---------------|---------|--------------|
| **Free** | $0 | 1 | 2 | 28d | 1 AI analysis/day, no alerts |
| **Growth** | $49/mo · $470/yr | 10 | ∞ | 90d | Alerts, forecasting, 3 divisions, briefs |
| **Business** | $149/mo · $1,430/yr | ∞ | ∞ | 365d | ∞ divisions, budget limits, API access |
| **Enterprise** | Contact sales | ∞ | ∞ | ∞ | SSO, audit log, dedicated SLA |

Annual pricing = 20% discount (2 months free).

### Plan Feature Gate Source of Truth

```typescript
// lib/plans.ts
export const PLAN_LIMITS = {
  free:       { members: 1,  apiKeys: 2,        divisions: 1, historyDays: 28,  alertsEnabled: false, forecastEnabled: false, apiAccess: false, aiAnalysisPerDay: 1  },
  growth:     { members: 10, apiKeys: Infinity,  divisions: 3, historyDays: 90,  alertsEnabled: true,  forecastEnabled: true,  apiAccess: false, aiAnalysisPerDay: Infinity },
  business:   { members: Infinity, apiKeys: Infinity, divisions: Infinity, historyDays: 365, alertsEnabled: true, forecastEnabled: true, apiAccess: true, aiAnalysisPerDay: Infinity },
  enterprise: { members: Infinity, apiKeys: Infinity, divisions: Infinity, historyDays: 730, alertsEnabled: true, forecastEnabled: true, apiAccess: true, aiAnalysisPerDay: Infinity },
} as const;
```

Gates enforced **server-side** in route handlers (authoritative) and client-side in UI (UX only).

---

## Database Schema (Postgres via Neon + Drizzle)

```
organizations        ← Clerk org ID as PK, plan, Stripe IDs, encrypted DEK
  ↓
  ├── org_members    ← Clerk user IDs, roles (owner/admin/viewer), status
  ├── divisions      ← Teams within org, optional parent_id (nested), budget_usd
  ├── api_keys       ← Encrypted provider keys, tags, budget_usd, division_id
  │     ↓
  │   api_key_projects  ← Many-to-many: keys ↔ projects
  ├── projects       ← Logical groupings, color, budget_usd, division_id
  ├── usage_rows     ← Persistent usage data replacing Vercel KV cache
  ├── annotations    ← Notes on any entity (key, project, division, date)
  ├── invitations    ← Pending email invites with Clerk invitation ID
  └── audit_log      ← Immutable event trail (key.created, member.invited, etc.)
```

Every table has `org_id TEXT NOT NULL` — every query filters by `orgId` from Clerk `auth()`.

---

## Sprint 1 — Foundation: Auth + DB + Route Groups
**Duration:** 1–2 weeks | **Status:** 🔄 In Progress

### Goal
Clerk installed, Neon connected, multi-tenant routing in place. Existing single-tenant app works behind auth for the first migrated user. No features broken.

### Packages to install
```
@clerk/nextjs
@neondatabase/serverless
drizzle-orm
drizzle-kit
pg (types only)
```

### New files
| File | Purpose |
|------|---------|
| `middleware.ts` | `clerkMiddleware()` — protects `/app/**`, leaves `/(marketing)` and `/api/webhooks/**` public |
| `lib/db/schema.ts` | Full Drizzle schema (all 9 tables) |
| `lib/db/index.ts` | Neon HTTP client + Drizzle instance |
| `lib/db/migrations/` | Generated by `drizzle-kit generate` |
| `lib/auth.ts` | `requireAuth()` → `{ userId, orgId }`, throws 401 if missing |
| `lib/plans.ts` | `PLAN_LIMITS` constant, `getPlanLimits(orgId)` |
| `app/(auth)/sign-in/[[...sign-in]]/page.tsx` | Clerk `<SignIn />` |
| `app/(auth)/sign-up/[[...sign-up]]/page.tsx` | Clerk `<SignUp />` |
| `app/(auth)/layout.tsx` | Centered auth layout |
| `app/(app)/layout.tsx` | Authenticated shell with `<OrganizationSwitcher />` |
| `app/(app)/dashboard/page.tsx` | Moved from `app/dashboard/page.tsx` |
| `app/(app)/settings/page.tsx` | Moved from `app/settings/page.tsx` |
| `app/(marketing)/layout.tsx` | Public marketing layout |
| `app/(marketing)/page.tsx` | Placeholder landing page (full content Sprint 3) |

### Modified files
| File | Change |
|------|--------|
| `app/layout.tsx` | Wrap with `<ClerkProvider>` |
| `app/page.tsx` | Remove redirect (marketing group handles `/`) |
| `app/api/**` | Add `const { orgId } = requireAuth()` at top, KV keys namespaced with orgId |
| `vercel.json` | Add env vars for Clerk |
| `tsconfig.json` | Add path alias `@/lib/db` |

### Environment variables
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
DATABASE_URL=postgresql://...@neon.tech/aicostcentral?sslmode=require
MASTER_ENCRYPTION_KEY=  # 32-byte hex, generated once, never changes
```

### Tests
- `lib/db/__tests__/schema.test.ts` — Drizzle schema type checks (compile-time)
- `lib/__tests__/plans.test.ts` — Plan limits constants and `getPlanLimits()`
- `lib/__tests__/auth.test.ts` — `requireAuth()` throws 401 when Clerk returns null

### Critical decisions
- Clerk org ID is the PK of `organizations` — no UUID join needed
- KV keys namespaced: `${orgId}:openai:usage:28d` — prevents cross-org data leakage
- Env var fallback retained in all API routes through Sprint 2 (backward compat)

---

## Sprint 2 — BYO Key Encryption + Secure Storage
**Duration:** 1–2 weeks | **Status:** ⏳ Pending

### Goal
Provider API keys move from `localStorage` / Vercel env vars into encrypted Postgres. Settings page becomes a server-rendered key manager. Provider API routes resolve keys from DB (with env var fallback during transition).

### New files
| File | Purpose |
|------|---------|
| `lib/crypto.ts` | AES-256-GCM helpers: `generateDEK`, `encryptWithKEK`, `decryptWithKEK`, `encryptApiKey`, `decryptApiKey` |
| `lib/server/resolveKey.ts` | `resolveProviderKey(orgId, provider)` — decrypts from DB, falls back to env var |
| `app/(app)/settings/keys/page.tsx` | Server Component: key list (metadata only, never ciphertext) |
| `components/settings/KeyList.tsx` | Key rows with edit/delete/test actions |
| `components/settings/AddKeyDialog.tsx` | Provider selector, display name, tags, budget, key input |
| `app/api/org/keys/route.ts` | GET list + POST create (encrypt + store) |
| `app/api/org/keys/[keyId]/route.ts` | PATCH metadata, DELETE soft-delete, POST /test probe |

### Modified files
| File | Change |
|------|--------|
| `app/api/openai/usage/route.ts` | Use `resolveProviderKey(orgId, 'openai')` |
| `app/api/anthropic/usage/route.ts` | Same |
| `app/api/google/usage/route.ts` | Same |
| `components/settings/ApiKeyForm.tsx` | POST to `/api/org/keys` instead of localStorage |

### Tests
- `lib/__tests__/crypto.test.ts` — encrypt/decrypt round-trips, IV uniqueness, wrong key fails
- `app/api/org/keys/__tests__/route.test.ts` — create, list, delete, plan limit enforcement

### Critical decisions
- `lib/server/resolveKey.ts` is server-only — never imported in Client Components
- Keys never returned in plaintext from any endpoint
- Test: encrypt same value twice → assert outputs differ (IV uniqueness)

---

## Sprint 3 — Marketing Landing Page
**Duration:** 1 week | **Status:** ⏳ Pending

### Goal
Public `/` becomes a full marketing page. Light-mode marketing / dark-mode app split. Pricing page with plan comparison. SEO-friendly.

### New files
| File | Purpose |
|------|---------|
| `app/(marketing)/page.tsx` | Landing page (Server Component) |
| `app/(marketing)/pricing/page.tsx` | Pricing comparison page |
| `app/(marketing)/layout.tsx` | Public layout (light mode, nav, footer) |
| `components/marketing/Hero.tsx` | Headline, sub-headline, dashboard screenshot, CTAs |
| `components/marketing/FeatureGrid.tsx` | 6-card feature showcase |
| `components/marketing/PricingTable.tsx` | Plan comparison table, highlight active tier |
| `components/marketing/ProviderLogos.tsx` | OpenAI / Anthropic / Google logo strip |
| `components/marketing/Nav.tsx` | Public nav: logo, Sign In, Get Started |
| `components/marketing/Footer.tsx` | Links, copyright |
| `components/marketing/Testimonials.tsx` | Static testimonial cards |

### Tests
- Smoke renders for Hero, FeatureGrid, PricingTable (React Testing Library / Vitest)

---

## Sprint 4 — Stripe Billing
**Duration:** 1–2 weeks | **Status:** ⏳ Pending

### Goal
Users subscribe via Stripe Checkout. Subscription status syncs via webhooks. Plan limits enforced server-side. Upgrade/downgrade via Customer Portal.

### New files
| File | Purpose |
|------|---------|
| `lib/stripe.ts` | Stripe singleton client |
| `lib/billing.ts` | `createCheckoutSession`, `createPortalSession`, `getPlanFromPriceId` |
| `app/api/webhooks/stripe/route.ts` | Webhook handler (raw body + signature verify) |
| `app/api/billing/checkout/route.ts` | POST → Stripe Checkout session URL |
| `app/api/billing/portal/route.ts` | POST → Stripe Portal session URL |
| `app/(app)/billing/page.tsx` | Current plan, usage bars, upgrade CTA |
| `components/billing/PlanCard.tsx` | Plan name, price, usage vs limits |
| `components/billing/UpgradeDialog.tsx` | Plan picker |
| `components/ui/PlanGate.tsx` | Wrapper: show content or upgrade prompt |

### Stripe webhook events
- `checkout.session.completed` → write stripeCustomerId, subscriptionId, update plan
- `customer.subscription.updated` → update plan + status
- `customer.subscription.deleted` → downgrade to free
- `invoice.payment_failed` → set past_due + send Resend email

### Tests
- `lib/__tests__/billing.test.ts` — `getPlanFromPriceId`, checkout session creation
- `app/api/webhooks/stripe/__tests__/route.test.ts` — each webhook event type, idempotency check

### Critical decisions
- `/api/webhooks/stripe` is public (not protected by Clerk middleware)
- Use `await req.text()` not `req.json()` before `stripe.webhooks.constructEvent()`
- Check `stripeSubscriptionId` before writing (idempotency)

---

## Sprint 5 — Multi-Org, Divisions, User Management
**Duration:** 1–2 weeks | **Status:** ⏳ Pending

### Goal
Org creation triggers DB row creation via Clerk webhook. Division management UI. Members invited by email with role assignment.

### New files
| File | Purpose |
|------|---------|
| `app/api/webhooks/clerk/route.ts` | `organization.created` → create org row + DEK; `organizationMembership.*` → sync members |
| `app/(app)/settings/members/page.tsx` | Member list + invite UI |
| `app/(app)/settings/divisions/page.tsx` | Division CRUD UI |
| `components/settings/MemberList.tsx` | Table: name, email, role, status, actions |
| `components/settings/InviteDialog.tsx` | Email + role picker |
| `components/settings/DivisionForm.tsx` | Name, description, budget, parent |
| `app/api/org/invitations/route.ts` | POST: Clerk invite + DB record + Resend email |
| `app/api/org/members/[memberId]/route.ts` | PATCH role, DELETE deactivate |
| `app/api/org/divisions/route.ts` | CRUD |
| `app/api/org/divisions/[divisionId]/route.ts` | Update, delete |
| `lib/auth.ts` | Add `requireRole(orgId, userId, minRole)` |

### Tests
- `app/api/webhooks/clerk/__tests__/route.test.ts` — org created, membership created, ordering race
- `lib/__tests__/auth.test.ts` — `requireRole` grants/denies correctly

---

## Sprint 6 — Projects, Annotations, Key Metadata
**Duration:** 1–2 weeks | **Status:** ⏳ Pending

### Goal
Usage data attributed to projects. Keys, projects, and dates annotatable. Dashboard filterable by project.

### New files
| File | Purpose |
|------|---------|
| `app/(app)/projects/page.tsx` | Project list with cost attribution |
| `app/(app)/projects/[projectId]/page.tsx` | Project detail: filtered usage + budget vs actuals |
| `components/projects/ProjectCard.tsx` | Name, color, division, keys, budget, spend |
| `app/api/org/projects/route.ts` | CRUD |
| `app/api/org/projects/[projectId]/route.ts` | Update, delete |
| `app/api/org/projects/[projectId]/keys/route.ts` | Assign/remove keys |
| `components/annotations/AnnotationPanel.tsx` | Inline panel for notes + tags on any entity |
| `app/api/org/annotations/route.ts` | POST create, GET by entity |

### Modified files
| File | Change |
|------|--------|
| `store/useDashboard.ts` | Add `projectId` filter state |
| `lib/transform.ts` | Accept optional `projectId` filter in `buildSummary` |
| `app/(app)/dashboard/page.tsx` | Project filter in date range bar |

### Tests
- `app/api/org/projects/__tests__/route.test.ts` — CRUD, key assignment
- `app/api/org/annotations/__tests__/route.test.ts` — create, filter by entity

---

## Sprint 7 — Advanced Analytics + Forecasting
**Duration:** 1–2 weeks | **Status:** ⏳ Pending

### Goal
30/90/365-day history (Growth/Business gates). Linear cost forecasting. Division cost breakdown. Cron multi-tenant fan-out.

### New files
| File | Purpose |
|------|---------|
| `lib/forecast.ts` | OLS linear regression over daily spend → projected month total |
| `components/charts/ForecastOverlay.tsx` | Dashed forecast line overlay on SpendOverTime |
| `components/charts/DivisionBreakdown.tsx` | Stacked horizontal bar by division |
| `components/dashboard/ForecastCard.tsx` | Projected monthly spend + confidence interval |
| `app/(app)/analytics/page.tsx` | Dedicated analytics: long-range pickers, forecast, division breakdown |
| `app/api/org/analytics/trend/route.ts` | Server query: usage_rows with long date windows + forecast |

### Modified files
| File | Change |
|------|--------|
| `app/api/cron/refresh/route.ts` | Multi-tenant fan-out: query all orgs, waitUntil per-org worker |
| `types/index.ts` | Expand `DateRange` to include "30d" \| "90d" \| "365d" |
| `store/useDashboard.ts` | `historyDays` state, plan-gate 90d/365d |

### Tests
- `lib/__tests__/forecast.test.ts` — OLS correctness, handles flat/zero data, short series

---

## Sprint 8 — Onboarding, Migration, Audit Log, Hardening
**Duration:** 1–2 weeks | **Status:** ⏳ Pending

### Goal
Smooth new-user onboarding. One-time migration of env-var keys to org DB. Audit log. Replace internal HTTP calls with direct DB queries. Production hardening.

### New files
| File | Purpose |
|------|---------|
| `app/(app)/onboarding/page.tsx` | Multi-step wizard: org name → add key → invite → done |
| `components/onboarding/OnboardingWizard.tsx` | Step tracker |
| `app/api/org/onboarding/complete/route.ts` | Mark org as onboarded |
| `lib/db/migrate.ts` | One-time script: env-var keys → encrypted org DB rows |
| `app/(app)/settings/audit/page.tsx` | Audit log viewer (owners only) |

### Modified files
| File | Change |
|------|--------|
| `lib/alerts/fetchAllRows.ts` | Replace internal HTTP calls with direct DB queries |
| `middleware.ts` | Redirect no-org users to /onboarding |
| All mutating API routes | Add `audit()` helper write |

### Tests
- `lib/__tests__/migrate.test.ts` — migration script creates org + encrypts keys correctly
- Audit log write integration tests

---

## Critical Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **KV key namespace collision** | Cross-org data leakage | Sprint 1: prefix all KV writes with `${orgId}:` |
| **Cron fan-out timeout** | Orgs not refreshed | Sprint 7: `waitUntil` per-org workers, Node runtime (300s limit) |
| **Clerk webhook ordering race** | Org row missing when membership fires | `INSERT ... ON CONFLICT DO NOTHING` for org; retry for membership |
| **Stripe webhook idempotency** | Double billing / plan mismatches | Check `stripeSubscriptionId` before writing; store processed event IDs |
| **AES-256-GCM IV reuse** | Cryptographic break | Always `crypto.randomBytes(12)` per encrypt call; unit test IV uniqueness |
| **Clerk roles vs app roles** | Privilege escalation | Store app roles in `org_members.role`, not Clerk JWT claims; `requireRole` reads from DB |
| **Neon connection limits** | Function timeouts under load | Always use `@neondatabase/serverless` HTTP client, never `pg.Pool` in Vercel Functions |
| **Google has no per-key API** | Attribution gap for Google | Store one service account as single `api_keys` row; budget limits at org/project level |
| **fetchAllUsageRows internal HTTP** | Breaks on preview deploys | Sprint 8: replace with direct DB queries |
| **localStorage key import** | Empty dashboard after migration | Persistent migration banner cannot be dismissed without import or explicit decline |

---

## Environment Variables (Full List)

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=          # Svix signing secret for Clerk webhooks
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# Database
DATABASE_URL=postgresql://...@neon.tech/aicostcentral?sslmode=require
MASTER_ENCRYPTION_KEY=         # 64-char hex (32 bytes), generated once

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_GROWTH_MONTHLY=
STRIPE_PRICE_GROWTH_ANNUAL=
STRIPE_PRICE_BUSINESS_MONTHLY=
STRIPE_PRICE_BUSINESS_ANNUAL=

# Existing (retained)
OPENAI_ADMIN_KEY=              # Fallback until all users migrate to DB keys
ANTHROPIC_ADMIN_KEY=           # Same
ANTHROPIC_API_KEY=             # For Haiku analysis
GOOGLE_SERVICE_ACCOUNT_JSON=   # Same
RESEND_API_KEY=
BRIEF_RECIPIENTS=
BRIEF_FROM=
CRON_SECRET=
KV_REST_API_URL=
KV_REST_API_TOKEN=
INTERNAL_API_BASE=
```

---

## File Structure After Sprint 8

```
app/
  (auth)/
    sign-in/[[...sign-in]]/page.tsx
    sign-up/[[...sign-up]]/page.tsx
    layout.tsx
  (marketing)/
    page.tsx                   # Landing page
    pricing/page.tsx
    layout.tsx
  (app)/
    layout.tsx                 # Authenticated shell
    dashboard/page.tsx
    analytics/page.tsx
    projects/
      page.tsx
      [projectId]/page.tsx
    settings/
      page.tsx                 # Overview
      keys/page.tsx
      members/page.tsx
      divisions/page.tsx
      audit/page.tsx
    billing/page.tsx
    onboarding/page.tsx
  api/
    webhooks/
      clerk/route.ts
      stripe/route.ts
    org/
      keys/route.ts
      keys/[keyId]/route.ts
      members/[memberId]/route.ts
      divisions/route.ts
      divisions/[divisionId]/route.ts
      projects/route.ts
      projects/[projectId]/route.ts
      projects/[projectId]/keys/route.ts
      annotations/route.ts
      invitations/route.ts
      analytics/trend/route.ts
      onboarding/complete/route.ts
    billing/
      checkout/route.ts
      portal/route.ts
    # Existing provider + cron routes retained
lib/
  db/
    schema.ts                  # Drizzle schema (all 9 tables)
    index.ts                   # Neon client + Drizzle instance
    migrations/
  server/
    resolveKey.ts              # Decrypt provider key (server-only)
  auth.ts                      # requireAuth(), requireRole()
  plans.ts                     # PLAN_LIMITS, getPlanLimits()
  crypto.ts                    # AES-256-GCM helpers
  stripe.ts                    # Stripe singleton
  billing.ts                   # createCheckoutSession, createPortalSession
  forecast.ts                  # Linear regression forecasting
  # Existing lib/ retained
components/
  marketing/                   # Landing page components
  billing/                     # Plan cards, upgrade dialog
  projects/                    # Project cards
  annotations/                 # Annotation panel
  onboarding/                  # Wizard
  # Existing components/ retained
middleware.ts                  # Clerk middleware (root)
```

---

*Last updated: 2026-04-14 | Version: 2.0*
