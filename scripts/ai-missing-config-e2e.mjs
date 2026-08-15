/**
 * End-to-end proof that a MISCONFIGURED server fails loudly (requirement:
 * "missing AI configuration gives a clear error instead of silently generating
 * empty/incomplete ebook content").
 *
 * Boots the real Next.js app twice against a throwaway database:
 *   Pass A — no AI_* variables at all
 *   Pass B — a mock OpenAI-compatible provider, proving the SAME code path
 *            becomes healthy purely through environment variables
 *
 * Touches nothing in the production database and creates only its own
 * temporary test account.
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

const port = Number(process.env.TEST_PORT || 3197);
const base = `http://127.0.0.1:${port}`;
const testDatabase = path.resolve(`data/folio-ai-test-${randomUUID().slice(0, 8)}.db`);

let passed = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed++;
  console.log(`PASS: ${message}`);
};

let server;
async function startServer(env) {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "development", DATABASE_URL: `file:${testDatabase}`, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = [];
  server.stdout.on("data", (d) => log.push(String(d)));
  server.stderr.on("data", (d) => log.push(String(d)));
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(base)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
    if (server.exitCode !== null) throw new Error(`Test server exited (${server.exitCode})\n${log.join("")}`);
  }
  throw new Error(`Test server did not start\n${log.join("")}`);
}
async function stopServer() {
  if (!server) return;
  const child = server;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
  server = undefined;
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

// Vendor-anonymous OpenAI-compatible mock provider.
function startMockProvider() {
  let calls = 0;
  let lastAuth = "";
  const srv = http.createServer((req, res) => {
    calls++;
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      lastAuth = String(req.headers.authorization || "");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
    });
  });
  return new Promise((resolve) => {
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port, stats: () => ({ calls, lastAuth }) }));
  });
}

async function makeAccount() {
  const suffix = randomUUID().slice(0, 8);
  const browser = new Browser();
  const email = `ai-config-${suffix}@example.com`;
  const password = "Correct-Horse-1947";
  let r = await browser.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "AI Config Test", email, password }),
  });
  if (!r.res.ok) throw new Error(`could not create test account: ${JSON.stringify(r.data)}`);
  r = await browser.request("/api/ebooks", {
    method: "POST",
    headers: { "idempotency-key": suffix },
    body: JSON.stringify({ topic: `AI config check ${suffix}`, title: `AI config check ${suffix}`, language: "en", chapterCount: 4 }),
  });
  if (r.res.status !== 201) throw new Error(`could not create test ebook: ${JSON.stringify(r.data)}`);
  return { browser, ebookId: r.data.ebook.id };
}

const cleanup = () => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.rmSync(testDatabase + suffix, { force: true }); } catch {}
  }
};

let mock;
try {
  // ================= PASS A: no AI configuration ==========================
  console.log("\n--- Pass A: server with NO AI configuration ---");
  await startServer({ AI_PROVIDER: "", AI_API_KEY: "", AI_BASE_URL: "", AI_MODEL: "" });

  const health = await fetch(`${base}/api/health`);
  const healthBody = await health.json();
  assert(healthBody.ai === "not-configured", "GET /api/health reports ai=not-configured when variables are absent");
  assert(
    Array.isArray(healthBody.aiDetail?.missing) &&
      ["AI_PROVIDER", "AI_API_KEY", "AI_BASE_URL", "AI_MODEL"].every((k) => healthBody.aiDetail.missing.includes(k)),
    "health names every missing AI variable"
  );

  const probed = await fetch(`${base}/api/health?probe=ai`);
  const probedBody = await probed.json();
  assert(probed.status === 503 && probedBody.ai === "not-configured", "GET /api/health?probe=ai returns 503 when AI is unconfigured");

  const { browser, ebookId } = await makeAccount();
  const gen = await browser.request(`/api/ebooks/${ebookId}/generate`, { method: "POST", body: "{}" });
  assert(gen.res.status === 503, "POST generate returns HTTP 503 (not 200 with empty content)");
  assert(
    /AI_PROVIDER/.test(gen.data.error) && /AI_API_KEY/.test(gen.data.error) &&
      /AI_BASE_URL/.test(gen.data.error) && /AI_MODEL/.test(gen.data.error),
    "the error names all four required variables"
  );
  assert(/Missing: /.test(gen.data.error), "the error lists exactly which variables are missing");

  // Nothing may have been written.
  await new Promise((r) => setTimeout(r, 1500));
  const after = await browser.request(`/api/ebooks/${ebookId}`);
  const doc = after.data.ebook || {};
  const chapters = doc.chapters || [];
  assert(doc.status !== "complete", `ebook was NOT marked complete (status=${doc.status})`);
  assert(
    chapters.length === 0 || chapters.every((c) => !c || c.status !== "complete"),
    "no chapter was silently written or published"
  );
  assert(!doc.introduction, "no placeholder introduction was generated");

  const rewrite = await browser.request(`/api/ebooks/${ebookId}/chapter/0`, {
    method: "POST",
    body: JSON.stringify({ action: "improve" }),
  });
  assert(
    rewrite.res.status >= 400 && /AI_API_KEY|not configured|not found/i.test(rewrite.data.error || ""),
    "chapter rewrite also refuses with a clear error instead of returning unchanged/empty prose"
  );

  await stopServer();

  // ================= PASS B: configured via env only ======================
  console.log("\n--- Pass B: same code, configured through environment variables only ---");
  mock = await startMockProvider();
  await startServer({
    AI_PROVIDER: "some-openai-compatible-vendor", // deliberately NOT groq/openai
    AI_API_KEY: "mock-runtime-secret",
    AI_BASE_URL: `http://127.0.0.1:${mock.port}/v1`,
    AI_MODEL: "mock-model-v1",
  });

  const okHealth = await fetch(`${base}/api/health`);
  const okBody = await okHealth.json();
  assert(okBody.ai === "configured", "health reports ai=configured once the four variables are present");
  assert(okBody.aiDetail?.provider === "some-openai-compatible-vendor", "health echoes the configured provider name");
  assert(okBody.aiDetail?.model === "mock-model-v1", "health echoes the configured model");
  assert(!JSON.stringify(okBody).includes("mock-runtime-secret"), "health never exposes the API key");

  const okProbe = await fetch(`${base}/api/health?probe=ai`);
  const okProbeBody = await okProbe.json();
  assert(okProbeBody.ai === "healthy", "health?probe=ai reports ai=healthy after one real provider request");
  assert(okProbeBody.aiDetail?.probe?.ok === true, "the probe records a successful provider round-trip");
  assert(mock.stats().calls > 0, "the probe actually reached the configured provider endpoint");
  assert(mock.stats().lastAuth === "Bearer mock-runtime-secret", "the key travelled only in the server-to-provider header");
  assert(okProbeBody.search?.status === "not-configured", "SEARCH_* is reported separately and stays independent of AI_*");

  const { browser: browser2, ebookId: ebookId2 } = await makeAccount();
  const gen2 = await browser2.request(`/api/ebooks/${ebookId2}/generate`, { method: "POST", body: "{}" });
  assert(gen2.res.status === 200, "generation is accepted (no 503) once AI variables are set — arbitrary vendor, no code change");

  console.log(`\nALL MISSING-CONFIG E2E CHECKS PASSED (${passed} assertions)`);
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await stopServer();
  if (mock) mock.srv.close();
  cleanup();
}
