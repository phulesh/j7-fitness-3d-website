import { createJob, getActiveJob, getEbook, getLatestJob } from "@/lib/ebooks";
import { continueFromOutline, isRunning, startGeneration } from "@/lib/generate/runner";
import { requireUser, json, bad, limit } from "@/lib/api";
import { getAIStatus, assertAIConfigured, AIProviderError } from "@/lib/ai";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  
  const blocked = limit(req, `gen:${auth.user.id}`, Number(process.env.RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000);
  if (blocked) return blocked;
  
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  
  // Check AI configuration first - this must fail loudly before any work begins
  const aiStatus = getAIStatus();
  if (!aiStatus.configured) {
    // Explicit 503 with the exact missing variables. Never start a job that
    // would produce empty or partially-written content.
    const detail = aiStatus.missing?.length ? ` Missing: ${aiStatus.missing.join(", ")}.` : "";
    const errorMsg = `AI generation is not configured. An administrator must set AI_PROVIDER, AI_API_KEY, AI_BASE_URL, and AI_MODEL on the server.${detail}`;
    
    // Update ebook status to reflect the configuration issue
    if (ebook.status !== "failed" || !ebook.error?.includes("AI generation is not configured")) {
      // Only update if this is a new error, not a retry of the same error
      // This prevents overwriting user's decision to retry
    }
    
    return bad(errorMsg, 503);
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

  // Check if we're resuming from a failed state
  const isResumingFromFailure = body.resume && ebook.status === "failed";
  
  // If resuming from failure, we'll use the existing resume logic in writeRemaining
  // which finds the last completed chapter and starts from the next one

  const job = createJob(ebook.id, auth.user.id, "generate");
  
  if (body.fromOutline || ebook.status === "awaiting_outline") {
    continueFromOutline(ebook.id, job.id).catch((e) => {
      console.error("continueFromOutline error:", e);
      // Log the exact error for debugging
      if (e instanceof Error) {
        console.error("Error stack:", e.stack);
      }
    });
    return json({ jobId: job.id, ebookId: ebook.id, status: "writing" });
  }
  
  startGeneration(ebook.id, job.id, { 
    resume: Boolean(body.resume), 
    skipOutlineWait: true
  });
  
  return json({ 
    jobId: job.id, 
    ebookId: ebook.id, 
    status: "started",
    message: isResumingFromFailure ? "Resuming generation from last completed stage..." : "Generation started"
  });
}
