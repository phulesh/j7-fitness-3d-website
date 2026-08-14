import "server-only";

/** Server-only, provider-neutral AI service. Credentials never cross this module. */
export type AIProviderName = "openai-compatible" | "openai" | "anthropic";

export class AIProviderError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); this.name = "AIProviderError"; }
}

export interface AIConfig { provider: AIProviderName; apiKey: string; baseUrl: string; model: string; }

const REQUIRED_AI_ENV = ["AI_PROVIDER", "AI_API_KEY", "AI_BASE_URL", "AI_MODEL"] as const;

/**
 * Read AI settings only at request time on the server. There are intentionally
 * no provider/model defaults: production must opt in explicitly and changing an
 * OpenAI-compatible vendor requires environment changes, not a code change.
 */
export function getAIConfig(): AIConfig {
  const missing = REQUIRED_AI_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new AIProviderError(
      `AI is not configured. An administrator must set ${REQUIRED_AI_ENV.join(", ")} on the server.`,
      503
    );
  }

  const provider = process.env.AI_PROVIDER!.trim().toLowerCase() as AIProviderName;
  if (!["openai-compatible", "openai", "anthropic"].includes(provider)) {
    throw new AIProviderError(`Unsupported AI_PROVIDER: ${provider}`, 503);
  }

  let parsed: URL;
  try { parsed = new URL(process.env.AI_BASE_URL!.trim()); }
  catch { throw new AIProviderError("AI_BASE_URL must be a valid absolute URL.", 503); }
  const localDevelopment = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(localDevelopment && parsed.protocol === "http:")) {
    throw new AIProviderError("AI_BASE_URL must use HTTPS in production.", 503);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new AIProviderError("AI_BASE_URL must not contain credentials, query parameters, or a fragment.", 503);
  }

  return {
    provider,
    apiKey: process.env.AI_API_KEY!.trim(),
    baseUrl: parsed.toString().replace(/\/$/, ""),
    model: process.env.AI_MODEL!.trim(),
  };
}

export function aiConfigured(): boolean { try { getAIConfig(); return true; } catch { return false; } }

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }
export async function chat(messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
  const config = getAIConfig();
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const value = config.provider === "anthropic" ? await anthropicChat(config, messages, opts) : await compatibleChat(config, messages, opts);
      if (!value.trim()) throw new AIProviderError("The configured AI provider returned empty content.");
      return value;
    } catch (error) {
      lastError = error;
      if (error instanceof AIProviderError && error.status < 500) break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** attempt));
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

async function compatibleChat(config: AIConfig, messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number }) {
  const res = await request(`${config.baseUrl}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, temperature: opts.temperature ?? 0.35, max_tokens: opts.maxTokens ?? 3500, messages }) }, config.apiKey);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content || "";
}
async function anthropicChat(config: AIConfig, messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number }) {
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
