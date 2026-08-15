import { NextResponse } from "next/server";
import path from "path";
import { getAIStatus, pingAI, getAIConfig, AIProviderError } from "@/lib/ai";
import { dataDir, getDatabase, getDatabasePath } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *   Fast, dependency-free readiness probe. Reports whether the four
 *   server-side AI variables are present and which provider/model/endpoint
 *   they route to. Never returns credentials, not even partially.
 *
 * GET /api/health?probe=ai
 *   Same, plus ONE real minimal request to the configured provider so
 *   "configured" can be confirmed as "healthy". Kept off the default path so
 *   Railway's healthcheck does not spend tokens on every poll.
 */
export async function GET(req: Request) {
  const probeAi = new URL(req.url).searchParams.get("probe") === "ai";

  let database: string;
  let persistent = false;
  try {
    const db = getDatabase();
    db.prepare("SELECT 1").get();
    const dbPath = getDatabasePath();
    const root = dataDir();
    const onVolume = dbPath === root || dbPath.startsWith(root + path.sep);
    persistent = path.isAbsolute(dbPath) && onVolume;
    database = persistent ? "configured" : "not-persistent-production-config";
  } catch (error) {
    database = "unavailable";
  }

  const status = getAIStatus();
  // Non-secret routing metadata only.
  const ai: Record<string, unknown> = {
    status: status.configured ? "configured" : "not-configured",
    provider: status.provider,
    model: status.model,
    endpoint: status.endpoint,
    wireFormat: status.wireFormat,
  };
  
  // Add missing variables if not configured
  if (!status.configured) {
    ai.missing = status.missing;
    ai.reason = status.reason;
  }

  let probeOk = true;
  let probeError: string | undefined;
  let probeLatencyMs = 0;
  
  if (probeAi) {
    try {
      const probe = await pingAI();
      probeOk = probe.ok;
      probeLatencyMs = probe.latencyMs;
      probeError = probe.error;
      ai.status = probe.ok ? "healthy" : status.configured ? "unhealthy" : "not-configured";
      ai.probe = { 
        ok: probe.ok, 
        latencyMs: probe.latencyMs, 
        ...(probe.error ? { error: probe.error } : {}) 
      };
      
      // If configured but not healthy, add detailed error
      if (status.configured && !probe.ok && probe.error) {
        ai.error = probe.error;
      }
    } catch (error) {
      probeOk = false;
      probeError = error instanceof Error ? error.message : "AI probe failed";
      ai.status = status.configured ? "unhealthy" : "not-configured";
      ai.probe = { ok: false, error: probeError };
    }
  }

  // `ok` reflects deployment readiness (persistent database) so a missing AI
  // key never takes the whole service out of Railway's healthcheck rotation.
  // Only the explicit ?probe=ai form additionally requires a live provider.
  const ok = persistent && probeOk;
  
  return NextResponse.json(
    {
      ok,
      database,
      // Back-compat: existing checks read `ai` as a plain string.
      ai: ai.status,
      aiDetail: ai,
      search: {
        provider: (process.env.SEARCH_PROVIDER || "auto").trim().toLowerCase(),
        // SEARCH_* is intentionally independent of the AI provider variables.
        status: process.env.SEARCH_API_KEY?.trim() ? "configured" : "not-configured",
      },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
