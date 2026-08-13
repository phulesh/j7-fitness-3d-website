import { getEbook, updateEbook, saveChapters } from "@/lib/ebooks";
import { regenerateChapter } from "@/lib/generate/runner";
import { chat, aiConfigured, RESEARCH_WRITER_SYSTEM } from "@/lib/ai";
import { markdownToHtml } from "@/lib/generate/write";
import { requireUser, json, bad } from "@/lib/api";

export async function POST(req: Request, { params }: { params: { id: string; idx: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  const idx = Number(params.idx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= ebook.outline.length) return bad("Chapter not found", 404);

  let body: {
    action?: string;
    instruction?: string;
    language?: string;
    imageKind?: string;
    imageId?: string;
    caption?: string;
    credit?: string;
    alt?: string;
    url?: string;
    placement?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = body.action || "regenerate";

  if (action === "regenerate") {
    const ch = await regenerateChapter(ebook.id, idx, body.instruction);
    return json({ chapter: ch });
  }

  if (
    action === "add-image" ||
    action === "replace-image" ||
    action === "remove-image" ||
    action === "update-image"
  ) {
    const chapter = ebook.chapters[idx] || {
      id: ebook.outline[idx].id,
      index: idx,
      title: ebook.outline[idx].title,
      learningObjectives: [],
      sections: [],
      keyPoints: [],
      examples: [],
      commonMistakes: [],
      summary: "",
      questions: [],
      mcqs: [],
      images: [],
      sourceIds: [],
      wordCount: 0,
      status: "pending" as const,
    };
    const { nanoid } = await import("nanoid");
    const { buildChapterVisuals, imageActionMeta, insertFiguresIntoChapter } = await import(
      "@/lib/generate/images"
    );
    if (action === "remove-image") {
      chapter.images = (chapter.images || []).filter((img) => img.id !== body.imageId && img.url !== body.url);
    } else if (action === "update-image") {
      chapter.images = (chapter.images || []).map((img) =>
        img.id === body.imageId || img.url === body.url
          ? {
              ...img,
              caption: body.caption ?? img.caption,
              credit: body.credit ?? img.credit,
              alt: body.alt ?? img.alt,
              placement: (body.placement as any) || img.placement,
            }
          : img
      );
    } else {
      const kind = (body.imageKind || "illustration") as
        | "verified"
        | "illustration"
        | "map"
        | "timeline"
        | "infographic"
        | "comparison";
      const meta = imageActionMeta(kind, idx, chapter.title, ebook.outputLanguage || ebook.language);
      if (kind === "verified" && body.url && /^https?:\/\//i.test(body.url)) {
        const img = {
          id: nanoid(8),
          url: body.url,
          caption: body.caption || meta.caption,
          credit: body.credit || meta.credit,
          alt: body.alt || meta.alt,
          license: "Source URL provided by editor",
          sourceUrl: body.url,
          imageType: meta.imageType,
          verifiedHistoricalPhoto: true,
          chapterIndex: idx,
          figureLabel: meta.caption,
        };
        if (action === "replace-image" && body.imageId) {
          chapter.images = (chapter.images || []).map((x) => (x.id === body.imageId ? img : x));
        } else {
          chapter.images = [...(chapter.images || []), img];
        }
      } else {
        const visuals = await buildChapterVisuals({
          ebookId: ebook.id,
          chapterIndex: idx,
          item: ebook.outline[idx],
          lang: ebook.outputLanguage || ebook.language,
          commons: [],
          includeImages: true,
        });
        const pick = visuals.find((v) => v.imageType === meta.imageType) || visuals[0];
        if (pick) {
          if (action === "replace-image" && body.imageId) {
            chapter.images = (chapter.images || []).map((x) => (x.id === body.imageId ? pick : x));
          } else {
            chapter.images = [...(chapter.images || []), pick];
          }
        }
      }
    }
    chapter.sections = chapter.sections.map((s) => ({
      ...s,
      html: s.html.replace(/<figure class="ebook-figure"[\s\S]*?<\/figure>/g, ""),
    }));
    insertFiguresIntoChapter(chapter, ebook.outputLanguage || ebook.language);
    const chapters = ebook.chapters.slice();
    chapters[idx] = chapter;
    saveChapters(ebook.id, chapters);
    updateEbook(ebook.id, { chapters });
    return json({ chapter, ebookId: ebook.id });
  }

  const chapter = ebook.chapters[idx];
  if (!chapter) return bad("Chapter not generated yet");

  const verbs: Record<string, string> = {
    improve: "Improve the prose while keeping every factual claim and citation [n] unchanged. Do not add new facts.",
    simplify: "Simplify the language for a younger or beginner reader. Keep citations and facts. Do not add new facts.",
    detail: "Make the chapter more detailed using ONLY the existing text — expand explanations of already-stated ideas. Do not invent facts, names, numbers, or sources.",
    translate: `Translate the chapter into ${body.language || ebook.language}. Preserve citations [n], headings, and factual content exactly.`,
  };
  if (!verbs[action]) return bad("Unknown action");

  if (!aiConfigured()) {
    if (action === "simplify") {
      chapter.sections = chapter.sections.map((s) => ({
        ...s,
        html: s.html.replace(/\b(however|therefore|consequently|moreover)\b/gi, "so"),
      }));
      saveChapters(ebook.id, ebook.chapters);
      updateEbook(ebook.id, { chapters: ebook.chapters });
      return json({ chapter, note: "Applied a light local simplification. Connect AI_API_KEY for richer rewriting." });
    }
    return bad("This rewrite needs an AI key (AI_API_KEY). Use Regenerate Chapter to rebuild from sources.");
  }

  const raw = await chat(
    [
      { role: "system", content: RESEARCH_WRITER_SYSTEM },
      {
        role: "user",
        content: `${verbs[action]}

Return JSON { title, sections: [{heading, markdown}], summary, keyPoints }.

CHAPTER JSON:
${JSON.stringify({
  title: chapter.title,
  sections: chapter.sections.map((s) => ({ heading: s.heading, html: s.html })),
  summary: chapter.summary,
  keyPoints: chapter.keyPoints,
})}`,
      },
    ],
    { maxTokens: 3500, temperature: 0.3 }
  );
  if (!raw) return bad("Rewrite failed. Try again.");
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return bad("Rewrite failed to parse.");
  try {
    const parsed = JSON.parse(m[0]);
    chapter.title = parsed.title || chapter.title;
    if (Array.isArray(parsed.sections)) {
      chapter.sections = parsed.sections.map((s: any, i: number) => ({
        id: chapter.sections[i]?.id || `s${i}`,
        heading: String(s.heading || chapter.sections[i]?.heading || "Section"),
        html: markdownToHtml(String(s.markdown || s.html || "")),
        sourceIds: chapter.sections[i]?.sourceIds || [],
      }));
    }
    if (parsed.summary) chapter.summary = String(parsed.summary);
    if (Array.isArray(parsed.keyPoints)) chapter.keyPoints = parsed.keyPoints.map(String);
    ebook.chapters[idx] = chapter;
    saveChapters(ebook.id, ebook.chapters);
    updateEbook(ebook.id, { chapters: ebook.chapters });
    return json({ chapter });
  } catch {
    return bad("Rewrite failed to parse.");
  }
}
