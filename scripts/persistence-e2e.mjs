import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";

const port = Number(process.env.TEST_PORT || 3199);
const base = process.env.TEST_BASE_URL || `http://localhost:${port}`;
let server;
if (!process.env.TEST_BASE_URL) {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "0.0.0.0", "-p", String(port)], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: "development", DATABASE_URL: "file:./data/folio-test.db", AI_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.pipe(process.stdout); server.stderr.pipe(process.stderr);
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 250));
    if (i === 119) throw new Error("Test server did not start");
  }
}

class Browser {
  cookie = "";
  async request(url, init = {}) {
    const headers = { "content-type": "application/json", origin: base, ...(init.headers || {}) };
    if (this.cookie) headers.cookie = this.cookie;
    const res = await fetch(base + url, { ...init, headers });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }
}
const assert = (condition, message) => { if (!condition) throw new Error(`FAIL: ${message}`); console.log(`PASS: ${message}`); };

try {
  const suffix = randomUUID().slice(0, 8); const email = `persist-${suffix}@example.com`; const password = "Correct-Horse-1947";
  const a = new Browser();
  let x = await a.request("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Persistence Test", email, password }) });
  assert(x.res.status === 200 && x.data.user?.id, "A register creates an account"); const userId = x.data.user.id;
  const duplicate = await new Browser().request("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Duplicate", email: email.toUpperCase(), password }) });
  assert(duplicate.res.status === 409, "same normalized email cannot create a duplicate account");
  await a.request("/api/auth/logout", { method: "POST", body: "{}" });
  x = await a.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  assert(x.res.ok && x.data.user.id === userId, "B/C logout and login restore the same account ID");

  const settings = { topic: `Persistent ebook ${suffix}`, title: `Persistent ebook ${suffix}`, language: "en", chapterCount: 4 };
  x = await a.request("/api/ebooks", { method: "POST", headers: { "idempotency-key": suffix }, body: JSON.stringify(settings) });
  assert(x.res.status === 201 && x.data.ebook?.id, "D create ebook persists through backend API"); const ebookId = x.data.ebook.id;
  const noAi = await a.request(`/api/ebooks/${ebookId}/generate`, { method: "POST", body: "{}" });
  assert(noAi.res.status === 503 && /administrator must set AI_PROVIDER/.test(noAi.data.error), "missing AI configuration returns a visible backend error and does not fake generation");
  x = await a.request(`/api/ebooks/${ebookId}`);
  assert(x.res.ok && x.data.ebook.id === ebookId, "E browser refresh reloads ebook from backend");
  await a.request("/api/auth/logout", { method: "POST", body: "{}" });
  await a.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  x = await a.request("/api/ebooks");
  assert(x.res.ok && x.data.ebooks.some((e) => e.id === ebookId), "F/G/H ebook appears after logout and login");
  x = await a.request(`/api/ebooks/${ebookId}`);
  assert(x.res.ok, "I owner can open ebook");
  const changed = `Edited ${suffix}`;
  x = await a.request(`/api/ebooks/${ebookId}`, { method: "PATCH", body: JSON.stringify({ title: changed, introduction: "A persistent introduction." }) });
  assert(x.res.ok && x.data.ebook.title === changed, "J owner can edit ebook");
  x = await a.request(`/api/ebooks/${ebookId}`);
  assert(x.data.ebook.title === changed && x.data.ebook.introduction === "A persistent introduction.", "K/L refresh retains edits");

  const b = new Browser();
  await b.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  x = await b.request("/api/ebooks");
  assert(x.data.ebooks.some((e) => e.id === ebookId), "M/N another browser sees the same account ebook");
  const newPassword = "Changed-Horse-1948";
  x = await b.request("/api/auth/password", { method: "POST", body: JSON.stringify({ currentPassword: password, newPassword }) });
  assert(x.res.ok, "password change updates the database account");
  const oldLogin = await new Browser().request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  assert(oldLogin.res.status === 401, "old password no longer authenticates");
  const changedLogin = new Browser();
  x = await changedLogin.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: newPassword }) });
  assert(x.res.ok && x.data.user.id === userId, "new password authenticates the same account");
  x = await changedLogin.request("/api/ebooks");
  assert(x.data.ebooks.some((e) => e.id === ebookId), "password change preserves owned ebooks");
  const other = new Browser(); const otherEmail = `other-${suffix}@example.com`;
  await other.request("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Other", email: otherEmail, password }) });
  x = await other.request(`/api/ebooks/${ebookId}`);
  assert(x.res.status === 404, "O different account cannot read ebook");
  x = await other.request(`/api/ebooks/${ebookId}`, { method: "PATCH", body: JSON.stringify({ title: "stolen" }) });
  assert(x.res.status === 404, "different account cannot update ebook");
  x = await other.request(`/api/ebooks/${ebookId}`, { method: "DELETE", body: "{}" });
  assert(x.res.status === 404, "different account cannot delete ebook");

  if (!process.env.TEST_BASE_URL) {
    const db = new DatabaseSync(path.resolve("data/folio-test.db"));
    const user = db.prepare("SELECT id,password_hash,created_at,updated_at FROM users WHERE email=?").get(email);
    const ebook = db.prepare("SELECT id,owner_id,title,document_json,created_at,updated_at FROM ebooks WHERE id=?").get(ebookId);
    assert(user?.id === userId && user.password_hash !== password && /^\$2[aby]\$12\$/.test(user.password_hash), "password is a bcrypt cost-12 hash in the database");
    assert(Boolean(user.created_at && user.updated_at), "user timestamps are stored");
    assert(ebook?.owner_id === userId && ebook.title === changed, "ebook database row has enforced owner and persisted edit");
    assert(Boolean(ebook.created_at && ebook.updated_at && ebook.document_json), "ebook document and timestamps are stored");
    db.close();
  }
  console.log("PERSISTENCE E2E: ALL PASS");
} finally {
  if (server) server.kill("SIGTERM");
}
