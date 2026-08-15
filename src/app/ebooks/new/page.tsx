"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ErrorBanner } from "@/components/ErrorBanner";
import { COMPLETE_PIPELINE_STAGES, DEFAULT_SETTINGS, LANGUAGES, LENGTHS, type EbookSettings, type SyllabusInfo } from "@/lib/types";
import { api, CREATE_DRAFT_KEY, ensureSession } from "@/lib/client";
import { BookOpen, ChevronDown, FileUp, Sparkles } from "lucide-react";
import { nanoid } from "nanoid";
const steps = COMPLETE_PIPELINE_STAGES.map((stage) => stage.label);

function initialSettings(topic = ""): EbookSettings {
  try {
    const saved = typeof window !== "undefined" ? localStorage.getItem(CREATE_DRAFT_KEY) : null;
    const parsed = saved ? JSON.parse(saved) : null;
    const settings = parsed?.settings || parsed || {};
    return { ...DEFAULT_SETTINGS, ...settings, topic: topic || settings.topic || "" };
  } catch { return { ...DEFAULT_SETTINGS, topic }; }
}

function NewInner() {
  const router = useRouter(); const params = useSearchParams(); const key = useRef(nanoid(16));
  const draftId = useRef("");
  const [settings, setSettings] = useState<EbookSettings>(() => initialSettings(params.get("topic") || ""));
  const [source, setSource] = useState(""); const [syllabus, setSyllabus] = useState<SyllabusInfo | null>(null);
  const [advanced, setAdvanced] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    try {
      if (!draftId.current) {
        const parsed = JSON.parse(localStorage.getItem(CREATE_DRAFT_KEY) || "null");
        draftId.current = parsed?.id || `local_${nanoid(24)}`;
      }
      localStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify({ id: draftId.current, updatedAt: new Date().toISOString(), settings }));
    } catch {}
  }, [settings]);
  useEffect(() => { ensureSession().catch(() => {}); }, []);
  const set = <K extends keyof EbookSettings>(name: K, value: EbookSettings[K]) => setSettings(s => ({ ...s, [name]: value }));
  async function upload(file: File) {
    setBusy(true); setError("");
    try { await ensureSession(); const fd = new FormData(); fd.append("file", file); const r = await fetch("/api/upload", { method: "POST", body: fd }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Upload failed"); setSource(d.text || ""); setSyllabus(d.syllabus); if (!settings.topic && d.syllabus?.subject) set("topic", d.syllabus.subject); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function create() {
    if (busy) return; if (settings.topic.trim().length < 3) { setError("Please enter a book topic or title."); return; }
    setBusy(true); setError("");
    try {
      await ensureSession(); let detected = syllabus;
      if (!detected && source.trim().length > 40) detected = (await api("/api/analyze", { method: "POST", body: JSON.stringify({ topic: settings.topic, syllabusText: source }) })).syllabus;
      const created = await api("/api/ebooks", { method: "POST", headers: { "Idempotency-Key": key.current, "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const id = created.ebook.ebookId || created.ebook.id;
      if (detected || source.trim()) await api(`/api/ebooks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          syllabus: detected || undefined,
          sourceMaterial: source.trim()
            ? {
                filename: detected?.sourceTitle || "Pasted source material",
                text: source.slice(0, 200_000),
                uploadedAt: new Date().toISOString(),
              }
            : undefined,
        }),
      });
      // Simple Mode always owns the complex research and writing pipeline.
      await api(`/api/ebooks/${id}/generate`, { method: "POST", body: JSON.stringify({}) });
      localStorage.removeItem(CREATE_DRAFT_KEY); router.replace(`/ebooks/${id}/3d`);
    } catch (e: any) { setError(e.message || "Could not start your ebook."); setBusy(false); }
  }
  return <><Header /><main className="mx-auto max-w-4xl px-4 py-8 md:py-12">
    <div className="mx-auto max-w-2xl text-center"><span className="inline-flex items-center gap-2 rounded-full bg-gold-500/15 px-4 py-2 text-sm font-semibold text-gold-500"><Sparkles className="h-4 w-4" /> ⚡ Simple Mode</span><h1 className="font-display mt-5 text-4xl md:text-5xl">✨ Create your ebook</h1><p className="mt-3 text-ink-400">Enter the essentials. Folio researches, writes, fact-checks, designs, and builds your interactive flipbook automatically.</p></div>
    <ErrorBanner message={error} onDismiss={() => setError("")} />
    <section className="paper-card mt-8 rounded-3xl p-5 md:p-8"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-ink-700 text-sm text-paper-100">1</span><div><h2 className="font-display text-2xl">Book information</h2><p className="text-sm text-ink-400">Smart defaults are already selected.</p></div></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2"><Field label="Book topic / title"><input className="field" autoFocus value={settings.topic} onChange={e => set("topic", e.target.value)} placeholder="e.g. अछूत कौन थे और अछूत कैसे बने?" /></Field><Field label="Language"><select className="field" value={settings.language} onChange={e => { const language = e.target.value; setSettings(s => ({ ...s, language, outputLanguage: language })); }}>{LANGUAGES.filter(l => ["auto","en","hi"].includes(l.code)).map(l => <option key={l.code} value={l.code}>{l.name} — {l.native}</option>)}</select></Field><Field label="Author name"><input className="field" value={settings.authorName} onChange={e => set("authorName", e.target.value)} placeholder="Your name" /></Field><Field label="Number of chapters"><input className="field" type="number" min="4" max="20" value={settings.chapterCount} onChange={e => set("chapterCount", Number(e.target.value))} /></Field><Field label="Book length"><select className="field" value={settings.length} onChange={e => { const length = e.target.value as EbookSettings["length"]; const suggested = LENGTHS.find(x => x.id === length)?.chapters || settings.chapterCount; setSettings(s => ({ ...s, length, chapterCount: suggested })); }}>{LENGTHS.map(l => <option key={l.id} value={l.id}>{l.label} — {l.hint}</option>)}</select></Field><Field label="Subtitle (optional)"><input className="field" value={settings.subtitle || ""} onChange={e => set("subtitle", e.target.value)} placeholder="A concise subtitle" /></Field></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="flex min-h-[116px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-paper-400 bg-paper-50 p-4 text-center text-sm"><FileUp className="mb-2 h-5 w-5 text-gold-500" /><b>Optional: upload source PDF/DOCX</b><span className="mt-1 text-ink-400">We will use it as supporting material.</span><input className="hidden" type="file" accept=".pdf,.docx,.doc,.txt,.md" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} /></label><Field label="Optional: paste source material"><textarea className="field min-h-[116px]" value={source} onChange={e => setSource(e.target.value)} placeholder="Paste notes, a source excerpt, or a syllabus…" /></Field></div>
      {syllabus?.detected && <p className="mt-3 rounded-xl bg-forest-500/10 p-3 text-sm text-verified">Source material understood: {syllabus.subject || "ready to use"}.</p>}
      <button className="btn-gold mt-7 w-full min-h-[56px] text-base" disabled={busy} onClick={create}>{busy ? "Preparing your book…" : <><Sparkles className="h-5 w-5" /> ✨ Create Complete 3D Ebook</>}</button></section>
    <section className="mt-6 rounded-3xl border border-paper-300 bg-paper-50 p-5 md:p-7"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-ink-700 text-sm text-paper-100">2</span><div><h2 className="font-display text-xl">AI creates the complete book</h2><p className="text-sm text-ink-400">No research questions or manual outlines required.</p></div></div><div className="mt-5 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{steps.map((step, i) => <div key={step} className="rounded-xl bg-paper-100 p-3"><span className="text-gold-500">{String(i + 1).padStart(2, "0")}</span><br />{step}</div>)}</div></section>
    <details className="paper-card mt-6 rounded-2xl p-5" open={advanced} onToggle={e => setAdvanced((e.target as HTMLDetailsElement).open)}><summary className="flex cursor-pointer list-none items-center justify-between font-semibold">Advanced Settings <ChevronDown className={`h-4 w-4 transition ${advanced ? "rotate-180" : ""}`} /></summary><p className="mt-2 text-sm text-ink-400">Optional controls for experienced authors. Simple Mode keeps these out of your way.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Research depth"><select className="field" value={settings.length} onChange={e => set("length", e.target.value as any)}><option value="short">Focused</option><option value="medium">Balanced</option><option value="long">Deep</option><option value="comprehensive">Exhaustive</option></select></Field><Field label="Writing style"><select className="field" value={settings.style} onChange={e => set("style", e.target.value)}><option>Clear academic</option><option>Conversational teacher</option><option>Story-driven narrative</option><option>Technical reference</option></select></Field><Field label="Academic difficulty"><select className="field" value={settings.difficulty} onChange={e => set("difficulty", e.target.value as any)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></Field><Field label="Source types"><select className="field"><option>Reliable sources (recommended)</option><option>Primary sources first</option><option>Academic and official sources</option></select></Field></div><div className="mt-4 flex flex-wrap gap-4 text-sm"><Toggle label="Image suggestions" checked={settings.includeImages} onChange={v => set("includeImages", v)} /><Toggle label="Glossary" checked={settings.includeGlossary} onChange={v => set("includeGlossary", v)} /><Toggle label="Strict fact-checking" checked={settings.includeReferences} onChange={v => set("includeReferences", v)} /></div></details>
    <section className="mt-6 rounded-2xl bg-ink-700 p-5 text-paper-100"><div className="flex gap-3"><BookOpen className="h-5 w-5 shrink-0 text-gold-500" /><p className="text-sm">Every book is built with citations and references, clear evidence versus interpretation, and careful handling of uncertainty. Folio does not invent sources or quotations.</p></div></section>
  </main><Footer /></>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm"><span className="mb-1.5 block text-ink-400">{label}</span>{children}</label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) { return <label className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /> {label}</label>; }
export default function NewEbookPage() { return <Suspense fallback={<div className="p-10">Loading…</div>}><NewInner /></Suspense>; }
