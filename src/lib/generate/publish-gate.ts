/**
 * Final content quality gate.
 *
 * validateBookForPublishing(book) is the single authority that decides
 * whether an ebook may be marked READY. It checks real content — chapter
 * counts, per-chapter word counts, answered questions, MCQ shape,
 * placeholders, citations, references — and returns machine-readable stats.
 *
 * A book with 0 words, empty chapters, unanswered questions, or malformed
 * MCQs can NEVER pass this gate, so the UI can never show a "successful"
 * empty book.
 */
import type { Chapter, EbookDocument } from "../types";
import { validateMcq, validateQuestionAnswer } from "./qa";
import { countWords } from "./text";

export interface PublishGateResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    chapters: number;
    words: number;
    questions: number;
    answeredQuestions: number;
    mcqs: number;
    validMcqs: number;
    references: number;
    sources: number;
    glossaryTerms: number;
    emptyChapters: number;
  };
}

const PLACEHOLDER_RX =
  /\[insert[^\]]*\]|\bTODO\b|\bTBD\b|lorem ipsum|placeholder text|\[यहाँ|शोध पर निर्भर है|उत्तर\s+(?:बाद में दिया जाएगा|स्रोत के प्रकार और लेखक के अनुमान पर निर्भर करता है)/i;

/** Minimum meaningful words per chapter for each requested book length. */
export function minWordsPerChapter(length: EbookDocument["settings"]["length"]): number {
  switch (length) {
    case "short":
      return 250;
    case "medium":
      return 400;
    case "long":
      return 550;
    case "comprehensive":
      return 700;
    default:
      return 300;
  }
}

function chapterPlainText(ch: Chapter): string {
  return [
    ch.title,
    ...ch.sections.map((s) => `${s.heading} ${s.html.replace(/<[^>]+>/g, " ")}`),
    ...ch.keyPoints,
    ch.summary,
  ].join(" ");
}

export function validateBookForPublishing(doc: EbookDocument): PublishGateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const chapters = doc.chapters || [];
  const requested = doc.outline?.length || doc.settings.chapterCount || chapters.length;
  const minPerChapter = minWordsPerChapter(doc.settings.length);

  let words = 0;
  let questions = 0;
  let answeredQuestions = 0;
  let mcqs = 0;
  let validMcqs = 0;
  let emptyChapters = 0;

  if (!chapters.length) errors.push("No chapters were generated.");
  if (requested && chapters.length !== requested) {
    errors.push(`Chapter count mismatch: ${chapters.length} generated, ${requested} requested.`);
  }

  const seenBodies = new Set<string>();
  chapters.forEach((ch, i) => {
    const label = `Chapter ${i + 1} (“${ch.title}”)`;
    const body = chapterPlainText(ch);
    const w = countWords(body);
    words += countWords(
      body +
        " " +
        ch.questions.map((q) => `${q.question} ${q.answer}`).join(" ") +
        " " +
        ch.mcqs.map((m) => `${m.question} ${(m.options || []).join(" ")} ${m.explanation || ""}`).join(" ")
    );

    if (!ch.title?.trim()) errors.push(`Chapter ${i + 1} has no title.`);
    if (!ch.sections.length) {
      errors.push(`${label} has no sections.`);
      emptyChapters++;
    } else if (w === 0) {
      errors.push(`${label} has 0 words.`);
      emptyChapters++;
    } else if (w < minPerChapter) {
      errors.push(`${label} is too thin: ${w} words < required ${minPerChapter}.`);
    }
    const assessedContent = `${body} ${ch.questions.map((q) => `${q.question} ${q.answer}`).join(" ")} ${ch.mcqs.map((m) => `${m.question} ${(m.options || []).join(" ")} ${m.answer} ${m.explanation || ""}`).join(" ")}`;
    if (PLACEHOLDER_RX.test(assessedContent)) errors.push(`${label} contains placeholder or deferred content.`);

    // Duplicate-paragraph detection across chapters.
    const sig = body.replace(/\s+/g, " ").slice(0, 240).toLowerCase();
    if (sig.length > 120) {
      if (seenBodies.has(sig)) errors.push(`${label} repeats the same opening content as another chapter.`);
      seenBodies.add(sig);
    }

    if (doc.settings.includeExercises) {
      if (ch.questions.length < 3) errors.push(`${label} has only ${ch.questions.length} review questions (need at least 3).`);
      for (const q of ch.questions) {
        questions++;
        const v = validateQuestionAnswer(q.question, q.answer);
        if (v.valid) answeredQuestions++;
        else errors.push(`${label}: question “${q.question.slice(0, 70)}…” has an incomplete answer — ${v.reason}`);
      }
    } else {
      questions += ch.questions.length;
      for (const q of ch.questions) {
        const v = validateQuestionAnswer(q.question, q.answer);
        if (v.valid) answeredQuestions++;
        else errors.push(`${label}: stored question “${q.question.slice(0, 70)}…” has an incomplete answer — ${v.reason}`);
      }
    }

    if (doc.settings.includeMcqs) {
      if (!ch.mcqs.length) errors.push(`${label} has no MCQs.`);
      for (const m of ch.mcqs) {
        mcqs++;
        const v = validateMcq(m);
        if (v.valid) validMcqs++;
        else errors.push(`${label}: malformed MCQ — ${v.reason}`);
      }
    } else {
      mcqs += ch.mcqs.length;
      for (const m of ch.mcqs) {
        const v = validateMcq(m);
        if (v.valid) validMcqs++;
        else errors.push(`${label}: stored MCQ is malformed — ${v.reason}`);
      }
    }
  });

  // Front/back matter
  if (!countWords(doc.introduction || "")) warnings.push("Introduction is empty.");
  if (!countWords(doc.conclusion || "")) warnings.push("Conclusion is empty.");
  if (doc.settings.includeGlossary && !(doc.glossary || []).length) {
    warnings.push("Glossary requested but no glossary terms were produced.");
  }

  // References / sources
  const sources = doc.sources || [];
  if (!sources.length) errors.push("No sources — a research-based book requires references.");
  if (doc.settings.includeReferences && !sources.length) errors.push("References requested but source list is empty.");
  const verifiable = sources.filter((s) => /^https?:\/\//.test(s.url) || s.url.startsWith("folio-upload://"));
  if (sources.length && !verifiable.length) errors.push("No source has traceable provenance (valid URL or author upload).");

  // Total word count floor: requested chapters × per-chapter minimum.
  const minTotal = Math.max(1000, (requested || 1) * minPerChapter);
  if (words < minTotal) errors.push(`Total word count ${words} is below the minimum ${minTotal} for a ${doc.settings.length} book with ${requested} chapters.`);
  if (words === 0) errors.push("Book has 0 words.");

  if (doc.settings.includeExercises && questions > 0 && answeredQuestions !== questions) {
    errors.push(`${questions - answeredQuestions} of ${questions} questions are unanswered or incomplete.`);
  }
  if (doc.settings.includeMcqs && mcqs > 0 && validMcqs !== mcqs) {
    errors.push(`${mcqs - validMcqs} of ${mcqs} MCQs are malformed.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      chapters: chapters.length,
      words,
      questions,
      answeredQuestions,
      mcqs,
      validMcqs,
      references: verifiable.length,
      sources: sources.length,
      glossaryTerms: (doc.glossary || []).length,
      emptyChapters,
    },
  };
}
