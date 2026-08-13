import fs from "fs";
import path from "path";
import JSZip from "jszip";
import type { EbookDocument, ChapterImage } from "@/lib/types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plain(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const DEVANAGARI_FONT = "NotoSansDevanagari-Regular.ttf";

/**
 * Resolve an image entry to a real file on disk.
 *
 * The ebook pipeline already persists every generated/collected image under
 * `data/images/<ebookId>/...` and stores its absolute `localPath` (and a
 * served `/api/ebooks/<id>/images/<name>` URL). We reuse those same files
 * rather than re-drawing anything, and we prefer the raster (PNG/JPEG) sibling
 * of an SVG so the 3D book renders on Android WebViews that struggle with SVG
 * in <img>. If no file exists we return null and the image is simply skipped
 * (never replaced with a placeholder box).
 */
function imageFileFor(doc: EbookDocument, img: ChapterImage): string | null {
  const candidates: string[] = [];
  const push = (p?: string | null) => {
    if (!p) return;
    const abs = path.resolve(p);
    if (!candidates.includes(abs)) candidates.push(abs);
  };

  const local = img.localPath || "";
  if (local) {
    if (local.toLowerCase().endsWith(".svg")) {
      push(local.replace(/\.svg$/i, ".png"));
      push(local.replace(/\.svg$/i, ".jpg"));
      push(local.replace(/\.svg$/i, ".jpeg"));
    }
    push(local);
  }

  // Fallback: reconstruct the served filesystem location when `localPath`
  // was not persisted (older records).
  const url = (img.url || "").split("?")[0];
  if (url && !/^https?:\/\//i.test(url)) {
    const name = path.basename(url);
    if (name) {
      const dir = path.join(process.cwd(), "data", "images", doc.id);
      if (name.toLowerCase().endsWith(".svg")) push(path.join(dir, name.replace(/\.svg$/i, ".png")));
      push(path.join(dir, name));
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

interface CollectedImage {
  abs: string;
  rel: string;
}

/**
 * Walk the chapters and build a deduplicated list of real image files that
 * must be bundled into the zip. The same on-disk file is only added once and
 * every reference points at the same relative `images/...` path.
 */
function collectImages(doc: EbookDocument): { files: CollectedImage[]; srcFor: (img: ChapterImage) => string | null } {
  const byAbs = new Map<string, string>();
  const files: CollectedImage[] = [];
  let n = 0;
  const add = (abs: string) => {
    if (byAbs.has(abs)) return;
    n += 1;
    let ext = path.extname(abs).toLowerCase().replace(/^\./, "");
    if (ext === "jpeg") ext = "jpg";
    if (!ext) ext = "png";
    const rel = `images/fig-${n}.${ext}`;
    byAbs.set(abs, rel);
    files.push({ abs, rel });
  };

  for (const ch of doc.chapters) {
    for (const img of ch.images || []) {
      const abs = imageFileFor(doc, img);
      if (abs) add(abs);
    }
  }

  const srcFor = (img: ChapterImage) => {
    const abs = imageFileFor(doc, img);
    return abs ? byAbs.get(abs) || null : null;
  };
  return { files, srcFor };
}

function figureHtml(img: ChapterImage, src: string): string {
  const label = img.figureLabel || img.caption || "";
  const credit = img.credit || "";
  const alt = img.alt || img.caption || "";
  const note =
    img.verifiedHistoricalPhoto === false
      ? `<p class="fig-note">व्याख्यात्मक चित्र — यह ऐतिहासिक फोटोग्राफ नहीं है।</p>`
      : "";
  return `<figure class="fig">
  <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />
  <figcaption><strong>${escapeHtml(label)}</strong>${credit ? ` — ${escapeHtml(credit)}` : ""}${note}</figcaption>
</figure>`;
}

interface FlipPage {
  kind: string;
  title: string;
  html: string;
  text: string;
  number: string;
}

/** A deliberately dependency-free reader. Everything it needs lives in the zip. */
export async function exportFlipbook(doc: EbookDocument): Promise<Buffer> {
  const { files, srcFor } = collectImages(doc);

  // Cover artwork: reuse the already-generated cover PNG when it exists.
  const coverPngPath = doc.cover?.pngPath && fs.existsSync(doc.cover.pngPath) ? path.resolve(doc.cover.pngPath) : "";

  const pages: FlipPage[] = [];
  const make = (kind: string, title: string, html: string, text: string, number: string): FlipPage => ({
    kind,
    title: escapeHtml(title),
    html,
    text: (text || "").trim(),
    number,
  });

  pages.push(
    make(
      "cover",
      doc.title,
      `${coverPngPath ? `<img class="cover-art" src="images/cover.png" alt="${escapeHtml(doc.title)}" />` : ""}` +
        `<p class="sub">${escapeHtml(doc.subtitle || "")}</p>` +
        `<p class="author">${escapeHtml(doc.settings.authorName || "Folio Research")}</p>`,
      `${doc.title} ${doc.subtitle || ""}`,
      ""
    )
  );

  pages.push(
    make(
      "contents",
      "Contents",
      `<ol class="toc">${doc.chapters
        .map((c, i) => `<li><span>${i + 1}.</span> ${escapeHtml(c.title)}</li>`)
        .join("")}</ol>`,
      doc.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n"),
      "i"
    )
  );

  for (const [i, chapter] of doc.chapters.entries()) {
    pages.push(
      make(
        "divider",
        `Chapter ${i + 1}`,
        `<p class="chap">${escapeHtml(chapter.title)}</p>`,
        chapter.title,
        String(i + 1)
      )
    );

    const figures = (chapter.images || [])
      .map((img) => {
        const src = srcFor(img);
        if (!src) return null;
        return figureHtml(img, src);
      })
      .filter(Boolean) as string[];
    if (figures.length) {
      pages.push(
        make(
          "figures",
          chapter.title,
          figures.join("\n"),
          (chapter.images || []).map((img) => `${img.figureLabel || img.caption || ""} ${img.credit || ""}`).join(" "),
          `${i + 1}`
        )
      );
    }

    for (const [s, section] of chapter.sections.entries()) {
      pages.push(
        make(
          "page",
          section.heading || chapter.title,
          `<p>${escapeHtml(plain(section.html))}</p>`,
          plain(section.html),
          String(i + 2 + s)
        )
      );
    }
  }

  if (doc.glossary.length) {
    pages.push(
      make(
        "page",
        "Glossary",
        `<dl class="gloss">${doc.glossary
          .map((g) => `<dt>${escapeHtml(g.term)}</dt><dd>${escapeHtml(g.definition)}</dd>`)
          .join("")}</dl>`,
        doc.glossary.map((g) => `${g.term} ${g.definition}`).join("\n"),
        ""
      )
    );
  }

  if (doc.sources.length) {
    pages.push(
      make(
        "page",
        "References",
        doc.sources
          .map((s) => `<p class="ref">[${s.id}] ${escapeHtml(s.citation || `${s.title}. ${s.organization}. ${s.url}`)}</p>`)
          .join("\n"),
        doc.sources.map((s) => `[${s.id}] ${s.title} ${s.organization}`).join("\n"),
        ""
      )
    );
  }

  pages.push(
    make("back", doc.title, `<p class="author">By ${escapeHtml(doc.settings.authorName || "Folio Research")}</p>`, "", "")
  );

  const data = JSON.stringify(pages).replace(/</g, "\\u003c");
  const title = escapeHtml(doc.title);
  const author = escapeHtml(doc.settings.authorName || "Folio Research");
  const lang = doc.outputLanguage === "hi" ? "hi" : "en";

  const index = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5"><title>${title}</title>
<style>
@font-face{font-family:'Noto Sans Devanagari';src:url('fonts/${DEVANAGARI_FONT}') format('truetype');font-weight:400;font-style:normal;font-display:swap}
:root{--ink:#201916;--paper:#fffdf7;--gold:#d6b25e;--wine:#4b1e27}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:radial-gradient(circle at 50% 0,#51463d,#1c1715 68%);color:#eee;font-family:'Noto Sans Devanagari','Noto Serif Devanagari',system-ui,-apple-system,'Segoe UI',sans-serif;min-height:100vh}.bar{height:62px;background:#171210e8;display:flex;align-items:center;gap:8px;padding:8px 14px;position:sticky;top:0;z-index:4;backdrop-filter:blur(8px)}button{border:1px solid #796b5c;border-radius:9px;background:#2b2521;color:#fff;padding:9px 11px;font:inherit;cursor:pointer}button:hover{background:#443a34}.grow{flex:1}.search{background:#fffdf7;color:#201916;border:0;padding:9px 12px;border-radius:9px;width:min(180px,32vw)}.stage{min-height:calc(100vh - 62px);display:grid;place-items:center;padding:22px;overflow:hidden}.book{width:min(92vw,900px);height:min(70vh,590px);min-height:380px;position:relative;perspective:1900px;transform:scale(var(--zoom,1));transition:transform .2s}.spine{position:absolute;left:50%;top:3%;height:94%;width:22px;transform:translateX(-50%);background:linear-gradient(90deg,#2b0d13,#7a2638,#250b10);box-shadow:0 12px 20px #0009;z-index:1}.sheet{position:absolute;width:50%;height:94%;top:3%;background:var(--paper);color:var(--ink);box-shadow:0 14px 30px #0008;overflow:hidden}.left{left:0;border-radius:5px 0 0 5px}.right{right:0;border-radius:0 5px 5px 0}.page{height:100%;padding:clamp(20px,4vw,55px);display:flex;flex-direction:column;background:linear-gradient(100deg,#eee8dc,#fffdf7 12%,#fffdf7 90%,#e7dece);white-space:pre-line;line-height:1.7;font-size:clamp(12px,1.5vw,16px)}.page h1,.page h2{font-family:'Noto Serif Devanagari','Noto Sans Devanagari','Playfair Display',Georgia,serif;line-height:1.25;margin:0 0 18px}.page .number{margin-top:auto;text-align:center;color:#756b61}.page.figures{overflow-y:auto}.fig{margin:0 0 16px;text-align:center}.fig img{display:block;max-width:100%;max-height:36vh;width:auto;margin:0 auto;object-fit:contain;border-radius:4px;box-shadow:0 4px 14px #00000022}.fig figcaption{font-size:.82em;color:#5c4b3c;white-space:normal;margin-top:6px}.fig .fig-note{font-size:.8em;color:#8a7560}.toc{list-style:none;padding:0;margin:0}.toc li{padding:6px 0;border-bottom:1px solid #e7dece;white-space:normal}.toc li span{color:#9a7b2f;font-weight:600;margin-right:8px}.gloss dt{font-weight:700;margin-top:10px}.gloss dd{margin:0 0 8px;white-space:normal}.ref{white-space:normal;font-size:.85em}.cover{background:linear-gradient(145deg,#321019,#6b2637 58%,#241116);color:#f8f0dc;justify-content:center;border:12px solid #3b171f;outline:1px solid var(--gold);outline-offset:-25px;text-align:center}.cover h1{font-size:clamp(28px,4.8vw,56px)}.cover p{color:#e8d5a0}.cover .author{margin-top:18px}.cover-art{max-height:42%;max-width:80%;object-fit:contain;margin:0 auto 18px;border-radius:6px;box-shadow:0 12px 34px #0007}.divider{background:#33211f;color:#f7ead0;justify-content:center;text-align:center}.divider h2{font-size:clamp(24px,4vw,48px)}.divider .chap{font-family:'Noto Serif Devanagari','Noto Sans Devanagari','Playfair Display',Georgia,serif;font-size:clamp(20px,3.4vw,40px);line-height:1.3;white-space:normal;margin:0}.turn{position:absolute;right:0;top:3%;width:50%;height:94%;transform-origin:left center;transform-style:preserve-3d;z-index:2;transition:transform .68s cubic-bezier(.2,.7,.15,1)}.turn.go{transform:rotateY(-180deg)}.turn .page{position:absolute;inset:0;backface-visibility:hidden}.turn .back{transform:rotateY(180deg)}.hint{position:fixed;bottom:12px;text-align:center;width:100%;font-size:13px;color:#dacfc1}.panel{position:fixed;left:10px;top:72px;z-index:5;width:min(320px,90vw);max-height:75vh;overflow:auto;background:#fffdf7;color:#201916;border-radius:12px;padding:12px;box-shadow:0 10px 30px #0008}.panel button{display:block;width:100%;background:none;color:#201916;border:0;text-align:left}.panel mark{background:#ffe08a}@media(max-width:620px){.book{width:96vw;height:62vh;min-height:350px}.page{padding:18px}.bar button .word{display:none}.spine{width:12px}.search{width:120px}}
</style></head><body><nav class="bar"><button onclick="history.back()">← <span class="word">Back</span></button><button onclick="togglePanel()">☰ <span class="word">Contents</span></button><input id="search" class="search" placeholder="🔍 Search" oninput="findText()"><span class="grow"></span><button onclick="zoom(-.1)">−</button><button onclick="zoom(.1)">+</button><button onclick="fullscreen()">⛶ <span class="word">Fullscreen</span></button><button onclick="downloadBook()">⬇ <span class="word">Download</span></button></nav><aside id="panel" class="panel" hidden></aside><main class="stage"><div class="book" id="book"><div class="spine"></div><div class="sheet left"><article id="left" class="page"></article></div><div class="sheet right"><article id="right" class="page"></article></div><div id="turn" class="turn"><article id="front" class="page"></article><article id="back" class="page back"></article></div></div></main><p class="hint">Drag or swipe pages to turn · ${author}</p><script>const P=${data};let n=0,z=1,x=null;const E=id=>document.getElementById(id);function cls(p){return p.kind==='cover'?'cover':p.kind==='divider'?'divider':p.kind==='figures'?'figures':''}function html(p){return '<h2>'+p.title+'</h2>'+p.html+'<div class="number">'+p.number+'</div>'}function paint(){let a=P[n]||P[0],b=P[n+1]||P[P.length-1];E('left').className='page '+cls(a);E('right').className='page '+cls(b);E('left').innerHTML=html(a);E('right').innerHTML=html(b);E('front').innerHTML=html(b);E('back').innerHTML=html(P[n+2]||b);E('panel').innerHTML=P.map((p,i)=>({p,i})).filter(x=>x.p.kind!=='figures').map(x=>'<button onclick="jump('+x.i+')">'+(x.i+1)+'. '+x.p.title+'</button>').join('')}function next(){if(n>=P.length-1)return;E('turn').classList.add('go');setTimeout(()=>{n=Math.min(P.length-1,n+2);E('turn').classList.remove('go');paint()},680)}function prev(){if(n<2)return;n=Math.max(0,n-2);paint()}function jump(i){n=i-(i%2);paint();togglePanel()}function togglePanel(){E('panel').hidden=!E('panel').hidden}function zoom(v){z=Math.max(.7,Math.min(1.45,z+v));E('book').style.setProperty('--zoom',z)}function fullscreen(){document.documentElement.requestFullscreen?.()}function findText(){let q=E('search').value.toLowerCase();if(!q)return;let i=P.findIndex(p=>(p.title+p.text).toLowerCase().includes(q));if(i>=0)jump(i)}function downloadBook(){location.href='./index.html'}E('book').onclick=e=>e.clientX>innerWidth/2?next():prev();E('book').ontouchstart=e=>x=e.touches[0].clientX;E('book').ontouchend=e=>{let d=e.changedTouches[0].clientX-x;if(Math.abs(d)>35)d<0?next():prev()};paint();</script></body></html>`;

  const zip = new JSZip();
  zip.file("book-3d/index.html", index);
  zip.file("book-3d/css/.keep", "Styles are embedded in index.html for offline use.");
  zip.file("book-3d/js/.keep", "Reader code is embedded in index.html for offline use.");

  // Real, already-generated image files — never re-drawn placeholders.
  for (const f of files) {
    zip.file(`book-3d/${f.rel}`, fs.readFileSync(f.abs));
  }
  if (coverPngPath) {
    zip.file("book-3d/images/cover.png", fs.readFileSync(coverPngPath));
  }

  // Bundled Devanagari font so Hindi renders with zero network access.
  const fontPath = path.join(process.cwd(), "public", "fonts", DEVANAGARI_FONT);
  if (fs.existsSync(fontPath)) {
    zip.file(`book-3d/fonts/${DEVANAGARI_FONT}`, fs.readFileSync(fontPath));
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
