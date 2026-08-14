import { getEbook, saveChapters, updateEbook, clientEbook } from "@/lib/ebooks";
import { ensureChapterQA } from "@/lib/generate/qa";
import { deepenChapterFromSources } from "@/lib/generate/depth";
import { validateBookForPublishing } from "@/lib/generate/publish-gate";
import { runFinalQualityCheck } from "@/lib/generate/quality";
import { countWords, chapterPlain } from "@/lib/generate/text";
import { requireUser, json, bad, limit } from "@/lib/api";

/**
 * Independent repair actions so a user never has to regenerate the whole book
 * when only one component failed:
 *   action = "qa"       → regenerate ONLY failed answers and malformed MCQs
 *   action = "depth"    → deepen thin chapters from approved sources
 *   action = "exports"  → rebuild 3D book, PDF, EPUB, DOCX, offline HTML
 *   action = "validate" → run the publishing gate and return its report
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `repair:${auth.user.id}`, 30, 60 * 60 * 1000);
  if (blocked) return blocked;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = body.action || "validate";
  const lang = ebook.outputLanguage || ebook.language;

  if (action === "qa" || action === "depth") {
    if (!ebook.chapters.length) return bad("No chapters to repair. Write the chapters first.");
    let repairedAnswers = 0;
    let repairedMcqs = 0;
    for (const chapter of ebook.chapters) {
      if (action === "depth") {
        deepenChapterFromSources(chapter, ebook.sources, ebook.settings, lang);
      } else {
        const res = ensureChapterQA(chapter, {
          lang,
          sources: ebook.sources,
          includeExercises: Boolean(ebook.settings.includeExercises),
          includeMcqs: Boolean(ebook.settings.includeMcqs),
        });
        repairedAnswers += res.repairedAnswers;
        repairedMcqs += res.repairedMcqs;
      }
      chapter.wordCount = countWords(chapterPlain(chapter));
    }
    saveChapters(ebook.id, ebook.chapters);
    const gate = validateBookForPublishing(ebook);
    updateEbook(ebook.id, {
      chapters: ebook.chapters,
      wordCount: gate.stats.words,
      publishGate: { ...gate, checkedAt: new Date().toISOString() },
    });
    const fresh = getEbook(ebook.id, auth.user.id)!;
    return json({ ebook: clientEbook(fresh), repairedAnswers, repairedMcqs, publishGate: gate });
  }

  if (action === "exports") {
    if (!ebook.chapters.length) return bad("No chapters yet — generate the book before rebuilding exports.");
    try {
      const final = await runFinalQualityCheck(ebook.id);
      updateEbook(ebook.id, {
        qualityReport: final.report,
        exports: final.exports,
        status: "complete",
        error: undefined,
        progress: { step: "complete", percent: 100, message: "Exports rebuilt" },
      });
      const fresh = getEbook(ebook.id, auth.user.id)!;
      return json({ ebook: clientEbook(fresh), rebuilt: true });
    } catch (e: any) {
      return bad(e?.message || "Export rebuild failed", 422);
    }
  }

  // validate
  const gate = validateBookForPublishing(ebook);
  updateEbook(ebook.id, { publishGate: { ...gate, checkedAt: new Date().toISOString() } });
  return json({ publishGate: gate });
}
