import { nanoid } from "nanoid";
import { getStore, persist, nowIso } from "./db";
import type { Chapter, EbookDocument, EbookSettings, GenerationJob, OutlineItem, SourceRecord } from "./types";

export function createEbook(userId: string, settings: EbookSettings): EbookDocument {
  const id = nanoid(14);
  const now = nowIso();
  const title = settings.title?.trim() || settings.topic.trim();
  const doc: EbookDocument = {
    id,
    userId,
    title,
    subtitle: settings.subtitle || "",
    language: settings.language,
    type: settings.type,
    audience: settings.audience,
    difficulty: settings.difficulty,
    status: "draft",
    settings,
    outline: [],
    introduction: "",
    conclusion: "",
    chapters: [],
    glossary: [],
    faqs: [],
    sources: [],
    facts: [],
    cover: { style: settings.coverStyle, svg: "" },
    wordCount: 0,
    chapterCount: 0,
    progress: { step: "draft", percent: 0, message: "Draft created" },
    createdAt: now,
    updatedAt: now,
  };
  getStore().ebooks.push(serialize(doc));
  persist();
  return doc;
}

export function listEbooks(userId: string): EbookDocument[] {
  return getStore()
    .ebooks.filter((e) => e.userId === userId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((e) => hydrate(e, false));
}

export function getEbook(id: string, userId?: string): EbookDocument | null {
  const row = getStore().ebooks.find((e) => e.id === id && (!userId || e.userId === userId));
  if (!row) return null;
  return hydrate(row, true);
}

export function updateEbook(id: string, patch: Partial<EbookDocument>) {
  const store = getStore();
  const idx = store.ebooks.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const current = hydrate(store.ebooks[idx], true);
  const next: EbookDocument = {
    ...current,
    ...patch,
    settings: patch.settings || current.settings,
    updatedAt: nowIso(),
  };
  store.ebooks[idx] = serialize(next);
  if (patch.chapters) saveChapters(id, patch.chapters);
  if (patch.sources) replaceSources(id, patch.sources);
  persist();
  return getEbook(id);
}

export function saveChapters(ebookId: string, chapters: Chapter[]) {
  const store = getStore();
  store.chapters = store.chapters.filter((c) => c.ebookId !== ebookId);
  for (const ch of chapters) {
    store.chapters.push({
      id: ch.id,
      ebookId,
      idx: ch.index,
      title: ch.title,
      data: ch,
      status: ch.status,
      wordCount: ch.wordCount,
      updatedAt: nowIso(),
    });
  }
  persist();
}

export function saveChapter(ebookId: string, ch: Chapter) {
  const store = getStore();
  const i = store.chapters.findIndex((c) => c.ebookId === ebookId && c.idx === ch.index);
  const row = {
    id: ch.id,
    ebookId,
    idx: ch.index,
    title: ch.title,
    data: ch,
    status: ch.status,
    wordCount: ch.wordCount,
    updatedAt: nowIso(),
  };
  if (i >= 0) store.chapters[i] = row;
  else store.chapters.push(row);
  persist();
}

export function deleteEbook(id: string, userId: string) {
  const store = getStore();
  const before = store.ebooks.length;
  store.ebooks = store.ebooks.filter((e) => !(e.id === id && e.userId === userId));
  if (store.ebooks.length === before) return false;
  store.chapters = store.chapters.filter((c) => c.ebookId !== id);
  store.sources = store.sources.filter((s) => s.ebookId !== id);
  store.jobs = store.jobs.filter((j) => j.ebookId !== id);
  store.research = store.research.filter((r) => r.ebookId !== id);
  store.downloads = store.downloads.filter((d) => d.ebookId !== id);
  persist();
  return true;
}

export function createJob(ebookId: string, userId: string): GenerationJob {
  const job: GenerationJob = {
    id: nanoid(12),
    ebookId,
    userId,
    status: "queued",
    step: "queued",
    percent: 0,
    message: "Queued",
    lastChapterIndex: -1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getStore().jobs.push(job);
  persist();
  return job;
}

export function updateJob(id: string, patch: Partial<GenerationJob>) {
  const store = getStore();
  const job = store.jobs.find((j) => j.id === id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: nowIso() });
  persist();
}

export function getLatestJob(ebookId: string): GenerationJob | null {
  const jobs = getStore()
    .jobs.filter((j) => j.ebookId === ebookId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return (jobs[0] as GenerationJob) || null;
}

export function recordDownload(ebookId: string, userId: string, format: string, filePath: string) {
  getStore().downloads.push({
    id: nanoid(12),
    ebookId,
    userId,
    format,
    path: filePath,
    createdAt: nowIso(),
  });
  persist();
}

export function replaceSources(ebookId: string, sources: SourceRecord[]) {
  const store = getStore();
  store.sources = store.sources.filter((s) => s.ebookId !== ebookId);
  for (const s of sources) {
    store.sources.push({ ...s, ebookId });
  }
  persist();
}

export function addSourceRow(ebookId: string, source: SourceRecord) {
  getStore().sources.push({ ...source, ebookId });
  persist();
}

export function addResearch(ebookId: string, query: string, provider: string, results: unknown) {
  getStore().research.push({
    id: nanoid(12),
    ebookId,
    query,
    provider,
    results,
    createdAt: nowIso(),
  });
  persist();
}

function serialize(doc: EbookDocument) {
  const { chapters, sources, ...rest } = doc;
  return rest;
}

function hydrate(row: any, withChildren: boolean): EbookDocument {
  const store = getStore();
  const chapters = withChildren
    ? store.chapters
        .filter((c) => c.ebookId === row.id)
        .sort((a, b) => a.idx - b.idx)
        .map((c) => c.data as Chapter)
    : [];
  const sources = withChildren
    ? (store.sources.filter((s) => s.ebookId === row.id) as SourceRecord[]).sort(
        (a, b) =>
          (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) ||
          (b.authorityScore ?? 0) - (a.authorityScore ?? 0) ||
          a.tier - b.tier ||
          b.score - a.score
      )
    : [];
  return {
    ...row,
    outline: row.outline || [],
    glossary: row.glossary || [],
    faqs: row.faqs || [],
    facts: row.facts || [],
    chapters,
    sources,
    cover: row.cover || { style: "Academic", svg: "" },
    progress: row.progress || { step: "draft", percent: 0, message: "" },
  } as EbookDocument;
}

export function clientEbook(doc: EbookDocument) {
  return {
    ...doc,
    sources: doc.sources.map((s) => ({
      id: s.id,
      title: s.title,
      organization: s.organization,
      url: s.url,
      domain: s.domain,
      snippet: s.snippet,
      retrievedAt: s.retrievedAt,
      publishedAt: s.publishedAt,
      tier: s.tier,
      license: s.license,
      score: s.score,
      used: s.used,
      language: s.language,
      relevanceScore: s.relevanceScore,
      authorityScore: s.authorityScore,
      primarySource: s.primarySource,
      academicSource: s.academicSource,
      reasonForInclusion: s.reasonForInclusion,
    })),
    rejectedSources: doc.rejectedSources || [],
    researchQuality: doc.researchQuality,
    facts: doc.facts,
  };
}
