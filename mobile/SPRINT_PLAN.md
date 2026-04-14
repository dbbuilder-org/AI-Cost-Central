# AICostCentral Mobile — Sprint Plan

## Overview

Expo React Native app for monitoring AI provider spend on iOS & Android.
Push notifications via Expo Push API (no APNs/FCM certs needed).
Backend hosted on existing Vercel deployment.

---

## Phase 1 — Core Monitor + Push (MVP → TestFlight)

### Epic 1: Project Foundation
- [x] Expo SDK 52 project scaffolded in `mobile/`
- [x] expo-router file-based navigation
- [x] TypeScript strict mode
- [x] Dark-theme design system (`constants/colors.ts`)
- [x] React Query for data fetching
- [x] jest-expo test runner configured

### Epic 2: Backend API Endpoints
- [x] `GET /api/dashboard/summary?days=7|14|28` — pre-computed spend cards
- [x] `POST /api/push/register` — store Expo push token in Vercel KV
- [x] `POST /api/push/unregister` — remove push token
- [x] `lib/alerts/push.ts` — Expo Push API sender (batches 100 tokens/req)
- [x] Updated `/api/cron/alerts` to send push notifications after email

### Epic 3: 4 App Screens
- [x] **Dashboard** (`app/(tabs)/index.tsx`)
  - Date range picker (7d / 14d / 28d)
  - Total spend card + change vs prior period
  - 14-day SVG trend chart (react-native-svg, no native deps)
  - Top 10 models with provider color coding
  - Pull-to-refresh
- [x] **Alerts** (`app/(tabs)/alerts.tsx`)
  - Filter chips (All / Critical / Warning / Info) with counts
  - Expandable AlertRow with detail + investigation steps
  - Pull-to-refresh
- [x] **Keys** (`app/(tabs)/keys.tsx`)
  - Search bar, provider filter
  - "New Keys" section with badge
  - Status, spend, creation date per key
- [x] **Settings** (`app/(tabs)/settings.tsx`)
  - Backend URL input (persisted in SecureStore)
  - Default date range selector
  - Push notification toggle
  - Per-severity push controls

### Epic 4: Push Notification Flow
- [x] `expo-notifications` permission request
- [x] Expo push token registration on enable
- [x] Token stored in SecureStore locally + Vercel KV server-side
- [x] Deep link: notification tap → Alerts tab
- [x] Graceful degradation when on simulator or permissions denied

### Epic 5: Tests
- [x] `__tests__/api.test.ts` — 8 tests (fetch, error handling, base URL)
- [x] `__tests__/notifications.test.ts` — 8 tests (permissions, token, enable/disable)
- [x] `__tests__/storage.test.ts` — 7 tests (settings persistence, SecureStore)
- [x] `lib/alerts/__tests__/push.test.ts` — 10 backend tests (batching, priorities, error handling)

---

## Phase 2 — Keys Screen + Chart Detail + Deep Links

### Stories
- [ ] **Key detail screen** — tap a key to see 28d spend chart for that key
- [ ] **Alert deep link** — push notification includes alert ID, taps open detail
- [ ] **Offline cache** — AsyncStorage fallback when network unavailable
- [ ] **Chart zoom** — pinch to zoom on trend chart
- [ ] **Export** — copy spend summary to clipboard as CSV

---

## Phase 3 — Settings Customization + Background Fetch

### Stories
- [ ] **Background fetch** — `expo-background-fetch` to refresh data hourly
- [ ] **Threshold settings** — adjust spike %, drop %, min cost in app
- [ ] **Multiple backends** — saved profiles for different deployments
- [ ] **Biometric lock** — FaceID/TouchID to open app
- [ ] **Widget** — iOS home screen widget showing today's cost

---

## EAS Build → TestFlight Setup

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to Expo account
eas login

# Configure project (updates app.json with real projectId)
cd mobile
eas init

# First TestFlight build
eas build --platform ios --profile preview

# Submit to TestFlight
eas submit --platform ios --profile production
```

### Required before first build:
1. Set real EAS `projectId` in `app.json` extra.eas.projectId
2. Set Apple Developer Team ID in `eas.json`
3. Set App Store Connect App ID in `eas.json`
4. Add `google-services.json` for Android push (optional for iOS-only)

---

## Local Development

```bash
cd mobile
npm install
npx expo start

# With development build (needed for push notifications)
eas build --platform ios --profile development
```

### Environment
The app needs the AICostCentral backend URL configured in Settings.
For local dev: `http://localhost:3000` (must be on same network or use ngrok).
For production: `https://your-deployment.vercel.app`

---

## Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Navigation | expo-router | File-based, typed routes, deep link support |
| Data fetching | @tanstack/react-query | Stale-while-revalidate, background refetch |
| Charts | react-native-svg (custom) | No native modules, Expo Go compatible |
| Storage | expo-secure-store + AsyncStorage | Sensitive data (URL, token) in SecureStore |
| Push tokens | Vercel KV set | Simple, scales, no DB needed |
| Push delivery | Expo Push API | Free, handles APNs/FCM certs automatically |
| Testing | jest-expo | Official Expo Jest preset with RN transforms |
