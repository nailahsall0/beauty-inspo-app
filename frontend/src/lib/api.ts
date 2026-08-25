import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API = `${BASE}/api`;
export const TOKEN_KEY = "brookie_token";

// Resolve a media url that may be a relative /api/files/... path or an absolute url.
export function mediaUrl(url?: string | null): string | undefined {
  // Handle null, undefined, and empty strings
  if (!url || url.trim() === "") return undefined;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/api")) return `${BASE}${url}`;
  // Handle S3/R2 bucket paths that might not have http prefix
  if (url.startsWith("/")) return `${BASE}${url}`;
  return url;
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await storage.secureGet(TOKEN_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type Options = { method?: string; body?: any; auth?: boolean };

export async function apiFetch<T = any>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) Object.assign(headers, await authHeader());
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data && data.detail ? data.detail : `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }
  return data as T;
}

// Multipart upload of a picked media asset. Returns { url, type }.
export async function uploadMedia(uri: string, name: string, type: string): Promise<{ url: string; type: string }> {
  const token = await storage.secureGet(TOKEN_KEY, "");
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type } as any);
  }

  // Use AbortController for timeout (2 minutes for large videos)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(`${API}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Upload failed: ${res.status}`);
    }
    return res.json();
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      throw new Error("Upload timed out - video may be too large");
    }
    throw e;
  }
}
