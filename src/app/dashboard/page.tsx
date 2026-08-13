"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { api, ensureSession } from "@/lib/client";
import { BookOpen, Download, RefreshCw, Shield, Trash2 } from "lucide-react";

type Card = {
  id: string;
  title: string;
  language: string;
  status: string;
  wordCount: number;
  chapterCount: number;
  createdAt: string;
  type: string;
};

export default function DashboardPage() {
  const [ebooks, setEbooks] = useState<Card[]>([]);
  const [error, setError] = useState("");

  async function load() {
    await ensureSession();
    const data = await api("/api/ebooks");
    setEbooks(data.ebooks);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this ebook?")) return;
    await api(`/api/ebooks/${id}`, { method: "DELETE" });
    setEbooks((xs) => xs.filter((x) => x.id !== id));
  }

  async function download(id: string, format: string) {
    const res = await fetch(`/api/ebooks/${id}/export?format=${format}`);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Download failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ebook.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="stamp text-gold-500">Library</p>
            <h1 className="font-display mt-3 text-3xl">My Ebooks</h1>
          </div>
          <Link href="/create" className="btn-gold min-h-[48px]">
            New ebook
          </Link>
        </div>
        {error && <p className="mt-4 text-sm text-unsupported">{error}</p>}
        {ebooks.length === 0 && (
          <p className="mt-10 text-ink-400">No volumes yet. Commission one from the desk.</p>
        )}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ebooks.map((e) => (
            <article key={e.id} className="paper-card flex flex-col rounded-2xl p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold-500">{e.type}</p>
              <h2 className="font-display mt-2 text-xl leading-tight">{e.title}</h2>
              <p className="mt-2 text-xs text-ink-400">
                {e.language} · {new Date(e.createdAt).toLocaleDateString()} · {e.status}
              </p>
              <p className="mt-1 text-sm text-ink-400">
                {e.chapterCount} chapters · {e.wordCount.toLocaleString()} words
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/ebook/${e.id}`} className="btn-ghost !py-1.5 !text-xs">
                  <BookOpen className="h-3.5 w-3.5" /> Open
                </Link>
                <Link href={`/ebook/${e.id}?edit=1`} className="btn-ghost !py-1.5 !text-xs">
                  Edit
                </Link>
                <button onClick={() => download(e.id, "pdf")} className="btn-ghost !py-1.5 !text-xs">
                  <Download className="h-3.5 w-3.5" /> PDF
                </button>
                <button onClick={() => download(e.id, "docx")} className="btn-ghost !py-1.5 !text-xs">
                  DOCX
                </button>
                <button onClick={() => download(e.id, "epub")} className="btn-ghost !py-1.5 !text-xs">
                  EPUB
                </button>
                <Link href={`/ebook/${e.id}?fact=1`} className="btn-ghost !py-1.5 !text-xs">
                  <Shield className="h-3.5 w-3.5" /> Fact Check
                </Link>
                <button onClick={() => remove(e.id)} className="btn-ghost !py-1.5 !text-xs text-unsupported">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
