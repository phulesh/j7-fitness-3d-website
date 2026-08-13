import { createEbook, deleteEbook, findRecentDuplicateDraft, listEbooks, updateEbook, getEbook } from "./ebooks";
import { isAcceptableHindi, normalizeOutputLanguage, resolveOutputLanguage } from "./language";
import { composeHindiChapter } from "./generate/hindi";
import { coverSvg } from "./generate/cover";
import { DEFAULT_SETTINGS } from "./types";
import { isAmbedkarUntouchablesTopic } from "./research/relevance";
import { categorize } from "./generate/analyze";
import {
  ACHHOOT_HINDI_TITLES,
  isAchhootResearchTopic,
  plannedChaptersForTopic,
  plannedToOutlineItems,
  fillOutlineItem,
} from "./generate/outline";
import { buildOutlineFromResearch } from "./research/pipeline";
import { buildBookPages } from "./book/pages";
import { figuresToHtml, makeIllustrationSvg, insertFiguresIntoChapter, illustrationDisclaimer } from "./generate/images";
import { formatCitation, finalizeSourceRecord, UNVERIFIED_LABEL } from "./research/citation";
import { researchOutlineChapters } from "./research/chapters";
import { buildTopicProfile } from "./research/relevance";

const TOPIC = "अछूत कौन थे और अछूत कैसे बने?";

export function runUpgradeSelftest() {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];

  const hi = normalizeOutputLanguage("Hindi — हिन्दी");
  checks.push({ name: "Hindi language code", ok: hi === "hi", detail: hi });

  const resolved = resolveOutputLanguage("hi", "Python for Beginners");
  checks.push({ name: "Hindi is not overwritten by English topic", ok: resolved === "hi", detail: resolved });

  checks.push({
    name: "Hindi Achhoot topic is detected",
    ok: isAmbedkarUntouchablesTopic(TOPIC) && isAchhootResearchTopic(TOPIC),
  });
  checks.push({
    name: "Hindi Achhoot topic is historical",
    ok: categorize(TOPIC, "Research-Based Book") === "historical",
  });

  const analysis = {
    topic: TOPIC,
    normalizedTitle: TOPIC,
    subtitle: "शोध",
    detectedLanguage: "hi",
    outputLanguage: "hi",
    category: "historical" as const,
    audienceSuggestion: "Researchers",
    needsCurrentInfo: false,
    copyrightMode: false,
    sensitiveDomain: "none" as const,
    prioritySourceHints: [],
    searchQueries: [],
    wikiLanguage: "hi",
    summary: "शोध",
    researchQuestions: ["अछूत कौन थे?"],
    topicKind: "named-work-inquiry",
  };

  const settings = {
    ...DEFAULT_SETTINGS,
    topic: TOPIC,
    language: "hi",
    outputLanguage: "hi",
    type: "Research-Based Book" as const,
    chapterCount: 14,
    audience: "Researchers",
    difficulty: "Advanced" as const,
  };

  const plan = plannedChaptersForTopic({ topic: TOPIC, settings, analysis, requestedCount: 14 });
  checks.push({ name: "Achhoot plan has 14 chapters", ok: plan.length === 14, detail: String(plan.length) });
  const titlesMatch = plan.every((p, i) => p.title === ACHHOOT_HINDI_TITLES[i]);
  checks.push({ name: "Achhoot titles match required 14", ok: titlesMatch, detail: plan.map((p) => p.title).join(" | ") });

  const emptyBundle = { sources: [], facts: [] };
  const items = plannedToOutlineItems(plan, emptyBundle);
  const metaOk = items.every(
    (it) =>
      it.chapterNumber &&
      it.title &&
      it.historicalScope &&
      (it.keyTopics || []).length &&
      (it.researchQuestion || (it.researchQuestions || []).length) &&
      (it.primarySources || []).length &&
      (it.secondarySources || []).length &&
      (it.claimsToVerify || []).length &&
      it.uncertaintyNotes &&
      it.evidenceVsInterpretation
  );
  checks.push({ name: "Every Achhoot chapter has required metadata", ok: metaOk });

  const built = buildOutlineFromResearch(settings, analysis, {
    sources: [],
    rejectedSources: [],
    researchQuality: { relevantCount: 0, rejectedCount: 0, generationBlocked: false, approved: [], rejected: [] },
    facts: [],
    wikiPages: [],
    images: [],
    insufficient: false,
    profile: buildTopicProfile(TOPIC, { category: "historical", type: "Research-Based Book" }),
  } as any);
  checks.push({
    name: "buildOutlineFromResearch returns 14 Hindi titles",
    ok: built.length === 14 && built[0].title === ACHHOOT_HINDI_TITLES[0] && built[13].title === ACHHOOT_HINDI_TITLES[13],
    detail: built.map((b) => b.title).join(" | "),
  });
  checks.push({
    name: "No generic Hindi template titles",
    ok: !built.some((b) => /यह विषय क्या है|आधार और शब्दावली|मूल विचार विस्तार से|विधियाँ और कार्य-प्रणाली|वास्तविक अनुप्रयोग/.test(b.title)),
  });

  const other = plannedChaptersForTopic({
    topic: "भारतीय स्वतंत्रता आंदोलन",
    settings: { ...settings, topic: "भारतीय स्वतंत्रता आंदोलन" },
    analysis: { ...analysis, topic: "भारतीय स्वतंत्रता आंदोलन", category: "historical" },
    requestedCount: 10,
  });
  checks.push({
    name: "Independence outline is topic-specific",
    ok: other.length >= 8 && other.some((c) => /स्वतंत्रता|1857|गाँधी|Quit India|भारत छोड़ो/.test(c.title)),
    detail: other.map((c) => c.title).slice(0, 4).join(" | "),
  });
  checks.push({
    name: "Independence outline does not reuse Ambedkar 14",
    ok: !other.some((c) => ACHHOOT_HINDI_TITLES.includes(c.title as any)),
  });

  const ancient = plannedChaptersForTopic({
    topic: "प्राचीन भारतीय समाज",
    settings: { ...settings, topic: "प्राचीन भारतीय समाज" },
    analysis: { ...analysis, topic: "प्राचीन भारतीय समाज" },
    requestedCount: 10,
  });
  checks.push({
    name: "Ancient society outline is distinct",
    ok: ancient.some((c) => /प्राचीन|वैदिक|वर्ण/.test(c.title)) && !ancient.some((c) => /Broken Men/.test(c.title)),
  });

  const chapter = composeHindiChapter({
    index: 0,
    item: fillOutlineItem(
      {
        id: "t1",
        title: ACHHOOT_HINDI_TITLES[0],
        summary: "परिभाषा",
        sourceIds: [],
        historicalScope: "1948",
        researchQuestion: "अछूत कौन थे?",
        keyTopics: ["अस्पृश्यता"],
        primarySources: ["The Untouchables (1948)"],
        secondarySources: ["Wikipedia"],
        claimsToVerify: ["पुस्तक की तिथि"],
        uncertaintyNotes: "परिकल्पना नहीं गढ़ें",
        evidenceVsInterpretation: "A स्थापित / C व्याख्या",
      },
      0,
      emptyBundle
    ),
    settings,
    analysis,
    sources: [
      {
        id: 1,
        title: "The Untouchables",
        organization: "Archive",
        url: "https://archive.org/details/untouchables",
        domain: "archive.org",
        snippet: "Ambedkar 1948",
        extractedText: "Ambedkar published The Untouchables in 1948.",
        retrievedAt: new Date().toISOString(),
        tier: 2,
        score: 90,
        used: true,
        primarySource: true,
      },
    ],
    facts: [],
  });
  checks.push({
    name: "Hindi chapter is Devanagari",
    ok: isAcceptableHindi(`${chapter.title} ${chapter.summary} ${chapter.sections.map((s) => s.html).join(" ")}`),
    detail: chapter.title,
  });

  const svg = coverSvg({
    title: TOPIC,
    subtitle: "ऐतिहासिक शोध",
    author: "Folio Research",
    style: "Historical",
    language: "hi",
    category: "historical",
  });
  checks.push({
    name: "Cover keeps Devanagari title",
    ok: svg.includes("अछूत") && /Noto Sans Devanagari/.test(svg) && !/Who Were They/.test(svg),
  });

  const fig = figuresToHtml(
    [
      {
        url: "/x.svg",
        caption: "चित्र 3.1 — डॉ. बी. आर. आंबेडकर के सार्वजनिक जीवन का संदर्भ",
        credit: "सत्यापित स्रोत",
        alt: "अध्याय के ऐतिहासिक संदर्भ को समझाने वाला चित्र।",
        license: "CC",
        sourceUrl: "/x.svg",
        imageType: "illustration",
        verifiedHistoricalPhoto: false,
        figureLabel: "चित्र 3.1 — डॉ. बी. आर. आंबेडकर के सार्वजनिक जीवन का संदर्भ",
      },
    ],
    "hi"
  );
  checks.push({
    name: "Figure HTML has caption, credit, illustration label",
    ok:
      fig.includes("चित्र 3.1") &&
      fig.includes("सत्यापित स्रोत") &&
      fig.includes("व्याख्यात्मक चित्र — यह ऐतिहासिक फोटोग्राफ नहीं है।"),
  });
  checks.push({ name: "Illustration SVG generates", ok: makeIllustrationSvg("timeline", TOPIC, ["1948", "1950"]).includes("1948") });

  chapter.images = [
    {
      url: "/x.svg",
      caption: "चित्र 1.1",
      credit: "Folio",
      alt: "व्याख्या",
      license: "gen",
      sourceUrl: "/x.svg",
      imageType: "illustration",
      verifiedHistoricalPhoto: false,
      figureLabel: "चित्र 1.1",
    },
  ];
  insertFiguresIntoChapter(chapter, "hi");
  checks.push({ name: "Figures insert into chapter HTML", ok: chapter.sections.some((s) => /ebook-figure/.test(s.html)) });

  const userId = "selftest-user";
  const first = createEbook(userId, { ...DEFAULT_SETTINGS, topic: "Selftest Unique Topic XYZ", language: "hi" });
  const dup = findRecentDuplicateDraft(userId, "Selftest Unique Topic XYZ");
  checks.push({ name: "Recent draft reuse", ok: Boolean(dup && dup.id === first.id), detail: first.ebookId });

  const updated = updateEbook(first.id, { title: "Updated once" });
  const listed = listEbooks(userId).filter((e) => e.id === first.id);
  checks.push({ name: "Update keeps one ebookId", ok: listed.length === 1 && updated?.ebookId === first.id, detail: updated?.ebookId });
  checks.push({ name: "ebookId equals id", ok: first.ebookId === first.id && getEbook(first.ebookId)?.id === first.id });

  const hindiBook = createEbook(userId, { ...DEFAULT_SETTINGS, topic: "Hindi Persistence Topic", language: "hi", outputLanguage: "hi" });
  const reloaded = getEbook(hindiBook.id);
  checks.push({
    name: "Hindi settings.language persists on hydrate",
    ok: reloaded?.settings.language === "hi" && reloaded?.outputLanguage === "hi",
    detail: `settings=${reloaded?.settings.language} out=${reloaded?.outputLanguage}`,
  });

  const titled = createEbook(userId, { ...DEFAULT_SETTINGS, topic: "Some Topic", language: "hi", customTitle: "अछूत कौन थे" });
  const titledReloaded = getEbook(titled.id);
  checks.push({
    name: "Custom Hindi title preserved",
    ok: titledReloaded?.title === "अछूत कौन थे",
    detail: titledReloaded?.title,
  });

  const once = createEbook(userId, {
    ...settings,
    customTitle: TOPIC,
    title: TOPIC,
  });
  updateEbook(once.id, { outline: built, analysis, chapterCount: built.length, status: "awaiting_outline" });
  const again = getEbook(once.id);
  checks.push({
    name: "Reopen preserves 14-chapter outline",
    ok: (again?.outline.length || 0) === 14 && again?.outline[3]?.title === ACHHOOT_HINDI_TITLES[3],
  });
  const afterRefresh = getEbook(once.ebookId);
  checks.push({
    name: "Refresh preserves same ebookId and outline",
    ok: afterRefresh?.ebookId === once.ebookId && afterRefresh?.outline.length === 14,
  });
  const pages = buildBookPages({
    ...afterRefresh!,
    chapters: [
      {
        ...chapter,
        title: ACHHOOT_HINDI_TITLES[0],
      },
    ],
    introduction: "भूमिका",
    conclusion: "निष्कर्ष",
    sources: [],
    glossary: [],
    faqs: [],
  } as any);
  checks.push({ name: "3D/reader pages include cover and chapter", ok: pages.some((p) => p.kind === "cover") && pages.some((p) => p.kind === "chapter") });
  checks.push({
    name: "Book pages include figure markup",
    ok: pages.some((p) => /ebook-figure|img src=/.test(p.html)),
  });

  const chaptered = researchOutlineChapters({
    analysis,
    outline: built,
    bundle: { sources: [], facts: [] },
  });
  checks.push({
    name: "Chapter research records match outline length",
    ok: chaptered.chapterResearch.length === built.length,
    detail: String(chaptered.chapterResearch.length),
  });

  const coverAgain = coverSvg({
    title: TOPIC,
    subtitle: "ऐतिहासिक शोध",
    author: "",
    style: "Documentary",
    language: "hi",
    category: "historical",
  });
  checks.push({
    name: "Cover regen keeps title and invents no author",
    ok: coverAgain.includes("अछूत") && !coverAgain.includes("Folio Research"),
  });
  checks.push({
    name: "Illustration disclaimer is explicit",
    ok: illustrationDisclaimer("hi").includes("ऐतिहासिक फोटोग्राफ नहीं"),
  });
  const cited = formatCitation({
    author: "B. R. Ambedkar",
    title: "The Untouchables",
    publication: "1948",
    year: "1948",
    url: "https://archive.org/details/untouchables",
  });
  checks.push({
    name: "Citation uses only real fields",
    ok: cited.includes("Ambedkar") && cited.includes("The Untouchables") && cited.includes("archive.org"),
  });
  const unverified = finalizeSourceRecord({
    id: 9,
    title: "Unverified note",
    organization: "",
    url: "",
    domain: "",
    snippet: "",
    extractedText: "",
    retrievedAt: new Date().toISOString(),
    tier: 9,
    score: 10,
    used: false,
  });
  checks.push({
    name: "Unverified source is labelled सत्यापन आवश्यक",
    ok: unverified.verificationStatus === "unverified" && Boolean(unverified.reliabilityNote?.includes(UNVERIFIED_LABEL)),
  });

  updateEbook(once.id, {
    sources: [
      finalizeSourceRecord({
        id: 1,
        title: "The Untouchables",
        organization: "Internet Archive",
        url: "https://archive.org/details/untouchables",
        domain: "archive.org",
        snippet: "1948",
        extractedText: "Ambedkar published The Untouchables in 1948.",
        retrievedAt: new Date().toISOString(),
        tier: 2,
        score: 90,
        used: true,
        primarySource: true,
        chapterIds: [built[0].id],
      }),
    ],
  });
  const withSources = getEbook(once.id);
  checks.push({
    name: "Sources persist on same ebookId",
    ok:
      withSources?.ebookId === once.ebookId &&
      withSources?.sources.length === 1 &&
      withSources?.sources[0]?.url === "https://archive.org/details/untouchables",
  });

  deleteEbook(once.id, userId);
  deleteEbook(titled.id, userId);
  deleteEbook(first.id, userId);
  deleteEbook(hindiBook.id, userId);

  return checks;
}

const isDirect = typeof require !== "undefined" && require.main === module;
if (isDirect) {
  const results = runUpgradeSelftest();
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  if (results.some((r) => !r.ok)) process.exit(1);
}
