import type { EbookDocument } from "../types";
import { labelsFor } from "../generate/text";

export type BookPageKind = "cover" | "front" | "toc" | "chapter" | "references" | "glossary" | "blank";

export interface BookPage {
  index: number;
  kind: BookPageKind;
  title: string;
  html: string;
  chapterIndex?: number;
  pageLabel: string;
}

function strip(html: string) {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(text: string, size = 1100): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const out: string[] = [];
  let cur: string[] = [];
  let n = 0;
  for (const w of words) {
    cur.push(w);
    n += w.length + 1;
    if (n >= size) {
      out.push(cur.join(" "));
      cur = [];
      n = 0;
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

function p(text: string) {
  return `<p>${text}</p>`;
}

export function buildBookPages(doc: EbookDocument): BookPage[] {
  const labels = labelsFor(doc.outputLanguage || doc.language);
  const pages: Omit<BookPage, "index" | "pageLabel">[] = [];

  pages.push({
    kind: "cover",
    title: doc.title,
    html: `<div class="cover-page"><p class="kicker">FOLIO</p><h1>${esc(doc.title)}</h1><p class="sub">${esc(
      doc.subtitle || ""
    )}</p><p class="author">${esc(doc.settings.authorName || "Folio Research")}</p><p class="meta">${esc(
      doc.type
    )} · ${esc(doc.outputLanguage || doc.language)}</p></div>`,
  });

  pages.push({
    kind: "front",
    title: labels.introduction,
    html: `<h2>${esc(labels.introduction)}</h2>${toHtml(doc.introduction)}${
      doc.disclaimer ? `<aside class="disclaimer">${esc(doc.disclaimer)}</aside>` : ""
    }`,
  });

  if (doc.settings.includeToc) {
    const items = [
      `<li>${esc(labels.introduction)}</li>`,
      ...doc.chapters.map((c, i) => `<li>${i + 1}. ${esc(c.title)}</li>`),
      `<li>${esc(labels.conclusion)}</li>`,
      doc.settings.includeGlossary && doc.glossary.length ? `<li>${esc(labels.glossary)}</li>` : "",
      doc.settings.includeReferences ? `<li>${esc(labels.references)}</li>` : "",
    ]
      .filter(Boolean)
      .join("");
    pages.push({
      kind: "toc",
      title: labels.toc,
      html: `<h2>${esc(labels.toc)}</h2><ol class="toc">${items}</ol>`,
    });
  }

  for (const [i, ch] of doc.chapters.entries()) {
    const body = [
      `<p class="kicker">${labels.chapter} ${i + 1}</p>`,
      `<h2>${esc(ch.title)}</h2>`,
      ch.learningObjectives.length
        ? `<h3>${esc(labels.objectives)}</h3><ul>${ch.learningObjectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>`
        : "",
      ...ch.sections.map((s) => `<h3>${esc(s.heading)}</h3>${s.html}`),
      ...(ch.images || []).map(
        (img) =>
          `<figure class="ebook-figure"><p>${esc(img.figureLabel || img.caption)}</p><p>${esc(img.credit)}</p>${
            img.verifiedHistoricalPhoto === false ? "<p>व्याख्यात्मक चित्रण — ऐतिहासिक फोटोग्राफ नहीं</p>" : ""
          }</figure>`
      ),
      ch.keyPoints.length
        ? `<h3>${esc(labels.keyPoints)}</h3><ul>${ch.keyPoints.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>`
        : "",
      ch.examples.length
        ? `<h3>${esc(labels.examples)}</h3><ul>${ch.examples.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>`
        : "",
      ch.summary ? `<h3>${esc(labels.summary)}</h3>${toHtml(ch.summary)}` : "",
    ].join("");
    const chunks = chunkText(strip(body), 900);
    chunks.forEach((chunk, ci) => {
      pages.push({
        kind: "chapter",
        title: ch.title,
        chapterIndex: i,
        html: ci === 0 ? body : `<h2>${esc(ch.title)}</h2>${p(esc(chunk))}`,
      });
    });
  }

  if (doc.conclusion) {
    pages.push({
      kind: "chapter",
      title: labels.conclusion,
      html: `<h2>${esc(labels.conclusion)}</h2>${toHtml(doc.conclusion)}`,
    });
  }

  if (doc.settings.includeGlossary && doc.glossary.length) {
    pages.push({
      kind: "glossary",
      title: labels.glossary,
      html: `<h2>${esc(labels.glossary)}</h2><dl>${doc.glossary
        .map((g) => `<dt>${esc(g.term)}</dt><dd>${esc(g.definition)}</dd>`)
        .join("")}</dl>`,
    });
  }

  if (doc.settings.includeReferences) {
    pages.push({
      kind: "references",
      title: labels.references,
      html: `<h2>${esc(labels.references)}</h2>${doc.sources
        .map(
          (s) =>
            `<p>[${s.id}] ${esc(s.title)} — ${esc(s.organization)}${s.publishedAt ? ` (${esc(s.publishedAt.slice(0, 4))})` : ""} — <a href="${esc(
              s.url
            )}">${esc(s.url)}</a></p>`
        )
        .join("")}`,
    });
  }

  if (pages.length % 2 === 1) {
    pages.push({ kind: "blank", title: "", html: "" });
  }

  return pages.map((p, i) => ({
    ...p,
    index: i,
    pageLabel: String(i + 1),
  }));
}

function toHtml(text: string) {
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((x) => `<p>${esc(x)}</p>`)
    .join("");
}

function esc(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
