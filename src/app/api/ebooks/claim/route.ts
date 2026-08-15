import { claimLocalDraft, clientEbook } from "@/lib/ebooks";
import { requireUser, bad, json } from "@/lib/api";
import { checkOrigin } from "@/lib/security";
import { settingsSchema } from "@/lib/validation";
import { DEFAULT_SETTINGS } from "@/lib/types";

/**
 * One-time recovery endpoint for the optional offline create-form draft.
 * SQLite remains canonical: the response is sent only after the owned ebook
 * row and full document have committed successfully.
 */
export async function POST(req: Request) {
  if (!checkOrigin(req)) return bad("Invalid origin", 403);
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  if (auth.user.isGuest) return bad("Sign in or create an account before recovering a draft.", 403);

  let body: any;
  try { body = await req.json(); } catch { return bad("Invalid JSON"); }
  const draft = body?.draft;
  if (!draft || typeof draft.id !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(draft.id)) {
    return bad("Invalid local draft ID.");
  }
  const settings = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(draft.settings || {}) });
  if (!settings.success) return bad(settings.error.issues[0]?.message || "Invalid local draft.");
  if (draft.sourceMaterial?.text && typeof draft.sourceMaterial.text !== "string") return bad("Invalid draft content.");

  try {
    const result = claimLocalDraft(auth.user.id, {
      id: draft.id,
      updatedAt: typeof draft.updatedAt === "string" ? draft.updatedAt : undefined,
      settings: settings.data,
      sourceMaterial: draft.sourceMaterial,
    });
    return json({ ebook: clientEbook(result.ebook), created: result.created, reused: !result.created }, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof Error && error.message === "EBOOK_FORBIDDEN") {
      return bad("That ebook belongs to another account.", 403);
    }
    throw error;
  }
}
