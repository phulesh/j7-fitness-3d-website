import { createEbook, listEbooks, clientEbook } from "@/lib/ebooks";
import { settingsSchema } from "@/lib/validation";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { requireUser, json, bad, limit } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const items = listEbooks(auth.user.id).map((e) => ({
    id: e.id,
    title: e.title,
    subtitle: e.subtitle,
    language: e.language,
    type: e.type,
    status: e.status,
    wordCount: e.wordCount,
    chapterCount: e.chapterCount,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    coverSvg: e.cover?.svg?.slice(0, 0),
    progress: e.progress,
  }));
  return json({ ebooks: items });
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `create:${auth.user.id}`, Number(process.env.RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000);
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(body as object) });
  if (!parsed.success) return bad(parsed.error.issues[0]?.message || "Invalid settings");
  const ebook = createEbook(auth.user.id, parsed.data);
  return json({ ebook: clientEbook(ebook) }, 201);
}
