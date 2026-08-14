import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

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
  operations: any[];
  rateLimits: Record<string, { count: number; windowStart: number }>;
  sourceSeq: number;
};

const EMPTY: StoreShape = {
  users: [], ebooks: [], chapters: [], sources: [], research: [], jobs: [], downloads: [], operations: [],
  rateLimits: {}, sourceSeq: 1,
};

function databasePath() {
  const configured = process.env.DATABASE_URL || "file:./data/folio.db";
  if (!configured.startsWith("file:")) {
    throw new Error("This deployment requires a file: DATABASE_URL. Mount that path on persistent storage; ephemeral serverless filesystems are not supported.");
  }
  const value = configured.slice(5);
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

const DB_PATH = databasePath();
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE, name TEXT NOT NULL,
    password_hash TEXT NOT NULL, is_guest INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS ebooks (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title TEXT NOT NULL, language TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
    outline_json TEXT NOT NULL DEFAULT '[]', chapters_json TEXT NOT NULL DEFAULT '[]',
    questions_json TEXT NOT NULL DEFAULT '[]', answers_json TEXT NOT NULL DEFAULT '[]', mcqs_json TEXT NOT NULL DEFAULT '[]',
    sources_json TEXT NOT NULL DEFAULT '[]', document_json TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ebooks_owner_updated_idx ON ebooks(owner_id, updated_at DESC);
  CREATE TABLE IF NOT EXISTS migration_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, imported_users INTEGER NOT NULL,
    imported_ebooks INTEGER NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL
  );
`);

function parse<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

function loadStore(): StoreShape {
  const row = db.prepare("SELECT document FROM app_state WHERE id=1").get() as { document?: string } | undefined;
  if (row?.document) return { ...structuredClone(EMPTY), ...parse(row.document, EMPTY) };

  // One-time, non-destructive recovery of the old JSON document store.
  const legacyPath = path.join(DATA_DIR, "folio.json");
  let recovered = structuredClone(EMPTY);
  if (fs.existsSync(legacyPath)) recovered = { ...recovered, ...parse(fs.readFileSync(legacyPath, "utf8"), EMPTY) };
  const realUsers = recovered.users.filter((u) => !u.isGuest);
  let recoveredOwners = 0;
  if (realUsers.length === 1) {
    for (const ebook of recovered.ebooks) {
      if (!ebook.userId && !ebook.ownerId) { ebook.userId = realUsers[0].id; recoveredOwners++; }
    }
  }
  cache = recovered;
  persist();
  db.prepare("INSERT INTO migration_log(source, imported_users, imported_ebooks, notes, created_at) VALUES(?,?,?,?,?)")
    .run(fs.existsSync(legacyPath) ? "data/folio.json" : "fresh", recovered.users.length, recovered.ebooks.length,
      `Non-destructive import; ${recoveredOwners} unowned ebook(s) assigned where ownership was unambiguous`, nowIso());
  return recovered;
}

let cache: StoreShape | null = null;

export function getStore(): StoreShape {
  if (!cache) cache = loadStore();
  return cache;
}

function ebookProjection(store: StoreShape, row: any) {
  const id = String(row.id || row.ebookId);
  const chapters = store.chapters.filter((c) => c.ebookId === id).sort((a, b) => a.idx - b.idx).map((c) => c.data);
  const sources = store.sources.filter((s) => s.ebookId === id).map(({ ebookId: _ebookId, ...source }) => source);
  const questions = chapters.flatMap((c: any) => (c.questions || []).map((q: any) => q.question));
  const answers = chapters.flatMap((c: any) => (c.questions || []).map((q: any) => q.answer));
  const mcqs = chapters.flatMap((c: any) => c.mcqs || []);
  return { id, chapters, sources, questions, answers, mcqs };
}

/** Atomically persists the compatibility document plus normalized account/ebook records. */
export function persist() {
  if (!cache) return;
  const store = cache;
  const now = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO app_state(id,document,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document, updated_at=excluded.updated_at")
      .run(JSON.stringify(store), now);
    const userStmt = db.prepare(`INSERT INTO users(id,email,name,password_hash,is_guest,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,password_hash=excluded.password_hash,is_guest=excluded.is_guest,updated_at=excluded.updated_at`);
    for (const user of store.users) {
      user.updatedAt ||= user.createdAt || now;
      userStmt.run(user.id, String(user.email).trim().toLowerCase(), user.name || "User", user.passwordHash, user.isGuest ? 1 : 0,
        user.createdAt || now, user.updatedAt);
    }
    const ebookStmt = db.prepare(`INSERT INTO ebooks(id,owner_id,title,language,description,status,outline_json,chapters_json,questions_json,answers_json,mcqs_json,sources_json,document_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,title=excluded.title,language=excluded.language,
      description=excluded.description,status=excluded.status,outline_json=excluded.outline_json,chapters_json=excluded.chapters_json,
      questions_json=excluded.questions_json,answers_json=excluded.answers_json,mcqs_json=excluded.mcqs_json,sources_json=excluded.sources_json,
      document_json=excluded.document_json,updated_at=excluded.updated_at`);
    for (const ebook of store.ebooks) {
      const owner = ebook.userId || ebook.ownerId;
      if (!owner) continue; // retained in app_state for later administrative recovery; never deleted.
      const p = ebookProjection(store, ebook);
      ebookStmt.run(p.id, owner, ebook.title || ebook.settings?.topic || "Untitled", ebook.outputLanguage || ebook.language || "en",
        ebook.description || ebook.subtitle || "", ebook.status || "draft", JSON.stringify(ebook.outline || []), JSON.stringify(p.chapters),
        JSON.stringify(p.questions), JSON.stringify(p.answers), JSON.stringify(p.mcqs), JSON.stringify(p.sources), JSON.stringify(ebook),
        ebook.createdAt || now, ebook.updatedAt || now);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getDatabase() { return db; }
export function nowIso() { return new Date().toISOString(); }
export function nextSourceId() {
  const s = getStore();
  const maxExisting = s.sources.reduce((m, row) => Math.max(m, Number(row.id) || 0), 0);
  s.sourceSeq = Math.max(s.sourceSeq, maxExisting + 1);
  const id = s.sourceSeq++;
  persist();
  return id;
}
