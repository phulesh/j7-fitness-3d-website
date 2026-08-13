"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BookStudio, type StudioTab } from "@/components/BookStudio";

const TABS = new Set([
  "cover",
  "settings",
  "contents",
  "research",
  "sources",
  "outline",
  "chapters",
  "references",
  "glossary",
  "preview",
  "3d",
]);

function Inner() {
  const { ebookId } = useParams<{ ebookId: string }>();
  const search = useSearchParams();
  const raw = search.get("tab") || (search.get("fact") === "1" ? "chapters" : "settings");
  const tab = (TABS.has(raw) ? raw : "settings") as StudioTab;
  return (
    <>
      <Header />
      <BookStudio ebookId={ebookId} tab={tab} />
      <Footer />
    </>
  );
}

export default function EditPage() {
  return (
    <Suspense fallback={<div className="p-10">Opening editor…</div>}>
      <Inner />
    </Suspense>
  );
}
