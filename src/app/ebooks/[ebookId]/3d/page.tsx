"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useEbook } from "@/hooks/useEbook";
import { buildBookPages } from "@/lib/book/pages";
import { DownloadBar } from "@/components/DownloadBar";

const Book3D = dynamic(() => import("@/components/Book3D").then((m) => m.Book3D), {
  ssr: false,
  loading: () => <p className="p-6 text-center text-ink-400">3D पुस्तक खुल रही है…</p>,
});

export default function Book3DPage() {
  const { ebookId } = useParams<{ ebookId: string }>();
  const { doc, loading, error, load } = useEbook(ebookId);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const pages = useMemo(() => (doc ? buildBookPages(doc) : []), [doc]);

  return (
    <>
      <Header />
      <main className={`mx-auto max-w-5xl px-4 py-6 ${theme === "dark" ? "rounded-3xl bg-ink-800 p-4 text-paper-100" : ""}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link href={`/ebooks/${ebookId}`} className="text-sm underline opacity-80">
            ← किताब
          </Link>
          <div className="flex gap-2">
            <button className="btn-ghost !py-2" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}>
              {theme === "light" ? "Dark preview" : "Light preview"}
            </button>
            <Link href={`/ebooks/${ebookId}/read`} className="btn-ghost !py-2">
              Read Book
            </Link>
          </div>
        </div>
        {loading && <p className="text-ink-400">लोड हो रहा है…</p>}
        {error && (
          <p className="text-unsupported">
            {error}{" "}
            <button className="underline" onClick={() => load().catch(() => {})}>
              Retry
            </button>
          </p>
        )}
        {doc && <Book3D ebookId={ebookId} doc={doc} pages={pages} coverSvg={doc.cover?.svg} previewTheme={theme} />}
        {doc && (
          <div className="mt-6">
            <DownloadBar ebookId={ebookId} title={doc.title} />
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
