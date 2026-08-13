"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SettingsForm } from "@/components/SettingsForm";
import { ErrorBanner } from "@/components/ErrorBanner";
import { DEFAULT_SETTINGS, type EbookSettings, type SyllabusInfo } from "@/lib/types";
import { api, ensureSession } from "@/lib/client";
import { Upload } from "lucide-react";
import { nanoid } from "nanoid";

function NewInner() {
  const params = useSearchParams();
  const router = useRouter();
  const createKey = useRef(nanoid(16));
  const creating = useRef(false);
  const [settings, setSettings] = useState<EbookSettings>({
    ...DEFAULT_SETTINGS,
    topic: params.get("topic") || "",
  });
  const [syllabusText, setSyllabusText] = useState("");
  const [syllabus, setSyllabus] = useState<SyllabusInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ensureSession().catch(() => {});
  }, []);

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

  async function createNew() {
    if (creating.current) return;
    setError("");
    if (settings.topic.trim().length < 3) {
      setError("Please provide a more specific topic.");
      return;
    }
    creating.current = true;
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
      const created = await api("/api/ebooks", {
        method: "POST",
        headers: { "Idempotency-Key": createKey.current, "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const id = (created.ebook.ebookId || created.ebook.id) as string;
      if (syl) {
        await api(`/api/ebooks/${id}`, { method: "PATCH", body: JSON.stringify({ syllabus: syl }) });
      }
      router.replace(`/ebooks/${id}/edit?tab=settings`);
    } catch (e: any) {
      creating.current = false;
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="stamp text-gold-500">Create once</p>
        <h1 className="font-display mt-4 text-3xl md:text-4xl">Create New Ebook</h1>
        <p className="mt-2 text-ink-400">
          A record is created only when you click this button. Edit, research, refresh, and back never duplicate it.
        </p>
        <ErrorBanner message={error} onDismiss={() => setError("")} />

        <div className="mt-8 space-y-8">
          <section className="paper-card rounded-2xl p-5 md:p-7">
            <h2 className="font-display text-xl">Ebook settings</h2>
            <div className="mt-5">
              <SettingsForm value={settings} onChange={setSettings} />
            </div>
          </section>

          <section className="paper-card rounded-2xl p-5 md:p-7">
            <h2 className="font-display text-xl">Syllabus mode</h2>
            <p className="mt-1 text-sm text-ink-400">Upload a curriculum PDF/DOCX or paste units. Folio will not invent a syllabus.</p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-paper-400 bg-paper-50 px-4 py-8 text-sm">
              <Upload className="mb-2 h-5 w-5 text-gold-500" />
              Upload syllabus or source document
              <input type="file" accept=".pdf,.docx,.doc,.txt,.md" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            </label>
            <textarea
              className="field mt-4 min-h-[120px]"
              placeholder="Or paste a syllabus / unit list…"
              value={syllabusText}
              onChange={(e) => setSyllabusText(e.target.value)}
            />
            {syllabus?.detected && (
              <div className="mt-4 rounded-xl bg-forest-500/10 p-4 text-sm">
                <p className="font-semibold">Syllabus detected</p>
                <p>Subject: {syllabus.subject || "—"}</p>
                <p>
                  {syllabus.units.length} unit(s), {syllabus.units.reduce((n, u) => n + u.topics.length, 0)} topic(s)
                </p>
              </div>
            )}
          </section>

          <button disabled={busy} onClick={createNew} className="btn-gold w-full min-h-[52px] text-base md:w-auto">
            {busy ? "Creating…" : "Create New Ebook"}
          </button>
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function NewEbookPage() {
  return (
    <Suspense fallback={<div className="p-10">Loading…</div>}>
      <NewInner />
    </Suspense>
  );
}
