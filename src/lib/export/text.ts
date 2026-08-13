import fs from "fs";
import type { EbookDocument } from "../types";
import { htmlToPlain } from "../simple-flow";
import { labelsFor } from "../generate/text";

export function bookToMarkdown(doc: EbookDocument): string {
  const labels = labelsFor(doc.outputLanguage || doc.language);
  const lines: string[] = [];
  lines.push(`# ${doc.title}`);
  if (doc.subtitle) lines.push(`\n*${doc.subtitle}*`);
  if (doc.settings.authorName) lines.push(`\n${doc.settings.authorName}`);
  lines.push("");
  if (doc.introduction) {
    lines.push(`## ${labels.introduction}`, "", htmlToPlain(doc.introduction), "");
  }
  if (doc.settings.includeToc) {
    lines.push(`## ${labels.toc}`, "");
    doc.chapters.forEach((c, i) => lines.push(`${i + 1}. ${c.title}`));
    lines.push("");
  }
  doc.chapters.forEach((ch, i) => {
    lines.push(`## ${labels.chapter} ${i + 1}. ${ch.title}`, "");
    for (const s of ch.sections || []) {
      if (s.heading) lines.push(`### ${s.heading}`, "");
      lines.push(htmlToPlain(s.html), "");
    }
    if (ch.keyPoints?.length) {
      lines.push(`### ${labels.keyPoints}`, "");
      ch.keyPoints.forEach((k) => lines.push(`- ${k}`));
      lines.push("");
    }
    if (ch.summary) lines.push(`### ${labels.summary}`, "", ch.summary, "");
  });
  if (doc.conclusion) lines.push(`## ${labels.conclusion}`, "", htmlToPlain(doc.conclusion), "");
  if (doc.settings.includeGlossary && doc.glossary.length) {
    lines.push(`## ${labels.glossary}`, "");
    doc.glossary.forEach((g) => lines.push(`**${g.term}.** ${g.definition}`));
    lines.push("");
  }
  if (doc.settings.includeReferences && doc.sources.length) {
    lines.push(`## ${labels.references}`, "");
    doc.sources.forEach((s) => {
      lines.push(
        `[${s.id}] ${s.title}${s.author || s.organization ? ` — ${s.author || s.organization}` : ""}${
          s.year || s.publishedAt ? ` (${s.year || s.publishedAt?.slice(0, 4)})` : ""
        }${s.url ? ` — ${s.url}` : ""}`
      );
    });
  }
  return lines.join("\n").trim() + "\n";
}

export function bookToPlainText(doc: EbookDocument): string {
  return bookToMarkdown(doc)
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1");
}

export async function exportMarkdown(doc: EbookDocument, dest: string) {
  fs.writeFileSync(dest, bookToMarkdown(doc), "utf8");
  return dest;
}

export async function exportTxt(doc: EbookDocument, dest: string) {
  fs.writeFileSync(dest, bookToPlainText(doc), "utf8");
  return dest;
}
