import fs from "fs";
import path from "path";
import { fetchJson } from "../http";
import type { ChapterImage } from "../types";

const OPEN_LICENSES = [
  "cc0",
  "public domain",
  "pd",
  "cc-by",
  "cc by",
  "cc-by-sa",
  "cc by-sa",
  "gfdl",
  "creativecommons",
];

export async function searchCommonsImages(query: string, count = 4): Promise<ChapterImage[]> {
  const searchUrl =
    `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6` +
    `&srlimit=${count * 2}&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
  const s = await fetchJson<{ query?: { search?: { title: string }[] } }>(searchUrl);
  const titles = (s.data?.query?.search || []).map((x) => x.title).slice(0, count * 2);
  if (!titles.length) return [];

  const infoUrl =
    `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo` +
    `&iiprop=url|extmetadata|size|mime&iiurlwidth=1200&titles=${titles.map(encodeURIComponent).join("|")}&format=json&origin=*`;
  const info = await fetchJson<{
    query?: {
      pages?: Record<
        string,
        {
          title: string;
          imageinfo?: {
            url?: string;
            thumburl?: string;
            mime?: string;
            descriptionurl?: string;
            extmetadata?: Record<string, { value?: string }>;
          }[];
        }
      >;
    };
  }>(infoUrl);

  const images: ChapterImage[] = [];
  for (const page of Object.values(info.data?.query?.pages || {})) {
    const ii = page.imageinfo?.[0];
    if (!ii?.url || !ii.mime?.startsWith("image/")) continue;
    const meta = ii.extmetadata || {};
    const license = strip(meta.LicenseShortName?.value || meta.License?.value || "");
    const artist = strip(meta.Artist?.value || meta.Credit?.value || "Wikimedia Commons");
    const desc = strip(meta.ImageDescription?.value || page.title.replace(/^File:/, ""));
    if (license && !isOpen(license)) continue;
    images.push({
      url: ii.thumburl || ii.url,
      caption: desc.slice(0, 220) || page.title.replace(/^File:/, ""),
      credit: `${artist} — ${license || "Wikimedia Commons"}`,
      alt: desc.slice(0, 160) || page.title,
      license: license || "Wikimedia Commons",
      sourceUrl: ii.descriptionurl || ii.url,
    });
    if (images.length >= count) break;
  }
  return images;
}

function strip(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isOpen(license: string) {
  const l = license.toLowerCase();
  return OPEN_LICENSES.some((x) => l.includes(x)) || l.includes("public domain");
}

export async function downloadImage(url: string, destDir: string, basename: string): Promise<string | null> {
  fs.mkdirSync(destDir, { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 18_000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "FolioEbookGenerator/1.0 (educational)" },
      });
      clearTimeout(timeout);
      const mime = res.headers.get("content-type") || "";
      if (!res.ok || !mime.toLowerCase().startsWith("image/")) throw new Error("Image response was invalid");
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000 || buf.length > 8_000_000) throw new Error("Image size was invalid");

      // Normalize every remote asset to a validated, reasonably-sized PNG.
      // PDFKit, EPUB readers, Android WebViews, and the offline flipbook can
      // then consume exactly the same file without format-specific failures.
      const sharp = (await import("sharp")).default;
      const probe = await sharp(buf).metadata();
      if (!probe.width || !probe.height || probe.width < 80 || probe.height < 80) throw new Error("Image dimensions were invalid");
      const file = path.join(destDir, `${basename}.png`);
      await sharp(buf)
        .rotate()
        .resize({ width: 1400, height: 1000, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9, quality: 88 })
        .toFile(file);
      const final = await sharp(file).metadata();
      if (final.format !== "png" || !final.width || !final.height) throw new Error("Image validation failed");
      return file;
    } catch {
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  return null;
}
