import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createPortalSession } from "@/lib/billing";

export async function POST() {
  try {
    const { orgId } = await requireAuth();
    const baseUrl = process.env.DASHBOARD_URL ?? `https://${process.env.VERCEL_URL}` ?? "http://localhost:3000";
    const url = await createPortalSession({ orgId, returnUrl: `${baseUrl}/billing` });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/billing/portal]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
