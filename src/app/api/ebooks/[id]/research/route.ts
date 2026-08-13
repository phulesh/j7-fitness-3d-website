import { createJob, getActiveJob, getEbook, getLatestJob, updateEbook, updateJob, clientEbook } from "@/lib/ebooks";
import { cancelGeneration, isRunning, regenerateOutlineForEbook, startResearch } from "@/lib/generate/runner";
import { requireUser, json, bad, limit } from "@/lib/api";
import { isHindiOutput } from "@/lib/language";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  const job = getLatestJob(ebook.id, "research") || getLatestJob(ebook.id);
  const run = ebook.researchRun || { status: "idle", percent: 0, sourcesFound: ebook.sources.length, message: "" };
  return json({
    ebookId: ebook.id,
    status: run.status,
    ebookStatus: ebook.status,
    researchRun: run,
    chapterResearch: ebook.chapterResearch || [],
    sourcesFound: ebook.sources.length,
    job,
    progress: ebook.progress,
    error: ebook.error || run.error,
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);

  let body: { action?: string; forceOutline?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const hindi = isHindiOutput(ebook.outputLanguage || ebook.language || ebook.settings.language);

  if (body.action === "cancel") {
    cancelGeneration(ebook.id);
    updateEbook(ebook.id, {
      status: "paused",
      researchRun: {
        ...(ebook.researchRun || { percent: 0, sourcesFound: ebook.sources.length, message: "" }),
        status: "cancelled",
        message: hindi ? "शोध रद्द किया गया। आपका डेटा सुरक्षित है।" : "Research cancelled. Your ebook data has been saved.",
        finishedAt: new Date().toISOString(),
      },
      progress: {
        step: "paused",
        percent: ebook.progress?.percent || 0,
        message: hindi ? "शोध रद्द किया गया। आपका डेटा सुरक्षित है।" : "Cancelled. Your ebook data has been saved.",
      },
    });
    const job = getLatestJob(ebook.id, "research") || getLatestJob(ebook.id);
    if (job) updateJob(job.id, { status: "cancelled", message: "Cancelled" });
    return json({ ebookId: ebook.id, status: "cancelled" });
  }

  if (body.action === "regenerate-outline") {
    try {
      const next = regenerateOutlineForEbook(ebook.id);
      return json({ ebookId: ebook.id, outline: next?.outline || [], ebook: next ? clientEbook(next) : null, status: "outline-ready" });
    } catch (e: any) {
      return bad(e.message || "Could not regenerate outline", 400);
    }
  }

  const blocked = limit(req, `gen:${auth.user.id}`, Number(process.env.RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000);
  if (blocked) return blocked;

  const active = getActiveJob(ebook.id, "research") || (isRunning(ebook.id) ? getLatestJob(ebook.id) : null);
  if (active && (active.status === "running" || active.status === "queued") && isRunning(ebook.id)) {
    return json({
      jobId: active.id,
      ebookId: ebook.id,
      status: "already-running",
      reused: true,
      message: hindi ? "इस ईबुक पर शोध पहले से चल रहा है।" : "Research is already running for this ebook.",
    });
  }

  updateEbook(ebook.id, {
    status: "researching",
    error: undefined,
    researchRun: {
      status: "running",
      startedAt: new Date().toISOString(),
      percent: 2,
      sourcesFound: ebook.sources.length,
      message: hindi ? "शोध शुरू हो रहा है…" : "Research started…",
    },
    progress: { step: "researching", percent: 2, message: hindi ? "शोध शुरू हो रहा है…" : "Research started…" },
  });

  const job = createJob(ebook.id, auth.user.id, "research");
  startResearch(ebook.id, job.id, {
    forceOutline: Boolean(body.forceOutline) || body.action === "regenerate",
    replaceSources: true,
  });
  return json({ jobId: job.id, ebookId: ebook.id, status: "started", message: hindi ? "शोध शुरू हो रहा है…" : "Research started…" });
}
