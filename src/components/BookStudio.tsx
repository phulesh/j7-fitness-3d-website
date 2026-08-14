"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SettingsForm } from "./SettingsForm";
import { ProgressPanel } from "./ProgressPanel";
import { OutlineEditor } from "./OutlineEditor";
import { ReadingView } from "./ReadingView";
import { AutosaveIndicator } from "./AutosaveIndicator";
import { ErrorBanner } from "./ErrorBanner";
import { ValidationPanel } from "./ValidationPanel";
import { api } from "@/lib/client";
import { useEbook } from "@/hooks/useEbook";
import { displayStatus, type EbookDocument, type EbookSettings, type FactFlag, type OutlineItem } from "@/lib/types";
import { buildBookPages } from "@/lib/book/pages";
import { groupReferences, sourceCitation } from "@/lib/references";
import dynamic from "next/dynamic";

const Book3D = dynamic(() => import("./Book3D").then((m) => m.Book3D), {
  ssr: false,
  loading: () => <p className="p-6 text-ink-400">Opening the 3D press…</p>,
});

export type StudioTab =
  | "cover"
  | "settings"
  | "contents"
  | "research"
  | "sources"
  | "outline"
  | "chapters"
  | "references"
  | "glossary"
  | "preview"
  | "3d";

const TABS: { id: StudioTab; label: string }[] = [
  { id: "cover", label: "Cover" },
  { id: "settings", label: "Settings" },
  { id: "contents", label: "Contents" },
  { id: "research", label: "Research" },
  { id: "sources", label: "Sources" },
  { id: "outline", label: "Outline" },
  { id: "chapters", label: "Chapters" },
  { id: "references", label: "References" },
  { id: "glossary", label: "Glossary" },
  { id: "preview", label: "Preview" },
  { id: "3d", label: "3D Book" },
];

export function BookStudio({ ebookId, tab }: { ebookId: string; tab: StudioTab }) {
  const router = useRouter();
  const { doc, setDoc, error, setError, saveState, busy, setBusy, load, patch, autosaveSettings, loading, loadState } =
    useEbook(ebookId);
  const [sourceFilter, setSourceFilter] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [chIndex, setChIndex] = useState(0);
  const [flags, setFlags] = useState<FactFlag[]>([]);
  const [flagSummary, setFlagSummary] = useState<any>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [rqText, setRqText] = useState("");
  // Debounced autosave for the outline (requirement #8). We track the last
  // saved outline by content so that server round-trips (which replace the doc
  // object) do not trigger a save loop, and we never re-save the freshly loaded
  // outline.
  const outlineSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedOutline = useRef<string>("");

  useEffect(() => {
    if (doc) setRqText((doc.researchQuestions || doc.analysis?.researchQuestions || []).join("\n"));
    // Re-seed the textarea only when the underlying research questions change,
    // not on every doc refresh (which would clobber in-progress typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.ebookId, doc?.researchQuestions, doc?.analysis?.researchQuestions]);

  // Debounced outline autosave: add / reorder / rename / edit-description all
  // persist to the same ebookId without a manual save click.
  useEffect(() => {
    if (!doc) return;
    const json = JSON.stringify(doc.outline);
    if (json === lastSavedOutline.current) return;
    // Skip the initial hydration so we never overwrite stored data.
    if (!lastSavedOutline.current) {
      lastSavedOutline.current = json;
      return;
    }
    if (outlineSaveTimer.current) clearTimeout(outlineSaveTimer.current);
    outlineSaveTimer.current = setTimeout(() => {
      patch({ outline: doc.outline }, { silent: true })
        .then((updated) => {
          lastSavedOutline.current = JSON.stringify(updated?.outline ?? doc.outline);
        })
        .catch(() => {});
    }, 900);
    return () => {
      if (outlineSaveTimer.current) clearTimeout(outlineSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.outline]);

  function go(next: StudioTab) {
    const map: Record<StudioTab, string> = {
      cover: `/ebooks/${ebookId}/edit?tab=cover`,
      settings: `/ebooks/${ebookId}/edit?tab=settings`,
      contents: `/ebooks/${ebookId}/edit?tab=contents`,
      research: `/ebooks/${ebookId}/research`,
      sources: `/ebooks/${ebookId}/edit?tab=sources`,
      outline: `/ebooks/${ebookId}/outline`,
      chapters: `/ebooks/${ebookId}/edit?tab=chapters`,
      references: `/ebooks/${ebookId}/edit?tab=references`,
      glossary: `/ebooks/${ebookId}/edit?tab=glossary`,
      preview: `/ebooks/${ebookId}/read`,
      "3d": `/ebooks/${ebookId}/3d`,
    };
    router.push(map[next]);
  }

  async function download(format: string) {
    setBusy(`download-${format}`);
    setError("");
    try {
      const res = await fetch(`/api/ebooks/${ebookId}/export?format=${format}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = format === "3d" ? "-3D-BOOK.zip" : format === "html" ? "-3D-Book.html" : `.${format}`;
      a.download = `${(doc?.title || "ebook").replace(/\s+/g, "-")}${suffix}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function startResearch() {
    setBusy("research");
    setError("");
    try {
      await patch({
        settings: doc?.settings,
        researchQuestions: rqText
          .split(/\n/)
          .map((s) => s.trim())
          .filter(Boolean),
        syllabus: doc?.syllabus,
      });
      await api(`/api/ebooks/${ebookId}/research`, { method: "POST", body: "{}" });
      router.push(`/ebooks/${ebookId}/research`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function writeFromOutline() {
    if (!doc) return;
    if (doc.researchQuality?.generationBlocked) return;
    setBusy("write");
    setError("");
    try {
      await patch({ outline: doc.outline });
      await api(`/api/ebooks/${ebookId}/generate`, { method: "POST", body: JSON.stringify({ fromOutline: true }) });
      router.push(`/ebooks/${ebookId}/edit?tab=chapters`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function runFactCheck() {
    setBusy("fact");
    setError("");
    try {
      const data = await api(`/api/ebooks/${ebookId}/factcheck`, { method: "POST", body: "{}" });
      setDoc(data.ebook);
      setFlags(data.flags || []);
      setFlagSummary(data.summary);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function applyFixes() {
    const apply = flags.filter((f) => f.suggestedFix).map((f) => f.id);
    if (!apply.length) return;
    setBusy("apply");
    try {
      const data = await api(`/api/ebooks/${ebookId}/factcheck`, {
        method: "POST",
        body: JSON.stringify({ apply, flags }),
      });
      setDoc(data.ebook);
      setFlags((fs) => fs.map((f) => (apply.includes(f.id) ? { ...f, applied: true } : f)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function addSource() {
    if (!sourceUrl.trim()) return;
    setBusy("source");
    try {
      const data = await api(`/api/ebooks/${ebookId}/sources`, { method: "POST", body: JSON.stringify({ url: sourceUrl }) });
      setDoc(data.ebook);
      setSourceUrl("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function chapterAction(action: string, extra?: Record<string, unknown>) {
    setBusy(action);
    setError("");
    try {
      await api(`/api/ebooks/${ebookId}/chapter/${chIndex}`, {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const generating =
    (doc && !["complete", "failed", "draft", "awaiting_outline", "paused"].includes(doc.status)) ||
    doc?.researchRun?.status === "running";
  const researchState = doc?.researchRun?.status || (generating && doc?.status === "researching" ? "running" : doc?.sources.length ? "success" : "idle");
  const pages = useMemo(() => (doc ? buildBookPages(doc) : []), [doc]);
  const chapter = doc?.chapters?.[chIndex];
  const writingBlocked = Boolean(doc?.researchQuality?.generationBlocked);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="stamp text-gold-500">ebookId · {ebookId}</p>
          <h1 className="font-display mt-3 text-3xl">
            {doc?.title || (loadState === "error" ? "Could not open ebook" : loading ? "Loading ebook…" : "Ebook")}
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            {doc ? `${doc.outputLanguage || doc.language} · ${doc.type} · ${displayStatus(doc.status)} · ${doc.wordCount.toLocaleString()} words` : ""}
          </p>
          {doc && <LanguageCheckBadge doc={doc} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutosaveIndicator state={saveState} />
          <Link href="/ebooks" className="btn-ghost !py-2">
            Back to library
          </Link>
          <button className="btn-ghost !py-2" disabled={!!busy || !doc?.chapters?.length} onClick={runFactCheck}>
            {busy === "fact" ? "Checking…" : "Fact Check"}
          </button>
          {doc?.status === "complete" && <>
            <button className="btn-gold !py-2" disabled={!!busy} onClick={() => download("3d")}>
              ⬇ Download 3D Book
            </button>
            <button className="btn-ghost !py-2" disabled={!!busy} onClick={() => download("pdf")}>
              ⬇ PDF
            </button>
            <button className="btn-ghost !py-2" disabled={!!busy} onClick={() => download("epub")}>
              ⬇ EPUB
            </button>
            <button className="btn-ghost !py-2" disabled={!!busy} onClick={() => download("docx")}>
              ⬇ DOCX
            </button>
          </>}
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} onRetry={() => load().catch(() => {})} />

      {generating && (
        <ProgressPanel
          message={doc?.progress?.message || "Working…"}
          detail={doc?.progress?.detail}
          percent={doc?.progress?.percent || 10}
          step={doc?.progress?.step}
          language={doc?.outputLanguage || doc?.language}
        />
      )}

      {doc?.status === "failed" && (
        <div className="mt-4 rounded-xl border border-unsupported/30 p-4 text-sm">
          {doc.error || "Generation interrupted. Your ebook data has been saved."}
          <button
            className="btn-gold ml-3 !py-1.5"
            onClick={async () => {
              await api(`/api/ebooks/${ebookId}/generate`, { method: "POST", body: JSON.stringify({ resume: true }) });
              load();
            }}
          >
            Resume Generation
          </button>
        </div>
      )}

      <div className="mt-6 flex gap-2 overflow-auto pb-2">
        {(tab === "3d" ? TABS.filter((t) => t.id === "3d") : TABS).map((t) => (
          <button
            key={t.id}
            onClick={() => go(t.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm min-h-[40px] ${
              tab === t.id ? "bg-ink-700 text-paper-100" : "bg-paper-100 border border-paper-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!doc && loadState === "loading" && (
        <div className="mt-8 space-y-3">
          <p className="text-ink-400">Loading ebook {ebookId}…</p>
          <p className="text-xs text-ink-300">If this takes more than a few seconds, the request may have failed.</p>
        </div>
      )}
      {!doc && loadState === "error" && (
        <div className="mt-8 paper-card rounded-2xl p-6">
          <p className="text-unsupported">{error || "That ebook could not be loaded."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-gold" onClick={() => load().catch(() => {})}>
              Retry
            </button>
            <Link href="/ebooks" className="btn-ghost">
              Back to Library
            </Link>
          </div>
        </div>
      )}

      {doc && tab === "cover" && (
        <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr]">
          <div
            className="book-shadow mx-auto aspect-[2/3] w-full max-w-[280px] overflow-hidden rounded-sm bg-ink-700"
            dangerouslySetInnerHTML={{
              __html: (doc.cover?.svg || "").replace(/width="800" height="1200"/, 'viewBox="0 0 800 1200" width="100%" height="100%"'),
            }}
          />
          <div className="space-y-4">
            <p className="text-sm text-ink-400">
              Cover uses the saved title, subtitle, author, and book type. Hindi titles render with Devanagari.
            </p>
            <label className="block text-sm">
              <span className="mb-1.5 block text-ink-400">Cover style</span>
              <select
                className="field"
                value={doc.settings.coverStyle}
                onChange={(e) => autosaveSettings({ ...doc.settings, coverStyle: e.target.value as any })}
              >
                {["Minimal", "Academic", "Modern", "Professional", "Creative", "Technical", "Textbook", "Historical", "Documentary", "Illustrated", "Photorealistic", "3D"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  )
                )}
              </select>
            </label>
            <button
              className="btn-line"
              disabled={coverBusy}
              onClick={async () => {
                setCoverBusy(true);
                setError("");
                try {
                  const data = await api(`/api/ebooks/${ebookId}/cover`, {
                    method: "POST",
                    body: JSON.stringify({ style: doc.settings.coverStyle }),
                  });
                  if (data.ebook) setDoc(data.ebook);
                } catch (e: any) {
                  setError(e.message || "कवर तैयार नहीं हो सका। पुनः प्रयास करें।");
                } finally {
                  setCoverBusy(false);
                }
              }}
            >
              {coverBusy ? "कवर तैयार किया जा रहा है…" : "Regenerate Cover"}
            </button>
          </div>
        </div>
      )}

      {doc && tab === "settings" && (
        <section className="mt-6 paper-card rounded-2xl p-5 md:p-7">
          <h2 className="font-display text-xl">Complete settings</h2>
          <p className="mt-1 text-sm text-ink-400">Every saved field is restored. Changes autosave to this ebookId.</p>
          <div className="mt-5">
            <SettingsForm value={doc.settings} onChange={(s: EbookSettings) => autosaveSettings(s)} />
          </div>
          <label className="mt-6 block text-sm">
            <span className="mb-1.5 block text-ink-400">Research questions</span>
            <textarea
              className="field min-h-[100px]"
              value={rqText}
              onChange={(e) => setRqText(e.target.value)}
              onBlur={() =>
                patch({
                  researchQuestions: rqText
                    .split(/\n/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          {doc.syllabus?.detected && (
            <div className="mt-4 rounded-xl bg-forest-500/10 p-4 text-sm">
              <p className="font-semibold">Syllabus saved</p>
              <p>Subject: {doc.syllabus.subject || "—"}</p>
              <p>
                {doc.syllabus.units?.length || 0} unit(s)
              </p>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn-gold min-h-[48px]" disabled={!!busy} onClick={startResearch}>
              {busy === "research" ? "Starting…" : "Run research"}
            </button>
            <button className="btn-ghost min-h-[48px]" onClick={() => go("outline")}>
              Open outline
            </button>
          </div>
        </section>
      )}

      {doc && tab === "contents" && (
        <ol className="mt-6 space-y-2">
          {doc.outline.map((o, i) => (
            <li key={o.id}>
              <button
                className="paper-card w-full rounded-xl p-4 text-left"
                onClick={() => {
                  setChIndex(i);
                  go("chapters");
                }}
              >
                <span className="text-gold-500">{String(i + 1).padStart(2, "0")}</span>{" "}
                <span className="font-display text-lg">{o.title}</span>
                <p className="mt-1 text-sm text-ink-400">{o.summary}</p>
              </button>
            </li>
          ))}
          {!doc.outline.length && <p className="text-ink-400">No outline yet. Run research first.</p>}
        </ol>
      )}

      {doc && tab === "research" && (
        <section className="mt-6 space-y-5">
          <div className="paper-card rounded-2xl p-5">
            <h2 className="font-display text-xl">Research</h2>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-gold-500">
              ebookId · {ebookId} · {researchState}
            </p>
            <p className="mt-3 text-sm">
              {doc.researchRun?.message ||
                (researchState === "idle"
                  ? "शोध अभी शुरू नहीं हुआ।"
                  : researchState === "running"
                    ? "शोध शुरू हो रहा है…"
                    : researchState === "success"
                      ? "शोध पूरा हुआ।"
                      : researchState === "cancelled"
                        ? "शोध रद्द किया गया।"
                        : doc.error || "शोध पूरा नहीं हो सका। पुनः प्रयास करें।")}
            </p>
            {doc.researchRun?.currentChapterTitle && researchState === "running" && (
              <p className="mt-2 text-sm text-ink-400">
                अध्याय {(doc.researchRun.currentChapter || 0) + 1}: {doc.researchRun.currentChapterTitle}
              </p>
            )}
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-300">
              <div
                className="h-full bg-ink-700 transition-all"
                style={{ width: `${Math.min(100, doc.researchRun?.percent || doc.progress?.percent || 0)}%` }}
              />
            </div>
            <p className="mt-2 text-sm">
              {doc.researchRun?.percent || doc.progress?.percent || 0}% · {doc.researchRun?.sourcesFound ?? doc.sources.length} स्रोत
            </p>
            <p className="mt-2 text-sm">
              {doc.researchQuality?.relevantCount ?? doc.sources.length} approved · {doc.researchQuality?.rejectedCount ?? (doc.rejectedSources || []).length} rejected
            </p>
            {writingBlocked && (
              <p className="mt-3 text-sm text-unsupported">
                {doc.researchQuality?.contaminationReason || "Not enough reliable sources were found."}
              </p>
            )}
            {(researchState === "error" || doc.status === "failed") && (
              <p className="mt-3 text-sm text-unsupported">{doc.researchRun?.error || doc.error || "शोध पूरा नहीं हो सका। पुनः प्रयास करें।"}</p>
            )}
            {researchState === "success" && !writingBlocked && (
              <p className="mt-3 text-sm text-verified">शोध पूरा हुआ। स्रोत और रूपरेखा इसी ebookId पर सुरक्षित हैं।</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-gold" disabled={!!busy || researchState === "running"} onClick={startResearch}>
                {busy === "research" ? "शोध शुरू हो रहा है…" : researchState === "running" ? "शोध चल रहा है…" : researchState === "idle" ? "Run Research" : "Regenerate Research"}
              </button>
              {researchState === "running" && (
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    setBusy("cancel");
                    try {
                      await api(`/api/ebooks/${ebookId}/research`, { method: "POST", body: JSON.stringify({ action: "cancel" }) });
                      await load();
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  Cancel
                </button>
              )}
              {(researchState === "error" || researchState === "cancelled") && (
                <button className="btn-ghost" disabled={!!busy} onClick={startResearch}>
                  Retry
                </button>
              )}
              <button className="btn-ghost" onClick={() => go("outline")}>
                Review outline
              </button>
              <button className="btn-ghost" onClick={() => go("sources")}>
                Open sources
              </button>
            </div>
          </div>
          <div className="paper-card rounded-2xl p-5">
            <h3 className="font-display text-lg">Research questions</h3>
            <ul className="mt-3 list-disc pl-5 text-sm">
              {(doc.researchQuestions || doc.analysis?.researchQuestions || []).map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
          {(doc.chapterResearch || []).length > 0 && (
            <div className="paper-card rounded-2xl p-5">
              <h3 className="font-display text-lg">Chapter research</h3>
              <ol className="mt-3 space-y-3 text-sm">
                {doc.chapterResearch!.map((ch) => (
                  <li key={ch.chapterId} className="border-b border-paper-300 pb-3">
                    <p className="font-semibold">
                      अध्याय {ch.chapterIndex + 1}. {ch.title}
                    </p>
                    <p className="text-ink-400">{ch.sourcesFound} स्रोत · {ch.status}</p>
                    {ch.researchQuestion && <p className="mt-1">{ch.researchQuestion}</p>}
                    {ch.notes && <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-ink-400">{ch.notes}</pre>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {doc && tab === "sources" && (
        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="paper-card rounded-2xl p-5">
            <h3 className="font-display text-lg">Approved sources</h3>
            <input
              className="field mt-3"
              placeholder="Search / filter sources"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn-ghost !py-1.5"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("refresh-sources");
                  try {
                    await api(`/api/ebooks/${ebookId}/sources`, { method: "POST", body: JSON.stringify({ action: "refresh" }) });
                    await load();
                  } catch (e: any) {
                    setError(e.message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                Refresh Sources
              </button>
              <button
                className="btn-ghost !py-1.5"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("regen-sources");
                  setError("");
                  try {
                    await api(`/api/ebooks/${ebookId}/sources`, { method: "POST", body: JSON.stringify({ action: "regenerate" }) });
                    router.push(`/ebooks/${ebookId}/research`);
                  } catch (e: any) {
                    setError(e.message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {busy === "regen-sources" ? "Starting…" : "Regenerate Sources"}
              </button>
            </div>
            <ol className="mt-3 max-h-[28rem] space-y-2 overflow-auto text-sm">
              {doc.sources
                .filter((s) =>
                  `${s.title} ${s.author || ""} ${s.organization} ${s.url}`.toLowerCase().includes(sourceFilter.toLowerCase())
                )
                .map((s) => (
                <li key={s.id} className="border-b border-paper-300 pb-2">
                  <span className="text-gold-500">[{s.id}]</span>{" "}
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                    {s.title}
                  </a>
                  <p className="text-ink-400">
                    {s.author || s.organization}
                    {s.year ? ` · ${s.year}` : ""}
                    {s.publication || s.publisher ? ` · ${s.publication || s.publisher}` : ""}
                    {s.sourceType ? ` · ${s.sourceType}` : ""}
                  </p>
                  {s.citation && <p className="text-xs">{s.citation}</p>}
                  <p className={`text-xs ${s.verificationStatus === "verified" ? "text-verified" : "text-review"}`}>
                    {s.verificationStatus === "verified" ? "सत्यापित" : "सत्यापन आवश्यक"}
                  </p>
                  {s.reliabilityNote && <p className="text-xs text-ink-300">{s.reliabilityNote}</p>}
                  {s.notes && s.notes !== s.reliabilityNote && <p className="text-xs text-ink-300">{s.notes}</p>}
                  {s.claimSupported && <p className="text-xs">Claim: {s.claimSupported}</p>}
                  <div className="mt-1 flex gap-2">
                    <a className="underline text-xs" href={s.url} target="_blank" rel="noreferrer">
                      Open Source
                    </a>
                    <button
                      className="text-xs text-unsupported underline"
                      type="button"
                      onClick={async () => {
                        setBusy(`rm-${s.id}`);
                        try {
                          await api(`/api/ebooks/${ebookId}/sources?sourceId=${s.id}`, { method: "DELETE" });
                          await load();
                        } catch (e: any) {
                          setError(e.message);
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      Remove Source
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input className="field" placeholder="Add a source URL" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
              <button className="btn-gold" disabled={!!busy} onClick={addSource}>
                Add
              </button>
            </div>
          </div>
          <div className="paper-card rounded-2xl p-5">
            <h3 className="font-display text-lg">Rejected sources</h3>
            <ol className="mt-3 max-h-[28rem] space-y-2 overflow-auto text-sm">
              {(doc.rejectedSources || []).map((s, i) => (
                <li key={`${s.url}-${i}`} className="border-b border-paper-300 pb-2">
                  <span>{s.title}</span>
                  <p className="text-unsupported">{s.rejectionReason}</p>
                </li>
              ))}
              {!(doc.rejectedSources || []).length && <p className="text-ink-400">None rejected yet.</p>}
            </ol>
          </div>
        </section>
      )}

      {doc && tab === "outline" && (
        <section className="mt-6 paper-card rounded-2xl p-5">
          <h2 className="font-display text-xl">Chapter outline</h2>
          <p className="text-sm text-ink-400">Edit, reorder, add, or delete before writing. Saving updates this ebookId only.</p>
          <div className="mt-4">
            <OutlineEditor
              value={doc.outline}
              onChange={(outline: OutlineItem[]) => {
                setDoc({ ...doc, outline });
              }}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => patch({ outline: doc.outline })}>
              Save outline
            </button>
            <button
              className="btn-ghost"
              disabled={!!busy}
              onClick={async () => {
                setBusy("regen-outline");
                setError("");
                try {
                  const data = await api(`/api/ebooks/${ebookId}/research`, {
                    method: "POST",
                    body: JSON.stringify({ action: "regenerate-outline" }),
                  });
                  if (data.ebook) setDoc(data.ebook);
                  else if (data.outline) setDoc({ ...doc, outline: data.outline });
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === "regen-outline" ? "Updating…" : "Regenerate Outline"}
            </button>
            <button className="btn-gold min-h-[48px]" disabled={!!busy || writingBlocked} onClick={writeFromOutline}>
              {writingBlocked ? "Writing blocked" : busy === "write" ? "Starting…" : "Approve outline & write"}
            </button>
          </div>
        </section>
      )}

      {doc && tab === "chapters" && chapter && (
        <article className="mt-6 grid gap-6 lg:grid-cols-[1fr_220px]">
          <div className="paper-card rounded-2xl p-5 md:p-8">
            <p className="text-xs uppercase tracking-[0.18em] text-gold-500">Chapter {chapter.index + 1}</p>
            <input
              className="field mt-2 font-display text-2xl"
              value={chapter.title}
              onChange={(e) => {
                const chapters = doc.chapters.map((c, i) => (i === chIndex ? { ...c, title: e.target.value } : c));
                setDoc({ ...doc, chapters });
              }}
              onBlur={() => patch({ chapters: doc.chapters })}
            />
            {chapter.sections.map((s) => (
              <section key={s.id} className="prose-ebook mt-6">
                <input
                  className="field mb-2"
                  value={s.heading}
                  onChange={(e) => {
                    const chapters = doc.chapters.map((c, i) =>
                      i === chIndex ? { ...c, sections: c.sections.map((x) => (x.id === s.id ? { ...x, heading: e.target.value } : x)) } : c
                    );
                    setDoc({ ...doc, chapters });
                  }}
                  onBlur={() => patch({ chapters: doc.chapters })}
                />
                <div dangerouslySetInnerHTML={{ __html: s.html }} />
              </section>
            ))}
          </div>
          <aside className="space-y-2">
            {["regenerate", "improve", "simplify", "detail"].map((action) => (
              <button key={action} disabled={!!busy} className="btn-ghost w-full !justify-start capitalize" onClick={() => chapterAction(action)}>
                {busy === action ? "Working…" : action}
              </button>
            ))}
            <p className="pt-3 text-xs uppercase tracking-[0.14em] text-gold-500">+ चित्र जोड़ें</p>
            {[
              ["verified", "सत्यापित स्रोत से चित्र"],
              ["illustration", "व्याख्यात्मक चित्रण बनाएं"],
              ["map", "मानचित्र"],
              ["timeline", "टाइमलाइन"],
              ["infographic", "इन्फोग्राफिक"],
              ["comparison", "तुलना चित्र"],
            ].map(([kind, label]) => (
              <button
                key={kind}
                disabled={!!busy}
                className="btn-ghost w-full !justify-start"
                onClick={() => chapterAction("add-image", { imageKind: kind })}
              >
                {busy === "add-image" ? "Adding…" : label}
              </button>
            ))}
            {(chapter.images || []).map((img) => (
              <div key={img.id || img.url} className="rounded-lg border border-paper-300 p-2 text-xs">
                <p className="font-semibold">{img.figureLabel || img.caption}</p>
                <input
                  className="field !py-1 mt-1"
                  value={img.caption}
                  onChange={(e) => {
                    const chapters = doc.chapters.map((c, i) =>
                      i === chIndex
                        ? { ...c, images: c.images.map((x) => (x.url === img.url ? { ...x, caption: e.target.value } : x)) }
                        : c
                    );
                    setDoc({ ...doc, chapters });
                  }}
                  onBlur={() =>
                    chapterAction("update-image", { imageId: img.id, url: img.url, caption: img.caption, credit: img.credit, alt: img.alt })
                  }
                />
                <button className="mt-1 underline text-unsupported" onClick={() => chapterAction("remove-image", { imageId: img.id, url: img.url })}>
                  चित्र हटाएँ
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <button className="btn-ghost flex-1" disabled={chIndex === 0} onClick={() => setChIndex((i) => i - 1)}>
                Prev
              </button>
              <button className="btn-ghost flex-1" disabled={chIndex >= doc.chapters.length - 1} onClick={() => setChIndex((i) => i + 1)}>
                Next
              </button>
            </div>
          </aside>
        </article>
      )}

      {doc && tab === "chapters" && !chapter && <p className="mt-6 text-ink-400">No chapters yet. Approve the outline to write.</p>}

      {doc && tab === "references" && (
        <section className="mt-6 paper-card rounded-2xl p-5">
          <h2 className="font-display text-xl">References</h2>
          <div className="mt-4 space-y-6 text-sm">
            {groupReferences(doc.sources).map((group) => (
              <section key={group.key}>
                <h3 className="font-display text-lg">{doc.outputLanguage === "hi" ? `${group.titleHi} · ${group.title}` : group.title}</h3>
                <ol className="mt-2 space-y-3">
                  {group.sources.map((s) => (
                    <li key={s.id}>
                      [{s.id}] {sourceCitation(s)}
                      {/^https?:\/\//.test(s.url) && <> — <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.url}</a></>}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </section>
      )}

      {doc && tab === "glossary" && (
        <section className="mt-6 paper-card rounded-2xl p-5">
          <h2 className="font-display text-xl">Glossary</h2>
          <dl className="mt-4 space-y-3">
            {doc.glossary.map((g) => (
              <div key={g.term}>
                <dt className="font-semibold">{g.term}</dt>
                <dd className="text-sm text-ink-400">{g.definition}</dd>
                {g.context && <dd className="mt-1 text-xs text-ink-300">Context: {g.context}</dd>}
              </div>
            ))}
            {!doc.glossary.length && <p className="text-ink-400">Glossary appears after writing.</p>}
          </dl>
        </section>
      )}

      {doc && tab === "preview" && <div className="mt-6">{doc.chapters.length ? <ReadingView doc={doc} /> : <p>Write chapters to preview.</p>}</div>}

      {doc && tab === "3d" && (
        <div className="mt-6">
          {doc.status === "complete" && (
            <section className="mb-5 rounded-2xl border border-verified/30 bg-verified/10 p-5">
              <p className="font-display text-2xl text-verified">✅ Ebook Ready</p>
              <p className="mt-1 text-sm text-ink-400">{doc.title} · {doc.settings.authorName || "Folio Research"} · {pages.length} pages · {doc.chapterCount} chapters · {doc.sources.length} sources · Created {new Date(doc.createdAt).toLocaleDateString()}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link className="btn-gold" href={`/ebooks/${ebookId}/3d`}>📖 Read 3D Book</Link>
                <button className="btn-ghost" disabled={!!busy} onClick={() => download("3d")}>⬇ Download 3D Ebook</button>
                <button className="btn-ghost" disabled={!!busy} onClick={() => download("pdf")}>⬇ Download PDF</button>
                <button className="btn-ghost" disabled={!!busy} onClick={() => download("html")}>🌐 Interactive HTML</button>
                <button className="btn-ghost" disabled={!!busy} onClick={() => download("epub")}>📱 EPUB</button>
                <button className="btn-ghost" disabled={!!busy} onClick={() => download("docx")}>📝 DOCX</button>
              </div>
            </section>
          )}
          {doc.status === "complete" && pages.length > 0 ? (
            <Book3D ebookId={ebookId} doc={doc} pages={pages} coverSvg={doc.cover?.svg} />
          ) : doc.status === "failed" ? (
            <div className="paper-card rounded-2xl p-6 text-sm text-ink-400">Completed chapters and research are safe. Use <strong>Resume Generation</strong> above to continue from the last successful stage.</div>
          ) : (
            <div className="paper-card rounded-2xl p-6 text-center text-sm text-ink-400">Your interactive book will open here automatically after the final quality check.</div>
          )}
          <ValidationPanel doc={doc} ebookId={ebookId} onFixed={() => load().catch(() => {})} />
          {doc.qualityReport && (
            <details className="paper-card mt-5 rounded-2xl p-5">
              <summary className="cursor-pointer font-semibold">✓ Final quality report · {doc.qualityReport.items.filter((item) => item.passed).length}/{doc.qualityReport.items.length} checks passed</summary>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {doc.qualityReport.items.map((item) => <li key={item.key} className={item.passed ? "text-verified" : "text-unsupported"}>{item.passed ? "✓" : "×"} {item.label}{item.repaired ? " · repaired automatically" : ""}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {flagSummary && (
        <section className="mt-6 paper-card rounded-2xl p-5">
          <h2 className="font-display text-xl">Fact check</h2>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-verified/10 px-3 py-1 text-verified">Supported {flagSummary.verified || 0}</span>
            <span className="rounded-full bg-review/10 px-3 py-1 text-review">Partial {flagSummary.needs_review || 0}</span>
            <span className="rounded-full bg-review/10 px-3 py-1 text-review">Contested {flagSummary.contested || 0}</span>
            <span className="rounded-full bg-unsupported/10 px-3 py-1 text-unsupported">Unsupported {flagSummary.unsupported || 0}</span>
          </div>
          <ul className="mt-4 max-h-64 space-y-3 overflow-auto text-sm">
            {flags.map((f) => (
              <li key={f.id} className="border-b border-paper-300 pb-2">
                <strong>{f.displayStatus || f.status}</strong>
                {f.classification ? ` · ${f.classification}` : ""}
                <p className="mt-1">{f.claim}</p>
                <p className="text-ink-400">{f.explanation}</p>
              </li>
            ))}
          </ul>
          {flags.some((f) => f.suggestedFix) && (
            <button className="btn-line mt-4" disabled={!!busy} onClick={applyFixes}>
              Apply suggested corrections
            </button>
          )}
        </section>
      )}
    </div>
  );
}

// Surfaces the output-language validation result (requirement #3). For a Hindi
// book this reads "Hindi validation: PASSED" only when every section genuinely
// satisfies the Devanagari requirement; otherwise it reports the sections that
// were rewritten or still need attention. A non-Hindi book shows nothing, and a
// book that has not been generated yet shows nothing.
function LanguageCheckBadge({ doc }: { doc: EbookDocument }) {
  const lang = doc.outputLanguage || doc.language;
  if (!lang || lang === "auto") return null;
  const check = doc.languageCheck;
  if (!check) return null;
  const langLabel = lang === "hi" ? "Hindi" : lang;
  const passed = check.passed;
  return (
    <p className="mt-2 text-xs">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
          passed ? "bg-verified/10 text-verified" : "bg-review/10 text-review"
        }`}
      >
        {langLabel} validation: {passed ? "PASSED" : "REVIEW"}
      </span>
      {!passed && check.detail ? <span className="ml-2 text-ink-400">{check.detail}</span> : null}
    </p>
  );
}
