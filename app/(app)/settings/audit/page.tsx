import { requireAuth, requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { formatDistanceToNow } from "@/lib/utils";

export default async function AuditPage() {
  const { orgId, userId } = await requireAuth();

  // Owners only
  try {
    await requireRole(orgId, userId, "owner");
  } catch {
    return (
      <div className="min-h-screen bg-gray-950 p-6 flex items-center justify-center">
        <p className="text-gray-400">Audit log is only accessible to organization owners.</p>
      </div>
    );
  }

  const entries = await db.query.auditLog.findMany({
    where: eq(schema.auditLog.orgId, orgId),
    orderBy: [desc(schema.auditLog.createdAt)],
    limit: 200,
  });

  const ACTION_COLORS: Record<string, string> = {
    "key.created": "text-green-400",
    "key.deleted": "text-red-400",
    "key.updated": "text-blue-400",
    "member.invited": "text-indigo-400",
    "member.role_changed": "text-yellow-400",
    "member.deactivated": "text-red-400",
    "division.created": "text-green-400",
    "division.deleted": "text-red-400",
    "project.created": "text-green-400",
    "project.deleted": "text-red-400",
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-gray-400 mt-1 text-sm">All actions taken in your organization (last 200)</p>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-800 p-12 text-center">
            <p className="text-gray-500 text-sm">No audit events yet.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-4 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl"
              >
                <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-gray-600 mt-2" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-mono font-semibold ${ACTION_COLORS[entry.action] ?? "text-gray-300"}`}>
                      {entry.action}
                    </span>
                    {entry.resourceType && (
                      <span className="text-xs text-gray-500">{entry.resourceType}</span>
                    )}
                  </div>
                  {entry.metadata && Object.keys(entry.metadata as object).length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">
                      {JSON.stringify(entry.metadata)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-600 shrink-0 whitespace-nowrap">
                  {formatDistanceToNow(entry.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
