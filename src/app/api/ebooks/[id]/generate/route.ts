import { createJob, getEbook, getLatestJob } from "@/lib/ebooks";
import { continueFromOutline, startGeneration } from "@/lib/generate/runner";
import { requireUser, json, bad, limit } from "@/lib/api";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `gen:${auth.user.id}`, Number(process.env.RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000);
  if (blocked) return blocked;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);

  let body: { resume?: boolean; fromOutline?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const job = createJob(ebook.id, auth.user.id);
  if (body.fromOutline || ebook.status === "awaiting_outline") {
    continueFromOutline(ebook.id, job.id).catch((e) => console.error(e));
    return json({ jobId: job.id, status: "writing" });
  }
  startGeneration(ebook.id, job.id, { resume: Boolean(body.resume), skipOutlineWait: true });
  return json({ jobId: job.id, status: "started" });
}
