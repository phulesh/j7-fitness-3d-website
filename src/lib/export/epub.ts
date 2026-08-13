import fs from "fs";
import path from "path";
import JSZip from "jszip";
import type { EbookDocument } from "../types";
import { labelsFor } from "../generate/write";
import { isRtl } from "../language";

export async function exportEpub(doc: EbookDocument, destPath: string): Promise<string> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const labels = labelsFor(doc.language);
  const rtl = isRtl(doc.language);
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

  const chaptersXhtml: { id: string; href: string; title: string; html: string }[] = [];

  if (doc.settings.includeCover) {
    chaptersXhtml.push({
      id: "cover",
      href: "cover.xhtml",
      title: "Cover",
      html: wrap(
        "Cover",
        `<div class="cover">
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

  if (doc.settings.includeToc) {
    const items = [
      `<li><a href="intro.xhtml">${esc(labels.introduction)}</a></li>`,
      ...doc.chapters.map((c, i) => `<li><a href="chapter-${i + 1}.xhtml">${esc(c.title)}</a></li>`),
      `<li><a href="conclusion.xhtml">${esc(labels.conclusion)}</a></li>`,
      doc.glossary.length ? `<li><a href="glossary.xhtml">${esc(labels.glossary)}</a></li>` : "",
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
                  .join("")}</ul><p class="answer">${esc(labels.answers)}: ${esc(q.answer)}</p>`
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
          .map((g) => `<dt>${esc(g.term)}</dt><dd>${esc(g.definition)}</dd>`)
          .join("")}</dl>`,
        rtl,
        doc.language
      ),
    });
  }

  const refs = doc.sources
    .map(
      (s) =>
        `<p id="ref-${s.id}">[${s.id}] ${esc(s.title)} — ${esc(s.organization)} — <a href="${esc(s.url)}">${esc(s.url)}</a></p>`
    )
    .join("\n");
  chaptersXhtml.push({
    id: "references",
    href: "references.xhtml",
    title: labels.references,
    html: wrap(labels.references, `<h1>${esc(labels.references)}</h1>${refs}`, rtl, doc.language),
  });

  for (const c of chaptersXhtml) oebps.file(c.href, c.html);

  const manifest = [
    `<item id="css" href="styles.css" media-type="text/css"/>`,
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    ...chaptersXhtml
      .filter((c) => c.id !== "nav")
      .map((c) => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`),
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
    <dc:language>${esc(doc.language)}</dc:language>
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
body { font-family: "Source Serif 4", "Noto Serif", "Noto Sans Devanagari", Georgia, serif; line-height: 1.55; color: #1c1410; margin: 1.2em; }
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
`;
