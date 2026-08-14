import { createJob, getActiveJob, getEbook, getLatestJob } from "@/lib/ebooks";
import { continueFromOutline, isRunning, startGeneration } from "@/lib/generate/runner";
import { requireUser, json, bad, limit } from "@/lib/api";
import { aiConfigured } from "@/lib/ai";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `gen:${auth.user.id}`, Number(process.env.RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000);
  if (blocked) return blocked;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  if (!aiConfigured()) {
    return bad("AI generation is not configured. An administrator must set AI_PROVIDER, AI_API_KEY, AI_BASE_URL, and AI_MODEL on the server.", 503);
  }

  let body: { resume?: boolean; fromOutline?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if ((body.fromOutline || ebook.status === "awaiting_outline") && ebook.researchQuality?.generationBlocked) {
    return bad(
      ebook.researchQuality.contaminationReason ||
        "Research contains unrelated sources. Re-run research before writing the ebook.",
      409
    );
  }

  const latest = getLatestJob(ebook.id, "generate") || getLatestJob(ebook.id);
  const recentlyRunning =
    latest &&
    (latest.status === "running" || latest.status === "queued") &&
    Date.now() - Date.parse(latest.updatedAt || latest.createdAt) < 120000;

  if (ebook.status === "complete" && !body.resume && !body.fromOutline) {
    return json({
      jobId: latest?.id,
      ebookId: ebook.id,
      status: "complete",
      reused: true,
      message: "This ebook is already generated. Open the existing volume.",
    });
  }

  if (isRunning(ebook.id) || recentlyRunning) {
    const existing = getActiveJob(ebook.id) || latest;
    return json({
      jobId: existing?.id,
      ebookId: ebook.id,
      status: "already-running",
      reused: true,
      message: "Generation is already running for this ebook.",
    });
  }

  const job = createJob(ebook.id, auth.user.id, "generate");
  if (body.fromOutline || ebook.status === "awaiting_outline") {
    continueFromOutline(ebook.id, job.id).catch((e) => console.error(e));
    return json({ jobId: job.id, ebookId: ebook.id, status: "writing" });
  }
  startGeneration(ebook.id, job.id, { resume: Boolean(body.resume), skipOutlineWait: true });
  return json({ jobId: job.id, ebookId: ebook.id, status: "started" });
}
