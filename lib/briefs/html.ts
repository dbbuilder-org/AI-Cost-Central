/**
 * Shared HTML building blocks for brief emails.
 * All emails use the same dark theme.
 */

export const PROVIDER_BADGE: Record<string, { label: string; color: string }> = {
  openai:    { label: "OAI", color: "#818cf8" },
  anthropic: { label: "ANT", color: "#fb923c" },
  google:    { label: "GGL", color: "#34d399" },
};

export function providerBadge(provider: string): string {
  const p = PROVIDER_BADGE[provider];
  if (!p) return `<span style="color:#9ca3af">${provider}</span>`;
  return `<span style="background:${p.color}22;color:${p.color};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700">${p.label}</span>`;
}

export function changePill(pct: number): string {
  const up = pct >= 0;
  const color = up ? "#ef4444" : "#10b981";
  const bg = up ? "#450a0a" : "#052e16";
  const sign = up ? "▲" : "▼";
  return `<span style="background:${bg};color:${color};padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600">${sign} ${Math.abs(pct).toFixed(1)}%</span>`;
}

export function sectionHeader(title: string): string {
  return `<div style="padding:12px 16px;border-bottom:1px solid #1f2937">
    <span style="font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">${title}</span>
  </div>`;
}

export function card(content: string, style = ""): string {
  return `<div style="background:#111827;border:1px solid #1f2937;border-radius:10px;overflow:hidden;margin-bottom:16px;${style}">${content}</div>`;
}

export function metricCard(label: string, value: string, sub?: string): string {
  return `<div style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:14px;text-align:center;flex:1;min-width:110px">
    <div style="font-size:22px;font-weight:700;color:#fff">${value}</div>
    ${sub ? `<div style="font-size:11px;color:#6b7280;margin:2px 0">${sub}</div>` : ""}
    <div style="font-size:10px;color:#4b5563;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em">${label}</div>
  </div>`;
}

/** A simple bar — width is a % of the max, drawn as a colored inline block. */
export function miniBar(pct: number, color: string): string {
  const w = Math.max(2, Math.round(pct));
  return `<div style="background:${color}33;border-radius:2px;height:6px;width:100%;margin-top:4px">
    <div style="background:${color};border-radius:2px;height:6px;width:${w}%"></div>
  </div>`;
}

export function htmlShell(title: string, body: string, footerUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#030712;font-family:system-ui,-apple-system,sans-serif;color:#f9fafb">
  <div style="max-width:680px;margin:0 auto;padding:24px">
    ${body}
    <div style="text-align:center;color:#374151;font-size:11px;margin-top:20px">
      AICostCentral · <a href="${footerUrl}" style="color:#4f46e5;text-decoration:none">Open Dashboard</a>
      · <a href="${footerUrl}/settings" style="color:#4f46e5;text-decoration:none">Manage subscriptions</a>
    </div>
  </div>
</body>
</html>`;
}

export function emailHeader(label: string, subtitle: string): string {
  const now = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  return `<div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:18px 22px;margin-bottom:18px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <span style="font-size:17px;font-weight:700;color:#fff">AICostCentral</span>
        <span style="margin-left:8px;background:#312e81;color:#a5b4fc;font-size:11px;padding:2px 8px;border-radius:4px">${label}</span>
      </div>
      <span style="color:#6b7280;font-size:12px">${now}</span>
    </div>
    <div style="color:#6b7280;font-size:12px;margin-top:6px">${subtitle}</div>
  </div>`;
}
