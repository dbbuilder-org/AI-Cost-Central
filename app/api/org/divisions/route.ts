import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, audit } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq, count, and } from "drizzle-orm";
import { getOrgPlanLimits } from "@/lib/plans";

export async function GET() {
  try {
    const { orgId } = await requireAuth();

    const divisions = await db.query.divisions.findMany({
      where: eq(schema.divisions.orgId, orgId),
      orderBy: (d, { asc }) => [asc(d.name)],
    });

    return NextResponse.json({ divisions });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");

    const { name, description, budgetUsd, parentId } = await req.json() as {
      name: string;
      description?: string;
      budgetUsd?: number;
      parentId?: string;
    };

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // Enforce division limit per plan
    const [limits, divCountResult] = await Promise.all([
      getOrgPlanLimits(orgId),
      db.select({ count: count() }).from(schema.divisions).where(eq(schema.divisions.orgId, orgId)),
    ]);

    if ((divCountResult[0]?.count ?? 0) >= limits.divisions) {
      return NextResponse.json(
        { error: "Division limit reached for your plan. Upgrade to add more.", code: "LIMIT_DIVISIONS" },
        { status: 403 }
      );
    }

    const [division] = await db.insert(schema.divisions).values({
      orgId,
      name,
      description,
      budgetUsd: budgetUsd?.toString(),
      parentId,
    }).returning();

    await audit(orgId, null, "division.created", "division", division.id, { name });

    return NextResponse.json({ division }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/org/divisions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
