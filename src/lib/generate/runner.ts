import path from "path";
import { analyzeTopic, detectVagueness } from "./analyze";
import { buildOutlineFromResearch, runResearch } from "../research/pipeline";
import { writeChapter, writeFrontMatter, countWords, flagsFromFacts, maybeChapterImages, chapterPlain } from "./write";
import { coverSvg, renderCoverPng } from "./cover";
import { getEbook, updateEbook, saveChapter, updateJob } from "../ebooks";
import type { Chapter, EbookDocument, OutlineItem } from "../types";

const running = new Map<string, Promise<void>>();

export function startGeneration(ebookId: string, jobId: string, opts: { resume?: boolean; skipOutlineWait?: boolean } = {}) {
  if (running.has(ebookId)) return;
  const p = generateEbook(ebookId, jobId, opts)
    .catch((err) => {
      console.error("Generation failed", err);
      updateEbook(ebookId, {
        status: "failed",
        error: err instanceof Error ? err.message : "Generation interrupted.",
        progress: {
          step: "failed",
          percent: 0,
          message: "Generation interrupted. Resume generation.",
          detail: String(err),
        },
      });
      updateJob(jobId, {
        status: "failed",
        error: err instanceof Error ? err.message : "failed",
        message: "Generation interrupted. Resume generation.",
      });
    })
    .finally(() => running.delete(ebookId));
  running.set(ebookId, p);
}

export function isRunning(ebookId: string) {
  return running.has(ebookId);
}

async function generateEbook(ebookId: string, jobId: string, opts: { resume?: boolean; skipOutlineWait?: boolean }) {
  const doc = getEbook(ebookId);
  if (!doc) throw new Error("Ebook not found");

  const progress = (step: string, percent: number, message: string, status: EbookDocument["status"], detail?: string) => {
    updateEbook(ebookId, { status, error: undefined, progress: { step, percent, message, detail } });
    updateJob(jobId, { status: "running", step, percent, message });
  };

  // If resuming and chapters exist, jump to writing remaining
  if (opts.resume && doc.outline.length && doc.chapters.some((c) => c.status === "complete")) {
    await writeRemaining(doc, jobId);
    return;
  }

  progress("analyzing", 4, "Researching topic...", "analyzing", "Detecting language, category, and source strategy");

  const vague = detectVagueness(doc.settings.topic);
  if (vague) {
    updateEbook(ebookId, {
      status: "failed",
      error: vague,
      progress: { step: "failed", percent: 0, message: vague },
    });
    updateJob(jobId, { status: "failed", message: vague, error: vague });
    return;
  }

  const analysis = await analyzeTopic(doc.settings);
  updateEbook(ebookId, {
    analysis,
    title: analysis.normalizedTitle,
    subtitle: analysis.subtitle,
    language: analysis.outputLanguage,
    settings: { ...doc.settings, language: analysis.outputLanguage },
  });

  progress("researching", 12, "Finding reliable sources...", "researching", analysis.searchQueries.slice(0, 3).join(" · "));

  const bundle = await runResearch(ebookId, analysis, doc.settings, (msg) => {
    progress("researching", 20, "Finding reliable sources...", "researching", msg);
  });

  if (bundle.insufficient) {
    const msg = bundle.message || "Not enough reliable information was found to create a factual ebook.";
    updateEbook(ebookId, {
      status: "failed",
      error: msg,
      sources: bundle.sources,
      progress: { step: "failed", percent: 0, message: msg },
    });
    updateJob(jobId, { status: "failed", message: msg, error: msg });
    return;
  }

  progress("outlining", 38, "Creating ebook structure...", "outlining");

  const syllabus = doc.syllabus?.detected ? doc.syllabus : bundle.syllabusFromWeb;
  const outline = doc.outline.length
    ? doc.outline
    : buildOutlineFromResearch(doc.settings, analysis, bundle, syllabus);

  const cover = coverSvg({
    title: analysis.normalizedTitle,
    subtitle: analysis.subtitle,
    author: doc.settings.includeAuthor ? doc.settings.authorName || "Folio Research" : "",
    style: doc.settings.coverStyle,
    language: analysis.outputLanguage,
    category: analysis.category,
  });
  let pngPath: string | undefined;
  try {
    pngPath = await renderCoverPng(cover, path.join(process.cwd(), "data", "covers", `${ebookId}.png`));
  } catch (e) {
    console.error("cover png", e);
  }

  updateEbook(ebookId, {
    outline,
    syllabus,
    analysis,
    cover: { style: doc.settings.coverStyle, svg: cover, pngPath },
    sources: bundle.sources,
    facts: bundle.facts,
    title: analysis.normalizedTitle,
    subtitle: analysis.subtitle,
    language: analysis.outputLanguage,
    chapterCount: outline.length,
    status: opts.skipOutlineWait ? "writing" : "awaiting_outline",
    progress: {
      step: opts.skipOutlineWait ? "writing" : "awaiting_outline",
      percent: 45,
      message: opts.skipOutlineWait ? "Writing chapters..." : "Outline ready — review structure",
      detail: `${bundle.sources.length} sources · ${outline.length} chapters`,
    },
  });
  updateJob(jobId, {
    status: opts.skipOutlineWait ? "running" : "paused",
    step: opts.skipOutlineWait ? "writing" : "awaiting_outline",
    percent: 45,
    message: "Outline ready",
  });

  if (!opts.skipOutlineWait) return;

  const fresh = getEbook(ebookId);
  if (!fresh) return;
  await writeChapters(fresh, jobId, bundle);
}

export async function continueFromOutline(ebookId: string, jobId: string) {
  const doc = getEbook(ebookId);
  if (!doc || !doc.analysis) throw new Error("Research the topic first.");
  updateJob(jobId, { status: "running", step: "writing", percent: 48, message: "Writing chapters..." });
  updateEbook(ebookId, { status: "writing", progress: { step: "writing", percent: 48, message: "Writing chapters..." } });

  const bundle = {
    sources: doc.sources,
    facts: doc.facts || [],
    wikiPages: [] as never[],
    images: [] as never[],
    insufficient: false,
  };
  // Re-run lightweight research if we don't have extracts
  const hasExtracts = doc.sources.some((s) => (s.extractedText || "").length > 200);
  if (!hasExtracts || !doc.sources.length) {
    const full = await runResearch(ebookId, doc.analysis, doc.settings);
    await writeChapters({ ...doc, sources: full.sources, facts: full.facts }, jobId, full);
    return;
  }
  await writeChapters(doc, jobId, {
    ...bundle,
    wikiPages: [],
    images: [],
    insufficient: false,
  } as any);
}

async function writeRemaining(doc: EbookDocument, jobId: string) {
  const start = Math.max(0, ...doc.chapters.filter((c) => c.status === "complete").map((c) => c.index + 1));
  updateEbook(doc.id, { status: "writing", progress: { step: "writing", percent: 50, message: "Resuming from last completed chapter..." } });
  const bundle = {
    sources: doc.sources,
    facts: doc.facts || [],
    wikiPages: [] as never[],
    images: [] as never[],
    insufficient: false,
  } as any;
  await writeChapters(doc, jobId, bundle, start);
}

async function writeChapters(doc: EbookDocument, jobId: string, bundle: any, startIndex = 0) {
  if (!doc.analysis) throw new Error("Missing analysis");
  const outline: OutlineItem[] = doc.outline;
  const chapters: Chapter[] = [...(doc.chapters || [])];

  for (let i = startIndex; i < outline.length; i++) {
    const item = outline[i];
    updateEbook(doc.id, {
      status: "writing",
      progress: {
        step: "writing",
        percent: 48 + Math.round((i / Math.max(1, outline.length)) * 36),
        message: "Writing chapters...",
        detail: `Chapter ${i + 1} of ${outline.length}: ${item.title}`,
      },
    });
    updateJob(jobId, {
      status: "running",
      step: "writing",
      percent: 48 + Math.round((i / Math.max(1, outline.length)) * 36),
      message: `Writing chapter ${i + 1}`,
      lastChapterIndex: i - 1,
    });

    let extraImages = bundle.images || [];
    if (doc.settings.includeImages && (!extraImages.length || i > 0)) {
      extraImages = await maybeChapterImages(`${doc.title} ${item.title}`, true);
    }

    const ch = await writeChapter({
      index: i,
      item,
      settings: doc.settings,
      analysis: doc.analysis,
      bundle: { ...bundle, images: extraImages },
      total: outline.length,
    });
    ch.factFlags = flagsFromFacts(bundle.facts || [], chapterPlain(ch));
    chapters[i] = ch;
    saveChapter(doc.id, ch);
  }

  updateEbook(doc.id, {
    status: "fact_checking",
    progress: { step: "fact_checking", percent: 88, message: "Fact checking..." },
    chapters,
  });
  updateJob(jobId, { status: "running", step: "fact_checking", percent: 88, message: "Fact checking..." });

  const matter = await writeFrontMatter({
    settings: doc.settings,
    analysis: doc.analysis,
    bundle,
    outline,
  });

  const wordCount =
    countWords(matter.introduction + " " + matter.conclusion) + chapters.reduce((n, c) => n + (c?.wordCount || 0), 0);

  updateEbook(doc.id, {
    status: "complete",
    introduction: matter.introduction,
    conclusion: matter.conclusion,
    faqs: matter.faqs,
    glossary: doc.settings.includeGlossary ? matter.glossary : [],
    disclaimer: matter.disclaimer,
    chapters,
    wordCount,
    chapterCount: chapters.length,
    progress: { step: "complete", percent: 100, message: "Preparing download..." },
    error: undefined,
  });
  updateJob(jobId, { status: "complete", step: "complete", percent: 100, message: "Complete", lastChapterIndex: chapters.length - 1 });
}

export async function regenerateChapter(ebookId: string, chapterIndex: number, instruction?: string) {
  const doc = getEbook(ebookId);
  if (!doc?.analysis) throw new Error("Ebook not ready");
  const item = doc.outline[chapterIndex];
  if (!item) throw new Error("Chapter not found");
  if (instruction) item.summary = `${item.summary}\n\nEditor instruction: ${instruction}`;
  const bundle = {
    sources: doc.sources,
    facts: doc.facts || [],
    wikiPages: [],
    images: doc.settings.includeImages ? await maybeChapterImages(`${doc.title} ${item.title}`, true) : [],
    insufficient: false,
  } as any;
  const ch = await writeChapter({
    index: chapterIndex,
    item,
    settings: doc.settings,
    analysis: doc.analysis,
    bundle,
    total: doc.outline.length,
  });
  const chapters = doc.chapters.slice();
  chapters[chapterIndex] = ch;
  saveChapter(ebookId, ch);
  updateEbook(ebookId, {
    chapters,
    wordCount: chapters.reduce((n, c) => n + (c?.wordCount || 0), 0),
  });
  return ch;
}


