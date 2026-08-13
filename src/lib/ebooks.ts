import { nanoid } from "nanoid";
import { getStore, persist, nowIso } from "./db";
import { normalizeOutputLanguage } from "./language";
import type {
  Chapter,
  EbookDocument,
  EbookSettings,
  GenerationJob,
  OperationRecord,
  OutlineItem,
  SourceRecord,
} from "./types";

export function ebookIdOf(doc: { id?: string; ebookId?: string } | null | undefined): string {
  return String(doc?.ebookId || doc?.id || "");
}

function normalizeSettings(settings: EbookSettings): EbookSettings {
  const language = settings.language === "auto" ? "auto" : normalizeOutputLanguage(settings.language);
  const outputLanguage =
    settings.outputLanguage && settings.outputLanguage !== "auto"
      ? normalizeOutputLanguage(settings.outputLanguage)
      : language;
  const customTitle = settings.customTitle?.trim() || settings.title?.trim() || "";
  return {
    ...settings,
    language,
    outputLanguage,
    title: customTitle || settings.title,
    customTitle: customTitle || undefined,
    researchQuestions: settings.researchQuestions || [],
  };
}

export function createEbook(userId: string, settings: EbookSettings): EbookDocument {
  const id = nanoid(14);
  const now = nowIso();
  const normalized = normalizeSettings(settings);
  const title = normalized.customTitle?.trim() || normalized.title?.trim() || normalized.topic.trim();
  const outputLanguage = normalized.language === "auto" ? "auto" : normalized.outputLanguage || normalized.language;
  const doc: EbookDocument = {
    id,
    ebookId: id,
    userId,
    title,
    customTitle: normalized.customTitle,
    subtitle: normalized.subtitle || "",
    language: outputLanguage,
    outputLanguage,
    type: normalized.type,
    audience: normalized.audience,
    difficulty: normalized.difficulty,
    status: "draft",
    settings: normalized,
    researchQuestions: normalized.researchQuestions || [],
    outline: [],
    introduction: "",
    conclusion: "",
    chapters: [],
    glossary: [],
    faqs: [],
    sources: [],
    facts: [],
    cover: { style: normalized.coverStyle, svg: "" },
    wordCount: 0,
    chapterCount: 0,
    lastCompletedStage: "draft",
    progress: { step: "draft", percent: 0, message: "Draft created" },
    createdAt: now,
    updatedAt: now,
  };
  getStore().ebooks.push(serialize(doc));
  persist();
  return doc;
}

export function findRecentDuplicateDraft(userId: string, topic: string, windowMs = 8000): EbookDocument | null {
  const t = topic.trim().toLowerCase();
  if (!t) return null;
  const cutoff = Date.now() - windowMs;
  const row = getStore()
    .ebooks.filter((e) => e.userId === userId && e.status === "draft")
    .find((e) => {
      const sameTopic = String(e.settings?.topic || e.title || "").trim().toLowerCase() === t;
      const created = Date.parse(e.createdAt || "") || 0;
      return sameTopic && created >= cutoff;
    });
  return row ? hydrate(row, true) : null;
}

export function listEbooks(
  userId: string,
  opts: { q?: string; language?: string; status?: string; sort?: string } = {}
): EbookDocument[] {
  let items = getStore()
    .ebooks.filter((e) => e.userId === userId)
    .map((e) => hydrate(e, false));

  const q = opts.q?.trim().toLowerCase();
  if (q) {
    items = items.filter((e) =>
      `${e.title} ${e.subtitle} ${e.settings?.topic || ""} ${e.type} ${e.language}`.toLowerCase().includes(q)
    );
  }
  if (opts.language && opts.language !== "all") {
    items = items.filter((e) => e.language === opts.language || e.outputLanguage === opts.language);
  }
  if (opts.status && opts.status !== "all") {
    items = items.filter((e) => e.status === opts.status || displayBucket(e.status) === opts.status);
  }

  const sort = opts.sort || "updated";
  items.sort((a, b) => {
    if (sort === "newest") return String(b.createdAt).localeCompare(String(a.createdAt));
    if (sort === "words") return (b.wordCount || 0) - (a.wordCount || 0);
    if (sort === "title") return a.title.localeCompare(b.title);
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  return items;
}

function displayBucket(status: string) {
  if (status === "draft" || status === "paused") return "draft";
  if (status === "analyzing" || status === "researching") return "researching";
  if (status === "outlining" || status === "awaiting_outline") return "outline";
  if (status === "writing" || status === "fact_checking" || status === "exporting") return "writing";
  if (status === "complete") return "complete";
  if (status === "failed") return "failed";
  return status;
}

export function getEbook(id: string, userId?: string): EbookDocument | null {
  const row = getStore().ebooks.find(
    (e) => (e.id === id || e.ebookId === id) && (!userId || e.userId === userId)
  );
  if (!row) return null;
  return hydrate(row, true);
}

export function updateEbook(id: string, patch: Partial<EbookDocument>) {
  const store = getStore();
  const idx = store.ebooks.findIndex((e) => e.id === id || e.ebookId === id);
  if (idx < 0) return null;
  const current = hydrate(store.ebooks[idx], true);
  const nextSettings = patch.settings ? { ...current.settings, ...patch.settings } : current.settings;
  const next: EbookDocument = {
    ...current,
    ...patch,
    id: current.id,
    ebookId: current.ebookId || current.id,
    settings: nextSettings,
    updatedAt: nowIso(),
  };
  if (patch.language) next.outputLanguage = patch.outputLanguage || patch.language;
  if (patch.settings?.language && patch.settings.language !== "auto") {
    next.language = normalizeOutputLanguage(patch.settings.language);
    next.outputLanguage = next.language;
  }
  store.ebooks[idx] = serialize(next);
  if (patch.chapters) saveChapters(current.id, patch.chapters);
  if (patch.sources) replaceSources(current.id, patch.sources);
  persist();
  return getEbook(current.id);
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
  store.ebooks = store.ebooks.filter((e) => !((e.id === id || e.ebookId === id) && e.userId === userId));
  if (store.ebooks.length === before) return false;
  store.chapters = store.chapters.filter((c) => c.ebookId !== id);
  store.sources = store.sources.filter((s) => s.ebookId !== id);
  store.jobs = store.jobs.filter((j) => j.ebookId !== id);
  store.research = store.research.filter((r) => r.ebookId !== id);
  store.downloads = store.downloads.filter((d) => d.ebookId !== id);
  store.operations = (store.operations || []).filter((o) => o.ebookId !== id);
  persist();
  return true;
}

export function createJob(
  ebookId: string,
  userId: string,
  kind: GenerationJob["kind"] = "generate",
  idempotencyKey?: string
): GenerationJob {
  const job: GenerationJob = {
    id: nanoid(12),
    ebookId,
    userId,
    kind,
    status: "queued",
    step: "queued",
    percent: 0,
    message: "Queued",
    lastChapterIndex: -1,
    requestId: nanoid(10),
    idempotencyKey,
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

export function getLatestJob(ebookId: string, kind?: string): GenerationJob | null {
  const jobs = getStore()
    .jobs.filter((j) => j.ebookId === ebookId && (!kind || j.kind === kind || !j.kind))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return (jobs[0] as GenerationJob) || null;
}

export function getActiveJob(ebookId: string, kind?: string): GenerationJob | null {
  const jobs = getStore()
    .jobs.filter(
      (j) =>
        j.ebookId === ebookId &&
        j.status === "running" &&
        (!kind || j.kind === kind || !j.kind)
    )
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  return (jobs[0] as GenerationJob) || null;
}

export function findOperation(userId: string, idempotencyKey: string): OperationRecord | null {
  if (!idempotencyKey) return null;
  const store = getStore();
  store.operations = store.operations || [];
  return (
    (store.operations.find((o) => o.userId === userId && o.idempotencyKey === idempotencyKey) as OperationRecord) ||
    null
  );
}

export function recordOperation(op: OperationRecord) {
  const store = getStore();
  store.operations = store.operations || [];
  const i = store.operations.findIndex((o) => o.id === op.id || (o.idempotencyKey && o.idempotencyKey === op.idempotencyKey));
  if (i >= 0) store.operations[i] = { ...store.operations[i], ...op, updatedAt: nowIso() };
  else store.operations.push(op);
  persist();
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
  return { ...rest, ebookId: rest.ebookId || rest.id };
}

function hydrate(row: any, withChildren: boolean): EbookDocument {
  const store = getStore();
  const id = row.id || row.ebookId;
  const chapters = withChildren
    ? store.chapters
        .filter((c) => c.ebookId === id)
        .sort((a, b) => a.idx - b.idx)
        .map((c) => c.data as Chapter)
    : [];
  const sources = withChildren
    ? (store.sources.filter((s) => s.ebookId === id) as SourceRecord[]).sort(
        (a, b) =>
          (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) ||
          (b.authorityScore ?? 0) - (a.authorityScore ?? 0) ||
          a.tier - b.tier ||
          b.score - a.score
      )
    : [];
  const language = row.outputLanguage || row.language || row.settings?.language || "en";
  return {
    ...row,
    id,
    ebookId: row.ebookId || id,
    language,
    outputLanguage: row.outputLanguage || language,
    customTitle: row.customTitle || row.settings?.customTitle || row.settings?.title,
    researchQuestions: row.researchQuestions || row.analysis?.researchQuestions || row.settings?.researchQuestions || [],
    outline: (row.outline || []).map((o: OutlineItem) => ({
      ...o,
      sourceIds: o.sourceIds || [],
    })),
    glossary: row.glossary || [],
    faqs: row.faqs || [],
    facts: row.facts || [],
    rejectedSources: row.rejectedSources || [],
    chapters,
    sources,
    cover: row.cover || { style: "Academic", svg: "" },
    lastCompletedStage: row.lastCompletedStage || inferStage(row.status),
    progress: row.progress || { step: "draft", percent: 0, message: "" },
  } as EbookDocument;
}

function inferStage(status: string): EbookDocument["lastCompletedStage"] {
  if (status === "complete") return "complete";
  if (status === "awaiting_outline" || status === "outlining") return "outline";
  if (status === "researching" || status === "analyzing") return "research";
  if (status === "writing" || status === "fact_checking") return "writing";
  return "draft";
}

export function clientEbook(doc: EbookDocument) {
  const ebookId = ebookIdOf(doc);
  return {
    ...doc,
    id: ebookId,
    ebookId,
    outputLanguage: doc.outputLanguage || doc.language,
    customTitle: doc.customTitle || doc.settings?.customTitle || doc.settings?.title,
    researchQuestions: doc.researchQuestions || doc.analysis?.researchQuestions || [],
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
