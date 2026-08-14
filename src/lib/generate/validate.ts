/**
 * Book-level validation.
 *
 * A volume may only be marked READY when every check here passes. Failures are
 * reported per chapter with the exact problem, so the UI can show what remains
 * and offer targeted retries instead of regenerating the whole book.
 */

import type { EbookDocument } from "../types";
import { isHindiOutput } from "../language";
import {
  isCompleteAnswer,
  isPlaceholderText,
  MAX_QUESTIONS_PER_CHAPTER,
  MIN_MCQS_PER_CHAPTER,
  MIN_QUESTIONS_PER_CHAPTER,
  PLACEHOLDER_PATTERNS,
} from "./qa";

export type ValidationSeverity = "error" | "warning";

export interface ValidationProblem {
  /** Chapter number (1-based), or undefined for book-level problems. */
  chapter?: number;
  chapterTitle?: string;
  code: string;
  message: string;
  severity: ValidationSeverity;
  /** Which targeted regeneration would fix this. */
  fix?: "chapter" | "questions" | "answers" | "images" | "research" | "outline" | "cover";
}

export interface ValidationReport {
  ok: boolean;
  checkedAt: string;
  problems: ValidationProblem[];
  counts: {
    chapters: number;
    expectedChapters: number;
    questions: number;
    incompleteAnswers: number;
    mcqs: number;
    sources: number;
    images: number;
    words: number;
  };
}

function stripHtml(html: string): string {
  return (html || "")
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Scan any reader-visible string for placeholder markers. */
export function findPlaceholders(text: string): string[] {
  const hits: string[] = [];
  for (const re of PLACEHOLDER_PATTERNS) {
    const m = text.match(re);
    if (m) hits.push(m[0].trim());
  }
  return hits;
}

export function validateEbook(doc: EbookDocument): ValidationReport {
  const problems: ValidationProblem[] = [];
  const add = (p: ValidationProblem) => problems.push(p);
  const hindi = isHindiOutput(doc.outputLanguage || doc.language);
  const expected = doc.settings?.chapterCount || doc.outline.length || 0;

  let questions = 0;
  let incompleteAnswers = 0;
  let mcqs = 0;
  let images = 0;

  if (!doc.title?.trim()) {
    add({ code: "title", message: "Book title is missing.", severity: "error", fix: "outline" });
  }

  if (!doc.chapters.length) {
    add({ code: "no-chapters", message: "The book has no chapters.", severity: "error", fix: "chapter" });
  } else if (expected && doc.chapters.length !== expected) {
    add({
      code: "chapter-count",
      message: `Requested ${expected} chapters but ${doc.chapters.length} were generated.`,
      severity: "error",
      fix: "outline",
    });
  }

  if (doc.settings?.includeReferences !== false && !doc.sources.length) {
    add({
      code: "no-sources",
      message: "No verified sources were collected, so references cannot be produced.",
      severity: "error",
      fix: "research",
    });
  }

  for (const chapter of doc.chapters) {
    const n = chapter.index + 1;
    const at = (code: string, message: string, fix?: ValidationProblem["fix"], severity: ValidationSeverity = "error") =>
      add({ chapter: n, chapterTitle: chapter.title, code, message, severity, fix });

    if (!chapter.title?.trim()) at("chapter-title", "Chapter title is missing.", "chapter");

    const bodyText = chapter.sections.map((s) => stripHtml(s.html)).join(" ").trim();
    if (!chapter.sections.length || bodyText.length < 200) {
      at("chapter-empty", "Chapter has no substantive content.", "chapter");
    }

    if (!chapter.summary?.trim() || stripHtml(chapter.summary).length < 40) {
      at("chapter-summary", "Chapter summary is missing or too short.", "chapter");
    }

    // Placeholder scan across everything a reader can see.
    const visible = [
      chapter.title,
      chapter.summary,
      ...chapter.sections.flatMap((s) => [s.heading, stripHtml(s.html)]),
      ...chapter.keyPoints,
      ...chapter.examples,
      ...chapter.questions.flatMap((q) => [q.question, q.answer]),
      ...chapter.mcqs.flatMap((m) => [m.question, m.answer, m.explanation || "", ...(m.options || [])]),
      ...(chapter.images || []).map((i) => i.caption),
    ].join("\n");
    const found = findPlaceholders(visible);
    if (found.length) {
      at("placeholder", `Contains placeholder text: ${[...new Set(found)].slice(0, 3).join(", ")}.`, "chapter");
    }

    if (doc.settings?.includeExercises !== false) {
      questions += chapter.questions.length;
      if (chapter.questions.length < MIN_QUESTIONS_PER_CHAPTER) {
        at(
          "questions-count",
          `Only ${chapter.questions.length} questions (minimum ${MIN_QUESTIONS_PER_CHAPTER}).`,
          "questions"
        );
      }
      if (chapter.questions.length > MAX_QUESTIONS_PER_CHAPTER) {
        at(
          "questions-count",
          `${chapter.questions.length} questions exceeds the maximum of ${MAX_QUESTIONS_PER_CHAPTER}.`,
          "questions",
          "warning"
        );
      }
      const bad = chapter.questions.filter((q) => !isCompleteAnswer(q.answer));
      incompleteAnswers += bad.length;
      if (bad.length) {
        at("unanswered", `${bad.length} question(s) have no complete answer.`, "answers");
      }
      const emptyQ = chapter.questions.filter((q) => !q.question?.trim() || isPlaceholderText(q.question));
      if (emptyQ.length) at("empty-question", `${emptyQ.length} question(s) are empty or placeholder.`, "questions");
    }

    if (doc.settings?.includeMcqs !== false) {
      mcqs += chapter.mcqs.length;
      if (chapter.mcqs.length < MIN_MCQS_PER_CHAPTER) {
        at("mcq-count", `Only ${chapter.mcqs.length} MCQs (minimum ${MIN_MCQS_PER_CHAPTER}).`, "questions");
      }
      const malformed = chapter.mcqs.filter(
        (m) =>
          !Array.isArray(m.options) ||
          m.options.length !== 4 ||
          !m.answer?.trim() ||
          !m.options.includes(m.answer) ||
          !m.explanation?.trim()
      );
      if (malformed.length) {
        at(
          "mcq-malformed",
          `${malformed.length} MCQ(s) lack four options, a valid correct answer, or an explanation.`,
          "questions"
        );
      }
    }

    if (doc.settings?.includeReferences !== false && !(chapter.sourceIds || []).length) {
      at("chapter-sources", "Chapter cites no sources.", "research");
    }

    const chapterImages = chapter.images || [];
    images += chapterImages.length;
    const uncaptioned = chapterImages.filter((i) => !i.caption?.trim());
    if (uncaptioned.length) {
      at("image-caption", `${uncaptioned.length} image(s) have no caption.`, "images");
    }

    // Language conformance: Hindi books must render Hindi prose.
    if (hindi && bodyText.length > 200) {
      const devanagari = (bodyText.match(/[\u0900-\u097F]/g) || []).length;
      if (devanagari / bodyText.length < 0.15) {
        at("language", "Chapter is not predominantly Hindi/Devanagari.", "chapter");
      }
    }
  }

  const words = doc.chapters.reduce((n, c) => n + (c.wordCount || 0), 0);

  return {
    ok: problems.every((p) => p.severity !== "error"),
    checkedAt: new Date().toISOString(),
    problems,
    counts: {
      chapters: doc.chapters.length,
      expectedChapters: expected,
      questions,
      incompleteAnswers,
      mcqs,
      sources: doc.sources.length,
      images,
      words,
    },
  };
}

/** Human-readable failure summary, grouped per chapter. */
export function describeValidation(report: ValidationReport, hindi = false): string {
  if (report.ok) return hindi ? "पुस्तक तैयार है।" : "Book is ready.";
  const lines: string[] = [hindi ? "पुस्तक अभी पूर्ण नहीं है। समस्याएँ:" : "Book cannot be completed yet. Problems:"];
  const book = report.problems.filter((p) => !p.chapter);
  for (const p of book) lines.push(`- ${p.message}`);
  const byChapter = new Map<number, ValidationProblem[]>();
  for (const p of report.problems) {
    if (!p.chapter) continue;
    const list = byChapter.get(p.chapter) || [];
    list.push(p);
    byChapter.set(p.chapter, list);
  }
  for (const [n, list] of [...byChapter.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(hindi ? `अध्याय ${n}:` : `Chapter ${n}:`);
    for (const p of list) lines.push(`  - ${p.message}`);
  }
  return lines.join("\n");
}
