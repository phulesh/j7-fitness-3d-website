"use client";

import {
  AUDIENCES,
  COVER_STYLES,
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  EBOOK_TYPES,
  LANGUAGES,
  LENGTHS,
  STYLES,
  type EbookSettings,
} from "@/lib/types";

export function SettingsForm({
  value,
  onChange,
}: {
  value: EbookSettings;
  onChange: (next: EbookSettings) => void;
}) {
  function set<K extends keyof EbookSettings>(k: K, v: EbookSettings[K]) {
    if (k === "language") {
      const lang = String(v);
      onChange({ ...value, language: lang, outputLanguage: lang === "auto" ? "auto" : lang });
      return;
    }
    if (k === "title") {
      onChange({ ...value, title: String(v), customTitle: String(v) });
      return;
    }
    onChange({ ...value, [k]: v });
  }

  const checks: { key: keyof EbookSettings; label: string }[] = [
    { key: "includeExamples", label: "Include Examples" },
    { key: "includeExercises", label: "Include Exercises" },
    { key: "includeMcqs", label: "Include MCQs" },
    { key: "includeGlossary", label: "Include Glossary" },
    { key: "includeReferences", label: "Include References" },
    { key: "includeImages", label: "Include Images" },
    { key: "includeToc", label: "Include Table of Contents" },
    { key: "includePageNumbers", label: "Include Page Numbers" },
    { key: "includeAuthor", label: "Include Author Name" },
    { key: "includeCover", label: "Include Cover Page" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Topic / Title">
        <input className="field" value={value.topic} onChange={(e) => set("topic", e.target.value)} required />
      </Field>
      <Field label="Custom title (optional)">
        <input className="field" value={value.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="Leave blank to derive from topic" />
      </Field>
      <Field label="Output language">
        <select className="field" value={value.language} onChange={(e) => set("language", e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name} — {l.native}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ebook type">
        <select className="field" value={value.type} onChange={(e) => set("type", e.target.value as EbookSettings["type"])}>
          {EBOOK_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Target audience">
        <select className="field" value={value.audience} onChange={(e) => set("audience", e.target.value)}>
          {AUDIENCES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Difficulty">
        <select className="field" value={value.difficulty} onChange={(e) => set("difficulty", e.target.value as EbookSettings["difficulty"])}>
          {DIFFICULTIES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Number of chapters">
        <input
          type="number"
          min={4}
          max={20}
          className="field"
          value={value.chapterCount}
          onChange={(e) => set("chapterCount", Number(e.target.value))}
        />
      </Field>
      <Field label="Approximate length">
        <select className="field" value={value.length} onChange={(e) => set("length", e.target.value as EbookSettings["length"])}>
          {LENGTHS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label} — {l.hint}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Writing style">
        <select className="field" value={value.style} onChange={(e) => set("style", e.target.value)}>
          {STYLES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Cover style">
        <select className="field" value={value.coverStyle} onChange={(e) => set("coverStyle", e.target.value as EbookSettings["coverStyle"])}>
          {COVER_STYLES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Author name">
        <input className="field" value={value.authorName} onChange={(e) => set("authorName", e.target.value)} placeholder="Your name or Folio Research" />
      </Field>
      <Field label="Subtitle (optional)">
        <input className="field" value={value.subtitle || ""} onChange={(e) => set("subtitle", e.target.value)} />
      </Field>

      <div className="md:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {checks.map((c) => (
          <label key={c.key} className="flex items-center gap-3 rounded-xl border border-paper-300 bg-paper-50 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(value[c.key])}
              onChange={(e) => set(c.key, e.target.checked as never)}
            />
            {c.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-ink-400">{label}</span>
      {children}
    </label>
  );
}

export { DEFAULT_SETTINGS };
