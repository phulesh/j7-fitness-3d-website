import { createJob, getActiveJob, getEbook, getLatestJob } from "@/lib/ebooks";
import { isRunning, startGeneration } from "@/lib/generate/runner";
import { requireUser, json, bad, limit } from "@/lib/api";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `gen:${auth.user.id}`, Number(process.env.RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000);
  if (blocked) return blocked;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);

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
  startGeneration(ebook.id, job.id, { skipOutlineWait: false });
  return json({ jobId: job.id, ebookId: ebook.id, status: "started" });
}
