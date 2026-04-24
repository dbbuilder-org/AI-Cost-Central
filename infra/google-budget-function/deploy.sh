#!/usr/bin/env bash
# Deploy the Google Budget Alert Cloud Function to GCP.
# Run from this directory: ./deploy.sh
#
# Prerequisites:
#   - gcloud CLI authenticated: gcloud auth login
#   - Project set: gcloud config set project gen-lang-client-0915390692
#   - Service APIs enabled:
#       gcloud services enable cloudfunctions.googleapis.com pubsub.googleapis.com serviceusage.googleapis.com

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-gen-lang-client-0915390692}"
REGION="${GCP_REGION:-us-central1}"
FUNCTION_NAME="google-budget-alert"
TOPIC_NAME="billing-alerts"

# These must be set in your shell before running
: "${AICOSTCENTRAL_WEBHOOK_URL:?Set AICOSTCENTRAL_WEBHOOK_URL}"
: "${INTERNAL_WEBHOOK_SECRET:?Set INTERNAL_WEBHOOK_SECRET}"

echo "▶ Deploying ${FUNCTION_NAME} to ${PROJECT_ID} (${REGION})..."

gcloud functions deploy "${FUNCTION_NAME}" \
  --gen2 \
  --runtime=python312 \
  --region="${REGION}" \
  --source=. \
  --entry-point=google_budget_alert \
  --trigger-topic="${TOPIC_NAME}" \
  --project="${PROJECT_ID}" \
  --memory=256MB \
  --timeout=60s \
  --max-instances=3 \
  --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},AICOSTCENTRAL_WEBHOOK_URL=${AICOSTCENTRAL_WEBHOOK_URL},INTERNAL_WEBHOOK_SECRET=${INTERNAL_WEBHOOK_SECRET},DISABLE_API_AT_100PCT=true"

echo ""
echo "✓ Deployed. Grant the function's service account the Service Usage Admin role:"
echo ""

SA=$(gcloud functions describe "${FUNCTION_NAME}" \
  --gen2 \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(serviceConfig.serviceAccountEmail)" 2>/dev/null || echo "<lookup SA manually>")

echo "  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
echo "    --member=\"serviceAccount:${SA}\" \\"
echo "    --role=\"roles/serviceusage.serviceUsageAdmin\""
echo ""
echo "▶ Test with a simulated Pub/Sub message:"
echo ""
PAYLOAD=\$(echo -n '{\"budgetDisplayName\":\"Gemini API\",\"alertThresholdExceeded\":0.9,\"costAmount\":90.00,\"budgetAmount\":100.00,\"currencyCode\":\"USD\"}' | base64)
echo "  gcloud pubsub topics publish ${TOPIC_NAME} \\"
echo "    --project=${PROJECT_ID} \\"
echo "    --message=\"\${PAYLOAD}\""
