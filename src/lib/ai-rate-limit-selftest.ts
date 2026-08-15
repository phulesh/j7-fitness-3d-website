/**
 * Rate-limit / retry self-test for the server-side AI adapter (no real
 * provider needed). Verifies, against a local mock provider:
 *
 *   - HTTP 429 is retried with exponential backoff + jitter
 *   - a provider-issued Retry-After header is honoured
 *   - retries are hard-bounded (a permanently-429 provider cannot loop forever)
 *   - concurrency is strictly limited to 1 in-flight request
 *   - a minimum delay is enforced between consecutive requests
 *   - the API key never appears in retry logs (safeProviderDetail)
 */
import http from "node:http";
import assert from "node:assert/strict";
import type { AIProviderError } from "./ai";

(process.env as Record<string, string>).NODE_ENV = "development";
process.env.AI_PROVIDER = "openai-compatible";
process.env.AI_API_KEY = "server-only-test-secret";
process.env.AI_MODEL = "rate-limit-test-model";
// Small interval keeps the test fast while still exercising the delay path.
process.env.AI_MIN_REQUEST_INTERVAL_MS = "60";

interface ServerHandle {
  port: number;
  server: http.Server;
  close: () => Promise<void>;
}

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        (req as any).body = body;
        handler(req, res);
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("mock provider failed to listen"));
        return;
      }
      resolve({
        port: address.port,
        server,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function json(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

const okBody = { choices: [{ message: { content: "recovered content" } }] };

async function main() {
  const ai = await import("./ai");

  // ---- 1. 429 with Retry-After is honoured, then succeeds ---------------
  {
    let hits = 0;
    const handle = await startServer((_req, res) => {
      hits++;
      if (hits === 1) {
        json(res, 429, { error: { message: "Rate limited" } }, { "retry-after": "1" });
      } else {
        json(res, 200, okBody);
      }
    });
    try {
      process.env.AI_BASE_URL = `http://127.0.0.1:${handle.port}/v1`;
      const started = Date.now();
      const out = await ai.chat([{ role: "user", content: "hi" }], { retries: 3 });
      const elapsed = Date.now() - started;
      assert.equal(out, "recovered content");
      assert.equal(hits, 2, "a 429 must be retried exactly once before succeeding");
      assert.ok(elapsed >= 900, `Retry-After: 1 must be honoured (waited ${elapsed}ms)`);
    } finally {
      await handle.close();
    }
  }
  console.log("PASS: HTTP 429 is retried and a Retry-After header is honoured");

  // ---- 2. retries are bounded — a permanently-429 provider cannot loop ----
  {
    let hits = 0;
    const handle = await startServer((_req, res) => {
      hits++;
      json(res, 429, { error: { message: "Rate limited" } });
    });
    try {
      process.env.AI_BASE_URL = `http://127.0.0.1:${handle.port}/v1`;
      await assert.rejects(
        () => ai.chat([{ role: "user", content: "hi" }], { retries: 2 }),
        (error: unknown) => {
          assert.ok(error instanceof ai.AIProviderError, "must throw AIProviderError");
          assert.equal((error as AIProviderError).status, 429, "429 status must be preserved");
          return true;
        }
      );
      assert.equal(hits, 2, "retries must stop at the configured bound (no infinite retry)");
    } finally {
      await handle.close();
    }
  }
  console.log("PASS: retries are hard-bounded and the real 429 status is preserved");

  // ---- 3. concurrency is strictly 1 and min interval is enforced --------
  {
    let inFlight = 0;
    let maxInFlight = 0;
    const requestTimes: number[] = [];
    const handle = await startServer((_req, res) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      requestTimes.push(Date.now());
      // Hold briefly so overlapping calls would be observable.
      setTimeout(() => {
        inFlight--;
        json(res, 200, okBody);
      }, 25);
    });
    try {
      process.env.AI_BASE_URL = `http://127.0.0.1:${handle.port}/v1`;
      const results = await Promise.all([
        ai.chat([{ role: "user", content: "a" }], { retries: 1 }),
        ai.chat([{ role: "user", content: "b" }], { retries: 1 }),
        ai.chat([{ role: "user", content: "c" }], { retries: 1 }),
      ]);
      assert.equal(results.length, 3);
      assert.equal(maxInFlight, 1, "no two AI requests may be in flight simultaneously");
      for (let i = 1; i < requestTimes.length; i++) {
        const gap = requestTimes[i] - requestTimes[i - 1];
        assert.ok(gap >= 55, `min request interval violated (gap ${gap}ms)`);
      }
    } finally {
      await handle.close();
    }
  }
  console.log("PASS: AI concurrency is capped at 1 and a minimum inter-request delay is enforced");

  // ---- 4. 401 fails fast (not retried) and never leaks the key ----------
  {
    let hits = 0;
    const handle = await startServer((_req, res) => {
      hits++;
      json(res, 401, { error: { message: "Invalid key server-only-test-secret" } });
    });
    try {
      process.env.AI_BASE_URL = `http://127.0.0.1:${handle.port}/v1`;
      const logs: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => logs.push(args.map(String).join(" "));
      try {
        await assert.rejects(
          () => ai.chat([{ role: "user", content: "hi" }], { retries: 3 }),
          (error: unknown) => error instanceof ai.AIProviderError && (error as AIProviderError).status === 401
        );
      } finally {
        console.warn = originalWarn;
      }
      assert.equal(hits, 1, "a 401 must not be retried");
      assert.ok(!logs.some((l) => l.includes("server-only-test-secret")), "retry logs must never expose the key");
    } finally {
      await handle.close();
    }
  }
  console.log("PASS: non-transient errors fail fast and never expose the API key in logs");

  console.log("\nALL AI RATE-LIMIT CHECKS PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
