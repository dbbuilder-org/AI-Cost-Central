/**
 * POST /api/push/register
 *
 * Stores an Expo push token (and optional phone/platform) in the device_tokens table.
 * Body: { token: string, phone?: string, platform?: "ios" | "android",
 *          notifyOnCritical?: boolean, notifyOnWarning?: boolean, notifyOnInfo?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    token?: string;
    phone?: string;
    platform?: string;
    notifyOnCritical?: boolean;
    notifyOnWarning?: boolean;
    notifyOnInfo?: boolean;
  };

  const { token, phone, platform, notifyOnCritical, notifyOnWarning, notifyOnInfo } = body;

  if (!token || !token.startsWith("ExponentPushToken[")) {
    return NextResponse.json({ error: "Invalid Expo push token" }, { status: 400 });
  }

  try {
    await db
      .insert(schema.deviceTokens)
      .values({
        token,
        platform: platform ?? null,
        phone: phone ?? null,
        notifyOnCritical: notifyOnCritical ?? true,
        notifyOnWarning: notifyOnWarning ?? true,
        notifyOnInfo: notifyOnInfo ?? false,
      })
      .onConflictDoUpdate({
        target: schema.deviceTokens.token,
        set: {
          platform: platform ?? null,
          phone: phone ?? null,
          notifyOnCritical: notifyOnCritical ?? true,
          notifyOnWarning: notifyOnWarning ?? true,
          notifyOnInfo: notifyOnInfo ?? false,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ stored: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    console.error("[push/register]", err);
    return NextResponse.json({ stored: false, reason: msg }, { status: 500 });
  }
}
