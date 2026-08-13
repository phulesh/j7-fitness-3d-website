"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RedirectInner() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const q = params.toString();
    router.replace(`/ebooks/new${q ? `?${q}` : ""}`);
  }, [params, router]);
  return <div className="p-10 text-ink-400">Opening the desk…</div>;
}

export default function CreateRedirect() {
  return (
    <Suspense fallback={<div className="p-10">Opening…</div>}>
      <RedirectInner />
    </Suspense>
  );
}
