import path from "path";
import { getEbook, updateEbook, clientEbook } from "@/lib/ebooks";
import { coverAuthor, coverSvg, renderCoverPng } from "@/lib/generate/cover";
import { requireUser, json, bad } from "@/lib/api";
import { COVER_STYLES, type CoverStyle } from "@/lib/types";
import { isHindiOutput } from "@/lib/language";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);

  let body: { style?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const hindi = isHindiOutput(ebook.outputLanguage || ebook.language);
  const style = (body.style && COVER_STYLES.includes(body.style as CoverStyle) ? body.style : ebook.settings.coverStyle) as CoverStyle;
  const title = (ebook.customTitle || ebook.title || ebook.settings.customTitle || ebook.settings.topic || "").trim();
  const subtitle = ebook.subtitle || ebook.settings.subtitle || "";
  const author = coverAuthor(ebook.settings);

  try {
    const svg = coverSvg({
      title,
      subtitle,
      author,
      style,
      language: ebook.outputLanguage || ebook.language,
      category: ebook.analysis?.category || "general",
    });
    let pngPath: string | undefined;
    try {
      pngPath = await renderCoverPng(svg, path.join(process.cwd(), "data", "covers", `${ebook.id}.png`));
    } catch (e) {
      console.error("cover png", e);
    }
    const next = updateEbook(ebook.id, {
      cover: { style, svg, pngPath },
      settings: { ...ebook.settings, coverStyle: style },
    });
    return json({
      ebookId: ebook.id,
      ebook: next ? clientEbook(next) : null,
      status: "ok",
      message: hindi ? "कवर तैयार हो गया।" : "Cover updated.",
    });
  } catch (e: any) {
    return bad(hindi ? "कवर तैयार नहीं हो सका। पुनः प्रयास करें।" : e.message || "Cover generation failed. Please retry.", 500);
  }
}
