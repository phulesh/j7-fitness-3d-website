/** End-to-end acceptance test for the Vedanta Hindi book (14 chapters, long). */
import fs from "fs";
import JSZip from "jszip";
import { createEbook, createJob, deleteEbook, getEbook } from "./ebooks";
import { isRunning, startGeneration } from "./generate/runner";
import { DEFAULT_SETTINGS } from "./types";
import { buildBookPages } from "./book/pages";
import { validateBookForPublishing } from "./generate/publish-gate";
import { validateQuestionAnswer, validateMcq } from "./generate/qa";

const TOPIC = "वेदांत दर्शन: इतिहास, प्रमुख विचार और प्रमुख आचार्य";

async function wait(ebookId: string, timeout = 10 * 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const doc = getEbook(ebookId);
    if (!isRunning(ebookId) && doc && ["complete", "failed", "awaiting_outline"].includes(doc.status)) return doc;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("timed out");
}

async function main() {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const add = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, detail }); console.log(ok ? "✓" : "✗", name, detail || ""); };

  const ebook = createEbook("vedanta-e2e", {
    ...DEFAULT_SETTINGS,
    topic: TOPIC, title: TOPIC, customTitle: TOPIC,
    subtitle: "इतिहास, प्रमुख विचार और प्रमुख आचार्य",
    language: "hi", outputLanguage: "hi",
    type: "Research-Based Book", audience: "General readers", difficulty: "Intermediate",
    chapterCount: 14, length: "long", coverStyle: "Historical", authorName: "परीक्षण लेखक",
    includeImages: false,
  });
  const job = createJob(ebook.id, "vedanta-e2e", "generate");
  startGeneration(ebook.id, job.id, { skipOutlineWait: true });
  const doc = await wait(ebook.id);

  add("status complete", doc.status === "complete", `${doc.status} ${doc.error || ""} ${doc.progress?.message || ""}`);
  add("14 chapters", doc.chapters.length === 14, String(doc.chapters.length));
  add("word count > 0 and persisted", (doc.wordCount || 0) > 0, String(doc.wordCount));
  add("no chapter has 0 words", doc.chapters.every((c) => c.wordCount > 0), doc.chapters.map((c) => c.wordCount).join(","));
  add("no generic titles", !doc.chapters.some((c) => /यह विषय क्या है|आधार और शब्दावली|मूल विचार विस्तार से|What this subject is/i.test(c.title)), doc.chapters.map((c) => c.title).join(" | ").slice(0, 400));
  add("titles topic-specific (mention subject or aspects)", doc.chapters.filter((c) => /वेदांत|वेदान्त|उपनिषद|ब्रह्म|आचार्य|दर्शन|मोक्ष|शंकर|रामानुज|मध्व/.test(c.title)).length >= 10, "");

  const totalQ = doc.chapters.reduce((n, c) => n + c.questions.length, 0);
  const answered = doc.chapters.reduce((n, c) => n + c.questions.filter((q) => validateQuestionAnswer(q.question, q.answer).valid).length, 0);
  add("every chapter has >= 5 questions", doc.chapters.every((c) => c.questions.length >= 5), doc.chapters.map((c) => c.questions.length).join(","));
  add("all answers complete", answered === totalQ, `${answered}/${totalQ}`);
  const totalM = doc.chapters.reduce((n, c) => n + c.mcqs.length, 0);
  const validM = doc.chapters.reduce((n, c) => n + c.mcqs.filter((m) => validateMcq(m).valid).length, 0);
  add("every chapter has MCQs, all valid", doc.chapters.every((c) => c.mcqs.length >= 2) && validM === totalM, `${validM}/${totalM}`);

  add("glossary exists", (doc.glossary || []).length > 0, String(doc.glossary?.length));
  add("references exist", doc.sources.length >= 5, String(doc.sources.length));
  add("publishGate valid", doc.publishGate?.valid === true, JSON.stringify(doc.publishGate?.stats));

  const pages = buildBookPages(doc);
  const pageWords = (pages.map((p) => p.html.replace(/<[^>]+>/g, " ")).join(" ").match(/[\p{L}\p{M}\p{N}]+/gu) || []).length;
  add("3D pages contain manuscript", pages.length > 30 && pageWords > 10000, `${pages.length} pages, ${pageWords} words`);

  // exports
  const ex = doc.exports || {};
  add("PDF exists+has content", !!ex.pdf && fs.existsSync(ex.pdf) && fs.statSync(ex.pdf).size > 50_000, ex.pdf ? String(fs.statSync(ex.pdf).size) : "missing");
  add("EPUB exists", !!ex.epub && fs.existsSync(ex.epub) && fs.statSync(ex.epub).size > 20_000, ex.epub ? String(fs.statSync(ex.epub).size) : "missing");
  add("Offline HTML exists", !!ex.html && fs.existsSync(ex.html) && fs.statSync(ex.html).size > 20_000, ex.html ? String(fs.statSync(ex.html).size) : "missing");
  add("3D zip exists", !!ex.flipbook && fs.existsSync(ex.flipbook), "");

  if (ex.epub && fs.existsSync(ex.epub)) {
    const epub = await JSZip.loadAsync(fs.readFileSync(ex.epub));
    const xhtml = (await Promise.all(Object.keys(epub.files).filter((n) => n.endsWith(".xhtml")).map((n) => epub.file(n)!.async("string")))).join("\n");
    add("EPUB contains chapter titles", doc.chapters.every((c) => xhtml.includes(c.title.slice(0, 30))), "");
    add("EPUB contains answers", (xhtml.match(/उत्तर/g) || []).length >= totalQ, "");
  }
  if (ex.flipbook && fs.existsSync(ex.flipbook)) {
    const zip = await JSZip.loadAsync(fs.readFileSync(ex.flipbook));
    const data = await zip.file("book-data.json")!.async("string");
    add("3D book-data contains chapters + Q&A", doc.chapters.every((c) => data.includes(c.title.slice(0, 24))), "");
  }

  const gate = validateBookForPublishing(doc);
  add("re-run publish gate valid", gate.valid, gate.errors.slice(0, 4).join("; "));
  console.log("\nSTATS:", JSON.stringify(gate.stats, null, 1));
  const failed = checks.filter((c) => !c.ok);
  console.log(failed.length ? `\nFAILED ${failed.length}` : "\nALL PASS");
  deleteEbook(ebook.id, "vedanta-e2e");
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
