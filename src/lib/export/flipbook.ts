import JSZip from "jszip";
import type { EbookDocument } from "@/lib/types";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function plain(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** A deliberately dependency-free reader. Everything it needs lives in the zip. */
export async function exportFlipbook(doc: EbookDocument): Promise<Buffer> {
  const pages = [
    { kind: "cover", title: doc.title, text: doc.subtitle || "", number: "" },
    { kind: "contents", title: "Contents", text: doc.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n"), number: "i" },
    ...doc.chapters.flatMap((chapter, i) => [
      { kind: "divider", title: `Chapter ${i + 1}`, text: chapter.title, number: String(i + 1) },
      ...chapter.sections.map((section, s) => ({ kind: "page", title: section.heading || chapter.title, text: plain(section.html), number: String(i + 2 + s) })),
    ]),
    ...(doc.glossary.length ? [{ kind: "page", title: "Glossary", text: doc.glossary.map((g) => `${g.term} — ${g.definition}`).join("\n"), number: "" }] : []),
    ...(doc.sources.length ? [{ kind: "page", title: "References", text: doc.sources.map((s) => `[${s.id}] ${s.citation || `${s.title}. ${s.organization}. ${s.url}`}`).join("\n"), number: "" }] : []),
    { kind: "back", title: doc.title, text: `By ${doc.settings.authorName || "Folio Research"}`, number: "" },
  ].map((p) => ({ ...p, title: escapeHtml(p.title), text: escapeHtml(p.text) }));

  const data = JSON.stringify(pages).replace(/</g, "\\u003c");
  const title = escapeHtml(doc.title);
  const author = escapeHtml(doc.settings.authorName || "Folio Research");
  const index = `<!doctype html>
<html lang="${doc.outputLanguage === "hi" ? "hi" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5"><title>${title}</title>
<style>
:root{--ink:#201916;--paper:#fffdf7;--gold:#d6b25e;--wine:#4b1e27}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 0,#51463d,#1c1715 68%);color:#eee;font-family:'Noto Sans Devanagari',system-ui,sans-serif;min-height:100vh}.bar{height:62px;background:#171210e8;display:flex;align-items:center;gap:8px;padding:8px 14px;position:sticky;top:0;z-index:4;backdrop-filter:blur(8px)}button{border:1px solid #796b5c;border-radius:9px;background:#2b2521;color:#fff;padding:9px 11px;font:inherit;cursor:pointer}button:hover{background:#443a34}.grow{flex:1}.search{background:#fffdf7;color:#201916;border:0;padding:9px 12px;border-radius:9px;width:min(180px,32vw)}.stage{min-height:calc(100vh - 62px);display:grid;place-items:center;padding:22px;overflow:hidden}.book{width:min(92vw,900px);height:min(70vh,590px);min-height:380px;position:relative;perspective:1900px;transform:scale(var(--zoom,1));transition:transform .2s}.spine{position:absolute;left:50%;top:3%;height:94%;width:22px;transform:translateX(-50%);background:linear-gradient(90deg,#2b0d13,#7a2638,#250b10);box-shadow:0 12px 20px #0009;z-index:1}.sheet{position:absolute;width:50%;height:94%;top:3%;background:var(--paper);color:var(--ink);box-shadow:0 14px 30px #0008;overflow:hidden}.left{left:0;border-radius:5px 0 0 5px}.right{right:0;border-radius:0 5px 5px 0}.page{height:100%;padding:clamp(20px,4vw,55px);display:flex;flex-direction:column;background:linear-gradient(100deg,#eee8dc,#fffdf7 12%,#fffdf7 90%,#e7dece);white-space:pre-line;line-height:1.7;font-size:clamp(12px,1.5vw,16px)}.page h1,.page h2{font-family:'Playfair Display','Noto Sans Devanagari',serif;line-height:1.25;margin:0 0 18px}.page .number{margin-top:auto;text-align:center;color:#756b61}.cover{background:linear-gradient(145deg,#321019,#6b2637 58%,#241116);color:#f8f0dc;justify-content:center;border:12px solid #3b171f;outline:1px solid var(--gold);outline-offset:-25px;text-align:center}.cover h1{font-size:clamp(28px,4.8vw,56px)}.cover p{color:#e8d5a0}.divider{background:#33211f;color:#f7ead0;justify-content:center;text-align:center}.divider h2{font-size:clamp(24px,4vw,48px)}.turn{position:absolute;right:0;top:3%;width:50%;height:94%;transform-origin:left center;transform-style:preserve-3d;z-index:2;transition:transform .68s cubic-bezier(.2,.7,.15,1)}.turn.go{transform:rotateY(-180deg)}.turn .page{position:absolute;inset:0;backface-visibility:hidden}.turn .back{transform:rotateY(180deg)}.hint{position:fixed;bottom:12px;text-align:center;width:100%;font-size:13px;color:#dacfc1}.panel{position:fixed;left:10px;top:72px;z-index:5;width:min(320px,90vw);max-height:75vh;overflow:auto;background:#fffdf7;color:#201916;border-radius:12px;padding:12px;box-shadow:0 10px 30px #0008}.panel button{display:block;width:100%;background:none;color:#201916;border:0;text-align:left}.panel mark{background:#ffe08a}@media(max-width:620px){.book{width:96vw;height:62vh;min-height:350px}.page{padding:18px}.bar button .word{display:none}.spine{width:12px}.search{width:120px}}
</style></head><body><nav class="bar"><button onclick="history.back()">← <span class="word">Back</span></button><button onclick="togglePanel()">☰ <span class="word">Contents</span></button><input id="search" class="search" placeholder="🔍 Search" oninput="findText()"><span class="grow"></span><button onclick="zoom(-.1)">−</button><button onclick="zoom(.1)">+</button><button onclick="fullscreen()">⛶ <span class="word">Fullscreen</span></button><button onclick="downloadBook()">⬇ <span class="word">Download</span></button></nav><aside id="panel" class="panel" hidden></aside><main class="stage"><div class="book" id="book"><div class="spine"></div><div class="sheet left"><article id="left" class="page"></article></div><div class="sheet right"><article id="right" class="page"></article></div><div id="turn" class="turn"><article id="front" class="page"></article><article id="back" class="page back"></article></div></div></main><p class="hint">Drag or swipe pages to turn · ${author}</p><script>const P=${data};let n=0,z=1,x=null;const E=id=>document.getElementById(id);function html(p){return '<h2>'+p.title+'</h2><div>'+p.text+'</div><div class="number">'+p.number+'</div>'}function paint(){let a=P[n]||P[0],b=P[n+1]||P[P.length-1];E('left').className='page '+(a.kind==='cover'?'cover':a.kind==='divider'?'divider':'');E('right').className='page '+(b.kind==='cover'?'cover':b.kind==='divider'?'divider':'');E('left').innerHTML=html(a);E('right').innerHTML=html(b);E('front').innerHTML=html(b);E('back').innerHTML=html(P[n+2]||b);E('panel').innerHTML=P.map((p,i)=>'<button onclick="jump('+i+')">'+(i+1)+'. '+p.title+'</button>').join('')}function next(){if(n>=P.length-1)return;E('turn').classList.add('go');setTimeout(()=>{n=Math.min(P.length-1,n+2);E('turn').classList.remove('go');paint()},680)}function prev(){if(n<2)return;n=Math.max(0,n-2);paint()}function jump(i){n=i-(i%2);paint();togglePanel()}function togglePanel(){E('panel').hidden=!E('panel').hidden}function zoom(v){z=Math.max(.7,Math.min(1.45,z+v));E('book').style.setProperty('--zoom',z)}function fullscreen(){document.documentElement.requestFullscreen?.()}function findText(){let q=E('search').value.toLowerCase();if(!q)return;let i=P.findIndex(p=>(p.title+p.text).toLowerCase().includes(q));if(i>=0)jump(i)}function downloadBook(){location.href='./index.html'}E('book').onclick=e=>e.clientX>innerWidth/2?next():prev();E('book').ontouchstart=e=>x=e.touches[0].clientX;E('book').ontouchend=e=>{let d=e.changedTouches[0].clientX-x;if(Math.abs(d)>35)d<0?next():prev()};paint();</script></body></html>`;
  const zip = new JSZip();
  zip.file("book-3d/index.html", index);
  zip.file("book-3d/css/.keep", "Styles are embedded in index.html for offline use.");
  zip.file("book-3d/js/.keep", "Reader code is embedded in index.html for offline use.");
  zip.file("book-3d/assets/.keep", "All assets are embedded in index.html for offline use.");
  zip.file("book-3d/images/.keep", "Images are embedded in index.html when available.");
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
