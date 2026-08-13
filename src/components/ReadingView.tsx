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
            <section className="chapter-answers mt-8" aria-label={labels.questions}>
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-paper-400 pb-3">
                <h2 className="font-display text-xl">{hindi ? "पाठक के प्रश्न और पूरे उत्तर" : `${labels.questions} with answers`}</h2>
                <span className="rounded-full bg-gold-100 px-2.5 py-1 text-xs font-semibold text-gold-700">
                  {chapter.questions.length} {hindi ? "उत्तर" : "answers"}
                </span>
              </div>
              <div className="space-y-5">
                {chapter.questions.map((q, i) => (
                  <article key={i} className="answer-card rounded-xl border border-paper-400 bg-paper-50/70 p-4 md:p-5">
                    <h3 className="font-display text-lg leading-snug text-ink-700">
                      <span className="mr-2 text-burgundy-500">{hindi ? "प्रश्न" : "Question"} {i + 1}.</span>
                      {q.question}
                    </h3>
                    <div className="mt-3 border-l-2 border-gold-300 pl-4 text-[0.98rem] leading-7 text-ink-600">
                      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-gold-600">{hindi ? "उत्तर" : "Answer"}</p>
                      {q.answer.split(/\n{2,}/).filter(Boolean).map((paragraph, paragraphIndex) => (
                        <p key={paragraphIndex} className="mt-3 first:mt-0">{paragraph}</p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
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
