import fs from "fs";
import path from "path";
import { getEbook, recordDownload } from "@/lib/ebooks";
import { exportPdf } from "@/lib/export/pdf";
import { exportDocx } from "@/lib/export/docx";
import { exportEpub } from "@/lib/export/epub";
import { exportFlipbook, exportStandaloneFlipbookHtml } from "@/lib/export/flipbook";
import { requireUser, bad } from "@/lib/api";
import { safeFilename } from "@/lib/security";
import { renderCoverPng } from "@/lib/generate/cover";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  if (ebook.status !== "complete" && !ebook.chapters.length) {
    return bad("Generate the ebook before downloading.");
  }

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "pdf").toLowerCase();
  if (!["pdf", "docx", "epub", "3d", "html"].includes(format)) return bad("Format must be pdf, docx, epub, 3d, or html.");

  const dir = path.join(process.cwd(), "data", "exports");
  fs.mkdirSync(dir, { recursive: true });
  const asciiBase = `${safeFilename(ebook.title).replace(/[^\x20-\x7E]/g, "").trim() || "ebook"}-${ebook.id.slice(0, 6)}`;
  const base = asciiBase;
  const exportExtension = format === "3d" ? "zip" : format;
  const dest = path.join(dir, `${base}.${exportExtension}`);
  const types: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    epub: "application/epub+zip",
    "3d": "application/zip",
    html: "text/html; charset=utf-8",
  };
  const cachedPaths: Record<string, string | undefined> = {
    pdf: ebook.exports?.pdf,
    docx: ebook.exports?.docx,
    epub: ebook.exports?.epub,
    html: ebook.exports?.html,
    "3d": ebook.exports?.flipbook,
  };
  const cached = cachedPaths[format];
  if (ebook.status === "complete" && cached && fs.existsSync(cached)) {
    recordDownload(ebook.id, auth.user.id, format, cached);
    return new Response(fs.readFileSync(cached), {
      headers: {
        "Content-Type": types[format],
        "Content-Disposition": `attachment; filename="${base}${format === "3d" ? "-3D-BOOK" : ""}.${exportExtension}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (ebook.cover?.svg && !ebook.cover.pngPath) {
    try {
      const png = await renderCoverPng(ebook.cover.svg, path.join(process.cwd(), "data", "covers", `${ebook.id}.png`));
      ebook.cover.pngPath = png;
    } catch {
      /* ignore */
    }
  }

  try {
    if (format === "pdf") await exportPdf(ebook, dest);
    else if (format === "docx") await exportDocx(ebook, dest);
    else if (format === "epub") await exportEpub(ebook, dest);
    else if (format === "html") fs.writeFileSync(dest, await exportStandaloneFlipbookHtml(ebook));
    else fs.writeFileSync(dest, await exportFlipbook(ebook));
  } catch (err) {
    console.error("export failed", err);
    return bad("Export service temporarily unavailable. Your ebook data has been saved. Please retry.", 503);
  }

  recordDownload(ebook.id, auth.user.id, format, dest);
  const buf = fs.readFileSync(dest);
  return new Response(buf, {
    headers: {
      "Content-Type": types[format],
      "Content-Disposition": `attachment; filename="${base}${format === "3d" ? "-3D-Ebook" : ""}.${exportExtension}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
