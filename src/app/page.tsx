"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FloatingBook } from "@/components/FloatingBook";
import { ensureSession } from "@/lib/client";
import { readLastBook, type LastBook } from "@/lib/simple-flow";

const EXAMPLES = [
  "अछूत कौन थे और अस्पृश्यता कैसे बनी?",
  "भारतीय संविधान",
  "History of India",
  "Python for Beginners",
  "Class 10 Science",
  "Machine Learning",
];

export default function HomePage() {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastBook | null>(null);
  const router = useRouter();

  useEffect(() => {
    setLast(readLastBook());
  }, []);

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
        {last && last.status !== "complete" && (
          <div className="mx-auto max-w-3xl px-4 pt-6">
            <Link href={`/ebooks/${last.id}`} className="paper-card flex items-center justify-between gap-3 rounded-2xl p-4">
              <span>
                <span className="block text-xs uppercase tracking-[0.16em] text-gold-500">Continue your book</span>
                <span className="mt-1 block font-display text-lg">{last.title}</span>
              </span>
              <span className="btn-gold !py-2">जारी रखें</span>
            </Link>
          </div>
        )}

        <section className="mx-auto max-w-3xl px-4 pb-16 pt-10 text-center md:pt-16">
          <p className="stamp text-gold-500">एक विषय · एक क्लिक</p>
          <h1 className="font-display font-devanagari mt-6 text-4xl leading-[1.15] tracking-tight sm:text-5xl">
            अपनी किताब बनाइए — बस विषय लिखिए
          </h1>
          <p className="font-devanagari mx-auto mt-5 max-w-xl text-lg text-ink-400">
            AI आपके लिए रिसर्च, अध्याय, लेखन, संदर्भ, चित्र और 3D Book Preview तैयार करेगा।
          </p>

          <div className="mt-10 flex justify-center">
            <FloatingBook title={topic || "आपकी किताब"} subtitle="Folio Press" />
          </div>

          <form onSubmit={go} className="paper-card mx-auto mt-10 rounded-2xl p-3 text-left shadow-soft">
            <label htmlFor="topic" className="font-devanagari block px-3 pt-2 text-sm text-ink-400">
              आप किस विषय पर किताब बनाना चाहते हैं?
            </label>
            <input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="जैसे: अछूत कौन थे और अस्पृश्यता कैसे बनी?"
              className="font-devanagari mt-2 min-h-[56px] w-full rounded-xl border-0 bg-transparent px-3 text-lg outline-none placeholder:text-ink-300"
              autoComplete="off"
            />
            <button type="submit" disabled={busy || topic.trim().length < 3} className="btn-gold mt-3 w-full min-h-[52px] text-base">
              ✨ किताब बनाना शुरू करें
            </button>
          </form>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setTopic(ex)}
                className="rounded-full border border-paper-400 bg-paper-50/70 px-3 py-2 text-xs text-ink-400 hover:border-gold-300 hover:text-ink-700"
              >
                {ex}
              </button>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-4xl px-4 pb-20">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["1", "विषय लिखें", "एक वाक्य काफी है।"],
              ["2", "AI शोध करे", "स्रोत, अध्याय, चित्र — अपने आप।"],
              ["3", "पढ़ें और डाउनलोड करें", "PDF, EPUB, DOCX, 3D पुस्तक।"],
            ].map(([n, t, b]) => (
              <article key={n} className="paper-card rounded-2xl p-5 text-left">
                <span className="font-display text-gold-500">{n}</span>
                <h2 className="font-display mt-2 text-xl">{t}</h2>
                <p className="mt-1 text-sm text-ink-400">{b}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <div className="sticky-action md:hidden">
        <button
          type="button"
          className="btn-gold w-full min-h-[52px]"
          disabled={busy || topic.trim().length < 3}
          onClick={() => go()}
        >
          ✨ किताब बनाएं
        </button>
      </div>
      <Footer />
    </>
  );
}
