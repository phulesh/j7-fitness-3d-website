"use client";

import { CREATE_STEPS, progressStepIndex } from "@/lib/simple-flow";
import type { EbookDocument } from "@/lib/types";
import { FloatingBook } from "./FloatingBook";

export function CreatingBook({
  doc,
  onRetry,
}: {
  doc: EbookDocument;
  onRetry?: () => void;
}) {
  const idx = progressStepIndex(doc);
  const percent = Math.max(doc.progress?.percent || 8, Math.round(((idx + 1) / CREATE_STEPS.length) * 100));
  const failed = doc.status === "failed";
  const blocked = Boolean(doc.researchQuality?.generationBlocked);

  return (
    <section className="mx-auto max-w-xl px-4 py-10 text-center">
      <FloatingBook title={doc.title || doc.settings.topic} subtitle="तैयार हो रही है" coverSvg={doc.cover?.svg} />
      <h1 className="font-display mt-10 text-3xl leading-tight">आपकी किताब तैयार हो रही है...</h1>
      <p className="mt-3 text-ink-400">
        {failed
          ? "कुछ रुक गया। आपकी किताब सुरक्षित है — फिर से कोशिश करें।"
          : "AI शोध कर रहा है, अध्याय लिख रहा है, और कवर बना रहा है।"}
      </p>

      <div className="mx-auto mt-8 h-2 max-w-sm overflow-hidden rounded-full bg-paper-300">
        <div className="h-full bg-ink-700 transition-all duration-500" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="mt-2 text-sm text-ink-400">{Math.min(100, percent)}%</p>

      <ol className="mx-auto mt-8 max-w-sm space-y-2 text-left text-sm">
        {CREATE_STEPS.map((s, i) => {
          const done = !failed && i < idx;
          const active = !failed && i === idx;
          return (
            <li
              key={s.id}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                active ? "bg-paper-100 text-ink-700" : done ? "text-forest-500" : "text-ink-300"
              }`}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full border border-current text-xs">
                {done ? "✓" : active ? "•" : i + 1}
              </span>
              <span>{s.hi}</span>
            </li>
          );
        })}
      </ol>

      {(failed || blocked) && (
        <div className="paper-card mx-auto mt-8 max-w-sm rounded-2xl p-5 text-left text-sm">
          <p>
            {blocked
              ? "विश्वसनीय स्रोत पर्याप्त नहीं मिले। बिना अनुमान के किताब नहीं लिखी गई।"
              : "जनरेशन रुक गई। आपकी प्रगति सुरक्षित है।"}
          </p>
          {onRetry && (
            <button className="btn-gold mt-4 w-full min-h-[48px]" onClick={onRetry}>
              फिर से कोशिश करें
            </button>
          )}
        </div>
      )}
    </section>
  );
}
