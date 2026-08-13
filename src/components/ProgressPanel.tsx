"use client";

const STEPS = [
  { key: "analyzing", label: "शोध शुरू हो रहा है…" },
  { key: "researching", label: "विश्वसनीय स्रोत खोजे जा रहे हैं…" },
  { key: "outlining", label: "अध्याय-रूपरेखा बन रही है…" },
  { key: "writing", label: "अध्याय लिखे जा रहे हैं…" },
  { key: "fact_checking", label: "तथ्यों की जाँच हो रही है…" },
  { key: "complete", label: "डाउनलोड तैयार हो रहा है…" },
];

export function ProgressPanel({
  message,
  detail,
  percent,
  step,
}: {
  message: string;
  detail?: string;
  percent: number;
  step?: string;
}) {
  return (
    <section className="paper-card mt-8 rounded-2xl p-6 md:p-8">
      <p className="text-xs uppercase tracking-[0.2em] text-gold-500">Live pipeline</p>
      <h2 className="font-display mt-2 text-2xl">{message}</h2>
      {detail && <p className="mt-2 text-sm text-ink-400">{detail}</p>}
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-paper-300">
        <div className="h-full bg-ink-700 transition-all duration-500" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <ol className="mt-6 space-y-2 text-sm">
        {STEPS.map((s) => {
          const active = s.key === step || s.label === message;
          const done = STEPS.findIndex((x) => x.key === step) > STEPS.findIndex((x) => x.key === s.key);
          return (
            <li key={s.key} className={active ? "text-ink-700" : done ? "text-forest-500" : "text-ink-300"}>
              {done ? "●" : active ? "○" : "·"} {s.label}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
