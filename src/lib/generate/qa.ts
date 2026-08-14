/**
 * Question & answer construction.
 *
 * Hard rules enforced here:
 *   - a question is only emitted together with a complete answer;
 *   - every answer is built from chapter/source material, never from a
 *     placeholder phrase such as "इसका उत्तर ऊपर दिया गया है";
 *   - answers carry a direct response plus explanation and, where available,
 *     the evidence the claim rests on;
 *   - MCQs always ship four options, a correct answer, and an explanation.
 *
 * Anything that cannot be answered from the supplied material is dropped
 * rather than emitted as a stub, and the validator reports the shortfall.
 */

import type { Chapter, OutlineItem, QuizItem, SourceRecord } from "../types";
import { splitSentences } from "../research/extract";
import { isHindiOutput } from "../language";

export const MIN_QUESTIONS_PER_CHAPTER = 8;
export const MAX_QUESTIONS_PER_CHAPTER = 15;
export const MIN_MCQS_PER_CHAPTER = 5;
export const MAX_MCQS_PER_CHAPTER = 10;

/** Minimum characters an answer must have to count as substantive. */
export const MIN_ANSWER_CHARS = 120;

/**
 * Phrases that mean "no real answer". Kept in one place so the generator, the
 * validator and the tests all agree on what counts as a placeholder.
 */
export const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bplaceholder\b/i,
  /\banswer later\b/i,
  /\bto be (?:added|written|filled|determined)\b/i,
  /\bcoming soon\b/i,
  /\blorem ipsum\b/i,
  /^\s*(?:n\/?a|null|undefined|none)\s*[.।]?\s*$/i,
  /उत्तर\s*बाद\s*में/,
  /यहाँ\s*उत्तर\s*दें/,
  /इसका\s*उत्तर\s*ऊपर\s*दिया\s*गया\s*है/,
  /जैसा\s*कि\s*अध्याय\s*में\s*बताया\s*गया\s*है/,
  /इसका\s*विस्तृत\s*उत्तर\s*शोध\s*के\s*बाद/,
  /विस्तार\s*से\s*बताया\s*जाएगा/,
  /उदाहरण\s*जोड़ा\s*जाएगा/,
  /बाद\s*में\s*जोड़ा\s*जाएगा/,
  /^\s*यह\s*विषय\s*जटिल\s*है\s*[.।]?\s*$/,
];

export function isPlaceholderText(value: string): boolean {
  const text = (value || "").trim();
  if (!text) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(text));
}

/** An answer must be present, substantive, and free of placeholder phrasing. */
export function isCompleteAnswer(answer: string): boolean {
  const text = (answer || "").replace(/\s+/g, " ").trim();
  if (text.length < MIN_ANSWER_CHARS) return false;
  if (isPlaceholderText(text)) return false;
  // Bare yes/no with no explanation does not answer anything.
  if (/^(हाँ|नहीं|yes|no)\s*[.।]?$/i.test(text)) return false;
  return true;
}

function stripHtml(html: string): string {
  return (html || "")
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, " ")
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[(\d+)\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Editorial scaffolding that belongs in the chapter body but must never be
 * recycled as the substance of an answer (it restates the question, or is a
 * labelling wrapper rather than a claim).
 */
const SCAFFOLD_PATTERNS: RegExp[] = [
  /^शोध\s*प्रश्न\s*[::]/,
  /शोध\s*प्रश्न\s*[::]/,
  /^ऐतिहासिक\s*दायरा\s*[::]/,
  /ऐतिहासिक\s*दायरा\s*[::]/,
  /^यह\s*अध्याय\s*.{0,40}पर\s*केंद्रित\s*है/,
  /^यह\s*Research-Based\s*Book/i,
  /^इस\s*अध्याय\s*का\s*उद्देश्य/,
  /^research\s*question\s*:/i,
  /^historical\s*scope\s*:/i,
  /^(?:प्राथमिक|द्वितीयक)\s*[::]/,
  /^यह\s*अध्याय\s*«/,
  /^this\s+chapter\s+explains\b/i,
];

function isScaffold(sentence: string): boolean {
  const s = sentence.trim();
  return SCAFFOLD_PATTERNS.some((re) => re.test(s));
}

/** Remove the "स्रोत [n] से जुड़ा दावा:" style wrapper so answers read cleanly. */
function unwrapClaim(sentence: string): string {
  return sentence
    .replace(/^स्रोत\s*\[?\d*\]?\s*से\s*जुड़ा\s*दावा\s*[::]\s*/u, "")
    .replace(/^claim\s+from\s+source\s*\[?\d*\]?\s*:\s*/i, "")
    .trim();
}

interface Passage {
  heading: string;
  sentences: string[];
  sourceIds: number[];
}

/**
 * Headings that introduce a chapter rather than carry its content. Their text
 * is title + research-question scaffolding, so mining them for answers just
 * echoes the question back.
 */
function isScaffoldSection(heading: string): boolean {
  const h = (heading || "").trim();
  return /^अध्याय\s*\d+$/.test(h) || /^chapter\s*\d+$/i.test(h) || /^दावों को कैसे पढ़ें$/.test(h) || /^how to read claims/i.test(h);
}

function chapterPassages(chapter: Chapter): Passage[] {
  return chapter.sections
    .filter((section) => !isScaffoldSection(section.heading))
    .map((section) => ({
      heading: section.heading,
      sentences: splitSentences(stripHtml(section.html))
        .map(unwrapClaim)
        .filter((s) => s.trim().length > 40 && !isScaffold(s)),
      sourceIds: section.sourceIds || [],
    }))
    .filter((p) => p.sentences.length > 0);
}

function citation(sourceIds: number[], sources: SourceRecord[], hindi: boolean): string {
  const first = sourceIds.map((id) => sources.find((s) => Number(s.id) === Number(id))).find(Boolean);
  if (!first) return "";
  const label = [first.title, first.organization].filter(Boolean).join(" — ");
  return hindi ? ` इस विवरण का आधार स्रोत [${first.id}] ${label} है।` : ` This rests on source [${first.id}] ${label}.`;
}

/**
 * Compose an answer with: direct response, supporting explanation, and
 * evidence attribution. Sentences come from the chapter itself so the answer
 * can never contradict the body text.
 */
function composeAnswer(
  lead: string,
  support: string[],
  sourceIds: number[],
  sources: SourceRecord[],
  hindi: boolean
): string {
  const parts: string[] = [];
  const direct = lead.trim();
  if (direct) parts.push(direct);

  for (const sentence of support) {
    if (parts.join(" ").length >= 420) break;
    const s = sentence.trim();
    if (s && !parts.includes(s)) parts.push(s);
  }

  // Pad to a substantive answer using the chapter's own framing rather than
  // filler, then attach the evidence pointer.
  let answer = parts.join(" ").replace(/\s+/g, " ").trim();
  if (answer.length < MIN_ANSWER_CHARS && support.length) {
    answer = `${answer} ${support.join(" ")}`.replace(/\s+/g, " ").trim();
  }
  answer += citation(sourceIds, sources, hindi);
  return answer.trim();
}

/**
 * Build 8–15 questions of mixed type, each with a complete answer.
 * Returns only fully-answered items.
 */
export function buildQuestions(opts: {
  chapter: Chapter;
  item: OutlineItem;
  sources: SourceRecord[];
  lang: string;
  target?: number;
}): QuizItem[] {
  const { chapter, item, sources, lang } = opts;
  const hindi = isHindiOutput(lang);
  const target = Math.max(
    MIN_QUESTIONS_PER_CHAPTER,
    Math.min(MAX_QUESTIONS_PER_CHAPTER, opts.target || MIN_QUESTIONS_PER_CHAPTER + 2)
  );
  const passages = chapterPassages(chapter);
  if (!passages.length) return [];

  const all = passages.flatMap((p) => p.sentences.map((s) => ({ s, p })));
  const out: QuizItem[] = [];
  const usedSentences = new Set<string>();

  const push = (question: string, answer: string, sourceIds: number[]) => {
    if (out.length >= target) return;
    if (!question.trim()) return;
    if (!isCompleteAnswer(answer)) return;
    if (out.some((q) => q.question === question)) return;
    out.push({ question: question.trim(), answer: answer.trim(), sourceIds });
  };

  const title = chapter.title;

  // 1. Conceptual — the chapter's research question, answered from the body.
  // The lead must not repeat the question text back at the reader.
  if (item.researchQuestion) {
    const lead = hindi
      ? "उपलब्ध स्रोतों के आधार पर इस प्रश्न का उत्तर इस प्रकार है:"
      : "On the evidence of the available sources, the answer is as follows:";
    const support = all.slice(0, 4).map((x) => x.s);
    push(item.researchQuestion, composeAnswer(lead, support, passages[0]?.sourceIds || [], sources, hindi), passages[0]?.sourceIds || []);
  }

  // 2. Factual — definitional statements found in the text.
  for (const { s, p } of all) {
    if (out.length >= target) break;
    if (usedSentences.has(s)) continue;
    const defHi = s.match(/^(.{4,70}?)\s+(है|हैं|था|थे|कहलाता है|कहलाती है)\b/);
    const defEn = s.match(/^(.{4,70}?)\s+(is|are|was|were|refers to|means|denotes)\s+/i);
    if (!defHi && !defEn) continue;
    const subject = (defHi?.[1] || defEn?.[1] || "").trim();
    if (subject.length < 3) continue;
    usedSentences.add(s);
    const question = hindi ? `${subject} से क्या तात्पर्य है?` : `What is meant by ${subject}?`;
    const support = p.sentences.filter((x) => x !== s).slice(0, 3);
    push(question, composeAnswer(s, support, p.sourceIds, sources, hindi), p.sourceIds);
  }

  // 3. Analytical — one per substantive section.
  for (const p of passages) {
    if (out.length >= target) break;
    if (p.sentences.length < 2) continue;
    const question = hindi
      ? `“${p.heading}” खंड किस बात को स्थापित करता है, और वह क्यों महत्त्वपूर्ण है?`
      : `What does the section “${p.heading}” establish, and why does it matter?`;
    const lead = hindi
      ? `यह खंड मुख्यतः यह स्थापित करता है:`
      : `This section principally establishes the following:`;
    push(question, composeAnswer(lead, p.sentences.slice(0, 4), p.sourceIds, sources, hindi), p.sourceIds);
  }

  // 4. Source-based — which evidence supports the chapter's claims.
  const cited = sources.filter((s) => (chapter.sourceIds || []).includes(Number(s.id)));
  if (cited.length) {
    const s = cited[0];
    const question = hindi
      ? "इस अध्याय के दावों के समर्थन में कौन-सा स्रोत उपलब्ध है, और उसकी प्रासंगिकता क्या है?"
      : "Which source supports the claims in this chapter, and why is it relevant?";
    const detail = hindi
      ? `इस अध्याय के दावे मुख्यतः स्रोत [${s.id}] “${s.title}” (${s.organization}) पर आधारित हैं। ${
          s.reasonForInclusion || ""
        } यह स्रोत ${
          s.primarySource ? "प्राथमिक" : s.academicSource ? "विद्वत्" : "द्वितीयक"
        } श्रेणी का है, और इसका सत्यापन-स्तर “${s.verificationStatus || "जाँच अपेक्षित"}” दर्ज है। स्रोत का मूल पाठ स्वयं पढ़कर दावे की पुष्टि करना उचित है।`
      : `The claims rest mainly on source [${s.id}] “${s.title}” (${s.organization}). ${
          s.reasonForInclusion || ""
        } It is a ${
          s.primarySource ? "primary" : s.academicSource ? "scholarly" : "secondary"
        } source, recorded with verification status “${s.verificationStatus || "needs review"}”. Readers should confirm the claim against the original text.`;
    push(question, detail, [Number(s.id)]);
  }

  // 5. Critical thinking — evidence versus interpretation.
  if (out.length < target) {
    const question = hindi
      ? "इस अध्याय में स्थापित साक्ष्य और व्याख्या के बीच अंतर कैसे किया जाए?"
      : "How should established evidence be distinguished from interpretation in this chapter?";
    const answer = hindi
      ? `स्थापित साक्ष्य वे कथन हैं जिन्हें उद्धृत प्राथमिक या आधिकारिक स्रोत सीधे प्रमाणित करते हैं, जबकि व्याख्या उन साक्ष्यों से निकाला गया निष्कर्ष है। ${
          item.evidenceVsInterpretation || ""
        } व्यवहार में पाठक को देखना चाहिए कि कथन के साथ स्रोत-संख्या दी गई है या नहीं, स्रोत प्राथमिक है या द्वितीयक, और क्या अन्य विद्वान उसी निष्कर्ष पर पहुँचते हैं। जहाँ केवल एक लेखक का अनुमान हो, उसे “लेखक की व्याख्या” कहा जाना चाहिए, स्थापित तथ्य नहीं।`
      : `Established evidence is what a cited primary or official source directly documents; interpretation is the inference drawn from it. ${
          item.evidenceVsInterpretation || ""
        } In practice, check whether a statement carries a source number, whether that source is primary or secondary, and whether other scholars reach the same conclusion. Where only one author infers it, label it the author's interpretation, not settled fact.`;
    push(question, answer, chapter.sourceIds || []);
  }

  // 6. Comparison / application — drawn from key points.
  for (const point of chapter.keyPoints || []) {
    if (out.length >= target) break;
    const clean = stripHtml(point);
    if (clean.length < 50) continue;
    const question = hindi
      ? `निम्नलिखित बिंदु की व्याख्या कीजिए: “${clean.slice(0, 70)}…”`
      : `Explain the following point: “${clean.slice(0, 70)}…”`;
    const support = all.slice(0, 3).map((x) => x.s);
    push(question, composeAnswer(clean, support, chapter.sourceIds || [], sources, hindi), chapter.sourceIds || []);
  }

  // 7. Summary-level, to reach the minimum count.
  for (const p of passages) {
    if (out.length >= target) break;
    const question = hindi
      ? `“${p.heading}” की मुख्य बातें अपने शब्दों में संक्षेप में लिखिए।`
      : `Summarise the main points of “${p.heading}” in your own words.`;
    const lead = hindi ? "संक्षेप में:" : "In brief:";
    push(question, composeAnswer(lead, p.sentences.slice(0, 5), p.sourceIds, sources, hindi), p.sourceIds);
  }

  return out.slice(0, target);
}

/**
 * Build 5–10 MCQs. Each has four distinct options, a correct answer that is one
 * of them, and an explanation. Distractors are drawn from the chapter's own
 * vocabulary so they are plausible without being misleading.
 */
export function buildMcqs(opts: {
  chapter: Chapter;
  sources: SourceRecord[];
  lang: string;
  target?: number;
}): QuizItem[] {
  const { chapter, sources, lang } = opts;
  const hindi = isHindiOutput(lang);
  const target = Math.max(MIN_MCQS_PER_CHAPTER, Math.min(MAX_MCQS_PER_CHAPTER, opts.target || MIN_MCQS_PER_CHAPTER + 1));
  const passages = chapterPassages(chapter);
  const sentences = passages.flatMap((p) => p.sentences.map((s) => ({ s, p })));
  if (!sentences.length) return [];

  const out: QuizItem[] = [];

  // Headings make reliable, unambiguous MCQ material.
  const headings = passages.map((p) => p.heading).filter((h) => h && h.length > 3);

  for (const { s, p } of sentences) {
    if (out.length >= target) break;
    if (s.length < 60 || s.length > 240) continue;

    const correct = p.heading;
    if (!correct || correct.length < 3) continue;
    const distractors = headings.filter((h) => h !== correct).slice(0, 3);
    if (distractors.length < 3) continue;

    const question = hindi
      ? `निम्नलिखित कथन इस अध्याय के किस खंड से संबंधित है? “${s.slice(0, 150)}${s.length > 150 ? "…" : ""}”`
      : `Which section of this chapter does the following statement belong to? “${s.slice(0, 150)}${s.length > 150 ? "…" : ""}”`;

    const options = shuffleStable([correct, ...distractors], out.length);
    const explanation = hindi
      ? `यह कथन “${correct}” खंड में आता है, क्योंकि वहीं इस बिंदु की व्याख्या की गई है।${citation(p.sourceIds, sources, true)}`
      : `The statement appears under “${correct}”, where this point is explained.${citation(p.sourceIds, sources, false)}`;

    if (!explanation.trim() || isPlaceholderText(explanation)) continue;
    out.push({ question, options, answer: correct, explanation, sourceIds: p.sourceIds });
  }

  // Evidence-discipline MCQ — always answerable and always explained.
  if (out.length < target) {
    const question = hindi
      ? "किसी ऐतिहासिक या दार्शनिक दावे को “स्थापित तथ्य” कब कहा जा सकता है?"
      : "When may a historical or philosophical claim be called an “established fact”?";
    const correct = hindi
      ? "जब उसे एक से अधिक स्वतंत्र, विश्वसनीय स्रोत प्रमाणित करते हों"
      : "When more than one independent, reliable source documents it";
    const options = [
      correct,
      hindi ? "जब वह किसी एक लेखक को तर्कसंगत लगे" : "When a single author finds it plausible",
      hindi ? "जब वह व्यापक रूप से दोहराया जाता हो" : "When it is widely repeated",
      hindi ? "जब उसका खंडन कठिन हो" : "When it is difficult to disprove",
    ];
    out.push({
      question,
      options,
      answer: correct,
      explanation: hindi
        ? "स्वतंत्र स्रोतों की पुष्टि ही किसी दावे को स्थापित बनाती है। लोकप्रियता, एकल लेखक का अनुमान, या खंडन की कठिनाई प्रमाण नहीं हैं; ऐसे दावे व्याख्या या परिकल्पना कहलाते हैं।"
        : "Corroboration by independent sources is what establishes a claim. Popularity, a single author's inference, or difficulty of refutation are not evidence; such claims remain interpretation or hypothesis.",
      sourceIds: [],
    });
  }

  return out.slice(0, target);
}

/** Deterministic shuffle so regenerating a chapter does not reorder answers randomly. */
function shuffleStable<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (seed * 31 + i * 17) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
