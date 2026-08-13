import { createJob, getEbook } from "@/lib/ebooks";
import { startGeneration } from "@/lib/generate/runner";
import { requireUser, json, bad, limit } from "@/lib/api";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `gen:${auth.user.id}`, Number(process.env.RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000);
  if (blocked) return blocked;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  const job = createJob(ebook.id, auth.user.id);
  startGeneration(ebook.id, job.id, { skipOutlineWait: false });
  return json({ jobId: job.id, status: "started" });
}
