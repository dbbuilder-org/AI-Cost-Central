import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, audit } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { orgId, userId } = await requireAuth();
    await requireRole(orgId, userId, "admin");

    const { email, role = "viewer" } = await req.json() as { email: string; role?: string };

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    if (!["admin", "viewer"].includes(role)) {
      return NextResponse.json({ error: "Invalid role. Use admin or viewer." }, { status: 400 });
    }

    const org = await db.query.organizations.findFirst({
      where: eq(schema.organizations.id, orgId),
      columns: { name: true },
    });

    // Insert invitation record (upsert on org+email)
    const [invitation] = await db.insert(schema.invitations).values({
      orgId,
      email,
      role,
    }).onConflictDoUpdate({
      target: [schema.invitations.orgId, schema.invitations.email],
      set: { role, status: "pending", expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    }).returning({ id: schema.invitations.id });

    // Send invite email
    const dashboardUrl = process.env.DASHBOARD_URL ?? "https://aicostcentral.vercel.app";
    await sendEmail({
      to: email,
      subject: `You've been invited to ${org?.name ?? "an organization"} on AICostCentral`,
      from: process.env.BRIEF_FROM ?? "noreply@servicevision.net",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a1a;">You're invited to ${org?.name ?? "an organization"}</h2>
          <p style="color: #555;">You've been invited to join <strong>${org?.name ?? "an organization"}</strong> on AICostCentral as a <strong>${role}</strong>.</p>
          <p style="margin-top: 24px;">
            <a href="${dashboardUrl}/sign-up" style="background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Accept Invitation
            </a>
          </p>
          <p style="color: #888; font-size: 12px; margin-top: 24px;">This invitation expires in 7 days.</p>
        </div>
      `,
    });

    await audit(orgId, null, "member.invited", "invitation", invitation.id, { email, role });

    return NextResponse.json({ invited: true, id: invitation.id });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/org/invitations]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
