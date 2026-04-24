"""
GCP Cloud Function: google_budget_alert

Triggered by Pub/Sub messages from a GCP Billing Budget.
Fires when spend crosses a configured threshold (25/50/75/90/100%).

At 100%: disables the Generative Language API for the project (kills Gemini calls
without touching any other GCP service). Controlled by DISABLE_API_AT_100PCT env var.

Then POSTs to AICostCentral /api/internal/google-budget-alert which inserts a
key_alerts row and sends push + SMS notifications via Expo + Twilio.

Required env vars:
  AICOSTCENTRAL_WEBHOOK_URL   Full URL of the webhook endpoint
  INTERNAL_WEBHOOK_SECRET     Shared secret matching Vercel INTERNAL_WEBHOOK_SECRET
  GCP_PROJECT_ID              e.g. gen-lang-client-0915390692
  DISABLE_API_AT_100PCT       "true" | "false" (default: "true")
"""

import base64
import json
import logging
import os
from typing import Any

import functions_framework
import requests
from google.cloud import service_usage_v1
from google.api_core.exceptions import GoogleAPIError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

GENERATIVE_LANGUAGE_API = "generativelanguage.googleapis.com"

# Threshold → severity mapping
SEVERITY_MAP = [
    (1.00, "critical"),
    (0.90, "critical"),
    (0.75, "warning"),
    (0.50, "warning"),
    (0.25, "info"),
]


def threshold_to_severity(threshold: float) -> str:
    for t, s in SEVERITY_MAP:
        if threshold >= t:
            return s
    return "info"


def disable_generative_language_api(project_id: str) -> bool:
    """
    Disables generativelanguage.googleapis.com on the given project.
    Returns True if successful, False on error.

    Re-enable with:
      gcloud services enable generativelanguage.googleapis.com --project=PROJECT_ID
    """
    if os.environ.get("DISABLE_API_AT_100PCT", "true").lower() != "true":
        logger.info("[budget] DISABLE_API_AT_100PCT is not 'true' — skipping API disable")
        return False

    try:
        client = service_usage_v1.ServiceUsageClient()
        service_name = f"projects/{project_id}/services/{GENERATIVE_LANGUAGE_API}"

        logger.warning(f"[budget] Disabling {GENERATIVE_LANGUAGE_API} on project {project_id}")
        operation = client.disable_service(
            request=service_usage_v1.DisableServiceRequest(
                name=service_name,
                disable_dependent_services=False,
            )
        )
        operation.result(timeout=60)
        logger.warning(f"[budget] {GENERATIVE_LANGUAGE_API} disabled successfully on {project_id}")
        return True

    except GoogleAPIError as e:
        logger.error(f"[budget] Failed to disable API: {e}")
        return False


def post_to_aicostcentral(payload: dict[str, Any]) -> bool:
    """
    POST the budget alert to AICostCentral.
    Returns True if the webhook accepted the request (2xx).
    """
    url = os.environ.get("AICOSTCENTRAL_WEBHOOK_URL")
    secret = os.environ.get("INTERNAL_WEBHOOK_SECRET")

    if not url or not secret:
        logger.error("[budget] AICOSTCENTRAL_WEBHOOK_URL or INTERNAL_WEBHOOK_SECRET not set")
        return False

    try:
        resp = requests.post(
            url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "x-internal-secret": secret,
            },
            timeout=15,
        )
        if resp.ok:
            try:
                logger.info(f"[budget] Webhook accepted: {resp.json()}")
            except Exception:
                logger.info(f"[budget] Webhook accepted (non-JSON response): {resp.status_code}")
            return True
        else:
            logger.error(f"[budget] Webhook rejected {resp.status_code}: {resp.text[:300]}")
            return False
    except requests.RequestException as e:
        logger.error(f"[budget] Webhook request failed: {e}")
        return False


@functions_framework.cloud_event
def google_budget_alert(cloud_event: Any) -> None:
    """
    Entry point — triggered by a Cloud Pub/Sub message from a GCP Billing Budget.

    Pub/Sub message data (base64-encoded JSON):
    {
      "budgetDisplayName": "Gemini API Budget",
      "alertThresholdExceeded": 0.9,
      "costAmount": 90.00,
      "costIntervalStart": "2026-04-01T00:00:00Z",
      "budgetAmount": 100.00,
      "budgetAmountType": "SPECIFIED_AMOUNT",
      "currencyCode": "USD"
    }

    Note: GCP only sends a message when a threshold is first crossed in a billing
    period — not on every invocation. Re-sends can happen if you update the budget.
    """
    try:
        # Decode Pub/Sub payload
        raw_data = cloud_event.data.get("message", {}).get("data", "")
        if not raw_data:
            logger.error("[budget] No data in Pub/Sub message")
            return

        message = json.loads(base64.b64decode(raw_data).decode("utf-8"))
        logger.info(f"[budget] Received: {json.dumps(message)}")

        cost_amount: float = float(message.get("costAmount", 0))
        budget_amount: float = float(message.get("budgetAmount", 0))
        threshold: float = float(message.get("alertThresholdExceeded", 0))
        budget_display_name: str = message.get("budgetDisplayName", "Google AI Budget")
        project_id: str = os.environ.get("GCP_PROJECT_ID", "")

        if budget_amount <= 0:
            logger.warning("[budget] budgetAmount is 0 — skipping")
            return

        threshold_pct = threshold * 100  # e.g. 0.9 → 90.0
        severity = threshold_to_severity(threshold)

        logger.info(
            f"[budget] Threshold crossed: {threshold_pct:.0f}% "
            f"(${cost_amount:.2f} / ${budget_amount:.2f}) — severity={severity}"
        )

        # At 100%: disable the API first, then notify
        api_disabled = False
        if threshold >= 1.0:
            api_disabled = disable_generative_language_api(project_id)

        # POST to AICostCentral
        post_to_aicostcentral({
            "costAmount": cost_amount,
            "budgetAmount": budget_amount,
            "thresholdPct": threshold_pct,
            "budgetDisplayName": budget_display_name,
            "projectId": project_id,
            "severity": severity,
            "apiDisabled": api_disabled,
        })

    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error(f"[budget] Failed to parse Pub/Sub message: {e}")
    except Exception as e:
        logger.error(f"[budget] Unexpected error: {e}", exc_info=True)
        raise  # Re-raise so GCP retries the message
