"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

export default function LegacyEbookRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    const edit = search.get("edit") === "1";
    const fact = search.get("fact") === "1";
    if (fact) router.replace(`/ebooks/${id}/edit?fact=1`);
    else if (edit) router.replace(`/ebooks/${id}/edit?tab=settings`);
    else router.replace(`/ebooks/${id}`);
  }, [id, router, search]);

  return <div className="p-10 text-ink-400">Opening ebook {id}…</div>;
}
