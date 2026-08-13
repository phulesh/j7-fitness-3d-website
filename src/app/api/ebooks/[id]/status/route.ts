import { getEbook, getLatestJob } from "@/lib/ebooks";
import { requireUser, json, bad } from "@/lib/api";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const ebook = getEbook(params.id, auth.user.id);
  if (!ebook) return bad("Ebook not found", 404);
  const job = getLatestJob(ebook.id);
  return json({
    status: ebook.status,
    progress: ebook.progress,
    error: ebook.error,
    job,
    chapterCount: ebook.chapterCount,
    wordCount: ebook.wordCount,
    outline: ebook.outline,
    title: ebook.title,
    ebookId: ebook.ebookId || ebook.id,
    language: ebook.outputLanguage || ebook.language,
    researchQuestions: ebook.researchQuestions || ebook.analysis?.researchQuestions || [],
    lastCompletedStage: ebook.lastCompletedStage,
    sources: ebook.sources.map((s) => ({
      id: s.id,
      title: s.title,
      organization: s.organization,
      url: s.url,
      tier: s.tier,
      used: s.used,
      snippet: s.snippet,
      relevanceScore: s.relevanceScore,
      authorityScore: s.authorityScore,
      primarySource: s.primarySource,
      academicSource: s.academicSource,
      reasonForInclusion: s.reasonForInclusion,
    })),
    rejectedSources: ebook.rejectedSources || [],
    researchQuality: ebook.researchQuality,
  });
}
