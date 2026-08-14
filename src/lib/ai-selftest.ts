import http from "node:http";
import assert from "node:assert/strict";

async function main() {
  let observedAuth = "";
  let observedModel = "";
  const server = http.createServer((req, res) => {
    observedAuth = String(req.headers.authorization || "");
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      observedModel = JSON.parse(body).model;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: "Provider-backed content" } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("mock provider failed to listen");
  process.env.AI_PROVIDER = "openai-compatible";
  process.env.AI_API_KEY = "server-only-test-secret";
  process.env.AI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.AI_MODEL = "configurable-test-model";
  try {
    const { chat, getAIConfig } = await import("./ai");
    const output = await chat([{ role: "user", content: "Generate content" }]);
    assert.equal(output, "Provider-backed content");
    assert.equal(observedAuth, "Bearer server-only-test-secret");
    assert.equal(observedModel, "configurable-test-model");
    assert.equal(getAIConfig().provider, "openai-compatible");
    console.log("PASS configurable provider/model called from server-side AI adapter");
    console.log("PASS API credential sent only in server-to-provider Authorization header");
  } finally { server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
