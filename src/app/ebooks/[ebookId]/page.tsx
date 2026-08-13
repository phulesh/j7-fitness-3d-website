"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ensureSession } from "@/lib/client";

export default function EbookHubPage() {
  const { ebookId } = useParams<{ ebookId: string }>();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSession();
      try {
        const data = await api(`/api/ebooks/${ebookId}`);
        if (cancelled) return;
        const status = data.ebook?.status;
        if (status === "analyzing" || status === "researching") router.replace(`/ebooks/${ebookId}/research`);
        else if (status === "awaiting_outline" || status === "outlining") router.replace(`/ebooks/${ebookId}/outline`);
        else if (status === "complete") router.replace(`/ebooks/${ebookId}/read`);
        else router.replace(`/ebooks/${ebookId}/edit?tab=settings`);
      } catch {
        if (!cancelled) router.replace(`/ebooks/${ebookId}/edit?tab=settings`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ebookId, router]);

  return <div className="p-10 text-ink-400">Opening ebook {ebookId}…</div>;
}
