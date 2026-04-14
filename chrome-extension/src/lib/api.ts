import type { ApiKey, Alert } from "../types/index.js";

export async function fetchKeys(baseUrl: string): Promise<ApiKey[]> {
  try {
    const url = `${baseUrl}/api/keys`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      console.error(`fetchKeys: HTTP ${res.status} from ${url}`);
      return [];
    }

    const data = await res.json() as unknown;
    if (Array.isArray(data)) {
      return data as ApiKey[];
    }
    // Handle wrapped response
    const wrapped = data as Record<string, unknown>;
    if (Array.isArray(wrapped["keys"])) {
      return wrapped["keys"] as ApiKey[];
    }

    return [];
  } catch (err) {
    console.error("fetchKeys error:", err);
    return [];
  }
}

export async function fetchAlerts(baseUrl: string): Promise<Alert[]> {
  try {
    const url = `${baseUrl}/api/alerts`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      console.error(`fetchAlerts: HTTP ${res.status} from ${url}`);
      return [];
    }

    const data = await res.json() as unknown;
    if (Array.isArray(data)) {
      return data as Alert[];
    }
    const wrapped = data as Record<string, unknown>;
    if (Array.isArray(wrapped["alerts"])) {
      return wrapped["alerts"] as Alert[];
    }

    return [];
  } catch (err) {
    console.error("fetchAlerts error:", err);
    return [];
  }
}
