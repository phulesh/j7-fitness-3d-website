/**
 * Operator health verifier — run against a deployed URL.
 *
 *   HEALTH_URL=https://<your-railway-domain>/api/health npm run test:ai:health
 *
 * Checks that /api/health reports AI as configured, that ?probe=ai upgrades it
 * to healthy via one real provider request, and that no credential material
 * appears in the response. Requires no secrets locally.
 */
const target = (process.env.HEALTH_URL || process.argv[2] || "").trim();
if (!target) {
  console.error("Usage: HEALTH_URL=https://<domain>/api/health npm run test:ai:health");
  process.exit(1);
}

let passed = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed++;
  console.log(`PASS: ${message}`);
};

async function get(url) {
  const res = await fetch(url, { headers: { "cache-control": "no-store" } });
  return { res, body: await res.json().catch(() => ({})) };
}

try {
  const plain = await get(target);
  console.log(JSON.stringify(plain.body, null, 2));
  assert(plain.body.database === "configured", `database is persistent (got "${plain.body.database}")`);
  assert(plain.body.ai === "configured" || plain.body.ai === "healthy", `AI reports configured (got "${plain.body.ai}")`);
  assert(Boolean(plain.body.aiDetail?.provider), `provider is reported: ${plain.body.aiDetail?.provider}`);
  assert(Boolean(plain.body.aiDetail?.model), `model is reported: ${plain.body.aiDetail?.model}`);
  assert(Boolean(plain.body.aiDetail?.endpoint), `endpoint is reported: ${plain.body.aiDetail?.endpoint}`);

  const probeUrl = new URL(target);
  probeUrl.searchParams.set("probe", "ai");
  const probe = await get(probeUrl);
  assert(
    probe.body.ai === "healthy",
    `?probe=ai reports healthy after one real provider request (got "${probe.body.ai}"${
      probe.body.aiDetail?.probe?.error ? `: ${probe.body.aiDetail.probe.error}` : ""
    })`
  );
  assert(probe.res.status === 200, "?probe=ai returns HTTP 200");
  console.log(`   provider latency: ${probe.body.aiDetail?.probe?.latencyMs}ms`);

  const serialized = JSON.stringify(probe.body);
  assert(!/sk-[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9]{20,}/.test(serialized), "response contains no API key material");
  assert(!/apiKey|api_key|authorization/i.test(serialized), "response exposes no credential fields");

  console.log(`\nHEALTH VERIFICATION PASSED (${passed} assertions)`);
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
