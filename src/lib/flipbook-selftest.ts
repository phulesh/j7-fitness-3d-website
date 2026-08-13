/**
 * Offline 3D ebook (flipbook) selftest.
 *
 * Verifies that `exportFlipbook` bundles the real, already-generated image
 * assets and the bundled Devanagari font, references them via local/static
 * relative paths, and produces a fully self-contained (offline) reader.
 *
 * Run: npm run test:3d
 */
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { buildChapterVisuals, insertFiguresIntoChapter } from "./generate/images";
import { exportFlipbook } from "./export/flipbook";
import { composeHindiChapter } from "./generate/hindi";
import { renderCoverPng, coverSvg } from "./generate/cover";
import type { EbookDocument, OutlineItem } from "./types";

const EBOOK_ID = "flipbook-selftest";

export async function runFlipbookSelftest() {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const item: OutlineItem = {
    id: "o1",
    chapterNumber: 1,
    title: "अनुच्छेद 17 — अस्पृश्यता का अंत",
    summary: "भारतीय संविधान के अनुच्छेद 17 का विश्लेषण",
    keyTopics: ["अनुच्छेद 17", "भीमराव आंबेडकर", "1950"],
    sourceIds: [],
    historicalScope: "1948–1950",
    researchQuestion: "अस्पृश्यता कैसे समाप्त हुई?",
  };

  // 1. Generate the same real image assets the pipeline stores for the ebook.
  const visuals = await buildChapterVisuals({
    ebookId: EBOOK_ID,
    chapterIndex: 0,
    item,
    lang: "hi",
    commons: [],
    includeImages: true,
  });
  check("chapter visuals generated on disk", visuals.length > 0 && visuals.every((v) => v.localPath && fs.existsSync(v.localPath)));

  const ch = composeHindiChapter({
    index: 0,
    item,
    settings: {
      topic: item.title,
      language: "hi",
      outputLanguage: "hi",
      type: "Research-Based Book",
      audience: "Researchers",
      difficulty: "Advanced",
      chapterCount: 1,
      length: "short",
      style: "Clear academic",
      includeExamples: true,
      includeExercises: true,
      includeMcqs: true,
      includeGlossary: true,
      includeReferences: true,
      includeImages: true,
      includeToc: true,
      includePageNumbers: true,
      includeAuthor: false,
      includeCover: true,
      authorName: "",
      coverStyle: "Historical",
    },
    analysis: {
      topic: item.title,
      normalizedTitle: item.title,
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
    sources: [],
    facts: [],
    images: visuals,
  });
  insertFiguresIntoChapter(ch, "hi");

  const svg = coverSvg({ title: item.title, subtitle: "शोध", author: "", style: "Historical", language: "hi", category: "historical" });
  const coverPng = await renderCoverPng(svg, path.join(process.cwd(), "data", "covers", `${EBOOK_ID}.png`));

  const doc = {
    id: EBOOK_ID,
    ebookId: EBOOK_ID,
    userId: "u1",
    title: item.title,
    subtitle: "शोध",
    language: "hi",
    outputLanguage: "hi",
    type: "Research-Based Book",
    audience: "Researchers",
    difficulty: "Advanced",
    status: "complete",
    settings: {
      topic: item.title,
      language: "hi",
      outputLanguage: "hi",
      type: "Research-Based Book",
      audience: "Researchers",
      difficulty: "Advanced",
      chapterCount: 1,
      length: "short",
      style: "Clear academic",
      includeExamples: true,
      includeExercises: true,
      includeMcqs: true,
      includeGlossary: true,
      includeReferences: true,
      includeImages: true,
      includeToc: true,
      includePageNumbers: true,
      includeAuthor: false,
      includeCover: true,
      authorName: "",
      coverStyle: "Historical",
    },
    outline: [item],
    introduction: "भूमिका",
    conclusion: "निष्कर्ष",
    chapters: [ch],
    glossary: [{ term: "अनुच्छेद 17", definition: "अस्पृश्यता का उन्मूलन", sourceIds: [] }],
    faqs: [],
    sources: [
      {
        id: 1,
        title: "भारत का संविधान",
        organization: "भारत सरकार",
        url: "https://example.gov.in/const",
        citation: "भारत का संविधान। भारत सरकार।",
        snippet: "",
        extractedText: "",
        domain: "example.gov.in",
        retrievedAt: new Date().toISOString(),
        tier: 1,
        score: 95,
        used: true,
      },
    ],
    rejectedSources: [],
    facts: [],
    cover: { style: "Historical", svg, pngPath: coverPng },
    wordCount: 100,
    chapterCount: 1,
    progress: { step: "complete", percent: 100, message: "" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as EbookDocument;

  // 2. Export the 3D ebook and inspect the zip.
  const buf = await exportFlipbook(doc);
  check("flipbook zip produced", buf.length > 1000, String(buf.length));

  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const index = await zip.file("book-3d/index.html")!.async("string");

  const m = index.match(/const P=(\[[\s\S]*\]);let n=0/);
  const pages = m ? JSON.parse(m[1]) : [];
  const pageHtml = pages.map((p: { html?: string }) => p.html || "").join("\n");

  check("index.html present", names.includes("book-3d/index.html"));
  check("Devanagari font bundled", names.includes("book-3d/fonts/NotoSansDevanagari-Regular.ttf"));
  check("cover png bundled", names.includes("book-3d/images/cover.png"));

  const imgEntries = names.filter((n) => n.startsWith("book-3d/images/fig-"));
  const refs = pageHtml.match(/src="images\/fig-[^"]+"/g) || [];
  check("chapter images bundled", imgEntries.length > 0, imgEntries.join(", "));
  check("figures page has real <img>", /<img[^>]+src="images\/fig-/.test(pageHtml));
  check("images referenced relative", refs.length > 0);
  check("no api image urls", !/\/api\/ebooks\//.test(index));
  check("no external http images", !/<img[^>]+src="https?:/i.test(pageHtml));
  check("Devanagari text present", /अनुच्छेद/.test(index));
  check("font-face embedded", /@font-face\{font-family:'Noto Sans Devanagari'/.test(index));
  check("font referenced offline", /url\('fonts\/NotoSansDevanagari-Regular.ttf'\)/.test(index));
  check("no placeholder rect in figures", !/class="fig"[^>]*>(<rect|placeholder)/.test(pageHtml));
  check("figure note in Hindi", /ऐतिहासिक फोटोग्राफ नहीं/.test(pageHtml));
  check("figures not duplicated in zip", imgEntries.length === refs.length);

  // 3. Clean up generated artifacts.
  fs.rmSync(path.join(process.cwd(), "data", "images", EBOOK_ID), { recursive: true, force: true });
  if (fs.existsSync(coverPng)) fs.unlinkSync(coverPng);

  return checks;
}

async function main() {
  const checks = await runFlipbookSelftest();
  for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  if (checks.some((c) => !c.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
