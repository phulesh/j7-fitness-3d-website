export async function ensureSession() {
  const me = await fetch("/api/auth/me").then((r) => r.json());
  if (me.user) return me.user;
  const guest = await fetch("/api/auth/guest", { method: "POST" }).then((r) => r.json());
  return guest.user;
}

import { friendlyError } from "./errors";

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch (e: any) {
    throw new Error(friendlyError({ message: e?.message || "network" }));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(friendlyError({ status: res.status, message: data.error || `Request failed (${res.status})` }));
  }
  return data as T;
}
