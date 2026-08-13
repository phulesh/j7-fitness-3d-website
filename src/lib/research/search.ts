import * as cheerio from "cheerio";
import { fetchJson, fetchText, stripTags, domainOf, decodeHtml } from "../http";
import { organizationFromDomain, sourceTier, scoreSource } from "./rank";

export interface RawHit {
  title: string;
  url: string;
  snippet: string;
  provider: string;
}

export async function webSearch(query: string, opts: { count?: number } = {}): Promise<RawHit[]> {
  const count = opts.count ?? 8;
  const provider = (process.env.SEARCH_PROVIDER || "auto").toLowerCase();
  const key = process.env.SEARCH_API_KEY || "";

  if (key && (provider === "tavily" || (provider === "auto" && !process.env.SEARCH_PROVIDER))) {
    const t = await tavilySearch(query, count, key);
    if (t.length) return t;
  }
  if (key && (provider === "brave" || provider === "auto")) {
    const b = await braveSearch(query, count, key);
    if (b.length) return b;
  }
  if (key && (provider === "serper" || provider === "auto")) {
    const s = await serperSearch(query, count, key);
    if (s.length) return s;
  }

  const ddg = await duckDuckGoSearch(query, count);
  if (ddg.length) return ddg;

  const instant = await duckDuckGoInstant(query);
  return instant;
}

async function tavilySearch(query: string, count: number, key: string): Promise<RawHit[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "advanced",
        max_results: count,
        include_answer: false,
      }),
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
    return (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      provider: "tavily",
    }));
  } catch {
    return [];
  }
}

async function braveSearch(query: string, count: number, key: string): Promise<RawHit[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  const r = await fetchJson<{ web?: { results?: { title: string; url: string; description: string }[] } }>(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
  });
  return (r.data?.web?.results || []).map((x) => ({
    title: x.title,
    url: x.url,
    snippet: x.description,
    provider: "brave",
  }));
}

async function serperSearch(query: string, count: number, key: string): Promise<RawHit[]> {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: count }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { organic?: { title: string; link: string; snippet: string }[] };
    return (data.organic || []).map((x) => ({
      title: x.title,
      url: x.link,
      snippet: x.snippet,
      provider: "serper",
    }));
  } catch {
    return [];
  }
}

async function duckDuckGoInstant(query: string): Promise<RawHit[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const r = await fetchJson<{
    AbstractText?: string;
    AbstractURL?: string;
    AbstractSource?: string;
    Heading?: string;
    RelatedTopics?: { Text?: string; FirstURL?: string; Topics?: { Text?: string; FirstURL?: string }[] }[];
    Results?: { Text?: string; FirstURL?: string }[];
  }>(url);
  const hits: RawHit[] = [];
  if (r.data?.AbstractText && r.data.AbstractURL) {
    hits.push({
      title: r.data.Heading || r.data.AbstractSource || query,
      url: r.data.AbstractURL,
      snippet: r.data.AbstractText,
      provider: "duckduckgo-instant",
    });
  }
  const extras = [
    ...(r.data?.Results || []),
    ...(r.data?.RelatedTopics || []).flatMap((t) => (t.Topics ? t.Topics : [t])),
  ];
  for (const x of extras) {
    if (x.FirstURL && x.Text) {
      hits.push({
        title: x.Text.split(" - ")[0].slice(0, 120),
        url: x.FirstURL,
        snippet: x.Text,
        provider: "duckduckgo-instant",
      });
    }
  }
  return hits.slice(0, 8);
}

async function duckDuckGoSearch(query: string, count: number): Promise<RawHit[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const r = await fetchText(url, {
    timeoutMs: 12000,
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (compatible; FolioResearch/1.0; +https://local.folio/research) AppleWebKit/537.36",
    },
    retries: 1,
  });
  if (!r.ok || !r.text.includes("result")) {
    return duckDuckGoLite(query, count);
  }
  try {
    const $ = cheerio.load(r.text);
    const hits: RawHit[] = [];
    $(".result, .web-result, .links_main").each((_, el) => {
      const a = $(el).find("a.result__a, a.result-link").first();
      let href = a.attr("href") || "";
      const title = a.text().trim();
      const snippet = $(el).find(".result__snippet, .result-snippet, td.result-snippet").first().text().trim();
      href = unwrapDdg(href);
      if (title && href && href.startsWith("http")) {
        hits.push({ title, url: href, snippet, provider: "duckduckgo" });
      }
    });
    if (hits.length) return hits.slice(0, count);
  } catch {
    /* fall through */
  }
  return duckDuckGoLite(query, count);
}

async function duckDuckGoLite(query: string, count: number): Promise<RawHit[]> {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const r = await fetchText(url, { timeoutMs: 10000, retries: 1 });
  if (!r.ok) return [];
  try {
    const $ = cheerio.load(r.text);
    const hits: RawHit[] = [];
    $("a.result-link").each((_, el) => {
      const href = unwrapDdg($(el).attr("href") || "");
      const title = $(el).text().trim();
      const snippet = $(el).parent().next().text().trim();
      if (title && href.startsWith("http")) {
        hits.push({ title, url: href, snippet, provider: "duckduckgo-lite" });
      }
    });
    return hits.slice(0, count);
  } catch {
    return [];
  }
}

function unwrapDdg(href: string): string {
  try {
    if (href.startsWith("//")) href = "https:" + href;
    const u = new URL(href, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return href;
  } catch {
    return href;
  }
}

export async function searchCrossref(query: string, count = 5): Promise<RawHit[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${count}&select=DOI,title,author,container-title,URL,abstract,published`;
  const r = await fetchJson<{
    message?: {
      items?: {
        DOI?: string;
        title?: string[];
        URL?: string;
        abstract?: string;
        "container-title"?: string[];
      }[];
    };
  }>(url, { headers: { "User-Agent": "FolioEbookGenerator/1.0 (mailto:research@local)" } });
  return (r.data?.message?.items || []).map((it) => ({
    title: it.title?.[0] || it.DOI || "Paper",
    url: it.URL || (it.DOI ? `https://doi.org/${it.DOI}` : ""),
    snippet: stripTags(it.abstract || it["container-title"]?.[0] || "Scholarly work via Crossref"),
    provider: "crossref",
  })).filter((h) => h.url);
}

export async function searchArxiv(query: string, count = 5): Promise<RawHit[]> {
  const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${count}`;
  const r = await fetchText(url, { timeoutMs: 12000 });
  if (!r.ok) return [];
  const hits: RawHit[] = [];
  const entries = r.text.split("<entry>").slice(1);
  for (const e of entries) {
    const title = stripTags(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").replace(/\s+/g, " ");
    const summary = stripTags(e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || "").replace(/\s+/g, " ");
    const id = (e.match(/<id>([\s\S]*?)<\/id>/)?.[1] || "").trim();
    if (title && id) hits.push({ title, url: id, snippet: summary.slice(0, 400), provider: "arxiv" });
  }
  return hits;
}

export async function searchOpenLibrary(query: string): Promise<RawHit[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`;
  const r = await fetchJson<{ docs?: { title: string; author_name?: string[]; key?: string; first_publish_year?: number }[] }>(url);
  return (r.data?.docs || []).slice(0, 5).map((d) => ({
    title: `${d.title}${d.author_name?.[0] ? " — " + d.author_name[0] : ""}`,
    url: d.key ? `https://openlibrary.org${d.key}` : "https://openlibrary.org",
    snippet: `Open Library catalog record${d.first_publish_year ? `, first published ${d.first_publish_year}` : ""}.`,
    provider: "openlibrary",
  }));
}

export async function searchPubMed(query: string, count = 5): Promise<RawHit[]> {
  const idsUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${count}&term=${encodeURIComponent(query)}`;
  const ids = await fetchJson<{ esearchresult?: { idlist?: string[] } }>(idsUrl);
  const list = ids.data?.esearchresult?.idlist || [];
  if (!list.length) return [];
  const sumUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${list.join(",")}`;
  const sum = await fetchJson<{ result?: Record<string, { title?: string; fulljournalname?: string; source?: string }> }>(sumUrl);
  return list.map((id) => {
    const it = sum.data?.result?.[id];
    return {
      title: it?.title || `PubMed ${id}`,
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      snippet: it?.fulljournalname || it?.source || "PubMed indexed article",
      provider: "pubmed",
    };
  });
}

export function hitsToRanked(hits: RawHit[], topic: string) {
  const seen = new Set<string>();
  return hits
    .filter((h) => {
      const d = domainOf(h.url) + h.url.split("#")[0];
      if (!h.url || seen.has(d)) return false;
      seen.add(d);
      return true;
    })
    .map((h) => ({
      ...h,
      domain: domainOf(h.url),
      organization: organizationFromDomain(h.url),
      tier: sourceTier(h.url),
      score: scoreSource({ url: h.url, title: h.title, snippet: h.snippet, topic }),
    }))
    .sort((a, b) => b.score - a.score || a.tier - b.tier);
}

export { decodeHtml };
