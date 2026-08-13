"use client";

import { CREATE_STEPS, progressStepIndex } from "@/lib/simple-flow";
import type { EbookDocument } from "@/lib/types";

export function ProgressPanel({
  message,
  detail,
  percent,
  step,
  doc,
}: {
  message: string;
  detail?: string;
  percent: number;
  step?: string;
  doc?: EbookDocument | null;
}) {
  const idx = doc ? progressStepIndex(doc) : CREATE_STEPS.findIndex((s) => s.id === step || s.label === message);
  return (
    <section className="paper-card mt-8 rounded-2xl p-6 md:p-8">
      <p className="text-xs uppercase tracking-[0.2em] text-gold-500">आपकी किताब तैयार हो रही है</p>
      <h2 className="font-display mt-2 text-2xl">{message}</h2>
      {detail && !/json|token|ebookid|request id/i.test(detail) && <p className="mt-2 text-sm text-ink-400">{detail}</p>}
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-paper-300">
        <div className="h-full bg-ink-700 transition-all duration-500" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <ol className="mt-6 space-y-2 text-sm">
        {CREATE_STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={s.id} className={active ? "text-ink-700" : done ? "text-forest-500" : "text-ink-300"}>
              {done ? "✓" : active ? "•" : "·"} {s.hi}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
