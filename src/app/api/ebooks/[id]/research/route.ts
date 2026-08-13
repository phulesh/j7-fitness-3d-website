import { createJob, getActiveJob, getEbook, getLatestJob, updateEbook, updateJob } from "@/lib/ebooks";
import { cancelGeneration, isRunning, regenerateOutlineForEbook, startGeneration } from "@/lib/generate/runner";
import { requireUser, json, bad, limit } from "@/lib/api";

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

  if (body.action === "cancel") {
    cancelGeneration(ebook.id);
    updateEbook(ebook.id, {
      status: "paused",
      progress: { step: "paused", percent: ebook.progress?.percent || 0, message: "Cancelled. Your ebook data has been saved." },
    });
    const job = getLatestJob(ebook.id);
    if (job) updateJob(job.id, { status: "paused", message: "Cancelled" });
    return json({ ebookId: ebook.id, status: "cancelled" });
  }

  if (body.action === "regenerate-outline") {
    try {
      const next = regenerateOutlineForEbook(ebook.id);
      return json({ ebookId: ebook.id, outline: next?.outline || [], ebook: next, status: "outline-ready" });
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
      message: "Research is already running for this ebook.",
    });
  }

  const job = createJob(ebook.id, auth.user.id, "research");
  startGeneration(ebook.id, job.id, { skipOutlineWait: false, forceOutline: Boolean(body.forceOutline) });
  return json({ jobId: job.id, ebookId: ebook.id, status: "started" });
}
