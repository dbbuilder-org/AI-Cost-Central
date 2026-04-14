import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createCheckoutSession } from "@/lib/billing";

export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireAuth();
    const { priceId } = await req.json() as { priceId: string };

    if (!priceId) {
      return NextResponse.json({ error: "priceId is required" }, { status: 400 });
    }

    const baseUrl = process.env.DASHBOARD_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const url = await createCheckoutSession({
      orgId,
      priceId,
      successUrl: `${baseUrl}/billing?success=1`,
      cancelUrl: `${baseUrl}/billing`,
    });

    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/billing/checkout]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
