"use client";

import { Check, LoaderCircle } from "lucide-react";
import { COMPLETE_PIPELINE_STAGES } from "@/lib/types";

const ALIASES: Record<string, string> = {
  analyzing: "understanding",
  research: "researching",
  sources: "verifying_sources",
  outline: "outlining",
  awaiting_outline: "outlining",
  factcheck: "fact_checking",
  cover: "designing_pages",
  exporting: "creating_3d",
};

export function ProgressPanel({
  message,
  detail,
  percent,
  step,
  language,
}: {
  message: string;
  detail?: string;
  percent: number;
  step?: string;
  language?: string;
}) {
  const normalized = ALIASES[step || ""] || step || "understanding";
  const currentIndex = Math.max(0, COMPLETE_PIPELINE_STAGES.findIndex((stage) => stage.key === normalized));
  const hindi = language === "hi";

  return (
    <section className="paper-card mt-6 overflow-hidden rounded-3xl p-5 md:p-8" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">Complete ebook pipeline</p>
          <h2 className="font-display mt-2 text-2xl">{message || COMPLETE_PIPELINE_STAGES[currentIndex].label}</h2>
          {detail && <p className="mt-2 text-sm text-ink-400">{detail}</p>}
        </div>
        <span className="rounded-full bg-ink-700 px-3 py-1.5 text-sm font-semibold text-paper-100">{Math.min(100, Math.max(0, percent))}%</span>
      </div>
      <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-paper-300">
        <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-ink-700 transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, percent))}%` }} />
      </div>
      <ol className="mt-7 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {COMPLETE_PIPELINE_STAGES.map((stage, index) => {
          const done = index < currentIndex || normalized === "complete";
          const active = index === currentIndex && normalized !== "complete";
          return (
            <li
              key={stage.key}
              className={`flex min-h-[48px] items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                done
                  ? "border-verified/20 bg-verified/10 text-verified"
                  : active
                    ? "border-gold-500/40 bg-gold-500/10 text-ink-700"
                    : "border-paper-300 bg-paper-50 text-ink-300"
              }`}
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? "bg-verified text-white" : active ? "bg-gold-500 text-white" : "bg-paper-300"}`}>
                {done ? <Check className="h-4 w-4" /> : active ? <LoaderCircle className="h-4 w-4 animate-spin" /> : String(index + 1).padStart(2, "0")}
              </span>
              <span><span className="block font-medium">{stage.label}</span>{hindi && <span className="block text-xs opacity-70">{stage.labelHi}</span>}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-5 text-xs text-ink-400">Progress is saved after every stage and every completed chapter. You can safely return to the Library.</p>
    </section>
  );
}
