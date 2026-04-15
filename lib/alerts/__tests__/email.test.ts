import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Alert } from "@/types/alerts";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/briefs/config", () => ({
  loadBriefConfig: vi.fn(() => ({
    recipients: ["ops@example.com"],
    from: "noreply@servicevision.net",
    dashboardUrl: "https://ai-cost-central.vercel.app",
  })),
}));

import { renderAlertEmail, sendAlertEmail } from "@/lib/alerts/email";
import { sendEmail } from "@/lib/email";
import { loadBriefConfig } from "@/lib/briefs/config";

const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;
const mockLoadConfig = loadBriefConfig as ReturnType<typeof vi.fn>;

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "alert_001",
    type: "cost_spike",
    severity: "warning",
    provider: "openai",
    subject: "gpt-4o",
    message: "gpt-4o cost spiked to $50.00 (+900% vs $5.00 baseline)",
    detail: "The daily cost reached an unusually high level.",
    investigateSteps: ["Check recent deployments", "Review API key usage", "Set budget alerts"],
    value: 50,
    baseline: 5,
    changePct: 900,
    detectedAt: "2026-04-15",
    ...overrides,
  };
}

beforeEach(() => {
  mockSendEmail.mockReset();
  mockLoadConfig.mockReturnValue({
    recipients: ["ops@example.com"],
    from: "noreply@servicevision.net",
    dashboardUrl: "https://ai-cost-central.vercel.app",
  });
});

// ── renderAlertEmail ─────────────────────────────────────────────────────────

describe("renderAlertEmail", () => {
  it("returns a valid HTML string", () => {
    const html = renderAlertEmail([makeAlert()]);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<body");
    expect(html).toContain("</html>");
  });

  it("includes alert subject in output", () => {
    const html = renderAlertEmail([makeAlert({ subject: "gpt-4o-mini" })]);
    expect(html).toContain("gpt-4o-mini");
  });

  it("includes alert message in output", () => {
    const html = renderAlertEmail([makeAlert()]);
    expect(html).toContain("spiked");
  });

  it("shows critical count correctly", () => {
    const alerts = [
      makeAlert({ severity: "critical" }),
      makeAlert({ severity: "critical", subject: "claude-opus-4-6" }),
      makeAlert({ severity: "warning" }),
    ];
    const html = renderAlertEmail(alerts);
    // Critical count = 2
    expect(html).toMatch(/>2</);
  });

  it("sorts alerts critical-first", () => {
    const alerts = [
      makeAlert({ severity: "info", subject: "info-model" }),
      makeAlert({ severity: "critical", subject: "critical-model" }),
      makeAlert({ severity: "warning", subject: "warning-model" }),
    ];
    const html = renderAlertEmail(alerts);
    const criticalIdx = html.indexOf("critical-model");
    const warningIdx = html.indexOf("warning-model");
    const infoIdx = html.indexOf("info-model");
    expect(criticalIdx).toBeLessThan(warningIdx);
    expect(warningIdx).toBeLessThan(infoIdx);
  });

  it("includes investigate steps", () => {
    const html = renderAlertEmail([makeAlert()]);
    expect(html).toContain("Check recent deployments");
    expect(html).toContain("Review API key usage");
  });

  it("renders provider badge for openai", () => {
    const html = renderAlertEmail([makeAlert({ provider: "openai" })]);
    expect(html).toContain("OAI");
  });

  it("renders provider badge for anthropic", () => {
    const html = renderAlertEmail([makeAlert({ provider: "anthropic" })]);
    expect(html).toContain("ANT");
  });

  it("renders provider badge for google", () => {
    const html = renderAlertEmail([makeAlert({ provider: "google" })]);
    expect(html).toContain("GGL");
  });

  it("includes dashboard link", () => {
    const html = renderAlertEmail([makeAlert()], "https://custom-dashboard.com");
    expect(html).toContain("https://custom-dashboard.com");
  });

  it("handles multiple alerts without error", () => {
    const alerts = Array.from({ length: 10 }, (_, i) =>
      makeAlert({ subject: `model-${i}`, type: i % 2 === 0 ? "cost_spike" : "volume_spike" })
    );
    expect(() => renderAlertEmail(alerts)).not.toThrow();
  });

  it("includes change percentage", () => {
    const html = renderAlertEmail([makeAlert({ changePct: 150 })]);
    expect(html).toContain("+150%");
  });

  it("shows negative change percentage for drops", () => {
    const html = renderAlertEmail([makeAlert({ type: "cost_drop", changePct: -80 })]);
    expect(html).toContain("-80%");
  });
});

// ── sendAlertEmail ───────────────────────────────────────────────────────────

describe("sendAlertEmail", () => {
  it("calls sendEmail with correct recipients", async () => {
    mockSendEmail.mockResolvedValue({ sent: true, recipientCount: 1 });
    await sendAlertEmail([makeAlert()]);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["ops@example.com"] })
    );
  });

  it("uses critical subject line for critical alerts", async () => {
    mockSendEmail.mockResolvedValue({ sent: true });
    await sendAlertEmail([makeAlert({ severity: "critical" })]);
    const [call] = mockSendEmail.mock.calls;
    expect(call[0].subject).toContain("critical");
  });

  it("uses warning subject line when no critical alerts", async () => {
    mockSendEmail.mockResolvedValue({ sent: true });
    await sendAlertEmail([makeAlert({ severity: "warning" })]);
    const [call] = mockSendEmail.mock.calls;
    expect(call[0].subject).toMatch(/warning|anomal/i);
  });

  it("returns {sent:false} when no recipients configured", async () => {
    mockLoadConfig.mockReturnValue({
      recipients: [],
      from: "noreply@servicevision.net",
      dashboardUrl: "https://ai-cost-central.vercel.app",
    });
    const result = await sendAlertEmail([makeAlert()]);
    expect(result.sent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("passes HTML body to sendEmail", async () => {
    mockSendEmail.mockResolvedValue({ sent: true });
    await sendAlertEmail([makeAlert()]);
    const [call] = mockSendEmail.mock.calls;
    expect(call[0].html).toContain("<!DOCTYPE html>");
  });

  it("returns sendEmail result directly", async () => {
    mockSendEmail.mockResolvedValue({ sent: true, recipientCount: 2 });
    const result = await sendAlertEmail([makeAlert()]);
    expect(result.sent).toBe(true);
  });
});
