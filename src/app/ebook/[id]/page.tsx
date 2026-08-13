"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { api, ensureSession } from "@/lib/client";
import { COVER_STYLES, LANGUAGES, type EbookDocument, type FactFlag } from "@/lib/types";
import { ProgressPanel } from "@/components/ProgressPanel";

type Tab = "cover" | "contents" | "chapter" | "references";

export default function EbookPage() {
  return (
    <Suspense fallback={<div className="p-10">Opening…</div>}>
      <EbookInner />
    </Suspense>
  );
}

function EbookInner() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const [doc, setDoc] = useState<EbookDocument | null>(null);
  const [tab, setTab] = useState<Tab>(search.get("tab") === "refs" ? "references" : "cover");
  const [chIndex, setChIndex] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [flags, setFlags] = useState<FactFlag[]>([]);
  const [flagSummary, setFlagSummary] = useState<{ verified: number; needs_review: number; unsupported: number } | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [editing, setEditing] = useState(search.get("edit") === "1");

  async function load() {
    await ensureSession();
    const data = await api(`/api/ebooks/${id}`);
    setDoc(data.ebook);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!doc) return;
    if (["analyzing", "researching", "outlining", "writing", "fact_checking"].includes(doc.status)) {
      const t = setInterval(() => load().catch(() => {}), 1500);
      return () => clearInterval(t);
    }
  }, [doc?.status]);

  useEffect(() => {
    if (search.get("fact") === "1" && doc?.chapters?.length) {
      runFactCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, search.get("fact")]);

  const generating = doc && !["complete", "failed", "draft", "awaiting_outline"].includes(doc.status);

  async function patch(body: unknown) {
    const data = await api(`/api/ebooks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    setDoc(data.ebook);
  }

  async function download(format: string) {
    setBusy(`download-${format}`);
    try {
      const res = await fetch(`/api/ebooks/${id}/export?format=${format}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(doc?.title || "ebook").replace(/\s+/g, "-")}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
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
      await api(`/api/ebooks/${id}/chapter/${chIndex}`, {
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

  async function runFactCheck() {
    setBusy("fact");
    setError("");
    try {
      const data = await api(`/api/ebooks/${id}/factcheck`, { method: "POST", body: "{}" });
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
      const data = await api(`/api/ebooks/${id}/factcheck`, {
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
      const data = await api(`/api/ebooks/${id}/sources`, { method: "POST", body: JSON.stringify({ url: sourceUrl }) });
      setDoc(data.ebook);
      setSourceUrl("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const chapter = doc?.chapters?.[chIndex];
  const tabs: { id: Tab; label: string }[] = useMemo(() => {
    const t: { id: Tab; label: string }[] = [
      { id: "cover", label: "Cover" },
      { id: "contents", label: "Contents" },
    ];
    if (doc?.chapters?.length) t.push({ id: "chapter", label: `Chapter ${chIndex + 1}` });
    t.push({ id: "references", label: "References" });
    return t;
  }, [doc?.chapters?.length, chIndex]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {!doc && !error && <p>Opening the desk…</p>}
        {error && <p className="mb-4 text-sm text-unsupported">{error}</p>}
        {doc && (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                {editing ? (
                  <input
                    className="field font-display text-2xl"
                    value={doc.title}
                    onChange={(e) => setDoc({ ...doc, title: e.target.value })}
                    onBlur={() => patch({ title: doc.title })}
                  />
                ) : (
                  <h1 className="font-display text-3xl">{doc.title}</h1>
                )}
                {editing ? (
                  <input
                    className="field mt-2"
                    value={doc.subtitle}
                    onChange={(e) => setDoc({ ...doc, subtitle: e.target.value })}
                    onBlur={() => patch({ subtitle: doc.subtitle })}
                  />
                ) : (
                  <p className="mt-1 text-ink-400">{doc.subtitle}</p>
                )}
                <p className="mt-2 text-xs text-ink-400">
                  {doc.language} · {doc.type} · {doc.chapterCount} chapters · {doc.wordCount.toLocaleString()} words · {doc.status}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost !py-2" onClick={() => setEditing((v) => !v)}>
                  {editing ? "Done editing" : "Edit"}
                </button>
                <button className="btn-ghost !py-2" disabled={!!busy} onClick={runFactCheck}>
                  {busy === "fact" ? "Checking…" : "Fact Check Ebook"}
                </button>
                <button className="btn-gold !py-2" disabled={!!busy} onClick={() => download("pdf")}>
                  Download PDF
                </button>
                <button className="btn-ghost !py-2" disabled={!!busy} onClick={() => download("docx")}>
                  DOCX
                </button>
                <button className="btn-ghost !py-2" disabled={!!busy} onClick={() => download("epub")}>
                  EPUB
                </button>
              </div>
            </div>

            {doc.analysis?.copyrightNotice && (
              <p className="mt-4 rounded-xl bg-gold-50 px-4 py-3 text-sm">{doc.analysis.copyrightNotice}</p>
            )}
            {doc.disclaimer && <p className="mt-3 rounded-xl border border-burgundy-500/20 px-4 py-3 text-sm">{doc.disclaimer}</p>}

            {generating && (
              <ProgressPanel
                message={doc.progress?.message || "Working…"}
                detail={doc.progress?.detail}
                percent={doc.progress?.percent || 10}
                step={doc.progress?.step}
              />
            )}

            {doc.status === "awaiting_outline" && (
              <p className="mt-4 text-sm">
                Outline is ready.{" "}
                <Link className="underline" href="/create">
                  Return to the desk
                </Link>{" "}
                or open contents below.
              </p>
            )}

            {doc.status === "failed" && (
              <div className="mt-4 rounded-xl border border-unsupported/30 p-4 text-sm">
                {doc.error || "Generation interrupted. Resume generation."}
                <button
                  className="btn-gold ml-3 !py-1.5"
                  onClick={async () => {
                    await api(`/api/ebooks/${id}/generate`, { method: "POST", body: JSON.stringify({ resume: true }) });
                    load();
                  }}
                >
                  Resume generation
                </button>
              </div>
            )}

            {flagSummary && (
              <section className="mt-6 paper-card rounded-2xl p-5">
                <h2 className="font-display text-xl">Fact check</h2>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <span className="rounded-full bg-verified/10 px-3 py-1 text-verified">Verified {flagSummary.verified}</span>
                  <span className="rounded-full bg-review/10 px-3 py-1 text-review">Needs Review {flagSummary.needs_review}</span>
                  <span className="rounded-full bg-unsupported/10 px-3 py-1 text-unsupported">Unsupported {flagSummary.unsupported}</span>
                </div>
                <ul className="mt-4 max-h-64 space-y-3 overflow-auto text-sm">
                  {flags.map((f) => (
                    <li key={f.id} className="border-b border-paper-300 pb-2">
                      <span
                        className={
                          f.status === "verified" ? "text-verified" : f.status === "unsupported" ? "text-unsupported" : "text-review"
                        }
                      >
                        {f.status.replace("_", " ")}
                      </span>
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

            <div className="mt-8 flex gap-2 overflow-auto pb-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${tab === t.id ? "bg-ink-700 text-paper-100" : "bg-paper-100 border border-paper-400"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "cover" && (
              <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr]">
                <div
                  className="book-shadow mx-auto aspect-[2/3] w-full max-w-[280px] overflow-hidden rounded-sm bg-ink-700"
                  dangerouslySetInnerHTML={{
                    __html: (doc.cover?.svg || "").replace(/width="800" height="1200"/, 'viewBox="0 0 800 1200" width="100%" height="100%"'),
                  }}
                />
                <div className="space-y-4">
                  <label className="block text-sm">
                    Cover style
                    <select
                      className="field mt-1"
                      value={doc.settings.coverStyle}
                      onChange={(e) => patch({ coverStyle: e.target.value, regenerateCover: true })}
                    >
                      {COVER_STYLES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Author
                    <input
                      className="field mt-1"
                      value={doc.settings.authorName}
                      onChange={(e) => setDoc({ ...doc, settings: { ...doc.settings, authorName: e.target.value } })}
                      onBlur={() => patch({ authorName: doc.settings.authorName, regenerateCover: true })}
                    />
                  </label>
                  <label className="block text-sm">
                    Language
                    <select
                      className="field mt-1"
                      value={doc.language}
                      onChange={(e) => patch({ settings: { ...doc.settings, language: e.target.value }, })}
                    >
                      {LANGUAGES.filter((l) => l.code !== "auto").map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}

            {tab === "contents" && (
              <ol className="mt-6 space-y-2">
                <li className="paper-card rounded-xl p-4">Introduction</li>
                {doc.outline.map((o, i) => (
                  <li key={o.id}>
                    <button
                      className="paper-card w-full rounded-xl p-4 text-left"
                      onClick={() => {
                        setChIndex(i);
                        setTab("chapter");
                      }}
                    >
                      <span className="text-gold-500">{String(i + 1).padStart(2, "0")}</span>{" "}
                      {editing ? (
                        <input
                          className="field mt-2"
                          value={o.title}
                          onChange={(e) => {
                            const outline = doc.outline.map((x) => (x.id === o.id ? { ...x, title: e.target.value } : x));
                            setDoc({ ...doc, outline });
                          }}
                          onBlur={() => patch({ outline: doc.outline })}
                        />
                      ) : (
                        <span className="font-display text-lg">{o.title}</span>
                      )}
                      <p className="mt-1 text-sm text-ink-400">{o.summary}</p>
                    </button>
                  </li>
                ))}
                <li className="paper-card rounded-xl p-4">Conclusion · Glossary · References</li>
              </ol>
            )}

            {tab === "chapter" && chapter && (
              <article className="mt-6 grid gap-6 lg:grid-cols-[1fr_220px]">
                <div className="paper-card rounded-2xl p-5 md:p-8">
                  <p className="text-xs uppercase tracking-[0.18em] text-gold-500">Chapter {chapter.index + 1}</p>
                  {editing ? (
                    <input
                      className="field mt-2 font-display text-2xl"
                      value={chapter.title}
                      onChange={(e) => {
                        const chapters = doc.chapters.map((c, i) => (i === chIndex ? { ...c, title: e.target.value } : c));
                        setDoc({ ...doc, chapters });
                      }}
                      onBlur={() => patch({ chapters: doc.chapters })}
                    />
                  ) : (
                    <h2 className="font-display mt-2 text-3xl">{chapter.title}</h2>
                  )}

                  {chapter.learningObjectives.length > 0 && (
                    <section className="mt-6">
                      <h3 className="font-display text-xl">Learning objectives</h3>
                      <ul className="mt-2 list-disc pl-5 text-sm">
                        {chapter.learningObjectives.map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {chapter.sections.map((s) => (
                    <section key={s.id} className="prose-ebook mt-6">
                      {editing ? (
                        <>
                          <input
                            className="field mb-2"
                            value={s.heading}
                            onChange={(e) => {
                              const chapters = doc.chapters.map((c, i) =>
                                i === chIndex
                                  ? { ...c, sections: c.sections.map((x) => (x.id === s.id ? { ...x, heading: e.target.value } : x)) }
                                  : c
                              );
                              setDoc({ ...doc, chapters });
                            }}
                            onBlur={() => patch({ chapters: doc.chapters })}
                          />
                          <textarea
                            className="field min-h-[160px]"
                            value={s.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
                            onChange={(e) => {
                              const html = e.target.value
                                .split(/\n{2,}/)
                                .map((p) => `<p>${p}</p>`)
                                .join("");
                              const chapters = doc.chapters.map((c, i) =>
                                i === chIndex
                                  ? { ...c, sections: c.sections.map((x) => (x.id === s.id ? { ...x, html } : x)) }
                                  : c
                              );
                              setDoc({ ...doc, chapters });
                            }}
                            onBlur={() => patch({ chapters: doc.chapters })}
                          />
                        </>
                      ) : (
                        <>
                          <h3>{s.heading}</h3>
                          <div className="drop-cap" dangerouslySetInnerHTML={{ __html: s.html }} />
                        </>
                      )}
                    </section>
                  ))}

                  {chapter.keyPoints.length > 0 && (
                    <section className="mt-6">
                      <h3 className="font-display text-xl">Key points</h3>
                      <ul className="mt-2 list-disc pl-5">
                        {chapter.keyPoints.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {chapter.examples.length > 0 && (
                    <section className="mt-6">
                      <h3 className="font-display text-xl">Examples</h3>
                      <ul className="mt-2 list-disc pl-5">
                        {chapter.examples.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {chapter.summary && (
                    <section className="mt-6">
                      <h3 className="font-display text-xl">Summary</h3>
                      {editing ? (
                        <textarea
                          className="field mt-2 min-h-[100px]"
                          value={chapter.summary}
                          onChange={(e) => {
                            const chapters = doc.chapters.map((c, i) => (i === chIndex ? { ...c, summary: e.target.value } : c));
                            setDoc({ ...doc, chapters });
                          }}
                          onBlur={() => patch({ chapters: doc.chapters })}
                        />
                      ) : (
                        <p className="mt-2">{chapter.summary}</p>
                      )}
                    </section>
                  )}

                  {chapter.images.map((img) => (
                    <figure key={img.sourceUrl} className="mt-6">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.alt} className="max-h-72 rounded-lg object-cover" />
                      <figcaption className="mt-1 text-xs text-ink-400">
                        {img.caption} — {img.credit} ({img.license})
                      </figcaption>
                    </figure>
                  ))}

                  {chapter.questions.length > 0 && (
                    <section className="mt-6">
                      <h3 className="font-display text-xl">Questions</h3>
                      {chapter.questions.map((q, i) => (
                        <p key={i} className="mt-2 text-sm">
                          {i + 1}. {q.question}
                        </p>
                      ))}
                    </section>
                  )}
                  {chapter.mcqs.length > 0 && (
                    <section className="mt-6">
                      <h3 className="font-display text-xl">MCQs</h3>
                      {chapter.mcqs.map((q, i) => (
                        <div key={i} className="mt-3 text-sm">
                          <p>
                            {i + 1}. {q.question}
                          </p>
                          <ul className="ml-4">
                            {(q.options || []).map((o) => (
                              <li key={o}>{o}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </section>
                  )}

                  {chapter.factFlags && chapter.factFlags.length > 0 && (
                    <section className="mt-6 text-sm">
                      {chapter.factFlags.map((f) => (
                        <p key={f.id} className="mt-1">
                          <strong>{f.status}</strong> — {f.claim.slice(0, 160)}
                        </p>
                      ))}
                    </section>
                  )}
                </div>

                <aside className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-ink-400">Chapter tools</p>
                  {[
                    ["regenerate", "Regenerate Chapter"],
                    ["improve", "Improve Writing"],
                    ["simplify", "Simplify"],
                    ["detail", "Make More Detailed"],
                    ["translate", "Translate"],
                  ].map(([action, label]) => (
                    <button
                      key={action}
                      disabled={!!busy}
                      className="btn-ghost w-full !justify-start"
                      onClick={() =>
                        chapterAction(action, action === "translate" ? { language: prompt("Translate to language code", doc.language) || doc.language } : {})
                      }
                    >
                      {busy === action ? "Working…" : label}
                    </button>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <button className="btn-ghost flex-1" disabled={chIndex === 0} onClick={() => setChIndex((i) => i - 1)}>
                      Prev
                    </button>
                    <button
                      className="btn-ghost flex-1"
                      disabled={chIndex >= (doc.chapters.length || 1) - 1}
                      onClick={() => setChIndex((i) => i + 1)}
                    >
                      Next
                    </button>
                  </div>
                </aside>
              </article>
            )}

            {tab === "references" && (
              <section className="mt-6 paper-card rounded-2xl p-5">
                <h2 className="font-display text-xl">References</h2>
                <p className="mt-1 text-sm text-ink-400">These URLs were collected during research for this title.</p>
                <ol className="mt-4 space-y-3 text-sm">
                  {doc.sources.map((s) => (
                    <li key={s.id}>
                      <span className="text-gold-500">[{s.id}]</span> {s.title} — {s.organization} —{" "}
                      <a href={s.url} className="underline" target="_blank" rel="noreferrer">
                        {s.url}
                      </a>
                      <span className="text-ink-400"> · tier {s.tier}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="field"
                    placeholder="Add a source URL"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                  />
                  <button className="btn-gold" disabled={!!busy} onClick={addSource}>
                    Add Sources
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
