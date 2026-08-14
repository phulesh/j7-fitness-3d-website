import fs from "fs";
import path from "path";
import JSZip from "jszip";
import sharp from "sharp";
import type { Chapter, EbookDocument, EbookExports, QualityCheckItem, QualityReport } from "../types";
import { buildBookPages } from "../book/pages";
import { getEbook, saveChapters, updateEbook } from "../ebooks";
import { buildChapterVisuals, insertFiguresIntoChapter } from "./images";
import { exportPdf } from "../export/pdf";
import { exportDocx } from "../export/docx";
import { exportEpub } from "../export/epub";
import { exportFlipbook, exportStandaloneFlipbookHtml } from "../export/flipbook";
import { isAchhootResearchTopic, ACHHOOT_HINDI_TITLES } from "./outline";
import { validateCompleteAchhootContent } from "./achhoot";

export type QualityStage = "generating_figures" | "designing_pages" | "creating_3d" | "building_pdf" | "building_epub" | "building_html" | "quality_check";

function textOf(doc: EbookDocument) {
  return [
    doc.title,
    doc.subtitle,
    doc.introduction,
    doc.conclusion,
    ...doc.chapters.flatMap((ch) => [
      ch.title,
      ch.summary,
      ...ch.sections.flatMap((section) => [section.heading, section.html]),
      ...ch.keyPoints,
      ...ch.questions.map((q) => `${q.question} ${q.answer}`),
    ]),
  ].join("\n");
}

function stripFigureMarkup(html: string) {
  return html.replace(/<figure\b[^>]*class=["'][^"']*ebook-figure[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi, "");
}

async function validImage(localPath?: string): Promise<boolean> {
  if (!localPath || !fs.existsSync(localPath)) return false;
  try {
    const stat = fs.statSync(localPath);
    if (!stat.isFile() || stat.size < 200) return false;
    if (/\.svg$/i.test(localPath)) {
      const svg = fs.readFileSync(localPath, "utf8");
      return /<svg\b/i.test(svg) && /(?:width|viewBox)=/.test(svg) && !/<foreignObject/i.test(svg);
    }
    const meta = await sharp(localPath).metadata();
    return Boolean(meta.format && meta.width && meta.height && meta.width >= 80 && meta.height >= 80);
  } catch {
    return false;
  }
}

async function repairAndValidateAssets(doc: EbookDocument): Promise<{ chapters: Chapter[]; repaired: boolean; valid: number; expected: number }> {
  const chapters = doc.chapters.map((chapter) => ({
    ...chapter,
    sections: chapter.sections.map((section) => ({ ...section })),
    images: [...(chapter.images || [])],
  }));
  let repaired = false;
  let valid = 0;
  let expected = 0;

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const kept = [];
    for (const image of chapter.images || []) {
      if (await validImage(image.localPath)) kept.push(image);
      else repaired = true;
    }
    chapter.images = kept;
    if (doc.settings.includeImages) {
      expected++;
      if (!chapter.images.length) {
        const item = doc.outline[i] || {
          id: chapter.id,
          title: chapter.title,
          summary: chapter.summary,
          sourceIds: chapter.sourceIds,
        };
        chapter.images = await buildChapterVisuals({
          ebookId: doc.id,
          chapterIndex: i,
          item,
          lang: doc.outputLanguage || doc.language,
          commons: [],
          includeImages: true,
        });
        repaired = true;
      }
    }
    chapter.sections = chapter.sections.map((section) => ({ ...section, html: stripFigureMarkup(section.html) }));
    insertFiguresIntoChapter(chapter, doc.outputLanguage || doc.language);
    const allValid = chapter.images.length > 0 && (await Promise.all(chapter.images.map((image) => validImage(image.localPath)))).every(Boolean);
    if (!doc.settings.includeImages || allValid) valid++;
  }
  return { chapters, repaired, valid, expected };
}

function removeInvalidCitations(doc: EbookDocument): { doc: EbookDocument; repaired: boolean } {
  const ids = new Set(doc.sources.map((source) => Number(source.id)));
  let repaired = false;
  const clean = (value: string) => (value || "").replace(/\[(\d+)]/g, (whole, raw) => {
    if (ids.has(Number(raw))) return whole;
    repaired = true;
    return "";
  });
  const chapters = doc.chapters.map((chapter) => ({
    ...chapter,
    summary: clean(chapter.summary),
    sections: chapter.sections.map((section) => ({ ...section, html: clean(section.html) })),
    keyPoints: chapter.keyPoints.map(clean),
  }));
  return { doc: { ...doc, introduction: clean(doc.introduction), conclusion: clean(doc.conclusion), chapters }, repaired };
}

function item(key: string, label: string, passed: boolean, detail?: string, repaired?: boolean): QualityCheckItem {
  return { key, label, passed, detail, repaired };
}

function outputPaths(doc: EbookDocument): EbookExports {
  const dir = path.join(process.cwd(), "data", "exports", doc.id);
  fs.mkdirSync(dir, { recursive: true });
  return {
    pdf: path.join(dir, "book.pdf"),
    epub: path.join(dir, "book.epub"),
    docx: path.join(dir, "book.docx"),
    html: path.join(dir, "3D_BOOK.html"),
    flipbook: path.join(dir, "3D_BOOK.zip"),
  };
}

function nonEmptyFile(file?: string, min = 500) {
  return Boolean(file && fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > min);
}

/**
 * Repairs assets/citations, builds every export, then validates the exact files
 * users download. A generation is not marked Ready until this function passes.
 */
export async function runFinalQualityCheck(
  ebookId: string,
  onStage?: (stage: QualityStage, percent: number, message: string) => void
): Promise<{ report: QualityReport; exports: EbookExports }> {
  let doc = getEbook(ebookId);
  if (!doc) throw new Error("Ebook not found during final quality check");
  const checks: QualityCheckItem[] = [];
  let attempts = 1;

  onStage?.("generating_figures", 84, "Validating and repairing figures...");
  const assets = await repairAndValidateAssets(doc);
  if (assets.repaired) {
    saveChapters(doc.id, assets.chapters);
    updateEbook(doc.id, { chapters: assets.chapters });
  }
  checks.push(item("images", "Images and figure files", !doc.settings.includeImages || assets.valid === doc.chapters.length, `${assets.valid}/${doc.chapters.length} chapters have validated assets`, assets.repaired));
  doc = getEbook(ebookId)!;

  const citationRepair = removeInvalidCitations(doc);
  if (citationRepair.repaired) {
    attempts++;
    saveChapters(doc.id, citationRepair.doc.chapters);
    updateEbook(doc.id, {
      introduction: citationRepair.doc.introduction,
      conclusion: citationRepair.doc.conclusion,
      chapters: citationRepair.doc.chapters,
    });
    doc = getEbook(ebookId)!;
  }

  const allText = textOf(doc);
  const sourceIds = new Set(doc.sources.map((source) => Number(source.id)));
  const citedIds = [...allText.matchAll(/\[(\d+)]/g)].map((match) => Number(match[1]));
  const invalidCitations = citedIds.filter((id) => !sourceIds.has(id));
  const duplicateTitles = doc.chapters.map((chapter) => chapter.title.trim().toLocaleLowerCase()).filter((title, index, all) => all.indexOf(title) !== index);
  const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansDevanagari-Regular.ttf");

  checks.push(item("title", "Title and author metadata", Boolean(doc.title.trim()), doc.settings.authorName.trim() || "Folio Research"));
  checks.push(item("chapters", "Chapter count and content", doc.chapters.length === doc.outline.length && doc.chapters.every((chapter) => chapter.sections.length > 0 && chapter.wordCount > 0), `${doc.chapters.length}/${doc.outline.length} chapters`));
  checks.push(item("duplicates", "No duplicate chapters", duplicateTitles.length === 0, duplicateTitles.join(", ") || undefined));
  checks.push(item("unicode", "Unicode and missing glyph check", !/[�□\0]/.test(allText)));
  checks.push(item("devanagari-font", "Embedded Devanagari font", (doc.outputLanguage || doc.language) !== "hi" || (fs.existsSync(fontPath) && fs.statSync(fontPath).size > 100_000)));
  checks.push(item("captions", "Figure captions and provenance", doc.chapters.every((chapter) => (chapter.images || []).every((image) => Boolean(image.figureLabel && image.caption && image.credit)))));
  checks.push(item("citations", "No invented citation identifiers", invalidCitations.length === 0, invalidCitations.length ? invalidCitations.join(", ") : undefined, citationRepair.repaired));
  checks.push(item("sources", "Source provenance", doc.sources.length > 0 && doc.sources.every((source) => /^https?:\/\//.test(source.url) || source.url.startsWith("folio-upload://")), `${doc.sources.length} sources`));

  if (isAchhootResearchTopic(doc.analysis?.topic || doc.settings.topic)) {
    const chapterErrors = doc.chapters.flatMap((chapter, index) =>
      validateCompleteAchhootContent(chapter).map((error) => `अध्याय ${index + 1}: ${error}`)
    );
    const exactTitles = doc.chapters.length === 14 && doc.chapters.every((chapter, index) => chapter.title === ACHHOOT_HINDI_TITLES[index]);
    const placeholders = /\[यहाँ|placeholder|lorem ipsum|शोध पर निर्भर है|उत्तर स्रोत के प्रकार और लेखक के अनुमान पर निर्भर करता है|\bTBD\b/i.test(allText);
    const completeAnswers = doc.chapters.every((chapter) =>
      chapter.questions.length >= 5 &&
      chapter.questions.length <= 10 &&
      chapter.questions.every((question) => question.answer.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 40).length >= 3)
    );
    const conclusions = doc.chapters.every((chapter) =>
      chapter.sections.some((section) => /अध्याय का निष्कर्ष/.test(section.heading) && section.html.replace(/<[^>]+>/g, " ").trim().length > 180)
    );
    const analyticalLengths = doc.chapters.map((chapter) =>
      (chapter.sections.map((section) => section.html.replace(/<[^>]+>/g, " ")).join(" ").match(/[\p{L}\p{N}]+/gu) || []).length
    );
    // The commissioned 1,500–2,500-word target applies to the prose body;
    // numbered figure explanations and source-analysis tables can add a modest
    // amount. Review answers are deliberately excluded so they cannot pad it.
    const substantiveLengths = analyticalLengths.every((length) => length >= 1_500 && length <= 3_100);
    const citedChapters = doc.chapters.every((chapter) => chapter.sourceIds.length > 0 && chapter.sourceIds.every((id) => sourceIds.has(id)));
    const citedSourceRecords = [...new Set(citedIds)].map((id) => doc.sources.find((source) => Number(source.id) === id));
    const traceableCitations = citedSourceRecords.length > 0 && citedSourceRecords.every(
      (source) => Boolean(source && source.verificationStatus === "verified" && source.title && /^https?:\/\//.test(source.url))
    );
    const noUnresolvedMarkersOrPageClaims = !/{{[a-z0-9_-]+}}|(?:\bp{1,2}\.|पृष्ठ)\s*\d+/i.test(allText);
    checks.push(item("achhoot-titles", "Exact fourteen commissioned historical chapters", exactTitles));
    checks.push(item("achhoot-structure", "Every chapter has all required teaching sections", chapterErrors.length === 0, chapterErrors.slice(0, 8).join("; ") || undefined));
    checks.push(item("achhoot-answers", "Every end-of-chapter question has a complete three-paragraph answer", completeAnswers));
    checks.push(item("achhoot-conclusions", "Every chapter has a substantive conclusion", conclusions));
    checks.push(item("achhoot-length", "Each analytical chapter body is substantive without review-answer padding", substantiveLengths, analyticalLengths.join(", ")));
    checks.push(item("achhoot-cited", "Every chapter cites persisted canonical sources", citedChapters));
    checks.push(item("achhoot-provenance", "Every cited source has verified, traceable provenance", traceableCitations));
    checks.push(item("achhoot-page-claims", "No unresolved citation markers or invented page-number claims", noUnresolvedMarkersOrPageClaims));
    checks.push(item("achhoot-placeholders", "No placeholders, research notes, or deferred answers", !placeholders));
  }

  onStage?.("designing_pages", 87, "Designing pages and checking navigation...");
  const pages = buildBookPages(doc);
  checks.push(item("pages", "Pages, page numbers, and contents", pages.length >= doc.chapters.length + 3 && pages.every((page, index) => page.index === index && Boolean(page.pageLabel))));

  // Do not package an outline-only, uncited, or incomplete manuscript. File
  // generation begins only after every content/citation/figure preflight check
  // has passed; export-specific checks run against the resulting files below.
  const preflightFailed = checks.filter((check) => !check.passed);
  if (preflightFailed.length) {
    throw new Error(`Pre-export quality check failed: ${preflightFailed.map((check) => check.label).join(", ")}`);
  }

  const paths = outputPaths(doc);
  onStage?.("creating_3d", 90, "Creating interactive 3D book...");
  const flipbook = await exportFlipbook(doc);
  fs.writeFileSync(paths.flipbook!, flipbook);

  onStage?.("building_pdf", 92, "Building PDF with embedded Unicode fonts...");
  await exportPdf(doc, paths.pdf!);
  await exportDocx(doc, paths.docx!);

  onStage?.("building_epub", 94, "Building EPUB with embedded fonts and figures...");
  await exportEpub(doc, paths.epub!);

  onStage?.("building_html", 96, "Building self-contained offline HTML...");
  fs.writeFileSync(paths.html!, await exportStandaloneFlipbookHtml(doc));

  onStage?.("quality_check", 98, "Running final quality check...");
  const epub = await JSZip.loadAsync(fs.readFileSync(paths.epub!));
  const epubNames = Object.keys(epub.files);
  const epubHtml = (await Promise.all(epubNames.filter((name) => /\.xhtml$/.test(name)).map((name) => epub.file(name)!.async("string")))).join("\n");
  const zip = await JSZip.loadAsync(fs.readFileSync(paths.flipbook!));
  const zipNames = Object.keys(zip.files);
  const offlineIndex = await zip.file("index.html")!.async("string");
  const flipbookData = await zip.file("book-data.json")!.async("string");
  const standalone = fs.readFileSync(paths.html!, "utf8");

  checks.push(item("pdf", "PDF export", nonEmptyFile(paths.pdf, 2_000) && fs.readFileSync(paths.pdf!).subarray(0, 4).toString() === "%PDF"));
  checks.push(item("docx", "DOCX export", nonEmptyFile(paths.docx, 1_000)));
  checks.push(item("epub", "EPUB export and embedded font", nonEmptyFile(paths.epub, 1_000) && epubNames.includes("OEBPS/fonts/NotoSansDevanagari-Regular.ttf") && !/src=["']\/api\/ebooks\//.test(epubHtml)));
  checks.push(item("offline", "Offline 3D HTML package", zipNames.includes("index.html") && zipNames.includes("book-data.json") && zipNames.includes("fonts/NotoSansDevanagari-Regular.ttf") && !/src=["']\/api\/ebooks\//.test(offlineIndex)));
  checks.push(item("standalone", "Single-file 3D HTML", nonEmptyFile(paths.html, 2_000) && !/(?:src|url\()=["']?\/?api\/ebooks\//.test(standalone)));
  checks.push(item("3d", "3D page turning and touch controls", /perspective:1900px/.test(offlineIndex) && /onpointerdown/.test(offlineIndex) && /ontouch|pointer/.test(offlineIndex)));
  checks.push(item("mobile", "Mobile responsive controls", /@media\(max-width:620px\)/.test(offlineIndex) && /viewport/.test(offlineIndex)));
  checks.push(item("broken-assets", "No empty image containers or broken asset URLs", !/<img[^>]+src=["']["']/.test(`${offlineIndex}\n${epubHtml}`) && !/(?:image-placeholder|empty-image-container)/i.test(`${offlineIndex}\n${epubHtml}`)));

  if (isAchhootResearchTopic(doc.analysis?.topic || doc.settings.topic)) {
    const expectedAnswers = doc.chapters.reduce((total, chapter) => total + chapter.questions.length, 0);
    const countAnswers = (value: string) => (value.match(/सीधा उत्तर/g) || []).length;
    const allTitlesInExports = ACHHOOT_HINDI_TITLES.every(
      (title) => epubHtml.includes(title) && flipbookData.includes(title) && standalone.includes(title)
    );
    checks.push(item("achhoot-export-titles", "All fourteen chapters are present in EPUB and both 3D editions", allTitlesInExports));
    checks.push(item(
      "achhoot-export-answers",
      "All complete review answers are present in EPUB and both 3D editions",
      countAnswers(epubHtml) >= expectedAnswers && countAnswers(flipbookData) >= expectedAnswers && countAnswers(standalone) >= expectedAnswers,
      `${expectedAnswers} expected; EPUB ${countAnswers(epubHtml)}, 3D data ${countAnswers(flipbookData)}, standalone ${countAnswers(standalone)}`
    ));
  }

  const failed = checks.filter((check) => !check.passed);
  const report: QualityReport = {
    passed: failed.length === 0,
    attempts,
    checkedAt: new Date().toISOString(),
    items: checks,
  };
  const exports: EbookExports = { ...paths, generatedAt: new Date().toISOString() };
  if (failed.length) throw new Error(`Final quality check failed: ${failed.map((check) => check.label).join(", ")}`);
  return { report, exports };
}
