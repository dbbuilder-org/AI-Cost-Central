import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { MembersClient } from "@/components/settings/MembersClient";

export default async function MembersPage() {
  const { orgId } = await requireAuth();

  const [members, invitations] = await Promise.all([
    db.query.orgMembers.findMany({
      where: eq(schema.orgMembers.orgId, orgId),
      columns: { id: true, email: true, fullName: true, role: true, status: true, joinedAt: true },
      orderBy: (m, { asc }) => [asc(m.joinedAt)],
    }),
    db.query.invitations.findMany({
      where: eq(schema.invitations.orgId, orgId),
      columns: { id: true, email: true, role: true, status: true, expiresAt: true },
    }),
  ]);

  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Team Members</h1>
          <p className="text-gray-400 mt-1 text-sm">Invite team members and manage their roles</p>
        </div>
        <MembersClient initialMembers={members} initialInvitations={invitations} />
      </div>
    </div>
  );
}
