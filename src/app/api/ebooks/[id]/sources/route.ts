import { getEbook, clientEbook, addSourceRow } from "@/lib/ebooks";
import { nowIso, nextSourceId } from "@/lib/db";
import { extractReadable } from "@/lib/research/extract";
import { organizationFromDomain, sourceTier, scoreSource } from "@/lib/research/rank";
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
    score: scoreSource({
      url,
      title: readable.title,
      snippet: readable.text.slice(0, 240),
      topic: ebook.title,
      extractedLen: readable.text.length,
    }),
    used: true,
  });
  const fresh = getEbook(ebook.id, auth.user.id)!;
  return json({ ebook: clientEbook(fresh), sourceId });
}
