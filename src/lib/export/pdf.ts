import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import type { EbookDocument, Chapter, SourceRecord } from "../types";
import { isRtl } from "../language";
import { labelsFor } from "../generate/write";

type PdfFonts = {
  regular: string;
  bold: string;
  serif: string;
  serifBold: string;
};

function fonts(lang?: string): PdfFonts {
  const dir = path.join(process.cwd(), "public", "fonts");
  const language = (lang || "").split("-")[0].toLowerCase();
  const indic = ["hi", "mr", "ne", "sa"].includes(language);

  // These are the font files bundled with the application. Keep the regular
  // font mandatory: PDFKit's built-in fonts do not provide reliable Unicode
  // coverage, which is especially important for Devanagari output.
  const regular = requireFont(
    "regular",
    indic
      ? [path.join(dir, "NotoSansDevanagari-Regular.ttf")]
      : [
          path.join(dir, "DejaVuSans.ttf"),
          path.join(dir, "NotoSansDevanagari-Regular.ttf"),
        ]
  );

  // There is no bundled Devanagari bold face. Reusing the verified regular
  // face preserves glyph coverage instead of selecting DejaVu Sans Bold,
  // which does not contain Devanagari glyphs.
  const bold = firstExisting(
    indic
      ? [regular]
      : [path.join(dir, "DejaVuSans-Bold.ttf"), path.join(dir, "DejaVuSans.ttf"), regular]
  ) ?? regular;

  // The serif faces are optional styling. If they are unavailable, fall back
  // to an already verified sans face. For Devanagari, keep the script-capable
  // regular/bold faces rather than switching to a serif with missing glyphs.
  const serif = firstExisting(
    indic ? [regular] : [path.join(dir, "DejaVuSerif.ttf"), regular]
  ) ?? regular;
  const serifBold = firstExisting(
    indic ? [bold] : [path.join(dir, "DejaVuSerif-Bold.ttf"), bold]
  ) ?? bold;

  return { regular, bold, serif, serifBold };
}

function firstExisting(paths: readonly string[]): string | undefined {
  return paths.find((fontPath) => fs.existsSync(fontPath));
}

function requireFont(label: string, candidates: readonly string[]): string {
  const existing = firstExisting(candidates);
  if (existing) return existing;

  // Report only bundled filenames, not the server's absolute filesystem path.
  // This is useful in production logs without leaking Railway's directory
  // layout to an API client.
  const filenames = candidates.map((fontPath) => path.basename(fontPath)).join(", ");
  throw new Error(`PDF export requires a ${label} font. None of these bundled font files were found: ${filenames}.`);
}

export async function exportPdf(doc: EbookDocument, destPath: string): Promise<string> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const f = fonts(doc.language);
  const labels = labelsFor(doc.language);
  const rtl = isRtl(doc.language);

  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 64, bottom: 64, left: 64, right: 64 },
    info: {
      Title: doc.title,
      Author: doc.settings.authorName || "Folio Research",
      Subject: doc.subtitle,
      Keywords: `ebook, ${doc.language}, researched, ${doc.type}`,
      Creator: "Folio Research-Based Ebook Generator",
    },
    autoFirstPage: false,
    bufferPages: true,
  });

  const stream = fs.createWriteStream(destPath);
  pdf.pipe(stream);

  pdf.registerFont("Body", f.regular);
  pdf.registerFont("BodyBold", f.bold);
  pdf.registerFont("Serif", f.serif);
  pdf.registerFont("SerifBold", f.serifBold);
  const BODY = "Body";
  const BOLD = "BodyBold";
  const SERIF = "Serif";
  const SERIFBOLD = "SerifBold";

  const used = new Set<number>();
  const markCites = (text: string) => {
    const citationPattern = /\[(\d+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = citationPattern.exec(text)) !== null) {
      used.add(Number(match[1]));
    }
    return text;
  };

  // Cover
  if (doc.settings.includeCover) {
    pdf.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    if (doc.cover?.pngPath && fs.existsSync(doc.cover.pngPath)) {
      pdf.image(doc.cover.pngPath, 0, 0, { width: pdf.page.width, height: pdf.page.height });
    } else {
      drawFallbackCover(pdf, doc, SERIFBOLD, BODY);
    }
  }

  // Disclaimer / title verso
  pdf.addPage();
  headerFooterSetup();
  pdf.font(SERIFBOLD).fontSize(22).fillColor("#1C1410").text(doc.title, { align: rtl ? "right" : "left" });
  pdf.moveDown(0.4);
  pdf.font(BODY).fontSize(12).fillColor("#5C4B3C").text(doc.subtitle);
  pdf.moveDown(1);
  if (doc.settings.includeAuthor) {
    pdf.font(BODY).fontSize(11).fillColor("#1C1410").text(doc.settings.authorName || "Folio Research");
  }
  pdf.moveDown(0.3);
  pdf.font(BODY).fontSize(9).fillColor("#6B5E52").text("Research-based · Sources cited · Generated with Folio");
  pdf.moveDown(0.3);
  pdf.text(`Language: ${doc.language}    Type: ${doc.type}    ${new Date(doc.createdAt).toISOString().slice(0, 10)}`);
  if (doc.disclaimer) {
    pdf.moveDown(1.4);
    pdf.font(BOLD).fontSize(11).fillColor("#7A2E3A").text("Disclaimer");
    pdf.font(BODY).fontSize(9).fillColor("#3A2C22").text(doc.disclaimer, { align: "justify" });
  }
  if (doc.analysis?.copyrightNotice) {
    pdf.moveDown(1);
    pdf.font(BOLD).fontSize(11).text("Copyright notice");
    pdf.font(BODY).fontSize(9).text(doc.analysis.copyrightNotice);
  }
  if (doc.syllabus?.sourceUrl) {
    pdf.moveDown(1);
    pdf.font(BOLD).fontSize(11).text("Syllabus source");
    pdf.font(BODY).fontSize(9).fillColor("#1C4C7C").text(doc.syllabus.sourceTitle || doc.syllabus.sourceUrl, {
      link: doc.syllabus.sourceUrl,
      underline: true,
    });
    pdf.fillColor("#6B5E52").text(`Last verified: ${doc.syllabus.lastVerified || "n/a"}`);
  }

  // TOC
  if (doc.settings.includeToc) {
    pdf.addPage();
    pdf.font(SERIFBOLD).fontSize(22).fillColor("#1C1410").text(labels.toc);
    pdf.moveDown(1);
    let n = 1;
    pdf.font(BODY).fontSize(12).fillColor("#1C1410").text(`${n}. ${labels.introduction}`);
    n++;
    for (const ch of doc.chapters) {
      pdf.moveDown(0.25);
      pdf.text(`${n}. ${ch.title}`);
      n++;
    }
    pdf.moveDown(0.25);
    pdf.text(`${n++}. ${labels.conclusion}`);
    if (doc.settings.includeGlossary && doc.glossary.length) pdf.text(`${n++}. ${labels.glossary}`);
    if (doc.faqs.length) pdf.text(`${n++}. ${labels.faq}`);
    if (doc.settings.includeReferences) pdf.text(`${n++}. ${labels.references}`);
  }

  // Introduction
  pdf.addPage();
  pdf.font(SERIFBOLD).fontSize(20).fillColor("#1C1410").text(labels.introduction);
  pdf.moveDown(0.8);
  writeHtmlish(pdf, markCites(doc.introduction), BODY, BOLD);

  for (const ch of doc.chapters) {
    pdf.addPage();
    writeChapter(pdf, ch, BODY, BOLD, SERIFBOLD, labels, markCites);
  }

  pdf.addPage();
  pdf.font(SERIFBOLD).fontSize(20).text(labels.conclusion);
  pdf.moveDown(0.8);
  writeHtmlish(pdf, markCites(doc.conclusion), BODY, BOLD);

  if (doc.settings.includeGlossary && doc.glossary.length) {
    pdf.addPage();
    pdf.font(SERIFBOLD).fontSize(20).text(labels.glossary);
    pdf.moveDown(0.8);
    for (const g of doc.glossary) {
      const cite = g.sourceIds.map((id) => `[${id}]`).join("");
      pdf.font(BOLD).fontSize(11).fillColor("#1C1410").text(g.term, { continued: true });
      pdf.font(BODY).fontSize(11).text(`  —  ${g.definition} ${cite}`);
      pdf.moveDown(0.35);
    }
  }

  if (doc.faqs.length) {
    pdf.addPage();
    pdf.font(SERIFBOLD).fontSize(20).text(labels.faq);
    pdf.moveDown(0.8);
    for (const f of doc.faqs) {
      pdf.font(BOLD).fontSize(12).text(f.question);
      pdf.moveDown(0.2);
      pdf.font(BODY).fontSize(11).text(f.answer);
      pdf.moveDown(0.6);
    }
  }

  if (doc.settings.includeReferences) {
    pdf.addPage();
    pdf.font(SERIFBOLD).fontSize(20).text(labels.references);
    pdf.moveDown(0.6);
    pdf.font(BODY).fontSize(9).fillColor("#6B5E52").text("Numbered references correspond to citations in the text. Prefer higher-tier official sources.");
    pdf.moveDown(0.8);
    const list = sortSources(doc.sources, used);
    for (const s of list) {
      const line = `[${s.id}] ${s.title} — ${s.organization} — ${s.url}`;
      pdf.font(BODY).fontSize(9).fillColor("#1C1410").text(line, {
        link: s.url,
        underline: false,
        align: "left",
      });
      pdf.fillColor("#1C4C7C").fontSize(8).text(s.url, { link: s.url, underline: true });
      pdf.moveDown(0.35);
    }
  }

  // Page numbers / headers
  const range = pdf.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    pdf.switchToPage(range.start + i);
    const isCover = i === 0 && doc.settings.includeCover;
    if (isCover) continue;
    const w = pdf.page.width;
    const h = pdf.page.height;
    pdf.save();
    pdf.font(BODY).fontSize(8).fillColor("#8A7560");
    pdf.text(doc.title.slice(0, 70), 64, 28, { width: w - 128, align: "left", lineBreak: false });
    pdf.text("Folio", 64, 28, { width: w - 128, align: "right", lineBreak: false });
    pdf.moveTo(64, 44).strokeColor("#E0D5C5").lineWidth(0.6).stroke();
    if (doc.settings.includePageNumbers) {
      pdf.text(String(i + 1), 64, h - 40, { width: w - 128, align: "center" });
    }
    pdf.restore();
  }

  pdf.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
  return destPath;
}

function headerFooterSetup() {
  /* page loop later */
}

function drawFallbackCover(pdf: PDFKit.PDFDocument, doc: EbookDocument, serifBold: string, body: string) {
  pdf.rect(0, 0, pdf.page.width, pdf.page.height).fill("#2A1C16");
  pdf.rect(24, 24, pdf.page.width - 48, pdf.page.height - 48).strokeColor("#D4BC6E").lineWidth(1.5).stroke();
  pdf.fillColor("#D4BC6E").font(body).fontSize(11).text("FOLIO  ·  RESEARCH EBOOK", 56, 80);
  pdf.fillColor("#F6F0E6").font(serifBold).fontSize(32).text(doc.title, 56, 160, { width: pdf.page.width - 112 });
  pdf.fillColor("#C4B09A").font(body).fontSize(14).text(doc.subtitle, 56, 360, { width: pdf.page.width - 112 });
  pdf.rect(0, pdf.page.height - 140, pdf.page.width, 140).fill("#7A2E3A");
  pdf.fillColor("#F6F0E6").font(body).fontSize(14).text(doc.settings.authorName || "Folio Research", 56, pdf.page.height - 90);
}

function writeChapter(
  pdf: PDFKit.PDFDocument,
  ch: Chapter,
  BODY: string,
  BOLD: string,
  SERIFBOLD: string,
  labels: ReturnType<typeof labelsFor>,
  markCites: (s: string) => string
) {
  pdf.font(BODY).fontSize(10).fillColor("#9A7B2F").text(`Chapter ${ch.index + 1}`);
  pdf.moveDown(0.3);
  pdf.font(SERIFBOLD).fontSize(20).fillColor("#1C1410").text(ch.title);
  pdf.moveDown(0.8);

  if (ch.learningObjectives.length) {
    pdf.font(BOLD).fontSize(12).text(labels.objectives);
    pdf.moveDown(0.3);
    pdf.font(BODY).fontSize(11);
    for (const o of ch.learningObjectives) pdf.text(`•  ${o}`);
    pdf.moveDown(0.6);
  }

  for (const img of ch.images.slice(0, 2)) {
    if (img.localPath && fs.existsSync(img.localPath)) {
      try {
        pdf.image(img.localPath, { fit: [440, 260], align: "center" });
        pdf.font(BODY).fontSize(8).fillColor("#6B5E52").text(img.caption);
        pdf.text(img.credit);
        pdf.moveDown(0.5);
      } catch {
        /* skip */
      }
    }
  }

  for (const sec of ch.sections) {
    ensureSpace(pdf, 80);
    pdf.font(BOLD).fontSize(13).fillColor("#1C1410").text(sec.heading);
    pdf.moveDown(0.35);
    writeHtmlish(pdf, markCites(sec.html), BODY, BOLD);
    pdf.moveDown(0.4);
  }

  if (ch.keyPoints.length) {
    ensureSpace(pdf, 80);
    pdf.font(BOLD).fontSize(12).text(labels.keyPoints);
    pdf.moveDown(0.3);
    pdf.font(BODY).fontSize(11);
    for (const k of ch.keyPoints) pdf.text(`•  ${strip(k)}`);
    pdf.moveDown(0.5);
  }

  if (ch.examples.length) {
    pdf.font(BOLD).fontSize(12).text(labels.examples);
    pdf.moveDown(0.3);
    pdf.font(BODY).fontSize(11);
    for (const e of ch.examples) pdf.text(`•  ${strip(e)}`);
    pdf.moveDown(0.5);
  }

  if (ch.commonMistakes.length) {
    pdf.font(BOLD).fontSize(12).text(labels.mistakes);
    pdf.moveDown(0.3);
    pdf.font(BODY).fontSize(11);
    for (const e of ch.commonMistakes) pdf.text(`•  ${strip(e)}`);
    pdf.moveDown(0.5);
  }

  if (ch.summary) {
    pdf.font(BOLD).fontSize(12).text(labels.summary);
    pdf.moveDown(0.3);
    writeHtmlish(pdf, markCites(ch.summary), BODY, BOLD);
    pdf.moveDown(0.5);
  }

  if (ch.questions.length) {
    pdf.font(BOLD).fontSize(12).text(labels.questions);
    pdf.moveDown(0.3);
    ch.questions.forEach((q, i) => {
      pdf.font(BODY).fontSize(11).text(`${i + 1}. ${q.question}`);
      pdf.font(BODY).fontSize(10).fillColor("#5C4B3C").text(`   ${labels.answers}: ${q.answer}`);
      pdf.fillColor("#1C1410");
      pdf.moveDown(0.3);
    });
  }

  if (ch.mcqs.length) {
    pdf.moveDown(0.3);
    pdf.font(BOLD).fontSize(12).text(labels.mcqs);
    pdf.moveDown(0.3);
    ch.mcqs.forEach((q, i) => {
      pdf.font(BODY).fontSize(11).text(`${i + 1}. ${q.question}`);
      (q.options || []).forEach((opt, j) => {
        pdf.text(`    ${String.fromCharCode(65 + j)}. ${opt}`);
      });
      pdf.font(BODY).fontSize(10).fillColor("#5C4B3C").text(`   ${labels.answers}: ${q.answer}`);
      pdf.fillColor("#1C1410");
      pdf.moveDown(0.35);
    });
  }
}

function writeHtmlish(pdf: PDFKit.PDFDocument, html: string, BODY: string, BOLD: string) {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<sup[^>]*>/gi, " ")
    .replace(/<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  pdf.font(BODY).fontSize(11).fillColor("#1C1410").text(text.trim(), { align: "justify", lineGap: 3 });
}

function ensureSpace(pdf: PDFKit.PDFDocument, min: number) {
  if (pdf.y > pdf.page.height - 64 - min) pdf.addPage();
}

function strip(s: string) {
  return s.replace(/<[^>]+>/g, "");
}

function sortSources(sources: SourceRecord[], used: Set<number>) {
  const copy = [...sources];
  copy.sort((a, b) => {
    const ua = used.has(a.id) ? 0 : 1;
    const ub = used.has(b.id) ? 0 : 1;
    if (ua !== ub) return ua - ub;
    return a.tier - b.tier || a.id - b.id;
  });
  return copy;
}
