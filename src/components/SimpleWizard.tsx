"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { nanoid } from "nanoid";
import { api, ensureSession } from "@/lib/client";
import {
  DEFAULT_WIZARD,
  SIMPLE_AUDIENCES,
  SIMPLE_LANGUAGES,
  SIMPLE_SIZES,
  SIMPLE_STYLES,
  clearWizard,
  loadWizard,
  saveWizard,
  suggestTitle,
  wizardToSettings,
  writeLastBook,
  type WizardState,
} from "@/lib/simple-flow";
import { LANGUAGES } from "@/lib/types";
import { ErrorBanner } from "./ErrorBanner";
import { FloatingBook } from "./FloatingBook";
import { SettingsForm } from "./SettingsForm";
import { Upload } from "lucide-react";

export function SimpleWizard() {
  const params = useSearchParams();
  const router = useRouter();
  const createKey = useRef(nanoid(16));
  const creating = useRef(false);
  const [wizard, setWizard] = useState<WizardState>(() => {
    const topic = params.get("topic") || "";
    return {
      ...DEFAULT_WIZARD,
      topic,
      title: suggestTitle(topic, "hi"),
    };
  });
  const [step, setStep] = useState(0);
  const [advanced, setAdvanced] = useState(params.get("advanced") === "1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [syllabusNote, setSyllabusNote] = useState("");

  useEffect(() => {
    const draft = loadWizard();
    const topic = params.get("topic") || draft.topic || wizard.topic;
    setWizard({
      ...draft,
      topic,
      title: draft.title || suggestTitle(topic, draft.language || "hi"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveWizard(wizard);
  }, [wizard]);

  useEffect(() => {
    ensureSession().catch(() => {});
  }, []);

  function patch(p: Partial<WizardState>) {
    setWizard((w) => ({ ...w, ...p }));
  }

  const settings = useMemo(() => wizardToSettings(wizard), [wizard]);

  async function suggestName() {
    setSuggesting(true);
    setError("");
    try {
      await ensureSession();
      const data = await api("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ topic: wizard.topic, language: wizard.language }),
      });
      const title = data.analysis?.normalizedTitle || suggestTitle(wizard.topic, wizard.language);
      const subtitle = data.analysis?.subtitle || wizard.subtitle;
      patch({ title, subtitle });
    } catch {
      patch({ title: suggestTitle(wizard.topic, wizard.language) });
    } finally {
      setSuggesting(false);
    }
  }

  async function onUpload(file: File) {
    setBusy(true);
    setError("");
    try {
      await ensureSession();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      patch({
        syllabusText: data.text || "",
        topic: wizard.topic || data.syllabus?.subject || wizard.topic,
      });
      setSyllabusNote(
        data.syllabus?.detected
          ? `पाठ्यक्रम मिला: ${data.syllabus.subject || file.name}`
          : "दस्तावेज़ सेव हो गया।"
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function createBook(e?: FormEvent) {
    e?.preventDefault();
    if (creating.current) return;
    if (wizard.topic.trim().length < 3) {
      setError("कृपया विषय थोड़ा और स्पष्ट लिखें।");
      return;
    }
    creating.current = true;
    setBusy(true);
    setError("");
    try {
      await ensureSession();
      const created = await api("/api/ebooks", {
        method: "POST",
        headers: { "Idempotency-Key": createKey.current, "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const id = (created.ebook.ebookId || created.ebook.id) as string;
      if (wizard.syllabusText.trim().length > 40) {
        try {
          const parsed = await api("/api/analyze", {
            method: "POST",
            body: JSON.stringify({ topic: wizard.topic, syllabusText: wizard.syllabusText }),
          });
          if (parsed.syllabus) {
            await api(`/api/ebooks/${id}`, { method: "PATCH", body: JSON.stringify({ syllabus: parsed.syllabus }) });
          }
        } catch {
          /* syllabus optional */
        }
      }
      await api(`/api/ebooks/${id}/generate`, { method: "POST", body: JSON.stringify({}) });
      writeLastBook(created.ebook);
      clearWizard();
      router.replace(`/ebooks/${id}`);
    } catch (err: any) {
      creating.current = false;
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    {
      title: "आपकी किताब किस भाषा में हो?",
      body: (
        <OptionGrid
          options={SIMPLE_LANGUAGES.map((l) => ({ id: l.id, label: l.label, hint: l.native }))}
          value={wizard.language}
          onChange={(language) =>
            patch({
              language,
              title: wizard.title || suggestTitle(wizard.topic, language),
            })
          }
        />
      ),
    },
    {
      title: "किसके लिए?",
      body: (
        <OptionGrid
          options={SIMPLE_AUDIENCES.map((a) => ({ id: a.id, label: a.label, hint: a.hint }))}
          value={wizard.audience}
          onChange={(audience) => patch({ audience })}
        />
      ),
    },
    {
      title: "कितनी बड़ी किताब?",
      body: (
        <OptionGrid
          options={SIMPLE_SIZES.map((s) => ({ id: s.id, label: s.label, hint: s.hint }))}
          value={wizard.size}
          onChange={(size) => patch({ size })}
        />
      ),
    },
    {
      title: "किताब का अंदाज़",
      body: (
        <OptionGrid
          options={SIMPLE_STYLES.map((s) => ({ id: s.id, label: s.label, hint: s.hint }))}
          value={wizard.style}
          onChange={(style) => patch({ style })}
        />
      ),
    },
    {
      title: "किताब का नाम",
      body: (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-400">शीर्षक</span>
            <input className="field" value={wizard.title} onChange={(e) => patch({ title: e.target.value })} />
          </label>
          <button type="button" className="btn-ghost min-h-[44px]" disabled={suggesting} onClick={suggestName}>
            {suggesting ? "सोच रहे हैं…" : "AI से नाम सुझाएँ"}
          </button>
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-400">उपशीर्षक (वैकल्पिक)</span>
            <input
              className="field"
              value={wizard.subtitle}
              onChange={(e) => patch({ subtitle: e.target.value })}
              placeholder="एक छोटी पंक्ति"
            />
          </label>
          {wizard.language === "other" && (
            <label className="block text-sm">
              <span className="mb-1.5 block text-ink-400">भाषा चुनें</span>
              <select className="field" value={wizard.otherLanguage} onChange={(e) => patch({ otherLanguage: e.target.value })}>
                {LANGUAGES.filter((l) => l.code !== "auto").map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} — {l.native}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <div className="flex justify-center">
        <FloatingBook
          title={wizard.title || wizard.topic || "नई किताब"}
          subtitle={wizard.subtitle || "Folio"}
          size="md"
        />
      </div>
      <p className="mt-6 text-center text-xs uppercase tracking-[0.18em] text-gold-500">
        चरण {step + 1} / {steps.length}
      </p>
      <h1 className="font-display mt-3 text-center text-3xl">{steps[step].title}</h1>
      <p className="mt-2 text-center text-sm text-ink-400">{wizard.topic}</p>
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <div className="mt-8">{steps[step].body}</div>

      <div className="mt-8 flex gap-2">
        {step > 0 && (
          <button type="button" className="btn-ghost min-h-[48px] flex-1" onClick={() => setStep((s) => s - 1)}>
            पीछे
          </button>
        )}
        {step < steps.length - 1 ? (
          <button type="button" className="btn-gold min-h-[48px] flex-1" onClick={() => setStep((s) => s + 1)}>
            आगे
          </button>
        ) : (
          <button type="button" className="btn-gold min-h-[48px] flex-1" disabled={busy} onClick={() => createBook()}>
            {busy ? "शुरू हो रहा है…" : "✨ पूरी किताब बनाएं"}
          </button>
        )}
      </div>

      <button type="button" className="mx-auto mt-6 block text-sm text-ink-400 underline" onClick={() => setAdvanced((v) => !v)}>
        {advanced ? "Advanced Settings छिपाएँ" : "Advanced Settings"}
      </button>

      {advanced && (
        <div className="paper-card mt-6 space-y-5 rounded-2xl p-5">
          <h2 className="font-display text-xl">Advanced Settings</h2>
          <p className="text-sm text-ink-400">ये सेटिंग सामान्य उपयोग के लिए ज़रूरी नहीं हैं।</p>
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-400">Exact chapter count ({wizard.chapterCount || settings.chapterCount})</span>
            <input
              type="range"
              min={5}
              max={25}
              className="w-full"
              value={wizard.chapterCount || settings.chapterCount}
              onChange={(e) => patch({ chapterCount: Number(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-400">Target word count</span>
            <input
              type="number"
              className="field"
              min={3000}
              max={120000}
              value={wizard.targetWords || ""}
              onChange={(e) => patch({ targetWords: Number(e.target.value) || undefined })}
              placeholder="उदा. 15000"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-400">Citation style</span>
            <select className="field" value={wizard.citationStyle} onChange={(e) => patch({ citationStyle: e.target.value })}>
              <option value="simple">Simple</option>
              <option value="apa">APA</option>
              <option value="mla">MLA</option>
              <option value="chicago">Chicago</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-400">Research depth</span>
            <select
              className="field"
              value={wizard.researchDepth}
              onChange={(e) => patch({ researchDepth: e.target.value as WizardState["researchDepth"] })}
            >
              <option value="standard">Standard</option>
              <option value="deep">Deep</option>
              <option value="exhaustive">Exhaustive</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-400">Academic level</span>
            <select
              className="field"
              value={wizard.difficulty}
              onChange={(e) => patch({ difficulty: e.target.value as WizardState["difficulty"] })}
            >
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
              <option>Expert</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-400">Fact-check intensity</span>
            <select
              className="field"
              value={wizard.factCheckIntensity}
              onChange={(e) => patch({ factCheckIntensity: e.target.value as WizardState["factCheckIntensity"] })}
            >
              <option value="standard">Standard</option>
              <option value="strict">Strict</option>
            </select>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={wizard.includeImages} onChange={(e) => patch({ includeImages: e.target.checked })} />
            चित्र शामिल करें
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-400">Custom instructions</span>
            <textarea
              className="field min-h-[100px]"
              value={wizard.customInstructions}
              onChange={(e) => patch({ customInstructions: e.target.value })}
              placeholder="कोई खास निर्देश…"
            />
          </label>
          <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-paper-400 bg-paper-50 px-4 py-8 text-sm">
            <Upload className="mb-2 h-5 w-5 text-gold-500" />
            Custom syllabus अपलोड करें
            <input
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
          </label>
          {syllabusNote && <p className="text-sm text-forest-500">{syllabusNote}</p>}
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-400">सभी तकनीकी सेटिंग्स</summary>
            <div className="mt-4">
              <SettingsForm value={settings} onChange={(s) => {
                patch({
                  topic: s.topic,
                  title: s.title || s.customTitle || wizard.title,
                  subtitle: s.subtitle || "",
                  authorName: s.authorName,
                  includeImages: s.includeImages,
                  includeGlossary: s.includeGlossary,
                  includeReferences: s.includeReferences,
                  includeExamples: s.includeExamples,
                  includeExercises: s.includeExercises,
                  includeMcqs: s.includeMcqs,
                  chapterCount: s.chapterCount,
                  coverStyle: s.coverStyle,
                  difficulty: s.difficulty,
                });
              }} />
            </div>
          </details>
        </div>
      )}

      <div className="sticky-action md:hidden">
        {step < steps.length - 1 ? (
          <button type="button" className="btn-gold w-full min-h-[52px]" onClick={() => setStep((s) => s + 1)}>
            आगे
          </button>
        ) : (
          <button type="button" className="btn-gold w-full min-h-[52px]" disabled={busy} onClick={() => createBook()}>
            {busy ? "शुरू हो रहा है…" : "✨ पूरी किताब बनाएं"}
          </button>
        )}
      </div>
    </div>
  );
}

function OptionGrid({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string; hint?: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`min-h-[72px] rounded-2xl border px-4 py-4 text-left transition ${
            value === o.id ? "border-ink-700 bg-ink-700 text-paper-100" : "border-paper-400 bg-paper-50"
          }`}
        >
          <span className="block font-semibold">{o.label}</span>
          {o.hint && <span className={`mt-1 block text-sm ${value === o.id ? "text-paper-300" : "text-ink-400"}`}>{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}
