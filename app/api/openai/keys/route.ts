import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-openai-admin-key") ?? process.env.OPENAI_ADMIN_KEY;
  if (!key) return NextResponse.json({ error: "No API key provided" }, { status: 401 });

  try {
    const res = await fetch("https://api.openai.com/v1/organization/api_keys?limit=100", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `OpenAI API error ${res.status}`);
    }
    const data = await res.json();
    const keys = (data.data ?? []).map((k: { id: string; name: string; created_at: number }) => ({
      id: k.id,
      name: k.name,
      createdAt: new Date(k.created_at * 1000).toISOString().slice(0, 10),
    }));
    return NextResponse.json(keys);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
