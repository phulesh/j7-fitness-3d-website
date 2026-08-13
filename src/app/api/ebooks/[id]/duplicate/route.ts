import { duplicateEbook, clientEbook } from "@/lib/ebooks";
import { requireUser, json, bad, limit } from "@/lib/api";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `dup:${auth.user.id}`, 30, 60 * 60 * 1000);
  if (blocked) return blocked;
  const copy = duplicateEbook(params.id, auth.user.id);
  if (!copy) return bad("Ebook not found", 404);
  return json({ ebook: clientEbook(copy) }, 201);
}
