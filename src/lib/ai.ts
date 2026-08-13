/**
 * Optional LLM client. Research always happens independently.
 * When no key is configured, callers must synthesize from sources only.
 */

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<string | null> {
  const key = process.env.AI_API_KEY;
  if (!key) return null;
  try {
    if (key.startsWith("sk-ant")) return anthropicChat(key, messages, opts);
    return openAiChat(key, messages, opts);
  } catch (e) {
    console.error("AI chat failed", e);
    return null;
  }
}

async function openAiChat(key: string, messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number }) {
  const base = (process.env.AI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000);
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: ctrl.signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: opts.temperature ?? 0.35,
      max_tokens: opts.maxTokens ?? 3500,
      messages,
    }),
  });
  clearTimeout(t);
  if (!res.ok) {
    const err = await res.text();
    console.error("OpenAI error", res.status, err.slice(0, 400));
    return null;
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content || null;
}

async function anthropicChat(key: string, messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number }) {
  const system = messages.find((m) => m.role === "system")?.content || "";
  const rest = messages.filter((m) => m.role !== "system");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: ctrl.signal,
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "claude-3-5-sonnet-latest",
      max_tokens: opts.maxTokens ?? 3500,
      temperature: opts.temperature ?? 0.35,
      system,
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  clearTimeout(t);
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: { text?: string }[] };
  return data.content?.map((c) => c.text || "").join("\n") || null;
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
