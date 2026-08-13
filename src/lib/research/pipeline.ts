import { nanoid } from "nanoid";
import {
  wikiSearch,
  fetchWikiPage,
  searchWikibooks,
  fetchWikibooksChapter,
  findEnglishTitleThenLang,
  type WikiPage,
  type WikiSearchHit,
} from "./wikipedia";
import {
  webSearch,
  searchCrossref,
  searchArxiv,
  searchOpenLibrary,
  searchPubMed,
  hitsToRanked,
  type RawHit,
} from "./search";
import { searchCorpus } from "./corpus";
import { searchGitHub } from "./github";
import { extractReadable, extractFactsFromText, crossCheckFacts, extractKeyTerms } from "./extract";
import { organizationFromDomain, sourceTier, scoreSource } from "./rank";
import { searchCommonsImages } from "./commons";
import type {
  SourceRecord,
  ExtractedFact,
  TopicAnalysis,
  EbookSettings,
  SyllabusInfo,
  OutlineItem,
  ChapterImage,
} from "../types";
import { nowIso, nextSourceId } from "../db";
import { addResearch, replaceSources } from "../ebooks";
import { fetchText } from "../http";

let liveWebCache: boolean | null = null;
async function probeLiveWeb(): Promise<boolean> {
  if (liveWebCache !== null) return liveWebCache;
  const r = await fetchText("https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json", {
    timeoutMs: 2500,
    retries: 0,
  });
  liveWebCache = Boolean(r.ok);
  return liveWebCache;
}

export interface ResearchBundle {
  sources: SourceRecord[];
  facts: ExtractedFact[];
  wikiPages: WikiPage[];
  images: ChapterImage[];
  syllabusFromWeb?: SyllabusInfo;
  insufficient: boolean;
  message?: string;
}

export async function runResearch(
  ebookId: string,
  analysis: TopicAnalysis,
  settings: EbookSettings,
  onProgress?: (msg: string) => void
): Promise<ResearchBundle> {
  const lang = analysis.wikiLanguage || "en";
  const topic = analysis.topic;
  const hits: RawHit[] = [];
  const liveWeb = await probeLiveWeb();

  onProgress?.("Searching encyclopedias and knowledge bases");

  const corpusHits = searchCorpus(topic, 10);
  for (const h of corpusHits) {
    hits.push({ title: h.title, url: h.url, snippet: h.snippet, provider: "corpus" });
  }

  try {
    const gh = await searchGitHub(topic, 5);
    for (const h of gh) hits.push(h);
  } catch {
    /* optional */
  }

  const wikiResults: [WikiSearchHit[], WikiSearchHit[]] = liveWeb
    ? await Promise.all([
        wikiSearch(topic, lang, 8).catch(() => []),
        lang === "en" ? Promise.resolve([]) : wikiSearch(topic, "en", 6).catch(() => []),
      ])
    : [[], []];
  const [wikiHits, wikiHitsEn] = wikiResults;

  for (const h of [...wikiHits, ...wikiHitsEn]) {
    const wlang = wikiHits.includes(h) ? lang : "en";
    hits.push({
      title: h.title,
      url: `https://${wlang}.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, "_"))}`,
      snippet: h.snippet,
      provider: "wikipedia-search",
    });
  }

  onProgress?.("Searching the open web for authoritative pages");

  if (liveWeb) {
    const queryBatch = analysis.searchQueries.slice(0, 5);
    for (const q of queryBatch) {
      try {
        const found = await webSearch(q, { count: 6 });
        hits.push(...found);
      } catch {
        onProgress?.("Source unavailable — finding another reliable source.");
      }
    }

    onProgress?.("Collecting academic and library records");

    const extras: Promise<RawHit[]>[] = [searchOpenLibrary(topic).catch(() => [])];
    if (["scientific", "technical", "programming", "medical", "academic"].includes(analysis.category)) {
      extras.push(searchCrossref(topic).catch(() => []));
      extras.push(searchArxiv(topic).catch(() => []));
    }
    if (analysis.category === "medical") extras.push(searchPubMed(topic).catch(() => []));
    const extraHits = (await Promise.all(extras)).flat();
    hits.push(...extraHits);
  } else {
    onProgress?.("Open-web encyclopedias unreachable from this host — using retrieved corpus and GitHub");
  }

  persistResearch(ebookId, topic, hits);

  const ranked = hitsToRanked(hits, topic).slice(0, 28);

  onProgress?.("Evaluating source quality and fetching full text");

  const wikiPages: WikiPage[] = [];
  const titlesTried = new Set<string>();
  const titleCandidates = [
    ...wikiHits.map((h) => ({ title: h.title, lang })),
    ...wikiHitsEn.map((h) => ({ title: h.title, lang: "en" })),
  ];

  if (liveWeb && !titleCandidates.length) {
    const mapped = await findEnglishTitleThenLang(topic, lang).catch(() => null);
    if (mapped?.enTitle) titleCandidates.push({ title: mapped.enTitle, lang: "en" });
    if (mapped?.localTitle) titleCandidates.push({ title: mapped.localTitle, lang: lang });
  }

  if (liveWeb) {
    for (const c of titleCandidates.slice(0, 5)) {
      const key = `${c.lang}:${c.title}`;
      if (titlesTried.has(key)) continue;
      titlesTried.add(key);
      const page = await fetchWikiPage(c.title, c.lang);
      if (page && !page.isDisambiguation) wikiPages.push(page);
    }
  }

  const wbTitles = liveWeb ? await searchWikibooks(topic, "en").catch(() => []) : [];
  const wbChapters = [];
  for (const t of wbTitles.slice(0, 2)) {
    const ch = await fetchWikibooksChapter(t, "en");
    if (ch) wbChapters.push(ch);
  }

  const sources: SourceRecord[] = [];
  let sid = 1;

  for (const page of wikiPages) {
    const src: SourceRecord = {
      id: sid++,
      title: page.title,
      organization: page.lang === "hi" ? "विकिपीडिया" : "Wikipedia",
      url: page.url,
      domain: new URL(page.url).hostname,
      snippet: page.extract.slice(0, 280),
      extractedText: page.extract.slice(0, 20000),
      retrievedAt: nowIso(),
      publishedAt: page.lastModified,
      tier: 7,
      license: "CC BY-SA 4.0",
      score: scoreSource({
        url: page.url,
        title: page.title,
        snippet: page.extract.slice(0, 280),
        topic,
        extractedLen: page.extract.length,
      }),
      used: true,
      language: page.lang,
    };
    sources.push(src);
    for (const ref of page.references) {
      if (!ref.url) continue;
      if (sources.some((s) => s.url === ref.url)) continue;
      sources.push({
        id: sid++,
        title: ref.text.slice(0, 160),
        organization: organizationFromDomain(ref.url),
        url: ref.url,
        domain: organizationFromDomain(ref.url),
        snippet: ref.text,
        extractedText: "",
        retrievedAt: nowIso(),
        tier: sourceTier(ref.url),
        score: scoreSource({ url: ref.url, title: ref.text, snippet: ref.text, topic }),
        used: false,
      });
    }
    for (const link of page.externalLinks.slice(0, 8)) {
      if (sources.some((s) => s.url === link.url)) continue;
      sources.push({
        id: sid++,
        title: link.title,
        organization: organizationFromDomain(link.url),
        url: link.url,
        domain: organizationFromDomain(link.url),
        snippet: "",
        extractedText: "",
        retrievedAt: nowIso(),
        tier: sourceTier(link.url),
        score: scoreSource({ url: link.url, title: link.title, snippet: "", topic }),
        used: false,
      });
    }
  }

  for (const h of corpusHits) {
    if (sources.some((s) => s.url === h.url)) continue;
    sources.push({
      id: sid++,
      title: h.title,
      organization: h.organization || "Wikipedia",
      url: h.url,
      domain: "wikipedia.org",
      snippet: h.snippet,
      extractedText: h.extract || h.snippet,
      retrievedAt: nowIso(),
      tier: 7,
      license: "CC BY-SA 4.0",
      score: 88,
      used: true,
    });
  }

  for (const ch of wbChapters) {
    sources.push({
      id: sid++,
      title: ch.title,
      organization: "Wikibooks",
      url: ch.url,
      domain: "wikibooks.org",
      snippet: ch.text.slice(0, 240),
      extractedText: ch.text.slice(0, 16000),
      retrievedAt: nowIso(),
      tier: 6,
      license: "CC BY-SA 4.0",
      score: 70,
      used: true,
    });
  }

  // Fetch full text of top non-wiki pages (prefer better tiers)
  const toFetch = liveWeb
    ? ranked
        .filter((h) => !/wikipedia\.org|wikimedia\.org|wikidata\.org|github\.com/.test(h.url))
        .sort((a, b) => a.tier - b.tier || b.score - a.score)
        .slice(0, 8)
    : [];

  for (const h of toFetch) {
    if (sources.some((s) => s.url === h.url)) continue;
    let extracted = "";
    try {
      const readable = await extractReadable(h.url);
      if (readable) extracted = readable.text;
    } catch {
      onProgress?.("Source unavailable — finding another reliable source.");
    }
    sources.push({
      id: sid++,
      title: h.title,
      organization: h.organization,
      url: h.url,
      domain: h.domain,
      snippet: h.snippet,
      extractedText: extracted,
      retrievedAt: nowIso(),
      tier: h.tier,
      score: scoreSource({
        url: h.url,
        title: h.title,
        snippet: h.snippet,
        topic,
        extractedLen: extracted.length,
      }),
      used: extracted.length > 200,
    });
  }

  // Remaining ranked hits as lightweight citations
  for (const h of ranked.slice(0, 16)) {
    if (sources.some((s) => s.url === h.url)) continue;
    sources.push({
      id: sid++,
      title: h.title,
      organization: h.organization,
      url: h.url,
      domain: h.domain,
      snippet: h.snippet,
      extractedText: h.snippet,
      retrievedAt: nowIso(),
      tier: h.tier,
      score: h.score,
      used: false,
    });
  }

  sources.sort((a, b) => a.tier - b.tier || b.score - a.score);

  onProgress?.("Extracting facts and cross-checking important claims");

  const facts: ExtractedFact[] = [];
  for (const s of sources.filter((x) => x.extractedText.length > 80).slice(0, 12)) {
    const extracted = extractFactsFromText(s.extractedText, s.id);
    for (const f of extracted.slice(0, 25)) {
      facts.push({
        id: nanoid(8),
        text: f.text,
        sourceIds: [s.id],
        confidence: s.tier <= 4 ? "high" : s.tier <= 7 ? "medium" : "low",
        verifiedBy: 1,
        category: f.category,
        entities: f.entities,
      });
    }
  }

  const checks = crossCheckFacts(facts);
  const byId = new Map(checks.map((c) => [c.id, c.verifiedBy]));
  for (const f of facts) {
    f.verifiedBy = byId.get(f.id) || 1;
    if (f.verifiedBy >= 3) f.confidence = "high";
    else if (f.verifiedBy === 1 && f.confidence === "high") f.confidence = "medium";
  }

  let images: ChapterImage[] = [];
  if (settings.includeImages && liveWeb) {
    onProgress?.("Collecting openly licensed images");
    images = await searchCommonsImages(topic, 6).catch(() => []);
  }

  const syllabusFromWeb = await maybeFindSyllabus(topic, sources, analysis);

  const meat = sources.filter((s) => s.extractedText.length > 250);
  const insufficient = meat.length === 0 && wikiPages.length === 0;

  return {
    sources,
    facts,
    wikiPages,
    images,
    syllabusFromWeb,
    insufficient,
    message: insufficient
      ? "Not enough reliable information was found to create a factual ebook."
      : undefined,
  };
}

function persistResearch(ebookId: string, query: string, hits: RawHit[]) {
  try {
    addResearch(ebookId, query, "mixed", hits.slice(0, 40));
  } catch {
    /* ignore */
  }
}

function persistSources(ebookId: string, sources: SourceRecord[]) {
  for (const s of sources) {
    if (!s.id) s.id = nextSourceId();
  }
  replaceSources(
    ebookId,
    sources.map((s) => ({ ...s, extractedText: (s.extractedText || "").slice(0, 20000) }))
  );
}

async function maybeFindSyllabus(
  topic: string,
  sources: SourceRecord[],
  analysis: TopicAnalysis
): Promise<SyllabusInfo | undefined> {
  if (!["school", "exam", "academic"].includes(analysis.category)) return undefined;
  const hit = sources.find((s) =>
    /syllabus|ncert|cbse|curriculum|course outline/i.test(`${s.title} ${s.url} ${s.snippet}`)
  );
  if (!hit) return undefined;
  return {
    detected: true,
    subject: topic,
    units: [],
    sourceTitle: hit.title,
    sourceUrl: hit.url,
    lastVerified: new Date().toISOString().slice(0, 10),
    fromUpload: false,
  };
}

export function buildOutlineFromResearch(
  settings: EbookSettings,
  analysis: TopicAnalysis,
  bundle: ResearchBundle,
  syllabus?: SyllabusInfo
): OutlineItem[] {
  const n = Math.max(4, Math.min(20, settings.chapterCount || 10));

  if (syllabus?.units?.length) {
    const items: OutlineItem[] = [];
    for (const unit of syllabus.units) {
      if (unit.topics.length) {
        for (const t of unit.topics) {
          items.push({
            id: nanoid(8),
            title: t,
            summary: unit.title,
            sourceIds: [],
            children: [],
          });
        }
      } else {
        items.push({ id: nanoid(8), title: unit.title, summary: unit.objectives.join("; "), sourceIds: [] });
      }
    }
    return normalizeOutlineCount(items, n, settings, analysis, bundle);
  }

  const skip = /see also|references|external links|notes|bibliography|further reading|sources|citations/i;
  const fromWiki: OutlineItem[] = [];
  for (const page of bundle.wikiPages) {
    for (const sec of page.sections) {
      if (skip.test(sec.title) || sec.extract.length < 80) continue;
      fromWiki.push({
        id: nanoid(8),
        title: sec.title,
        summary: sec.extract.slice(0, 220),
        sourceIds: [],
        children: [],
      });
    }
  }

  if (fromWiki.length >= 3) {
    return normalizeOutlineCount(fromWiki, n, settings, analysis, bundle);
  }

  return defaultOutline(settings, analysis, bundle, n);
}

function normalizeOutlineCount(
  items: OutlineItem[],
  n: number,
  settings: EbookSettings,
  analysis: TopicAnalysis,
  bundle: ResearchBundle
): OutlineItem[] {
  const unique: OutlineItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const k = it.title.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(it);
  }
  if (unique.length > n) {
    // merge extras into nearby chapters
    const keep = unique.slice(0, n);
    const extra = unique.slice(n);
    extra.forEach((e, i) => {
      const target = keep[i % keep.length];
      target.children = [...(target.children || []), { title: e.title, summary: e.summary }];
    });
    return withPedagogy(keep, settings, analysis);
  }
  if (unique.length < n) {
    const filler = defaultOutline(settings, analysis, bundle, n);
    for (const f of filler) {
      if (unique.length >= n) break;
      if (!seen.has(f.title.toLowerCase())) {
        unique.push(f);
        seen.add(f.title.toLowerCase());
      }
    }
  }
  return withPedagogy(unique.slice(0, n), settings, analysis);
}

function withPedagogy(items: OutlineItem[], settings: EbookSettings, analysis: TopicAnalysis): OutlineItem[] {
  // Ensure first chapter is foundations / last is review if educational
  if (!items.length) return items;
  const first = items[0].title.toLowerCase();
  if (!/intro|foundat|overview|begin|basic/.test(first) && settings.type !== "Biography") {
    // leave as-is; introduction is separate
  }
  if (analysis.copyrightMode) {
    return items.map((it) => ({
      ...it,
      title: it.title.replace(/^chapter\s+\d+:\s*/i, ""),
      summary: `Original educational notes: ${it.summary}`,
    }));
  }
  return items;
}

function defaultOutline(
  settings: EbookSettings,
  analysis: TopicAnalysis,
  bundle: ResearchBundle,
  n: number
): OutlineItem[] {
  const terms = extractKeyTerms(bundle.wikiPages.map((p) => p.extract).join("\n") || analysis.topic, 20);
  const templates: Record<string, string[]> = {
    programming: [
      "Getting started and setup",
      "Core syntax and building blocks",
      "Data structures and types",
      "Control flow and logic",
      "Functions and modular design",
      "Working with data",
      "Errors, testing, and debugging",
      "Practical projects",
      "Best practices and common mistakes",
      "Next steps and further learning",
    ],
    exam: [
      "Syllabus map and exam pattern",
      "Foundational concepts",
      "High-yield topics",
      "Application and case problems",
      "Diagrams and facts to memorize",
      "Previous-year style questions",
      "Common traps",
      "Revision sheets",
      "Full-length practice",
      "Strategy and time management",
    ],
    historical: [
      "Setting the scene",
      "Origins and early developments",
      "Key figures",
      "Turning points",
      "Society, culture, and daily life",
      "Conflict and change",
      "Institutions and ideas",
      "Legacy and historiography",
      "Primary sources in context",
      "What remains debated",
    ],
    biography: [
      "Early life and context",
      "Formative years",
      "Public life and work",
      "Ideas and writings",
      "Major events",
      "Allies, critics, and contemporaries",
      "Later years",
      "Death and immediate aftermath",
      "Legacy",
      "How historians read this life",
    ],
    school: [
      "Learning goals and prerequisites",
      "Core concepts",
      "Worked explanations",
      "Diagrams and definitions",
      "Numerical / applied problems",
      "In-text activities",
      "Higher-order thinking",
      "Chapter-wise recap",
      "Exercise set",
      "Sample test paper",
    ],
    medical: [
      "Scope and how to read this book",
      "Basic science foundations",
      "Mechanisms",
      "Presentation and assessment",
      "Prevention and public health",
      "Evidence and guidelines",
      "Case vignettes",
      "Myths versus evidence",
      "When to seek professional care",
      "Sources and further reading",
    ],
    legal: [
      "Constitutional / legal framework",
      "Key provisions",
      "Institutions and procedure",
      "Landmark developments",
      "Rights and duties",
      "Contemporary application",
      "Case notes",
      "Comparisons and debates",
      "Revision outline",
      "Practice questions",
    ],
    default: [
      "What this subject is and why it matters",
      "Foundations and vocabulary",
      "Core ideas in depth",
      "Methods and how work is done",
      "Applications in the real world",
      "Tools, data, and examples",
      "Limitations and open questions",
      "Case studies",
      "Skills practice",
      "Looking ahead",
    ],
  };
  const cat = analysis.category;
  const base =
    templates[cat] ||
    templates[
      cat === "technical" || cat === "scientific" ? "default" : cat === "academic" ? "default" : "default"
    ];
  const titles = [...base];
  while (titles.length < n) {
    const term = terms[titles.length % Math.max(1, terms.length)];
    titles.push(term ? `Focus study: ${term}` : `Further topics ${titles.length + 1}`);
  }
  return titles.slice(0, n).map((title) => ({
    id: nanoid(8),
    title,
    summary: `Researched chapter covering ${title.toLowerCase()} for ${settings.audience}.`,
    sourceIds: [],
  }));
}
