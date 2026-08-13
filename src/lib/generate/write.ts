import { nanoid } from "nanoid";
import { chat, aiConfigured, RESEARCH_WRITER_SYSTEM } from "../ai";
import { splitSentences, extractKeyTerms } from "../research/extract";
import { searchCommonsImages } from "../research/commons";
import type {
  Chapter,
  ChapterSection,
  EbookSettings,
  ExtractedFact,
  GlossaryEntry,
  FaqItem,
  OutlineItem,
  QuizItem,
  SourceRecord,
  TopicAnalysis,
  ChapterImage,
  FactFlag,
} from "../types";
import type { ResearchBundle } from "../research/pipeline";
import { buildTopicProfile, claimKindLabel, classifyClaim } from "../research/relevance";
import { isHindiOutput } from "../language";
import { chapterPlain, countWords, escapeHtml, labelsFor } from "./text";
import {
  composeHindiChapter,
  composeHindiFrontMatter,
  ensureHindiChapter,
  hindiWriterPromptAddon,
  localizeTitle,
} from "./hindi";
import { figuresToHtml } from "./images";

export { chapterPlain, countWords, escapeHtml, labelsFor } from "./text";

export function sourceListForPrompt(sources: SourceRecord[]): string {
  return sources
    .slice(0, 24)
    .map((s) => `[${s.id}] ${s.title} — ${s.organization} — ${s.url}`)
    .join("\n");
}

function notesForChapter(
  item: OutlineItem,
  bundle: ResearchBundle,
  settings: EbookSettings
): { notes: string; sourceIds: number[]; images: ChapterImage[] } {
  const titleWords = item.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const paras: string[] = [];
  const sourceIds = new Set<number>();

  for (const page of bundle.wikiPages) {
    for (const sec of page.sections) {
      const hay = `${sec.title} ${sec.extract}`.toLowerCase();
      if (titleWords.some((w) => hay.includes(w)) || sec.title.toLowerCase().includes(item.title.toLowerCase().slice(0, 18))) {
        const src = bundle.sources.find((s) => s.url === page.url);
        if (src) sourceIds.add(src.id);
        paras.push(`## ${sec.title}\n${sec.extract.slice(0, 2200)}${src ? ` [${src.id}]` : ""}`);
      }
    }
    if (paras.length < 1 && page.extract) {
      const src = bundle.sources.find((s) => s.url === page.url);
      if (src) sourceIds.add(src.id);
      paras.push(page.extract.slice(0, 1800) + (src ? ` [${src.id}]` : ""));
    }
  }

  const relevantFacts = bundle.facts.filter((f) => {
    const t = f.text.toLowerCase();
    return titleWords.some((w) => t.includes(w)) || f.entities.some((e) => item.title.toLowerCase().includes(e.toLowerCase()));
  });
  for (const f of relevantFacts.slice(0, 12)) {
    f.sourceIds.forEach((id) => sourceIds.add(id));
    paras.push(`FACT (${f.confidence}): ${f.text} ${f.sourceIds.map((id) => `[${id}]`).join("")}`);
  }

  for (const s of bundle.sources) {
    if (!s.extractedText || s.extractedText.length < 120) continue;
    const hay = `${s.title} ${s.extractedText.slice(0, 1500)}`.toLowerCase();
    if (titleWords.filter((w) => hay.includes(w)).length >= Math.min(2, titleWords.length)) {
      sourceIds.add(s.id);
      paras.push(`SOURCE [${s.id}] ${s.title}:\n${s.extractedText.slice(0, 1600)}`);
    }
  }

  if (paras.length < 2) {
    for (const s of bundle.sources.filter((x) => x.extractedText.length > 200).slice(0, 3)) {
      sourceIds.add(s.id);
      paras.push(`SOURCE [${s.id}] ${s.title}:\n${s.extractedText.slice(0, 1400)}`);
    }
  }

  const images = (bundle.images || []).filter((img) => {
    if (typeof img.chapterIndex === "number") return true;
    if (img.imageType && img.imageType !== "photograph") return true;
    const c = `${img.caption} ${img.alt}`.toLowerCase();
    return !titleWords.length || titleWords.some((w) => c.includes(w));
  });

  return { notes: paras.join("\n\n").slice(0, 14000), sourceIds: [...sourceIds], images };
}

export async function writeChapter(opts: {
  index: number;
  item: OutlineItem;
  settings: EbookSettings;
  analysis: TopicAnalysis;
  bundle: ResearchBundle;
  total: number;
}): Promise<Chapter> {
  const { index, item, settings, analysis, bundle, total } = opts;
  const { notes, sourceIds, images } = notesForChapter(item, bundle, settings);
  const hindi = isHindiOutput(analysis.outputLanguage || settings.outputLanguage || settings.language);

  if (aiConfigured()) {
    const ai = await writeChapterWithAi({ index, item, settings, analysis, notes, sourceIds, total, images });
    if (ai) {
      if (hindi) {
        const ensured = await ensureHindiChapter(ai, {
          item,
          settings,
          analysis,
          sources: bundle.sources,
          facts: bundle.facts || [],
        });
        return ensured.chapter;
      }
      return ai;
    }
  }

  if (hindi) {
    return composeHindiChapter({
      index,
      item,
      settings,
      analysis,
      sources: bundle.sources,
      facts: bundle.facts || [],
      images,
    });
  }
  return writeChapterFromSources({ index, item, settings, analysis, bundle, notes, sourceIds, images });
}

async function writeChapterWithAi(opts: {
  index: number;
  item: OutlineItem;
  settings: EbookSettings;
  analysis: TopicAnalysis;
  notes: string;
  sourceIds: number[];
  total: number;
  images: ChapterImage[];
}): Promise<Chapter | null> {
  const { index, item, settings, analysis, notes, sourceIds, total, images } = opts;
  const lang = analysis.outputLanguage;
  const prompt = `Write Chapter ${index + 1} of ${total} for an ebook.
${hindiWriterPromptAddon(lang)}

Title: ${analysis.normalizedTitle}
Chapter title: ${item.title}
Chapter brief: ${item.summary}
Ebook type: ${settings.type}
Audience: ${settings.audience}
Difficulty: ${settings.difficulty}
Writing style: ${settings.style}
Output language: ${lang}
Include examples: ${settings.includeExamples}
Include exercises: ${settings.includeExercises}
Include MCQs: ${settings.includeMcqs}
Copyright-safe mode: ${analysis.copyrightMode}
Sensitive domain: ${analysis.sensitiveDomain}
Topic kind: ${analysis.topicKind || analysis.category}
Research questions: ${(analysis.researchQuestions || []).slice(0, 12).join(" | ")}

Do not write a generic biography of the author or unrelated subjects (communism, Indo-Aryan migrations, popular culture, complete works) unless the chapter title requires it.
Do not present hypotheses as established historical facts. Label major claims as Primary-source evidence, Author's interpretation, Later scholarly interpretation, or Contested/uncertain.

Return JSON only with this shape:
{
  "title": "...",
  "learningObjectives": ["..."],
  "sections": [{"heading":"...","markdown":"..."}],
  "keyPoints": ["..."],
  "examples": ["..."],
  "commonMistakes": ["..."],
  "summary": "...",
  "questions": [{"question":"...","answer":"...","explanation":"..."}],
  "mcqs": [{"question":"...","options":["A","B","C","D"],"answer":"A","explanation":"..."}],
  "glossaryTerms": [{"term":"...","definition":"..."}]
}

Use citations like [12] inside markdown. Do not invent sources.
If notes are thin, say so rather than fabricating.

RESEARCH NOTES:
${notes || "(limited notes — do not invent facts)"}
`;
  const raw = await chat(
    [
      { role: "system", content: RESEARCH_WRITER_SYSTEM },
      { role: "user", content: prompt },
    ],
    { maxTokens: 4000, temperature: 0.3 }
  );
  if (!raw) return null;
  const parsed = extractJson(raw);
  if (!parsed) return null;
  return jsonToChapter(parsed, index, item, sourceIds, images, settings);
}

function extractJson(raw: string): Record<string, unknown> | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fence?.[1] || raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function jsonToChapter(
  parsed: Record<string, unknown>,
  index: number,
  item: OutlineItem,
  sourceIds: number[],
  images: ChapterImage[],
  settings: EbookSettings
): Chapter {
  const sectionsIn = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections: ChapterSection[] = sectionsIn.map((s: any, i: number) => ({
    id: nanoid(8),
    heading: String(s.heading || `Section ${i + 1}`),
    html: markdownToHtml(String(s.markdown || s.html || "")),
    sourceIds: citeIds(String(s.markdown || ""), sourceIds),
  }));
  const ch: Chapter = {
    id: item.id,
    index,
    title: localizeTitle(String(parsed.title || item.title), settings.outputLanguage || settings.language || "en"),
    learningObjectives: arr(parsed.learningObjectives),
    sections: sections.length ? sections : [{ id: nanoid(8), heading: item.title, html: markdownToHtml(item.summary), sourceIds }],
    keyPoints: arr(parsed.keyPoints),
    examples: settings.includeExamples ? arr(parsed.examples) : [],
    commonMistakes: arr(parsed.commonMistakes),
    summary: String(parsed.summary || ""),
    questions: settings.includeExercises ? asQuiz(parsed.questions) : [],
    mcqs: settings.includeMcqs ? asQuiz(parsed.mcqs) : [],
    images,
    sourceIds,
    wordCount: 0,
    status: "complete",
  };
  ch.wordCount = countWords(chapterPlain(ch));
  return ch;
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 12) : [];
}

function citeIds(text: string, fallback: number[]): number[] {
  const allowed = new Set(fallback);
  const cited: number[] = [];
  const citationPattern = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = citationPattern.exec(text)) !== null) {
    const id = Number(match[1]);
    if (allowed.has(id) && !cited.includes(id)) cited.push(id);
  }
  return cited.length ? cited : fallback;
}

function asQuiz(v: unknown): QuizItem[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 8).map((q: any) => ({
    question: String(q.question || ""),
    options: Array.isArray(q.options) ? q.options.map(String) : undefined,
    answer: String(q.answer || ""),
    explanation: q.explanation ? String(q.explanation) : undefined,
    sourceIds: [],
  })).filter((q) => q.question);
}

export function writeChapterFromSources(opts: {
  index: number;
  item: OutlineItem;
  settings: EbookSettings;
  analysis: TopicAnalysis;
  bundle: ResearchBundle;
  notes: string;
  sourceIds: number[];
  images: ChapterImage[];
}): Chapter {
  const { index, item, settings, analysis, bundle, sourceIds, images } = opts;
  const lang = analysis.outputLanguage;

  const relevant = collectRelevantPassages(item, bundle, sourceIds);
  const profile = buildTopicProfile(analysis.topic, { category: analysis.category, type: settings.type });
  const sections = buildSections(item, relevant, settings, analysis, profile);
  const facts = pickFacts(item, bundle.facts);
  const keyPoints = makeKeyPoints(relevant, facts);
  const objectives = makeObjectives(item, sections, settings);
  const examples = settings.includeExamples ? makeExamples(relevant, settings, analysis) : [];
  const mistakes = makeMistakes(item, analysis);
  const summary = makeSummary(item, keyPoints, relevant);
  const questions = settings.includeExercises ? makeQuestions(facts, relevant, settings) : [];
  const mcqs = settings.includeMcqs ? makeMcqs(facts, relevant) : [];

  // Localized labels when Hindi etc. — keep structure in output language via light prefixes
  const labels = labelsFor(lang);

  const ch: Chapter = {
    id: item.id,
    index,
    title: item.title,
    learningObjectives: objectives,
    sections: sections.map((s) => ({
      ...s,
      heading: s.heading,
    })),
    keyPoints,
    examples,
    commonMistakes: mistakes,
    summary,
    questions,
    mcqs,
    images: images.slice(0, 4),
    sourceIds: [...new Set(sourceIds.concat(relevant.flatMap((p) => p.sourceIds)))],
    wordCount: 0,
    status: "complete",
  };
  if (ch.images.length) {
    const target = ch.sections[Math.min(1, Math.max(0, ch.sections.length - 1))];
    if (target && !/ebook-figure/.test(target.html)) {
      target.html += figuresToHtml(ch.images, analysis.outputLanguage);
    }
  }

  if (!ch.sections.length) {
    ch.sections.push({
      id: nanoid(8),
      heading: labels.overview,
      html: `<p>${escapeHtml(item.summary || analysis.summary)} <em>Information could not be independently verified in depth for this heading; see the source list and later chapters.</em></p>`,
      sourceIds: [],
    });
  }

  ch.wordCount = countWords(chapterPlain(ch));
  return ch;
}

interface Passage {
  heading: string;
  text: string;
  sourceIds: number[];
  tier: number;
}

const CHAPTER_HINTS: Record<string, string[]> = {
  framework: ["background", "preamble", "supremacy", "structure", "introduction", "history", "design"],
  provision: ["article", "part", "schedule", "structure", "rights", "directive"],
  institution: ["parliament", "president", "prime minister", "court", "executive", "legislature", "government"],
  landmark: ["assembly", "adopted", "amendment", "kesavananda", "timeline", "drafting", "1950", "1949"],
  rights: ["fundamental rights", "duties", "directive", "part iii", "part iv", "liberty", "equality"],
  application: ["amendment", "contemporary", "basic structure", "emergency", "federal"],
  syntax: ["syntax", "indent", "statement", "expression", "loop"],
  history: ["history", "conceived", "released", "founded"],
  practice: ["example", "library", "ecosystem", "documentation", "project"],
};

function hintWords(title: string): string[] {
  const t = title.toLowerCase();
  const extra: string[] = [];
  for (const [k, words] of Object.entries(CHAPTER_HINTS)) {
    if (t.includes(k) || words.some((w) => t.includes(w))) extra.push(...words);
  }
  return extra;
}

function splitSourceSections(text: string): { title: string; extract: string }[] {
  const parts = text.split(/\n(?==+[^\n]+=+\s*\n)/);
  const out: { title: string; extract: string }[] = [];
  if (!parts.length) return out;
  const first = parts[0].replace(/^==+[^=]+=+\s*/, "").trim();
  if (first.length > 80) out.push({ title: "Introduction", extract: first });
  for (const p of parts.slice(1)) {
    const m = p.match(/^==+\s*(.+?)\s*==+\s*([\s\S]*)$/);
    if (!m) continue;
    const extract = m[2].trim();
    if (extract.length > 60) out.push({ title: m[1], extract });
  }
  return out;
}

function collectRelevantPassages(item: OutlineItem, bundle: ResearchBundle, prefer: number[]): Passage[] {
  const words = [
    ...item.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
    ...hintWords(item.title),
  ];
  const scored: (Passage & { score: number })[] = [];

  for (const page of bundle.wikiPages) {
    const src = bundle.sources.find((s) => s.url === page.url);
    for (const sec of page.sections) {
      const hay = `${sec.title} ${sec.extract}`.toLowerCase();
      const score =
        words.filter((w) => hay.includes(w)).length +
        (sec.title.toLowerCase().includes(item.title.toLowerCase().slice(0, 12)) ? 4 : 0);
      if (score > 0) {
        scored.push({
          heading: sec.title,
          text: sec.extract,
          sourceIds: src ? [src.id] : [],
          tier: 7,
          score,
        });
      }
    }
  }

  for (const s of bundle.sources) {
    if (!s.extractedText || s.extractedText.length < 160) continue;
    if (/github\.com/i.test(s.url) && !/wiki|docs|textbook|ncert/i.test(s.url + s.title)) continue;
    const sections = splitSourceSections(s.extractedText);
    const chunks = sections.length ? sections : [{ title: s.title, extract: s.extractedText }];
    for (const sec of chunks) {
      const hay = `${sec.title} ${sec.extract}`.toLowerCase();
      const score = words.filter((w) => hay.includes(w)).length + (prefer.includes(s.id) ? 1 : 0);
      if (score > 0) {
        scored.push({
          heading: sec.title === "Introduction" ? s.title : sec.title,
          text: sec.extract.slice(0, 2800),
          sourceIds: [s.id],
          tier: s.tier,
          score,
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score || a.tier - b.tier);
  const uniq: Passage[] = [];
  const seen = new Set<string>();
  for (const p of scored) {
    const sig = p.text.slice(0, 90);
    if (seen.has(sig)) continue;
    seen.add(sig);
    uniq.push(p);
    if (uniq.length >= 5) break;
  }

  if (!uniq.length) {
    const all = bundle.sources.filter((s) => (s.extractedText || "").length > 200);
    const h = [...item.title].reduce((n, ch) => n + ch.charCodeAt(0), 0);
    const pick = all[h % all.length];
    if (pick) {
      const secs = splitSourceSections(pick.extractedText);
      const slice = secs[h % Math.max(1, secs.length)] || secs[0];
      if (slice) {
        uniq.push({ heading: slice.title, text: slice.extract.slice(0, 2200), sourceIds: [pick.id], tier: pick.tier });
      }
    }
  }
  return uniq;
}

function buildSections(
  item: OutlineItem,
  passages: Passage[],
  settings: EbookSettings,
  analysis: TopicAnalysis,
  profile?: ReturnType<typeof buildTopicProfile>
): ChapterSection[] {
  const labels = labelsFor(analysis.outputLanguage);
  const sections: ChapterSection[] = [];

  if (profile?.claimDiscipline === "historical-hypothesis") {
    sections.push({
      id: nanoid(8),
      heading: "How to read claims in this chapter",
      html: `<p>Major historical statements below are classified as <strong>primary-source evidence</strong>, <strong>the author's interpretation</strong>, <strong>later scholarly interpretation</strong>, or <strong>contested/uncertain</strong>. Ambedkar's hypotheses — including the Broken Men theory and the beef-eating explanation — are not presented as universally established facts.</p>`,
      sourceIds: [],
    });
  }

  const introBits = passages.slice(0, 2);
  if (introBits.length) {
    sections.push({
      id: nanoid(8),
      heading: labels.explanation,
      html: introBits
        .map((p) => renderAttributed(p.text, p.sourceIds, analysis))
        .join(""),
      sourceIds: introBits.flatMap((p) => p.sourceIds),
    });
  }

  const rest = passages.slice(2);
  for (const p of rest.slice(0, 4)) {
    sections.push({
      id: nanoid(8),
      heading: tidyHeading(p.heading, item.title),
      html: renderAttributed(p.text, p.sourceIds, analysis),
      sourceIds: p.sourceIds,
    });
  }

  if (item.children?.length) {
    sections.push({
      id: nanoid(8),
      heading: labels.subtopics,
      html:
        `<ul>` +
        item.children
          .map((c) => `<li><strong>${escapeHtml(c.title)}</strong> — ${escapeHtml(c.summary || "")}</li>`)
          .join("") +
        `</ul>`,
      sourceIds: [],
    });
  }

  if (settings.type === "Programming Book" || analysis.category === "programming") {
    sections.push({
      id: nanoid(8),
      heading: labels.practice,
      html: `<p>${escapeHtml(
        "Work through the ideas in this chapter in a real editor. Type examples yourself rather than only reading them. Official documentation should be kept open beside this book so behaviour can be checked against the current language or library version."
      )}</p>`,
      sourceIds: [],
    });
  }

  return sections;
}

function renderAttributed(text: string, sourceIds: number[], analysis: TopicAnalysis): string {
  const cite = sourceIds.map((id) => `<sup class="cite">[${id}]</sup>`).join("");
  const profile = buildTopicProfile(analysis.topic, { category: analysis.category });
  const chunks = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30)
    .slice(0, 6);
  if (!chunks.length) {
    return `<p><em>Information could not be independently verified for this subsection.</em></p>`;
  }
  return chunks
    .map((p, i) => {
      const sentences = splitSentences(p);
      const body = sentences
        .map((s) => {
          if (analysis.copyrightMode) return paraphraseLight(s);
          return s;
        })
        .join(" ");
      const kind =
        profile.claimDiscipline === "historical-hypothesis" ? classifyClaim(body, profile) : undefined;
      const tag = kind
        ? `<span class="claim-kind">${escapeHtml(
            analysis.outputLanguage === "hi"
              ? kind === "primary-source-evidence"
                ? "प्राथमिक स्रोत साक्ष्य"
                : kind === "author-interpretation"
                  ? "लेखक की व्याख्या"
                  : kind === "later-scholarly-interpretation"
                    ? "परवर्ती विद्वानों की व्याख्या"
                    : "विवादास्पद / अनिश्चित"
              : claimKindLabel(kind)
          )}.</span> `
        : "";
      return `<p>${tag}${escapeHtml(body)}${i === 0 ? cite : ""}</p>`;
    })
    .join("");
}

function paraphraseLight(s: string): string {
  // Study-guide framing rather than verbatim long literary prose
  return s
    .replace(/\bIt is important to note that\b/gi, "Note that")
    .replace(/\bIn conclusion,\b/gi, "In short,");
}

function tidyHeading(h: string, fallback: string) {
  const t = h.replace(/^File:|^https?:\/\/\S+/i, "").trim();
  if (t.length < 3 || t.length > 80) return fallback;
  return t;
}

function pickFacts(item: OutlineItem, facts: ExtractedFact[]): ExtractedFact[] {
  const words = item.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return facts
    .filter((f) => words.some((w) => f.text.toLowerCase().includes(w)) || f.confidence === "high")
    .slice(0, 10);
}

function makeKeyPoints(passages: Passage[], facts: ExtractedFact[]): string[] {
  const pts: string[] = [];
  for (const f of facts.filter((x) => x.category === "definition" || x.category === "date" || x.confidence === "high").slice(0, 6)) {
    pts.push(f.text + (f.sourceIds[0] ? ` [${f.sourceIds[0]}]` : ""));
  }
  if (pts.length < 4) {
    for (const p of passages) {
      const s = splitSentences(p.text)[0];
      if (s && s.length > 40) pts.push(s + (p.sourceIds[0] ? ` [${p.sourceIds[0]}]` : ""));
      if (pts.length >= 6) break;
    }
  }
  return [...new Set(pts)].slice(0, 8);
}

function makeObjectives(item: OutlineItem, sections: ChapterSection[], settings: EbookSettings): string[] {
  const objs = [
    `Explain the core ideas of “${item.title}” at ${settings.difficulty.toLowerCase()} level.`,
    `Use the cited sources to describe at least two concrete facts or mechanisms in this chapter.`,
  ];
  if (sections[1]) objs.push(`Distinguish related ideas under “${sections[1].heading}”.`);
  if (settings.includeExercises) objs.push(`Answer review questions without looking at the summary.`);
  return objs.slice(0, 5);
}

function makeExamples(passages: Passage[], settings: EbookSettings, analysis: TopicAnalysis): string[] {
  const examples: string[] = [];
  for (const p of passages) {
    const sent = splitSentences(p.text).find((s) => /for example|such as|e\.g\.|instance/i.test(s));
    if (sent) examples.push(sent + (p.sourceIds[0] ? ` [${p.sourceIds[0]}]` : ""));
  }
  if (!examples.length && analysis.category === "programming") {
    examples.push(
      "Open a REPL or scratch file and re-implement the smallest idea from this chapter. Compare the result with official documentation before moving on."
    );
  }
  if (!examples.length) {
    examples.push(
      `Apply the chapter idea to a situation familiar to ${settings.audience.toLowerCase()}, then check the claim against the cited source rather than memory.`
    );
  }
  return examples.slice(0, 4);
}

function makeMistakes(item: OutlineItem, analysis: TopicAnalysis): string[] {
  const common = [
    `Treating a single webpage as sufficient proof for a contested claim about ${item.title}.`,
    "Memorising a definition without being able to give an example or counter-example.",
  ];
  if (analysis.category === "exam") common.push("Skipping NCERT / official syllabus wording and studying only coaching summaries.");
  if (analysis.category === "historical") {
    common.push("Collapsing debated historiography into a single 'what really happened' story without sources.");
    common.push("Presenting an author's hypothesis (for example a causal theory of origins) as if it were universally established fact.");
  }
  if (analysis.sensitiveDomain !== "none")
    common.push("Using this educational material as a substitute for a licensed professional.");
  return common.slice(0, 4);
}

function makeSummary(item: OutlineItem, keyPoints: string[], passages: Passage[]): string {
  const lead = passages[0] ? splitSentences(passages[0].text)[0] : item.summary;
  const rest = keyPoints.slice(0, 3).join(" ");
  return [lead, rest].filter(Boolean).join(" ");
}

function makeQuestions(facts: ExtractedFact[], passages: Passage[], settings: EbookSettings): QuizItem[] {
  const qs: QuizItem[] = [];
  for (const f of facts.slice(0, 4)) {
    const q = factToQuestion(f.text);
    if (q) qs.push({ question: q, answer: f.text, sourceIds: f.sourceIds });
  }
  if (passages[0]) {
    qs.push({
      question: `In your own words, summarise the opening argument of this chapter for a ${settings.audience.toLowerCase()} reader.`,
      answer: splitSentences(passages[0].text).slice(0, 2).join(" "),
      sourceIds: passages[0].sourceIds,
    });
  }
  return qs.slice(0, 6);
}

function makeMcqs(facts: ExtractedFact[], passages: Passage[]): QuizItem[] {
  const mcqs: QuizItem[] = [];
  const pool = facts.length ? facts : passages.map((p, i) => ({
    text: splitSentences(p.text)[0] || "",
    sourceIds: p.sourceIds,
    id: String(i),
    confidence: "medium" as const,
    verifiedBy: 1,
    category: "other" as const,
    entities: [],
  }));
  for (const f of pool.slice(0, 5)) {
    const words = f.text.split(/\s+/);
    if (words.length < 8) continue;
    const key = f.entities[0] || words.find((w) => w.length > 5 && /[A-Z]/.test(w[0])) || words[3];
    if (!key) continue;
    const question = f.text.replace(key, "______");
    if (question === f.text) continue;
    const distractors = unique([
      ...pool.flatMap((x) => x.entities).filter((e) => e && e !== key),
      "None of the above",
      "All of the above",
      "Unknown / not established",
    ]).slice(0, 3);
    while (distractors.length < 3) distractors.push(`Related term ${distractors.length + 1}`);
    const options = shuffle([key.replace(/[.,;:]$/, ""), ...distractors.slice(0, 3)]);
    mcqs.push({
      question: question.length > 220 ? `Which option correctly completes: “${question.slice(0, 200)}…”?` : question,
      options,
      answer: key.replace(/[.,;:]$/, ""),
      explanation: f.text,
      sourceIds: f.sourceIds,
    });
  }
  return mcqs.slice(0, 5);
}

function factToQuestion(text: string): string | null {
  const def = text.match(/^(.{3,80}?)\s+(is|are|was|were|refers to|means)\s+/i);
  if (def) return `What ${def[2].toLowerCase()} ${def[1].trim()}?`;
  const year = text.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  if (year) return `What notable development around ${year[1]} is described in the sources?`;
  if (text.length > 50) return `Explain: “${text.slice(0, 140)}${text.length > 140 ? "…" : ""}”`;
  return null;
}

function unique(xs: string[]) {
  return [...new Set(xs.filter(Boolean))];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function markdownToHtml(md: string): string {
  let s = escapeHtml(md);
  s = s.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  s = s.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^# (.+)$/gm, "<h2>$1</h2>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\[(\d+)\]/g, '<sup class="cite">[$1]</sup>');
  s = s.replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
  const lines = s.split("\n");
  const out: string[] = [];
  let inList = false;
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      out.push(`<p>${para.join(" ")}</p>`);
      para = [];
    }
  };
  for (const line of lines) {
    if (/^<h[2-4]>/.test(line)) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      flush();
      out.push(line);
    } else if (/^[-*]\s+/.test(line)) {
      flush();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${line.replace(/^[-*]\s+/, "")}</li>`);
    } else if (!line.trim()) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      flush();
    } else {
      para.push(line);
    }
  }
  if (inList) out.push("</ul>");
  flush();
  return out.join("");
}



export async function writeFrontMatter(opts: {
  settings: EbookSettings;
  analysis: TopicAnalysis;
  bundle: ResearchBundle;
  outline: OutlineItem[];
}): Promise<{ introduction: string; conclusion: string; faqs: FaqItem[]; glossary: GlossaryEntry[]; disclaimer?: string }> {
  const { settings, analysis, bundle, outline } = opts;
  if (isHindiOutput(analysis.outputLanguage || settings.outputLanguage || settings.language)) {
    return composeHindiFrontMatter({
      settings,
      analysis,
      sources: bundle.sources,
      outline,
      facts: bundle.facts || [],
    });
  }
  const src = bundle.sources.find((s) => s.extractedText.length > 200);
  const cite = src ? ` [${src.id}]` : "";
  const lead = bundle.wikiPages[0]?.extract
    ? splitSentences(bundle.wikiPages[0].extract).slice(0, 3).join(" ") + cite
    : analysis.summary;

  const introduction = [
    lead,
    `This ${settings.type.toLowerCase()} is organised for ${settings.audience.toLowerCase()} at ${settings.difficulty.toLowerCase()} level. Chapters follow a researched outline rather than a single webpage.`,
    analysis.copyrightMode
      ? "It is an original study guide. It does not reproduce any copyrighted book chapter-by-chapter."
      : "Factual claims are tied to the numbered references at the end. Where a point could not be confirmed in more than one reliable source, that uncertainty is stated.",
    analysis.topicKind === "named-work-inquiry"
      ? "Historical hypotheses advanced by the author under study are labelled as interpretation or as contested, not as settled fact."
      : undefined,
    `The book covers: ${outline.map((o) => o.title).slice(0, 8).join("; ")}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const conclusion = [
    `This volume set out to give a source-backed path through “${analysis.normalizedTitle}”.`,
    `Readers should return to primary and official sources — especially government, institutional, and documentation sites listed in the references — before using the material in high-stakes academic, legal, medical, or financial decisions.`,
    `Further study: follow the highest-tier sources in the reference list and the open questions flagged inside chapters.`,
  ].join("\n\n");

  const terms = extractKeyTerms(
    bundle.wikiPages.map((p) => p.extract).join(" ") + " " + bundle.facts.map((f) => f.text).join(" "),
    30
  );
  const glossary: GlossaryEntry[] = [];
  for (const term of terms) {
    const fact = bundle.facts.find((f) => f.category === "definition" && f.text.toLowerCase().includes(term));
    if (fact) {
      glossary.push({ term: titleCase(term), definition: fact.text, sourceIds: fact.sourceIds });
    }
  }
  // Add definition-like first mentions
  for (const f of bundle.facts.filter((x) => x.category === "definition").slice(0, 16)) {
    const term = f.entities[0] || f.text.split(/\s+/).slice(0, 3).join(" ");
    if (!glossary.some((g) => g.term.toLowerCase() === term.toLowerCase())) {
      glossary.push({ term, definition: f.text, sourceIds: f.sourceIds });
    }
  }

  const faqs: FaqItem[] = [
    {
      question: `Who is this ebook for?`,
      answer: `${settings.audience} reading at ${settings.difficulty.toLowerCase()} level. Type: ${settings.type}.`,
      sourceIds: [],
    },
    {
      question: `Are the facts taken from the internet in real time?`,
      answer: `Yes. Folio searched the live web and knowledge bases, ranked sources, and used the retrieved text. The reference list is the set of sources collected for this title.`,
      sourceIds: bundle.sources.slice(0, 3).map((s) => s.id),
    },
    {
      question: `What if a source disagrees with another?`,
      answer: `Important claims are cross-checked. Disagreements are left visible rather than silently resolved. Prefer government, official, and peer-reviewed sources listed first.`,
      sourceIds: [],
    },
  ];

  let disclaimer: string | undefined;
  if (analysis.sensitiveDomain === "medical") {
    disclaimer =
      "Medical disclaimer: This ebook is educational and is not clinical advice, diagnosis, or treatment. Guidelines change. Consult a licensed clinician and current official guidance (for example WHO, NIH, CDC, or your national ministry of health).";
  } else if (analysis.sensitiveDomain === "legal") {
    disclaimer =
      "Legal disclaimer: This ebook is educational and is not legal advice. Statutes, rules, and judgments must be read from official gazettes and court reporters. Consult a qualified advocate for any real matter.";
  } else if (analysis.sensitiveDomain === "financial") {
    disclaimer =
      "Financial disclaimer: This ebook is educational and is not investment, tax, or accounting advice. Verify figures against official statistical agencies and regulators before acting.";
  } else if (analysis.sensitiveDomain === "scientific") {
    disclaimer =
      "Science note: Methods and measurements are described from cited sources. Where research is unsettled, the text says so. Check primary papers and official agencies for the latest consensus.";
  } else if (analysis.topicKind === "named-work-inquiry" || analysis.category === "historical") {
    disclaimer =
      "Historical note: Claims drawn from a primary author are labelled as that author's interpretation when they are hypotheses. They are not presented as universally established facts. Prefer primary texts, official legal sources, and peer-reviewed scholarship listed in the references.";
  }

  return { introduction, conclusion, faqs, glossary: glossary.slice(0, 40), disclaimer };
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}



export async function maybeChapterImages(title: string, enabled: boolean): Promise<ChapterImage[]> {
  if (!enabled) return [];
  return searchCommonsImages(title, 2).catch(() => []);
}

export function flagsFromFacts(facts: ExtractedFact[], chapterText: string): FactFlag[] {
  const flags: FactFlag[] = [];
  const lower = chapterText.toLowerCase();
  for (const f of facts.slice(0, 20)) {
    const present = f.text.slice(0, 40).toLowerCase();
    if (!lower.includes(present.slice(0, 24))) continue;
    const status: FactFlag["status"] =
      f.verifiedBy >= 2 || f.confidence === "high" ? "verified" : f.confidence === "low" ? "unsupported" : "needs_review";
    flags.push({
      id: f.id,
      claim: f.text,
      status,
      explanation:
        status === "verified"
          ? `Supported by ${f.verifiedBy} overlapping source signal(s).`
          : status === "unsupported"
            ? "Appears in the draft but was not corroborated across independent reliable sources."
            : "Present in research notes but only weakly corroborated. Review before relying on it.",
      sourceIds: f.sourceIds,
    });
  }
  return flags;
}
