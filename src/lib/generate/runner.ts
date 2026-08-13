import path from "path";
import { analyzeTopic, detectVagueness } from "./analyze";
import { buildOutlineFromResearch, runResearch } from "../research/pipeline";
import { writeChapter, writeFrontMatter, countWords, flagsFromFacts, maybeChapterImages, chapterPlain } from "./write";
import { coverSvg, renderCoverPng } from "./cover";
import { getEbook, updateEbook, saveChapter, updateJob } from "../ebooks";
import type { Chapter, EbookDocument, OutlineItem } from "../types";
import { isHindiOutput } from "../language";
import { documentNeedsHindiRegen, ensureHindiChapter, localizeOutline } from "./hindi";
import { friendlyError } from "../errors";

const running = new Map<string, Promise<void>>();

export function startGeneration(ebookId: string, jobId: string, opts: { resume?: boolean; skipOutlineWait?: boolean } = {}) {
  if (running.has(ebookId)) return;
  const p = generateEbook(ebookId, jobId, opts)
    .catch((err) => {
      console.error("Generation failed", err);
      const raw = err instanceof Error ? err.message : "Generation interrupted.";
      const message = friendlyError(raw);
      updateEbook(ebookId, {
        status: "failed",
        error: message,
        progress: {
          step: "failed",
          percent: 0,
          message: "Generation interrupted. Your ebook data has been saved. Resume generation.",
          detail: message,
        },
      });
      updateJob(jobId, {
        status: "failed",
        error: message,
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
  const outputLanguage = isHindiOutput(doc.settings.outputLanguage || doc.settings.language)
    ? "hi"
    : analysis.outputLanguage;
  analysis.outputLanguage = outputLanguage;
  // Resolve the title ONCE and reuse it everywhere (cover + both updates).
  // The user's explicit title — whether typed on the Create form, edited on the
  // Cover/Settings tab, or set via the API — must survive research and never be
  // silently overwritten by the English normalizedTitle. For a Hindi book this
  // is what keeps Devanagari on the cover. analysis.normalizedTitle is only a
  // fallback when the user supplied no title at all.
  const resolvedTitle = (
    doc.customTitle?.trim() ||
    doc.settings.customTitle?.trim() ||
    doc.title?.trim() ||
    doc.settings.title?.trim() ||
    analysis.normalizedTitle ||
    ""
  ).trim();
  const resolvedSubtitle = doc.settings.subtitle?.trim() || doc.subtitle?.trim() || analysis.subtitle || "";
  updateEbook(ebookId, {
    analysis,
    title: resolvedTitle,
    customTitle: doc.customTitle || doc.settings.customTitle || resolvedTitle,
    subtitle: resolvedSubtitle,
    language: outputLanguage,
    outputLanguage,
    researchQuestions: analysis.researchQuestions || doc.researchQuestions || [],
    lastCompletedStage: "settings",
    settings: { ...doc.settings, title: resolvedTitle, language: outputLanguage, outputLanguage },
  });

  progress("researching", 12, "Finding reliable sources...", "researching", analysis.searchQueries.slice(0, 3).join(" · "));

  const bundle = await runResearch(ebookId, analysis, doc.settings, (msg) => {
    progress("researching", 20, "Finding reliable sources...", "researching", msg);
  });

  progress("outlining", 38, "Creating ebook structure...", "outlining");

  const syllabus = doc.syllabus?.detected ? doc.syllabus : bundle.syllabusFromWeb;
  const rawOutline = doc.outline.length
    ? doc.outline
    : buildOutlineFromResearch(doc.settings, analysis, bundle, syllabus);
  const outline = localizeOutline(rawOutline, outputLanguage);

  const blocked = bundle.researchQuality?.generationBlocked || bundle.insufficient;
  const blockMsg =
    bundle.researchQuality?.contaminationReason ||
    bundle.message ||
    "Research is not clean enough to write this ebook.";

  const cover = coverSvg({
    title: resolvedTitle,
    subtitle: resolvedSubtitle,
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
    rejectedSources: bundle.rejectedSources,
    researchQuality: bundle.researchQuality,
    facts: bundle.facts,
    title: resolvedTitle,
    subtitle: resolvedSubtitle,
    language: analysis.outputLanguage,
    chapterCount: outline.length,
    status: blocked ? "awaiting_outline" : opts.skipOutlineWait ? "writing" : "awaiting_outline",
    error: blocked ? blockMsg : undefined,
    progress: {
      step: blocked || !opts.skipOutlineWait ? "awaiting_outline" : "writing",
      percent: 45,
      message: blocked ? "Research quality gate — writing blocked" : opts.skipOutlineWait ? "Writing chapters..." : "Outline ready — review structure",
      detail: `Research Quality: ${bundle.researchQuality.relevantCount} relevant sources / ${bundle.researchQuality.rejectedCount} rejected sources`,
    },
  });
  updateJob(jobId, {
    status: "paused",
    step: "awaiting_outline",
    percent: 45,
    message: blocked ? "Research blocked" : "Outline ready",
    error: blocked ? blockMsg : undefined,
  });

  if (blocked || !opts.skipOutlineWait) return;

  const fresh = getEbook(ebookId);
  if (!fresh) return;
  await writeChapters(fresh, jobId, bundle);
}

export async function continueFromOutline(ebookId: string, jobId: string) {
  if (running.has(ebookId)) return;
  const p = continueFromOutlineInner(ebookId, jobId)
    .catch((err) => {
      console.error("continueFromOutline failed", err);
      updateEbook(ebookId, {
        status: "failed",
        error: friendlyError(err instanceof Error ? err.message : "Generation interrupted."),
        progress: {
          step: "failed",
          percent: 0,
          message: "Generation interrupted. Your ebook data has been saved. Resume generation.",
        },
      });
      updateJob(jobId, { status: "failed", message: "Generation interrupted. Resume generation." });
    })
    .finally(() => running.delete(ebookId));
  running.set(ebookId, p);
  return p;
}

async function continueFromOutlineInner(ebookId: string, jobId: string) {
  const doc = getEbook(ebookId);
  if (!doc || !doc.analysis) throw new Error("Research the topic first.");
  if (doc.researchQuality?.generationBlocked) {
    const msg =
      doc.researchQuality.contaminationReason ||
      "Research contains unrelated sources. Re-run research before writing the ebook.";
    updateEbook(ebookId, {
      status: "awaiting_outline",
      error: msg,
      progress: { step: "awaiting_outline", percent: 45, message: msg },
    });
    updateJob(jobId, { status: "paused", step: "awaiting_outline", message: msg, error: msg });
    return;
  }
  updateJob(jobId, { status: "running", step: "writing", percent: 48, message: "Writing chapters..." });
  updateEbook(ebookId, { status: "writing", progress: { step: "writing", percent: 48, message: "Writing chapters..." } });

  const { buildTopicProfile } = await import("../research/relevance");
  const profile = buildTopicProfile(doc.analysis.topic, {
    category: doc.analysis.category,
    type: doc.settings.type,
  });
  const bundle = {
    sources: doc.sources,
    rejectedSources: doc.rejectedSources || [],
    researchQuality: doc.researchQuality,
    facts: doc.facts || [],
    wikiPages: [] as never[],
    images: [] as never[],
    insufficient: false,
    profile,
  };
  // Re-run lightweight research if we don't have extracts
  const hasExtracts = doc.sources.some((s) => (s.extractedText || "").length > 200);
  if (!hasExtracts || !doc.sources.length) {
    const full = await runResearch(ebookId, doc.analysis, doc.settings);
    if (full.researchQuality.generationBlocked) {
      updateEbook(ebookId, {
        status: "awaiting_outline",
        sources: full.sources,
        rejectedSources: full.rejectedSources,
        researchQuality: full.researchQuality,
        error: full.researchQuality.contaminationReason,
        progress: {
          step: "awaiting_outline",
          percent: 45,
          message: full.researchQuality.contaminationReason || "Research quality gate failed",
        },
      });
      updateJob(jobId, {
        status: "paused",
        step: "awaiting_outline",
        message: "Research blocked",
        error: full.researchQuality.contaminationReason,
      });
      return;
    }
    await writeChapters({ ...doc, sources: full.sources, facts: full.facts }, jobId, full);
    return;
  }
  await writeChapters(doc, jobId, bundle as any);
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

  const checkDoc = {
    ...doc,
    introduction: matter.introduction,
    conclusion: matter.conclusion,
    chapters,
    glossary: doc.settings.includeGlossary ? matter.glossary : [],
    language: doc.analysis.outputLanguage,
    outputLanguage: doc.analysis.outputLanguage,
    settings: doc.settings,
  } as EbookDocument;
  const langCheck = documentNeedsHindiRegen(checkDoc);
  if (!langCheck.ok) {
    for (const key of langCheck.sections) {
      const m = key.match(/^chapter-(\d+)$/);
      if (!m) continue;
      const idx = Number(m[1]) - 1;
      const item = outline[idx];
      if (!item || !chapters[idx]) continue;
      const ensured = await ensureHindiChapter(chapters[idx], {
        item,
        settings: doc.settings,
        analysis: doc.analysis,
        sources: bundle.sources || doc.sources,
        facts: bundle.facts || doc.facts || [],
      });
      chapters[idx] = ensured.chapter;
      saveChapter(doc.id, ensured.chapter);
    }
  }
  const finalCheck = documentNeedsHindiRegen({ ...checkDoc, chapters });

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
    lastCompletedStage: "complete",
    languageCheck: {
      expected: doc.analysis.outputLanguage,
      passed: finalCheck.ok,
      regeneratedSections: langCheck.sections,
      detail: finalCheck.ok ? undefined : "Some sections were rewritten to match the selected output language.",
    },
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


