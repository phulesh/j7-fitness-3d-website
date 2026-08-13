import fs from "fs";
import path from "path";
import { tokenize } from "./rank";
import type { RawHit } from "./search";

export interface CorpusDoc {
  title: string;
  url: string;
  organization: string;
  extract: string;
  language?: string;
  license?: string;
  retrievedAt: string;
  tags?: string[];
}

const DIR = path.join(process.cwd(), "data", "corpus");

export function loadCorpus(): CorpusDoc[] {
  try {
    if (!fs.existsSync(DIR)) return [];
    return fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as CorpusDoc;
        } catch {
          return null;
        }
      })
      .filter((x): x is CorpusDoc => Boolean(x && x.extract && x.title));
  } catch {
    return [];
  }
}

export function searchCorpus(query: string, limit = 8): (RawHit & { extract: string; organization: string })[] {
  const docs = loadCorpus();
  if (!docs.length) return [];
  const q = tokenize(query);
  if (!q.length) return [];
  const scored = docs
    .map((d) => {
      const hay = `${d.title} ${d.tags?.join(" ") || ""} ${d.extract}`.toLowerCase();
      const titleHits = tokenize(d.title).filter((t) => q.includes(t)).length;
      const bodyHits = q.filter((t) => hay.includes(t)).length;
      const score = titleHits * 8 + bodyHits;
      return { d, score };
    })
    .filter((x) => x.score >= Math.min(2, q.length))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map(({ d }) => ({
    title: d.title,
    url: d.url,
    snippet: d.extract.slice(0, 400),
    extract: d.extract,
    organization: d.organization,
    provider: "local-corpus",
  }));
}

export function saveCorpusDoc(doc: CorpusDoc) {
  fs.mkdirSync(DIR, { recursive: true });
  const slug = doc.title
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  fs.writeFileSync(path.join(DIR, `${slug || "doc"}-${hash(doc.url)}.json`), JSON.stringify(doc, null, 0));
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
