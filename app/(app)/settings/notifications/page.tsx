import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NotificationsForm } from "@/components/settings/NotificationsForm";
import type { NotificationConfig } from "@/app/api/org/notifications/route";

export default async function NotificationsPage() {
  const { orgId } = await requireAuth();

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
    columns: { settings: true },
  });

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const notifications = (settings.notifications ?? {}) as NotificationConfig;

  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-gray-400 mt-1">
            Configure alert delivery — Slack, email, and anomaly thresholds
          </p>
        </div>
        <NotificationsForm initial={notifications} />
      </div>
    </div>
  );
}
