import fs from "fs";
import path from "path";
import { getEbook, updateEbook, clientEbook } from "@/lib/ebooks";
import { requireUser, json, bad, limit } from "@/lib/api";
import { escapeHtml } from "@/lib/simple-flow";

const MAX = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `coverimg:${auth.user.id}`, 20, 60 * 60 * 1000);
  if (blocked) return blocked;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return bad("Choose a JPG or PNG image.");
  if (file.size > MAX) return bad("Image is too large (max 8 MB).");
  const type = file.type || "";
  const name = file.name.toLowerCase();
  const extOk = [".jpg", ".jpeg", ".png", ".webp"].some((e) => name.endsWith(e));
  if (!extOk && !ALLOWED.has(type)) return bad("Upload a JPG, PNG, or WEBP image.");

  const buf = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), "data", "covers");
  fs.mkdirSync(dir, { recursive: true });
  const ext = name.endsWith(".webp") ? ".webp" : name.endsWith(".png") ? ".png" : ".jpg";
  const pngPath = path.join(dir, `${ebook.id}-custom${ext}`);
  fs.writeFileSync(pngPath, buf);

  const title = escapeHtml(ebook.customTitle || ebook.title);
  const subtitle = escapeHtml(ebook.subtitle || "");
  const author = escapeHtml(ebook.settings.authorName || "");
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const href = `data:${mime};base64,${buf.toString("base64")}`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
  <rect width="800" height="1200" fill="#1C1410"/>
  <image href="${href}" x="0" y="0" width="800" height="1200" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="820" width="800" height="380" fill="rgba(18,13,10,0.72)"/>
  <text x="56" y="900" fill="#F6F0E6" font-size="42" font-family="Georgia, serif">${title.slice(0, 48)}</text>
  <text x="56" y="950" fill="#C4B09A" font-size="20" font-family="Georgia, serif">${subtitle.slice(0, 70)}</text>
  <text x="56" y="1120" fill="#D4BC6E" font-size="16" font-family="Georgia, serif">${author}</text>
</svg>`;

  const next = updateEbook(ebook.id, {
    cover: { style: ebook.settings.coverStyle, svg, pngPath },
  });
  return json({ ebook: next ? clientEbook(next) : null, message: "Cover image saved." });
}
