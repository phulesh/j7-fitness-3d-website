import { chat, getAIConfig } from "../src/lib/ai";

async function main() {
  const config = getAIConfig();
  const marker = `folio-provider-check-${Date.now()}`;
  const response = await chat(
    [
      { role: "system", content: "You are a connectivity test. Follow the user's instruction exactly and do not add commentary." },
      { role: "user", content: `Reply with exactly these words: ${marker}` },
    ],
    { temperature: 0, maxTokens: 80 }
  );
  if (!response.trim() || !response.toLowerCase().includes("folio-provider-check")) {
    throw new Error("The real provider returned content, but it did not follow the integration-test instruction.");
  }
  // Deliberately report only non-secret routing metadata.
  console.log(`AI REAL PROVIDER: PASS (${config.provider}, model=${config.model}, endpoint=${new URL(config.baseUrl).origin})`);
}

main().catch((error) => {
  console.error(`AI REAL PROVIDER: FAIL — ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
