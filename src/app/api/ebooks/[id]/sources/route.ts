import { getEbook, clientEbook, addSourceRow, removeSourceRow, createJob, getActiveJob, getLatestJob } from "@/lib/ebooks";
import { nowIso, nextSourceId } from "@/lib/db";
import { extractReadable } from "@/lib/research/extract";
import { organizationFromDomain, sourceTier } from "@/lib/research/rank";
import { buildTopicProfile, evaluateCandidate, MIN_RELEVANCE } from "@/lib/research/relevance";
import { isRunning, startResearch } from "@/lib/generate/runner";
import { requireUser, json, bad, limit } from "@/lib/api";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").toLowerCase();
  const type = url.searchParams.get("type") || "";
  let sources = ebook.sources;
  if (q) {
    sources = sources.filter((s) =>
      `${s.title} ${s.author || ""} ${s.organization} ${s.url} ${s.snippet}`.toLowerCase().includes(q)
    );
  }
  if (type) sources = sources.filter((s) => s.sourceType === type);
  return json({ ebookId: ebook.id, sources, rejectedSources: ebook.rejectedSources || [] });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  const url = new URL(req.url);
  const sourceId = Number(url.searchParams.get("sourceId"));
  if (!Number.isFinite(sourceId)) return bad("sourceId required");
  const ok = removeSourceRow(ebook.id, sourceId);
  if (!ok) return bad("Source not found", 404);
  const fresh = getEbook(ebook.id, auth.user.id)!;
  return json({ ebook: clientEbook(fresh), removed: sourceId });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  let body: { url?: string; action?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.action === "refresh") {
    const fresh = getEbook(ebook.id, auth.user.id)!;
    return json({ ebook: clientEbook(fresh), status: "refreshed" });
  }

  if (body.action === "regenerate") {
    const blocked = limit(req, `gen:${auth.user.id}`, Number(process.env.RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000);
    if (blocked) return blocked;
    const active = getActiveJob(ebook.id) || (isRunning(ebook.id) ? getLatestJob(ebook.id) : null);
    if (active && isRunning(ebook.id)) {
      return json({
        jobId: active.id,
        ebookId: ebook.id,
        status: "already-running",
        reused: true,
        message: "A job is already running for this ebook.",
      });
    }
    const job = createJob(ebook.id, auth.user.id, "research");
    startResearch(ebook.id, job.id, { forceOutline: false, replaceSources: true });
    return json({ jobId: job.id, ebookId: ebook.id, status: "started" });
  }

  const url = (body.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return bad("Provide a valid http(s) URL.");
  const readable = await extractReadable(url);
  if (!readable) return bad("Source unavailable — finding another reliable source.");
  const profile = buildTopicProfile(ebook.settings.topic || ebook.title, {
    category: ebook.analysis?.category,
    type: ebook.settings.type,
  });
  const ev = evaluateCandidate(
    {
      title: readable.title,
      url,
      snippet: readable.text.slice(0, 400),
      extractedText: readable.text.slice(0, 6000),
    },
    profile,
    { researchQuestions: ebook.analysis?.researchQuestions, outlineTitles: ebook.outline.map((o) => o.title) }
  );
  if (!ev.accepted || ev.relevanceScore < MIN_RELEVANCE) {
    return bad(ev.rejectionReason || "Source is not semantically relevant to this ebook topic.", 422);
  }
  const sourceId = nextSourceId();
  const { finalizeSourceRecord } = await import("@/lib/research/citation");
  addSourceRow(ebook.id, finalizeSourceRecord({
    id: sourceId,
    title: readable.title,
    organization: organizationFromDomain(url),
    url,
    domain: organizationFromDomain(url),
    snippet: readable.text.slice(0, 240),
    extractedText: readable.text.slice(0, 16000),
    retrievedAt: nowIso(),
    tier: sourceTier(url),
    score: ev.relevanceScore,
    used: true,
    relevanceScore: ev.relevanceScore,
    authorityScore: ev.authorityScore,
    primarySource: ev.primarySource,
    academicSource: ev.academicSource,
    reasonForInclusion: ev.reasonForInclusion,
    publisher: organizationFromDomain(url),
    sourceType: ev.primarySource ? "primary" : ev.academicSource ? "scholarly" : "secondary",
    identifier: url,
    verificationStatus: "verified",
    reliabilityNote: ev.reasonForInclusion,
  }));
  const fresh = getEbook(ebook.id, auth.user.id)!;
  return json({ ebook: clientEbook(fresh), sourceId });
}
