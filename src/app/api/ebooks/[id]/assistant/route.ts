import { getEbook, updateEbook, clientEbook, saveChapters } from "@/lib/ebooks";
import { requireUser, json, bad } from "@/lib/api";
import { regenerateChapter } from "@/lib/generate/runner";
import { attachFlags, factCheckEbook } from "@/lib/generate/factcheck";
import { coverAuthor, coverSvg, renderCoverPng } from "@/lib/generate/cover";
import { chat, aiConfigured, RESEARCH_WRITER_SYSTEM } from "@/lib/ai";
import { markdownToHtml } from "@/lib/generate/write";
import path from "path";

function parseIntent(text: string) {
  const t = text.toLowerCase();
  const chMatch = text.match(/(?:chapter|ch|अध्याय)\s*(\d+)/i);
  const chapter = chMatch ? Number(chMatch[1]) - 1 : undefined;
  if (/cover|कवर/.test(t)) return { action: "cover" as const, chapter };
  if (/fact.?check|तथ्य|fact check/.test(t)) return { action: "factcheck" as const, chapter };
  if (/timeline|टाइमलाइन/.test(t)) return { action: "timeline" as const, chapter: chapter ?? 0 };
  if (/beginner|आसान|simplify|सरल|पूरी किताब को beginner/.test(t) && chapter == null) {
    return { action: "simplify-all" as const, chapter };
  }
  if (/छोटा|shorten|छोटा करो|छोटा कर/.test(t)) return { action: "simplify" as const, chapter: chapter ?? 0 };
  if (/आसान|simplify/.test(t)) return { action: "simplify" as const, chapter: chapter ?? 0 };
  if (/evidence|स्रोत|historical|प्रमाण|detail|विस्तार/.test(t)) return { action: "detail" as const, chapter: chapter ?? 0 };
  if (/regenerate|फिर से लिख|नया लिख/.test(t)) return { action: "regenerate" as const, chapter: chapter ?? 0 };
  if (/image|चित्र|तस्वीर/.test(t)) return { action: "image" as const, chapter: chapter ?? 0 };
  return { action: "edit" as const, chapter, instruction: text };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const found = getEbook(params.id, auth.user.id);
  if (!found) return bad("Ebook not found", 404);
  const ebook = found;

  let body: { message?: string; instruction?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const message = String(body.message || body.instruction || "").trim();
  if (message.length < 2) return bad("Please say what you want to change.");

  const intent = parseIntent(message);
  const replies: string[] = [];

  if (intent.action === "cover") {
    const svg = coverSvg({
      title: ebook.customTitle || ebook.title,
      subtitle: ebook.subtitle,
      author: coverAuthor(ebook.settings),
      style: ebook.settings.coverStyle,
      language: ebook.outputLanguage || ebook.language,
      category: ebook.analysis?.category || "general",
    });
    let pngPath: string | undefined;
    try {
      pngPath = await renderCoverPng(svg, path.join(process.cwd(), "data", "covers", `${ebook.id}.png`));
    } catch {
      /* ignore */
    }
    const next = updateEbook(ebook.id, { cover: { style: ebook.settings.coverStyle, svg, pngPath } });
    return json({ ebook: next ? clientEbook(next) : null, message: "Cover updated." });
  }

  if (intent.action === "factcheck") {
    const flags = await factCheckEbook(ebook);
    const chapters = attachFlags(ebook, flags);
    saveChapters(ebook.id, chapters);
    updateEbook(ebook.id, { chapters });
    return json({
      ebook: clientEbook(getEbook(ebook.id, auth.user.id)!),
      message: "Fact check finished.",
      flags,
    });
  }

  async function rewriteChapter(idx: number, action: string, instruction?: string) {
    if (!ebook.chapters[idx] && action === "regenerate") {
      await regenerateChapter(ebook.id, idx, instruction);
      return;
    }
    if (action === "regenerate") {
      await regenerateChapter(ebook.id, idx, instruction);
      return;
    }
    const urlAction = action === "detail" ? "detail" : action === "image" ? "add-image" : "simplify";
    if (urlAction === "add-image") {
      const { buildChapterVisuals, insertFiguresIntoChapter } = await import("@/lib/generate/images");
      const chapter = ebook.chapters[idx];
      if (!chapter) return;
      const visuals = await buildChapterVisuals({
        ebookId: ebook.id,
        chapterIndex: idx,
        item: ebook.outline[idx],
        lang: ebook.outputLanguage || ebook.language,
        commons: [],
        includeImages: true,
      });
      if (visuals[0]) chapter.images = [...(chapter.images || []), visuals[0]];
      insertFiguresIntoChapter(chapter, ebook.outputLanguage || ebook.language);
      const chapters = ebook.chapters.slice();
      chapters[idx] = chapter;
      saveChapters(ebook.id, chapters);
      updateEbook(ebook.id, { chapters });
      return;
    }
    if (!aiConfigured()) {
      if (urlAction === "simplify" && ebook.chapters[idx]) {
        const ch = ebook.chapters[idx];
        ch.sections = ch.sections.map((s) => ({
          ...s,
          html: s.html.replace(/\b(however|therefore|consequently|moreover)\b/gi, "so"),
        }));
        saveChapters(ebook.id, ebook.chapters);
        updateEbook(ebook.id, { chapters: ebook.chapters });
      } else {
        await regenerateChapter(ebook.id, idx, instruction || message);
      }
      return;
    }
    const chapter = ebook.chapters[idx];
    if (!chapter) {
      await regenerateChapter(ebook.id, idx, instruction || message);
      return;
    }
    const raw = await chat(
      [
        { role: "system", content: RESEARCH_WRITER_SYSTEM },
        {
          role: "user",
          content: `${instruction || message}

Keep citations [n] and facts. Return JSON { title, sections: [{heading, markdown}], summary, keyPoints }.

CHAPTER:
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
    const m = raw?.match(/\{[\s\S]*\}/);
    if (!m) {
      await regenerateChapter(ebook.id, idx, instruction || message);
      return;
    }
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
      ebook.chapters[idx] = chapter;
      saveChapters(ebook.id, ebook.chapters);
      updateEbook(ebook.id, { chapters: ebook.chapters });
    } catch {
      await regenerateChapter(ebook.id, idx, instruction || message);
    }
  }

  if (intent.action === "simplify-all") {
    for (let i = 0; i < ebook.chapters.length; i++) {
      await rewriteChapter(i, "simplify", "Make the whole chapter beginner-friendly. Keep facts and citations.");
    }
    replies.push("The book is now easier to read.");
  } else if (intent.action === "timeline") {
    await rewriteChapter(intent.chapter ?? 0, "image", message);
    replies.push("A timeline image was added.");
  } else if (intent.chapter != null && intent.chapter >= 0 && intent.chapter < Math.max(ebook.outline.length, ebook.chapters.length)) {
    await rewriteChapter(intent.chapter, intent.action === "edit" ? "edit" : intent.action, message);
    replies.push(`Chapter ${intent.chapter + 1} updated.`);
  } else if (intent.action === "edit" && aiConfigured() && ebook.chapters.length) {
    await rewriteChapter(0, "edit", message);
    replies.push("Applied your edit.");
  } else if (intent.action === "edit") {
    const idx = 0;
    if (ebook.outline[idx]) await regenerateChapter(ebook.id, idx, message);
    replies.push("Updated the first chapter with your instruction.");
  } else {
    replies.push("I could not apply that change. Try a simpler request, like “Chapter 3 छोटा करो”.");
  }

  const next = getEbook(ebook.id, auth.user.id);
  return json({ ebook: next ? clientEbook(next) : null, message: replies.join(" ") });
}
