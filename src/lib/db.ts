import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export type StoreShape = {
  users: any[];
  ebooks: any[];
  chapters: any[];
  sources: any[];
  research: any[];
  jobs: any[];
  downloads: any[];
  rateLimits: Record<string, { count: number; windowStart: number }>;
  sourceSeq: number;
};

const STORE_PATH = path.join(DATA_DIR, "folio.json");

const EMPTY: StoreShape = {
  users: [],
  ebooks: [],
  chapters: [],
  sources: [],
  research: [],
  jobs: [],
  downloads: [],
  rateLimits: {},
  sourceSeq: 1,
};

let cache: StoreShape | null = null;

export function getStore(): StoreShape {
  if (cache) return cache;
  try {
    if (fs.existsSync(STORE_PATH)) {
      cache = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as StoreShape;
      cache = { ...EMPTY, ...cache };
      return cache;
    }
  } catch {
    /* reset */
  }
  cache = structuredClone(EMPTY);
  persist();
  return cache;
}

export function persist() {
  if (!cache) return;
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, STORE_PATH);
}

export function nowIso() {
  return new Date().toISOString();
}

export function nextSourceId() {
  const s = getStore();
  const maxExisting = s.sources.reduce((m, row) => Math.max(m, Number(row.id) || 0), 0);
  s.sourceSeq = Math.max(s.sourceSeq, maxExisting + 1);
  const id = s.sourceSeq++;
  persist();
  return id;
}
