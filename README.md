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
| `AI_PROVIDER` | Free-form vendor label (`openai`, `openrouter`, `groq`, `together`, …). Only the literal `anthropic` switches wire format; everything else is treated as OpenAI-compatible |
| `AI_API_KEY` | Server-only provider credential; generation is blocked when absent |
| `AI_BASE_URL` | Provider API **root** ending in `/v1` — not `/chat/completions` |
| `AI_MODEL` | The vendor's exact model ID |
| `SEARCH_API_KEY` / `SEARCH_PROVIDER` | Optional Tavily, Brave, or Serper |
| `MAX_UPLOAD_MB` | Syllabus upload limit |
| `RATE_LIMIT_PER_HOUR` | Generation cap per user/IP |

API keys never ship to the browser. `AI_BASE_URL` is the API root (for example, `https://api.openai.com/v1`), **not** the full `/chat/completions` URL. `AI_MODEL` must be the provider's exact model ID. No AI provider is enabled by default and Folio never falls back to a fake model.

#### Any OpenAI-compatible provider

Switching vendors is an environment change, never a code change. No provider is hard-coded or required:

| Vendor | `AI_BASE_URL` | Example `AI_MODEL` |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Together | `https://api.together.xyz/v1` | `Qwen/Qwen2.5-72B-Instruct-Turbo` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Self-hosted vLLM / Ollama gateway | your HTTPS `/v1` root | your served model ID |
| Anthropic | `https://api.anthropic.com/v1` (set `AI_PROVIDER=anthropic`) | `claude-3-5-sonnet-latest` |

`SEARCH_PROVIDER` / `SEARCH_API_KEY` are a completely separate concern: a search key never satisfies the AI configuration, and AI works with no search provider at all.

#### Behaviour when AI is not configured

Missing AI variables produce a loud, specific failure — never empty or half-written output:

- `POST /api/ebooks/:id/generate` → **HTTP 503** naming all four variables plus exactly which are missing.
- The generation runner and chapter writer call `assertAIConfigured()` **before** any writing begins, so no chapter, introduction, or placeholder text is ever persisted.
- Configuration errors are exempt from the friendly-error rewriter, so the operator sees the real cause instead of "temporarily unavailable, please retry".
- `GET /api/health` reports `ai: "not-configured"` and lists the missing variable names.

### Railway production configuration

The linked Railway service needs a persistent volume; repository configuration cannot create or attach one on your behalf. The service builds with the checked-in `Dockerfile` (see `railway.json`, builder `DOCKERFILE`), which declares no `ARG`/`ENV` for secrets — API keys are read from `process.env` at server runtime only and are never baked into the image.

1. Open Railway → project **surprising-miracle** → service **j7-fitness-3d-website**.
2. Open **Volumes**, create/attach a volume, and set its mount path to **`/app/data`**. Do not initialize or replace an existing volume: attach the existing one first so prior `folio.db` / `folio.json` data can be recovered.
3. Open the service's **Variables** tab and add:
   - `DATABASE_URL=file:/app/data/folio.db` (recommended). A relative value such as `file:./data/folio.db` also works: in production the app anchors relative `file:` URLs to the volume, so it resolves to `/app/data/folio.db`.
   - `AI_PROVIDER=openai` (any label; only `anthropic` changes the wire format)
   - `AI_API_KEY=<the real provider secret>` (runtime only — never `NEXT_PUBLIC_*`, never in the Dockerfile)
   - `AI_BASE_URL=https://api.openai.com/v1` (or another vendor's OpenAI-compatible `/v1` API root)
   - `AI_MODEL=gpt-4o-mini` (or the vendor's exact chat model ID)
   - `SEARCH_PROVIDER=auto` and optionally `SEARCH_API_KEY=<runtime secret>`. When `SEARCH_API_KEY` is missing, external web search is gracefully disabled and research falls back to the local corpus and keyless scholarly sources.
   - `NEXT_PUBLIC_APP_URL=https://<the Railway public domain>`
4. Redeploy. On container start, `node scripts/ensure-runtime-data.mjs` creates the data directories on the volume and seeds the local corpus on first boot (existing volume contents are never overwritten); the database is created lazily by the app on first request. `/api/health` returns HTTP 200 only when the database resolves to an absolute path under the volume mount (`/app/data`). It reports only configured/not-configured states, never credentials.
5. Run the persistence acceptance test against the public domain from a trusted terminal with a new dedicated test email: `TEST_BASE_URL=https://<domain> TEST_ACCOUNT_EMAIL=<new-test-email> TEST_ACCOUNT_PASSWORD=<strong-test-password> npm run test:persistence`. Keep those values and the printed ebook ID, restart or redeploy the Railway service, then verify that same record with `TEST_BASE_URL=… TEST_ACCOUNT_EMAIL=… TEST_ACCOUNT_PASSWORD=… TEST_EBOOK_ID=… npm run test:persistence:after-restart`. The operator must trigger the restart because Railway credentials are intentionally not stored in this repository. Do not put test credentials in CI logs.
6. With the four AI variables present, verify the provider for real. In Railway's service shell (the variables are already injected there):

   ```bash
   npm run test:ai:real                                        # one real provider request
   HEALTH_URL=https://<domain>/api/health npm run test:ai:real # + health cross-check
   ```

   From any machine, without needing the secret locally:

   ```bash
   HEALTH_URL=https://<domain>/api/health npm run test:ai:health
   ```

   These print only non-secret routing metadata (provider, model, endpoint origin, latency) and assert the key never appears in a response.

### Verifying AI configuration

| Command | Needs a real key? | What it proves |
| --- | --- | --- |
| `npm run test:ai:config` | No | Six different vendors work through env vars alone; no vendor required; SEARCH_* stays separate; each missing variable raises a clear 503; no hard-coded keys in source/Dockerfile/client code |
| `npm run test:ai:missing` | No | Full app e2e: unconfigured server returns 503 and writes **no** chapters/introduction; the same code becomes `healthy` once variables are set |
| `npm run test:ai` | No | Server-side adapter sends the configured model and the key only in the provider auth header |
| `npm run test:ai:real` | Yes (server-side) | One real request against the configured provider |
| `npm run test:ai:health` | No | Deployed `/api/health?probe=ai` reports `healthy` and leaks no credentials |

`GET /api/health` is cheap and safe for Railway's healthcheck (no provider call). `GET /api/health?probe=ai` performs one real minimal request and reports `ai: "healthy"` / `"unhealthy"` with latency.

Run one replica while using SQLite, because the mounted database is a single-writer application database.

### Existing-data recovery

Startup performs a non-destructive one-time import from `data/folio.json` when `folio.db` has no `app_state` record. It records the import in `migration_log` and does not delete the JSON source. Before attaching a new empty volume, inspect the existing Railway volume for `/app/data/folio.db`, SQLite `-wal`/`-shm` files, and `/app/data/folio.json`; copy all of them together while the old service is stopped. Browser storage contains only an unfinished create-form draft and reader bookmarks, not accounts or ebooks, so it cannot restore server account records. Those optional device-only preferences remain on the device and are not used as the primary database.

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
