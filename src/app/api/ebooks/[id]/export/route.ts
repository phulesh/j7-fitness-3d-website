import fs from "fs";
import path from "path";
import { getEbook, recordDownload } from "@/lib/ebooks";
import { exportPdf } from "@/lib/export/pdf";
import { exportDocx } from "@/lib/export/docx";
import { exportEpub } from "@/lib/export/epub";
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
  if (!["pdf", "docx", "epub"].includes(format)) return bad("Format must be pdf, docx, or epub.");

  const dir = path.join(process.cwd(), "data", "exports");
  fs.mkdirSync(dir, { recursive: true });
  const asciiBase = `${safeFilename(ebook.title).replace(/[^\x20-\x7E]/g, "").trim() || "ebook"}-${ebook.id.slice(0, 6)}`;
  const base = asciiBase;
  const dest = path.join(dir, `${base}.${format}`);

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
    else await exportEpub(ebook, dest);
  } catch (err) {
    console.error("export failed", err);
    return bad("Export service temporarily unavailable. Your ebook data has been saved. Please retry.", 503);
  }

  recordDownload(ebook.id, auth.user.id, format, dest);
  const buf = fs.readFileSync(dest);
  const types: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    epub: "application/epub+zip",
  };
  return new Response(buf, {
    headers: {
      "Content-Type": types[format],
      "Content-Disposition": `attachment; filename="${base}.${format}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
