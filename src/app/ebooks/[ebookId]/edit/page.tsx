"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BookStudio, type StudioTab } from "@/components/BookStudio";
import { SimpleEditor } from "@/components/SimpleEditor";
import { useEbook } from "@/hooks/useEbook";
import { AutosaveIndicator } from "@/components/AutosaveIndicator";

const TABS = new Set([
  "cover",
  "settings",
  "contents",
  "research",
  "sources",
  "outline",
  "chapters",
  "references",
  "glossary",
  "preview",
  "3d",
]);

function Inner() {
  const { ebookId } = useParams<{ ebookId: string }>();
  const search = useSearchParams();
  const advanced = search.get("advanced") === "1" || search.get("tab") || search.get("fact") === "1";
  const raw = search.get("tab") || (search.get("fact") === "1" ? "chapters" : "settings");
  const tab = (TABS.has(raw) ? raw : "settings") as StudioTab;
  const { doc, setDoc, patch, saveState, loading, error, load } = useEbook(ebookId);

  if (advanced) {
    return (
      <>
        <Header />
        <div className="mx-auto max-w-6xl px-4 pt-4 text-sm">
          <Link href={`/ebooks/${ebookId}?view=edit`} className="text-ink-400 underline">
            ← Simple editor
          </Link>
        </div>
        <BookStudio ebookId={ebookId} tab={tab} />
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      {loading && <p className="p-10 text-center text-ink-400">एडिटर खुल रहा है…</p>}
      {!doc && error && (
        <div className="p-10 text-center">
          <p className="text-unsupported">{error}</p>
          <button className="btn-gold mt-4" onClick={() => load().catch(() => {})}>
            Retry
          </button>
        </div>
      )}
      {doc && (
        <>
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 pt-4">
            <Link href={`/ebooks/${ebookId}`} className="text-sm text-ink-400">
              ← किताब
            </Link>
            <AutosaveIndicator state={saveState} />
          </div>
          <SimpleEditor doc={doc} setDoc={setDoc} onPatch={patch} />
        </>
      )}
      <Footer />
    </>
  );
}

export default function EditPage() {
  return (
    <Suspense fallback={<div className="p-10">Opening editor…</div>}>
      <Inner />
    </Suspense>
  );
}
