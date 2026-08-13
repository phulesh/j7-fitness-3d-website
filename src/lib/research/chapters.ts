import type {
  ChapterResearchRecord,
  ExtractedFact,
  OutlineItem,
  SourceRecord,
  TopicAnalysis,
} from "../types";
import { isHindiOutput } from "../language";
import { searchCorpus } from "./corpus";
import { evaluateCandidate } from "./relevance";
import { finalizeSourceRecord, isHttpUrl, UNVERIFIED_LABEL } from "./citation";
import { nowIso } from "../db";
import { classifyClaim, buildTopicProfile, type TopicProfile } from "./relevance";

export interface ChapterResearchProgress {
  chapterIndex: number;
  title: string;
  percent: number;
  sourcesFound: number;
  message: string;
}

function wordsOf(item: OutlineItem): string[] {
  return [
    ...item.title.split(/[\s—–:,/]+/),
    ...(item.keyTopics || []),
    ...(item.researchQuestion || "").split(/[\s?]+/),
  ]
    .map((w) => w.trim())
    .filter((w) => w.length > 3);
}

export function sourceMatchesChapter(s: SourceRecord, item: OutlineItem): boolean {
  const hay = `${s.title} ${s.snippet || ""} ${(s.extractedText || "").slice(0, 4000)}`.toLowerCase();
  const words = wordsOf(item).map((w) => w.toLowerCase());
  if (!words.length) return false;
  return words.filter((w) => hay.includes(w)).length >= 1;
}

function mergeSource(existing: SourceRecord[], incoming: SourceRecord): SourceRecord[] {
  const url = incoming.url || "";
  const hit = existing.find((s) => (url && s.url === url) || (s.title === incoming.title && s.organization === incoming.organization));
  if (!hit) return [...existing, incoming];
  const chapterIds = [...new Set([...(hit.chapterIds || []), ...(incoming.chapterIds || [])])];
  Object.assign(hit, {
    chapterIds,
    extractedText: (hit.extractedText || "").length >= (incoming.extractedText || "").length ? hit.extractedText : incoming.extractedText,
  });
  return existing;
}

function chapterNotes(item: OutlineItem, sources: SourceRecord[], hindi: boolean): { notes: string; evidenceNotes: string } {
  const titles = sources.slice(0, 6).map((s) => s.title).filter(Boolean);
  const evidenceNotes = item.evidenceVsInterpretation ||
    (hindi
      ? "A. स्थापित साक्ष्य — केवल उद्धृत प्राथमिक/आधिकारिक स्रोत। B. विद्वत् व्याख्या। C. आंबेडकर या अन्य प्राथमिक लेखक की व्याख्या। D. परिकल्पना। E. विवादित दावे।"
      : "A. Established evidence from cited primary/official sources. B. Scholarly interpretation. C. Named primary author's interpretation. D. Hypothesis. E. Disputed claims.");
  const notes = hindi
    ? [
        `शोध प्रश्न: ${item.researchQuestion || item.title}`,
        item.historicalScope ? `ऐतिहासिक दायरा: ${item.historicalScope}` : "",
        `मिली स्रोत संख्या: ${sources.length}`,
        titles.length ? `मुख्य स्रोत: ${titles.join(" · ")}` : "इस अध्याय के लिए अतिरिक्त सत्यापित स्रोत सीमित हैं।",
        `साक्ष्य बनाम व्याख्या: ${evidenceNotes}`,
        item.uncertaintyNotes || "अपर्याप्त साक्ष्य होने पर दावे को स्थापित तथ्य न लिखें।",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Research question: ${item.researchQuestion || item.title}`,
        item.historicalScope ? `Historical scope: ${item.historicalScope}` : "",
        `Sources found: ${sources.length}`,
        titles.length ? `Key sources: ${titles.join(" · ")}` : "Verified sources for this chapter are limited.",
        `Evidence vs interpretation: ${evidenceNotes}`,
        item.uncertaintyNotes || "If evidence is thin, do not present the claim as established fact.",
      ]
        .filter(Boolean)
        .join("\n");
  return { notes, evidenceNotes };
}

export function researchOutlineChapters(opts: {
  analysis: TopicAnalysis;
  outline: OutlineItem[];
  bundle: {
    sources: SourceRecord[];
    facts?: ExtractedFact[];
    profile?: TopicProfile;
  };
  cancelled?: () => boolean;
  onProgress?: (info: ChapterResearchProgress) => void;
}): { sources: SourceRecord[]; chapterResearch: ChapterResearchRecord[]; facts: ExtractedFact[] } {
  const { analysis, outline, bundle, cancelled, onProgress } = opts;
  const hindi = isHindiOutput(analysis.outputLanguage);
  const profile = bundle.profile || buildTopicProfile(analysis.topic, { category: analysis.category });
  let sources = bundle.sources.map((s) => finalizeSourceRecord({ ...s, chapterIds: s.chapterIds || [] }));
  const facts = [...(bundle.facts || [])];
  const chapterResearch: ChapterResearchRecord[] = [];
  const total = Math.max(1, outline.length);

  for (let i = 0; i < outline.length; i++) {
    if (cancelled?.()) break;
    const item = outline[i];
    const percent = Math.round(((i + 0.35) / total) * 100);
    onProgress?.({
      chapterIndex: i,
      title: item.title,
      percent,
      sourcesFound: sources.length,
      message: hindi ? `अध्याय ${i + 1} पर शोध चल रहा है…` : `Researching chapter ${i + 1}…`,
    });

    let matched = sources.filter((s) => sourceMatchesChapter(s, item));

    const query = [item.title, ...(item.keyTopics || []).slice(0, 3), item.researchQuestion || ""].filter(Boolean).join(" ");
    const extra = searchCorpus(query || item.title, 4);
    for (const h of extra) {
      if (!isHttpUrl(h.url)) continue;
      const ev = evaluateCandidate(
        { title: h.title, url: h.url, snippet: h.snippet, extractedText: h.extract },
        profile,
        { researchQuestions: item.researchQuestion ? [item.researchQuestion] : analysis.researchQuestions, outlineTitles: [item.title] }
      );
      if (!ev.accepted) continue;
      const nextId = sources.reduce((m, s) => Math.max(m, Number(s.id) || 0), 0) + 1;
      const draft: SourceRecord = finalizeSourceRecord({
        id: nextId,
        title: h.title,
        organization: h.organization || "Corpus",
        url: h.url,
        domain: "wikipedia.org",
        snippet: h.snippet,
        extractedText: h.extract || h.snippet,
        retrievedAt: nowIso(),
        tier: 7,
        license: "CC BY-SA 4.0",
        score: ev.relevanceScore,
        used: true,
        relevanceScore: ev.relevanceScore,
        authorityScore: ev.authorityScore,
        primarySource: ev.primarySource,
        academicSource: ev.academicSource,
        reasonForInclusion: ev.reasonForInclusion,
        sourceType: ev.primarySource ? "primary" : "encyclopedia",
        verificationStatus: "verified",
        chapterIds: [item.id],
      });
      sources = mergeSource(sources, draft);
    }

    matched = sources.filter((s) => sourceMatchesChapter(s, item) || (s.chapterIds || []).includes(item.id));
    if (!matched.length) matched = sources.filter((s) => s.used || (s.extractedText || "").length > 200).slice(0, 3);

    for (const s of matched) {
      s.chapterIds = [...new Set([...(s.chapterIds || []), item.id])];
    }

    const chapterFacts = facts
      .filter((f) => {
        const t = f.text.toLowerCase();
        return wordsOf(item).some((w) => t.includes(w.toLowerCase()));
      })
      .slice(0, 8)
      .map((f) => ({ ...f, claimKind: f.claimKind || classifyClaim(f.text, profile) }));

    const { notes, evidenceNotes } = chapterNotes(item, matched, hindi);
    chapterResearch.push({
      chapterId: item.id,
      chapterIndex: i,
      title: item.title,
      status: "complete",
      sourcesFound: matched.length,
      sourceIds: matched.map((s) => s.id),
      notes,
      evidenceNotes,
      researchQuestion: item.researchQuestion,
      facts: chapterFacts,
    });

    onProgress?.({
      chapterIndex: i,
      title: item.title,
      percent: Math.round(((i + 1) / total) * 100),
      sourcesFound: sources.length,
      message: hindi
        ? `अध्याय ${i + 1}: ${matched.length} स्रोत मिले`
        : `Chapter ${i + 1}: ${matched.length} source(s) found`,
    });
  }

  const finalized = sources.map((s) => {
    const next = finalizeSourceRecord(s, s.chapterIds);
    if (!next.url) {
      next.verificationStatus = "unverified";
      next.reliabilityNote = UNVERIFIED_LABEL;
      next.notes = UNVERIFIED_LABEL;
    }
    return next;
  });

  return { sources: finalized, chapterResearch, facts };
}
