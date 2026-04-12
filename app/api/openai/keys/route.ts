import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.openai.com/v1/organization";

export async function GET(req: NextRequest) {
  const key = process.env.OPENAI_ADMIN_KEY ?? req.headers.get("x-openai-admin-key");
  if (!key) return NextResponse.json({ error: "No API key provided" }, { status: 401 });

  try {
    // List projects, then collect keys per project
    const projectsRes = await fetch(`${BASE}/projects?limit=100`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!projectsRes.ok) {
      const body = await projectsRes.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `OpenAI API error ${projectsRes.status}`);
    }
    const projectsData = await projectsRes.json();
    const projects: { id: string; name: string }[] = projectsData.data ?? [];

    const allKeys: { id: string; name: string; project: string; createdAt: string }[] = [];
    await Promise.all(
      projects.map(async (proj) => {
        const res = await fetch(`${BASE}/projects/${proj.id}/api_keys?limit=100`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) return;
        const d = await res.json();
        for (const k of (d.data ?? []) as { id: string; name: string; created_at: number }[]) {
          allKeys.push({
            id: k.id,
            name: k.name,
            project: proj.name,
            createdAt: new Date(k.created_at * 1000).toISOString().slice(0, 10),
          });
        }
      })
    );

    return NextResponse.json(allKeys);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
