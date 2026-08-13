/** End-to-end acceptance test for the beginner Hindi 3D ebook workflow. */
import fs from "fs";
import JSZip from "jszip";
import sharp from "sharp";
import { createEbook, createJob, deleteEbook, getEbook } from "./ebooks";
import { getStore } from "./db";
import { isRunning, startGeneration } from "./generate/runner";
import { DEFAULT_SETTINGS } from "./types";

const TOPIC = "अछूत कौन थे और अछूत कैसे बने?";

async function wait(ebookId: string, timeout = 8 * 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const doc = getEbook(ebookId);
    if (!isRunning(ebookId) && doc && ["complete", "failed", "awaiting_outline"].includes(doc.status)) return doc;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("Complete pipeline timed out");
}

async function main() {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const userId = "complete-pipeline-selftest";
  const before = getStore().ebooks.filter((ebook) => ebook.userId !== userId).length;
  const ebook = createEbook(userId, {
    ...DEFAULT_SETTINGS,
    topic: TOPIC,
    title: TOPIC,
    customTitle: TOPIC,
    subtitle: "एक स्रोत-आधारित ऐतिहासिक अध्ययन",
    language: "hi",
    outputLanguage: "hi",
    type: "Research-Based Book",
    audience: "General readers",
    difficulty: "Intermediate",
    chapterCount: 14,
    length: "long",
    coverStyle: "Historical",
    authorName: "Phuleshwar",
  });

  const job = createJob(ebook.id, userId, "generate");
  startGeneration(ebook.id, job.id, { skipOutlineWait: true });
  const doc = await wait(ebook.id);
  add("pipeline reaches Ready", doc.status === "complete", `${doc.status}: ${doc.error || doc.progress.message}`);
  add("exact Hindi title, author, and 14 chapters", doc.title === TOPIC && doc.settings.authorName === "Phuleshwar" && doc.chapters.length === 14);

  const body = [doc.title, doc.introduction, doc.conclusion, ...doc.chapters.flatMap((chapter) => [chapter.title, ...chapter.sections.map((section) => section.html)])].join("\n");
  add("Hindi renders without missing Unicode characters", /[\u0900-\u097F]/.test(body) && !/[�□]/.test(body) && doc.languageCheck?.passed === true);

  const images = doc.chapters.flatMap((chapter) => chapter.images || []);
  const imageChecks = await Promise.all(images.map(async (image) => {
    if (!image.localPath || !fs.existsSync(image.localPath)) return false;
    if (image.localPath.endsWith(".svg")) return /<svg/.test(fs.readFileSync(image.localPath, "utf8"));
    const meta = await sharp(image.localPath).metadata();
    return Boolean(meta.width && meta.height && meta.width >= 80 && meta.height >= 80);
  }));
  add("no blank figures; actual validated assets", images.length >= 14 && imageChecks.every(Boolean), `${images.length} figures`);
  add("every figure has number, caption, and provenance", images.every((image) => Boolean(image.figureLabel && image.caption && image.credit)));

  const ids = new Set(doc.sources.map((source) => source.id));
  const citations = [...body.matchAll(/\[(\d+)]/g)].map((match) => Number(match[1]));
  add("citations resolve to collected real sources", doc.sources.length > 0 && citations.every((id) => ids.has(id)) && doc.sources.every((source) => /^https?:\/\//.test(source.url)));
  add("automatic final QA passed", doc.qualityReport?.passed === true && doc.qualityReport.items.every((item) => item.passed), `${doc.qualityReport?.items.length || 0} checks`);

  const outputs = doc.exports || {};
  add("PDF created with Hindi font strategy", Boolean(outputs.pdf && fs.existsSync(outputs.pdf) && fs.statSync(outputs.pdf).size > 2_000 && fs.existsSync("public/fonts/NotoSansDevanagari-Regular.ttf")));

  if (outputs.epub && fs.existsSync(outputs.epub)) {
    const epub = await JSZip.loadAsync(fs.readFileSync(outputs.epub));
    const names = Object.keys(epub.files);
    const html = (await Promise.all(names.filter((name) => name.endsWith(".xhtml")).map((name) => epub.file(name)!.async("string")))).join("\n");
    add("EPUB embeds font and local images", names.includes("OEBPS/fonts/NotoSansDevanagari-Regular.ttf") && names.some((name) => /^OEBPS\/images\/ch/.test(name)) && !/src=["']\/api\//.test(html));
  } else add("EPUB embeds font and local images", false);

  if (outputs.flipbook && fs.existsSync(outputs.flipbook)) {
    const zip = await JSZip.loadAsync(fs.readFileSync(outputs.flipbook));
    const names = Object.keys(zip.files);
    const index = await zip.file("index.html")!.async("string");
    add("3D ZIP extracts to a root offline index", names.includes("index.html") && names.includes("book-data.json") && names.includes("fonts/NotoSansDevanagari-Regular.ttf"));
    add("offline figures use only bundled paths", names.some((name) => /^images\/fig-/.test(name)) && !/src=["'](?:https?:|\/api\/)/.test(index));
    add("Android touch and page turning are included", /viewport/.test(index) && /onpointerdown/.test(index) && /rotateY\(-180deg\)/.test(index) && /@media\(max-width:620px\)/.test(index));
  } else {
    add("3D ZIP extracts to a root offline index", false);
    add("offline figures use only bundled paths", false);
    add("Android touch and page turning are included", false);
  }
  add("standalone offline 3D HTML created", Boolean(outputs.html && fs.existsSync(outputs.html) && fs.statSync(outputs.html).size > 2_000));

  deleteEbook(ebook.id, userId);
  const after = getStore().ebooks.filter((row) => row.userId !== userId).length;
  add("existing library data remains intact", before === after, `${before} before / ${after} after`);

  for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  if (checks.some((check) => !check.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
