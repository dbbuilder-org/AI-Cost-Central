# Google AI Cost Control — Full Implementation Plan

**Goal**: Alert in real-time when Google AI Studio / Gemini API spend crosses budget thresholds, and automatically disable the API at 100% to prevent runaway charges. All alerts flow into the existing AICostCentral push + SMS notification pipeline.

---

## Architecture

```
GCP Billing Budget
      │  triggers at 25/50/75/90/100%
      ▼
Cloud Pub/Sub topic: billing-alerts
      │
      ▼
Cloud Function (Python)
  1. Decode Pub/Sub message (costAmount, budgetAmount, threshold)
  2. At 100%: disable generativelanguage.googleapis.com via Service Usage API
  3. POST to AICostCentral /api/internal/google-budget-alert
      │
      ▼
AICostCentral (Next.js, Vercel)
  app/api/internal/google-budget-alert/route.ts
  1. Validate x-internal-secret header
  2. Insert into key_alerts (deduped per threshold per day)
  3. sendAlertNotifications() → Expo push + Twilio SMS
```

---

## Severity Mapping

| Threshold | Severity | Action                                  |
|-----------|----------|-----------------------------------------|
| 25%       | info     | Notify only                             |
| 50%       | info     | Notify only                             |
| 75%       | warning  | Notify only                             |
| 90%       | critical | Notify only                             |
| 100%      | critical | Notify + disable Generative Language API|

---

## Files Created

| File | Purpose |
|------|---------|
| `app/api/internal/google-budget-alert/route.ts` | Webhook endpoint (AICostCentral) |
| `infra/google-budget-function/main.py` | Cloud Function entry point |
| `infra/google-budget-function/requirements.txt` | Python dependencies |
| `infra/google-budget-function/deploy.sh` | One-shot gcloud deploy script |

---

## Environment Variables

### Vercel (AICostCentral)
| Variable | Value |
|----------|-------|
| `INTERNAL_WEBHOOK_SECRET` | Random 32-char hex — shared with Cloud Function |

### GCP Cloud Function
| Variable | Value |
|----------|-------|
| `AICOSTCENTRAL_WEBHOOK_URL` | `https://your-vercel-domain/api/internal/google-budget-alert` |
| `INTERNAL_WEBHOOK_SECRET` | Same value as Vercel variable |
| `GCP_PROJECT_ID` | `gen-lang-client-0915390692` |
| `DISABLE_API_AT_100PCT` | `true` (set to `false` to suppress the kill switch) |

---

## GCP Setup Steps (manual, one-time)

1. **Create Pub/Sub topic**
   ```
   gcloud pubsub topics create billing-alerts --project=gen-lang-client-0915390692
   ```

2. **Create Billing Budget** (repeat for each threshold)
   - GCP Console → Billing → Budgets & Alerts → Create Budget
   - Scope: Project `gen-lang-client-0915390692`, Service: `Generative Language API`
   - Amount: `$100` (adjust to your real cap)
   - Alert thresholds: 25%, 50%, 75%, 90%, 100% (actual)
   - Actions: Connect to Pub/Sub topic `billing-alerts`
   - Enable "Forecasted spend" alerts for 90% and 100%

3. **Deploy Cloud Function** (see `infra/google-budget-function/deploy.sh`)

4. **Grant IAM roles to Cloud Function service account**
   ```
   # Allow Cloud Function to disable the Generative Language API
   gcloud projects add-iam-policy-binding gen-lang-client-0915390692 \
     --member="serviceAccount:FUNCTION_SA@gen-lang-client-0915390692.iam.gserviceaccount.com" \
     --role="roles/serviceusage.serviceUsageAdmin"
   ```
   > Only needed if `DISABLE_API_AT_100PCT=true`. The function runs with the
   > default compute service account unless you specify `--service-account`.

5. **Set Vercel env var**
   ```
   vercel env add INTERNAL_WEBHOOK_SECRET production
   ```

---

## Deduplication Strategy

The `key_alerts` table has a unique index on `(provider_key_id, alert_type, detected_at)`.

For budget alerts:
- `provider_key_id` = `google-budget-{thresholdPct}` (e.g. `google-budget-75`)
- `alert_type` = `cost_spike`
- `detected_at` = today's date (UTC)

This means:
- Each threshold fires at most once per day ✓
- Different thresholds fire independently ✓
- Re-triggering the same threshold the same day is a no-op ✓

---

## Disabling the API vs. Disabling Billing

| Action | Effect | Re-enable |
|--------|--------|-----------|
| Disable `generativelanguage.googleapis.com` | Stops all Gemini API calls. Other GCP services (Cloud Run, Storage, etc.) continue. | `gcloud services enable generativelanguage.googleapis.com` |
| Disconnect billing account | Stops ALL GCP services (VMs, databases, Cloud Run) | Manual in GCP Console |

**We use the API disable approach** — surgical, reversible, leaves all other infrastructure running.

---

## Testing

```bash
# Simulate a Pub/Sub budget alert (base64 encode the payload)
PAYLOAD=$(echo -n '{"budgetDisplayName":"Gemini API","alertThresholdExceeded":0.9,"costAmount":90.00,"budgetAmount":100.00,"currencyCode":"USD"}' | base64)

gcloud pubsub topics publish billing-alerts \
  --project=gen-lang-client-0915390692 \
  --message="$PAYLOAD"
```

Or call the AICostCentral webhook directly:
```bash
curl -X POST https://your-domain/api/internal/google-budget-alert \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: YOUR_SECRET" \
  -d '{"costAmount":90,"budgetAmount":100,"thresholdPct":90,"budgetDisplayName":"Gemini API","projectId":"gen-lang-client-0915390692","severity":"critical"}'
```
