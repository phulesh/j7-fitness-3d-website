import { createEbook, listEbooks, clientEbook, findRecentDuplicateDraft, findOperation, recordOperation } from "@/lib/ebooks";
import { settingsSchema } from "@/lib/validation";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { requireUser, json, bad, limit } from "@/lib/api";
import { normalizeOutputLanguage } from "@/lib/language";
import { nanoid } from "nanoid";
import { nowIso } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || undefined;
  const language = url.searchParams.get("language") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const sort = url.searchParams.get("sort") || undefined;
  const items = listEbooks(auth.user.id, { q, language, status, sort }).map((e) => ({
    id: e.ebookId || e.id,
    ebookId: e.ebookId || e.id,
    title: e.title,
    customTitle: e.customTitle,
    subtitle: e.subtitle,
    language: e.outputLanguage || e.language,
    outputLanguage: e.outputLanguage || e.language,
    type: e.type,
    status: e.status,
    wordCount: e.wordCount,
    chapterCount: e.chapterCount,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    coverSvg: e.cover?.svg || "",
    coverStyle: e.cover?.style || e.settings?.coverStyle,
    progress: e.progress,
    lastCompletedStage: e.lastCompletedStage,
  }));
  return json({ ebooks: items });
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `create:${auth.user.id}`, Number(process.env.RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000);
  if (blocked) return blocked;

  const idempotencyKey = req.headers.get("idempotency-key") || req.headers.get("x-idempotency-key") || "";
  if (idempotencyKey) {
    const existingOp = findOperation(auth.user.id, idempotencyKey);
    if (existingOp?.ebookId) {
      const { getEbook } = await import("@/lib/ebooks");
      const existing = getEbook(existingOp.ebookId, auth.user.id);
      if (existing) return json({ ebook: clientEbook(existing), reused: true });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(body as object) });
  if (!parsed.success) return bad(parsed.error.issues[0]?.message || "Invalid settings");

  const settings = { ...parsed.data };
  if (settings.language && settings.language !== "auto") {
    settings.language = normalizeOutputLanguage(settings.language);
    settings.outputLanguage = settings.language;
  } else if (settings.outputLanguage && settings.outputLanguage !== "auto") {
    settings.outputLanguage = normalizeOutputLanguage(settings.outputLanguage);
    settings.language = settings.outputLanguage;
  }
  if (settings.customTitle && !settings.title) settings.title = settings.customTitle;

  const recent = findRecentDuplicateDraft(auth.user.id, settings.topic);
  if (recent) {
    return json({ ebook: clientEbook(recent), reused: true });
  }

  const ebook = createEbook(auth.user.id, settings);
  if (idempotencyKey) {
    recordOperation({
      id: nanoid(10),
      ebookId: ebook.id,
      userId: auth.user.id,
      kind: "create",
      idempotencyKey,
      status: "complete",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  return json({ ebook: clientEbook(ebook) }, 201);
}
