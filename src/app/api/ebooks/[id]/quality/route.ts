import { getEbook } from "@/lib/ebooks";
import { requireUser, json, bad } from "@/lib/api";
import { scoreBook } from "@/lib/quality";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  return json({ report: scoreBook(ebook) });
}
