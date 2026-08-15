import "server-only";

/**
 * Server-only, provider-neutral AI service. Credentials never cross this
 * module and are never imported by client code.
 *
 * PROVIDER NEUTRALITY: any OpenAI-compatible vendor works through the four
 * runtime variables AI_PROVIDER / AI_API_KEY / AI_BASE_URL / AI_MODEL. No
 * vendor (Groq, OpenAI, OpenRouter, Together, DeepSeek, a self-hosted
 * vLLM/Ollama gateway, ...) is required or hard-coded, and there are no
 * built-in keys, endpoints, or model defaults anywhere in the codebase.
 */
export type AIWireFormat = "openai-compatible" | "anthropic";
export type AIProviderName = string;

export class AIProviderError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); this.name = "AIProviderError"; }
}

export interface AIConfig {
  /** Raw AI_PROVIDER value, normalized to lower case. Free-form by design. */
  provider: AIProviderName;
  /** Which HTTP dialect the provider speaks. Everything defaults to OpenAI. */
  wireFormat: AIWireFormat;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const REQUIRED_AI_ENV = ["AI_PROVIDER", "AI_API_KEY", "AI_BASE_URL", "AI_MODEL"] as const;

/**
 * Only Anthropic's Messages API needs a different request shape. Every other
 * provider name is treated as OpenAI-compatible, so adding a new vendor is an
 * environment change, never a code change.
 */
export function wireFormatFor(provider: string): AIWireFormat {
  const name = provider.trim().toLowerCase();
  return name === "anthropic" || name === "claude" ? "anthropic" : "openai-compatible";
}

/**
 * Read AI settings only at request time on the server. There are intentionally
 * no provider/model defaults: production must opt in explicitly and changing an
 * OpenAI-compatible vendor requires environment changes, not a code change.
 */
export function getAIConfig(): AIConfig {
  const missing = REQUIRED_AI_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new AIProviderError(
      `AI is not configured. Missing required server environment variable${missing.length > 1 ? "s" : ""}: ` +
        `${missing.join(", ")}. An administrator must set ${REQUIRED_AI_ENV.join(", ")} as server-side variables ` +
        `(Railway → service → Variables). Generation is blocked until then.`,
      503
    );
  }

  const provider = process.env.AI_PROVIDER!.trim().toLowerCase();

  let parsed: URL;
  try { parsed = new URL(process.env.AI_BASE_URL!.trim()); }
  catch { throw new AIProviderError("AI_BASE_URL must be a valid absolute URL, for example https://api.openai.com/v1", 503); }
  const localDevelopment = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(localDevelopment && parsed.protocol === "http:")) {
    throw new AIProviderError("AI_BASE_URL must use HTTPS in production.", 503);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new AIProviderError("AI_BASE_URL must not contain credentials, query parameters, or a fragment.", 503);
  }
  const baseUrl = parsed.toString().replace(/\/+$/, "");
  if (/\/(chat\/completions|completions|messages)$/i.test(baseUrl)) {
    throw new AIProviderError(
      "AI_BASE_URL must be the provider's API root (for example https://api.openai.com/v1), not the /chat/completions path.",
      503
    );
  }

  return {
    provider,
    wireFormat: wireFormatFor(provider),
    apiKey: process.env.AI_API_KEY!.trim(),
    baseUrl,
    model: process.env.AI_MODEL!.trim(),
  };
}

export function aiConfigured(): boolean { try { getAIConfig(); return true; } catch { return false; } }

/**
 * Fail loudly before any writing work begins. Ebook generation must never
 * degrade into empty or partially-written content just because the server is
 * missing its AI variables — the operator gets the exact variable names back.
 */
export function assertAIConfigured(context = "Ebook generation"): AIConfig {
  try {
    return getAIConfig();
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw new AIProviderError(`${context} is not configured. ${error.message}`, error.status);
    }
    throw error;
  }
}

/**
 * Non-secret configuration summary for /api/health and operator tooling.
 * Deliberately returns provider/model/endpoint routing metadata only — the API
 * key is never included, not even partially.
 */
export interface AIStatus {
  configured: boolean;
  provider?: string;
  wireFormat?: AIWireFormat;
  model?: string;
  endpoint?: string;
  missing?: string[];
  reason?: string;
}

export function getAIStatus(): AIStatus {
  const missing = REQUIRED_AI_ENV.filter((name) => !process.env[name]?.trim());
  try {
    const config = getAIConfig();
    return {
      configured: true,
      provider: config.provider,
      wireFormat: config.wireFormat,
      model: config.model,
      endpoint: new URL(config.baseUrl).origin,
    };
  } catch (error) {
    return {
      configured: false,
      missing: missing.length ? [...missing] : undefined,
      reason: error instanceof Error ? error.message : "AI is not configured.",
    };
  }
}

/**
 * One real, minimal request against the configured provider. Used by
 * /api/health?probe=ai and by the operator integration test so "configured"
 * can be upgraded to a verified "healthy".
 */
export async function pingAI(): Promise<{ ok: boolean; status: AIStatus; latencyMs: number; error?: string }> {
  const status = getAIStatus();
  const started = Date.now();
  if (!status.configured) {
    return { ok: false, status, latencyMs: 0, error: status.reason };
  }
  try {
    const reply = await chat(
      [
        { role: "system", content: "You are a health probe. Answer with a single word." },
        { role: "user", content: "Reply with the single word: ok" },
      ],
      { temperature: 0, maxTokens: 16, retries: 1 }
    );
    if (!reply.trim()) throw new AIProviderError("The configured AI provider returned empty content.");
    return { ok: true, status, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      status,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "AI provider unavailable.",
    };
  }
}

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }
export interface ChatOptions { temperature?: number; maxTokens?: number; retries?: number }

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  // Throws AIProviderError(503) with the exact missing variable names when the
  // server is not configured. Callers must never swallow this into empty text.
  const config = getAIConfig();
  const attempts = Math.max(1, opts.retries ?? 3);
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const value = config.wireFormat === "anthropic" ? await anthropicChat(config, messages, opts) : await compatibleChat(config, messages, opts);
      if (!value.trim()) throw new AIProviderError("The configured AI provider returned empty content.");
      return value;
    } catch (error) {
      lastError = error;
      if (error instanceof AIProviderError && error.status < 500) break;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** attempt));
    }
  }
  if (lastError instanceof AIProviderError) throw lastError;
  throw new AIProviderError("AI provider unavailable.");
}

function safeProviderDetail(raw: string, apiKey: string): string {
  // Never log or return authorization material, even if a provider reflects it.
  const withoutConfiguredKey = apiKey ? raw.split(apiKey).join("[redacted]") : raw;
  return withoutConfiguredKey
    .replace(/(?:bearer\s+)?(?:sk|key|token)[-_a-z0-9.]{8,}/gi, "[redacted]")
    .replace(/"?(?:api[_-]?key|authorization|token)"?\s*[:=]\s*"?[^"\s,}]+/gi, "credential=[redacted]")
    .slice(0, 300);
}

async function request(url: string, init: RequestInit, apiKey: string) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const response = await fetch(url, { ...init, signal: ctrl.signal });
    if (!response.ok) {
      const detail = safeProviderDetail(await response.text(), apiKey);
      throw new AIProviderError(`AI provider request failed (${response.status})${detail ? `: ${detail}` : ""}`, response.status >= 500 || response.status === 429 ? 502 : 400);
    }
    return response;
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    throw new AIProviderError(error instanceof Error && error.name === "AbortError" ? "AI provider timed out." : "Could not reach the configured AI provider.");
  } finally { clearTimeout(timer); }
}

async function compatibleChat(config: AIConfig, messages: ChatMessage[], opts: ChatOptions) {
  const res = await request(`${config.baseUrl}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, temperature: opts.temperature ?? 0.35, max_tokens: opts.maxTokens ?? 3500, messages }) }, config.apiKey);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content || "";
}
async function anthropicChat(config: AIConfig, messages: ChatMessage[], opts: ChatOptions) {
  const system = messages.find((m) => m.role === "system")?.content || "";
  const rest = messages.filter((m) => m.role !== "system");
  const res = await request(`${config.baseUrl}/messages`, { method: "POST", headers: { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, max_tokens: opts.maxTokens ?? 3500, temperature: opts.temperature ?? 0.35, system, messages: rest.map((m) => ({ role: m.role, content: m.content })) }) }, config.apiKey);
  const data = await res.json() as { content?: { text?: string }[] };
  return data.content?.map((c) => c.text || "").join("\n") || "";
}

export const RESEARCH_WRITER_SYSTEM = `You are an expert educational author writing original ebook chapters.
STRICT RULES:
- Use ONLY the provided research notes and numbered sources.
- Cite claims with [n] matching the provided source list. Never invent a source, URL, book, statistic, quote, or researcher.
- If a claim is not supported, write "Information could not be independently verified" or omit it.
- Do not reproduce copyrighted books. Write original explanations.
- Do not pad with repetition or generic filler.
- Preserve technical terminology.
- Write in the requested output language using correct Unicode text. If outputLanguage is hi, write Devanagari Hindi. English is allowed only for proper names, book titles, technical terms, URLs, and citations.
- Return clean Markdown with headings, lists, and tables when useful.
- Every factual paragraph should include at least one citation when a source exists.
- Never present an author's historical hypothesis as universally established fact.
- For every major historical claim, classify it in-text as one of: Primary-source evidence; Author's interpretation; Later scholarly interpretation; Contested/uncertain.
- Stay inside the requested ebook topic. Do not write a generic biography, complete-works survey, popular-culture chapter, or unrelated scientific material.`;
