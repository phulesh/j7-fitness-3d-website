# Folio — research-based ebook generator

Turn any topic, syllabus, or course into a cited ebook. Folio searches the live web, ranks sources (government and official first), extracts facts, builds an outline you can edit, then writes chapters with numbered references. Download PDF, DOCX, or EPUB. Hindi, English, and 20+ languages with Unicode fonts.

This is not a mock. The source list is the set of URLs the server actually retrieved.

## Pipeline

Simple Mode asks only for a topic/title, language, author, chapter count, length, optional subtitle, and optional source material. One click runs the complete resumable pipeline:

Understanding topic → research → source verification → topic-locked outline → chapter writing → fact check → validated figures → page design → interactive 3D book → PDF → EPUB → offline HTML/ZIP → final QA → Ready.

The final QA builds and inspects the real downloadable files before marking a volume Ready. It validates Unicode, citations, chapter content, image MIME/dimensions, captions, page navigation, embedded fonts, local offline paths, touch controls, and broken assets. Missing visual assets are repaired with useful generated diagrams rather than empty placeholders.

Unrelated hits (generic biography dumps, entertainment homonyms, off-topic arXiv physics papers, etc.) are rejected before they can become chapters or citations. Writing is blocked if research remains contaminated.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind + Three.js 3D reader
- SQLite database (`DATABASE_URL`) with normalized users, server sessions, and owned ebook records
- Opaque revocable httpOnly sessions, bcrypt cost-12 passwords, guest mode
- Node.js 22+ (uses the built-in `node:sqlite` driver)
- Research: Wikipedia / Wikibooks, DuckDuckGo, Crossref, arXiv, Open Library, PubMed, Wikimedia Commons
- Optional: `AI_API_KEY` (OpenAI-compatible or Anthropic) and `SEARCH_API_KEY` (Tavily / Brave / Serper)
- Exports: PDFKit + Go Noto fonts, `docx`, EPUB 3 via JSZip

## Setup

```bash
npm install
bash scripts/download-fonts.sh
cp .env.example .env   # set the server-only database and AI environment variables
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite `file:` URL on persistent production storage |
| `AI_PROVIDER` | `openai-compatible`, `openai`, or `anthropic` |
| `AI_API_KEY` | Server-only provider credential; generation is blocked when absent |
| `AI_BASE_URL` / `AI_MODEL` | Configurable provider endpoint and model |
| `SEARCH_API_KEY` / `SEARCH_PROVIDER` | Optional Tavily, Brave, or Serper |
| `MAX_UPLOAD_MB` | Syllabus upload limit |
| `RATE_LIMIT_PER_HOUR` | Generation cap per user/IP |

API keys never ship to the browser.

Public research connectors can still collect evidence without a paid search key. Ebook generation, however, requires the server-side AI configuration and returns a visible 503 configuration error rather than publishing fallback or empty content. Retrieved encyclopaedia extracts (CC BY-SA) are kept in `data/corpus`; the reference list is always the set of URLs actually collected for that title.

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
- `npm run test:3d` — offline ZIP, local figures, font embedding, and page-turn reader checks
- `npm run test:complete` — full 14-chapter Hindi acceptance flow through PDF/EPUB/DOCX/3D HTML/ZIP and final QA

Workflow routes: `/ebooks`, `/ebooks/new`, `/ebooks/:ebookId/edit`, `/ebooks/:ebookId/research`, `/ebooks/:ebookId/outline`, `/ebooks/:ebookId/read`, `/ebooks/:ebookId/3d`. Create happens only on **Create New Ebook**; every later step updates that `ebookId`.
