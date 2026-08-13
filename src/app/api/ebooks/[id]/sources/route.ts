import { getEbook, clientEbook, addSourceRow } from "@/lib/ebooks";
import { nowIso, nextSourceId } from "@/lib/db";
import { extractReadable } from "@/lib/research/extract";
import { organizationFromDomain, sourceTier } from "@/lib/research/rank";
import { buildTopicProfile, evaluateCandidate, MIN_RELEVANCE } from "@/lib/research/relevance";
import { requireUser, json, bad } from "@/lib/api";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
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
  addSourceRow(ebook.id, {
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
  });
  const fresh = getEbook(ebook.id, auth.user.id)!;
  return json({ ebook: clientEbook(fresh), sourceId });
}
