/**
 * Real-provider verification (requirement 7 + 8).
 *
 * Makes ONE real server-side request to whatever OpenAI-compatible provider is
 * configured via AI_PROVIDER / AI_API_KEY / AI_BASE_URL / AI_MODEL, then
 * optionally verifies that /api/health reports AI as configured/healthy.
 *
 * Run it where the real variables live (Railway service shell):
 *   npm run test:ai:real
 *   HEALTH_URL=https://<domain>/api/health npm run test:ai:real
 *
 * The API key is never printed, never written to disk, and never sent anywhere
 * except the configured provider's own endpoint.
 */
import { chat, getAIConfig, REQUIRED_AI_ENV } from "../src/lib/ai";

function fail(message: string): never {
  console.error(`AI REAL PROVIDER: FAIL — ${message}`);
  process.exit(1);
}

async function checkHealth(config: { provider: string; model: string }) {
  const healthUrl = process.env.HEALTH_URL?.trim();
  if (!healthUrl) {
    console.log("HEALTH CHECK: SKIPPED (set HEALTH_URL=https://<domain>/api/health to include it)");
    return;
  }
  const url = new URL(healthUrl);
  url.searchParams.set("probe", "ai");
  const res = await fetch(url, { headers: { "cache-control": "no-store" } });
  const body = (await res.json()) as {
    ai?: string;
    aiDetail?: { provider?: string; model?: string; endpoint?: string; probe?: { ok?: boolean; error?: string } };
    database?: string;
  };
  const state = body.ai || "unknown";
  if (state !== "healthy" && state !== "configured") {
    fail(`/api/health reported ai="${state}" (${body.aiDetail?.probe?.error || "no detail"})`);
  }
  if (body.aiDetail?.provider && body.aiDetail.provider !== config.provider.toLowerCase()) {
    fail(`/api/health provider "${body.aiDetail.provider}" does not match local AI_PROVIDER "${config.provider}"`);
  }
  console.log(
    `HEALTH CHECK: PASS (ai=${state}, provider=${body.aiDetail?.provider}, model=${body.aiDetail?.model}, ` +
      `endpoint=${body.aiDetail?.endpoint}, database=${body.database})`
  );
  // Assert the endpoint never leaks credentials.
  const serialized = JSON.stringify(body);
  if (process.env.AI_API_KEY && serialized.includes(process.env.AI_API_KEY.trim())) {
    fail("/api/health response contained the API key");
  }
  console.log("HEALTH CHECK: PASS (response contains no credential material)");
}

async function main() {
  const missing = REQUIRED_AI_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    fail(
      `missing required server variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
        `Set them as Railway service variables, then re-run.`
    );
  }

  const config = getAIConfig();
  console.log(
    `Provider under test: ${config.provider} (wire=${config.wireFormat}), model=${config.model}, ` +
      `endpoint=${new URL(config.baseUrl).origin}`
  );

  const marker = `folio-provider-check-${Date.now()}`;
  const started = Date.now();
  let response: string;
  try {
    response = await chat(
      [
        { role: "system", content: "You are a connectivity test. Follow the user's instruction exactly and do not add commentary." },
        { role: "user", content: `Reply with exactly these words: ${marker}` },
      ],
      { temperature: 0, maxTokens: 80 }
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : "unknown provider error");
  }

  if (!response.trim()) fail("the provider returned empty content");
  if (!response.toLowerCase().includes("folio-provider-check")) {
    fail("the provider returned content, but did not follow the integration-test instruction");
  }
  if (response.includes(config.apiKey)) fail("the provider echoed the API key back into content");

  // Deliberately report only non-secret routing metadata.
  console.log(
    `AI REAL PROVIDER: PASS (${config.provider}, model=${config.model}, ` +
      `endpoint=${new URL(config.baseUrl).origin}, ${Date.now() - started}ms, one real request)`
  );

  await checkHealth(config);
  console.log("ALL REAL-PROVIDER CHECKS PASSED");
}

main().catch((error) => {
  console.error(`AI REAL PROVIDER: FAIL — ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
