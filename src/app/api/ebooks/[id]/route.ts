import { deleteEbook, getEbook, updateEbook, clientEbook, saveChapters } from "@/lib/ebooks";
import { requireUser, json, bad } from "@/lib/api";
import { outlineSchema, settingsSchema } from "@/lib/validation";
import { coverSvg, renderCoverPng } from "@/lib/generate/cover";
import path from "path";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  return json({ ebook: clientEbook(ebook) });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.language === "string") {
    const { normalizeOutputLanguage } = await import("@/lib/language");
    const lang = body.language === "auto" ? "auto" : normalizeOutputLanguage(body.language);
    patch.language = lang;
    patch.outputLanguage = lang;
  }
  if (typeof body.outputLanguage === "string") {
    const { normalizeOutputLanguage } = await import("@/lib/language");
    patch.outputLanguage = body.outputLanguage === "auto" ? "auto" : normalizeOutputLanguage(body.outputLanguage);
    if (patch.outputLanguage !== "auto") patch.language = patch.outputLanguage;
  }
  if (typeof body.title === "string") patch.title = body.title.slice(0, 200);
  if (typeof body.customTitle === "string") {
    patch.customTitle = body.customTitle.slice(0, 200);
    if (!body.title) patch.title = patch.customTitle;
  }
  if (typeof body.subtitle === "string") patch.subtitle = body.subtitle.slice(0, 240);
  if (Array.isArray(body.researchQuestions)) patch.researchQuestions = body.researchQuestions.slice(0, 24);
  if (typeof body.introduction === "string") patch.introduction = body.introduction;
  if (typeof body.conclusion === "string") patch.conclusion = body.conclusion;
  if (typeof body.authorName === "string") {
    patch.settings = { ...ebook.settings, authorName: body.authorName.slice(0, 80) };
  }
  if (body.settings) {
    const parsed = settingsSchema.partial().safeParse(body.settings);
    if (parsed.success) {
      const { normalizeOutputLanguage } = await import("@/lib/language");
      const merged = { ...ebook.settings, ...parsed.data };
      if (merged.language && merged.language !== "auto") {
        merged.language = normalizeOutputLanguage(merged.language);
        merged.outputLanguage = merged.language;
        patch.language = merged.language;
        patch.outputLanguage = merged.language;
      }
      if (merged.customTitle) {
        merged.title = merged.customTitle;
        patch.customTitle = merged.customTitle;
        if (!body.title) patch.title = merged.customTitle;
      }
      patch.settings = merged;
    }
  }
  if (body.syllabus) {
    patch.syllabus = body.syllabus;
  }
  if (body.outline) {
    const parsed = outlineSchema.safeParse(body.outline);
    if (!parsed.success) return bad("Invalid outline");
    patch.outline = parsed.data;
    patch.chapterCount = parsed.data.length;
  }
  if (Array.isArray(body.chapters)) {
    patch.chapters = body.chapters;
    saveChapters(ebook.id, body.chapters);
  }
  if (body.coverStyle && patch.settings) {
    (patch.settings as any).coverStyle = body.coverStyle;
  }
  if (body.regenerateCover || body.coverStyle || body.title || body.subtitle || body.authorName) {
    const settings = (patch.settings as typeof ebook.settings) || ebook.settings;
    const title = (patch.title as string) || ebook.title;
    const subtitle = (patch.subtitle as string) || ebook.subtitle;
    const svg = coverSvg({
      title,
      subtitle,
      author: settings.includeAuthor ? settings.authorName || "Folio Research" : "",
      style: body.coverStyle || settings.coverStyle,
      language: ebook.language,
      category: ebook.analysis?.category || "general",
    });
    patch.cover = { style: body.coverStyle || settings.coverStyle, svg, pngPath: ebook.cover?.pngPath };
  }

  const next = updateEbook(ebook.id, patch as any);
  return json({ ebook: next ? clientEbook(next) : null });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ok = deleteEbook(params.id, auth.user.id);
  if (!ok) return bad("Ebook not found", 404);
  return json({ ok: true });
}
