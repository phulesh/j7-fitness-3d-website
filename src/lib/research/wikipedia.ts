import { fetchJson, fetchText, stripTags, normalizeSpace, truncate } from "../http";
import { wikiLang } from "../language";

export interface WikiSearchHit {
  title: string;
  snippet: string;
  pageid: number;
  wordcount?: number;
}

export interface WikiPage {
  title: string;
  url: string;
  lang: string;
  extract: string;
  htmlExtract: string;
  sections: { title: string; level: number; extract: string }[];
  categories: string[];
  externalLinks: { title: string; url: string }[];
  references: { text: string; url?: string }[];
  images: { title: string; url: string }[];
  description?: string;
  wikibase?: string;
  isDisambiguation: boolean;
  lastModified?: string;
}

function apiBase(lang: string) {
  return `https://${wikiLang(lang)}.wikipedia.org/w/api.php`;
}

function siteBase(lang: string) {
  return `https://${wikiLang(lang)}.wikipedia.org`;
}

export async function wikiSearch(query: string, lang: string, limit = 8): Promise<WikiSearchHit[]> {
  const url =
    `${apiBase(lang)}?action=query&list=search&srsearch=${encodeURIComponent(query)}` +
    `&srlimit=${limit}&srprop=snippet|wordcount&format=json&origin=*`;
  const r = await fetchJson<{
    query?: { search?: { title: string; snippet: string; pageid: number; wordcount?: number }[] };
  }>(url, { timeoutMs: 10000 });
  if (!r.ok || !r.data?.query?.search) return [];
  return r.data.query.search.map((s) => ({
    title: s.title,
    snippet: stripTags(s.snippet || ""),
    pageid: s.pageid,
    wordcount: s.wordcount,
  }));
}

export async function wikiOpenSearch(query: string, lang: string): Promise<string[]> {
  const url = `${apiBase(lang)}?action=opensearch&search=${encodeURIComponent(query)}&limit=8&format=json&origin=*`;
  const r = await fetchJson<unknown[]>(url);
  if (!r.ok || !Array.isArray(r.data) || !Array.isArray(r.data[1])) return [];
  return r.data[1] as string[];
}

export async function fetchWikiPage(title: string, lang: string): Promise<WikiPage | null> {
  const [plain, parsed, meta] = await Promise.all([
    fetchJson<{
      query?: {
        pages?: Record<
          string,
          {
            title: string;
            extract?: string;
            fullurl?: string;
            pageprops?: { wikibase_item?: string; disambiguation?: string };
            touched?: string;
            categories?: { title: string }[];
          }
        >;
      };
    }>(
      `${apiBase(lang)}?action=query&prop=extracts|info|pageprops|categories&exlimit=1&explaintext=1` +
        `&inprop=url&cllimit=30&titles=${encodeURIComponent(title)}&format=json&origin=*`,
      { timeoutMs: 15000 }
    ),
    fetchJson<{ parse?: { text?: { "*": string }; sections?: { line: string; level: string }[]; externallinks?: string[] } }>(
      `${apiBase(lang)}?action=parse&page=${encodeURIComponent(title)}&prop=text|sections|externallinks&format=json&origin=*`,
      { timeoutMs: 18000 }
    ),
    fetchJson<{
      query?: { pages?: Record<string, { description?: string; images?: { title: string }[]; revisions?: { timestamp: string }[] }> };
    }>(
      `${apiBase(lang)}?action=query&prop=description|images|revisions&imlimit=12&rvprop=timestamp&rvlimit=1&titles=${encodeURIComponent(title)}&format=json&origin=*`,
      { timeoutMs: 12000 }
    ),
  ]);

  const page = plain.data?.query?.pages ? Object.values(plain.data.query.pages)[0] : null;
  if (!page || !page.extract) {
    // try REST summary as fallback
    const rest = await fetchJson<{ extract?: string; content_urls?: { desktop?: { page?: string } }; description?: string; title?: string }>(
      `https://${wikiLang(lang)}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    if (!rest.data?.extract) return null;
    return {
      title: rest.data.title || title,
      url: rest.data.content_urls?.desktop?.page || `${siteBase(lang)}/wiki/${encodeURIComponent(title)}`,
      lang,
      extract: rest.data.extract,
      htmlExtract: rest.data.extract,
      sections: [],
      categories: [],
      externalLinks: [],
      references: [],
      images: [],
      description: rest.data.description,
      isDisambiguation: false,
    };
  }

  const html = parsed.data?.parse?.text?.["*"] || "";
  const sections = splitPlainIntoSections(page.extract, parsed.data?.parse?.sections || []);
  const extLinks = (parsed.data?.parse?.externallinks || [])
    .filter((u) => /^https?:\/\//i.test(u) && !u.includes("wikipedia.org") && !u.includes("wikimedia.org"))
    .slice(0, 25)
    .map((u) => ({ title: hostnameTitle(u), url: u }));

  const references = extractReferences(html).slice(0, 40);
  const metaPage = meta.data?.query?.pages ? Object.values(meta.data.query.pages)[0] : undefined;

  return {
    title: page.title,
    url: page.fullurl || `${siteBase(lang)}/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    lang,
    extract: normalizeSpace(page.extract),
    htmlExtract: html,
    sections,
    categories: (page.categories || []).map((c) => c.title.replace(/^Category:/, "")),
    externalLinks: extLinks,
    references,
    images: [],
    description: metaPage?.description,
    wikibase: page.pageprops?.wikibase_item,
    isDisambiguation: Boolean(page.pageprops?.disambiguation) || /may refer to:/i.test(page.extract.slice(0, 200)),
    lastModified: page.touched || metaPage?.revisions?.[0]?.timestamp,
  };
}

function splitPlainIntoSections(
  extract: string,
  parseSections: { line: string; level: string }[]
): { title: string; level: number; extract: string }[] {
  const lines = extract.split("\n");
  const out: { title: string; level: number; extract: string }[] = [];
  let current = { title: "Introduction", level: 1, extract: "" };
  for (const line of lines) {
    const heading = parseSections.find((s) => s.line && line.trim() === s.line.trim());
    const eq = line.match(/^(=+)\s*(.+?)\s*\1$/);
    if (heading || eq) {
      if (current.extract.trim()) out.push(current);
      current = {
        title: heading?.line || eq?.[2] || "Section",
        level: heading ? Number(heading.level) : (eq?.[1].length || 2),
        extract: "",
      };
    } else {
      current.extract += line + "\n";
    }
  }
  if (current.extract.trim()) out.push(current);
  return out
    .map((s) => ({ ...s, extract: normalizeSpace(s.extract) }))
    .filter((s) => s.extract.length > 40 && !/^(see also|references|external links|notes|bibliography|further reading)$/i.test(s.title));
}

function extractReferences(html: string): { text: string; url?: string }[] {
  const refs: { text: string; url?: string }[] = [];
  const liRe = /<li[^>]*id="cite_note[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html)) && refs.length < 40) {
    const chunk = m[1];
    const href = chunk.match(/href="(https?:[^"]+)"/i)?.[1];
    const text = truncate(stripTags(chunk).replace(/^\s*\^\s*/, ""), 240);
    if (text) refs.push({ text, url: href });
  }
  return refs;
}

function hostnameTitle(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function fetchRelatedWikiPages(titles: string[], lang: string, limit = 4): Promise<WikiPage[]> {
  const pages: WikiPage[] = [];
  for (const t of titles.slice(0, limit)) {
    const p = await fetchWikiPage(t, lang);
    if (p && !p.isDisambiguation && p.extract.length > 200) pages.push(p);
  }
  return pages;
}

export async function fetchWikibooksChapter(title: string, lang: string): Promise<{ title: string; url: string; text: string } | null> {
  const url = `https://${wikiLang(lang)}.wikibooks.org/w/api.php?action=query&prop=extracts|info&explaintext=1&inprop=url&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const r = await fetchJson<{ query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string }> } }>(url);
  const page = r.data?.query?.pages ? Object.values(r.data.query.pages)[0] : null;
  if (!page?.extract || page.extract.length < 120) return null;
  return { title: page.title, url: page.fullurl || `https://${wikiLang(lang)}.wikibooks.org/wiki/${encodeURIComponent(title)}`, text: page.extract };
}

export async function searchWikibooks(query: string, lang: string): Promise<string[]> {
  const url = `https://${wikiLang(lang)}.wikibooks.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`;
  const r = await fetchJson<{ query?: { search?: { title: string }[] } }>(url);
  return r.data?.query?.search?.map((s) => s.title) || [];
}

export async function fetchWikidataEntity(id: string): Promise<{ description?: string; claims: Record<string, string[]> } | null> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(id)}.json`;
  const r = await fetchJson<{ entities?: Record<string, { descriptions?: { en?: { value: string } }; claims?: Record<string, unknown[]> }> }>(url);
  const ent = r.data?.entities?.[id];
  if (!ent) return null;
  return { description: ent.descriptions?.en?.value, claims: {} };
}

export async function wikiLeadInLanguage(title: string, lang: string): Promise<string | null> {
  const r = await fetchJson<{ extract?: string }>(
    `https://${wikiLang(lang)}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  );
  return r.data?.extract || null;
}

export async function findEnglishTitleThenLang(topic: string, targetLang: string): Promise<{ enTitle: string; localTitle?: string; localLang: string } | null> {
  const hits = await wikiSearch(topic, "en", 3);
  if (!hits[0]) return null;
  if (targetLang === "en") return { enTitle: hits[0].title, localTitle: hits[0].title, localLang: "en" };
  // langlinks
  const url = `${apiBase("en")}?action=query&prop=langlinks&lllang=${encodeURIComponent(wikiLang(targetLang))}&titles=${encodeURIComponent(hits[0].title)}&format=json&origin=*`;
  const r = await fetchJson<{ query?: { pages?: Record<string, { langlinks?: { lang: string; "*": string }[] }> } }>(url);
  const page = r.data?.query?.pages ? Object.values(r.data.query.pages)[0] : null;
  const ll = page?.langlinks?.[0]?.["*"];
  return { enTitle: hits[0].title, localTitle: ll, localLang: targetLang };
}
