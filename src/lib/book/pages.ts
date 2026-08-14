import type { ChapterImage, EbookDocument } from "../types";
import { labelsFor } from "../generate/text";
import { groupReferences, sourceCitation } from "../references";

export type BookPageKind = "cover" | "front" | "toc" | "chapter" | "references" | "glossary" | "blank";

export interface BookPage {
  index: number;
  kind: BookPageKind;
  title: string;
  html: string;
  chapterIndex?: number;
  pageLabel: string;
}

type DraftPage = Omit<BookPage, "index" | "pageLabel">;

function strip(html: string) {
  return (html || "")
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunks(text: string, max = 760): string[] {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const result: string[] = [];
  let current = "";
  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    const sentences = paragraph.match(/[^.!?।]+[.!?।]?/g) || [paragraph];
    for (const sentence of sentences) {
      if (current && current.length + sentence.length > max) {
        result.push(current.trim());
        current = "";
      }
      current += `${sentence.trim()} `;
    }
    current += "\n\n";
  }
  if (current.trim()) result.push(current.trim());
  return result.length ? result : [""];
}

function textPages(kind: BookPageKind, title: string, text: string, chapterIndex?: number): DraftPage[] {
  return chunks(strip(text)).map((part, index) => ({
    kind,
    title,
    chapterIndex,
    html: `<h2>${esc(title)}</h2>${index ? `<p class="continued">Continued</p>` : ""}${part
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((paragraph) => `<p>${esc(paragraph)}</p>`)
      .join("")}`,
  }));
}

function figurePagesHtml(images: ChapterImage[], lang: string) {
  const source = lang === "hi" ? "स्रोत" : "Source";
  return images.map((image) => `<figure class="ebook-figure"><img src="${esc(image.url)}" alt="${esc(image.alt || image.caption)}" loading="lazy"/><figcaption><strong>${esc(image.figureLabel || image.caption)}</strong><span class="figure-title">${esc(image.caption)}</span><span class="figure-credit">${source}: ${esc(image.credit)}</span>${image.verifiedHistoricalPhoto === false ? `<span class="figure-note">${lang === "hi" ? "व्याख्यात्मक चित्र — यह ऐतिहासिक फोटोग्राफ नहीं है।" : "Explanatory illustration — not a historical photograph."}</span>` : ""}</figcaption></figure>`).join("\n");
}

/** Build stable, truly paginated pages shared by the browser 3D renderer. */
export function buildBookPages(doc: EbookDocument): BookPage[] {
  const lang = doc.outputLanguage || doc.language;
  const labels = labelsFor(lang);
  const hindi = lang === "hi";
  const pages: DraftPage[] = [];

  pages.push({
    kind: "cover",
    title: doc.title,
    html: `<div class="cover-page"><p class="kicker">FOLIO</p><h1>${esc(doc.title)}</h1><p class="sub">${esc(doc.subtitle || "")}</p><p class="author">${esc(doc.settings.authorName || "Folio Research")}</p></div>`,
  });
  pages.push({
    kind: "front",
    title: hindi ? "शीर्षक पृष्ठ" : "Title Page",
    html: `<div class="title-page"><h1>${esc(doc.title)}</h1><p>${esc(doc.subtitle || "")}</p><p>${esc(doc.settings.authorName || "Folio Research")}</p></div>`,
  });
  pages.push({
    kind: "front",
    title: hindi ? "प्रकाशन सूचना" : "Copyright & Publication Information",
    html: `<h2>${hindi ? "प्रकाशन सूचना" : "Publication Information"}</h2><p>© ${new Date(doc.createdAt).getFullYear()} ${esc(doc.settings.authorName || "Folio Research")}</p><p>${hindi ? "यह शोध-आधारित पुस्तक स्रोतों और संदर्भों के साथ तैयार की गई है।" : "This research-based book was prepared with traceable sources and references."}</p>${doc.disclaimer ? `<p>${esc(doc.disclaimer)}</p>` : ""}`,
  });
  pages.push({
    kind: "front",
    title: hindi ? "प्राक्कथन" : "Preface",
    html: `<h2>${hindi ? "प्राक्कथन" : "Preface"}</h2><p>${hindi ? "यह पुस्तक विषय को विश्वसनीय स्रोतों, स्पष्ट उद्धरणों और तथ्य तथा व्याख्या के भेद के साथ समझने के लिए तैयार की गई है।" : "This book was prepared to explain the subject through reliable sources, traceable citations, and a clear distinction between evidence and interpretation."}</p>`,
  });
  pages.push({ kind: "toc", title: labels.toc, html: "" });
  const tocIndex = pages.length - 1;

  pages.push(...textPages("front", labels.introduction, doc.introduction, undefined));

  const chapterStarts = new Map<number, number>();
  for (const [i, chapter] of doc.chapters.entries()) {
    chapterStarts.set(i, pages.length);
    pages.push({
      kind: "chapter",
      title: chapter.title,
      chapterIndex: i,
      html: `<p class="kicker">${esc(labels.chapter)} ${i + 1}</p><h1>${esc(chapter.title)}</h1>${chapter.subtitle ? `<p>${esc(chapter.subtitle)}</p>` : ""}${chapter.learningObjectives.length ? `<h3>${esc(labels.objectives)}</h3><ul>${chapter.learningObjectives.map((objective) => `<li>${esc(objective)}</li>`).join("")}</ul>` : ""}`,
    });

    if ((chapter.images || []).length) {
      pages.push({
        kind: "chapter",
        title: `${chapter.title} — ${hindi ? "चित्र" : "Figures"}`,
        chapterIndex: i,
        html: figurePagesHtml(chapter.images, lang),
      });
    }

    for (const section of chapter.sections) {
      pages.push(...textPages("chapter", section.heading || chapter.title, section.html, i));
    }
    const learning = [
      chapter.keyPoints.length ? `${labels.keyPoints}\n\n${chapter.keyPoints.join("\n\n")}` : "",
      chapter.summary ? `${labels.summary}\n\n${strip(chapter.summary)}` : "",
      // Keep main's richer Q&A formatting, and print the MCQ answer plus its
      // explanation: the 3D reader shows the finished book, not a quiz with
      // the answers withheld.
      chapter.questions.length
        ? `${labels.questions}\n\n${chapter.questions
            .map((q, n) => `${hindi ? "प्रश्न" : "Question"} ${n + 1}. ${q.question}\n\n${hindi ? "उत्तर" : "Answer"}\n\n${q.answer}${q.explanation ? `\n\n${q.explanation}` : ""}`)
            .join("\n\n")}`
        : "",
      chapter.mcqs.length
        ? `${labels.mcqs}\n\n${chapter.mcqs
            .map(
              (q, n) =>
                `${n + 1}. ${q.question}\n${(q.options || []).join(" · ")}\n${labels.answers}: ${q.answer}${
                  q.explanation ? `\n${labels.explanation}: ${strip(q.explanation)}` : ""
                }`
            )
            .join("\n\n")}`
        : "",
    ].filter(Boolean).join("\n\n");
    if (learning) pages.push(...textPages("chapter", hindi ? "अध्याय समीक्षा" : "Chapter Review", learning, i));
  }

  if (doc.conclusion) pages.push(...textPages("chapter", labels.conclusion, doc.conclusion));

  if (doc.settings.includeGlossary && doc.glossary.length) {
    const glossary = doc.glossary.map((entry) => `${entry.term} — ${entry.definition}${entry.context ? `\n${entry.context}` : ""}`).join("\n\n");
    pages.push(...textPages("glossary", labels.glossary, glossary));
  }

  if (doc.faqs.length) {
    const faqs = doc.faqs
      .map((faq, index) => `${hindi ? "प्रश्न" : "Question"} ${index + 1}. ${faq.question}\n\n${hindi ? "उत्तर" : "Answer"}: ${faq.answer}`)
      .join("\n\n");
    pages.push(...textPages("front", labels.faq, faqs));
  }

  if (doc.settings.includeReferences && doc.sources.length) {
    for (const group of groupReferences(doc.sources)) {
      const title = hindi ? `${group.titleHi} · ${group.title}` : group.title;
      const refs = group.sources.map((source) => `[${source.id}] ${sourceCitation(source)}${/^https?:\/\//.test(source.url) ? `\n${source.url}` : ""}`).join("\n\n");
      pages.push(...textPages("references", title, refs));
    }
  }

  pages.push({
    kind: "cover",
    title: doc.title,
    html: `<div class="cover-page back-cover"><p>${esc(doc.subtitle || doc.title)}</p><p>${esc(doc.settings.authorName || "Folio Research")}</p></div>`,
  });

  // The table of contents is written after pagination, so every number points
  // to the actual generated 3D page rather than a guessed chapter index.
  pages[tocIndex].html = `<h2>${esc(labels.toc)}</h2><ol class="toc">${doc.chapters.map((chapter, index) => `<li><span>${index + 1}. ${esc(chapter.title)}</span><strong>${(chapterStarts.get(index) || 0) + 1}</strong></li>`).join("")}</ol>`;

  if (pages.length % 2 === 1) pages.push({ kind: "blank", title: "", html: "" });
  return pages.map((page, index) => ({ ...page, index, pageLabel: String(index + 1) }));
}

function esc(value: string) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
