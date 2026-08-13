"use client";

import type { SaveState } from "@/hooks/useEbook";

export function AutosaveIndicator({ state }: { state: SaveState }) {
  const label = state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "failed" ? "Save failed" : "";
  if (!label) return null;
  return (
    <span
      className={`text-xs ${
        state === "failed" ? "text-unsupported" : state === "saved" ? "text-forest-500" : "text-ink-400"
      }`}
      aria-live="polite"
    >
      {label}
    </span>
  );
}
