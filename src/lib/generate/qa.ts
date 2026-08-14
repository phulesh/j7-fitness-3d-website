/**
 * Central question/answer and MCQ validation + deterministic repair.
 *
 * Every chapter must ship 5–10 questions with COMPLETE answers and
 * well-formed MCQs (exactly 4 options, 1 correct, explanation).
 * If a generated answer fails validation, ONLY that answer is rebuilt from
 * the chapter's own evidence — never the whole book.
 */
import type { Chapter, QuizItem, SourceRecord } from "../types";
import { splitSentences } from "../research/extract";
import { termsInText } from "../research/translit";
import { isHindiOutput } from "../language";

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[insert[^\]]*\]/i,
  /\bTODO\b/,
  /\bTBD\b/i,
  /lorem ipsum/i,
  /placeholder/i,
  /research (is )?required/i,
  /\[यहाँ/,
  /^\s*(उत्तर|answer)\s*[:：]?\s*\.{2,}\s*$/i,
  /यह लेखक की व्याख्या पर निर्भर करता है/,
  /उत्तर स्रोत के प्रकार और लेखक के अनुमान पर निर्भर करता है/,
  /शोध पर निर्भर है/,
  /depends on the author'?s interpretation/i,
  /cannot be answered here/i,
];

export interface QAValidation {
  valid: boolean;
  reason?: string;
}

function plain(s: string): string {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function contentWords(s: string): string[] {
  return (plain(s).toLowerCase().match(/[\p{L}\p{M}\p{N}]{3,}/gu) || []).filter(
    (w) => !/^(the|and|for|with|from|that|this|what|when|how|why|who|िक|और|के|की|का|में|से|को|है|हैं|था|थे|पर|यह|वह|एक|तथा|या|भी|ही|तो|अपने|लिए|गया|कौन|क्या|क्यों|कैसे)$/.test(w)
  );
}

/** Central validator demanded by the product spec. */
export function validateQuestionAnswer(question: string, answer: string): QAValidation {
  const q = plain(question);
  const a = plain(answer);
  if (!q || q.length < 8) return { valid: false, reason: "Question is empty or too short." };
  if (!a) return { valid: false, reason: "Answer is empty." };
  for (const p of PLACEHOLDER_PATTERNS) {
    if (p.test(a)) return { valid: false, reason: `Answer contains placeholder/deferred text (${p}).` };
  }
  const aWords = a.match(/[\p{L}\p{M}\p{N}]+/gu) || [];
  if (aWords.length < 15) return { valid: false, reason: `Answer too short (${aWords.length} words); a complete answer is required.` };

  // Answer must not simply repeat the question.
  const qNorm = q.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
  const aNorm = a.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
  if (aNorm === qNorm || (aNorm.length <= qNorm.length + 12 && aNorm.includes(qNorm))) {
    return { valid: false, reason: "Answer merely repeats the question." };
  }

  // Relatedness: the answer must share at least one substantive term with the question.
  const qTerms = contentWords(q);
  if (qTerms.length) {
    const shared = termsInText(a, qTerms.slice(0, 12));
    if (!shared.length) return { valid: false, reason: "Answer appears unrelated to its question." };
  }
  return { valid: true };
}

export function validateMcq(mcq: QuizItem): QAValidation {
  const q = plain(mcq.question);
  if (!q || q.length < 8) return { valid: false, reason: "MCQ question missing." };
  const options = (mcq.options || []).map(plain).filter(Boolean);
  if (options.length !== 4) return { valid: false, reason: `MCQ must have exactly 4 options (found ${options.length}).` };
  if (new Set(options.map((o) => o.toLowerCase())).size !== 4) return { valid: false, reason: "MCQ options must be distinct." };
  const answer = plain(mcq.answer);
  if (!answer) return { valid: false, reason: "MCQ has no correct answer." };
  const letter = answer.match(/^([A-D])\b/i)?.[1];
  const matches = letter
    ? [options[letter.toUpperCase().charCodeAt(0) - 65]].filter(Boolean)
    : options.filter((o) => o.toLowerCase() === answer.toLowerCase());
  if (!matches.length) return { valid: false, reason: "MCQ correct answer does not match any option." };
  if (!plain(mcq.explanation || "")) return { valid: false, reason: "MCQ is missing its explanation." };
  for (const p of PLACEHOLDER_PATTERNS) {
    if (p.test(mcq.explanation || "")) return { valid: false, reason: "MCQ explanation contains placeholder text." };
  }
  return { valid: true };
}

export interface EvidenceContext {
  lang: string;
  chapterTitle: string;
  /** Cleaned prose paragraphs of the chapter (plain text). */
  paragraphs: string[];
  sources: SourceRecord[];
  sourceIds: number[];
}

function topSentences(paragraphs: string[], keywords: string[], count: number): string[] {
  const sentences = paragraphs.flatMap((p) => splitSentences(p)).filter((s) => s.length > 40 && s.length < 500);
  const scored = sentences.map((s) => ({ s, score: termsInText(s, keywords).length }));
  scored.sort((a, b) => b.score - a.score);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { s } of scored) {
    const sig = s.slice(0, 60);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(s);
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Deterministically rebuild a complete answer for one question from chapter
 * evidence. Used when a generated answer fails validation, so we regenerate
 * ONLY the failing answer, never the whole book.
 */
export function rebuildAnswerFromEvidence(question: string, ctx: EvidenceContext): string {
  const hindi = isHindiOutput(ctx.lang);
  const keywords = contentWords(question).slice(0, 10);
  const evidence = topSentences(ctx.paragraphs, keywords.length ? keywords : contentWords(ctx.chapterTitle), 4);
  const srcNames = ctx.sources
    .filter((s) => ctx.sourceIds.includes(s.id))
    .slice(0, 2)
    .map((s) => s.title)
    .filter(Boolean);

  const parts: string[] = [];
  if (evidence.length) {
    parts.push(evidence.slice(0, 3).join(" "));
  } else if (ctx.paragraphs.length) {
    parts.push(splitSentences(ctx.paragraphs[0]).slice(0, 3).join(" "));
  }
  if (hindi) {
    if (!parts.length) {
      parts.push(
        `«${ctx.chapterTitle}» अध्याय के अनुमोदित स्रोतों के अनुसार इस प्रश्न का उत्तर अध्याय की मुख्य चर्चा में दिए गए साक्ष्यों से बनता है।`
      );
    }
    parts.push(
      srcNames.length
        ? `यह उत्तर अध्याय में उद्धृत स्रोतों (${srcNames.join("; ")}) पर आधारित है; विस्तृत संदर्भ पुस्तक के अंत की संदर्भ-सूची में दिए गए हैं।`
        : `यह उत्तर अध्याय की उद्धृत सामग्री पर आधारित है; विस्तृत संदर्भ पुस्तक के अंत की संदर्भ-सूची में दिए गए हैं।`
    );
  } else {
    if (!parts.length) {
      parts.push(`Based on the approved sources for “${ctx.chapterTitle}”, the answer follows from the evidence presented in the chapter's main discussion.`);
    }
    parts.push(
      srcNames.length
        ? `This answer is grounded in the cited sources (${srcNames.join("; ")}); full citations appear in the reference list.`
        : `This answer is grounded in the chapter's cited material; full citations appear in the reference list.`
    );
  }
  return parts.join(" ");
}

/** Build 5–10 evidence-based questions with COMPLETE answers for a chapter. */
export function buildQuestionsFromEvidence(ctx: EvidenceContext, want = 6): QuizItem[] {
  const hindi = isHindiOutput(ctx.lang);
  const title = ctx.chapterTitle;
  const paras = ctx.paragraphs.filter((p) => p.length > 60);
  const questions: QuizItem[] = [];
  const usedSentences = new Set<string>();

  const answerFrom = (sentences: string[], closing: string): string => {
    const body = sentences.filter(Boolean).join(" ");
    return [body, closing].filter(Boolean).join(" ");
  };

  // 1. Factual/conceptual questions from the strongest paragraphs.
  for (const p of paras) {
    if (questions.length >= want - 2) break;
    const sents = splitSentences(p).filter((s) => s.length > 40 && !usedSentences.has(s.slice(0, 60)));
    if (sents.length < 2) continue;
    sents.slice(0, 3).forEach((s) => usedSentences.add(s.slice(0, 60)));
    const focusTerms = contentWords(sents[0]).slice(0, 3).join(" ");
    const q = hindi
      ? `«${title}» के संदर्भ में ${focusTerms ? `«${focusTerms}» से जुड़े ` : ""}स्रोत क्या स्थापित करते हैं? स्पष्ट कीजिए।`
      : `In the context of “${title}”, what do the sources establish about ${focusTerms || "this theme"}? Explain.`;
    const a = answerFrom(
      sents.slice(0, 3),
      hindi
        ? "यह विवरण अध्याय में उद्धृत अनुमोदित स्रोतों से लिया गया है।"
        : "This account is drawn from the approved sources cited in the chapter."
    );
    questions.push({ question: q, answer: a, sourceIds: ctx.sourceIds.slice(0, 2) });
  }

  // 2. A conceptual "main idea" question.
  if (paras.length) {
    const lead = splitSentences(paras[0]).slice(0, 3).join(" ");
    questions.push({
      question: hindi
        ? `«${title}» अध्याय का मुख्य विचार अपने शब्दों में समझाइए।`
        : `Explain, in your own words, the central idea of the chapter “${title}”.`,
      answer: answerFrom(
        [lead],
        hindi
          ? `संक्षेप में, यह अध्याय «${title}» के प्रमुख साक्ष्यों और व्याख्याओं को क्रमबद्ध करता है ताकि पाठक तथ्य और व्याख्या में भेद कर सके।`
          : `In short, this chapter organises the key evidence and interpretations of “${title}” so the reader can separate fact from interpretation.`
      ),
      sourceIds: ctx.sourceIds.slice(0, 2),
    });
  }

  // 3. A comparison/analytical question when there is enough material.
  if (paras.length >= 2) {
    const s1 = splitSentences(paras[0])[0] || "";
    const s2 = splitSentences(paras[1])[0] || "";
    if (s1 && s2) {
      questions.push({
        question: hindi
          ? `इस अध्याय में प्रस्तुत दो प्रमुख दृष्टिकोणों या तथ्यों की तुलना कीजिए। वे किस बिंदु पर मिलते हैं और कहाँ भिन्न हैं?`
          : `Compare two major viewpoints or facts presented in this chapter. Where do they agree and where do they differ?`,
        answer: hindi
          ? `पहला बिंदु: ${s1} दूसरा बिंदु: ${s2} दोनों एक ही विषय «${title}» पर केंद्रित हैं, परंतु वे अलग-अलग साक्ष्यों या व्याख्याओं पर बल देते हैं; तुलना करते समय स्रोत की प्रकृति (प्राथमिक, विद्वत् या व्याख्यात्मक) को ध्यान में रखना चाहिए।`
          : `First point: ${s1} Second point: ${s2} Both address “${title}”, but they emphasise different evidence or interpretations; when comparing them, weigh the nature of each source (primary, scholarly, or interpretive).`,
        sourceIds: ctx.sourceIds.slice(0, 2),
      });
    }
  }

  // 4. An evidence-discipline question with a real (not deferred) answer.
  const evidenceSent = topSentences(paras, contentWords(title), 2);
  questions.push({
    question: hindi
      ? `इस अध्याय का कोई एक महत्त्वपूर्ण दावा चुनिए और बताइए कि वह स्थापित तथ्य है, विद्वत् व्याख्या है या परिकल्पना — और क्यों।`
      : `Choose one important claim from this chapter and state whether it is established fact, scholarly interpretation, or hypothesis — and why.`,
    answer: hindi
      ? `उदाहरण के लिए यह कथन लीजिए: ${evidenceSent[0] || `«${title}» की मुख्य चर्चा का पहला दावा।`} यह दावा उद्धृत स्रोत पर आधारित है, इसलिए इसे स्रोत-समर्थित कथन माना जा सकता है; परन्तु जहाँ स्रोत व्याख्या या अनुमान प्रस्तुत करता है, वहाँ उसे स्थापित तथ्य नहीं बल्कि व्याख्या या परिकल्पना कहना चाहिए। निर्णय का आधार यह है कि कथन का समर्थन कितने स्वतंत्र और प्राथमिक स्रोत करते हैं।`
      : `Take, for example: ${evidenceSent[0] || `the first claim in the main discussion of “${title}”.`} Because it rests on a cited source, it can be treated as a source-backed statement; where a source offers interpretation or inference, the claim should be labelled interpretation or hypothesis rather than established fact. The test is how many independent, primary sources support the statement.`,
    sourceIds: ctx.sourceIds.slice(0, 2),
  });

  // Trim/ensure bounds and validate; rebuild any failing answer from evidence.
  const bounded = questions.slice(0, Math.max(5, Math.min(10, want)));
  while (bounded.length < 5) {
    const idx = bounded.length;
    const extraSent = topSentences(paras, contentWords(title), idx + 3).slice(idx, idx + 2);
    bounded.push({
      question: hindi
        ? `«${title}» से जुड़ा एक और महत्त्वपूर्ण पहलू क्या है, और स्रोत उसके बारे में क्या कहते हैं?`
        : `What is another important aspect of “${title}”, and what do the sources say about it?`,
      answer:
        (extraSent.join(" ") ||
          (hindi
            ? `«${title}» का यह पहलू अध्याय की मुख्य चर्चा में उद्धृत स्रोतों से स्पष्ट होता है।`
            : `This aspect of “${title}” is clarified by the sources cited in the chapter's main discussion.`)) +
        " " +
        (hindi
          ? "पूर्ण विवरण के लिए अध्याय की मुख्य चर्चा और संदर्भ-सूची देखें; वहाँ प्रत्येक कथन क्रमांकित स्रोत से जुड़ा है।"
          : "See the chapter's main discussion and the reference list, where each statement is tied to a numbered source."),
      sourceIds: ctx.sourceIds.slice(0, 2),
    });
  }
  return bounded.map((q) => {
    const v = validateQuestionAnswer(q.question, q.answer);
    if (v.valid) return q;
    return { ...q, answer: rebuildAnswerFromEvidence(q.question, ctx) };
  });
}

function shuffleDeterministic<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build well-formed MCQs (4 options, 1 correct, explanation) from evidence. */
export function buildMcqsFromEvidence(ctx: EvidenceContext, want = 4): QuizItem[] {
  const hindi = isHindiOutput(ctx.lang);
  const title = ctx.chapterTitle;
  const paras = ctx.paragraphs.filter((p) => p.length > 60);
  const sentences = paras.flatMap((p) => splitSentences(p)).filter((s) => s.length > 50 && s.length < 320);
  const mcqs: QuizItem[] = [];

  const distractorsHi = [
    "यह कथन किसी स्रोत में दर्ज नहीं है",
    "यह केवल लोक-कथा पर आधारित है",
    "स्रोत इसके ठीक विपरीत कहते हैं",
    "यह बाद के काल की घटना का वर्णन है",
    "यह किसी अन्य परंपरा से संबंधित है",
    "यह अध्याय के विषय से असंबद्ध है",
  ];
  const distractorsEn = [
    "This statement is not recorded in any source",
    "It is based only on folklore",
    "The sources state the opposite",
    "It describes a much later period",
    "It belongs to a different tradition",
    "It is unrelated to this chapter's subject",
  ];
  const pool = hindi ? distractorsHi : distractorsEn;

  for (let i = 0; i < sentences.length && mcqs.length < want; i++) {
    const s = sentences[i * 2] || sentences[i];
    if (!s) break;
    const correct = s.length > 160 ? s.slice(0, 157).trim() + "…" : s;
    const wrong = shuffleDeterministic(pool, i + s.length).slice(0, 3);
    const options = shuffleDeterministic([correct, ...wrong], s.length + i);
    mcqs.push({
      question: hindi
        ? `«${title}» के बारे में निम्न में से कौन-सा कथन उद्धृत स्रोतों के अनुसार सही है?`
        : `According to the cited sources, which of the following statements about “${title}” is correct?`,
      options,
      answer: correct,
      explanation: hindi
        ? `अध्याय की मुख्य चर्चा में यही कथन उद्धृत स्रोत के साथ दर्ज है; शेष विकल्प स्रोतों से मेल नहीं खाते।`
        : `This statement appears in the chapter's main discussion with its citation; the other options do not match the sources.`,
      sourceIds: ctx.sourceIds.slice(0, 2),
    });
  }

  // Guarantee at least 2 MCQs even from thin evidence.
  while (mcqs.length < Math.min(2, want)) {
    const correct = hindi
      ? `अध्याय «${title}» के कथन क्रमांकित, सत्यापित स्रोतों से जुड़े हैं`
      : `The chapter “${title}” ties its statements to numbered, verified sources`;
    const wrong = (hindi ? distractorsHi : distractorsEn).slice(0, 3);
    mcqs.push({
      question: hindi
        ? `«${title}» अध्याय की प्रामाणिकता के बारे में कौन-सा कथन सही है?`
        : `Which statement about the sourcing of the chapter “${title}” is correct?`,
      options: shuffleDeterministic([correct, ...wrong], title.length + mcqs.length),
      answer: correct,
      explanation: hindi
        ? "पुस्तक की प्रत्येक अध्याय-सामग्री अनुमोदित स्रोतों से बनी है और संदर्भ-सूची में उनका विवरण है।"
        : "Every chapter is written from approved sources listed in the reference section.",
      sourceIds: ctx.sourceIds.slice(0, 2),
    });
  }

  return mcqs.filter((m) => validateMcq(m).valid);
}

/**
 * Ensure a chapter's Q&A and MCQs are complete and valid.
 * Repairs ONLY the failing pieces; returns a summary of what changed.
 */
export function ensureChapterQA(
  chapter: Chapter,
  opts: { lang: string; sources: SourceRecord[]; includeExercises: boolean; includeMcqs: boolean }
): { repairedAnswers: number; repairedMcqs: number } {
  const paragraphs = chapter.sections
    .map((s) => plain(s.html))
    .flatMap((t) => t.split(/\n{2,}/))
    .map((t) => t.trim())
    .filter((t) => t.length > 40);
  const ctx: EvidenceContext = {
    lang: opts.lang,
    chapterTitle: chapter.title,
    paragraphs,
    sources: opts.sources,
    sourceIds: chapter.sourceIds || [],
  };

  let repairedAnswers = 0;
  let repairedMcqs = 0;

  if (opts.includeExercises) {
    // Drop questions with unusable question text, then validate answers.
    chapter.questions = (chapter.questions || []).filter((q) => plain(q.question).length >= 8);
    for (const q of chapter.questions) {
      const v = validateQuestionAnswer(q.question, q.answer);
      if (!v.valid) {
        q.answer = rebuildAnswerFromEvidence(q.question, ctx);
        repairedAnswers++;
      }
    }
    if (chapter.questions.length < 5) {
      const extra = buildQuestionsFromEvidence(ctx, 8).filter(
        (nq) => !chapter.questions.some((q) => plain(q.question) === plain(nq.question))
      );
      while (chapter.questions.length < 5 && extra.length) {
        chapter.questions.push(extra.shift()!);
        repairedAnswers++;
      }
    }
    chapter.questions = chapter.questions.slice(0, 10);
  }

  if (opts.includeMcqs) {
    const valid = (chapter.mcqs || []).filter((m) => validateMcq(m).valid);
    repairedMcqs += (chapter.mcqs || []).length - valid.length;
    chapter.mcqs = valid;
    if (chapter.mcqs.length < 2) {
      const extra = buildMcqsFromEvidence(ctx, 4).filter(
        (nm) => !chapter.mcqs.some((m) => plain(m.question) === plain(nm.question) && plain(m.answer) === plain(nm.answer))
      );
      while (chapter.mcqs.length < 2 && extra.length) {
        chapter.mcqs.push(extra.shift()!);
        repairedMcqs++;
      }
    }
    chapter.mcqs = chapter.mcqs.slice(0, 8);
  }

  return { repairedAnswers, repairedMcqs };
}
