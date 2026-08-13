import { getEbook, updateEbook, saveChapters, clientEbook } from "@/lib/ebooks";
import { applyFlagsToEbook, attachFlags, factCheckEbook } from "@/lib/generate/factcheck";
import { requireUser, json, bad, limit } from "@/lib/api";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `fc:${auth.user.id}`, 10, 60 * 60 * 1000);
  if (blocked) return blocked;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  if (!ebook.chapters.length) return bad("Generate the ebook before fact-checking.");

  let body: { applyIds?: string[]; flags?: never } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.applyIds?.length && (ebook as any)._lastFlags) {
    /* apply handled below with flags in body */
  }

  if (Array.isArray((body as any).apply) && Array.isArray((body as any).flags)) {
    const next = applyFlagsToEbook(ebook, (body as any).flags, (body as any).apply);
    saveChapters(ebook.id, next.chapters);
    updateEbook(ebook.id, {
      introduction: next.introduction,
      conclusion: next.conclusion,
      chapters: next.chapters,
    });
    const fresh = getEbook(ebook.id, auth.user.id)!;
    return json({ ebook: clientEbook(fresh), applied: true });
  }

  updateEbook(ebook.id, { progress: { ...ebook.progress, message: "Fact checking..." } });
  const flags = await factCheckEbook(ebook);
  const chapters = attachFlags(ebook, flags);
  saveChapters(ebook.id, chapters);
  updateEbook(ebook.id, { chapters, status: ebook.status === "complete" ? "complete" : ebook.status });
  const fresh = getEbook(ebook.id, auth.user.id)!;
  return json({
    ebook: clientEbook(fresh),
    flags,
    summary: {
      verified: flags.filter((f) => f.status === "verified").length,
      needs_review: flags.filter((f) => f.status === "needs_review" || f.status === "partial").length,
      unsupported: flags.filter((f) => f.status === "unsupported").length,
      contested: flags.filter((f) => f.status === "contested").length,
      supported: flags.filter((f) => f.displayStatus === "Supported").length,
      partial: flags.filter((f) => f.displayStatus === "Partially supported").length,
    },
  });
}
