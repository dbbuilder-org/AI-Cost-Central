/**
 * POST /api/push/unregister
 * Removes an Expo push token from the device_tokens table.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json() as { token?: string };
  const { token } = body;

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  try {
    await db.delete(schema.deviceTokens).where(eq(schema.deviceTokens.token, token));
    return NextResponse.json({ removed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    console.error("[push/unregister]", err);
    return NextResponse.json({ removed: false, reason: msg }, { status: 500 });
  }
}
