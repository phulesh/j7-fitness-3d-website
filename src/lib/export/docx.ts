import fs from "fs";
import path from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
  PageBreak,
  Header,
  Footer,
  AlignmentType,
  ExternalHyperlink,
  BorderStyle,
  PageNumber,
} from "docx";
import type { EbookDocument } from "../types";
import { labelsFor } from "../generate/write";
import { groupReferences, sourceCitation } from "../references";

export async function exportDocx(doc: EbookDocument, destPath: string): Promise<string> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const labels = labelsFor(doc.outputLanguage || doc.language);
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE }));
  if (doc.subtitle) children.push(new Paragraph({ text: doc.subtitle, heading: HeadingLevel.HEADING_2 }));
  if (doc.settings.includeAuthor) {
    children.push(new Paragraph({ text: doc.settings.authorName || "Folio Research" }));
  }
  children.push(new Paragraph({ text: "Research-based ebook · Sources cited · Folio" }));
  if (doc.disclaimer) {
    children.push(new Paragraph({ text: "Disclaimer", heading: HeadingLevel.HEADING_2 }));
    children.push(p(doc.disclaimer));
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  children.push(new Paragraph({ text: (doc.outputLanguage || doc.language) === "hi" ? "प्राक्कथन" : "Preface", heading: HeadingLevel.HEADING_1 }));
  children.push(p((doc.outputLanguage || doc.language) === "hi" ? "यह पुस्तक विश्वसनीय स्रोतों, स्पष्ट उद्धरणों और तथ्य तथा व्याख्या के भेद के साथ तैयार की गई है।" : "This book was prepared with reliable sources, traceable citations, and a clear distinction between evidence and interpretation."));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  if (doc.settings.includeToc) {
    children.push(new Paragraph({ text: labels.toc, heading: HeadingLevel.HEADING_1 }));
    children.push(p(labels.introduction));
    for (const ch of doc.chapters) children.push(p(`${ch.index + 1}. ${ch.title}`));
    children.push(p(labels.conclusion));
    if (doc.glossary.length) children.push(p(labels.glossary));
    children.push(p(labels.references));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  children.push(new Paragraph({ text: labels.introduction, heading: HeadingLevel.HEADING_1 }));
  children.push(...htmlToParagraphs(doc.introduction));

  for (const ch of doc.chapters) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ text: `Chapter ${ch.index + 1}. ${ch.title}`, heading: HeadingLevel.HEADING_1 }));
    if (ch.learningObjectives.length) {
      children.push(new Paragraph({ text: labels.objectives, heading: HeadingLevel.HEADING_2 }));
      for (const o of ch.learningObjectives) children.push(bullet(o));
    }
    for (const img of ch.images) {
      const raster = img.localPath?.endsWith(".svg")
        ? img.localPath.replace(/\.svg$/i, ".png")
        : img.localPath;
      if (raster && fs.existsSync(raster) && /\.(png|jpe?g)$/i.test(raster)) {
        try {
          const buf = fs.readFileSync(raster);
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: buf,
                  transformation: { width: 480, height: 280 },
                  type: raster.endsWith(".png") ? "png" : "jpg",
                }),
              ],
            })
          );
          children.push(p(`${img.figureLabel || img.caption} — ${img.credit}`));
          if (img.verifiedHistoricalPhoto === false) {
            children.push(p("व्याख्यात्मक चित्र — यह ऐतिहासिक फोटोग्राफ नहीं है।"));
          }
        } catch {
          children.push(p(`${img.figureLabel || img.caption} — ${img.credit}`));
        }
      } else {
        children.push(p(`${img.figureLabel || img.caption} — ${img.credit}`));
      }
    }
    for (const sec of ch.sections) {
      children.push(new Paragraph({ text: sec.heading, heading: HeadingLevel.HEADING_2 }));
      children.push(...htmlToParagraphs(sec.html.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "")));
    }
    if (ch.keyPoints.length) {
      children.push(new Paragraph({ text: labels.keyPoints, heading: HeadingLevel.HEADING_2 }));
      for (const k of ch.keyPoints) children.push(bullet(k));
    }
    if (ch.examples.length) {
      children.push(new Paragraph({ text: labels.examples, heading: HeadingLevel.HEADING_2 }));
      for (const e of ch.examples) children.push(bullet(e));
    }
    if (ch.commonMistakes.length) {
      children.push(new Paragraph({ text: labels.mistakes, heading: HeadingLevel.HEADING_2 }));
      for (const e of ch.commonMistakes) children.push(bullet(e));
    }
    if (ch.summary) {
      children.push(new Paragraph({ text: labels.summary, heading: HeadingLevel.HEADING_2 }));
      children.push(...htmlToParagraphs(ch.summary));
    }
    if (ch.questions.length) {
      children.push(new Paragraph({ text: labels.questions, heading: HeadingLevel.HEADING_2 }));
      ch.questions.forEach((q, i) => {
        children.push(p(`${i + 1}. ${q.question}`));
        children.push(p(`${labels.answers}: ${q.answer}`));
      });
    }
    if (ch.mcqs.length) {
      children.push(new Paragraph({ text: labels.mcqs, heading: HeadingLevel.HEADING_2 }));
      ch.mcqs.forEach((q, i) => {
        children.push(p(`${i + 1}. ${q.question}`));
        (q.options || []).forEach((opt, j) => children.push(p(`   ${String.fromCharCode(65 + j)}. ${opt}`)));
        children.push(p(`${labels.answers}: ${q.answer}`));
      });
    }
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(new Paragraph({ text: labels.conclusion, heading: HeadingLevel.HEADING_1 }));
  children.push(...htmlToParagraphs(doc.conclusion));

  if (doc.settings.includeGlossary && doc.glossary.length) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ text: labels.glossary, heading: HeadingLevel.HEADING_1 }));
    for (const g of doc.glossary) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: g.term, bold: true }),
            new TextRun({ text: ` — ${g.definition}${g.context ? ` (${g.context})` : ""}` }),
          ],
        })
      );
    }
  }

  if (doc.faqs.length) {
    children.push(new Paragraph({ text: labels.faq, heading: HeadingLevel.HEADING_1 }));
    for (const f of doc.faqs) {
      children.push(new Paragraph({ text: f.question, heading: HeadingLevel.HEADING_3 }));
      children.push(p(f.answer));
    }
  }

  if (doc.settings.includeReferences) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ text: labels.references, heading: HeadingLevel.HEADING_1 }));
    for (const group of groupReferences(doc.sources)) {
      children.push(new Paragraph({ text: (doc.outputLanguage || doc.language) === "hi" ? `${group.titleHi} · ${group.title}` : group.title, heading: HeadingLevel.HEADING_2 }));
      for (const s of group.sources) {
        const runs: (TextRun | ExternalHyperlink)[] = [new TextRun({ text: `[${s.id}] ${sourceCitation(s)}` })];
        if (/^https?:\/\//.test(s.url)) runs.push(new ExternalHyperlink({ children: [new TextRun({ text: ` — ${s.url}`, style: "Hyperlink" })], link: s.url }));
        children.push(new Paragraph({ children: runs }));
      }
    }
  }

  const document = new Document({
    creator: doc.settings.authorName || "Folio Research",
    title: doc.title,
    description: doc.subtitle,
    styles: {
      default: {
        document: {
          run: {
            font:
              doc.language === "hi" || doc.outputLanguage === "hi"
                ? { ascii: "Noto Sans Devanagari", eastAsia: "Noto Sans Devanagari", cs: "Noto Sans Devanagari", hAnsi: "Noto Sans Devanagari" }
                : "Calibri",
            size: 22,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 864, right: 864 },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({ text: doc.title, style: "Header" })],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: doc.settings.includePageNumbers
                  ? [new TextRun("Folio  ·  "), new TextRun({ children: [PageNumber.CURRENT] })]
                  : [new TextRun("Folio")],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buf = await Packer.toBuffer(document);
  fs.writeFileSync(destPath, buf);
  return destPath;
}

function p(text: string) {
  return new Paragraph({ children: [new TextRun(strip(text))] });
}
function bullet(text: string) {
  return new Paragraph({ text: strip(text), bullet: { level: 0 } });
}
function strip(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
}
function htmlToParagraphs(html: string): Paragraph[] {
  const parts = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((t) => p(t));
}
