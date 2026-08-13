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
import {
  annotateSource,
  buildResearchQuality,
  buildTopicProfile,
  classifyClaim,
  evaluateCandidate,
  filterQueries,
  isBlockedOutlineTitle,
  MIN_RELEVANCE,
  PREFERRED_AUTHORITY,
  queryIsOnTopic,
  sectionIsRelevant,
  toRejected,
  type TopicProfile,
} from "./relevance";
import type {
  SourceRecord,
  ExtractedFact,
  TopicAnalysis,
  EbookSettings,
  SyllabusInfo,
  OutlineItem,
  ChapterImage,
  RejectedSource,
  ResearchQualityReport,
} from "../types";
import { nowIso, nextSourceId } from "../db";
import { addResearch, replaceSources } from "../ebooks";
import { isHindiOutput } from "../language";
import { HINDI_OUTLINE_TEMPLATES, localizeOutline } from "../generate/hindi";

import {
  assertNoAmbedkarLeak,
  fillOutlineItem,
  isAchhootResearchTopic,
  plannedChaptersForTopic,
  plannedToOutlineItems,
} from "../generate/outline";
import { probeLiveWeb } from "./liveweb";

export interface ResearchBundle {
  sources: SourceRecord[];
  rejectedSources: RejectedSource[];
  researchQuality: ResearchQualityReport;
  facts: ExtractedFact[];
  wikiPages: WikiPage[];
  images: ChapterImage[];
  syllabusFromWeb?: SyllabusInfo;
  insufficient: boolean;
  message?: string;
  profile: TopicProfile;
}

export async function runResearch(
  ebookId: string,
  analysis: TopicAnalysis,
  settings: EbookSettings,
  onProgress?: (msg: string) => void
): Promise<ResearchBundle> {
  const lang = analysis.wikiLanguage || "en";
  const topic = analysis.topic;
  const profile = buildTopicProfile(topic, {
    category: analysis.category,
    type: settings.type,
    language: analysis.outputLanguage,
  });
  const hits: RawHit[] = [];
  const rejected: RejectedSource[] = [];
  const liveWeb = await probeLiveWeb();

  const considerHit = (h: RawHit): boolean => {
    const ev = evaluateCandidate(h, profile, {
      researchQuestions: profile.researchQuestions,
      outlineTitles: profile.chapterPlan?.map((c) => c.title),
    });
    if (!ev.accepted) {
      rejected.push(toRejected(h, ev));
      return false;
    }
    return true;
  };

  onProgress?.("Searching encyclopedias and knowledge bases");

  const corpusHits = searchCorpus(focusedCorpusQuery(profile, topic), 10).filter((h) => considerHit(h));
  for (const h of corpusHits) {
    hits.push({ title: h.title, url: h.url, snippet: h.snippet, provider: "corpus" });
  }

  if (profile.allowGithub) {
    try {
      const gh = await searchGitHub(profile.workTitle || topic, 5);
      for (const h of gh) {
        if (considerHit(h)) hits.push(h);
      }
    } catch {
      /* optional */
    }
  }

  const wikiSearchTerms = wikiQueryList(profile, topic);
  const wikiHits: WikiSearchHit[] = [];
  const wikiHitsEn: WikiSearchHit[] = [];

  if (liveWeb) {
    for (const q of wikiSearchTerms.slice(0, 4)) {
      try {
        const found = await wikiSearch(q, lang, 6);
        for (const h of found) {
          const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, "_"))}`;
          if (considerHit({ title: h.title, url, snippet: h.snippet, provider: "wikipedia-search" })) {
            if (!wikiHits.some((x) => x.title === h.title)) wikiHits.push(h);
          }
        }
      } catch {
        /* continue */
      }
      if (lang !== "en") {
        try {
          const found = await wikiSearch(q, "en", 5);
          for (const h of found) {
            const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, "_"))}`;
            if (considerHit({ title: h.title, url, snippet: h.snippet, provider: "wikipedia-search" })) {
              if (!wikiHitsEn.some((x) => x.title === h.title)) wikiHitsEn.push(h);
            }
          }
        } catch {
          /* continue */
        }
      }
    }
  }

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
    const queryBatch = filterQueries(analysis.searchQueries || [], profile);
    for (const q of queryBatch) {
      if (!queryIsOnTopic(q, profile)) continue;
      try {
        const found = await webSearch(q, { count: 6 });
        for (const h of found) {
          if (considerHit(h)) hits.push(h);
        }
      } catch {
        onProgress?.("Source unavailable — finding another reliable source.");
      }
    }

    onProgress?.("Collecting academic and library records");

    const libraryQuery = profile.workTitle && profile.author ? `${profile.workTitle} ${profile.author}` : topic;
    const extras: Promise<RawHit[]>[] = [searchOpenLibrary(libraryQuery).catch(() => [])];
    if (profile.allowCrossref) extras.push(searchCrossref(libraryQuery).catch(() => []));
    if (profile.allowArxiv && profile.allowScientificPapers) extras.push(searchArxiv(libraryQuery).catch(() => []));
    if (profile.allowPubmed) extras.push(searchPubMed(libraryQuery).catch(() => []));
    const extraHits = (await Promise.all(extras)).flat();
    for (const h of extraHits) {
      if (considerHit(h)) hits.push(h);
    }
  } else {
    onProgress?.("Open-web encyclopedias unreachable from this host — using retrieved corpus");
  }

  persistResearch(ebookId, topic, hits);

  const ranked = hitsToRanked(hits, topic)
    .map((h) => {
      const ev = evaluateCandidate(h, profile, {
        researchQuestions: profile.researchQuestions,
        outlineTitles: profile.chapterPlan?.map((c) => c.title),
      });
      return { ...h, ev };
    })
    .filter((h) => {
      if (!h.ev.accepted) {
        if (!rejected.some((r) => r.url === h.url)) rejected.push(toRejected(h, h.ev));
        return false;
      }
      return true;
    })
    .sort((a, b) => b.ev.authorityScore - a.ev.authorityScore || b.ev.relevanceScore - a.ev.relevanceScore)
    .slice(0, 28);

  onProgress?.("Evaluating source quality and fetching full text");

  const wikiPages: WikiPage[] = [];
  const titlesTried = new Set<string>();
  const titleCandidates = [
    ...wikiHits.map((h) => ({ title: h.title, lang })),
    ...wikiHitsEn.map((h) => ({ title: h.title, lang: "en" })),
  ];

  if (liveWeb && !titleCandidates.length) {
    const mappedQuery = profile.workTitle && profile.author ? `${profile.workTitle} ${profile.author}` : topic;
    const mapped = await findEnglishTitleThenLang(mappedQuery, lang).catch(() => null);
    if (mapped?.enTitle) {
      const probe = {
        title: mapped.enTitle,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(mapped.enTitle)}`,
        snippet: mapped.enTitle,
        provider: "wikipedia-search",
      };
      if (considerHit({ ...probe, snippet: `${mapped.enTitle} ${profile.coreTerms.slice(0, 4).join(" ")}` })) {
        titleCandidates.push({ title: mapped.enTitle, lang: "en" });
      } else {
        // still try if the title itself is clearly on-topic
        const ev = evaluateCandidate({ ...probe, snippet: mapped.enTitle, extractedText: mapped.enTitle }, profile);
        if (!ev.accepted) rejected.push(toRejected(probe, ev));
      }
    }
    if (mapped?.localTitle) titleCandidates.push({ title: mapped.localTitle, lang });
  }

  if (liveWeb) {
    for (const c of titleCandidates.slice(0, 6)) {
      const key = `${c.lang}:${c.title}`;
      if (titlesTried.has(key)) continue;
      titlesTried.add(key);
      const page = await fetchWikiPage(c.title, c.lang);
      if (!page || page.isDisambiguation) continue;
      const ev = evaluateCandidate(
        {
          title: page.title,
          url: page.url,
          snippet: page.extract.slice(0, 400),
          extractedText: page.extract.slice(0, 6000),
          provider: "wikipedia",
        },
        profile,
        { researchQuestions: profile.researchQuestions }
      );
      if (!ev.accepted) {
        rejected.push(
          toRejected(
            { title: page.title, url: page.url, snippet: page.extract.slice(0, 240), provider: "wikipedia" },
            ev
          )
        );
        continue;
      }
      page.sections = page.sections.filter((sec) => sectionIsRelevant(sec, profile));
      wikiPages.push(page);
    }
  }

  const wbTitles = liveWeb && profile.kind !== "named-work-inquiry" ? await searchWikibooks(topic, "en").catch(() => []) : [];
  const wbChapters = [];
  for (const t of wbTitles.slice(0, 2)) {
    const ch = await fetchWikibooksChapter(t, "en");
    if (!ch) continue;
    if (
      !evaluateCandidate(
        { title: ch.title, url: ch.url, snippet: ch.text.slice(0, 300), extractedText: ch.text.slice(0, 4000) },
        profile
      ).accepted
    ) {
      continue;
    }
    wbChapters.push(ch);
  }

  const sources: SourceRecord[] = [];
  let sid = 1;

  const pushIfRelevant = (draft: SourceRecord): boolean => {
    const ev = evaluateCandidate(
      {
        title: draft.title,
        url: draft.url,
        snippet: draft.snippet,
        extractedText: draft.extractedText,
        provider: draft.organization,
      },
      profile,
      { researchQuestions: profile.researchQuestions, outlineTitles: profile.chapterPlan?.map((c) => c.title) }
    );
    if (!ev.accepted) {
      rejected.push(toRejected({ title: draft.title, url: draft.url, snippet: draft.snippet }, ev));
      return false;
    }
    sources.push(annotateSource(draft, ev));
    return true;
  };

  for (const page of wikiPages) {
    const src: SourceRecord = {
      id: sid++,
      title: page.title,
      organization: page.lang === "hi" ? "विकिपीडिया" : "Wikipedia",
      url: page.url,
      domain: new URL(page.url).hostname,
      snippet: page.extract.slice(0, 280),
      extractedText: relevantWikiExtract(page, profile),
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
    pushIfRelevant(src);

    for (const ref of page.references) {
      if (!ref.url) continue;
      if (sources.some((s) => s.url === ref.url)) continue;
      const draft: SourceRecord = {
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
      };
      pushIfRelevant(draft);
    }
    for (const link of page.externalLinks.slice(0, 8)) {
      if (sources.some((s) => s.url === link.url)) continue;
      pushIfRelevant({
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
    pushIfRelevant({
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
    pushIfRelevant({
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

  const toFetch = liveWeb
    ? ranked
        .filter((h) => !/wikipedia\.org|wikimedia\.org|wikidata\.org|github\.com/.test(h.url))
        .sort((a, b) => b.ev.authorityScore - a.ev.authorityScore || b.ev.relevanceScore - a.ev.relevanceScore)
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
    const draft: SourceRecord = {
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
    };
    pushIfRelevant(draft);
  }

  for (const h of ranked.slice(0, 16)) {
    if (sources.some((s) => s.url === h.url)) continue;
    pushIfRelevant({
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

  // Drop any source that somehow slipped below the threshold after content inspection.
  const kept: SourceRecord[] = [];
  for (const s of sources) {
    if ((s.relevanceScore ?? 0) < MIN_RELEVANCE) {
      rejected.push({
        title: s.title,
        url: s.url,
        snippet: s.snippet,
        relevanceScore: s.relevanceScore ?? 0,
        rejectionReason: s.reasonForInclusion
          ? `Re-checked below threshold: ${s.reasonForInclusion}`
          : "Failed final relevance inspection.",
      });
      continue;
    }
    kept.push(s);
  }

  kept.sort((a, b) => {
    const auth = (b.authorityScore ?? 0) - (a.authorityScore ?? 0);
    if (auth) return auth;
    return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) || a.tier - b.tier;
  });

  // Prefer authority >= 70 when we have enough relevant material.
  const preferred = kept.filter((s) => (s.authorityScore ?? 0) >= PREFERRED_AUTHORITY);
  const finalSources = preferred.length >= 3 ? [...preferred, ...kept.filter((s) => !preferred.includes(s)).slice(0, 4)] : kept;
  finalSources.sort((a, b) => (b.authorityScore ?? 0) - (a.authorityScore ?? 0) || (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

  onProgress?.("Extracting facts and cross-checking important claims");

  const facts: ExtractedFact[] = [];
  for (const s of finalSources.filter((x) => x.extractedText.length > 80).slice(0, 12)) {
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
        claimKind: classifyClaim(f.text, profile),
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
    images = await searchCommonsImages(profile.imageQuery, 6).catch(() => []);
    images = images.filter((img) => {
      const ev = evaluateCandidate(
        {
          title: img.caption || img.alt,
          url: img.sourceUrl,
          snippet: `${img.caption} ${img.alt} ${img.credit}`,
          extractedText: `${img.caption} ${img.alt}`,
        },
        profile
      );
      if (!ev.accepted && /film|movie|ness|capone|costner/.test(`${img.caption} ${img.alt}`.toLowerCase())) {
        rejected.push(toRejected({ title: img.caption, url: img.sourceUrl, snippet: img.alt }, ev));
        return false;
      }
      return true;
    });
  }

  const syllabusFromWeb = await maybeFindSyllabus(topic, finalSources, analysis);

  const researchQuality = buildResearchQuality(finalSources, dedupeRejected(rejected));
  const meat = finalSources.filter((s) => s.extractedText.length > 250);
  const insufficient = (meat.length === 0 && wikiPages.length === 0) || researchQuality.generationBlocked;

  persistSources(ebookId, finalSources);

  return {
    sources: finalSources,
    rejectedSources: researchQuality.rejected,
    researchQuality,
    facts,
    wikiPages,
    images,
    syllabusFromWeb,
    insufficient,
    message: insufficient
      ? researchQuality.contaminationReason ||
        "Not enough reliable, on-topic information was found to create a factual ebook."
      : undefined,
    profile,
  };
}

function focusedCorpusQuery(profile: TopicProfile, topic: string): string {
  if (profile.workTitle && profile.author) return `${profile.workTitle} ${profile.author}`;
  return topic;
}

function wikiQueryList(profile: TopicProfile, topic: string): string[] {
  const qs = [];
  if (profile.workTitle && profile.author) qs.push(`${profile.workTitle} ${profile.author}`);
  if (profile.kind === "named-work-inquiry" && (/untouchab/.test(topic.toLowerCase()) || /अछूत|अस्पृश्य/.test(topic))) {
    qs.push("Untouchability");
    qs.push("The Untouchables Ambedkar");
    qs.push("Dalit Ambedkar");
    qs.push("अस्पृश्यता");
  } else {
    qs.push(profile.workTitle || topic);
  }
  return [...new Set(qs)];
}

function relevantWikiExtract(page: WikiPage, profile: TopicProfile): string {
  const parts = [page.extract.slice(0, 2500)];
  for (const sec of page.sections) {
    if (sectionIsRelevant(sec, profile)) parts.push(`== ${sec.title} ==\n${sec.extract}`);
  }
  return parts.join("\n\n").slice(0, 20000);
}

function dedupeRejected(items: RejectedSource[]): RejectedSource[] {
  const seen = new Set<string>();
  const out: RejectedSource[] = [];
  for (const r of items) {
    const k = (r.url || r.title).split("#")[0];
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.slice(0, 60);
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
    enrichSourceMetadata(s);
  }
  replaceSources(
    ebookId,
    sources.map((s) => ({ ...s, extractedText: (s.extractedText || "").slice(0, 20000) }))
  );
}

function enrichSourceMetadata(s: SourceRecord) {
  const year = s.year || s.publishedAt?.slice(0, 4) || (s.extractedText || s.snippet || "").match(/\b(1[6-9]\d{2}|20[0-2]\d)\b/)?.[1];
  if (year) s.year = year;
  if (!s.author) {
    const by = `${s.title} ${s.snippet}`.match(/\b(?:by|By)\s+([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){0,3})/);
    if (by) s.author = by[1];
    else if (/ambedkar/i.test(`${s.title} ${s.url}`)) s.author = "B. R. Ambedkar";
  }
  if (!s.publisher) s.publisher = s.organization;
  if (!s.sourceType) {
    s.sourceType = s.primarySource
      ? /legislative|constitution|gazette/.test(s.url + s.title.toLowerCase())
        ? "legal"
        : /archive|wikisource|gutenberg/.test(s.url)
          ? "archive"
          : "primary"
      : s.academicSource
        ? "scholarly"
        : /wikipedia|britannica/.test(s.domain || s.url)
          ? "encyclopedia"
          : s.tier <= 2
            ? "official"
            : "secondary";
  }
  if (!s.verificationStatus) {
    s.verificationStatus = s.used && (s.relevanceScore || 0) >= 70 ? "verified" : "needs_review";
  }
  if (!s.reliabilityNote) {
    s.reliabilityNote = s.reasonForInclusion || (s.primarySource ? "Primary / official record" : "Secondary source — check against primary texts");
  }
  if (!s.identifier) s.identifier = s.url;
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
  const profile = bundle.profile || buildTopicProfile(analysis.topic, { category: analysis.category, type: settings.type });
  const requested = isAchhootResearchTopic(analysis.topic)
    ? 14
    : settings.chapterCount || profile.targetChapterCount?.min || 10;
  const n = isAchhootResearchTopic(analysis.topic) ? 14 : Math.max(4, Math.min(20, requested));

  if (syllabus?.units?.length && !isAchhootResearchTopic(analysis.topic)) {
    const items: OutlineItem[] = [];
    for (const unit of syllabus.units) {
      if (unit.topics.length) {
        for (const t of unit.topics) {
          if (isBlockedOutlineTitle(t, profile)) continue;
          items.push({
            id: nanoid(8),
            title: t,
            summary: unit.title,
            sourceIds: [],
            children: [],
          });
        }
      } else if (!isBlockedOutlineTitle(unit.title, profile)) {
        items.push({ id: nanoid(8), title: unit.title, summary: unit.objectives.join("; "), sourceIds: [] });
      }
    }
    if (items.length >= 3) return normalizeOutlineCount(items, n, settings, analysis, bundle, profile);
  }

  const planned = plannedChaptersForTopic({
    topic: analysis.topic,
    settings,
    analysis,
    requestedCount: n,
  });
  if (planned.length) {
    const items = plannedToOutlineItems(planned, bundle);
    assertNoAmbedkarLeak(analysis.topic, items);
    return withPedagogy(items, settings, analysis, profile);
  }

  if (profile.chapterPlan?.length && profile.kind === "named-work-inquiry") {
    const items = profile.chapterPlan.slice(0, n).map((ch, i) =>
      enrichOutlineItem({
        id: nanoid(8),
        chapterNumber: i + 1,
        title: ch.title,
        summary: ch.summary,
        sourceIds: bundle.sources.filter((s) => (s.relevanceScore ?? 0) >= MIN_RELEVANCE).slice(0, 8).map((s) => s.id),
        children: [],
      }, analysis, bundle, i)
    );
    return localizeOutline(withPedagogy(items, settings, analysis, profile), analysis.outputLanguage);
  }

  const fromWiki: OutlineItem[] = [];
  for (const page of bundle.wikiPages) {
    for (const sec of page.sections) {
      if (isBlockedOutlineTitle(sec.title, profile) || sec.extract.length < 80) continue;
      if (!sectionIsRelevant(sec, profile)) continue;
      fromWiki.push({
        id: nanoid(8),
        title: sec.title,
        summary: sec.extract.slice(0, 220),
        sourceIds: [],
        children: [],
      });
    }
  }

  if (fromWiki.length >= 3 && profile.kind !== "named-work-inquiry") {
    return normalizeOutlineCount(fromWiki, n, settings, analysis, bundle, profile);
  }

  return defaultOutline(settings, analysis, bundle, n, profile);
}

function normalizeOutlineCount(
  items: OutlineItem[],
  n: number,
  settings: EbookSettings,
  analysis: TopicAnalysis,
  bundle: ResearchBundle,
  profile: TopicProfile
): OutlineItem[] {
  const unique: OutlineItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (isBlockedOutlineTitle(it.title, profile)) continue;
    const k = it.title.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(it);
  }
  if (unique.length > n) {
    const keep = unique.slice(0, n);
    const extra = unique.slice(n);
    extra.forEach((e, i) => {
      const target = keep[i % keep.length];
      target.children = [...(target.children || []), { title: e.title, summary: e.summary }];
    });
    return withPedagogy(keep, settings, analysis, profile);
  }
  if (unique.length < n) {
    const filler = defaultOutline(settings, analysis, bundle, n, profile);
    for (const f of filler) {
      if (unique.length >= n) break;
      if (!seen.has(f.title.toLowerCase()) && !isBlockedOutlineTitle(f.title, profile)) {
        unique.push(f);
        seen.add(f.title.toLowerCase());
      }
    }
  }
  return withPedagogy(unique.slice(0, n), settings, analysis, profile);
}

function withPedagogy(
  items: OutlineItem[],
  settings: EbookSettings,
  analysis: TopicAnalysis,
  profile: TopicProfile
): OutlineItem[] {
  if (!items.length) return items;
  if (profile.kind === "named-work-inquiry") return items;
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
  n: number,
  profile: TopicProfile
): OutlineItem[] {
  const planned = plannedChaptersForTopic({
    topic: analysis.topic,
    settings,
    analysis,
    requestedCount: n,
  });
  if (planned.length) return plannedToOutlineItems(planned, bundle);

  if (profile.chapterPlan?.length) {
    return profile.chapterPlan.slice(0, n).map((title, i) =>
      enrichOutlineItem(
        {
          id: nanoid(8),
          chapterNumber: i + 1,
          title: title.title,
          summary: title.summary,
          sourceIds: [],
        },
        analysis,
        bundle,
        i
      )
    );
  }
  const terms = extractKeyTerms(bundle.wikiPages.map((p) => p.extract).join("\n") || analysis.topic, 20).filter(
    (t) => !isBlockedOutlineTitle(t, profile)
  );
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
  const useBiography = profile.allowBroadBiography && cat === "biography";
  const hindi = isHindiOutput(analysis.outputLanguage);
  const hiBase = hindi ? HINDI_OUTLINE_TEMPLATES[cat] || HINDI_OUTLINE_TEMPLATES.default : null;
  const base = hiBase || (useBiography ? templates.biography : templates[cat] || templates.default);
  const titles = [...base];
  while (titles.length < n) {
    const term = terms[titles.length % Math.max(1, terms.length)];
    titles.push(term ? `Focus study: ${term}` : `Further topics ${titles.length + 1}`);
  }
  return titles
    .filter((title) => !isBlockedOutlineTitle(title, profile))
    .slice(0, n)
    .map((title) =>
      enrichOutlineItem(
        {
          id: nanoid(8),
          title,
          summary: hindi
            ? `शोध-आधारित अध्याय: ${title} — पाठक: ${settings.audience}.`
            : `Researched chapter covering ${title.toLowerCase()} for ${settings.audience}.`,
          sourceIds: [],
        },
        analysis,
        bundle
      )
    );
}

function enrichOutlineItem(
  item: OutlineItem,
  analysis: TopicAnalysis,
  bundle: ResearchBundle,
  index = 0
): OutlineItem {
  const qs = (analysis.researchQuestions || []).filter((q) => {
    const hay = `${item.title} ${item.summary}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).some((w) => w.length > 4 && hay.includes(w));
  });
  const base: OutlineItem = {
    ...item,
    purpose: item.purpose || item.summary,
    researchQuestion: item.researchQuestion || qs[0] || item.researchQuestions?.[0],
    researchQuestions: item.researchQuestions?.length ? item.researchQuestions : qs.slice(0, 4),
    keyTopics: item.keyTopics?.length ? item.keyTopics : item.children?.map((c) => c.title) || [],
    evidence: item.evidence?.length
      ? item.evidence
      : bundle.facts
          .filter((f) => item.title.toLowerCase().split(/\s+/).some((w) => w.length > 3 && f.text.toLowerCase().includes(w)))
          .slice(0, 3)
          .map((f) => f.text),
    importantClaims: item.importantClaims || item.claimsToVerify || [],
    uncertaintyNotes:
      item.uncertaintyNotes ||
      (analysis.topicKind === "named-work-inquiry"
        ? "Author hypotheses in this chapter are labelled as interpretation, not established fact."
        : "Mark unverified causal claims as disputed."),
    sourceIds: item.sourceIds?.length ? item.sourceIds : bundle.sources.slice(0, 6).map((s) => s.id),
  };
  return fillOutlineItem(base, index, bundle);
}
