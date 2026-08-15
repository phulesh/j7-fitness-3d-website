import path from "path";
import { analyzeTopic, detectVagueness } from "./analyze";
import { buildOutlineFromResearch, runResearch, researchOutlineChapters } from "../research/pipeline";
import { writeChapter, writeFrontMatter, countWords, flagsFromFacts, maybeChapterImages, chapterPlain } from "./write";
import { buildChapterVisuals, insertFiguresIntoChapter } from "./images";
import { coverAuthor, coverSvg, renderCoverPng } from "./cover";
import { getEbook, updateEbook, saveChapter, updateJob } from "../ebooks";
import type { Chapter, EbookDocument, OutlineItem, ResearchRunState } from "../types";
import { isHindiOutput } from "../language";
import { documentNeedsHindiRegen, ensureHindiChapter, localizeOutline } from "./hindi";
import { friendlyError } from "../errors";
import { runFinalQualityCheck } from "./quality";
import { ACHHOOT_HINDI_TITLES, isAchhootResearchTopic } from "./outline";
import { augmentAchhootSources } from "./achhoot";
import { nextSourceId } from "../db";
import { buildResearchQuality } from "../research/relevance";
import { assertAIConfigured, aiConfigured, getAIConfig, AIProviderError } from "../ai";

const RESEARCH_TIMEOUT_MS = Number(process.env.RESEARCH_TIMEOUT_MS || 7 * 60 * 1000);

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function addCanonicalAchhootSources(topic: string, sources: EbookDocument["sources"]) {
  if (!isAchhootResearchTopic(topic)) return sources;
  return augmentAchhootSources(sources, nextSourceId);
}

function exactAchhootOutline(topic: string, outline: OutlineItem[]) {
  if (!isAchhootResearchTopic(topic)) return outline;
  return outline.slice(0, 14).map((item, index) => ({ ...item, title: ACHHOOT_HINDI_TITLES[index] || item.title }));
}

function prepareCanonicalAchhootBundle(
  topic: string,
  bundle: {
    sources: EbookDocument["sources"];
    rejectedSources: Parameters<typeof buildResearchQuality>[1];
    researchQuality: ReturnType<typeof buildResearchQuality>;
    insufficient: boolean;
  }
) {
  if (!isAchhootResearchTopic(topic)) return;
  bundle.sources = addCanonicalAchhootSources(topic, bundle.sources);
  bundle.researchQuality = buildResearchQuality(bundle.sources, bundle.rejectedSources);
  bundle.insufficient = bundle.researchQuality.generationBlocked;
}

function researchCopy(hindi: boolean) {
  return {
    started: hindi ? "शोध शुरू हो रहा है…" : "Research started…",
    analyzing: hindi ? "विषय का विश्लेषण हो रहा है…" : "Analysing the topic…",
    finding: hindi ? "विश्वसनीय स्रोत खोजे जा रहे हैं…" : "Finding reliable sources…",
    outlining: hindi ? "अध्याय-रूपरेखा तैयार हो रही है…" : "Building the chapter outline…",
    saving: hindi ? "स्रोत सुरक्षित किए जा रहे हैं…" : "Saving sources…",
    cover: hindi ? "कवर तैयार किया जा रहा है…" : "Preparing the cover…",
    done: hindi ? "शोध पूरा हुआ।" : "Research completed.",
    failed: hindi ? "शोध पूरा नहीं हो सका। पुनः प्रयास करें।" : "Research could not be completed. Please retry.",
    cancelled: hindi ? "शोध रद्द किया गया। आपका डेटा सुरक्षित है।" : "Research cancelled. Your ebook data has been saved.",
    timeout: hindi ? "शोध समय सीमा से अधिक चल गया। पुनः प्रयास करें।" : "Research timed out. Please retry.",
    chapter: (n: number, title: string) =>
      hindi ? `अध्याय ${n} पर शोध चल रहा है… ${title}` : `Researching chapter ${n}… ${title}`,
  };
}

/**
 * Ebook generation requires server-side AI configuration, with one deliberate
 * exception: the commissioned Achhoot volume is a fully authored, deterministic
 * edition composed from bundled canonical content, so it is complete without a
 * provider. Every other topic must fail loudly rather than publish thin or
 * empty chapters.
 */
function guardAIConfiguration(topic: string | undefined) {
  if (topic && isAchhootResearchTopic(topic)) return;
  assertAIConfigured();
}

const running = new Map<string, Promise<void>>();
const cancelled = new Set<string>();

export function cancelGeneration(ebookId: string) {
  cancelled.add(ebookId);
}

export function consumeCancel(ebookId: string) {
  const hit = cancelled.has(ebookId);
  cancelled.delete(ebookId);
  return hit;
}

export function startGeneration(
  ebookId: string,
  jobId: string,
  opts: { resume?: boolean; skipOutlineWait?: boolean; forceOutline?: boolean } = {}
) {
  if (running.has(ebookId)) return;
  cancelled.delete(ebookId);
  const p = generateEbook(ebookId, jobId, opts)
    .catch((err) => {
      console.error("Generation failed", err);
      const raw = err instanceof Error ? err.message : "Generation interrupted.";
      const message = friendlyError(raw);
      const saved = getEbook(ebookId);
      updateEbook(ebookId, {
        status: "failed",
        error: message,
        progress: {
          step: "failed",
          percent: saved?.progress?.percent || 0,
          message: "Generation interrupted. Your ebook data has been saved. Resume generation.",
          detail: raw.length > 500 ? raw.slice(0, 500) + "..." : raw,
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

export function startResearch(
  ebookId: string,
  jobId: string,
  opts: { forceOutline?: boolean; replaceSources?: boolean } = {}
) {
  if (running.has(ebookId)) return;
  cancelled.delete(ebookId);
  const p = researchEbook(ebookId, jobId, opts)
    .catch((err) => {
      console.error("Research failed", err);
      const raw = err instanceof Error ? err.message : "Research interrupted.";
      const message = friendlyError(raw);
      const current = getEbook(ebookId);
      const hindi = isHindiOutput(current?.outputLanguage || current?.language || current?.settings?.language);
      const copy = researchCopy(Boolean(hindi));
      const run: ResearchRunState = {
        status: "error",
        percent: current?.researchRun?.percent || 0,
        sourcesFound: current?.sources?.length || 0,
        message: copy.failed,
        error: message,
        finishedAt: new Date().toISOString(),
      };
      updateEbook(ebookId, {
        status: "failed",
        error: copy.failed,
        researchRun: run,
        progress: { step: "failed", percent: run.percent, message: copy.failed, detail: message },
      });
      updateJob(jobId, { status: "failed", error: message, message: copy.failed });
    })
    .finally(() => running.delete(ebookId));
  running.set(ebookId, p);
}

async function researchEbook(
  ebookId: string,
  jobId: string,
  opts: { forceOutline?: boolean; replaceSources?: boolean }
) {
  const doc = getEbook(ebookId);
  if (!doc) throw new Error("Ebook not found");
  const hindi = isHindiOutput(doc.settings.outputLanguage || doc.settings.language || doc.outputLanguage);
  const copy = researchCopy(hindi);

  const setRun = (patch: Partial<ResearchRunState>, status: EbookDocument["status"], step: string) => {
    const prev = getEbook(ebookId)?.researchRun;
    const run: ResearchRunState = {
      status: patch.status || prev?.status || "running",
      startedAt: prev?.startedAt || new Date().toISOString(),
      currentChapter: patch.currentChapter,
      currentChapterTitle: patch.currentChapterTitle,
      percent: patch.percent ?? prev?.percent ?? 0,
      sourcesFound: patch.sourcesFound ?? prev?.sourcesFound ?? 0,
      message: patch.message || prev?.message || copy.started,
      detail: patch.detail,
      error: patch.error,
      finishedAt: patch.finishedAt,
    };
    updateEbook(ebookId, {
      status,
      error: patch.status === "error" ? patch.error : undefined,
      researchRun: run,
      progress: { step, percent: run.percent, message: run.message, detail: run.detail },
    });
    updateJob(jobId, { status: "running", step, percent: run.percent, message: run.message });
  };

  setRun({ status: "running", percent: 3, message: copy.started, sourcesFound: doc.sources.length }, "researching", "researching");

  const vague = detectVagueness(doc.settings.topic);
  if (vague) {
    setRun({ status: "error", percent: 0, message: vague, error: vague, finishedAt: new Date().toISOString() }, "failed", "failed");
    updateJob(jobId, { status: "failed", message: vague, error: vague });
    return;
  }

  if (consumeCancel(ebookId)) {
    setRun({ status: "cancelled", message: copy.cancelled, finishedAt: new Date().toISOString() }, "paused", "paused");
    updateJob(jobId, { status: "cancelled", message: copy.cancelled });
    return;
  }

  setRun({ percent: 8, message: copy.analyzing }, "analyzing", "analyzing");
  const analysis = doc.analysis && !opts.forceOutline ? doc.analysis : await analyzeTopic(doc.settings);
  const outputLanguage = isHindiOutput(doc.settings.outputLanguage || doc.settings.language)
    ? "hi"
    : analysis.outputLanguage;
  analysis.outputLanguage = outputLanguage;
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

  setRun({ percent: 14, message: copy.finding, detail: (analysis.searchQueries || []).slice(0, 2).join(" · ") }, "researching", "researching");

  const bundle = await withTimeout(
    runResearch(ebookId, analysis, doc.settings, (msg) => {
      setRun(
        { percent: 22, message: copy.finding, detail: msg, sourcesFound: getEbook(ebookId)?.sources.length || 0 },
        "researching",
        "researching"
      );
    }),
    RESEARCH_TIMEOUT_MS,
    copy.timeout
  );
  prepareCanonicalAchhootBundle(analysis.topic, bundle);

  if (consumeCancel(ebookId)) {
    updateEbook(ebookId, {
      sources: bundle.sources,
      rejectedSources: bundle.rejectedSources,
      researchQuality: bundle.researchQuality,
      facts: bundle.facts,
    });
    setRun(
      { status: "cancelled", message: copy.cancelled, sourcesFound: bundle.sources.length, finishedAt: new Date().toISOString() },
      "paused",
      "paused"
    );
    updateJob(jobId, { status: "cancelled", message: copy.cancelled });
    return;
  }

  const fresh = getEbook(ebookId);
  if (!fresh) return;
  const syllabus = fresh.syllabus?.detected ? fresh.syllabus : bundle.syllabusFromWeb;
  const rawOutline =
    fresh.outline.length && !opts.forceOutline
      ? fresh.outline
      : buildOutlineFromResearch(fresh.settings, analysis, bundle, syllabus);
  const outline = exactAchhootOutline(analysis.topic, localizeOutline(rawOutline, outputLanguage));

  setRun(
    { percent: 48, message: hindi ? "अध्यायों पर शोध चल रहा है…" : "Researching chapters…", sourcesFound: bundle.sources.length },
    "researching",
    "researching"
  );

  let researchCancelled = false;
  const chaptered = await researchOutlineChapters({
    analysis,
    outline,
    bundle,
    cancelled: () => {
      if (researchCancelled) return true;
      if (consumeCancel(ebookId)) {
        researchCancelled = true;
        return true;
      }
      return false;
    },
    onProgress: (info) => {
      setRun(
        {
          percent: 48 + Math.round(info.percent * 0.4),
          message: copy.chapter(info.chapterIndex + 1, info.title),
          detail: info.message,
          currentChapter: info.chapterIndex,
          currentChapterTitle: info.title,
          sourcesFound: info.sourcesFound,
        },
        "researching",
        "researching"
      );
    },
  });

  if (researchCancelled) {
    updateEbook(ebookId, {
      outline,
      sources: chaptered.sources,
      chapterResearch: chaptered.chapterResearch,
      facts: chaptered.facts,
    });
    setRun(
      { status: "cancelled", message: copy.cancelled, sourcesFound: chaptered.sources.length, finishedAt: new Date().toISOString() },
      "paused",
      "paused"
    );
    updateJob(jobId, { status: "cancelled", message: copy.cancelled });
    return;
  }

  setRun({ percent: 92, message: copy.saving, sourcesFound: chaptered.sources.length }, "researching", "researching");

  const blocked = bundle.researchQuality?.generationBlocked || bundle.insufficient;
  const blockMsg =
    bundle.researchQuality?.contaminationReason ||
    bundle.message ||
    (hindi ? "शोध पर्याप्त स्वच्छ नहीं है।" : "Research is not clean enough to write this ebook.");

  let cover = fresh.cover;
  if (!cover?.svg) {
    setRun({ percent: 95, message: copy.cover }, "researching", "cover");
    const svg = coverSvg({
      title: resolvedTitle,
      subtitle: resolvedSubtitle,
      author: coverAuthor(fresh.settings),
      style: fresh.settings.coverStyle,
      language: outputLanguage,
      category: analysis.category,
    });
    let pngPath: string | undefined;
    try {
      pngPath = await renderCoverPng(svg, path.join(process.cwd(), "data", "covers", `${ebookId}.png`));
    } catch (e) {
      console.error("cover png", e);
    }
    cover = { style: fresh.settings.coverStyle, svg, pngPath };
  }

  updateEbook(ebookId, {
    outline,
    syllabus,
    analysis,
    cover,
    sources: chaptered.sources,
    rejectedSources: bundle.rejectedSources,
    researchQuality: bundle.researchQuality,
    chapterResearch: chaptered.chapterResearch,
    facts: chaptered.facts,
    title: resolvedTitle,
    subtitle: resolvedSubtitle,
    language: outputLanguage,
    outputLanguage,
    chapterCount: outline.length,
    status: "awaiting_outline",
    lastCompletedStage: "research",
    error: blocked ? blockMsg : undefined,
    researchRun: {
      status: blocked ? "error" : "success",
      percent: 100,
      sourcesFound: chaptered.sources.length,
      message: blocked ? blockMsg : copy.done,
      error: blocked ? blockMsg : undefined,
      finishedAt: new Date().toISOString(),
    },
    progress: {
      step: "awaiting_outline",
      percent: 100,
      message: blocked ? blockMsg : copy.done,
      detail: hindi
        ? `शोध गुणवत्ता: ${bundle.researchQuality.relevantCount} स्वीकृत / ${bundle.researchQuality.rejectedCount} अस्वीकृत`
        : `Research Quality: ${bundle.researchQuality.relevantCount} relevant sources / ${bundle.researchQuality.rejectedCount} rejected`,
    },
  });
  updateJob(jobId, {
    status: blocked ? "failed" : "complete",
    step: "awaiting_outline",
    percent: 100,
    message: blocked ? blockMsg : copy.done,
    error: blocked ? blockMsg : undefined,
  });
}

async function generateEbook(
  ebookId: string,
  jobId: string,
  opts: { resume?: boolean; skipOutlineWait?: boolean; forceOutline?: boolean }
) {
  const doc = getEbook(ebookId);
  if (!doc) throw new Error("Ebook not found");

  // Guard before any research/writing work so a misconfigured server fails
  // with a precise, actionable message instead of publishing empty chapters.
  guardAIConfiguration(doc.settings?.topic);

  const progress = (step: string, percent: number, message: string, status: EbookDocument["status"], detail?: string) => {
    updateEbook(ebookId, { status, error: undefined, progress: { step, percent, message, detail } });
    updateJob(jobId, { status: "running", step, percent, message });
  };

  // If resuming and chapters exist, jump to writing remaining
  if (opts.resume && doc.outline.length && doc.chapters.some((c) => c.status === "complete")) {
    await writeRemaining(doc, jobId);
    return;
  }

  progress("understanding", 4, "Understanding topic...", "analyzing", "Detecting language, category, and source strategy");

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
  prepareCanonicalAchhootBundle(analysis.topic, bundle);

  progress("verifying_sources", 30, "Verifying sources and provenance...", "researching", `${bundle.sources.length} reliable sources retained; ${bundle.rejectedSources.length} rejected`);
  progress("outlining", 38, "Building a topic-specific chapter outline...", "outlining");

  if (consumeCancel(ebookId)) {
    updateEbook(ebookId, {
      status: "paused",
      progress: { step: "paused", percent: 20, message: "Research cancelled. Your ebook data has been saved." },
    });
    updateJob(jobId, { status: "paused", message: "Cancelled" });
    return;
  }

  const syllabus = doc.syllabus?.detected ? doc.syllabus : bundle.syllabusFromWeb;
  const rawOutline =
    doc.outline.length && !opts.forceOutline
      ? doc.outline
      : buildOutlineFromResearch(doc.settings, analysis, bundle, syllabus);
  const outline = exactAchhootOutline(analysis.topic, localizeOutline(rawOutline, outputLanguage));

  const blocked = bundle.researchQuality?.generationBlocked || bundle.insufficient;
  const blockMsg =
    bundle.researchQuality?.contaminationReason ||
    bundle.message ||
    "Research is not clean enough to write this ebook.";

  let coverRecord = doc.cover?.svg ? doc.cover : undefined;
  if (!coverRecord?.svg) {
    const cover = coverSvg({
      title: resolvedTitle,
      subtitle: resolvedSubtitle,
      author: coverAuthor(doc.settings),
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
    coverRecord = { style: doc.settings.coverStyle, svg: cover, pngPath };
  }

  updateEbook(ebookId, {
    outline,
    syllabus,
    analysis,
    cover: coverRecord,
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
      const saved = getEbook(ebookId);
      const raw = err instanceof Error ? err.message : "Generation interrupted.";
      const message = friendlyError(raw);
      updateEbook(ebookId, {
        status: "failed",
        error: message,
        progress: {
          step: "failed",
          percent: saved?.progress?.percent || 0,
          message: "Generation interrupted. Your ebook data has been saved. Resume generation.",
          detail: raw.length > 500 ? raw.slice(0, 500) + "..." : raw,
        },
      });
      updateJob(jobId, { status: "failed", message: "Generation interrupted. Resume generation.", error: message });
    })
    .finally(() => running.delete(ebookId));
  running.set(ebookId, p);
  return p;
}

async function continueFromOutlineInner(ebookId: string, jobId: string) {
  const doc = getEbook(ebookId);
  if (!doc || !doc.analysis) throw new Error("Research the topic first.");
  guardAIConfiguration(doc.analysis.topic || doc.settings?.topic);
  if (isAchhootResearchTopic(doc.analysis.topic)) {
    doc.sources = addCanonicalAchhootSources(doc.analysis.topic, doc.sources);
    doc.outline = exactAchhootOutline(doc.analysis.topic, doc.outline);
    doc.researchQuality = buildResearchQuality(doc.sources, doc.rejectedSources || []);
    updateEbook(doc.id, { sources: doc.sources, outline: doc.outline, researchQuality: doc.researchQuality, error: undefined });
  }
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
  const canonicalSources = addCanonicalAchhootSources(doc.analysis.topic, doc.sources);
  if (canonicalSources.length !== doc.sources.length) updateEbook(doc.id, { sources: canonicalSources });
  const bundle = {
    sources: canonicalSources,
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
  const topic = doc.analysis?.topic || doc.settings.topic;
  const canonicalSources = addCanonicalAchhootSources(topic, doc.sources);
  const outline = exactAchhootOutline(topic, doc.outline);
  
  // Update progress to show we're resuming
  updateEbook(doc.id, {
    status: "writing",
    sources: canonicalSources,
    outline,
    lastCompletedStage: "writing",
    progress: { 
      step: "writing", 
      percent: 50 + Math.round((start / Math.max(1, outline.length)) * 40), 
      message: `Resuming from chapter ${start + 1} of ${outline.length}...` 
    },
  });
  
  const bundle = {
    sources: canonicalSources,
    facts: doc.facts || [],
    wikiPages: [] as never[],
    images: [] as never[],
    insufficient: false,
  } as any;
  
  // Write chapters starting from the failed one
  await writeChapters({ ...doc, sources: canonicalSources, outline }, jobId, bundle, start);
}

async function writeChapters(doc: EbookDocument, jobId: string, bundle: any, startIndex = 0) {
  if (!doc.analysis) throw new Error("Missing analysis");
  const outline: OutlineItem[] = doc.outline;
  const chapters: Chapter[] = [...(doc.chapters || [])];

  for (let i = startIndex; i < outline.length; i++) {
    const item = outline[i];
    
    // Update progress for this chapter
    const chapterPercent = 48 + Math.round((i / Math.max(1, outline.length)) * 36);
    updateEbook(doc.id, {
      status: "writing",
      lastCompletedStage: "writing",
      progress: {
        step: "writing",
        percent: chapterPercent,
        message: "Writing chapters...",
        detail: `Chapter ${i + 1} of ${outline.length}: ${item.title}`,
      },
    });
    updateJob(jobId, {
      status: "running",
      step: "writing",
      percent: chapterPercent,
      message: `Writing chapter ${i + 1}`,
      lastChapterIndex: i - 1,
    });

    if (consumeCancel(doc.id)) {
      updateEbook(doc.id, {
        status: "paused",
        chapters,
        progress: { step: "paused", percent: chapterPercent, message: "Writing cancelled. Completed chapters were saved." },
      });
      updateJob(jobId, { status: "paused", message: "Cancelled", lastChapterIndex: i - 1 });
      return;
    }

    try {
      let extraImages = i === 0 ? bundle.images || [] : [];
      if (doc.settings.includeImages && (!extraImages.length || i > 0)) {
        extraImages = await maybeChapterImages(`${doc.title} ${item.title}`, true);
      }
      const visuals = await buildChapterVisuals({
        ebookId: doc.id,
        chapterIndex: i,
        item,
        lang: doc.analysis.outputLanguage || doc.language,
        commons: extraImages,
        includeImages: Boolean(doc.settings.includeImages),
      });

      const ch = await writeChapter({
        index: i,
        item,
        settings: doc.settings,
        analysis: doc.analysis,
        bundle: { ...bundle, images: visuals },
        total: outline.length,
      });
      insertFiguresIntoChapter(ch, doc.analysis.outputLanguage || doc.language);
      ch.factFlags = flagsFromFacts(bundle.facts || [], chapterPlain(ch));
      chapters[i] = ch;
      
      // Save chapter transactionally BEFORE moving to next
      saveChapter(doc.id, ch);
      
      // Update progress with completed chapter
      updateEbook(doc.id, {
        chapters,
        lastCompletedStage: "writing",
        progress: {
          step: "writing",
          percent: chapterPercent + 1,
          message: `Completed chapter ${i + 1} of ${outline.length}`,
          detail: `Saved: ${item.title}`,
        },
      });
      updateJob(jobId, {
        status: "running",
        step: "writing",
        percent: chapterPercent + 1,
        message: `Completed chapter ${i + 1}`,
        lastChapterIndex: i,
      });
      
    } catch (error) {
      // Handle chapter writing failure
      console.error(`Failed to write chapter ${i + 1} (${item.title}):`, error);
      
      const rawError = error instanceof Error ? error.message : "Chapter generation failed";
      const friendlyMsg = friendlyError(rawError);
      
      // Save all completed chapters before failing
      updateEbook(doc.id, {
        chapters,
        status: "failed",
        error: friendlyMsg,
        lastCompletedStage: "writing",
        progress: {
          step: "failed",
          percent: chapterPercent,
          message: `Chapter ${i + 1} failed. Your ebook data has been saved. Resume to retry this chapter.`,
          detail: rawError.length > 500 ? rawError.slice(0, 500) + "..." : rawError,
        },
      });
      updateJob(jobId, {
        status: "failed",
        error: friendlyMsg,
        message: `Failed at chapter ${i + 1}. Resume to continue.`,
        lastChapterIndex: i - 1,
      });
      
      throw error; // Re-throw to stop the loop
    }
  }

  updateEbook(doc.id, {
    status: "fact_checking",
    progress: { step: "fact_checking", percent: 88, message: "Fact checking..." },
    chapters,
  });
  updateJob(jobId, { status: "running", step: "fact_checking", percent: 88, message: "Fact checking...", lastChapterIndex: chapters.length - 1 });

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

  // Persist all authored content before export/QA. If packaging is interrupted,
  // Resume Generation starts from these completed chapters instead of writing
  // them again.
  updateEbook(doc.id, {
    status: "exporting",
    introduction: matter.introduction,
    conclusion: matter.conclusion,
    faqs: matter.faqs,
    glossary: doc.settings.includeGlossary ? matter.glossary : [],
    disclaimer: matter.disclaimer,
    chapters,
    wordCount,
    chapterCount: chapters.length,
    lastCompletedStage: "factcheck",
    languageCheck: {
      expected: doc.analysis.outputLanguage,
      passed: finalCheck.ok,
      regeneratedSections: langCheck.sections,
      detail: finalCheck.ok ? undefined : "Some sections were rewritten to match the selected output language.",
    },
    progress: { step: "generating_figures", percent: 84, message: "Generating and validating figures..." },
    error: undefined,
  });
  updateJob(jobId, { status: "running", step: "generating_figures", percent: 84, message: "Generating figures", lastChapterIndex: chapters.length - 1 });

  try {
    const final = await runFinalQualityCheck(doc.id, (stage, percent, message) => {
      updateEbook(doc.id, { status: "exporting", progress: { step: stage, percent, message } });
      updateJob(jobId, { status: "running", step: stage, percent, message, lastChapterIndex: chapters.length - 1 });
    });

    // READY is allowed ONLY when the central publishing gate has passed.
    // runFinalQualityCheck throws when any critical check fails, and it also
    // persists the publishGate report; re-assert here so a book can never be
    // shown as successful while its content is empty or incomplete.
    const gated = getEbook(doc.id);
    if (!gated?.publishGate?.valid) {
      const reasons = gated?.publishGate?.errors?.slice(0, 5).join("; ") || "Publishing gate did not pass.";
      throw new Error(`Book failed the final publishing gate: ${reasons}`);
    }
    const finalWordCount =
      gated.publishGate.stats.words ||
      countWords(gated.introduction + " " + gated.conclusion) + gated.chapters.reduce((n, c) => n + (c?.wordCount || 0), 0);

    updateEbook(doc.id, {
      status: "complete",
      lastCompletedStage: "complete",
      qualityReport: final.report,
      exports: final.exports,
      wordCount: finalWordCount,
      progress: { step: "complete", percent: 100, message: "Book ready" },
      error: undefined,
    });
    updateJob(jobId, { status: "complete", step: "complete", percent: 100, message: "Ready", lastChapterIndex: chapters.length - 1 });
  } catch (error) {
    // Handle quality check failure
    console.error("Final quality check failed:", error);
    const rawError = error instanceof Error ? error.message : "Quality check failed";
    const friendlyMsg = friendlyError(rawError);
    
    updateEbook(doc.id, {
      status: "failed",
      error: friendlyMsg,
      lastCompletedStage: "quality",
      progress: {
        step: "failed",
        percent: 95,
        message: "Quality check failed. Your ebook data has been saved.",
        detail: rawError.length > 500 ? rawError.slice(0, 500) + "..." : rawError,
      },
    });
    updateJob(jobId, {
      status: "failed",
      error: friendlyMsg,
      message: "Quality check failed. Resume to retry.",
      lastChapterIndex: chapters.length - 1,
    });
    
    throw error;
  }
}

export async function regenerateChapter(ebookId: string, chapterIndex: number, instruction?: string) {
  const doc = getEbook(ebookId);
  if (!doc?.analysis) throw new Error("Ebook not ready");
  const item = doc.outline[chapterIndex];
  if (!item) throw new Error("Chapter not found");
  if (instruction) item.summary = `${item.summary}\n\nEditor instruction: ${instruction}`;
  const canonicalSources = addCanonicalAchhootSources(doc.analysis.topic, doc.sources);
  if (canonicalSources.length !== doc.sources.length) updateEbook(doc.id, { sources: canonicalSources });
  const commons = doc.settings.includeImages ? await maybeChapterImages(`${doc.title} ${item.title}`, true) : [];
  const visuals = await buildChapterVisuals({
    ebookId: doc.id,
    chapterIndex,
    item,
    lang: doc.analysis.outputLanguage || doc.language,
    commons,
    includeImages: Boolean(doc.settings.includeImages),
  });
  const bundle = {
    sources: canonicalSources,
    facts: doc.facts || [],
    wikiPages: [],
    images: visuals,
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
  insertFiguresIntoChapter(ch, doc.analysis.outputLanguage || doc.language);
  saveChapter(ebookId, ch);
  updateEbook(ebookId, {
    chapters,
    wordCount: chapters.reduce((n, c) => n + (c?.wordCount || 0), 0),
  });
  return ch;
}

export function regenerateOutlineForEbook(ebookId: string) {
  const doc = getEbook(ebookId);
  if (!doc) throw new Error("Ebook not found");
  if (!doc.analysis) throw new Error("Research the topic first.");
  const bundle = {
    sources: doc.sources,
    rejectedSources: doc.rejectedSources || [],
    researchQuality: doc.researchQuality || {
      relevantCount: doc.sources.length,
      rejectedCount: (doc.rejectedSources || []).length,
      generationBlocked: false,
      approved: [],
      rejected: [],
    },
    facts: doc.facts || [],
    wikiPages: [],
    images: [],
    insufficient: false,
    profile: undefined,
  };
  const outline = exactAchhootOutline(
    doc.analysis.topic,
    localizeOutline(
      buildOutlineFromResearch(doc.settings, doc.analysis, bundle as any, doc.syllabus),
      doc.outputLanguage || doc.language
    )
  );
  updateEbook(ebookId, {
    outline,
    chapterCount: outline.length,
    lastCompletedStage: "outline",
    status: doc.status === "draft" ? "awaiting_outline" : doc.status,
  });
  return getEbook(ebookId);
}

