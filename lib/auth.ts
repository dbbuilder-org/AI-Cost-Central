/**
 * Auth helpers for route handlers and server components.
 * All server-side access control goes through these functions.
 */

import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export type AppRole = "owner" | "admin" | "viewer";

const ROLE_RANK: Record<AppRole, number> = {
  viewer: 0,
  admin: 1,
  owner: 2,
};

export interface AuthContext {
  userId: string;
  orgId: string;
}

/**
 * Require that the request is authenticated with both a user and an org.
 * Throws a Response (401) if either is missing — use in Route Handlers.
 */
export async function requireAuth(): Promise<AuthContext> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return { userId, orgId };
}

/**
 * Require a minimum role. Reads role from org_members table (not Clerk JWT).
 * Throws 403 if the member's role is below the required minimum.
 */
export async function requireRole(
  orgId: string,
  clerkUserId: string,
  minRole: AppRole
): Promise<void> {
  const member = await db.query.orgMembers.findFirst({
    where: and(
      eq(schema.orgMembers.orgId, orgId),
      eq(schema.orgMembers.clerkUserId, clerkUserId),
      eq(schema.orgMembers.status, "active")
    ),
    columns: { role: true },
  });

  if (!member) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const memberRank = ROLE_RANK[member.role as AppRole] ?? -1;
  const requiredRank = ROLE_RANK[minRole];

  if (memberRank < requiredRank) {
    throw new Response(JSON.stringify({ error: "Forbidden", required: minRole }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Combined auth + role check. Use in most mutating route handlers.
 */
export async function requireAuthAndRole(
  minRole: AppRole
): Promise<AuthContext> {
  const ctx = await requireAuth();
  await requireRole(ctx.orgId, ctx.userId, minRole);
  return ctx;
}

/**
 * Get the org member record for the current user. Returns null if not a member.
 */
export async function getOrgMember(
  orgId: string,
  clerkUserId: string
) {
  return db.query.orgMembers.findFirst({
    where: and(
      eq(schema.orgMembers.orgId, orgId),
      eq(schema.orgMembers.clerkUserId, clerkUserId)
    ),
  });
}

/**
 * Write an audit log entry. Fire-and-forget — failures are logged but not thrown.
 */
export async function audit(
  orgId: string,
  actorId: string | null,
  action: string,
  resourceType?: string,
  resourceId?: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string
): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({
      orgId,
      actorId: actorId as string | undefined,
      action,
      resourceType,
      resourceId,
      metadata: metadata ?? {},
      ipAddress,
    });
  } catch (err) {
    console.error("[audit] failed to write audit log entry:", err);
  }
}
