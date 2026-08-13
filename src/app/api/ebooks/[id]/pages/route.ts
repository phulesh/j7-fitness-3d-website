import { getEbook } from "@/lib/ebooks";
import { buildBookPages } from "@/lib/book/pages";
import { requireUser, json, bad } from "@/lib/api";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  const pages = buildBookPages(ebook);
  return json({
    ebookId: ebook.ebookId || ebook.id,
    title: ebook.title,
    subtitle: ebook.subtitle,
    language: ebook.outputLanguage || ebook.language,
    coverSvg: ebook.cover?.svg || "",
    pageCount: pages.length,
    pages,
  });
}
