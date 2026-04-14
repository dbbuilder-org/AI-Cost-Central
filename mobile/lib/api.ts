/**
 * API client for the AICostCentral backend.
 * All requests go through the configured apiBaseUrl.
 */

import type { DashboardSummary, MobileAlert, ApiKey } from "@/types";

let _baseUrl = "";

export function setApiBaseUrl(url: string) {
  _baseUrl = url.replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  return _baseUrl;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  if (!_baseUrl) throw new Error("API base URL not configured. Please set it in Settings.");
  const url = `${_baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSummary(days: number = 28): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>(`/api/dashboard/summary?days=${days}`);
}

export async function fetchAlerts(): Promise<MobileAlert[]> {
  return apiFetch<MobileAlert[]>("/api/alerts");
}

export async function fetchKeys(): Promise<ApiKey[]> {
  return apiFetch<ApiKey[]>("/api/keys/all");
}

export async function registerPushToken(token: string): Promise<void> {
  await apiFetch<{ stored: boolean }>("/api/push/register", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await apiFetch<{ removed: boolean }>("/api/push/unregister", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
