import fs from "fs";
import path from "path";
import sharp from "sharp";
import type { CoverStyle, TopicCategory } from "../types";
import { escapeHtml } from "./text";

export function coverSvg(opts: {
  title: string;
  subtitle: string;
  author: string;
  style: CoverStyle;
  language: string;
  category: TopicCategory;
  aiLabel?: boolean;
}): string {
  const palettes: Record<CoverStyle, { bg: string; fg: string; accent: string; muted: string; band: string }> = {
    Minimal: { bg: "#F6F0E6", fg: "#1C1410", accent: "#9A7B2F", muted: "#6B5E52", band: "#1C1410" },
    Academic: { bg: "#2A1C16", fg: "#F6F0E6", accent: "#D4BC6E", muted: "#C4B09A", band: "#7A2E3A" },
    Modern: { bg: "#111318", fg: "#F4F1EA", accent: "#E0C56E", muted: "#A39B8C", band: "#2C4A3E" },
    Professional: { bg: "#1B2838", fg: "#F7F3EA", accent: "#C9A227", muted: "#B7C0C9", band: "#C9A227" },
    Creative: { bg: "#3B1D2A", fg: "#FBEFD8", accent: "#E8B86D", muted: "#E2C4B6", band: "#E07A5F" },
    Technical: { bg: "#0E1714", fg: "#E7F0EA", accent: "#7DCEA0", muted: "#8AA396", band: "#1F3D34" },
    Textbook: { bg: "#FBF6EC", fg: "#1C1410", accent: "#7A2E3A", muted: "#5C4B3C", band: "#7A2E3A" },
    Historical: { bg: "#3A2418", fg: "#F6EBD7", accent: "#D4BC6E", muted: "#C4B09A", band: "#6B2A22" },
    Documentary: { bg: "#1A1C1A", fg: "#F3EFE6", accent: "#C9A227", muted: "#B7C0B0", band: "#2C4A3E" },
    Illustrated: { bg: "#4A2C3A", fg: "#FFF4E4", accent: "#E8B86D", muted: "#E2C4B6", band: "#E07A5F" },
    Photorealistic: { bg: "#14110E", fg: "#F7F1E6", accent: "#D4BC6E", muted: "#C4B09A", band: "#3B241C" },
    "3D": { bg: "#12151C", fg: "#F4F1EA", accent: "#7DCEA0", muted: "#A39B8C", band: "#1F3D34" },
  };
  const p = palettes[opts.style] || palettes.Academic;
  const hindi = /[\u0900-\u097F]/.test(opts.title) || opts.language === "hi";
  const wrapWidth = hindi ? (opts.title.length > 28 ? 12 : 14) : opts.title.length > 40 ? 18 : 14;
  const title = wrapText(opts.title, wrapWidth).slice(0, 5);
  const titleSize = hindi
    ? opts.title.length > 36
      ? 36
      : opts.title.length > 22
        ? 44
        : 52
    : opts.title.length > 48
      ? 42
      : opts.title.length > 28
        ? 52
        : 64;
  const coverFont = hindi
    ? "'Noto Sans Devanagari', 'Noto Serif Devanagari', Georgia, serif"
    : "Georgia, 'Source Serif 4', serif";
  const rtl = opts.language === "ar" || opts.language === "ur";
  const dir = rtl ? "rtl" : "ltr";

  const titleTspans = title
    .map((line, i) => `<tspan x="72" dy="${i === 0 ? 0 : titleSize + 8}">${escapeXml(line)}</tspan>`)
    .join("");

  const ornament =
    opts.style === "Technical"
      ? `<g opacity="0.18" fill="none" stroke="${p.accent}" stroke-width="1.2">
           ${Array.from({ length: 14 }, (_, i) => `<circle cx="620" cy="200" r="${40 + i * 22}"/>`).join("")}
         </g>`
      : opts.style === "Creative"
        ? `<circle cx="560" cy="160" r="120" fill="${p.band}" opacity="0.35"/>
           <circle cx="140" cy="980" r="180" fill="${p.accent}" opacity="0.18"/>`
        : opts.style === "Minimal"
          ? `<rect x="72" y="120" width="80" height="6" fill="${p.accent}"/>`
          : `<rect x="72" y="118" width="56" height="6" fill="${p.accent}"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200" xml:lang="${opts.language}">
  <rect width="800" height="1200" fill="${p.bg}"/>
  <rect x="28" y="28" width="744" height="1144" fill="none" stroke="${p.accent}" stroke-width="2" opacity="0.7"/>
  <rect x="40" y="40" width="720" height="1120" fill="none" stroke="${p.fg}" stroke-width="0.6" opacity="0.25"/>
  ${ornament}
  <text x="72" y="96" fill="${p.accent}" font-family="${coverFont}" font-size="14" letter-spacing="4">${escapeXml(opts.style.toUpperCase())} · FOLIO</text>
  <text x="72" y="280" fill="${p.fg}" font-family="${coverFont}" font-size="${titleSize}" font-weight="600" direction="${dir}">${titleTspans}</text>
  <text x="72" y="${280 + title.length * (titleSize + 8) + 36}" fill="${p.muted}" font-family="${coverFont}" font-size="22">
    ${wrapText(opts.subtitle, 42)
      .slice(0, 3)
      .map((line, i) => `<tspan x="72" dy="${i === 0 ? 0 : 30}">${escapeXml(line)}</tspan>`)
      .join("")}
  </text>
  <rect x="0" y="980" width="800" height="220" fill="${p.band}"/>
  <text x="72" y="1048" fill="${p.bg === "#F6F0E6" || opts.style === "Textbook" || opts.style === "Minimal" ? "#F6F0E6" : p.fg}" font-family="Georgia, serif" font-size="22">${escapeXml(opts.author || "Folio Research")}</text>
  <text x="72" y="1090" fill="${p.accent}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" letter-spacing="2">${opts.aiLabel === false ? "RESEARCH-BASED EBOOK" : "RESEARCH-BASED  ·  AI STRUCTURED"}</text>
  <text x="72" y="1134" fill="${p.bg === "#F6F0E6" || opts.style === "Textbook" || opts.style === "Minimal" ? "#E8DCC8" : p.muted}" font-family="ui-sans-serif, sans-serif" font-size="13">Sources cited  ·  ${escapeXml(opts.category)}</text>
</svg>`;
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

function escapeXml(s: string) {
  return escapeHtml(s);
}

export async function renderCoverPng(svg: string, destPath: string): Promise<string> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await sharp(Buffer.from(svg)).png().resize(800, 1200).toFile(destPath);
  return destPath;
}
