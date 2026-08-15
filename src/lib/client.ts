export const CREATE_DRAFT_KEY = "folio:simple-create-draft";

/** Recover the optional create-form draft into the authenticated database account. */
export async function claimLocalCreateDraft() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(CREATE_DRAFT_KEY);
  if (!raw) return null;
  let stored: any;
  try { stored = JSON.parse(raw); } catch { return null; }
  const settings = stored?.settings || stored;
  if (typeof settings?.topic !== "string" || settings.topic.trim().length < 3) return null;
  const draft = stored?.settings
    ? stored
    : {
        id: `local_${crypto.randomUUID().replace(/-/g, "")}`,
        updatedAt: new Date().toISOString(),
        settings,
      };
  // Upgrade old settings-only drafts before the request. A retry after a lost
  // response therefore carries the same permanent ID and cannot duplicate.
  localStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(draft));
  const result = await api<{ ebook: { id: string }; created: boolean }>("/api/ebooks/claim", {
    method: "POST",
    body: JSON.stringify({ draft }),
  });
  localStorage.removeItem(CREATE_DRAFT_KEY);
  return result;
}

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
