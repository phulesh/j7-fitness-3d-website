import { NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDatabase();
    db.prepare("SELECT 1").get();
    const configured = process.env.DATABASE_URL || "";
    const persistentDatabaseConfigured =
      configured.startsWith("file:/") && configured !== "file::memory:";
    return NextResponse.json(
      {
        ok: persistentDatabaseConfigured,
        database: persistentDatabaseConfigured ? "configured" : "not-persistent-production-config",
        ai: aiConfigured() ? "configured" : "not-configured",
      },
      {
        status: persistentDatabaseConfigured ? 200 : 503,
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
