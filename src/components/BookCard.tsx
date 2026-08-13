"use client";

import Link from "next/link";
import { FloatingBook } from "./FloatingBook";
import { friendlyStatus } from "@/lib/simple-flow";
import type { EbookDocument } from "@/lib/types";

type Card = {
  id: string;
  ebookId?: string;
  title: string;
  subtitle?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  chapterCount: number;
  coverSvg?: string;
};

export function BookCard({
  book,
  onDownload,
  onDuplicate,
  onDelete,
}: {
  book: Card;
  onDownload: (id: string, format: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const id = book.ebookId || book.id;
  const date = new Date(book.createdAt || book.updatedAt).toLocaleDateString();
  return (
    <article className="paper-card flex flex-col rounded-2xl p-5">
      <Link href={`/ebooks/${id}`} className="flex justify-center py-2">
        <FloatingBook
          title={book.title}
          subtitle={book.subtitle}
          coverSvg={book.coverSvg}
          size="sm"
          floating={false}
          openOnHover={false}
        />
      </Link>
      <h2 className="font-display mt-3 text-xl leading-tight">{book.title}</h2>
      <p className="mt-2 text-sm text-ink-400">
        {friendlyStatus(book as EbookDocument)} · {date}
        {book.wordCount ? ` · ${book.wordCount.toLocaleString()} शब्द` : ""}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={`/ebooks/${id}/read`} className="btn-gold !py-2.5 !text-sm min-h-[44px]">
          Read
        </Link>
        <Link href={`/ebooks/${id}?view=edit`} className="btn-ghost !py-2.5 !text-sm min-h-[44px]">
          Edit
        </Link>
        <Link href={`/ebooks/${id}/3d`} className="btn-ghost !py-2.5 !text-sm min-h-[44px]">
          3D Preview
        </Link>
        <button type="button" className="btn-ghost !py-2.5 !text-sm min-h-[44px]" onClick={() => onDownload(id, "pdf")}>
          Download
        </button>
        <button type="button" className="btn-ghost !py-2.5 !text-sm min-h-[44px]" onClick={() => onDuplicate(id)}>
          Duplicate
        </button>
        <button type="button" className="btn-ghost !py-2.5 !text-sm min-h-[44px] text-unsupported" onClick={() => onDelete(id)}>
          Delete
        </button>
      </div>
    </article>
  );
}
