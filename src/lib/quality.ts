import type { EbookDocument } from "./types";
import { htmlToPlain } from "./simple-flow";

export type QualityIssue = {
  id: string;
  severity: "error" | "warn";
  message: string;
  fixable: boolean;
};

export type QualityCheck = {
  id: string;
  ok: boolean;
  label: string;
};

export type QualityReport = {
  score: number;
  checks: QualityCheck[];
  issues: QualityIssue[];
};

function normalizeBlob(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function scoreBook(doc: EbookDocument): QualityReport {
  const issues: QualityIssue[] = [];
  const checks: QualityCheck[] = [];
  let score = 100;

  const expected = Math.max(doc.outline.length, doc.chapterCount || 0, doc.chapters.length);
  const completeChapters = doc.chapters.filter((c) => c && (c.sections?.length || c.wordCount > 0));
  const missing = expected > 0 ? expected - completeChapters.length : 0;
  checks.push({
    id: "structure",
    ok: missing === 0 && completeChapters.length > 0,
    label: missing === 0 && completeChapters.length > 0 ? "Structure complete" : "Structure incomplete",
  });
  if (completeChapters.length === 0) {
    score -= 35;
    issues.push({ id: "no-chapters", severity: "error", message: "No chapters have been written yet.", fixable: true });
  } else if (missing > 0) {
    score -= Math.min(28, missing * 6);
    issues.push({
      id: "missing-chapters",
      severity: "error",
      message: `${missing} chapter${missing === 1 ? "" : "s"} still need to be written.`,
      fixable: true,
    });
  }

  const empty = doc.chapters.filter((c) => !c?.sections?.some((s) => htmlToPlain(s.html).length > 40));
  if (empty.length) {
    score -= Math.min(15, empty.length * 4);
    issues.push({
      id: "empty",
      severity: "error",
      message: `${empty.length} chapter${empty.length === 1 ? "" : "s"} look empty.`,
      fixable: true,
    });
  }

  const titles = doc.chapters.map((c) => normalizeBlob(c.title));
  const dupTitles = titles.filter((t, i) => t && titles.indexOf(t) !== i);
  checks.push({
    id: "dup-chapters",
    ok: dupTitles.length === 0,
    label: dupTitles.length === 0 ? "No duplicate chapters" : "Duplicate chapter titles",
  });
  if (dupTitles.length) {
    score -= 8;
    issues.push({
      id: "dup-titles",
      severity: "warn",
      message: "Some chapter titles are repeated.",
      fixable: false,
    });
  }

  const paragraphs: string[] = [];
  for (const ch of doc.chapters) {
    for (const s of ch.sections || []) {
      for (const p of htmlToPlain(s.html).split(/\n{2,}/)) {
        const n = normalizeBlob(p);
        if (n.length > 80) paragraphs.push(n);
      }
    }
  }
  const seen = new Set<string>();
  let repeats = 0;
  for (const p of paragraphs) {
    if (seen.has(p)) repeats++;
    seen.add(p);
  }
  if (repeats > 0) {
    score -= Math.min(12, repeats * 3);
    issues.push({
      id: "repeats",
      severity: "warn",
      message: `${repeats} repeated paragraph${repeats === 1 ? "" : "s"} found.`,
      fixable: true,
    });
  }

  const cited = new Set<number>();
  const broken: number[] = [];
  const sourceIds = new Set(doc.sources.map((s) => s.id));
  const body = [
    doc.introduction,
    doc.conclusion,
    ...doc.chapters.flatMap((c) => c.sections.map((s) => s.html)),
  ].join("\n");
  for (const m of body.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    cited.add(n);
    if (!sourceIds.has(n)) broken.push(n);
  }
  const uniqueBroken = Array.from(new Set(broken));
  checks.push({
    id: "citations",
    ok: uniqueBroken.length === 0,
    label: uniqueBroken.length === 0 ? "Citations verified" : "Some citations are broken",
  });
  if (uniqueBroken.length) {
    score -= Math.min(12, uniqueBroken.length * 2);
    issues.push({
      id: "broken-cite",
      severity: "warn",
      message: `${uniqueBroken.length} citation${uniqueBroken.length === 1 ? "" : "s"} do not match the source list.`,
      fixable: false,
    });
  }

  const refsOk = !doc.settings.includeReferences || doc.sources.length > 0;
  checks.push({
    id: "refs",
    ok: refsOk,
    label: refsOk ? "References complete" : "References missing",
  });
  if (!refsOk) {
    score -= 10;
    issues.push({ id: "no-refs", severity: "warn", message: "The references list is empty.", fixable: false });
  }

  const flags = doc.chapters.flatMap((c) => c.factFlags || []);
  const weak = flags.filter((f) => f.status === "unsupported" || f.status === "contested" || f.status === "needs_review");
  if (weak.length) {
    score -= Math.min(16, weak.length * 2);
    issues.push({
      id: "weak-claims",
      severity: "warn",
      message: `${weak.length} claim${weak.length === 1 ? "" : "s"} require stronger evidence.`,
      fixable: true,
    });
  }

  const images = doc.chapters.flatMap((c) => c.images || []);
  const badImg = images.filter((img) => !img.caption || !img.url);
  if (badImg.length) {
    score -= 4;
    issues.push({
      id: "images",
      severity: "warn",
      message: `${badImg.length} image${badImg.length === 1 ? "" : "s"} are missing a caption or file.`,
      fixable: false,
    });
  }

  if (doc.settings.includeToc && doc.outline.length && doc.chapters.length) {
    const mismatch = doc.outline.length !== doc.chapters.length;
    checks.push({
      id: "toc",
      ok: !mismatch,
      label: mismatch ? "Table of contents needs an update" : "Table of contents matches chapters",
    });
    if (mismatch) {
      score -= 4;
      issues.push({
        id: "toc-mismatch",
        severity: "warn",
        message: "The table of contents does not match the written chapters.",
        fixable: true,
      });
    }
  }

  const numberingOff = doc.chapters.some((c, i) => typeof c.index === "number" && c.index !== i);
  if (numberingOff) {
    score -= 3;
    issues.push({ id: "numbering", severity: "warn", message: "Chapter numbering looks inconsistent.", fixable: true });
  }

  if (!doc.title?.trim()) {
    score -= 8;
    issues.push({ id: "title", severity: "error", message: "This book is missing a title.", fixable: false });
  }

  score = Math.max(12, Math.min(100, Math.round(score)));
  return { score, checks, issues };
}
