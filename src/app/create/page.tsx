"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SettingsForm } from "@/components/SettingsForm";
import { DEFAULT_SETTINGS, type EbookSettings, type OutlineItem, type SyllabusInfo } from "@/lib/types";
import { api, ensureSession } from "@/lib/client";
import { ProgressPanel } from "@/components/ProgressPanel";
import { Upload, ArrowRight } from "lucide-react";

function CreateInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [settings, setSettings] = useState<EbookSettings>({
    ...DEFAULT_SETTINGS,
    topic: params.get("topic") || "",
  });
  const [syllabusText, setSyllabusText] = useState("");
  const [syllabus, setSyllabus] = useState<SyllabusInfo | null>(null);
  const [ebookId, setEbookId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "research" | "outline" | "writing">("form");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);

  useEffect(() => {
    ensureSession().catch(() => {});
  }, []);

  useEffect(() => {
    if (!ebookId || (phase !== "research" && phase !== "writing")) return;
    let stop = false;
    const tick = async () => {
      try {
        const data = await api(`/api/ebooks/${ebookId}/status`);
        if (stop) return;
        setStatus(data);
        if (data.status === "awaiting_outline") {
          setOutline(data.outline || []);
          setPhase("outline");
        } else if (data.status === "complete") {
          router.push(`/ebook/${ebookId}`);
        } else if (data.status === "failed") {
          setError(data.error || "Generation interrupted. Resume generation.");
        }
      } catch (e: any) {
        if (!stop) setError(e.message);
      }
    };
    tick();
    const id = setInterval(tick, 1200);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [ebookId, phase, router]);

  async function onUpload(file: File) {
    setError("");
    setBusy(true);
    try {
      await ensureSession();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setSyllabus(data.syllabus);
      setSyllabusText(data.text);
      if (!settings.topic && data.syllabus?.subject) {
        setSettings((s) => ({ ...s, topic: data.syllabus.subject }));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function startResearch() {
    setError("");
    if (settings.topic.trim().length < 3) {
      setError("Please provide a more specific topic.");
      return;
    }
    setBusy(true);
    try {
      await ensureSession();
      let syl = syllabus;
      if (!syl && syllabusText.trim().length > 40) {
        const parsed = await api("/api/analyze", {
          method: "POST",
          body: JSON.stringify({ topic: settings.topic, syllabusText }),
        });
        syl = parsed.syllabus;
        setSyllabus(parsed.syllabus);
      }
      const created = await api("/api/ebooks", { method: "POST", body: JSON.stringify(settings) });
      const id = created.ebook.id as string;
      if (syl) {
        await api(`/api/ebooks/${id}`, { method: "PATCH", body: JSON.stringify({ syllabus: syl }) });
      }
      setEbookId(id);
      await api(`/api/ebooks/${id}/research`, { method: "POST", body: "{}" });
      setPhase("research");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveOutlineAndWrite() {
    if (!ebookId || writingBlocked) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/ebooks/${ebookId}`, { method: "PATCH", body: JSON.stringify({ outline }) });
      await api(`/api/ebooks/${ebookId}/generate`, { method: "POST", body: JSON.stringify({ fromOutline: true }) });
      setPhase("writing");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const sources = status?.sources || [];
  const rejectedSources = status?.rejectedSources || [];
  const researchQuality = status?.researchQuality;
  const writingBlocked = Boolean(researchQuality?.generationBlocked);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="stamp text-gold-500">Commission a volume</p>
        <h1 className="font-display mt-4 text-3xl md:text-4xl">Configure, research, then write</h1>
        <p className="mt-2 text-ink-400">Nothing is invented before sources are collected. You approve the outline.</p>

        {error && (
          <div className="mt-6 rounded-xl border border-unsupported/30 bg-unsupported/5 px-4 py-3 text-sm text-unsupported">
            {error}
            {ebookId && error.includes("interrupted") && (
              <button
                className="ml-3 underline"
                onClick={async () => {
                  setError("");
                  await api(`/api/ebooks/${ebookId}/generate`, { method: "POST", body: JSON.stringify({ resume: true }) });
                  setPhase("writing");
                }}
              >
                Resume generation
              </button>
            )}
          </div>
        )}

        {phase === "form" && (
          <div className="mt-8 space-y-8">
            <section className="paper-card rounded-2xl p-5 md:p-7">
              <h2 className="font-display text-xl">Ebook settings</h2>
              <div className="mt-5">
                <SettingsForm value={settings} onChange={setSettings} />
              </div>
            </section>

            <section className="paper-card rounded-2xl p-5 md:p-7">
              <h2 className="font-display text-xl">Syllabus mode</h2>
              <p className="mt-1 text-sm text-ink-400">
                Upload a curriculum PDF/DOCX or paste units. Folio will not invent a syllabus.
              </p>
              <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-paper-400 bg-paper-50 px-4 py-8 text-sm">
                <Upload className="mb-2 h-5 w-5 text-gold-500" />
                Upload syllabus or source document
                <input
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.md"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                />
              </label>
              <textarea
                className="field mt-4 min-h-[120px]"
                placeholder="Or paste a syllabus / unit list…"
                value={syllabusText}
                onChange={(e) => setSyllabusText(e.target.value)}
                onBlur={() => {
                  if (syllabusText.length > 40) {
                    // local parse is server-side; keep text for later
                  }
                }}
              />
              {syllabus?.detected && (
                <div className="mt-4 rounded-xl bg-forest-500/10 p-4 text-sm">
                  <p className="font-semibold">Syllabus detected</p>
                  <p>Subject: {syllabus.subject || "—"}</p>
                  <p>Class: {syllabus.classLevel || "—"}</p>
                  <p>Board / body: {syllabus.board || "—"}</p>
                  {syllabus.sourceUrl && (
                    <p>
                      Source:{" "}
                      <a className="underline" href={syllabus.sourceUrl}>
                        {syllabus.sourceTitle}
                      </a>{" "}
                      · verified {syllabus.lastVerified}
                    </p>
                  )}
                  <p className="mt-1 text-ink-400">{syllabus.units.length} unit(s), {syllabus.units.reduce((n, u) => n + u.topics.length, 0)} topic(s)</p>
                </div>
              )}
            </section>

            <button disabled={busy} onClick={startResearch} className="btn-gold w-full min-h-[52px] text-base md:w-auto">
              {busy ? "Starting…" : "Research topic & build outline"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {(phase === "research" || phase === "writing") && (
          <ProgressPanel
            message={status?.progress?.message || (phase === "writing" ? "Writing chapters..." : "Researching topic...")}
            detail={status?.progress?.detail}
            percent={status?.progress?.percent || 8}
            step={status?.progress?.step}
          />
        )}

        {phase === "outline" && (
          <section className="mt-8 space-y-5">
            <div className="paper-card rounded-2xl p-5">
              <h2 className="font-display text-xl">Research Quality</h2>
              <p className="mt-2 text-lg">
                {researchQuality?.relevantCount ?? sources.length} relevant sources / {researchQuality?.rejectedCount ?? rejectedSources.length} rejected sources
              </p>
              <p className="mt-1 text-sm text-ink-400">
                Only sources that pass semantic relevance against the topic, research questions, and chapter plan are kept. Titles alone are never enough.
              </p>
              {writingBlocked && (
                <div className="mt-4 rounded-xl border border-unsupported/30 bg-unsupported/5 px-4 py-3 text-sm text-unsupported">
                  {researchQuality?.contaminationReason ||
                    "Research still contains unrelated material or too few on-topic sources. Writing is blocked until research is clean."}
                </div>
              )}
            </div>

            <div className="paper-card rounded-2xl p-5">
              <h3 className="font-display text-lg">Approved sources</h3>
              <p className="text-sm text-ink-400">
                {sources.length} on-topic records actually used for this title. Unrelated search hits are not listed here.
              </p>
              <ol className="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
                {sources.map((s: any) => (
                  <li key={s.id} className="border-b border-paper-300 pb-2">
                    <span className="text-gold-500">[{s.id}]</span>{" "}
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                      {s.title}
                    </a>
                    <span className="text-ink-400">
                      {" "}
                      — {s.organization}
                      {typeof s.relevanceScore === "number" ? ` · relevance ${s.relevanceScore}` : ""}
                      {typeof s.authorityScore === "number" ? ` · authority ${s.authorityScore}` : ` · tier ${s.tier}`}
                      {s.primarySource ? " · primary" : ""}
                      {s.academicSource ? " · academic" : ""}
                    </span>
                    {s.reasonForInclusion && <p className="mt-1 text-xs text-ink-400">{s.reasonForInclusion}</p>}
                  </li>
                ))}
              </ol>
            </div>

            <div className="paper-card rounded-2xl p-5">
              <h3 className="font-display text-lg">Rejected sources</h3>
              <p className="text-sm text-ink-400">Automatically excluded after inspecting the snippet or page content.</p>
              {rejectedSources.length === 0 ? (
                <p className="mt-3 text-sm text-ink-400">No off-topic hits needed to be discarded.</p>
              ) : (
                <ol className="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
                  {rejectedSources.map((s: any, i: number) => (
                    <li key={`${s.url}-${i}`} className="border-b border-paper-300 pb-2">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                          {s.title}
                        </a>
                      ) : (
                        <span>{s.title}</span>
                      )}
                      <p className="text-unsupported">{s.rejectionReason}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="paper-card rounded-2xl p-5">
              <h2 className="font-display text-xl">Final chapter outline</h2>
              <p className="text-sm text-ink-400">Edit titles before writing. Structure follows the requested historical question, not a generic biography dump.</p>
              <ul className="mt-4 space-y-3">
                {outline.map((item, i) => (
                  <li key={item.id} className="rounded-xl border border-paper-300 bg-paper-50 p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 text-xs text-gold-500">{String(i + 1).padStart(2, "0")}</span>
                      <div className="flex-1">
                        <input
                          className="field !py-1.5"
                          value={item.title}
                          onChange={(e) =>
                            setOutline((o) => o.map((x) => (x.id === item.id ? { ...x, title: e.target.value } : x)))
                          }
                        />
                        <textarea
                          className="field mt-2 !py-1.5 text-sm"
                          rows={2}
                          value={item.summary}
                          onChange={(e) =>
                            setOutline((o) => o.map((x) => (x.id === item.id ? { ...x, summary: e.target.value } : x)))
                          }
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                disabled={busy || writingBlocked}
                onClick={saveOutlineAndWrite}
                className="btn-gold mt-5 min-h-[48px]"
                title={writingBlocked ? "Writing is blocked until research is on-topic." : undefined}
              >
                {busy ? "Starting chapters…" : writingBlocked ? "Writing blocked until research is clean" : "Write ebook from this outline"}
              </button>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="p-10">Loading…</div>}>
      <CreateInner />
    </Suspense>
  );
}
