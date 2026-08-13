"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, ensureSession } from "@/lib/client";

export default function EbookHubPage() {
  const { ebookId } = useParams<{ ebookId: string }>();
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function open() {
    setLoading(true);
    setError("");
    try {
      await ensureSession();
      const data = await Promise.race([
        api(`/api/ebooks/${ebookId}`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timed out while opening this ebook. Please retry.")), 15000)),
      ]);
      const status = data.ebook?.status;
      if (status === "analyzing" || status === "researching") router.replace(`/ebooks/${ebookId}/research`);
      else if (status === "awaiting_outline" || status === "outlining") router.replace(`/ebooks/${ebookId}/outline`);
      else if (status === "complete") router.replace(`/ebooks/${ebookId}/read`);
      else router.replace(`/ebooks/${ebookId}/edit?tab=settings`);
    } catch (e: any) {
      setError(e.message || "That ebook could not be opened.");
      setLoading(false);
    }
  }

  useEffect(() => {
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ebookId]);

  return (
    <div className="p-10">
      {loading && !error && <p className="text-ink-400">Opening ebook {ebookId}…</p>}
      {error && (
        <div className="paper-card max-w-lg rounded-2xl p-6">
          <p className="text-unsupported">{error}</p>
          <div className="mt-4 flex gap-2">
            <button className="btn-gold" onClick={open}>
              Retry
            </button>
            <Link href="/ebooks" className="btn-ghost">
              Back to Library
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
