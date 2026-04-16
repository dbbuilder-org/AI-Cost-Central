/**
 * GET  /api/org/notifications — read org notification config
 * PUT  /api/org/notifications — update org notification config
 *
 * Config is stored in organizations.settings.notifications (JSONB).
 * Admins and owners only for writes.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export interface NotificationConfig {
  /** Slack incoming webhook URL for alert delivery */
  slackWebhookUrl?: string;
  /** Alert email recipients (comma-separated or array) */
  alertEmails?: string[];
  /** Whether to send daily spend briefs */
  dailyBriefEnabled?: boolean;
  /** Whether to send weekly spend briefs */
  weeklyBriefEnabled?: boolean;
  /** Minimum alert severity to deliver: all | warning_and_critical | critical_only */
  minSeverity?: "all" | "warning_and_critical" | "critical_only";
  /** Cost spike threshold — z-score (default 2.5) */
  spikeZScore?: number;
  /** Minimum % increase to fire a cost spike alert (default 50) */
  spikeMinPct?: number;
}

async function getOrgSettings(orgId: string): Promise<Record<string, unknown>> {
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
    columns: { settings: true },
  });
  return (org?.settings as Record<string, unknown>) ?? {};
}

export async function GET() {
  try {
    const { orgId } = await requireAuth();
    const settings = await getOrgSettings(orgId);
    const notifications = (settings.notifications ?? {}) as NotificationConfig;
    return NextResponse.json({ notifications });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load notification settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");

    const body = await req.json() as Partial<NotificationConfig>;

    // Validate
    if (body.spikeZScore !== undefined && (body.spikeZScore < 1 || body.spikeZScore > 10)) {
      return NextResponse.json({ error: "spikeZScore must be between 1 and 10" }, { status: 422 });
    }
    if (body.spikeMinPct !== undefined && (body.spikeMinPct < 0 || body.spikeMinPct > 500)) {
      return NextResponse.json({ error: "spikeMinPct must be between 0 and 500" }, { status: 422 });
    }
    if (body.minSeverity && !["all", "warning_and_critical", "critical_only"].includes(body.minSeverity)) {
      return NextResponse.json({ error: "Invalid minSeverity value" }, { status: 422 });
    }
    if (body.alertEmails !== undefined && !Array.isArray(body.alertEmails)) {
      return NextResponse.json({ error: "alertEmails must be an array" }, { status: 422 });
    }

    // Merge into existing settings
    const existing = await getOrgSettings(orgId);
    const merged = {
      ...existing,
      notifications: {
        ...(existing.notifications as object ?? {}),
        ...body,
      },
    };

    await db
      .update(schema.organizations)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(schema.organizations.id, orgId));

    return NextResponse.json({ notifications: merged.notifications });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update notification settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
