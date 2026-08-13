"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api, ensureSession } from "@/lib/client";
import { displayStatus } from "@/lib/types";
import { BookOpen, Box, Copy, Download, Shield, Trash2 } from "lucide-react";

type Card = {
  id: string;
  ebookId: string;
  title: string;
  language: string;
  status: string;
  wordCount: number;
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
  type: string;
  author: string;
  coverSvg?: string;
};

export default function LibraryPage() {
  const [ebooks, setEbooks] = useState<Card[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("updated");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function load() {
    await ensureSession();
    const params = new URLSearchParams({ q, language, status, sort });
    const data = await api(`/api/ebooks?${params.toString()}`);
    const seen = new Set<string>();
    const unique = (data.ebooks as Card[]).filter((e) => {
      const id = e.ebookId || e.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    setEbooks(unique);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, language, status, sort]);

  async function remove(id: string) {
    await api(`/api/ebooks/${id}`, { method: "DELETE" });
    setPendingDelete(null);
    setEbooks((xs) => xs.filter((x) => (x.ebookId || x.id) !== id));
  }

  async function duplicate(id: string) {
    try {
      const data = await api(`/api/ebooks/${id}`, { method: "POST", body: JSON.stringify({ action: "duplicate" }) });
      if (data.ebook) await load();
    } catch (e: any) {
      setError(e.message || "Could not duplicate ebook");
    }
  }

  async function download(id: string, format: string) {
    const res = await fetch(`/api/ebooks/${id}/export?format=${format}`);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Download failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ext = format === "3d" ? "zip" : format;
    a.download = `ebook${format === "3d" ? "-3D-BOOK" : ""}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const languages = useMemo(() => ["all", ...Array.from(new Set(ebooks.map((e) => e.language).filter(Boolean)))], [ebooks]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="stamp text-gold-500">Library</p>
            <h1 className="font-display mt-3 text-3xl">My Ebooks</h1>
          </div>
          <Link href="/ebooks/new" className="btn-gold min-h-[48px]">
            Create New Ebook
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input className="field" placeholder="Search ebooks…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="field" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l === "all" ? "All languages" : l}
              </option>
            ))}
          </select>
          <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="researching">Researching</option>
            <option value="outline">Outline Ready</option>
            <option value="writing">Writing</option>
            <option value="complete">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <select className="field" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="updated">Sort by updated</option>
            <option value="newest">Sort by newest</option>
            <option value="words">Sort by word count</option>
            <option value="title">Sort by title</option>
          </select>
        </div>

        <ErrorBanner message={error} onDismiss={() => setError("")} onRetry={() => load().catch((e) => setError(e.message))} />

        {ebooks.length === 0 && <p className="mt-10 text-ink-400">No volumes yet. Create New Ebook to commission one.</p>}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ebooks.map((e) => {
            const id = e.ebookId || e.id;
            return (
              <article key={id} className="paper-card flex flex-col rounded-2xl p-5">
                <div
                  className="mb-3 aspect-[2/3] w-28 overflow-hidden rounded-sm bg-ink-700"
                  dangerouslySetInnerHTML={{
                    __html: (e.coverSvg || "").replace(/width="800" height="1200"/, 'viewBox="0 0 800 1200" width="100%" height="100%"'),
                  }}
                />
                <p className="text-[10px] uppercase tracking-[0.18em] text-gold-500">{e.type}</p>
                <h2 className="font-display mt-2 text-xl leading-tight">{e.title}</h2>
                <p className="mt-1 text-sm text-ink-400">by {e.author || "Folio Research"}</p>
                <p className="mt-2 text-xs text-ink-400">
                  {e.language} · {displayStatus(e.status as any)} · updated {new Date(e.updatedAt || e.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-1 text-sm text-ink-400">
                  {e.chapterCount} chapters · {e.wordCount.toLocaleString()} words
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/ebooks/${id}/read`} className="btn-ghost !py-1.5 !text-xs">
                    <BookOpen className="h-3.5 w-3.5" /> Open
                  </Link>
                  <Link href={`/ebooks/${id}/edit`} className="btn-ghost !py-1.5 !text-xs">
                    Continue Editing
                  </Link>
                  <Link href={`/ebooks/${id}/3d`} className="btn-ghost !py-1.5 !text-xs">
                    <Box className="h-3.5 w-3.5" /> 3D Read
                  </Link>
                  {e.status === "complete" ? (
                    <details className="relative">
                      <summary className="btn-ghost !py-1.5 !text-xs cursor-pointer list-none"><Download className="h-3.5 w-3.5" /> Download</summary>
                      <div className="absolute left-0 z-20 mt-1 grid min-w-40 gap-1 rounded-xl border border-paper-300 bg-paper-50 p-2 shadow-soft">
                        {["pdf", "epub", "docx", "html", "3d"].map((format) => (
                          <button key={format} onClick={() => download(id, format)} className="rounded-lg px-3 py-2 text-left text-xs hover:bg-paper-200">
                            {format === "3d" ? "3D Book ZIP" : format === "html" ? "3D HTML" : format.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </details>
                  ) : <span className="rounded-full bg-gold-500/10 px-3 py-2 text-xs text-gold-500">Generation in progress</span>}
                  <button onClick={() => duplicate(id)} className="btn-ghost !py-1.5 !text-xs">
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </button>
                  <Link href={`/ebooks/${id}/edit?fact=1`} className="btn-ghost !py-1.5 !text-xs">
                    <Shield className="h-3.5 w-3.5" /> Fact Check
                  </Link>
                  <button onClick={() => setPendingDelete(id)} className="btn-ghost !py-1.5 !text-xs text-unsupported">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-800/50 p-4">
          <div className="paper-card max-w-md rounded-2xl p-6">
            <h2 className="font-display text-xl">Delete this ebook?</h2>
            <p className="mt-2 text-sm text-ink-400">This cannot be undone. Back, refresh, and failed generation never delete a book.</p>
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button className="btn-gold flex-1" onClick={() => remove(pendingDelete)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </>
  );
}
