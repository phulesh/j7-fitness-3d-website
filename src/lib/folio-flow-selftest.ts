import { createEbook, deleteEbook, getEbook, updateEbook, createJob } from "./ebooks";
import { ensureSelftestUser } from "./selftest-user";
import { startResearch, isRunning, regenerateOutlineForEbook } from "./generate/runner";
import { coverSvg, coverAuthor } from "./generate/cover";
import { DEFAULT_SETTINGS } from "./types";
import { ACHHOOT_HINDI_TITLES } from "./generate/outline";
import { composeHindiChapter } from "./generate/hindi";
import { insertFiguresIntoChapter, buildChapterVisuals } from "./generate/images";
import { buildBookPages } from "./book/pages";
import { exportPdf } from "./export/pdf";
import { exportDocx } from "./export/docx";
import { exportEpub } from "./export/epub";
import fs from "fs";
import path from "path";

const TOPIC = "अछूत कौन थे और अछूत कैसे बने?";

async function waitForIdle(ebookId: string, ms = 120000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (!isRunning(ebookId)) return getEbook(ebookId);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for research job");
}

async function main() {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const userId = "flow-selftest";
  ensureSelftestUser(userId);
  const ebook = createEbook(userId, {
    ...DEFAULT_SETTINGS,
    topic: TOPIC,
    title: TOPIC,
    customTitle: TOPIC,
    language: "hi",
    outputLanguage: "hi",
    type: "Research-Based Book",
    chapterCount: 14,
    audience: "Researchers",
    difficulty: "Advanced",
    coverStyle: "Historical",
    authorName: "",
    includeAuthor: false,
  });
  const id = ebook.ebookId;
  checks.push({ name: "Create only once", ok: Boolean(id) && id === ebook.id, detail: id });

  const job = createJob(id, userId, "research");
  startResearch(id, job.id, { forceOutline: true, replaceSources: true });
  const after = await waitForIdle(id);
  checks.push({
    name: "Research keeps same ebookId",
    ok: after?.ebookId === id && getEbook(id)?.id === id,
    detail: after?.ebookId,
  });
  checks.push({
    name: "Research run finished",
    ok: after?.researchRun?.status === "success" || after?.status === "awaiting_outline",
    detail: `${after?.researchRun?.status}/${after?.status}/${after?.researchRun?.message}`,
  });
  checks.push({
    name: "Exactly 14 topic-specific chapters",
    ok: (after?.outline.length || 0) === 14 && after?.outline[0]?.title === ACHHOOT_HINDI_TITLES[0],
    detail: String(after?.outline.length),
  });
  checks.push({
    name: "Outline metadata populated",
    ok: Boolean(
      after?.outline.every(
        (o) => o.historicalScope && o.researchQuestion && (o.keyTopics || []).length && o.evidenceVsInterpretation
      )
    ),
  });
  checks.push({
    name: "Chapter research saved",
    ok: (after?.chapterResearch || []).length === 14,
    detail: String(after?.chapterResearch?.length),
  });
  checks.push({
    name: "Sources persisted to same ebook",
    ok: Boolean(after && after.sources.length > 0 && after.sources.every((s) => !s.url || /^https?:\/\//.test(s.url))),
    detail: String(after?.sources.length),
  });

  const beforeCover = after?.cover?.svg || "";
  const svg = coverSvg({
    title: after?.title || TOPIC,
    subtitle: after?.subtitle || "",
    author: coverAuthor(after!.settings),
    style: "Documentary",
    language: "hi",
    category: "historical",
  });
  updateEbook(id, { cover: { style: "Documentary", svg } });
  const afterCover = getEbook(id);
  checks.push({
    name: "Cover regen same ebookId",
    ok: Boolean(afterCover?.ebookId === id && (afterCover?.cover.svg || "").includes("अछूत")),
  });
  checks.push({
    name: "Cover regen invents no author",
    ok: !(afterCover?.cover.svg || "").includes("Folio Research"),
  });
  checks.push({
    name: "Cover regen preserves outline",
    ok: (afterCover?.outline.length || 0) === 14 && afterCover?.outline[3]?.title === ACHHOOT_HINDI_TITLES[3],
  });
  void beforeCover;

  const outlined = regenerateOutlineForEbook(id);
  checks.push({
    name: "Regenerate outline same ebookId",
    ok: outlined?.ebookId === id && outlined?.outline.length === 14,
  });

  const item = afterCover!.outline[0];
  const visuals = await buildChapterVisuals({
    ebookId: id,
    chapterIndex: 0,
    item,
    lang: "hi",
    commons: [],
    includeImages: true,
  });
  const ch = composeHindiChapter({
    index: 0,
    item,
    settings: afterCover!.settings,
    analysis: afterCover!.analysis || {
      topic: TOPIC,
      normalizedTitle: TOPIC,
      subtitle: "",
      detectedLanguage: "hi",
      outputLanguage: "hi",
      category: "historical",
      audienceSuggestion: "Researchers",
      needsCurrentInfo: false,
      copyrightMode: false,
      sensitiveDomain: "none",
      prioritySourceHints: [],
      searchQueries: [],
      wikiLanguage: "hi",
      summary: "",
    },
    sources: afterCover!.sources,
    facts: afterCover!.facts || [],
    images: visuals,
  });
  insertFiguresIntoChapter(ch, "hi");
  checks.push({
    name: "Chapter contains Hindi research question",
    ok: ch.sections.some((s) => /शोध प्रश्न/.test(s.heading + s.html)),
  });
  checks.push({
    name: "Chapter visuals generated",
    ok: visuals.length > 0 && visuals.every((v) => v.caption && v.credit && v.alt),
    detail: String(visuals.length),
  });
  checks.push({
    name: "Figures appear in chapter HTML",
    ok: ch.sections.some((s) => /ebook-figure/.test(s.html) && /img src=/.test(s.html)),
  });

  const pages = buildBookPages({
    ...afterCover!,
    chapters: [ch],
    introduction: "भूमिका",
    conclusion: "निष्कर्ष",
  });
  checks.push({
    name: "Reader/3D pages have cover, TOC-capable chapter, figures",
    ok: pages.some((p) => p.kind === "cover") && pages.some((p) => p.kind === "chapter") && pages.some((p) => /img src=|ebook-figure/.test(p.html)),
  });

  const listed = getEbook(id);
  checks.push({ name: "Still a single ebook record", ok: listed?.ebookId === id });

  const book = {
    ...afterCover!,
    chapters: [ch],
    introduction: "भूमिका",
    conclusion: "निष्कर्ष",
    status: "complete" as const,
  };
  const dir = path.join(process.cwd(), "data", "exports");
  fs.mkdirSync(dir, { recursive: true });
  try {
    const pdf = await exportPdf(book, path.join(dir, `selftest-${id}.pdf`));
    const docx = await exportDocx(book, path.join(dir, `selftest-${id}.docx`));
    const epub = await exportEpub(book, path.join(dir, `selftest-${id}.epub`));
    checks.push({
      name: "PDF/DOCX/EPUB export",
      ok: fs.existsSync(pdf) && fs.statSync(pdf).size > 1000 && fs.existsSync(docx) && fs.existsSync(epub),
    });
    fs.unlinkSync(pdf);
    fs.unlinkSync(docx);
    fs.unlinkSync(epub);
  } catch (e: any) {
    checks.push({ name: "PDF/DOCX/EPUB export", ok: false, detail: e.message });
  }

  deleteEbook(id, userId);
  for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  if (checks.some((c) => !c.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
