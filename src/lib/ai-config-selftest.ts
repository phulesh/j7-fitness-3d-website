/**
 * Provider-configuration self-test (no real provider needed).
 *
 * Covers:
 *  - any OpenAI-compatible vendor works purely through the four AI_* variables
 *  - no vendor (Groq in particular) is required or special-cased
 *  - SEARCH_PROVIDER / SEARCH_API_KEY stay independent of the AI variables
 *  - missing AI configuration raises a clear, named error instead of silently
 *    producing empty content
 *  - health status/probe report configured/healthy vs not-configured
 *  - no API key is hard-coded in source, Dockerfile, ARG, or client code
 */
import http from "node:http";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const AI_KEYS = ["AI_PROVIDER", "AI_API_KEY", "AI_BASE_URL", "AI_MODEL"] as const;

function clearAi() {
  for (const key of AI_KEYS) delete process.env[key];
}
function setAi(port: number, provider: string, model: string, key = "server-only-test-secret") {
  process.env.AI_PROVIDER = provider;
  process.env.AI_API_KEY = key;
  process.env.AI_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.AI_MODEL = model;
}

interface Seen { auth: string; xApiKey: string; model: string; url: string; body: any }

async function main() {
  const setNodeEnv = (value: string) => { (process.env as Record<string, string>).NODE_ENV = value; };
  setNodeEnv("development");
  let seen: Seen = { auth: "", xApiKey: "", model: "", url: "", body: null };
  let requestCount = 0;

  // A generic OpenAI-compatible mock. It is deliberately vendor-anonymous:
  // the same server stands in for OpenAI, OpenRouter, Groq, Together, vLLM…
  const server = http.createServer((req, res) => {
    requestCount++;
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const parsed = body ? JSON.parse(body) : {};
      seen = {
        auth: String(req.headers.authorization || ""),
        xApiKey: String(req.headers["x-api-key"] || ""),
        model: parsed.model,
        url: req.url || "",
        body: parsed,
      };
      res.setHeader("content-type", "application/json");
      if ((req.url || "").includes("/messages")) {
        res.end(JSON.stringify({ content: [{ text: "Anthropic-style content" }] }));
      } else {
        res.end(JSON.stringify({ choices: [{ message: { content: "Provider-backed content" } }] }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("mock provider failed to listen");
  const port = address.port;

  const pass = (m: string) => console.log(`PASS ${m}`);

  try {
    const ai = await import("./ai");

    // ---- 1. Arbitrary OpenAI-compatible vendors, no code changes ----------
    const vendors = [
      { provider: "openai", model: "gpt-4o-mini" },
      { provider: "openai-compatible", model: "meta-llama/llama-3.3-70b-instruct" },
      { provider: "groq", model: "llama-3.3-70b-versatile" },
      { provider: "openrouter", model: "openai/gpt-4o-mini" },
      { provider: "together", model: "Qwen/Qwen2.5-72B-Instruct-Turbo" },
      { provider: "some-future-vendor", model: "any-model-id" },
    ];
    for (const vendor of vendors) {
      setAi(port, vendor.provider, vendor.model, `secret-for-${vendor.provider}`);
      const output = await ai.chat([{ role: "user", content: "Generate content" }]);
      assert.equal(output, "Provider-backed content");
      assert.equal(seen.model, vendor.model, `${vendor.provider} must send the configured AI_MODEL`);
      assert.equal(seen.auth, `Bearer secret-for-${vendor.provider}`);
      assert.equal(seen.url, "/v1/chat/completions", "OpenAI-compatible path is derived from the API root");
      assert.equal(ai.getAIConfig().provider, vendor.provider);
    }
    pass(`${vendors.length} different OpenAI-compatible providers work through env vars only (no code change)`);
    pass("Groq is supported as one option but never required or special-cased");

    // ---- 2. Anthropic wire format still available ------------------------
    setAi(port, "anthropic", "claude-3-5-sonnet-latest", "anthropic-secret");
    const anthropic = await ai.chat([{ role: "system", content: "sys" }, { role: "user", content: "hi" }]);
    assert.equal(anthropic, "Anthropic-style content");
    assert.equal(seen.xApiKey, "anthropic-secret");
    assert.equal(seen.auth, "", "Anthropic must not receive a bearer header");
    pass("anthropic wire format routes to /messages with x-api-key");

    // ---- 3. Credentials only ever leave via the provider request ---------
    setAi(port, "openai-compatible", "gpt-4o-mini", "top-secret-key");
    await ai.chat([{ role: "user", content: "Generate content" }]);
    assert.equal(seen.auth, "Bearer top-secret-key");
    assert.ok(!JSON.stringify(seen.body).includes("top-secret-key"), "key must not appear in the request body");
    const status = ai.getAIStatus();
    assert.equal(status.configured, true);
    assert.equal(status.provider, "openai-compatible");
    assert.equal(status.model, "gpt-4o-mini");
    assert.ok(!JSON.stringify(status).includes("top-secret-key"), "health status must never expose the key");
    pass("API credential is sent only in the server-to-provider auth header, never in status output");

    // ---- 4. Health probe: configured -> healthy --------------------------
    const probe = await ai.pingAI();
    assert.equal(probe.ok, true);
    assert.equal(probe.status.configured, true);
    assert.ok(!JSON.stringify(probe).includes("top-secret-key"));
    pass("pingAI() performs a real request and reports healthy when variables are present");

    // ---- 5. Missing configuration = clear error, never empty content -----
    for (const missing of AI_KEYS) {
      setAi(port, "openai-compatible", "gpt-4o-mini");
      delete process.env[missing];
      const before = requestCount;
      await assert.rejects(
        () => ai.chat([{ role: "user", content: "Generate content" }]),
        (error: unknown) => {
          assert.ok(error instanceof ai.AIProviderError, `${missing} must raise AIProviderError`);
          assert.equal((error as any).status, 503);
          assert.match((error as Error).message, new RegExp(missing), "error names the missing variable");
          return true;
        },
        `missing ${missing} must throw`
      );
      assert.equal(requestCount, before, `no provider call should be attempted when ${missing} is missing`);
      const s = ai.getAIStatus();
      assert.equal(s.configured, false);
      assert.deepEqual(s.missing, [missing]);
      assert.equal(ai.aiConfigured(), false);
    }
    pass("each missing AI_* variable produces a clear 503 naming that variable — no silent empty output");

    clearAi();
    const allMissing = ai.getAIStatus();
    assert.deepEqual(allMissing.missing, [...AI_KEYS]);
    assert.match(allMissing.reason || "", /AI_PROVIDER, AI_API_KEY, AI_BASE_URL, AI_MODEL/);
    await assert.rejects(() => ai.pingAI().then((r) => { if (!r.ok) throw new ai.AIProviderError(r.error || "x", 503); }));
    pass("fully unconfigured server reports not-configured and lists all four variables");

    // assertAIConfigured is the guard used before any writing work starts.
    assert.throws(() => ai.assertAIConfigured("Chapter 1 generation"), /Chapter 1 generation is not configured/);
    pass("assertAIConfigured() blocks generation before any chapter is written");

    // friendlyError must not mask configuration failures as "please retry".
    const { friendlyError } = await import("./errors");
    let configMessage = "";
    try { ai.assertAIConfigured(); } catch (error) { configMessage = (error as Error).message; }
    assert.equal(friendlyError({ status: 503, message: configMessage }), configMessage);
    assert.match(friendlyError({ status: 503, message: configMessage }), /AI_API_KEY/);
    pass("configuration errors surface verbatim instead of a generic 'temporarily unavailable' retry message");

    // ---- 6. Validation of bad values -------------------------------------
    const badCases: [string, string, RegExp][] = [
      ["AI_BASE_URL", "not-a-url", /valid absolute URL/],
      ["AI_BASE_URL", "https://api.example.com/v1/chat/completions", /API root/],
      ["AI_BASE_URL", "https://user:pw@api.example.com/v1", /must not contain credentials/],
      ["AI_BASE_URL", "https://api.example.com/v1?key=abc", /must not contain credentials/],
    ];
    for (const [key, value, pattern] of badCases) {
      setAi(port, "openai-compatible", "gpt-4o-mini");
      process.env[key] = value;
      assert.throws(() => ai.getAIConfig(), pattern, `${key}=${value} must be rejected`);
    }
    setAi(port, "openai-compatible", "gpt-4o-mini");
    process.env.AI_BASE_URL = "http://api.example.com/v1";
    setNodeEnv("production");
    assert.throws(() => ai.getAIConfig(), /HTTPS/);
    setNodeEnv("development");
    pass("malformed AI_BASE_URL values (path, credentials, query, plain http) are rejected with clear errors");

    // ---- 7. SEARCH_* stays separate from AI_* ----------------------------
    clearAi();
    process.env.SEARCH_PROVIDER = "tavily";
    process.env.SEARCH_API_KEY = "search-only-secret";
    assert.equal(ai.aiConfigured(), false, "a search key must never satisfy the AI configuration");
    setAi(port, "openai-compatible", "gpt-4o-mini", "ai-only-secret");
    delete process.env.SEARCH_API_KEY;
    delete process.env.SEARCH_PROVIDER;
    assert.equal(ai.aiConfigured(), true, "AI must work with no search provider configured");
    await ai.chat([{ role: "user", content: "Generate content" }]);
    assert.equal(seen.auth, "Bearer ai-only-secret", "AI must never use SEARCH_API_KEY");
    const { webSearch } = await import("./research/search");
    assert.deepEqual(await webSearch("anything"), [], "search degrades gracefully without SEARCH_API_KEY");
    pass("SEARCH_PROVIDER / SEARCH_API_KEY are fully independent of the AI provider variables");

    // ---- 8. No hard-coded secrets anywhere -------------------------------
    const root = path.resolve(__dirname, "..", "..");
    const scanDirs = ["src", "scripts"];
    const files: string[] = ["Dockerfile", "nixpacks.toml", ".env.example", "next.config.js", "package.json"]
      .map((f) => path.join(root, f))
      .filter((f) => fs.existsSync(f));
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|mjs|cjs|json|toml|yml|yaml)$/.test(entry.name)) files.push(full);
      }
    };
    for (const dir of scanDirs) walk(path.join(root, dir));

    // Real provider key shapes: OpenAI sk-…, Groq gsk_…, Anthropic sk-ant-…,
    // Google AIza…, plus generic long assignments to an API-key identifier.
    const secretPatterns: [RegExp, string][] = [
      [/\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/, "OpenAI/Anthropic-style key literal"],
      [/\bgsk_[A-Za-z0-9]{20,}/, "Groq-style key literal"],
      [/\bAIza[0-9A-Za-z_-]{30,}/, "Google-style key literal"],
      [/\b(?:AI_API_KEY|SEARCH_API_KEY|OPENAI_API_KEY|GROQ_API_KEY)\s*[:=]\s*["'][^"'\s]{16,}["']/g, "hard-coded key assignment"],
    ];
    // Obvious non-secrets used by the test suites themselves.
    const placeholder = /(test|mock|fake|dummy|sample|example|placeholder|secret-for-|server-only|your[-_]|<|\$\{|changeme)/i;
    const selfTest = path.join(root, "src", "lib", "ai-config-selftest.ts");
    for (const file of files) {
      if (file === selfTest) continue; // this file contains the patterns themselves
      const content = fs.readFileSync(file, "utf8");
      const rel = path.relative(root, file);
      for (const [pattern, label] of secretPatterns) {
        for (const hit of content.match(new RegExp(pattern.source, "g")) || []) {
          assert.ok(placeholder.test(hit), `${label} found in ${rel}: ${hit.slice(0, 40)}`);
        }
      }
    }
    pass(`no hard-coded API key literals in ${files.length} source/config files`);

    // Dockerfile must not declare secrets as ARG/ENV (they would be baked in).
    const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
    for (const line of dockerfile.split("\n")) {
      const declaration = line.trim().match(/^(ARG|ENV)\s+([A-Z0-9_]+)/i);
      if (!declaration) continue;
      const name = declaration[2].toUpperCase();
      assert.ok(
        !/(API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/.test(name) && !AI_KEYS.includes(name as any),
        `Dockerfile must not declare ${declaration[1]} ${name}`
      );
    }
    pass("Dockerfile declares no ARG/ENV for AI_* or any secret — nothing is baked into an image layer");

    // Client-side code must never read the AI variables.
    const clientFiles: string[] = [];
    const walkClient = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkClient(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) clientFiles.push(full);
      }
    };
    walkClient(path.join(root, "src"));
    for (const file of clientFiles) {
      const content = fs.readFileSync(file, "utf8");
      const isClient = /^\s*["']use client["']/m.test(content);
      const rel = path.relative(root, file);
      if (isClient) {
        for (const key of AI_KEYS) {
          assert.ok(!content.includes(`process.env.${key}`), `client component ${rel} must not read ${key}`);
        }
        assert.ok(!/from\s+["']@?[./]*(?:@\/)?lib\/ai["']/.test(content), `client component ${rel} must not import the AI module`);
      }
      assert.ok(
        !/NEXT_PUBLIC_[A-Z0-9_]*(API_KEY|SECRET|TOKEN|AI_)/.test(content),
        `${rel} must not expose provider config through a NEXT_PUBLIC_ variable`
      );
    }
    pass(`no client component reads AI_* or exposes a NEXT_PUBLIC_ provider secret (${clientFiles.length} files scanned)`);

    // The AI module is server-only at runtime.
    assert.ok(fs.readFileSync(path.join(root, "src", "lib", "ai.ts"), "utf8").startsWith('import "server-only"'));
    pass("src/lib/ai.ts is marked server-only");

    console.log("\nALL AI CONFIGURATION CHECKS PASSED");
  } finally {
    server.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
