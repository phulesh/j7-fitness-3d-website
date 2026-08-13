"use client";

import { useMemo, useState } from "react";
import type { EbookDocument } from "@/lib/types";
import { labelsFor } from "@/lib/generate/text";

export function ReadingView({ doc, initialChapter = 0 }: { doc: EbookDocument; initialChapter?: number }) {
  const [chIndex, setChIndex] = useState(initialChapter);
  const chapter = doc.chapters[chIndex];
  const labels = useMemo(() => labelsFor(doc.outputLanguage || doc.language), [doc.outputLanguage, doc.language]);
  const hindi = (doc.outputLanguage || doc.language) === "hi";

  return (
    <div className={`mx-auto max-w-3xl ${hindi ? "font-devanagari" : ""}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <select
          className="field !py-1.5 max-w-full"
          value={chIndex}
          onChange={(e) => setChIndex(Number(e.target.value))}
        >
          {doc.chapters.map((c, i) => (
            <option key={c.id} value={i}>
              {i + 1}. {c.title}
            </option>
          ))}
        </select>
        <span className="text-ink-400">
          {chIndex + 1} / {Math.max(1, doc.chapters.length)}
        </span>
      </div>

      {!chapter && <p className="text-ink-400">Chapters are not ready yet. Open Outline to continue writing.</p>}

      {chapter && (
        <article className="paper-card rounded-2xl p-5 md:p-10">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-500">
            {labels.chapter} {chapter.index + 1}
          </p>
          <h1 className="font-display mt-2 text-3xl">{chapter.title}</h1>
          {chapter.learningObjectives.length > 0 && (
            <section className="mt-6">
              <h2 className="font-display text-xl">{labels.objectives}</h2>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {chapter.learningObjectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </section>
          )}
          {chapter.sections.map((s) => (
            <section key={s.id} className="prose-ebook mt-6">
              <h3>{s.heading}</h3>
              <div dangerouslySetInnerHTML={{ __html: s.html }} />
            </section>
          ))}
          {chapter.keyPoints.length > 0 && (
            <section className="mt-6">
              <h2 className="font-display text-xl">{labels.keyPoints}</h2>
              <ul className="mt-2 list-disc pl-5">
                {chapter.keyPoints.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </section>
          )}
          {chapter.examples.length > 0 && (
            <section className="mt-6">
              <h2 className="font-display text-xl">{labels.examples}</h2>
              <ul className="mt-2 list-disc pl-5">
                {chapter.examples.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </section>
          )}
          {chapter.summary && (
            <section className="mt-6">
              <h2 className="font-display text-xl">{labels.summary}</h2>
              <p className="mt-2">{chapter.summary}</p>
            </section>
          )}
          {!chapter.sections.some((s) => /ebook-figure/.test(s.html)) &&
            chapter.images.map((img) => (
            <figure key={img.id || img.sourceUrl || img.url} className="ebook-figure mt-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt || img.caption} className="max-h-80 w-full rounded-lg object-contain" loading="lazy" />
              <figcaption className="mt-1 text-xs text-ink-400">
                <strong>{img.figureLabel || img.caption}</strong> — {img.credit}
                {img.verifiedHistoricalPhoto === false ? " — व्याख्यात्मक चित्र — यह ऐतिहासिक फोटोग्राफ नहीं है।" : ""}
              </figcaption>
            </figure>
          ))}
          {chapter.questions.length > 0 && (
            <section className="mt-6">
              <h2 className="font-display text-xl">{labels.questions}</h2>
              {chapter.questions.map((q, i) => (
                <p key={i} className="mt-2 text-sm">
                  {i + 1}. {q.question}
                </p>
              ))}
            </section>
          )}
          {chapter.mcqs.length > 0 && (
            <section className="mt-6">
              <h2 className="font-display text-xl">{labels.mcqs}</h2>
              {chapter.mcqs.map((q, i) => (
                <div key={i} className="mt-3 text-sm">
                  <p>
                    {i + 1}. {q.question}
                  </p>
                  <ul className="ml-4">
                    {(q.options || []).map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </article>
      )}

      <div className="mt-4 flex gap-2">
        <button className="btn-ghost flex-1 min-h-[48px]" disabled={chIndex === 0} onClick={() => setChIndex((i) => i - 1)}>
          Previous
        </button>
        <button
          className="btn-ghost flex-1 min-h-[48px]"
          disabled={chIndex >= doc.chapters.length - 1}
          onClick={() => setChIndex((i) => i + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
