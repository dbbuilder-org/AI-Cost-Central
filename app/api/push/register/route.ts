/**
 * POST /api/push/register
 * Stores an Expo push token in Vercel KV for later use by the alert cron.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { token } = await req.json() as { token?: string };
  if (!token || !token.startsWith("ExponentPushToken[")) {
    return NextResponse.json({ error: "Invalid Expo push token" }, { status: 400 });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return NextResponse.json({ stored: false, reason: "KV not configured" });
  }

  try {
    const { kv } = await import("@vercel/kv");
    await kv.sadd("push:tokens", token);
    return NextResponse.json({ stored: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "KV error";
    return NextResponse.json({ stored: false, reason: msg }, { status: 500 });
  }
}
