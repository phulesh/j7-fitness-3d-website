#!/usr/bin/env node
/**
 * Runtime-only data directory bootstrap for production (Railway).
 *
 * Runs as part of the container START command — never during build.
 * Railway mounts the persistent volume at /app/data (RAILWAY_VOLUME_MOUNT_PATH)
 * only when the container starts, so any directory creation, corpus seeding,
 * or database initialization must happen here, at runtime.
 *
 * - Creates the data subdirectories on the volume (uploads, exports, covers,
 *   images, corpus).
 * - Seeds the local research corpus into the volume if it is empty (first
 *   boot). Existing volume contents are never overwritten.
 *
 * The database itself is created lazily by the application on first use.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const prod = process.env.NODE_ENV === "production";
const dataRoot =
  process.env.DATA_DIR?.trim() ||
  (prod
    ? process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || "/app/data"
    : path.join(process.cwd(), "data"));

for (const sub of ["", "uploads", "exports", "covers", "images", "corpus"]) {
  fs.mkdirSync(path.join(dataRoot, sub), { recursive: true });
}

const corpusDir = path.join(dataRoot, "corpus");
const hasCorpus = fs.existsSync(corpusDir) && fs.readdirSync(corpusDir).some((f) => f.endsWith(".json"));
if (!hasCorpus) {
  console.log(`[runtime-data] Seeding local research corpus into ${corpusDir}`);
  execSync("node scripts/seed-corpus.mjs", {
    stdio: "inherit",
    env: { ...process.env, CORPUS_DIR: corpusDir },
  });
} else {
  console.log(`[runtime-data] Corpus already present in ${corpusDir}; not overwriting.`);
}

console.log(`[runtime-data] Ready: ${dataRoot}${prod ? " (persistent volume)" : ""}`);
