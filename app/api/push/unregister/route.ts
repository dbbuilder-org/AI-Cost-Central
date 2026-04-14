/**
 * POST /api/push/unregister
 * Removes an Expo push token from Vercel KV.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { token } = await req.json() as { token?: string };
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return NextResponse.json({ removed: false, reason: "KV not configured" });
  }

  try {
    const { kv } = await import("@vercel/kv");
    await kv.srem("push:tokens", token);
    return NextResponse.json({ removed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "KV error";
    return NextResponse.json({ removed: false, reason: msg }, { status: 500 });
  }
}
