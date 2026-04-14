import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { DivisionsClient } from "@/components/settings/DivisionsClient";
import { getOrgPlanLimits } from "@/lib/plans";

export default async function DivisionsPage() {
  const { orgId } = await requireAuth();

  const [divisions, limits] = await Promise.all([
    db.query.divisions.findMany({
      where: eq(schema.divisions.orgId, orgId),
      orderBy: (d, { asc }) => [asc(d.name)],
    }),
    getOrgPlanLimits(orgId),
  ]);

  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Divisions</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Organize your team into divisions. Assign API keys to divisions for cost attribution.
          </p>
        </div>
        <DivisionsClient
          initialDivisions={divisions}
          limitReached={divisions.length >= limits.divisions}
        />
      </div>
    </div>
  );
}
