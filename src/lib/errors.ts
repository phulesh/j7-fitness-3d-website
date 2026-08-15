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

  // AI provider specific errors - keep these detailed
  if (/AI provider request failed/i.test(message)) {
    // Extract the specific error details
    const match = message.match(/AI provider request failed \((\d+)\): ([^:]+)(?:: (.*))?/);
    if (match) {
      const statusCode = match[1];
      const statusText = match[2];
      const detail = match[3] || "";
      
      if (statusCode === "401" || statusText.toLowerCase().includes("unauthorized")) {
        return "AI provider authentication failed. Check that your AI_API_KEY is valid for the configured provider.";
      }
      if (statusCode === "404" || statusText.toLowerCase().includes("not found")) {
        return `AI provider endpoint not found. Check that AI_MODEL (${detail || statusText}) is valid for your provider.`;
      }
      if (statusCode === "429" || statusText.toLowerCase().includes("rate limit") || statusText.toLowerCase().includes("too many")) {
        return "AI provider rate limit exceeded. Your ebook data has been saved. Please wait and retry.";
      }
      if (statusCode === "502" || statusCode === "503" || statusCode === "504") {
        return `AI provider temporarily unavailable (${statusText}). Your ebook data has been saved. Please retry.`;
      }
      return `AI provider error (${statusCode}: ${statusText}). Your ebook data has been saved. Please check the server logs.`;
    }
    return message; // Return the full message if we can't parse it
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
  if (/AI provider timed out/i.test(message)) {
    return "AI provider request timed out. Your ebook data has been saved. Please retry.";
  }
  if (/Could not reach the configured AI provider/i.test(message)) {
    return "Could not reach the AI provider. Check that AI_BASE_URL is correct and the service is running. Your ebook data has been saved.";
  }
  if (/The configured AI provider returned empty content/i.test(message)) {
    return "AI provider returned empty response. Check that AI_MODEL is valid and the provider is working. Your ebook data has been saved.";
  }
  return message || "Something went wrong. Your ebook data has been saved. Please retry.";
}

export function jsonWithId<T extends Record<string, unknown>>(data: T, status = 200) {
  return {
    body: { requestId: newRequestId(), ...data },
    status,
  };
}
