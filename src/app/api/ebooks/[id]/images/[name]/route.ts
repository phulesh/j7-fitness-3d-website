import fs from "fs";
import path from "path";
import { getEbook } from "@/lib/ebooks";
import { requireUser, bad } from "@/lib/api";

export async function GET(req: Request, { params }: { params: { id: string; name: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  const safe = path.basename(params.name);
  if (!/^[\w.-]+$/.test(safe)) return bad("Invalid image name", 400);
  const file = path.join(process.cwd(), "data", "images", ebook.id, safe);
  if (!fs.existsSync(file)) return bad("Image not found", 404);
  const buf = fs.readFileSync(file);
  const ext = path.extname(safe).toLowerCase();
  const types: Record<string, string> = {
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  const type = types[ext];
  if (!type) return bad("Unsupported image type", 415);
  return new Response(buf, {
    headers: { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" },
  });
}
