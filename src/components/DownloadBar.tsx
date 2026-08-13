"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export async function downloadEbook(id: string, format: string, title = "ebook") {
  const res = await fetch(`/api/ebooks/${id}/export?format=${format}`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Download failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "-")}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DownloadBar({
  ebookId,
  title,
  compact = false,
}: {
  ebookId: string;
  title?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function go(format: string) {
    setBusy(format);
    setError("");
    try {
      await downloadEbook(ebookId, format, title);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const main = [
    { id: "pdf", label: "PDF" },
    { id: "epub", label: "EPUB" },
    { id: "docx", label: "DOCX" },
  ];
  const extra = [
    { id: "md", label: "Markdown" },
    { id: "txt", label: "TXT" },
  ];

  return (
    <div>
      <div className={`flex flex-wrap gap-2 ${compact ? "" : ""}`}>
        {main.map((f) => (
          <button
            key={f.id}
            type="button"
            className={f.id === "pdf" ? "btn-gold min-h-[48px]" : "btn-ghost min-h-[48px]"}
            disabled={!!busy}
            onClick={() => go(f.id)}
          >
            <Download className="h-4 w-4" />
            {busy === f.id ? "…" : f.label}
          </button>
        ))}
        {extra.map((f) => (
          <button key={f.id} type="button" className="btn-ghost min-h-[44px] !text-xs" disabled={!!busy} onClick={() => go(f.id)}>
            {busy === f.id ? "…" : f.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-unsupported">{error}</p>}
    </div>
  );
}
