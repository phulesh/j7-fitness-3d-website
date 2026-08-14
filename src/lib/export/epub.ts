import fs from "fs";
import path from "path";
import JSZip from "jszip";
import type { EbookDocument } from "../types";
import { labelsFor } from "../generate/write";
import { isRtl } from "../language";
import { groupReferences, sourceCitation } from "../references";

export async function exportEpub(doc: EbookDocument, destPath: string): Promise<string> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const labels = labelsFor(doc.outputLanguage || doc.language);
  const rtl = isRtl(doc.outputLanguage || doc.language);
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.folder("META-INF")!.file(
    "container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const oebps = zip.folder("OEBPS")!;
  oebps.file("styles.css", CSS);

  const fontName = "NotoSansDevanagari-Regular.ttf";
  const fontPath = path.join(process.cwd(), "public", "fonts", fontName);
  const hasFont = fs.existsSync(fontPath);
  if (hasFont) oebps.file(`fonts/${fontName}`, fs.readFileSync(fontPath));

  // Resolve and validate assets before XHTML is written. EPUB must never keep
  // authenticated /api URLs: every image is either embedded and rewritten to
  // a package-relative path, or its entire broken figure is removed.
  const imageMap = new Map<string, string>();
  doc.chapters.forEach((ch, ci) => {
    (ch.images || []).forEach((img, ii) => {
      const src = img.localPath && fs.existsSync(img.localPath) ? img.localPath : "";
      const png = src.endsWith(".svg") ? src.replace(/\.svg$/i, ".png") : src;
      const file = png && fs.existsSync(png) ? png : src && fs.existsSync(src) ? src : "";
      if (!file) return;
      const ext = path.extname(file).toLowerCase() || ".png";
      const name = `images/ch${ci + 1}-${ii + 1}${ext}`;
      oebps.file(name, fs.readFileSync(file));
      if (img.url) imageMap.set(img.url, name);
      imageMap.set(`/api/ebooks/${doc.id}/images/${path.basename(file)}`, name);
      if (src) imageMap.set(`/api/ebooks/${doc.id}/images/${path.basename(src)}`, name);
    });
  });

  let coverHref = "";
  if (doc.cover?.pngPath && fs.existsSync(doc.cover.pngPath)) {
    coverHref = "images/cover.png";
    oebps.file(coverHref, fs.readFileSync(doc.cover.pngPath));
  }

  const chaptersXhtml: { id: string; href: string; title: string; html: string }[] = [];

  if (doc.settings.includeCover) {
    chaptersXhtml.push({
      id: "cover",
      href: "cover.xhtml",
      title: "Cover",
      html: wrap(
        "Cover",
        `<div class="cover">
          ${coverHref ? `<img class="cover-art" src="${coverHref}" alt="${esc(doc.title)}"/>` : ""}
          <p class="kicker">FOLIO</p>
          <h1>${esc(doc.title)}</h1>
          <p class="sub">${esc(doc.subtitle)}</p>
          <p class="author">${esc(doc.settings.authorName || "Folio Research")}</p>
        </div>`,
        rtl,
        doc.language
      ),
    });
  }

  const publicationTitle = (doc.outputLanguage || doc.language) === "hi" ? "प्रकाशन सूचना" : "Publication Information";
  chaptersXhtml.push({
    id: "publication",
    href: "publication.xhtml",
    title: publicationTitle,
    html: wrap(publicationTitle, `<h1>${esc(publicationTitle)}</h1><p>© ${new Date(doc.createdAt).getFullYear()} ${esc(doc.settings.authorName || "Folio Research")}</p><p>${esc((doc.outputLanguage || doc.language) === "hi" ? "शोध-आधारित पुस्तक · स्रोत उद्धृत" : "Research-based book · Sources cited")}</p>`, rtl, doc.language),
  });
  const prefaceTitle = (doc.outputLanguage || doc.language) === "hi" ? "प्राक्कथन" : "Preface";
  chaptersXhtml.push({
    id: "preface",
    href: "preface.xhtml",
    title: prefaceTitle,
    html: wrap(prefaceTitle, `<h1>${esc(prefaceTitle)}</h1><p>${esc((doc.outputLanguage || doc.language) === "hi" ? "यह पुस्तक विश्वसनीय स्रोतों, स्पष्ट उद्धरणों और तथ्य तथा व्याख्या के भेद के साथ तैयार की गई है।" : "This book was prepared with reliable sources, traceable citations, and a clear distinction between evidence and interpretation.")}</p>`, rtl, doc.language),
  });

  if (doc.settings.includeToc) {
    const items = [
      `<li><a href="publication.xhtml">${esc(publicationTitle)}</a></li>`,
      `<li><a href="preface.xhtml">${esc(prefaceTitle)}</a></li>`,
      `<li><a href="intro.xhtml">${esc(labels.introduction)}</a></li>`,
      ...doc.chapters.map((c, i) => `<li><a href="chapter-${i + 1}.xhtml">${esc(c.title)}</a></li>`),
      `<li><a href="conclusion.xhtml">${esc(labels.conclusion)}</a></li>`,
      doc.glossary.length ? `<li><a href="glossary.xhtml">${esc(labels.glossary)}</a></li>` : "",
      doc.faqs.length ? `<li><a href="faq.xhtml">${esc(labels.faq)}</a></li>` : "",
      `<li><a href="references.xhtml">${esc(labels.references)}</a></li>`,
    ].join("\n");
    chaptersXhtml.push({
      id: "nav",
      href: "nav.xhtml",
      title: labels.toc,
      html: wrap(labels.toc, `<h1>${esc(labels.toc)}</h1><ol class="toc">${items}</ol>`, rtl, doc.language),
    });
  }

  chaptersXhtml.push({
    id: "intro",
    href: "intro.xhtml",
    title: labels.introduction,
    html: wrap(labels.introduction, `<h1>${esc(labels.introduction)}</h1>${block(doc.introduction)}${doc.disclaimer ? `<aside class="disclaimer"><strong>Disclaimer.</strong> ${esc(doc.disclaimer)}</aside>` : ""}`, rtl, doc.language),
  });

  doc.chapters.forEach((ch, i) => {
    const body = [
      `<p class="kicker">Chapter ${i + 1}</p>`,
      `<h1>${esc(ch.title)}</h1>`,
      ch.learningObjectives.length
        ? `<h2>${esc(labels.objectives)}</h2><ul>${ch.learningObjectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>`
        : "",
      ...ch.sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.html}`),
      !ch.sections.some((s) => /class=["']ebook-figure/.test(s.html))
        ? (ch.images || [])
            .filter((img) => imageMap.has(img.url))
            .map(
              (img) =>
                `<figure class="ebook-figure"><img src="${esc(img.url)}" alt="${esc(img.alt)}"/><figcaption><strong>${esc(
                  img.figureLabel || img.caption
                )}</strong> — ${esc(img.credit)}${
                  img.verifiedHistoricalPhoto === false ? "<br/>व्याख्यात्मक चित्रण — ऐतिहासिक फोटोग्राफ नहीं" : ""
                }</figcaption></figure>`
            )
            .join("")
        : "",
      ch.keyPoints.length ? `<h2>${esc(labels.keyPoints)}</h2><ul>${ch.keyPoints.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : "",
      ch.examples.length ? `<h2>${esc(labels.examples)}</h2><ul>${ch.examples.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : "",
      ch.commonMistakes.length ? `<h2>${esc(labels.mistakes)}</h2><ul>${ch.commonMistakes.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : "",
      ch.summary ? `<h2>${esc(labels.summary)}</h2>${block(ch.summary)}` : "",
      ch.questions.length
        ? `<h2>${esc(labels.questions)}</h2>${ch.questions
            .map((q, n) => `<p><strong>${n + 1}.</strong> ${esc(q.question)}</p><p class="answer">${esc(labels.answers)}: ${esc(q.answer)}</p>`)
            .join("")}`
        : "",
      ch.mcqs.length
        ? `<h2>${esc(labels.mcqs)}</h2>${ch.mcqs
            .map(
              (q, n) =>
                `<p><strong>${n + 1}.</strong> ${esc(q.question)}</p><ul>${(q.options || [])
                  .map((o, j) => `<li>${String.fromCharCode(65 + j)}. ${esc(o)}</li>`)
                  .join("")}</ul><p class="answer">${esc(labels.answers)}: ${esc(q.answer)}</p>${
                  q.explanation ? `<p class="answer">${esc(labels.explanation)}: ${esc(q.explanation)}</p>` : ""
                }`
            )
            .join("")}`
        : "",
    ].join("\n");
    chaptersXhtml.push({
      id: `ch${i + 1}`,
      href: `chapter-${i + 1}.xhtml`,
      title: ch.title,
      html: wrap(ch.title, body, rtl, doc.language),
    });
  });

  chaptersXhtml.push({
    id: "conclusion",
    href: "conclusion.xhtml",
    title: labels.conclusion,
    html: wrap(labels.conclusion, `<h1>${esc(labels.conclusion)}</h1>${block(doc.conclusion)}`, rtl, doc.language),
  });

  if (doc.glossary.length) {
    chaptersXhtml.push({
      id: "glossary",
      href: "glossary.xhtml",
      title: labels.glossary,
      html: wrap(
        labels.glossary,
        `<h1>${esc(labels.glossary)}</h1><dl>${doc.glossary
          .map((g) => `<dt>${esc(g.term)}</dt><dd>${esc(g.definition)}${g.context ? `<br/><small>${esc(g.context)}</small>` : ""}</dd>`)
          .join("")}</dl>`,
        rtl,
        doc.language
      ),
    });
  }

  if (doc.faqs.length) {
    chaptersXhtml.push({
      id: "faq",
      href: "faq.xhtml",
      title: labels.faq,
      html: wrap(
        labels.faq,
        `<h1>${esc(labels.faq)}</h1>${doc.faqs
          .map((faq, index) => `<section><h2>${index + 1}. ${esc(faq.question)}</h2>${block(faq.answer)}</section>`)
          .join("\n")}`,
        rtl,
        doc.language
      ),
    });
  }

  const refs = groupReferences(doc.sources)
    .map((group) => `<section><h2>${esc((doc.outputLanguage || doc.language) === "hi" ? `${group.titleHi} · ${group.title}` : group.title)}</h2>${group.sources.map((s) => `<p id="ref-${s.id}">[${s.id}] ${esc(sourceCitation(s))}${/^https?:\/\//.test(s.url) ? ` — <a href="${esc(s.url)}">${esc(s.url)}</a>` : ""}</p>`).join("\n")}</section>`)
    .join("\n");
  chaptersXhtml.push({
    id: "references",
    href: "references.xhtml",
    title: labels.references,
    html: wrap(labels.references, `<h1>${esc(labels.references)}</h1>${refs}`, rtl, doc.language),
  });

  for (const c of chaptersXhtml) {
    let html = c.html;
    for (const [from, to] of imageMap) html = html.split(from).join(to);
    // Older ebook records can contain a stale authenticated image URL. It is
    // safer to remove that complete figure than to ship an empty rectangle.
    html = html.replace(/<figure\b[^>]*>[\s\S]*?<img\b[^>]*src=["']\/api\/ebooks\/[^"']+["'][^>]*>[\s\S]*?<\/figure>/gi, "");
    html = html.replace(/<img\b[^>]*src=["']\/api\/ebooks\/[^"']+["'][^>]*\/?\s*>/gi, "");
    oebps.file(c.href, html);
  }

  const imageItems = [...new Set(imageMap.values())].map((href, i) => {
    const mime = href.endsWith(".svg") ? "image/svg+xml" : href.endsWith(".png") ? "image/png" : "image/jpeg";
    return `<item id="img${i + 1}" href="${href}" media-type="${mime}"/>`;
  });
  const manifest = [
    `<item id="css" href="styles.css" media-type="text/css"/>`,
    ...(hasFont ? [`<item id="devanagari-font" href="fonts/${fontName}" media-type="font/ttf"/>`] : []),
    ...(coverHref ? [`<item id="cover-image" href="${coverHref}" media-type="image/png" properties="cover-image"/>`] : []),
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    ...chaptersXhtml
      .filter((c) => c.id !== "nav")
      .map((c) => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`),
    ...imageItems,
  ].join("\n    ");

  const spine = chaptersXhtml.map((c) => `<itemref idref="${c.id}"/>`).join("\n    ");

  oebps.file(
    "content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0" xml:lang="${doc.language}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${doc.id}</dc:identifier>
    <dc:title>${esc(doc.title)}</dc:title>
    <dc:creator>${esc(doc.settings.authorName || "Folio Research")}</dc:creator>
    <dc:language>${esc(doc.outputLanguage || doc.language)}</dc:language>
    <dc:description>${esc(doc.subtitle)}</dc:description>
    <dc:publisher>Folio</dc:publisher>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`
  );

  const buf = await zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" });
  fs.writeFileSync(destPath, buf);
  return destPath;
}

function wrap(title: string, body: string, rtl: boolean, lang: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}" dir="${rtl ? "rtl" : "ltr"}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" href="styles.css"/></head>
<body>${body}</body></html>`;
}

function block(text: string) {
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CSS = `
@font-face { font-family: "Noto Sans Devanagari"; src: url("fonts/NotoSansDevanagari-Regular.ttf") format("truetype"); font-weight: 400; font-style: normal; }
body { font-family: "Noto Sans Devanagari", "Source Serif 4", "Noto Serif", Georgia, serif; line-height: 1.7; color: #1c1410; margin: 1.2em; }
.cover-art { display: block; max-height: 58vh; max-width: 100%; margin: 0 auto 1em; object-fit: contain; }
h1 { font-size: 1.7em; margin-bottom: .4em; }
h2 { font-size: 1.2em; margin-top: 1.2em; }
.kicker { letter-spacing: .18em; text-transform: uppercase; color: #9a7b2f; font-size: .78em; }
.cover { min-height: 90vh; display: flex; flex-direction: column; justify-content: center; }
.sub { color: #5c4b3c; }
.author { margin-top: 2em; }
.disclaimer { border: 1px solid #e0d5c5; padding: .8em; margin-top: 1.5em; font-size: .92em; }
.answer { color: #5c4b3c; font-size: .95em; }
a { color: #1c4c7c; }
.cite { font-size: .75em; }
.ebook-figure { margin: 1.2em 0; }
.ebook-figure img { max-width: 100%; height: auto; }
.ebook-figure figcaption { font-size: .9em; color: #5c4b3c; }
.evidence-table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: .95em; }
.evidence-table th, .evidence-table td { border: 1px solid #e0d5c5; padding: .4em .6em; vertical-align: top; }
.evidence-table th { width: 2em; }
`;
