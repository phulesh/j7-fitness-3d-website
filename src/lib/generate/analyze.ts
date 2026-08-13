import { detectScriptLanguage, resolveOutputLanguage, wikiLang } from "../language";
import { wikiSearch } from "../research/wikipedia";
import { searchCorpus } from "../research/corpus";
import { buildTopicProfile, isAmbedkarUntouchablesTopic } from "../research/relevance";
import type { EbookSettings, TopicAnalysis, TopicCategory, SyllabusInfo } from "../types";

const COPYRIGHT_HINTS =
  /\b(harry potter|lord of the rings|game of thrones|hunger games|twilight saga|narnia|atomic habits|rich dad|think and grow rich|alchemist by|to kill a mockingbird|pride and prejudice|1984 orwell|the great gatsby|wings of fire|ikigai)\b/i;

export async function analyzeTopic(settings: EbookSettings, syllabusText?: string): Promise<TopicAnalysis> {
  const topic = settings.topic.trim();
  const detectedLanguage = detectScriptLanguage(topic);
  const chosen = settings.outputLanguage && settings.outputLanguage !== "auto" ? settings.outputLanguage : settings.language;
  const outputLanguage = resolveOutputLanguage(chosen, topic);
  const category = categorize(topic, settings.type);
  const sensitive = sensitiveDomain(topic, category);
  const copyrightMode = isLikelyCopyrightedWork(topic, settings.type);
  const needsCurrentInfo = /current|latest|202[3-9]|2026|news|election|budget|version|update|recent/i.test(topic) ||
    category === "technical" ||
    category === "programming" ||
    category === "financial";

  const wikiLanguage = wikiLang(outputLanguage);
  const profile = buildTopicProfile(topic, { category, type: settings.type, language: outputLanguage });
  const queries = profile.searchQueries.length
    ? profile.searchQueries
    : buildSearchQueries(topic, category, settings, outputLanguage);

  let summary = `Educational ebook on “${topic}” for ${settings.audience} at ${settings.difficulty} level.`;
  const local = searchCorpus(topic, 1);
  if (local[0]?.extract) summary = local[0].extract.split("\n").find((l) => l.trim().length > 80) || local[0].snippet;
  try {
    const hits = await wikiSearch(topic, wikiLanguage === "en" ? "en" : wikiLanguage, 3);
    if (hits[0]?.snippet) summary = hits[0].snippet;
    else {
      const en = await wikiSearch(topic, "en", 2);
      if (en[0]?.snippet) summary = en[0].snippet;
    }
  } catch {
    /* keep corpus / default */
  }

  return {
    topic,
    normalizedTitle: settings.title?.trim() || prettifyTitle(topic, settings.type, copyrightMode),
    subtitle: settings.subtitle?.trim() || defaultSubtitle(settings, category),
    detectedLanguage,
    outputLanguage,
    category,
    audienceSuggestion: settings.audience,
    needsCurrentInfo,
    copyrightMode,
    copyrightNotice: copyrightMode
      ? "This topic matches a likely copyrighted work. Folio will generate an original study guide, analysis, and notes — not a reproduction of the original book."
      : undefined,
    sensitiveDomain: sensitive,
    prioritySourceHints: priorityHints(category, topic),
    searchQueries: queries,
    wikiLanguage,
    summary,
    researchQuestions: profile.researchQuestions,
    topicKind: profile.kind,
    workTitle: profile.workTitle,
    authorName: profile.author,
    focusTerms: profile.coreTerms,
    allowBiography: profile.allowBroadBiography,
    allowScientificPapers: profile.allowScientificPapers,
  };
}

export function categorize(topic: string, type: string): TopicCategory {
  const t = `${topic} ${type}`.toLowerCase();
  if (isAmbedkarUntouchablesTopic(topic) || /\b(untouchab|broken men|dalit history|caste history)\b/.test(t)) {
    return "historical";
  }
  if (/\b(python|javascript|java\b|c\+\+|programming|react|sql|linux|git|html|css|api|coding)\b/.test(t))
    return "programming";
  if (/\b(machine learning|data science|neural|algorithm|engineering|software|network|database|cloud|ai |artificial intelligence|automation)\b/.test(t))
    return "technical";
  if (/\b(upsc|neet|jee|ssc|bank exam|cat exam|gate |ias |ips |competitive|mcq)\b/.test(t)) return "exam";
  if (/\b(class \d|ncert|cbse|icse|grade \d|school|chapter \d)\b/.test(t)) return "school";
  if (/\b(constitution|law|ipc|crpc|article \d|supreme court|legal|rights)\b/.test(t)) return "legal";
  if (/\b(medicine|anatomy|physiology|disease|clinical|pharma|diagnosis|who |cdc )\b/.test(t)) return "medical";
  if (/\b(finance|stock|invest|accounting|tax|economy|banking|gdp)\b/.test(t)) return "financial";
  if (/\b(history|civilization|empire|war|independence|ancient|medieval|who were they|why they became)\b/.test(t))
    return "historical";
  if (/\b(biography|life of|autobiography)\b/.test(t) || type === "Biography") {
    // A named historical work plus an author is not a life-and-works biography.
    if (/untouchab|annihilation of caste|who were the shudras/.test(t)) return "historical";
    return "biography";
  }
  if (/\b(physics|chemistry|biology|science|quantum|photosynthesis|cell |atom)\b/.test(t)) return "scientific";
  if (/\b(english speaking|grammar|vocabulary|language course|ielts|toefl)\b/.test(t)) return "language";
  if (type.includes("Professional") || /\b(management|marketing|leadership|career)\b/.test(t)) return "professional";
  if (type.includes("Research")) return "academic";
  return "academic";
}

function sensitiveDomain(topic: string, cat: TopicCategory): TopicAnalysis["sensitiveDomain"] {
  if (cat === "medical") return "medical";
  if (cat === "legal") return "legal";
  if (cat === "financial") return "financial";
  if (cat === "scientific") return "scientific";
  return "none";
}

function isLikelyCopyrightedWork(topic: string, type: string): boolean {
  if (COPYRIGHT_HINTS.test(topic)) return true;
  if (/\b(by [A-Z][a-z]+ [A-Z][a-z]+)\b/.test(topic) && /novel|book|saga|series/i.test(topic)) return true;
  // Don't treat textbooks/subjects as copyrighted works
  if (/\b(class|ncert|course|guide|history of|introduction to|for beginners)\b/i.test(topic)) return false;
  return false;
}

function prettifyTitle(topic: string, type: string, copyrightMode: boolean): string {
  const cleaned = topic.replace(/\s+/g, " ").trim();
  if (copyrightMode) return `Study Guide: ${cleaned}`;
  if (type === "Question Bank") return `${cleaned} — Question Bank`;
  if (type === "Revision Notes") return `${cleaned} — Revision Notes`;
  if (type === "Complete Beginner Guide") return `${cleaned}: A Complete Beginner’s Guide`;
  return cleaned.replace(/\b\w/g, (m) => m.toUpperCase()) === cleaned ? cleaned : cleaned;
}

function defaultSubtitle(settings: EbookSettings, category: TopicCategory): string {
  const bits = [settings.type, settings.difficulty, settings.audience];
  if (category === "exam") return "A source-backed exam guide with concepts, practice, and recall";
  if (category === "programming") return "A practical, example-driven course built from official docs and references";
  if (category === "historical") return "A researched narrative with dates, sources, and context";
  return bits.join(" · ");
}

export function buildSearchQueries(
  topic: string,
  category: TopicCategory,
  settings: EbookSettings,
  lang: string
): string[] {
  const q = [topic];
  q.push(`${topic} overview`);
  q.push(`${topic} official`);
  if (category === "school" || category === "exam") {
    q.push(`${topic} NCERT`);
    q.push(`${topic} site:ncert.nic.in`);
    q.push(`${topic} site:cbse.gov.in syllabus`);
    q.push(`${topic} site:education.gov.in`);
  }
  if (category === "legal") {
    q.push(`${topic} site:legislative.gov.in`);
    q.push(`${topic} site:india.gov.in`);
    q.push(`${topic} PRS India`);
  }
  if (category === "programming") {
    q.push(`${topic} official documentation`);
    q.push(`${topic} site:docs.python.org`);
    q.push(`${topic} site:developer.mozilla.org`);
  }
  if (category === "medical") {
    q.push(`${topic} site:who.int`);
    q.push(`${topic} site:nih.gov`);
    q.push(`${topic} site:cdc.gov`);
  }
  if (category === "scientific") {
    q.push(`${topic} site:nasa.gov OR site:nih.gov OR site:britannica.com`);
    q.push(`${topic} review article`);
  }
  if (category === "historical" || category === "biography") {
    q.push(`${topic} site:britannica.com`);
    q.push(`${topic} primary sources`);
  }
  if (lang !== "en") q.push(topic);
  if (settings.type === "Competitive Exam Guide") q.push(`${topic} syllabus important topics`);
  return [...new Set(q)].slice(0, 10);
}

export function priorityHints(category: TopicCategory, topic: string): string[] {
  const base = ["Government websites", "Official institutions", "Universities", "Official documentation"];
  if (category === "school") return ["NCERT", "CBSE / NTA", "Government education portals", "Universities", ...base];
  if (category === "legal") return ["legislative.gov.in", "Supreme Court / official gazettes", "PRS India", ...base];
  if (category === "programming") return ["Official language/framework docs", "MDN / standards", "Universities", ...base];
  if (category === "medical") return ["WHO", "NIH / CDC", "Peer-reviewed reviews", ...base];
  if (category === "historical") return ["Government archives", "Universities", "Britannica / libraries", ...base];
  return base;
}

export function detectVagueness(topic: string): string | null {
  const t = topic.trim();
  if (t.length < 3) return "Please provide a more specific topic.";
  const vague = /^(stuff|things|topic|subject|book|test|hello|abc|asdf|something|anything|help|ebook)$/i;
  if (vague.test(t)) return "Please provide a more specific topic.";
  if (t.split(/\s+/).length === 1 && t.length < 4) return "Please provide a more specific topic.";
  return null;
}

export function parseSyllabusText(text: string): SyllabusInfo {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const units: SyllabusInfo["units"] = [];
  let current: SyllabusInfo["units"][0] | null = null;

  const unitRe = /^(unit|module|paper|part|section)\s*[\dIVXLC. :-]+(.+)$/i;
  const chapterRe = /^(chapter|ch\.?|lesson|topic)\s*[\dIVXLC. :-]+(.+)$/i;
  const objRe = /^(objective|learning outcome|students will)[:\s-]+(.+)$/i;

  for (const line of lines) {
    const u = line.match(unitRe);
    const c = line.match(chapterRe);
    const o = line.match(objRe);
    if (u) {
      current = { title: line.replace(/^[\d.)\s-]+/, "").slice(0, 160), topics: [], objectives: [] };
      units.push(current);
    } else if (c) {
      if (!current) {
        current = { title: "Syllabus", topics: [], objectives: [] };
        units.push(current);
      }
      current.topics.push(line.replace(/^(chapter|ch\.?|lesson|topic)\s*/i, "").slice(0, 160));
    } else if (o) {
      if (!current) {
        current = { title: "Syllabus", topics: [], objectives: [] };
        units.push(current);
      }
      current.objectives.push(o[2].slice(0, 200));
    } else if (/^[\dIVXLC]+[.)]\s+\S/.test(line) || /^[-•]\s+\S/.test(line)) {
      if (!current) {
        current = { title: "Topics", topics: [], objectives: [] };
        units.push(current);
      }
      current.topics.push(line.replace(/^[\dIVXLC.)•\-\s]+/, "").slice(0, 160));
    }
  }

  const blob = text.slice(0, 2500);
  const subject = blob.match(/subject\s*[:\-]\s*(.+)/i)?.[1]?.split("\n")[0];
  const classLevel = blob.match(/\b(class|grade|standard)\s*[:\- ]\s*([0-9IVXLC]{1,4}[A-Z+\-]*)/i)?.[0];
  const board = blob.match(/\b(CBSE|ICSE|ISC|NIOS|State Board|NCERT|Cambridge|IB|SSC|HSC|UPSC|NEET|JEE)\b/i)?.[0];

  return {
    detected: units.length > 0 || Boolean(subject || board),
    subject: subject?.slice(0, 120),
    classLevel,
    board,
    units: units.slice(0, 30),
    fromUpload: true,
    lastVerified: new Date().toISOString().slice(0, 10),
  };
}
