"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ensureSession } from "@/lib/client";
import {
  Globe2,
  Languages,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  FileText,
  FileType2,
  BookOpen,
  Upload,
  ArrowRight,
  Quote,
} from "lucide-react";

const EXAMPLES = [
  "Python for Beginners",
  "Indian Constitution",
  "Class 10 Science",
  "Data Science Complete Course",
  "AI Automation",
  "History of India",
  "English Speaking Course",
  "UPSC Geography",
  "Bhagat Singh biography",
  "Machine Learning",
  "Class 12 Biology Chapter 1",
];

const FEATURES = [
  { icon: Globe2, title: "Web Research", body: "Live search across encyclopedias, government, academic, and official docs." },
  { icon: Languages, title: "Multilingual", body: "Hindi, English, Spanish, Tamil, Arabic, and 20+ languages with Unicode fonts." },
  { icon: GraduationCap, title: "Syllabus Mode", body: "Paste or upload a curriculum. Folio builds the book around the real units." },
  { icon: ShieldCheck, title: "Source Verification", body: "Sources are ranked. Important claims are cross-checked. Citations stay attached." },
  { icon: Sparkles, title: "AI Writing", body: "Chapters are structured from research notes — not invented from model memory." },
  { icon: FileText, title: "PDF Export", body: "Cover, TOC, headers, page numbers, tables, and clickable references." },
  { icon: FileType2, title: "DOCX Export", body: "Editable Word documents that keep headings, images, and citations." },
  { icon: BookOpen, title: "EPUB Export", body: "Proper EPUB 3 with metadata, nav, and chapters for every reader app." },
];

export default function HomePage() {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function go(e?: FormEvent) {
    e?.preventDefault();
    const t = topic.trim();
    if (t.length < 3) return;
    setBusy(true);
    try {
      await ensureSession();
      router.push(`/ebooks/new?topic=${encodeURIComponent(t)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header />
      <main>
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 md:grid-cols-[1.1fr_.9fr] md:pt-20">
            <div>
              <p className="stamp text-gold-500">Research first  ·  then write</p>
              <h1 className="font-display mt-5 text-4xl leading-[1.08] tracking-tight text-ink-700 sm:text-5xl lg:text-[3.4rem]">
                Turn Any Topic Into a Research-Based Ebook
              </h1>
              <p className="mt-5 max-w-xl text-lg text-ink-400">
                Enter a topic. AI researches reliable sources, organizes the knowledge, and creates a professional ebook in
                your language.
              </p>

              <form onSubmit={go} className="paper-card mt-8 rounded-2xl p-2 shadow-soft">
                <label className="sr-only" htmlFor="topic">
                  Ebook title or topic
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    id="topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Enter ebook title or topic…"
                    className="min-h-[52px] flex-1 rounded-xl border-0 bg-transparent px-4 text-base outline-none placeholder:text-ink-300"
                    autoComplete="off"
                  />
                  <button type="submit" disabled={busy || topic.trim().length < 3} className="btn-gold min-h-[48px] px-6">
                    Generate Ebook
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 px-2 pb-2">
                  <Link href="/ebooks/new?upload=syllabus" className="btn-ghost !py-1.5 !text-xs">
                    <Upload className="h-3.5 w-3.5" /> Upload Syllabus
                  </Link>
                  <Link href="/ebooks/new?upload=document" className="btn-ghost !py-1.5 !text-xs">
                    <Upload className="h-3.5 w-3.5" /> Upload Document
                  </Link>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap gap-2">
                {EXAMPLES.slice(0, 6).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setTopic(ex)}
                    className="rounded-full border border-paper-400 bg-paper-50/70 px-3 py-1 text-xs text-ink-400 hover:border-gold-300 hover:text-ink-700"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-sm">
              <div className="book-shadow relative aspect-[3/4] rotate-[-6deg] rounded-r-md bg-[#2A1C16] p-8 text-[#F6F0E6]">
                <p className="text-[10px] uppercase tracking-[0.28em] text-[#D4BC6E]">Folio press</p>
                <h2 className="font-display mt-10 text-3xl leading-tight">The Open Codex</h2>
                <p className="mt-4 text-sm text-[#C4B09A]">A sample spine from the research desk — every claim wears a number.</p>
                <div className="absolute bottom-8 left-8 right-8">
                  <div className="h-px bg-[#D4BC6E]/50" />
                  <p className="mt-3 text-xs tracking-wide">Cited · Verified · Export-ready</p>
                </div>
              </div>
              <div className="book-shadow absolute -bottom-6 -right-2 w-[78%] rotate-[7deg] rounded-r-md bg-[#fff9f0] p-6 text-ink-700">
                <p className="text-[10px] uppercase tracking-[0.22em] text-burgundy-500">References</p>
                <ol className="mt-3 space-y-2 text-[11px] text-ink-400">
                  <li>[1] Legislative Department — legislative.gov.in</li>
                  <li>[2] Wikipedia — Constitution of India</li>
                  <li>[3] PRS Legislative Research</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <article key={f.title} className="paper-card rounded-2xl p-5">
                <f.icon className="h-5 w-5 text-gold-500" />
                <h3 className="mt-3 font-display text-lg">{f.title}</h3>
                <p className="mt-1 text-sm text-ink-400">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-4 py-16">
          <p className="stamp text-burgundy-500">The desk</p>
          <h2 className="font-display mt-4 text-3xl md:text-4xl">A real research pipeline — not a loading animation</h2>
          <p className="mt-3 max-w-2xl text-ink-400">
            Folio searches the live web, ranks domains (government first), extracts text, cross-checks overlapping claims,
            then writes chapters with numbered citations that match the source list.
          </p>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ["01", "Topic analysis", "Language, audience, category, and whether the title is a copyrighted work."],
              ["02", "Search & rank", "Wikipedia, official docs, Crossref, PubMed, Open Library, and the open web."],
              ["03", "Outline first", "You see the structure and the sources before a single chapter is written."],
              ["04", "Chapter writing", "Each section is tied to retrieved notes. Thin evidence is labelled, not invented."],
              ["05", "Fact check", "Claims are compared again. Verified / Needs review / Unsupported stay visible."],
              ["06", "Publish", "Preview, edit, then download PDF, DOCX, or EPUB with Unicode fonts."],
            ].map(([n, t, b]) => (
              <li key={n} className="paper-card rounded-2xl p-5">
                <span className="font-display text-gold-500">{n}</span>
                <h3 className="mt-2 font-display text-xl">{t}</h3>
                <p className="mt-1 text-sm text-ink-400">{b}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="paper-card overflow-hidden rounded-3xl md:grid md:grid-cols-2">
            <div className="bg-ink-700 p-8 text-paper-100 md:p-12">
              <Quote className="h-8 w-8 text-gold-200" />
              <p className="font-display mt-4 text-2xl leading-snug">
                “If a fact cannot be tied to a source we retrieved, the book says so. That is the whole product.”
              </p>
              <p className="mt-6 text-sm text-paper-300">Folio editorial rule</p>
            </div>
            <div className="p-8 md:p-12">
              <h3 className="font-display text-2xl">Built for phones and long nights</h3>
              <p className="mt-3 text-ink-400">
                Large tap targets, a one-field start, progress you can leave and resume, and downloads that work on Android.
                Guest mode lets you try a title without creating an account.
              </p>
              <Link href="/ebooks/new" className="btn-gold mt-6">
                Create New Ebook <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
