import { analyzeTopic, detectVagueness, parseSyllabusText } from "@/lib/generate/analyze";
import { settingsSchema } from "@/lib/validation";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { requireUser, json, bad, limit } from "@/lib/api";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const blocked = limit(req, `analyze:${auth.user.id}`, 40, 60 * 60 * 1000);
  if (blocked) return blocked;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  const parsed = settingsSchema.partial().safeParse(body);
  const topic = (body as any)?.topic as string;
  const syllabusRaw = String((body as any)?.syllabusText || "");
  const syllabus = syllabusRaw.trim().length > 40 ? parseSyllabusText(syllabusRaw) : null;
  if (!topic && syllabus) {
    return json({ analysis: null, vague: null, syllabus });
  }
  if (!topic) return bad("Topic is required");
  const vague = detectVagueness(topic);
  if (vague) return json({ vague, analysis: null, syllabus });
  const settings = { ...DEFAULT_SETTINGS, ...parsed.data, topic };
  const analysis = await analyzeTopic(settings);
  return json({ analysis, vague: null, syllabus });
}
