"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EbookDocument, SourceRecord } from "@/lib/types";
import { buildBookPages } from "@/lib/book/pages";
import { Bookmark, List, Search, X } from "lucide-react";

type Theme = "light" | "dark" | "sepia";

function bookmarkKey(id: string) {
  return `folio:bookmarks:${id}`;
}

export function BookReader({ doc }: { doc: EbookDocument }) {
  const id = doc.ebookId || doc.id;
  const pages = useMemo(() => buildBookPages(doc), [doc]);
  const [mode, setMode] = useState<"page" | "scroll">("scroll");
  const [theme, setTheme] = useState<Theme>("light");
  const [font, setFont] = useState(18);
  const [gap, setGap] = useState(1.75);
  const [chIndex, setChIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [toc, setToc] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [source, setSource] = useState<SourceRecord | null>(null);
  const [bookmarks, setBookmarks] = useState<number[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(bookmarkKey(id));
      if (raw) setBookmarks(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [id]);

  function toggleBookmark() {
    const next = bookmarks.includes(chIndex) ? bookmarks.filter((b) => b !== chIndex) : [...bookmarks, chIndex];
    setBookmarks(next);
    try {
      localStorage.setItem(bookmarkKey(id), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const chapter = doc.chapters[chIndex];
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    return doc.chapters
      .map((c, i) => ({
        i,
        title: c.title,
        hit: `${c.title} ${c.sections.map((s) => s.html).join(" ")}`.toLowerCase().includes(needle),
      }))
      .filter((x) => x.hit);
  }, [q, doc.chapters]);

  const progress = doc.chapters.length ? Math.round(((chIndex + 1) / doc.chapters.length) * 100) : 0;

  function onContentClick(e: { target: EventTarget; preventDefault: () => void }) {
    const el = (e.target as HTMLElement).closest("sup.cite, .cite, a");
    if (!el) return;
    const text = el.textContent || "";
    const m = text.match(/(\d+)/);
    if (!m) return;
    const found = doc.sources.find((s) => s.id === Number(m[1]));
    if (found) {
      e.preventDefault();
      setSource(found);
    }
  }

  return (
    <div className={`reader-shell theme-${theme}`}>
      <header className="reader-bar">
        <Link href={`/ebooks/${id}`} className="btn-ghost !py-2 !px-3 text-xs min-h-[44px]">
          बंद करें
        </Link>
        <div className="flex flex-1 justify-center gap-1">
          <button className="icon-btn" onClick={() => setToc((v) => !v)} aria-label="Contents">
            <List className="h-4 w-4" />
          </button>
          <button className="icon-btn" onClick={() => setSearchOpen((v) => !v)} aria-label="Search">
            <Search className="h-4 w-4" />
          </button>
          <button className={`icon-btn ${bookmarks.includes(chIndex) ? "is-on" : ""}`} onClick={toggleBookmark} aria-label="Bookmark">
            <Bookmark className="h-4 w-4" />
          </button>
        </div>
        <button className="btn-ghost !py-2 !px-3 text-xs min-h-[44px]" onClick={() => setSource(doc.sources[0] || null)}>
          Sources
        </button>
      </header>

      <div className="h-1 bg-paper-300">
        <div className="h-full bg-ink-700 transition-all" style={{ width: `${progress}%` }} />
      </div>

      {toc && (
        <aside className="reader-drawer">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">विषय-सूची</h2>
            <button onClick={() => setToc(false)} aria-label="Close">
              <X />
            </button>
          </div>
          <ol className="mt-3 space-y-1 text-sm">
            {doc.chapters.map((c, i) => (
              <li key={c.id}>
                <button
                  className={`w-full rounded-lg px-2 py-2 text-left ${i === chIndex ? "bg-ink-700 text-paper-100" : ""}`}
                  onClick={() => {
                    setChIndex(i);
                    setPage(pages.findIndex((p) => p.chapterIndex === i));
                    setToc(false);
                  }}
                >
                  {i + 1}. {c.title}
                  {bookmarks.includes(i) ? " ★" : ""}
                </button>
              </li>
            ))}
          </ol>
        </aside>
      )}

      {searchOpen && (
        <div className="reader-drawer">
          <input className="field" autoFocus placeholder="किताब में खोजें…" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-3 space-y-1 text-sm">
            {hits.map((h) => (
              <li key={h.i}>
                <button
                  className="w-full rounded-lg px-2 py-2 text-left hover:bg-paper-200"
                  onClick={() => {
                    setChIndex(h.i);
                    setSearchOpen(false);
                  }}
                >
                  {h.i + 1}. {h.title}
                </button>
              </li>
            ))}
            {q.length >= 2 && !hits.length && <li className="text-ink-400">कुछ नहीं मिला।</li>}
          </ul>
        </div>
      )}

      <div className="reader-tools">
        <select className="field !py-1.5 !min-h-[40px] max-w-[46%]" value={chIndex} onChange={(e) => setChIndex(Number(e.target.value))}>
          {doc.chapters.map((c, i) => (
            <option key={c.id} value={i}>
              {i + 1}. {c.title}
            </option>
          ))}
        </select>
        <select className="field !py-1.5 !min-h-[40px]" value={mode} onChange={(e) => setMode(e.target.value as "page" | "scroll")}>
          <option value="scroll">Continuous</option>
          <option value="page">Page by page</option>
        </select>
        <button className="icon-btn" onClick={() => setFont((n) => Math.max(15, n - 1))}>
          A−
        </button>
        <button className="icon-btn" onClick={() => setFont((n) => Math.min(26, n + 1))}>
          A+
        </button>
        <button className="icon-btn" onClick={() => setGap((n) => (n > 1.9 ? 1.55 : n + 0.2))}>
          ↕
        </button>
        {(["light", "sepia", "dark"] as Theme[]).map((t) => (
          <button key={t} className={`icon-btn ${theme === t ? "is-on" : ""}`} onClick={() => setTheme(t)}>
            {t[0].toUpperCase()}
          </button>
        ))}
      </div>

      <main
        className="reader-page"
        style={{ fontSize: font, lineHeight: gap }}
        onClick={onContentClick}
      >
        {mode === "page" ? (
          <article className="prose-ebook">
            <h1>{pages[page]?.title}</h1>
            <div dangerouslySetInnerHTML={{ __html: pages[page]?.html || "" }} />
            <p className="mt-8 text-center text-xs opacity-60">
              पृष्ठ {page + 1} / {pages.length}
            </p>
          </article>
        ) : (
          chapter && (
            <article className="prose-ebook">
              <p className="text-xs uppercase tracking-[0.18em] text-gold-500">अध्याय {chIndex + 1}</p>
              <h1>{chapter.title}</h1>
              {chapter.sections.map((s) => (
                <section key={s.id}>
                  <h3>{s.heading}</h3>
                  <div dangerouslySetInnerHTML={{ __html: s.html }} />
                </section>
              ))}
              {chapter.keyPoints.length > 0 && (
                <section>
                  <h2>मुख्य बातें</h2>
                  <ul>
                    {chapter.keyPoints.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                </section>
              )}
              {chapter.summary && (
                <section>
                  <h2>सार</h2>
                  <p>{chapter.summary}</p>
                </section>
              )}
            </article>
          )
        )}
        {!doc.chapters.length && <p>अध्याय अभी तैयार नहीं हैं।</p>}
      </main>

      <div className="reader-nav">
        {mode === "page" ? (
          <>
            <button className="btn-ghost flex-1 min-h-[48px]" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              पिछला पृष्ठ
            </button>
            <input
              type="number"
              className="field !w-20 text-center"
              min={1}
              max={pages.length}
              value={page + 1}
              onChange={(e) => setPage(Math.max(0, Math.min(pages.length - 1, Number(e.target.value) - 1)))}
            />
            <button className="btn-ghost flex-1 min-h-[48px]" disabled={page >= pages.length - 1} onClick={() => setPage((p) => p + 1)}>
              अगला पृष्ठ
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost flex-1 min-h-[48px]" disabled={chIndex === 0} onClick={() => setChIndex((i) => i - 1)}>
              पिछला अध्याय
            </button>
            <button
              className="btn-ghost flex-1 min-h-[48px]"
              disabled={chIndex >= doc.chapters.length - 1}
              onClick={() => setChIndex((i) => i + 1)}
            >
              अगला अध्याय
            </button>
          </>
        )}
      </div>

      {source && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-ink-800/40 p-4 sm:place-items-center" onClick={() => setSource(null)}>
          <div className="paper-card max-h-[70vh] w-full max-w-md overflow-auto rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-xl">स्रोत [{source.id}]</h2>
              <button onClick={() => setSource(null)} aria-label="Close">
                <X />
              </button>
            </div>
            <p className="mt-3 font-semibold">{source.title}</p>
            <p className="mt-1 text-sm text-ink-400">
              {source.author || source.organization}
              {source.year || source.publishedAt ? ` · ${(source.year || source.publishedAt || "").toString().slice(0, 4)}` : ""}
            </p>
            {source.snippet && <p className="mt-3 text-sm">{source.snippet}</p>}
            {source.url && (
              <a className="mt-4 inline-block underline" href={source.url} target="_blank" rel="noreferrer">
                स्रोत खोलें
              </a>
            )}
            <div className="mt-4 max-h-40 space-y-2 overflow-auto text-xs text-ink-400">
              {doc.sources.slice(0, 12).map((s) => (
                <button key={s.id} className="block w-full text-left" onClick={() => setSource(s)}>
                  [{s.id}] {s.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
