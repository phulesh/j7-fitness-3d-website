import fs from "fs";
import path from "path";
import { fetchJson, fetchText } from "../http";
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
  try {
    fs.mkdirSync(destDir, { recursive: true });
    const r = await fetchText(url, { timeoutMs: 15000, retries: 1 });
    if (!r.ok) return null;
    // fetchText is text; use arrayBuffer via fetch
  } catch {
    /* continue */
  }
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "FolioEbookGenerator/1.0 (educational)" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000 || buf.length > 8_000_000) return null;
    const ext = extFrom(url, res.headers.get("content-type"));
    const file = path.join(destDir, `${basename}${ext}`);
    fs.writeFileSync(file, buf);
    return file;
  } catch {
    return null;
  }
}

function extFrom(url: string, ct: string | null) {
  if (ct?.includes("png")) return ".png";
  if (ct?.includes("webp")) return ".webp";
  if (ct?.includes("gif")) return ".gif";
  if (/\.png(\?|$)/i.test(url)) return ".png";
  return ".jpg";
}
