import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import type { Chapter, ChapterImage, ChapterImageType, OutlineItem } from "../types";
import { isHindiOutput } from "../language";
import { escapeHtml } from "./text";

const ILLUSTRATION_LABEL_HI = "व्याख्यात्मक चित्र — यह ऐतिहासिक फोटोग्राफ नहीं है।";
const ILLUSTRATION_LABEL_EN = "Explanatory illustration — this is not a historical photograph.";

export function illustrationDisclaimer(lang: string) {
  return isHindiOutput(lang) ? ILLUSTRATION_LABEL_HI : ILLUSTRATION_LABEL_EN;
}

export function figureLabel(chapterIndex: number, n: number, lang: string) {
  return isHindiOutput(lang) ? `चित्र ${chapterIndex + 1}.${n}` : `Figure ${chapterIndex + 1}.${n}`;
}

export function figuresToHtml(images: ChapterImage[], lang: string): string {
  return images
    .map((img) => {
      const unverified = img.verifiedHistoricalPhoto === false || img.imageType === "illustration";
      const note = unverified
        ? `<p class="figure-note">${escapeHtml(illustrationDisclaimer(lang))}</p>`
        : "";
      const creditLabel = isHindiOutput(lang) ? "स्रोत" : "Source";
      return `<figure class="ebook-figure" data-image-type="${escapeHtml(img.imageType || "illustration")}">
  <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt || img.caption)}" loading="lazy" />
  <figcaption>
    <strong>${escapeHtml(img.figureLabel || img.caption)}</strong>
    <span class="figure-credit">${creditLabel}: ${escapeHtml(img.credit)}</span>
    ${note}
  </figcaption>
</figure>`;
    })
    .join("\n");
}

export function insertFiguresIntoChapter(ch: Chapter, lang: string): Chapter {
  if (!ch.images?.length) return ch;
  const already = ch.sections.some((s) => /ebook-figure|class="ebook-figure"/.test(s.html));
  if (already) return ch;
  const html = figuresToHtml(ch.images, lang);
  if (!ch.sections.length) {
    ch.sections = [{ id: nanoid(8), heading: isHindiOutput(lang) ? "चित्र" : "Figures", html, sourceIds: [] }];
    return ch;
  }
  const target = ch.sections[Math.min(1, ch.sections.length - 1)];
  target.html = `${target.html}\n${html}`;
  return ch;
}

function svgWrap(inner: string, title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
  <rect width="1200" height="720" fill="#F6F0E6"/>
  <rect x="24" y="24" width="1152" height="672" fill="none" stroke="#9A7B2F" stroke-width="2"/>
  <text x="48" y="64" fill="#7A2E3A" font-family="'Noto Sans Devanagari', Georgia, serif" font-size="22">${escapeXml(title)}</text>
  ${inner}
  <text x="48" y="690" fill="#8A7560" font-family="'Noto Sans Devanagari', Georgia, serif" font-size="16">${escapeXml(ILLUSTRATION_LABEL_HI)}</text>
</svg>`;
}

function escapeXml(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function makeIllustrationSvg(
  kind: ChapterImageType,
  title: string,
  lines: string[]
): string {
  if (kind === "timeline") {
    const pts = (lines.length ? lines : ["1948", "1950", "आज"]).slice(0, 5);
    const inner = pts
      .map((p, i) => {
        const x = 120 + i * 200;
        return `<circle cx="${x}" cy="340" r="14" fill="#7A2E3A"/>
        <text x="${x}" y="300" text-anchor="middle" fill="#1C1410" font-family="'Noto Sans Devanagari', Georgia, serif" font-size="18">${escapeXml(p)}</text>`;
      })
      .join("");
    return svgWrap(`<line x1="80" y1="340" x2="1120" y2="340" stroke="#9A7B2F" stroke-width="4"/>${inner}`, title);
  }
  if (kind === "map") {
    return svgWrap(
      `<rect x="180" y="140" width="840" height="460" rx="20" fill="#E8DCC8" stroke="#5C4B3C"/>
       <text x="600" y="380" text-anchor="middle" fill="#1C1410" font-family="'Noto Sans Devanagari', Georgia, serif" font-size="28">${escapeXml(lines[0] || title)}</text>`,
      title
    );
  }
  if (kind === "comparison") {
    return svgWrap(
      `<rect x="80" y="140" width="480" height="460" fill="#EDE4D4" stroke="#9A7B2F"/>
       <rect x="640" y="140" width="480" height="460" fill="#E8D5D0" stroke="#7A2E3A"/>
       <text x="320" y="190" text-anchor="middle" font-size="22" fill="#1C1410" font-family="'Noto Sans Devanagari', Georgia, serif">${escapeXml(lines[0] || "साक्ष्य")}</text>
       <text x="880" y="190" text-anchor="middle" font-size="22" fill="#1C1410" font-family="'Noto Sans Devanagari', Georgia, serif">${escapeXml(lines[1] || "व्याख्या")}</text>
       <text x="320" y="280" text-anchor="middle" font-size="18" fill="#3A2C22" font-family="'Noto Sans Devanagari', Georgia, serif">${escapeXml(lines[2] || "")}</text>
       <text x="880" y="280" text-anchor="middle" font-size="18" fill="#3A2C22" font-family="'Noto Sans Devanagari', Georgia, serif">${escapeXml(lines[3] || "")}</text>`,
      title
    );
  }
  if (kind === "infographic" || kind === "diagram") {
    const boxes = (lines.length ? lines : ["अवधारणा", "साक्ष्य", "व्याख्या"]).slice(0, 4);
    const inner = boxes
      .map((b, i) => `<rect x="${80 + i * 280}" y="220" width="240" height="220" rx="12" fill="#FFF9F0" stroke="#9A7B2F"/>
        <text x="${200 + i * 280}" y="340" text-anchor="middle" font-size="18" fill="#1C1410" font-family="'Noto Sans Devanagari', Georgia, serif">${escapeXml(b)}</text>`)
      .join("");
    return svgWrap(inner, title);
  }
  return svgWrap(
    `<rect x="160" y="160" width="880" height="420" rx="16" fill="#FFF9F0" stroke="#7A2E3A"/>
     <text x="600" y="360" text-anchor="middle" font-size="26" fill="#1C1410" font-family="'Noto Sans Devanagari', Georgia, serif">${escapeXml(lines[0] || title)}</text>
     <text x="600" y="410" text-anchor="middle" font-size="18" fill="#5C4B3C" font-family="'Noto Sans Devanagari', Georgia, serif">${escapeXml(lines[1] || "")}</text>`,
    title
  );
}

export async function persistIllustration(
  svg: string,
  ebookId: string,
  basename: string
): Promise<{ url: string; localPath: string }> {
  const dir = path.join(process.cwd(), "data", "images", ebookId);
  fs.mkdirSync(dir, { recursive: true });
  const svgPath = path.join(dir, `${basename}.svg`);
  fs.writeFileSync(svgPath, svg);
  let pngPath = "";
  try {
    const sharp = (await import("sharp")).default;
    pngPath = path.join(dir, `${basename}.png`);
    await sharp(Buffer.from(svg)).png().resize(1200, 720).toFile(pngPath);
  } catch {
    pngPath = "";
  }
  const localPath = pngPath || svgPath;
  const url = `/api/ebooks/${ebookId}/images/${path.basename(localPath)}`;
  return { url, localPath };
}

export async function buildChapterVisuals(opts: {
  ebookId: string;
  chapterIndex: number;
  item: OutlineItem;
  lang: string;
  commons?: ChapterImage[];
  includeImages: boolean;
}): Promise<ChapterImage[]> {
  if (!opts.includeImages) return [];
  const hindi = isHindiOutput(opts.lang);
  const out: ChapterImage[] = [];
  const commons = (opts.commons || []).filter((img) => img.url && img.sourceUrl && img.license).slice(0, 1);
  for (const img of commons) {
    let localPath = img.localPath;
    let url = img.url;
    if (img.url.startsWith("http")) {
      try {
        const { downloadImage } = await import("../research/commons");
        const saved = await downloadImage(
          img.url,
          path.join(process.cwd(), "data", "images", opts.ebookId),
          `ch${opts.chapterIndex + 1}-photo`
        );
        if (saved) {
          localPath = saved;
          url = `/api/ebooks/${opts.ebookId}/images/${path.basename(saved)}`;
        } else {
          continue;
        }
      } catch {
        continue;
      }
    }
    out.push({
      ...img,
      id: nanoid(8),
      url,
      localPath,
      imageType: /portrait|ambedkar/i.test(`${img.caption} ${img.alt}`) ? "portrait" : "photograph",
      verifiedHistoricalPhoto: Boolean(img.sourceUrl && img.license),
      chapterIndex: opts.chapterIndex,
      figureLabel: figureLabel(opts.chapterIndex, out.length + 1, opts.lang),
      placement: "after-intro",
    });
  }

  const kinds = suggestVisuals(opts.item);
  for (const kind of kinds) {
    if (out.length >= 3) break;
    const caption = hindi
      ? `${figureLabel(opts.chapterIndex, out.length + 1, opts.lang)} — ${opts.item.title}`
      : `${figureLabel(opts.chapterIndex, out.length + 1, opts.lang)} — ${opts.item.title}`;
    const svg = makeIllustrationSvg(kind, opts.item.title, visualLines(opts.item, kind, hindi));
    const saved = await persistIllustration(svg, opts.ebookId, `ch${opts.chapterIndex + 1}-${kind}-${out.length + 1}`);
    out.push({
      id: nanoid(8),
      url: saved.url,
      localPath: saved.localPath,
      caption,
      credit: hindi ? "व्याख्यात्मक चित्र; ऐतिहासिक फोटोग्राफ नहीं।" : "Explanatory illustration; not a historical photograph.",
      alt: hindi
        ? `${opts.item.title} का व्याख्यात्मक चित्र। यह ऐतिहासिक फोटोग्राफ नहीं है।`
        : `Explanatory diagram for ${opts.item.title}. This is not a historical photograph.`,
      license: "Generated illustration",
      sourceUrl: saved.url,
      imageType: kind,
      verifiedHistoricalPhoto: false,
      chapterIndex: opts.chapterIndex,
      figureLabel: figureLabel(opts.chapterIndex, out.length + 1, opts.lang),
      placement: "mid",
    });
  }
  return out;
}

function suggestVisuals(item: OutlineItem): ChapterImageType[] {
  const hay = `${item.title} ${item.summary} ${(item.keyTopics || []).join(" ")}`.toLowerCase();
  const kinds: ChapterImageType[] = [];
  if (/मानचित्र|map|गाँव|village|भारत/.test(hay)) kinds.push("map");
  if (/काल|timeline|1948|1950|जनगणना|census/.test(hay)) kinds.push("timeline");
  if (/तुलना|comparison|व्याख्या|साक्ष्य|evidence|interpretation/.test(hay)) kinds.push("comparison");
  if (/संविधान|अनुच्छेद|article 17|diagram|अवधारणा/.test(hay)) kinds.push("diagram");
  if (!kinds.length) kinds.push("illustration");
  if (kinds.length < 2) kinds.push("infographic");
  return kinds.slice(0, 2);
}

function visualLines(item: OutlineItem, kind: ChapterImageType, hindi: boolean): string[] {
  if (kind === "timeline") return hindi ? ["1948 पुस्तक", "1950 संविधान", "अनुच्छेद 17"] : ["1948 book", "1950 Constitution", "Article 17"];
  if (kind === "comparison") {
    return hindi
      ? ["स्थापित साक्ष्य", "आंबेडकर की व्याख्या", item.historicalScope || "", item.researchQuestion || ""]
      : ["Established evidence", "Ambedkar's interpretation", item.historicalScope || "", item.researchQuestion || ""];
  }
  return (item.keyTopics || [item.title]).slice(0, 4);
}

export function imageActionMeta(
  kind: "verified" | "illustration" | "map" | "timeline" | "infographic" | "comparison",
  chapterIndex: number,
  title: string,
  lang: string
): { imageType: ChapterImageType; caption: string; credit: string; alt: string } {
  const hindi = isHindiOutput(lang);
  const typeMap: Record<string, ChapterImageType> = {
    verified: "photograph",
    illustration: "illustration",
    map: "map",
    timeline: "timeline",
    infographic: "infographic",
    comparison: "comparison",
  };
  const imageType = typeMap[kind] || "illustration";
  return {
    imageType,
    caption: hindi ? `${figureLabel(chapterIndex, 1, lang)} — ${title}` : `${figureLabel(chapterIndex, 1, lang)} — ${title}`,
    credit: kind === "verified" ? (hindi ? "सत्यापित स्रोत" : "Verified source") : hindi ? "व्याख्यात्मक चित्रण — Folio" : "Explanatory illustration — Folio",
    alt: hindi ? `${title} का चित्र` : `Image for ${title}`,
  };
}
