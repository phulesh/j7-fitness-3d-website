"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEbook } from "@/hooks/useEbook";
import { BookReader } from "@/components/BookReader";

export default function ReadPage() {
  const { ebookId } = useParams<{ ebookId: string }>();
  const { doc, error, load, loading } = useEbook(ebookId);

  if (loading) return <p className="p-10 text-center text-ink-400">किताब खुल रही है…</p>;
  if (!doc) {
    return (
      <div className="p-10 text-center">
        <p className="text-unsupported">{error || "किताब नहीं मिली।"}</p>
        <button className="btn-gold mt-4" onClick={() => load().catch(() => {})}>
          Retry
        </button>
        <Link href="/ebooks" className="btn-ghost mt-4 ml-2">
          मेरी किताबें
        </Link>
      </div>
    );
  }
  if (!doc.chapters.length) {
    return (
      <div className="p-10 text-center">
        <p className="text-ink-400">अध्याय अभी तैयार नहीं हैं।</p>
        <Link href={`/ebooks/${ebookId}`} className="btn-gold mt-4 inline-flex">
          किताब पर जाएँ
        </Link>
      </div>
    );
  }
  return <BookReader doc={doc} />;
}
