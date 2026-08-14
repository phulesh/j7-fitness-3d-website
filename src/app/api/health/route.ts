import { NextResponse } from "next/server";
import path from "path";
import { aiConfigured } from "@/lib/ai";
import { dataDir, getDatabase, getDatabasePath } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDatabase();
    db.prepare("SELECT 1").get();
    const dbPath = getDatabasePath();
    const root = dataDir();
    const onVolume = dbPath === root || dbPath.startsWith(root + path.sep);
    const persistent = path.isAbsolute(dbPath) && onVolume;
    return NextResponse.json(
      {
        ok: persistent,
        database: persistent ? "configured" : "not-persistent-production-config",
        ai: aiConfigured() ? "configured" : "not-configured",
      },
      {
        status: persistent ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, database: "unavailable", ai: aiConfigured() ? "configured" : "not-configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
