"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import type { EbookDocument } from "@/lib/types";
import { htmlToPlain, plainToHtml } from "@/lib/simple-flow";
import { FloatingBook } from "./FloatingBook";
import { DownloadBar } from "./DownloadBar";
import { BookAssistant } from "./BookAssistant";
import { QualityPanel } from "./QualityPanel";
import { scoreBook, type QualityReport } from "@/lib/quality";

export function SimpleEditor({
  doc,
  setDoc,
  onPatch,
}: {
  doc: EbookDocument;
  setDoc: (d: EbookDocument) => void;
  onPatch: (body: Record<string, unknown>) => Promise<EbookDocument | void>;
}) {
  const id = doc.ebookId || doc.id;
  const [title, setTitle] = useState(doc.title);
  const [subtitle, setSubtitle] = useState(doc.subtitle || "");
  const [author, setAuthor] = useState(doc.settings.authorName || "");
  const [chIndex, setChIndex] = useState(0);
  const [editText, setEditText] = useState(false);
  const [aiAsk, setAiAsk] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<QualityReport>(() => scoreBook(doc));
  const [coverOpen, setCoverOpen] = useState(false);

  useEffect(() => {
    setTitle(doc.title);
    setSubtitle(doc.subtitle || "");
    setAuthor(doc.settings.authorName || "");
    setReport(scoreBook(doc));
  }, [doc]);

  const chapter = doc.chapters[chIndex];

  async function saveMeta() {
    await onPatch({
      title,
      customTitle: title,
      subtitle,
      settings: { ...doc.settings, authorName: author, title, customTitle: title, subtitle },
    });
  }

  async function run(action: string, extra?: Record<string, unknown>) {
    setBusy(action);
    setError("");
    try {
      if (action === "fact") {
        const data = await api(`/api/ebooks/${id}/factcheck`, { method: "POST", body: "{}" });
        if (data.ebook) setDoc(data.ebook);
        return;
      }
      if (action === "cover") {
        const data = await api(`/api/ebooks/${id}/cover`, {
          method: "POST",
          body: JSON.stringify({ style: extra?.style || doc.settings.coverStyle }),
        });
        if (data.ebook) setDoc(data.ebook);
        return;
      }
      if (action === "ai") {
        const data = await api(`/api/ebooks/${id}/assistant`, {
          method: "POST",
          body: JSON.stringify({ message: extra?.message || aiAsk }),
        });
        if (data.ebook) setDoc(data.ebook);
        setAiAsk("");
        return;
      }
      if (action === "fix") {
        const weak = doc.chapters.filter((c) => !c.sections?.some((s) => htmlToPlain(s.html).length > 40));
        for (const ch of weak) {
          await api(`/api/ebooks/${id}/chapter/${ch.index}`, { method: "POST", body: JSON.stringify({ action: "regenerate" }) });
        }
        await api(`/api/ebooks/${id}/factcheck`, { method: "POST", body: "{}" });
        const fresh = await api(`/api/ebooks/${id}`);
        if (fresh.ebook) setDoc(fresh.ebook);
        return;
      }
      await api(`/api/ebooks/${id}/chapter/${chIndex}`, {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
      const fresh = await api(`/api/ebooks/${id}`);
      if (fresh.ebook) setDoc(fresh.ebook);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function uploadCover(file: File) {
    setBusy("upload-cover");
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/ebooks/${id}/cover-image`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cover upload failed");
      if (data.ebook) setDoc(data.ebook);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <div className="flex justify-center">
        <FloatingBook title={title} subtitle={subtitle} author={author} coverSvg={doc.cover?.svg} size="md" />
      </div>

      <div className="mt-8 space-y-3">
        <label className="block text-sm">
          <span className="mb-1.5 block text-ink-400">Title</span>
          <input className="field font-display text-xl" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveMeta} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-ink-400">Subtitle</span>
          <input className="field" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} onBlur={saveMeta} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-ink-400">Author</span>
          <input className="field" value={author} onChange={(e) => setAuthor(e.target.value)} onBlur={saveMeta} />
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-unsupported">{error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button className="btn-ghost min-h-[48px]" disabled={!!busy} onClick={() => run("ai", { message: aiAsk || "पूरी किताब को beginner-friendly बनाओ" })}>
          Edit with AI
        </button>
        <button className="btn-ghost min-h-[48px]" onClick={() => setEditText((v) => !v)}>
          Edit Text
        </button>
        <button className="btn-ghost min-h-[48px]" disabled={!!busy || !chapter} onClick={() => run("regenerate")}>
          {busy === "regenerate" ? "…" : "Regenerate Chapter"}
        </button>
        <button className="btn-ghost min-h-[48px]" disabled={!!busy} onClick={() => run("fact")}>
          {busy === "fact" ? "…" : "Fact Check"}
        </button>
        <button className="btn-ghost min-h-[48px]" disabled={!!busy || !chapter} onClick={() => run("add-image", { imageKind: "illustration" })}>
          Change Image
        </button>
        <button className="btn-ghost min-h-[48px]" onClick={() => setCoverOpen((v) => !v)}>
          Change Cover
        </button>
      </div>

      {coverOpen && (
        <div className="paper-card mt-4 space-y-3 rounded-2xl p-4">
          <button className="btn-line w-full min-h-[44px]" disabled={!!busy} onClick={() => run("cover")}>
            {busy === "cover" ? "बन रहा है…" : "Regenerate Cover"}
          </button>
          <button className="btn-ghost w-full min-h-[44px]" disabled={!!busy} onClick={() => run("cover", { style: "Historical" })}>
            AI Generate Cover
          </button>
          <label className="btn-ghost flex min-h-[44px] w-full cursor-pointer">
            Use My Image
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} />
          </label>
        </div>
      )}

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (aiAsk.trim()) run("ai");
        }}
      >
        <label className="block text-sm">
          <span className="mb-1.5 block text-ink-400">AI से बदलाव</span>
          <textarea
            className="field min-h-[88px]"
            value={aiAsk}
            onChange={(e) => setAiAsk(e.target.value)}
            placeholder='जैसे: "Chapter 4 को और आसान हिंदी में लिखो."'
          />
        </label>
        <button className="btn-gold mt-3 min-h-[48px]" disabled={!!busy || !aiAsk.trim()}>
          लागू करें
        </button>
      </form>

      {doc.chapters.length > 0 && (
        <div className="mt-8">
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-400">अध्याय</span>
            <select className="field" value={chIndex} onChange={(e) => setChIndex(Number(e.target.value))}>
              {doc.chapters.map((c, i) => (
                <option key={c.id} value={i}>
                  {i + 1}. {c.title}
                </option>
              ))}
            </select>
          </label>
          {chapter && editText && (
            <div className="mt-4 space-y-4">
              <input
                className="field font-display text-xl"
                value={chapter.title}
                onChange={(e) => {
                  const chapters = doc.chapters.map((c, i) => (i === chIndex ? { ...c, title: e.target.value } : c));
                  setDoc({ ...doc, chapters });
                }}
                onBlur={() => onPatch({ chapters: doc.chapters })}
              />
              {chapter.sections.map((s) => (
                <textarea
                  key={s.id}
                  className="field min-h-[160px]"
                  defaultValue={htmlToPlain(s.html)}
                  onBlur={(e) => {
                    const chapters = doc.chapters.map((c, i) =>
                      i === chIndex
                        ? {
                            ...c,
                            sections: c.sections.map((x) => (x.id === s.id ? { ...x, html: plainToHtml(e.target.value) } : x)),
                          }
                        : c
                    );
                    setDoc({ ...doc, chapters });
                    onPatch({ chapters });
                  }}
                />
              ))}
            </div>
          )}
          {chapter && !editText && (
            <article className="prose-ebook paper-card mt-4 rounded-2xl p-5">
              <h2>{chapter.title}</h2>
              {chapter.sections.slice(0, 2).map((s) => (
                <section key={s.id}>
                  <h3>{s.heading}</h3>
                  <div dangerouslySetInnerHTML={{ __html: s.html }} />
                </section>
              ))}
            </article>
          )}
        </div>
      )}

      <div className="mt-8">
        <QualityPanel report={report} busy={busy === "fix"} onFix={() => run("fix")} onReview={() => setEditText(true)} />
      </div>

      <div className="mt-8">
        <h2 className="font-display text-xl">Download</h2>
        <div className="mt-3">
          <DownloadBar ebookId={id} title={title} />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link href={`/ebooks/${id}/read`} className="btn-gold min-h-[48px]">
          पढ़ें
        </Link>
        <Link href={`/ebooks/${id}/3d`} className="btn-ghost min-h-[48px]">
          3D Preview
        </Link>
        <Link href={`/ebooks/${id}/edit?advanced=1`} className="btn-ghost min-h-[48px]">
          Advanced Mode
        </Link>
      </div>

      <BookAssistant ebookId={id} onUpdate={setDoc} />
    </div>
  );
}
