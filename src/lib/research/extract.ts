import * as cheerio from "cheerio";
import { fetchText, stripTags, normalizeSpace, domainOf } from "../http";

const BLOCKED_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".mp4", ".zip", ".exe", ".dmg"];

export async function extractReadable(url: string): Promise<{ text: string; title: string } | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  const lower = url.toLowerCase();
  if (BLOCKED_EXT.some((e) => lower.endsWith(e))) return null;
  const r = await fetchText(url, { timeoutMs: 10000, retries: 1 });
  if (!r.ok || r.text.length < 200) return null;
  if (r.text.trim().startsWith("{") || r.text.trim().startsWith("[")) {
    return { title: domainOf(url), text: r.text.slice(0, 8000) };
  }
  try {
    const $ = cheerio.load(r.text);
    $("script, style, nav, footer, header, iframe, noscript, svg, form, aside").remove();
    const title = $("title").first().text().trim() || $("h1").first().text().trim();
    const article = $("article, main, #mw-content-text, .mw-parser-output, .post-content, .entry-content").first();
    const root = article.length ? article : $("body");
    const paras: string[] = [];
    root.find("p, h1, h2, h3, li").each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (t.length > 40) paras.push(t);
    });
    let text = paras.join("\n\n");
    if (text.length < 200) text = stripTags(root.text());
    text = normalizeSpace(text).slice(0, 14000);
    if (text.length < 160) return null;
    return { title: title.slice(0, 200), text };
  } catch {
    return null;
  }
}

export function extractFactsFromText(
  text: string,
  sourceId: number
): { text: string; category: "definition" | "date" | "statistic" | "event" | "concept" | "process" | "quote" | "other"; entities: string[] }[] {
  const sentences = splitSentences(text).filter((s) => s.length > 40 && s.length < 420);
  const facts: {
    text: string;
    category: "definition" | "date" | "statistic" | "event" | "concept" | "process" | "quote" | "other";
    entities: string[];
  }[] = [];

  for (const s of sentences.slice(0, 80)) {
    const category = classify(s);
    if (category === "other" && !/[A-Z][a-z]{2,}/.test(s) && !/\d/.test(s)) continue;
    facts.push({
      text: s,
      category,
      entities: extractEntities(s),
    });
  }
  return facts.map((f) => ({ ...f, sourceId } as typeof f));
}

function classify(s: string): "definition" | "date" | "statistic" | "event" | "concept" | "process" | "quote" | "other" {
  if (/^["“]/.test(s) || / according to | stated that /i.test(s)) return "quote";
  if (/\b(is a|is an|refers to|is defined as|means|denotes)\b/i.test(s)) return "definition";
  if (/\b(19|20)\d{2}\b/.test(s) && /\b(on|in|since|during|founded|established|enacted|born|died|launched)\b/i.test(s))
    return "date";
  if (/\b\d+(\.\d+)?\s?(%|percent|million|billion|km|kg)\b/i.test(s)) return "statistic";
  if (/\b(first|then|step|process|algorithm|method|procedure)\b/i.test(s)) return "process";
  if (/\b(war|battle|treaty|revolution|election|independence|constitution)\b/i.test(s)) return "event";
  if (/\b(theory|principle|law of|concept|model|framework)\b/i.test(s)) return "concept";
  return "other";
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.?!।])\s+(?=[A-ZА-Я\u0900-\u0D7F\u0600-\u06FF])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractEntities(s: string): string[] {
  const set = new Set<string>();
  const re = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (!STOP_ENT.has(m[1])) set.add(m[1]);
  }
  return [...set].slice(0, 8);
}

const STOP_ENT = new Set([
  "The",
  "This",
  "That",
  "These",
  "Those",
  "There",
  "Then",
  "After",
  "Before",
  "When",
  "Where",
  "However",
  "Therefore",
  "According",
  "In",
  "On",
  "At",
  "For",
  "And",
  "But",
]);

export function extractKeyTerms(text: string, limit = 24): string[] {
  const freq = new Map<string, number>();
  const words = text.toLowerCase().match(/[\p{L}\p{M}]{4,}/gu) || [];
  for (const w of words) {
    if (STOP.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

const STOP = new Set(
  "this that with from they have been were their which would about after before into over such also more most some only other than then them when were will what your been being each through during including without within under again further because until while these those could should shall might must onto across among against between using used use also both same just very still already often never always many much few several first second third".split(
    " "
  )
);

export function crossCheckFacts(
  facts: { id: string; text: string; sourceIds: number[] }[]
): { id: string; verifiedBy: number }[] {
  const out: { id: string; verifiedBy: number }[] = [];
  for (const f of facts) {
    const tokens = significantTokens(f.text);
    let extra = 0;
    for (const g of facts) {
      if (g.id === f.id) continue;
      const overlap = significantTokens(g.text).filter((t) => tokens.includes(t)).length;
      if (overlap >= Math.min(4, Math.ceil(tokens.length * 0.45))) extra++;
    }
    out.push({ id: f.id, verifiedBy: f.sourceIds.length + extra });
  }
  return out;
}

function significantTokens(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{M}\p{N}]{4,}/gu) || []).filter((w) => !STOP.has(w));
}
