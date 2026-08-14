"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { EbookDocument } from "@/lib/types";
import type { ValidationProblem } from "@/lib/generate/validate";

/**
 * Shows exactly why a book is not Ready, grouped per chapter, with targeted
 * repair actions. Nothing here regenerates the whole book.
 */
export function ValidationPanel({
  doc,
  ebookId,
  onFixed,
}: {
  doc: EbookDocument;
  ebookId: string;
  onFixed: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const report = doc.validation;

  if (!report) return null;

  if (report.ok) {
    return (
      <div className="paper-card mt-5 rounded-2xl p-5 text-sm">
        <p className="font-semibold text-verified">✓ Validation passed — the book is complete.</p>
        <p className="mt-1 text-ink-400">
          {report.counts.chapters} chapters · {report.counts.questions} questions · {report.counts.mcqs} MCQs ·{" "}
          {report.counts.sources} sources · {report.counts.words.toLocaleString()} words
        </p>
      </div>
    );
  }

  const errors = report.problems.filter((p) => p.severity === "error");
  const byChapter = new Map<number | "book", ValidationProblem[]>();
  for (const problem of errors) {
    const key = problem.chapter ?? ("book" as const);
    byChapter.set(key, [...(byChapter.get(key) || []), problem]);
  }

  async function repair(chapter: number, fix: ValidationProblem["fix"]) {
    const actions: Record<string, string> = {
      questions: "regenerate-questions",
      answers: "regenerate-answers",
      chapter: "regenerate",
      images: "add-image",
    };
    const action = actions[fix || "chapter"];
    if (!action) return;
    setBusy(`${chapter}-${fix}`);
    setError("");
    try {
      await api(`/api/ebooks/${ebookId}/chapter/${chapter - 1}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      onFixed();
    } catch (e: any) {
      setError(e.message || "Repair failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="paper-card mt-5 rounded-2xl border border-unsupported/40 p-5 text-sm">
      <p className="font-semibold text-unsupported">Book cannot be completed yet.</p>
      <p className="mt-1 text-ink-400">
        {report.counts.chapters}/{report.counts.expectedChapters} chapters ·{" "}
        {report.counts.incompleteAnswers} unanswered question(s)
      </p>
      {error && <p className="mt-2 text-unsupported">{error}</p>}

      <div className="mt-4 space-y-3">
        {[...byChapter.entries()]
          .sort((a, b) => (a[0] === "book" ? -1 : b[0] === "book" ? 1 : Number(a[0]) - Number(b[0])))
          .map(([key, problems]) => (
            <div key={String(key)} className="rounded-xl border border-paper-300 bg-paper-50 p-3">
              <p className="font-medium">
                {key === "book" ? "Whole book" : `Chapter ${key}`}
                {key !== "book" && problems[0]?.chapterTitle ? ` — ${problems[0].chapterTitle}` : ""}
              </p>
              <ul className="mt-1 list-disc pl-5 text-ink-500">
                {problems.map((p, i) => (
                  <li key={i}>{p.message}</li>
                ))}
              </ul>
              {key !== "book" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...new Set(problems.map((p) => p.fix).filter(Boolean))].map((fix) => (
                    <button
                      key={fix}
                      className="btn-ghost !py-1 text-xs"
                      disabled={Boolean(busy)}
                      onClick={() => repair(Number(key), fix as ValidationProblem["fix"])}
                    >
                      {busy === `${key}-${fix}` ? "Fixing…" : `Retry ${fix}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
