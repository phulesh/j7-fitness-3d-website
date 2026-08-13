"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ErrorBanner } from "@/components/ErrorBanner";
import { BookCard } from "@/components/BookCard";
import { api, ensureSession } from "@/lib/client";
import { downloadEbook } from "@/components/DownloadBar";

type Card = {
  id: string;
  ebookId: string;
  title: string;
  subtitle?: string;
  status: string;
  wordCount: number;
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
  coverSvg?: string;
};

export default function LibraryPage() {
  const [ebooks, setEbooks] = useState<Card[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function load() {
    await ensureSession();
    const params = new URLSearchParams({ q, sort: "updated" });
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
  }, [q]);

  async function remove(id: string) {
    await api(`/api/ebooks/${id}`, { method: "DELETE" });
    setPendingDelete(null);
    setEbooks((xs) => xs.filter((x) => (x.ebookId || x.id) !== id));
  }

  async function duplicate(id: string) {
    try {
      const data = await api(`/api/ebooks/${id}/duplicate`, { method: "POST", body: "{}" });
      if (data.ebook) {
        setEbooks((xs) => [
          {
            ...data.ebook,
            coverSvg: data.ebook.cover?.svg || "",
          },
          ...xs,
        ]);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function download(id: string, format: string) {
    try {
      const book = ebooks.find((e) => (e.ebookId || e.id) === id);
      await downloadEbook(id, format, book?.title);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="stamp text-gold-500">My Books</p>
            <h1 className="font-display mt-3 text-3xl">मेरी किताबें</h1>
          </div>
          <Link href="/" className="btn-gold min-h-[48px]">
            ✨ नई किताब
          </Link>
        </div>

        <input className="field mt-6" placeholder="किताब खोजें…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ErrorBanner message={error} onDismiss={() => setError("")} onRetry={() => load().catch((e) => setError(e.message))} />

        {ebooks.length === 0 && <p className="mt-10 text-ink-400">अभी कोई किताब नहीं है। विषय लिखकर शुरू करें।</p>}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ebooks.map((e) => (
            <BookCard
              key={e.ebookId || e.id}
              book={e}
              onDownload={download}
              onDuplicate={duplicate}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      </main>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-800/50 p-4">
          <div className="paper-card max-w-md rounded-2xl p-6">
            <h2 className="font-display text-xl">यह किताब हटाएँ?</h2>
            <p className="mt-2 text-sm text-ink-400">यह वापस नहीं आएगी।</p>
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost flex-1 min-h-[48px]" onClick={() => setPendingDelete(null)}>
                नहीं
              </button>
              <button className="btn-gold flex-1 min-h-[48px]" onClick={() => remove(pendingDelete)}>
                हाँ, हटाएँ
              </button>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </>
  );
}
