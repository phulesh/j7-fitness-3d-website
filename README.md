# Folio — research-based ebook generator

Turn any topic into a cited ebook in one click. Enter a subject — Folio researches reliable sources, writes chapters, builds a cover, and opens a 3D book preview. Download PDF, DOCX, EPUB, Markdown, or TXT. Hindi, English, Hinglish, and 20+ languages.

The default experience is beginner-friendly: topic → a few simple choices → full book. Advanced research, sources, and outline tools remain available in Advanced Mode. Existing ebooks are kept.

This is not a mock. The source list is the set of URLs the server actually retrieved.

## Pipeline

User topic → topic analysis → focused search queries → web research → snippet/content inspection → relevance filter (≥70) → authority scoring → fact extraction → cross-check → topic-locked outline → chapter writing → citations → fact/quality review → PDF / DOCX / EPUB.

Unrelated hits (generic biography dumps, entertainment homonyms, off-topic arXiv physics papers, etc.) are rejected before they can become chapters or citations. Writing is blocked if research remains contaminated.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind + Three.js 3D reader
- JSON document store (`data/folio.json`) for users, ebooks, chapters, sources, jobs, downloads
- httpOnly JWT sessions, bcrypt passwords, guest mode
- Research: Wikipedia / Wikibooks, DuckDuckGo, Crossref, arXiv, Open Library, PubMed, Wikimedia Commons
- Optional: `AI_API_KEY` (OpenAI-compatible or Anthropic) and `SEARCH_API_KEY` (Tavily / Brave / Serper)
- Exports: PDFKit + Go Noto fonts, `docx`, EPUB 3 via JSZip

## Setup

```bash
npm install
bash scripts/download-fonts.sh
cp .env.example .env   # set AUTH_SECRET
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Signs session cookies (required in production) |
| `AI_API_KEY` | Optional LLM for higher-quality prose from research notes |
| `AI_API_BASE` / `AI_MODEL` | OpenAI-compatible endpoint |
| `SEARCH_API_KEY` / `SEARCH_PROVIDER` | Optional Tavily, Brave, or Serper |
| `DATABASE_URL` | SQLite path (`file:./data/folio.db`) |
| `MAX_UPLOAD_MB` | Syllabus upload limit |
| `RATE_LIMIT_PER_HOUR` | Generation cap per user/IP |

API keys never ship to the browser.

Without paid keys, Folio still researches via Wikipedia, scholarly APIs, library catalogs, DuckDuckGo, and GitHub. Retrieved encyclopaedia extracts (CC BY-SA) are kept in `data/corpus` so generation still works on hosts that cannot reach Wikipedia. The reference list is always the set of URLs actually collected for that title.

## Product notes

- **Syllabus mode** — upload PDF/DOCX/TXT or paste units. Folio does not invent a curriculum.
- **Copyright** — a book title produces an original study guide, not a reproduction.
- **Fact check** — claims are re-searched and flagged Verified / Needs review / Unsupported. Corrections are never applied silently.
- **Resume** — chapter jobs persist; a failed run continues from the last finished chapter.
- **Medical / legal / financial** — domain disclaimers and official-source priority.

## Scripts

- `npm run dev` — development server on `0.0.0.0:3000`
- `npm run build` && `npm start` — production
- `npm run test:upgrade` — ebookId uniqueness and Hindi output checks

Workflow routes: `/ebooks`, `/ebooks/new`, `/ebooks/:ebookId/edit`, `/ebooks/:ebookId/research`, `/ebooks/:ebookId/outline`, `/ebooks/:ebookId/read`, `/ebooks/:ebookId/3d`. Create happens only on **Create New Ebook**; every later step updates that `ebookId`.
