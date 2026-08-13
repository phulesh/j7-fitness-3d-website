"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BookWorkspace } from "@/components/BookWorkspace";

function Inner() {
  const { ebookId } = useParams<{ ebookId: string }>();
  return <BookWorkspace ebookId={ebookId} />;
}

export default function EbookHubPage() {
  return (
    <>
      <Header />
      <Suspense fallback={<div className="p-10 text-center text-ink-400">किताब खोली जा रही है…</div>}>
        <Inner />
      </Suspense>
      <Footer />
    </>
  );
}
