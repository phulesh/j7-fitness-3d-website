import { nanoid } from "nanoid";

export function newRequestId() {
  return nanoid(12);
}

export function friendlyError(input: { status?: number; message?: string; code?: string } | string | unknown): string {
  const status = typeof input === "object" && input && "status" in input ? Number((input as any).status) : 0;
  const raw = typeof input === "string" ? input : (input as any)?.message || "";
  const message = String(raw || "");

  // Server misconfiguration must stay verbatim. Collapsing it into a generic
  // "temporarily unavailable, please retry" would hide the real cause and make
  // a missing AI key look like a transient blip the user can retry away.
  if (/\bAI (is|generation is) not configured\b|Missing required server environment variable|AI_PROVIDER, AI_API_KEY, AI_BASE_URL, AI_MODEL/i.test(message)) {
    return message;
  }

  if (status === 502 || status === 503 || status === 504 || /502|503|504|bad gateway|gateway timeout/i.test(message)) {
    return "Research service temporarily unavailable. Your ebook data has been saved. Please retry.";
  }
  if (status === 429 || /too many requests|rate limit/i.test(message)) {
    return "Too many requests right now. Your ebook has been saved. Please wait a moment and retry.";
  }
  if (status === 401 || /sign in|unauthorized/i.test(message)) {
    return "Please sign in to continue. Ebooks saved to your account will be restored after you sign in.";
  }
  if (status === 404 || /not found/i.test(message)) {
    return "That ebook could not be found. Open My Ebooks and select the volume again.";
  }
  if (status === 409) {
    return message || "This ebook is already being processed. Your data has been saved.";
  }
  if (/failed to fetch|network|econnreset|enotfound|timeout|aborted/i.test(message)) {
    return "Network connection was interrupted. Your ebook data has been saved. Please retry.";
  }
  if (/request failed \(\d+\)/i.test(message)) {
    return "A service was briefly unavailable. Your ebook data has been saved. Please retry.";
  }
  return message || "Something went wrong. Your ebook data has been saved. Please retry.";
}

export function jsonWithId<T extends Record<string, unknown>>(data: T, status = 200) {
  return {
    body: { requestId: newRequestId(), ...data },
    status,
  };
}
