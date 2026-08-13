import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { requireUser, json, bad, limit } from "@/lib/api";
import { validateUpload } from "@/lib/security";
import { parseSyllabusText } from "@/lib/generate/analyze";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `upload:${auth.user.id}`, 30, 60 * 60 * 1000);
  if (blocked) return blocked;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return bad("Choose a PDF, DOCX, or TXT file.");
  const check = validateUpload(file);
  if (!check.ok) return bad(check.error);

  const buf = Buffer.from(await file.arrayBuffer());
  // Reject obvious executables
  if (buf.slice(0, 2).toString() === "MZ" || buf.slice(0, 4).toString("hex") === "7f454c46") {
    return bad("This file type is not allowed.");
  }

  const dir = path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(file.name).toLowerCase() || ".bin";
  const stored = path.join(dir, `${auth.user.id}-${nanoid(10)}${ext}`);
  fs.writeFileSync(stored, buf);

  let text = "";
  try {
    if (ext === ".txt" || ext === ".md") {
      text = buf.toString("utf8");
    } else if (ext === ".pdf") {
      const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text: string }>;
      const parsed = await pdfParse(buf);
      text = parsed.text || "";
    } else if (ext === ".docx") {
      const mammoth = await import("mammoth");
      const parsed = await mammoth.extractRawText({ buffer: buf });
      text = parsed.value || "";
    } else if (ext === ".doc") {
      text = buf.toString("utf8").replace(/[^\x09\x0a\x0d\x20-\x7E\u00A0-\uFFFF]/g, " ");
    }
  } catch (e) {
    return bad("Could not read that document. Try a TXT or a simpler PDF.");
  }

  text = text.replace(/\x00/g, "").slice(0, 200_000);
  if (text.trim().length < 40) return bad("The document did not contain enough readable text.");

  const syllabus = parseSyllabusText(text);
  syllabus.fromUpload = true;
  syllabus.sourceTitle = file.name;
  syllabus.lastVerified = new Date().toISOString().slice(0, 10);

  return json({
    filename: file.name,
    text: text.slice(0, 20_000),
    syllabus,
  });
}
