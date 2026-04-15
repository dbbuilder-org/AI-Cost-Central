import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { KeyList } from "@/components/settings/KeyList";
import { ExcludedKeysPanel } from "@/components/settings/ExcludedKeysPanel";
import { getOrgPlanLimits } from "@/lib/plans";

export default async function KeysPage() {
  const { orgId } = await requireAuth();

  const [keys, limits] = await Promise.all([
    db.query.apiKeys.findMany({
      where: and(
        eq(schema.apiKeys.orgId, orgId),
        eq(schema.apiKeys.isActive, true)
      ),
      columns: {
        id: true,
        provider: true,
        displayName: true,
        hint: true,
        description: true,
        tags: true,
        budgetUsd: true,
        lastTestedAt: true,
        lastTestOk: true,
        createdAt: true,
      },
      orderBy: (k, { desc }) => [desc(k.createdAt)],
    }),
    getOrgPlanLimits(orgId),
  ]);

  const atLimit = keys.length >= limits.apiKeys;

  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">API Keys</h1>
            <p className="text-gray-400 mt-1 text-sm">
              Manage your encrypted provider API keys. Keys are encrypted with AES-256-GCM and never exposed in plaintext.
            </p>
          </div>
        </div>

        {atLimit && (
          <div className="rounded-lg border border-amber-800 bg-amber-900/20 p-4 text-sm text-amber-300">
            You&apos;ve reached your plan limit of {limits.apiKeys} API keys.{" "}
            <a href="/billing" className="underline">Upgrade your plan</a> to add more.
          </div>
        )}

        <KeyList initialKeys={keys} atLimit={atLimit} />

        <ExcludedKeysPanel />
      </div>
    </div>
  );
}
