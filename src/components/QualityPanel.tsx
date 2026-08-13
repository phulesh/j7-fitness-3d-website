"use client";

import type { QualityReport } from "@/lib/quality";

export function QualityPanel({
  report,
  onFix,
  onReview,
  busy,
}: {
  report: QualityReport;
  onFix?: () => void;
  onReview?: () => void;
  busy?: boolean;
}) {
  const tone = report.score >= 85 ? "text-forest-500" : report.score >= 70 ? "text-review" : "text-unsupported";
  return (
    <section className="paper-card rounded-2xl p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-gold-500">Book quality</p>
      <p className={`font-display mt-2 text-3xl ${tone}`}>BOOK QUALITY SCORE: {report.score}/100</p>
      <ul className="mt-4 space-y-1.5 text-sm">
        {report.checks.map((c) => (
          <li key={c.id} className={c.ok ? "text-forest-500" : "text-review"}>
            {c.ok ? "✓" : "⚠"} {c.label}
          </li>
        ))}
        {report.issues.map((i) => (
          <li key={i.id} className={i.severity === "error" ? "text-unsupported" : "text-review"}>
            ⚠ {i.message}
          </li>
        ))}
      </ul>
      {report.issues.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {onFix && (
            <button className="btn-gold min-h-[44px]" disabled={busy} onClick={onFix}>
              {busy ? " ठीक हो रहा है…" : "Fix Automatically"}
            </button>
          )}
          {onReview && (
            <button className="btn-ghost min-h-[44px]" onClick={onReview}>
              Review Issues
            </button>
          )}
        </div>
      )}
    </section>
  );
}
