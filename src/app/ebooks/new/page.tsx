"use client";

import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SimpleWizard } from "@/components/SimpleWizard";

export default function NewEbookPage() {
  return (
    <>
      <Header />
      <Suspense fallback={<div className="p-10 text-center text-ink-400">खुल रहा है…</div>}>
        <SimpleWizard />
      </Suspense>
      <Footer />
    </>
  );
}
