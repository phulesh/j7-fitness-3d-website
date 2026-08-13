import { sourceTier } from "./rank";
import { domainOf } from "../http";
import type { ClaimKind, RejectedSource, ResearchQualityReport, SourceRecord } from "../types";

export const MIN_RELEVANCE = 70;
export const PREFERRED_AUTHORITY = 70;

export type TopicKind =
  | "named-work-inquiry"
  | "biography"
  | "scientific"
  | "technical"
  | "programming"
  | "legal"
  | "medical"
  | "historical"
  | "school"
  | "exam"
  | "general";

export interface ChapterPlanItem {
  title: string;
  summary: string;
}

export interface TopicProfile {
  topic: string;
  kind: TopicKind;
  workTitle?: string;
  author?: string;
  year?: string;
  coreTerms: string[];
  contextTerms: string[];
  researchQuestions: string[];
  searchQueries: string[];
  preferredDomains: string[];
  blockedOutlineTitles: string[];
  allowArxiv: boolean;
  allowGithub: boolean;
  allowPubmed: boolean;
  allowCrossref: boolean;
  allowBroadBiography: boolean;
  allowScientificPapers: boolean;
  chapterPlan?: ChapterPlanItem[];
  targetChapterCount?: { min: number; max: number };
  claimDiscipline: "historical-hypothesis" | "scientific" | "legal" | "general";
  imageQuery: string;
}

export interface SourceCandidate {
  title: string;
  url: string;
  snippet?: string;
  extractedText?: string;
  provider?: string;
  organization?: string;
}

export interface SourceEvaluation {
  accepted: boolean;
  relevanceScore: number;
  authorityScore: number;
  primarySource: boolean;
  academicSource: boolean;
  reasonForInclusion: string;
  rejectionReason?: string;
}

const QUERY_STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "are",
  "was",
  "were",
  "you",
  "your",
  "into",
  "about",
  "who",
  "why",
  "how",
  "what",
  "when",
  "they",
  "them",
  "their",
  "became",
  "become",
  "been",
  "being",
  "have",
  "has",
  "had",
  "did",
  "does",
  "book",
  "guide",
  "class",
  "chapter",
  "complete",
  "course",
  "doctor",
  "dr",
]);

const PHYSICS_MARKERS =
  /\b(gravitational waves?|ligo|virgo detector|pulsar timing|black[- ]hole merger|higgs boson|large hadron|quark|gluon|neutrino oscillation|dark matter particle|quantum chromodynamics|spacetime metric|interferometer|detector (noise|performance|sensitivity)|wave-?form template|general relativity|particle physics|collider|quantum field theory|lattice qcd|supersymmetry|axion|graviton)\b/i;

const ENTERTAINMENT_MARKERS =
  /\b(film|movie|soundtrack|tv series|television series|video game|feature film|directed by|eliot ness|al capone|kevin costner|de palma|prohibition agent|chicago outfit|box office)\b/i;

const STEM_ARXIV_HINT =
  /\b(arxiv\.org|hep-th|hep-ph|hep-ex|gr-qc|astro-ph|nucl-th|cond-mat|quant-ph|cs\.LG|physics\.)\b/i;

const BIOGRAPHY_DUMP =
  /\b(early life|personal life|family|death|assassination|electoral history|awards and honours|awards and honors|in popular culture|filmography|discography|complete works|selected works|bibliography|legacy and memorials)\b/i;

const GENERIC_WIKI_SECTIONS =
  /^(see also|references|external links|notes|bibliography|further reading|sources|citations|footnotes|works cited|official term|terminology)$/i;

const BLOCKED_WORK_INQUIRY_CHAPTERS =
  /^(religion|communism|indo-?aryan migrations?|in popular culture|works|terminology|official term|early life|personal life|death|family|electoral history|awards|filmography|discography|complete works)$/i;

export function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/[^ \p{L}\p{N}'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function distinctiveTerms(text: string): string[] {
  const raw = normalizeText(text)
    .split(" ")
    .filter((w) => w.length > 2 && !QUERY_STOP.has(w));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of raw) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

export function parseNamedWork(topic: string): { workTitle?: string; author?: string; question?: string; year?: string } {
  const cleaned = topic.replace(/\s+/g, " ").trim();
  const year = cleaned.match(/\b(1[6-9]\d{2}|20[0-2]\d)\b/)?.[1];
  let author: string | undefined;
  let rest = cleaned;

  const authorSplit = cleaned.split(/\s+[—–-]\s+(?=(?:dr\.?\s+)?[A-Z])/);
  if (authorSplit.length >= 2) {
    const maybeAuthor = authorSplit[authorSplit.length - 1].replace(/^dr\.?\s+/i, "").trim();
    if (/[A-Za-z]/.test(maybeAuthor) && maybeAuthor.split(/\s+/).length <= 8) {
      author = maybeAuthor.replace(/\s*\(\d{4}\)\s*$/, "").trim();
      rest = authorSplit.slice(0, -1).join(" — ");
    }
  }
  const byMatch = rest.match(/\s+by\s+(.+)$/i);
  if (byMatch && !author) {
    author = byMatch[1].replace(/^dr\.?\s+/i, "").trim();
    rest = rest.slice(0, byMatch.index).trim();
  }

  let workTitle: string | undefined;
  let question: string | undefined;
  const colon = rest.indexOf(":");
  if (colon > 2) {
    workTitle = rest.slice(0, colon).replace(/^["“]+|["”]+$/g, "").trim();
    question = rest.slice(colon + 1).trim();
  } else {
    const q = rest.match(/^(.+?)\s+(\?.+|\bwho\b.+\?|\bwhy\b.+\?)/i);
    if (q) {
      workTitle = q[1].replace(/^["“]+|["”]+$/g, "").trim();
      question = (q[2] || rest).trim();
    } else {
      workTitle = rest.replace(/^["“]+|["”]+$/g, "").trim();
    }
  }
  return { workTitle, author, question, year };
}

export function isAmbedkarUntouchablesTopic(topic: string): boolean {
  const raw = topic || "";
  const t = normalizeText(raw);
  if (/अछूत\s*कौन\s*थे/.test(raw) || /अछूत\s*कैसे\s*बने/.test(raw)) return true;
  if (/अस्पृश्य/.test(raw) && /आंबेडकर|अम्बेडकर|अछूत/.test(raw)) return true;
  const hasWork = /\buntouchable/.test(t) || /अछूत|अस्पृश्य/.test(raw);
  const hasAuthor = /\bambedkar\b/.test(t) || /आंबेडकर|अम्बेडकर/.test(raw);
  const hasQuestion =
    /\bwho were they\b|\bwhy they became\b|\bbroken men\b/.test(t) || /कौन थे|कैसे बने|अस्पृश्यता/.test(raw);
  return hasWork && (hasAuthor || hasQuestion);
}

function ambedkarUntouchablesProfile(topic: string): TopicProfile {
  const parsed = parseNamedWork(topic);
  const workTitle = parsed.workTitle || "The Untouchables";
  const author = parsed.author || "B. R. Ambedkar";
  const coreTerms = [
    "untouchable",
    "untouchables",
    "untouchability",
    "ambedkar",
    "broken men",
    "caste",
    "dalit",
    "beef",
    "cow",
    "brahmin",
    "brahmins",
    "buddhism",
    "buddhist",
    "buddhists",
    "village",
    "exclusion",
    "hindu",
    "hinduism",
    "constitution",
    "article 17",
    "1948",
    "shudra",
    "outcast",
    "outcaste",
  ];
  const researchQuestions = [
    "What is untouchability?",
    "Who were the Untouchables according to Ambedkar?",
    "What is Ambedkar's Broken Men theory?",
    "How did Ambedkar describe settled communities and Broken Men?",
    "Why did Ambedkar locate Broken Men on village outskirts, and how did that produce social exclusion?",
    "What relationship did Ambedkar propose between Broken Men and Buddhism?",
    "How did Ambedkar explain contempt for Buddhists?",
    "How did Ambedkar use beef-eating to explain untouchability?",
    "Did ancient Hindus eat beef, according to the evidence Ambedkar cites?",
    "Why did Brahmins give up beef according to Ambedkar?",
    "Why did non-Brahmins give up beef according to Ambedkar?",
    "Why did Broken Men allegedly continue beef-eating?",
    "When did Broken Men become Untouchables according to Ambedkar?",
    "What evidence does Ambedkar present?",
    "What assumptions and historical methods does Ambedkar use?",
    "What are the criticisms and limitations of his theory?",
    "How have later scholars interpreted The Untouchables?",
    "What is established evidence versus Ambedkar's hypothesis?",
    "How did the Constitution of India abolish untouchability?",
    "What should modern readers learn from the book?",
  ];
  const searchQueries = [
    `"The Untouchables: Who Were They and Why They Became Untouchables" Ambedkar`,
    `Ambedkar "The Untouchables" 1948 Broken Men`,
    `Ambedkar Broken Men theory untouchability Buddhism`,
    `Ambedkar beef eating Brahmins "The Untouchables"`,
    `Ambedkar Writings and Speeches "The Untouchables"`,
    `site:archive.org Ambedkar "The Untouchables" "Who Were They"`,
    `site:wikisource.org Ambedkar Untouchables`,
    `Untouchability Ambedkar Broken Men village outskirts`,
    `"Article 17" Constitution of India abolition of untouchability site:legislative.gov.in`,
    `scholarly criticism Ambedkar "Broken Men" untouchability`,
    `Ambedkar collected works The Untouchables university library`,
    `Did ancient Hindus eat beef Ambedkar evidence`,
  ];
  const chapterPlan: ChapterPlanItem[] = [
    {
      title: "What is untouchability?",
      summary:
        "Define untouchability as a social and historical practice. Separate legal description from lived exclusion. Do not treat later political biography as the subject.",
    },
    {
      title: "Who were the Untouchables according to Ambedkar?",
      summary:
        "State Ambedkar's own answer in The Untouchables (1948). Label this as the author's framing, not an uncontested census fact.",
    },
    {
      title: "Reading The Untouchables (1948)",
      summary:
        "Place the book among Ambedkar's writings: date, purpose, and how he poses the historical question. Use collected-works or library records where available. Do not survey his complete life or all political work.",
    },
    {
      title: "The Broken Men theory",
      summary:
        "Explain Ambedkar's Broken Men hypothesis as interpretation. Classify claims: primary-source evidence vs Ambedkar's interpretation vs later scholarly reading vs contested/uncertain.",
    },
    {
      title: "Settled communities and Broken Men",
      summary:
        "Reconstruct Ambedkar's contrast between settled village communities and Broken Men. Keep the account inside the book's argument.",
    },
    {
      title: "Village outskirts and social exclusion",
      summary:
        "How Ambedkar links residence outside the village to enduring exclusion. Distinguish description of the social pattern from his causal story.",
    },
    {
      title: "Broken Men and Buddhism",
      summary:
        "Ambedkar's proposed relationship between Broken Men and Buddhism. Treat the Buddhist identification as his thesis unless independent evidence is cited.",
    },
    {
      title: "Contempt for Buddhists",
      summary:
        "Why Ambedkar argued that contempt for Buddhists became a lasting social attitude. Mark this as author interpretation.",
    },
    {
      title: "Beef-eating as Ambedkar's proposed explanation",
      summary:
        "Present the beef-eating argument as Ambedkar's proposed explanation, not as universally established history.",
    },
    {
      title: "Did ancient Hindus eat beef? Brahmin and non-Brahmin renunciation",
      summary:
        "Follow Ambedkar's reading of ancient dietary practice, then his account of why Brahmins and later non-Brahmins abandoned beef. Separate cited texts from inference.",
    },
    {
      title: "Why Broken Men allegedly continued beef-eating — and when they became Untouchables",
      summary:
        "Ambedkar's chronology and mechanism. Keep dates and causal claims labelled as hypothesis where the book is inferential.",
    },
    {
      title: "Ambedkar's evidence, assumptions, and historical method",
      summary:
        "Inventory the kinds of evidence he uses and the assumptions required for the Broken Men story to work.",
    },
    {
      title: "Criticisms, limitations, and later scholarly interpretations",
      summary:
        "Report later scholarly readings and limits of the 1948 argument. Do not invent critics. If sources are thin, say so.",
    },
    {
      title: "Established evidence, constitutional abolition, and what readers should take from the book",
      summary:
        "Contrast what is established (including Article 17 and the modern legal ban on untouchability) with what remains Ambedkar's historical hypothesis. Close with what a careful modern reader can learn.",
    },
  ];
  return {
    topic,
    kind: "named-work-inquiry",
    workTitle,
    author,
    year: parsed.year || "1948",
    coreTerms,
    contextTerms: ["india", "hindu", "social", "history", "thesis", "theory", "harijan", "scheduled", "castes"],
    researchQuestions,
    searchQueries,
    preferredDomains: [
      "archive.org",
      "wikisource.org",
      "openlibrary.org",
      "loc.gov",
      "hathitrust.org",
      "legislative.gov.in",
      "india.gov.in",
      "mea.gov.in",
      "constitutionofindia.net",
      "prsindia.org",
      "britannica.com",
      "cambridge.org",
      "oup.com",
      "jstor.org",
      "ssrn.com",
      "edu",
      "ac.in",
      "ac.uk",
      "wikipedia.org",
    ],
    blockedOutlineTitles: [
      "religion",
      "communism",
      "indo-aryan migrations",
      "in popular culture",
      "works",
      "terminology",
      "official term",
      "early life",
      "personal life",
      "complete works",
      "filmography",
    ],
    allowArxiv: false,
    allowGithub: false,
    allowPubmed: false,
    allowCrossref: true,
    allowBroadBiography: false,
    allowScientificPapers: false,
    chapterPlan,
    targetChapterCount: { min: 14, max: 14 },
    claimDiscipline: "historical-hypothesis",
    imageQuery: "B. R. Ambedkar untouchability India historical",
  };
}

function genericProfile(topic: string, category: TopicKind, type: string): TopicProfile {
  const parsed = parseNamedWork(topic);
  const namedWork = Boolean(
    parsed.workTitle &&
      (parsed.author || parsed.question) &&
      !["biography", "scientific", "programming", "technical", "medical"].includes(category)
  );
  const kind: TopicKind = namedWork ? "named-work-inquiry" : category;
  const core = distinctiveTerms(`${parsed.workTitle || topic} ${parsed.author || ""}`);
  const allowStem = ["scientific", "technical", "programming", "medical"].includes(kind);
  const queries = [
    parsed.workTitle && parsed.author ? `"${parsed.workTitle}" ${parsed.author}` : topic,
    parsed.question ? `${parsed.workTitle || topic} ${parsed.question}` : `${topic} overview`,
    parsed.author && !namedWork ? `${parsed.author} ${parsed.workTitle || topic}` : `${topic} primary sources`,
  ].filter(Boolean) as string[];

  return {
    topic,
    kind,
    workTitle: parsed.workTitle,
    author: parsed.author,
    year: parsed.year,
    coreTerms: core.slice(0, 24),
    contextTerms: [],
    researchQuestions: parsed.question ? [parsed.question] : [`What is reliably known about ${topic}?`],
    searchQueries: [...new Set(queries)].slice(0, 12),
    preferredDomains: [],
    blockedOutlineTitles: namedWork
      ? ["in popular culture", "works", "terminology", "official term", "communism", "indo-aryan migrations"]
      : [],
    allowArxiv: allowStem,
    allowGithub: kind === "programming" || kind === "technical",
    allowPubmed: kind === "medical",
    allowCrossref: allowStem || kind === "historical" || kind === "named-work-inquiry" || namedWork,
    allowBroadBiography: kind === "biography" || type === "Biography",
    allowScientificPapers: allowStem,
    claimDiscipline: kind === "historical" || namedWork ? "historical-hypothesis" : kind === "legal" ? "legal" : kind === "scientific" ? "scientific" : "general",
    imageQuery: parsed.workTitle && parsed.author ? `${parsed.workTitle} ${parsed.author}` : topic,
  };
}

export function buildTopicProfile(
  topic: string,
  opts: { category?: string; type?: string; language?: string } = {}
): TopicProfile {
  if (isAmbedkarUntouchablesTopic(topic)) return ambedkarUntouchablesProfile(topic);
  const category = (opts.category || "general") as TopicKind;
  return genericProfile(topic, category, opts.type || "");
}

function haystack(c: SourceCandidate): string {
  return `${c.title || ""}\n${c.snippet || ""}\n${c.extractedText || ""}`;
}

function contentHaystack(c: SourceCandidate): string {
  return `${c.snippet || ""}\n${c.extractedText || ""}`;
}

export function looksLikeUnrelatedPhysics(candidate: SourceCandidate, profile: TopicProfile): boolean {
  if (profile.allowScientificPapers) return false;
  const blob = haystack(candidate);
  if (PHYSICS_MARKERS.test(blob) || STEM_ARXIV_HINT.test(`${candidate.url} ${blob}`)) return true;
  if (/arxiv\.org/i.test(candidate.url) && !profile.allowArxiv) return true;
  if ((candidate.provider || "").toLowerCase() === "arxiv" && !profile.allowArxiv) return true;
  return false;
}

export function looksLikeEntertainmentHomonym(candidate: SourceCandidate, profile: TopicProfile): boolean {
  if (profile.kind !== "named-work-inquiry") return false;
  const blob = haystack(candidate);
  const title = candidate.title || "";
  if (/\((film|tv series|album|video game|soundtrack|novel)\)/i.test(title) && !mentionsCore(blob, profile, 2)) {
    return true;
  }
  if (ENTERTAINMENT_MARKERS.test(blob) && !mentionsCore(blob, profile, 2)) return true;
  if (profile.workTitle && /untouchables/i.test(profile.workTitle)) {
    if (/\b(eliot ness|al capone|kevin costner|de palma|prohibition)\b/i.test(blob) && !/\bambedkar|untouchability|caste|dalit|broken men\b/i.test(blob)) {
      return true;
    }
  }
  return false;
}

function mentionsCore(text: string, profile: TopicProfile, min: number): boolean {
  const n = normalizeText(text);
  let hits = 0;
  for (const term of profile.coreTerms) {
    if (n.includes(normalizeText(term))) hits++;
    if (hits >= min) return true;
  }
  return false;
}

function termHits(text: string, terms: string[]): string[] {
  const n = normalizeText(text);
  return terms.filter((t) => n.includes(normalizeText(t)));
}

export function isPreferredDomain(url: string, profile: TopicProfile): boolean {
  const d = domainOf(url).toLowerCase();
  return profile.preferredDomains.some((x) => d === x || d.endsWith(x) || d.includes(x));
}

export function isPrimarySourceUrl(url: string, title: string, profile: TopicProfile): boolean {
  const d = domainOf(url).toLowerCase();
  const blob = normalizeText(`${title} ${url}`);
  const work = profile.workTitle ? normalizeText(profile.workTitle) : "";
  const author = profile.author ? normalizeText(profile.author) : "";
  if (/(archive\.org|wikisource\.org|gutenberg\.org|hathitrust\.org)/.test(d)) {
    if ((work && blob.includes(work.split(" ")[0] || work)) || (author && blob.includes(author.split(" ").pop() || author))) {
      return true;
    }
  }
  if (/legislative\.gov\.in|india\.gov\.in|constitution/.test(d + blob) && /article 17|untouchability|constitution/.test(blob + normalizeText(profile.topic))) {
    return /untouchab|article 17|constitution/.test(blob) || profile.claimDiscipline === "legal";
  }
  if (/collected works|writings and speeches/.test(blob) && author && blob.includes(author.split(" ").pop() || "")) return true;
  return false;
}

export function isAcademicSourceUrl(url: string): boolean {
  const d = domainOf(url).toLowerCase();
  return (
    /\.edu$|\.ac\.in$|\.ac\.uk$|jstor\.org|cambridge\.org|oup\.com|springer\.com|wiley\.com|ssrn\.com|tandfonline\.com|sagepub\.com|doi\.org|crossref\.org/.test(
      d
    ) || d.includes(".edu")
  );
}

export function authorityScoreFor(url: string, profile: TopicProfile, primary: boolean, academic: boolean): number {
  const tier = sourceTier(url);
  const base: Record<number, number> = { 1: 96, 2: 92, 3: 88, 4: 84, 5: 80, 6: 86, 7: 72, 8: 62, 9: 42 };
  let score = base[tier] ?? 42;
  if (primary) score = Math.max(score, 90);
  if (academic) score = Math.max(score, 78);
  if (isPreferredDomain(url, profile)) score = Math.min(100, score + 6);
  if (/arxiv\.org/i.test(url) && !profile.allowArxiv) score = Math.min(score, 20);
  return Math.max(0, Math.min(100, score));
}

export function evaluateCandidate(
  candidate: SourceCandidate,
  profile: TopicProfile,
  extras: { researchQuestions?: string[]; outlineTitles?: string[] } = {}
): SourceEvaluation {
  const title = candidate.title || "";
  const url = candidate.url || "";
  const content = contentHaystack(candidate);
  const inspected = content.replace(/\s+/g, " ").trim();
  const full = haystack(candidate);
  const questions = extras.researchQuestions || profile.researchQuestions;
  const outline = extras.outlineTitles || profile.chapterPlan?.map((c) => c.title) || [];

  if (!url && !title) {
    return reject(0, 0, false, false, "Empty record — no title or URL.");
  }

  if (!profile.allowGithub && (/github\.com/i.test(url) || candidate.provider === "github")) {
    return reject(8, authorityScoreFor(url, profile, false, false), false, false, "GitHub repository is not an appropriate source for this topic.");
  }

  if (looksLikeUnrelatedPhysics(candidate, profile)) {
    return reject(
      4,
      authorityScoreFor(url, profile, false, true),
      false,
      true,
      "Unrelated scientific paper (physics / gravitational waves / particle physics / detector performance). Not semantically relevant to the requested topic."
    );
  }

  if (looksLikeEntertainmentHomonym(candidate, profile)) {
    return reject(
      12,
      authorityScoreFor(url, profile, false, false),
      false,
      false,
      "Entertainment homonym (film, television, or popular-culture work) rather than the requested historical/scholarly subject."
    );
  }

  if (!profile.allowBroadBiography && BIOGRAPHY_DUMP.test(title) && !mentionsCore(inspected || title, profile, 2)) {
    return reject(18, authorityScoreFor(url, profile, false, false), false, false, "Unrelated biography dump; the ebook is not a complete life of the author.");
  }

  const primary = isPrimarySourceUrl(url, title, profile);
  const academic = isAcademicSourceUrl(url);
  const authority = authorityScoreFor(url, profile, primary, academic);

  // Title alone is never enough.
  const titleHits = termHits(title, profile.coreTerms);
  const contentHits = inspected.length >= 40 ? termHits(inspected, profile.coreTerms) : [];
  const fullHits = termHits(full, profile.coreTerms);
  const questionBlob = normalizeText(questions.join(" "));
  const outlineBlob = normalizeText(outline.join(" "));
  const inspectedN = normalizeText(inspected);
  const questionHits = inspected.length >= 40 ? distinctiveTerms(questionBlob).filter((t) => inspectedN.includes(t) && t.length > 4).length : 0;
  const outlineHits = inspected.length >= 40 ? distinctiveTerms(outlineBlob).filter((t) => inspectedN.includes(t) && t.length > 4).length : 0;

  let relevance = 0;
  if (profile.workTitle && normalizeText(full).includes(normalizeText(profile.workTitle))) relevance += inspected.length >= 40 ? 22 : 8;
  if (profile.author) {
    const authorLast = normalizeText(profile.author).split(" ").pop() || "";
    if (authorLast && normalizeText(full).includes(authorLast)) relevance += inspected.length >= 40 ? 16 : 6;
  }
  relevance += Math.min(36, contentHits.length * 7);
  relevance += Math.min(12, titleHits.length * 3);
  // A title that matches the requested topic (exactly, or as a full phrase) is
  // strong evidence of relevance when the inspected content also confirms the
  // core terms. Without this, short topics whose profile has only one or two
  // distinctive terms (e.g. "Artificial Intelligence") could never reach the
  // inclusion threshold even for a perfect on-topic source.
  const topicNorm = normalizeText(profile.topic);
  const titleNorm = normalizeText(title);
  const titleIsTopic =
    titleNorm.length >= 4 &&
    (titleNorm === topicNorm ||
      (titleNorm.split(" ").length >= 2 && topicNorm.includes(titleNorm)) ||
      (topicNorm.split(" ").length >= 2 && titleNorm.includes(topicNorm)));
  if (titleIsTopic && contentHits.length >= 1) relevance += 30;
  relevance += Math.min(12, Math.floor(questionHits / 2) * 3);
  relevance += Math.min(8, Math.floor(outlineHits / 2) * 2);
  if (primary && contentHits.length >= 1) relevance += 8;
  if (isPreferredDomain(url, profile) && contentHits.length >= 2) relevance += 5;

  if (inspected.length < 40) {
    // Title-only: hard cap below the inclusion threshold.
    relevance = Math.min(relevance, 55);
  }

  if (profile.kind === "named-work-inquiry" && contentHits.length === 0 && inspected.length >= 40) {
    relevance = Math.min(relevance, 48);
  }

  if (!profile.allowBroadBiography && /^(b\.?\s*r\.?\s*)?ambedkar$/i.test(title.trim()) && contentHits.filter((t) => /untouch|caste|dalit|broken|beef|buddh/.test(t)).length < 2) {
    relevance = Math.min(relevance, 62);
  }

  relevance = Math.max(0, Math.min(100, Math.round(relevance)));

  if (relevance < MIN_RELEVANCE) {
    const why =
      inspected.length < 40
        ? "Rejected because only the title was available; source content/snippet must be inspected and did not establish topical relevance."
        : contentHits.length === 0
          ? `Snippet/content does not discuss the topic's core terms (${profile.coreTerms.slice(0, 6).join(", ")}).`
          : `Relevance score ${relevance} is below the ${MIN_RELEVANCE} inclusion threshold.`;
    return reject(relevance, authority, primary, academic, why);
  }

  const reasonBits = [];
  if (primary) reasonBits.push("primary/authoritative record");
  if (academic) reasonBits.push("academic source");
  if (contentHits.length) reasonBits.push(`content matches ${contentHits.slice(0, 6).join(", ")}`);
  if (profile.workTitle && normalizeText(full).includes(normalizeText(profile.workTitle))) reasonBits.push(`discusses ${profile.workTitle}`);
  const reasonForInclusion = reasonBits.join("; ") || "Semantically relevant to the requested topic after inspecting the snippet/content.";

  return {
    accepted: true,
    relevanceScore: relevance,
    authorityScore: authority,
    primarySource: primary,
    academicSource: academic,
    reasonForInclusion,
  };
}

function reject(
  relevanceScore: number,
  authorityScore: number,
  primarySource: boolean,
  academicSource: boolean,
  rejectionReason: string
): SourceEvaluation {
  return {
    accepted: false,
    relevanceScore,
    authorityScore,
    primarySource,
    academicSource,
    reasonForInclusion: "",
    rejectionReason,
  };
}

export function isBlockedOutlineTitle(title: string, profile: TopicProfile): boolean {
  const t = title.trim();
  if (GENERIC_WIKI_SECTIONS.test(t)) return true;
  if (profile.blockedOutlineTitles.some((b) => normalizeText(t) === normalizeText(b))) return true;
  if (profile.kind === "named-work-inquiry" && BLOCKED_WORK_INQUIRY_CHAPTERS.test(t)) return true;
  if (!profile.allowBroadBiography && BIOGRAPHY_DUMP.test(t)) return true;
  if (!/indo-?aryan/.test(normalizeText(profile.topic)) && /indo-?aryan/.test(t)) return true;
  return false;
}

export function sectionIsRelevant(
  section: { title: string; extract: string },
  profile: TopicProfile
): boolean {
  if (isBlockedOutlineTitle(section.title, profile)) return false;
  const ev = evaluateCandidate(
    {
      title: section.title,
      url: "https://en.wikipedia.org/wiki/Section",
      snippet: section.extract.slice(0, 500),
      extractedText: section.extract.slice(0, 4000),
    },
    profile
  );
  // Sections can be slightly more lenient if they hit core thesis terms.
  if (ev.accepted) return true;
  return mentionsCore(`${section.title} ${section.extract}`, profile, 2) && !isBlockedOutlineTitle(section.title, profile);
}

export function queryIsOnTopic(query: string, profile: TopicProfile): boolean {
  const n = normalizeText(query);
  if (!profile.allowScientificPapers && PHYSICS_MARKERS.test(query)) return false;
  if (!profile.allowBroadBiography && /\b(complete biography|life and works|in popular culture|filmography)\b/i.test(query)) {
    return false;
  }
  if (profile.kind === "named-work-inquiry") {
    return mentionsCore(query, profile, 1) || (profile.workTitle ? n.includes(normalizeText(profile.workTitle.split(":")[0])) : false);
  }
  return distinctiveTerms(profile.topic).some((t) => n.includes(t));
}

export function filterQueries(queries: string[], profile: TopicProfile): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const q of [...profile.searchQueries, ...queries]) {
    const k = q.toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    if (!queryIsOnTopic(q, profile)) continue;
    seen.add(k);
    out.push(q);
  }
  return out.slice(0, 12);
}

export function classifyClaim(text: string, profile: TopicProfile): ClaimKind {
  const t = text.toLowerCase();
  if (/\b(article 17|constitution of india|legislative\.gov|official gazette|enacted|is abolished)\b/.test(t)) {
    return "primary-source-evidence";
  }
  if (
    /\b(according to ambedkar|ambedkar argues|ambedkar proposed|ambedkar suggests|ambedkar's theory|broken men theory|in the untouchables \(1948\))\b/.test(t) ||
    /आंबेडकर (के अनुसार|का तर्क|की व्याख्या|ने प्रस्तावित)|ब्रोकन मेन|Broken Men/.test(text)
  ) {
    return "author-interpretation";
  }
  if (profile.author) {
    const last = profile.author.split(/\s+/).pop()?.toLowerCase();
    if (last && new RegExp(`\\b${last} (argues|argued|proposed|suggests|wrote|claims|hypothes)`).test(t)) {
      return "author-interpretation";
    }
  }
  if (/\b(later scholars?|historians? have|subsequent (research|scholarship)|critics? (argue|note)|has been criticised|has been criticized)\b/.test(t)) {
    return "later-scholarly-interpretation";
  }
  if (/\b(hypothesis|hypothesised|hypothesized|alleged|allegedly|may have|might have|uncertain|contested|not established|proposed explanation)\b/.test(t)) {
    return "contested-uncertain";
  }
  if (
    profile.claimDiscipline === "historical-hypothesis" &&
    /\b(broken men|beef-eating|became untouchables|brahmanism)\b/.test(t)
  ) {
    return "author-interpretation";
  }
  if (/गोमांस|Beef-eating|बौद्ध धर्म और ब्राह्मण|अस्पृश्यता के उद्भव/.test(text) && profile.claimDiscipline === "historical-hypothesis") {
    return "author-interpretation";
  }
  if (/\b(primary source|original text|collected works|writings and speeches)\b/.test(t)) return "primary-source-evidence";
  return profile.claimDiscipline === "historical-hypothesis" ? "contested-uncertain" : "primary-source-evidence";
}

export function claimKindLabel(kind: ClaimKind): string {
  switch (kind) {
    case "primary-source-evidence":
      return "Primary-source evidence";
    case "author-interpretation":
      return "Author's interpretation";
    case "later-scholarly-interpretation":
      return "Later scholarly interpretation";
    default:
      return "Contested / uncertain";
  }
}

export function buildResearchQuality(
  approved: SourceRecord[],
  rejected: RejectedSource[]
): ResearchQualityReport {
  const junk = approved.filter((s) => (s.relevanceScore ?? 0) < MIN_RELEVANCE);
  const generationBlocked = approved.length < 2 || junk.length > 0;
  let contaminationReason: string | undefined;
  if (junk.length > 0) {
    contaminationReason = `${junk.length} unrelated source(s) remain in the approved list. Ebook writing is blocked until research is clean.`;
  } else if (approved.length < 2) {
    contaminationReason =
      "Not enough semantically relevant sources remained after filtering. Ebook writing is blocked rather than filling the list with unrelated results.";
  }
  return {
    relevantCount: approved.length,
    rejectedCount: rejected.length,
    generationBlocked,
    contaminationReason,
    approved: approved.map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      organization: s.organization,
      relevanceScore: s.relevanceScore ?? 0,
      authorityScore: s.authorityScore ?? 0,
      primarySource: Boolean(s.primarySource),
      academicSource: Boolean(s.academicSource),
      reasonForInclusion: s.reasonForInclusion || "",
    })),
    rejected,
  };
}

export function toRejected(candidate: SourceCandidate, ev: SourceEvaluation): RejectedSource {
  return {
    title: candidate.title || candidate.url,
    url: candidate.url,
    snippet: (candidate.snippet || "").slice(0, 240),
    provider: candidate.provider,
    relevanceScore: ev.relevanceScore,
    rejectionReason: ev.rejectionReason || "Failed relevance threshold.",
  };
}

export function annotateSource(source: SourceRecord, ev: SourceEvaluation): SourceRecord {
  return {
    ...source,
    relevanceScore: ev.relevanceScore,
    authorityScore: ev.authorityScore,
    primarySource: ev.primarySource,
    academicSource: ev.academicSource,
    reasonForInclusion: ev.reasonForInclusion,
    score: ev.relevanceScore,
    used: ev.accepted && (source.extractedText || "").length > 80,
  };
}
