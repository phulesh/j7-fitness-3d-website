"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEbook } from "@/hooks/useEbook";
import { api } from "@/lib/client";
import { isGenerating, writeLastBook } from "@/lib/simple-flow";
import { scoreBook } from "@/lib/quality";
import { CreatingBook } from "./CreatingBook";
import { SimpleEditor } from "./SimpleEditor";
import { FloatingBook } from "./FloatingBook";
import { DownloadBar } from "./DownloadBar";
import { BookAssistant } from "./BookAssistant";
import { QualityPanel } from "./QualityPanel";
import { ErrorBanner } from "./ErrorBanner";
import { AutosaveIndicator } from "./AutosaveIndicator";

export function BookWorkspace({ ebookId }: { ebookId: string }) {
  const { doc, setDoc, error, setError, saveState, load, patch, loading, loadState } = useEbook(ebookId);
  const search = useSearchParams();
  const router = useRouter();
  const view = search.get("view") || "";
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (doc) writeLastBook(doc);
  }, [doc]);

  useEffect(() => {
    if (!doc || started) return;
    if (view === "edit") return;
    if (doc.status === "draft" && !doc.chapters.length) {
      setStarted(true);
      api(`/api/ebooks/${ebookId}/generate`, { method: "POST", body: JSON.stringify({}) })
        .then(() => load())
        .catch((e) => setError(e.message));
    } else if (doc.status === "awaiting_outline" && !doc.researchQuality?.generationBlocked) {
      setStarted(true);
      api(`/api/ebooks/${ebookId}/generate`, { method: "POST", body: JSON.stringify({ fromOutline: true }) })
        .then(() => load())
        .catch((e) => setError(e.message));
    }
  }, [doc, ebookId, load, setError, started, view]);

  async function retry() {
    setError("");
    try {
      await api(`/api/ebooks/${ebookId}/generate`, { method: "POST", body: JSON.stringify({ resume: true }) });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const report = useMemo(() => (doc ? scoreBook(doc) : null), [doc]);
  const generating = isGenerating(doc);
  const ready = doc && (doc.status === "complete" || (doc.chapters.length > 0 && !generating && doc.status !== "failed"));

  if (loading || (!doc && loadState === "loading")) {
    return <p className="p-10 text-center text-ink-400">किताब खोली जा रही है…</p>;
  }

  if (!doc && loadState === "error") {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorBanner message={error || "यह किताब नहीं मिली।"} onRetry={() => load().catch(() => {})} />
        <Link href="/ebooks" className="btn-ghost mt-4 inline-flex">
          मेरी किताबें
        </Link>
      </div>
    );
  }

  if (!doc) return null;

  if (generating || (doc.status === "failed" && !doc.chapters.length) || (doc.status === "awaiting_outline" && doc.researchQuality?.generationBlocked && !doc.chapters.length)) {
    return (
      <>
        <CreatingBook doc={doc} onRetry={retry} />
        <ErrorBanner message={error} onDismiss={() => setError("")} />
      </>
    );
  }

  if (view === "edit" || doc.status === "draft") {
    return (
      <>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 pt-4">
          <Link href="/ebooks" className="text-sm text-ink-400">
            ← मेरी किताबें
          </Link>
          <AutosaveIndicator state={saveState} />
        </div>
        <SimpleEditor doc={doc} setDoc={setDoc} onPatch={patch} />
      </>
    );
  }

  if (ready) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 pb-28 text-center">
        <FloatingBook title={doc.title} subtitle={doc.subtitle} author={doc.settings.authorName} coverSvg={doc.cover?.svg} />
        <p className="stamp mt-10 text-gold-500">तैयार</p>
        <h1 className="font-display mt-4 text-3xl md:text-4xl">आपकी किताब तैयार है!</h1>
        <p className="mt-3 text-ink-400">
          {doc.title}
          {doc.wordCount ? ` · ${doc.wordCount.toLocaleString()} शब्द` : ""}
          {doc.chapterCount ? ` · ${doc.chapterCount} अध्याय` : ""}
        </p>
        <ErrorBanner message={error} onDismiss={() => setError("")} />
        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Link href={`/ebooks/${ebookId}/read`} className="btn-gold min-h-[52px]">
            📖 पढ़ें
          </Link>
          <Link href={`/ebooks/${ebookId}/3d`} className="btn-ghost min-h-[52px]">
            🧊 3D Preview
          </Link>
          <button className="btn-ghost min-h-[52px]" onClick={() => router.push(`/ebooks/${ebookId}?view=edit`)}>
            ✏️ Edit
          </button>
        </div>
        <div className="mt-6 text-left">
          <DownloadBar ebookId={ebookId} title={doc.title} />
        </div>
        {report && (
          <div className="mt-8 text-left">
            <QualityPanel
              report={report}
              onReview={() => router.push(`/ebooks/${ebookId}?view=edit`)}
              onFix={async () => {
                try {
                  await api(`/api/ebooks/${ebookId}/factcheck`, { method: "POST", body: "{}" });
                  await load();
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            />
          </div>
        )}
        <Link href={`/ebooks/${ebookId}/edit?advanced=1`} className="mt-8 inline-block text-sm text-ink-400 underline">
          Advanced Mode
        </Link>
        <BookAssistant ebookId={ebookId} onUpdate={setDoc} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="text-ink-400">यह किताब अभी अधूरी है।</p>
      <button className="btn-gold mt-4 min-h-[48px]" onClick={retry}>
        बनाना जारी रखें
      </button>
    </div>
  );
}
