"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BookStudio } from "@/components/BookStudio";
import { useStatusPoll } from "@/hooks/useEbook";

export default function ResearchPage() {
  const { ebookId } = useParams<{ ebookId: string }>();
  const router = useRouter();
  const { status, error } = useStatusPoll(ebookId, true);

  useEffect(() => {
    if (!status) return;
    if (status.status === "awaiting_outline") router.replace(`/ebooks/${ebookId}/outline`);
    if (status.status === "complete") router.replace(`/ebooks/${ebookId}/read`);
    if (status.status === "failed" || status.status === "paused") router.replace(`/ebooks/${ebookId}/edit?tab=research`);
  }, [status, ebookId, router]);

  return (
    <>
      <Header />
      <BookStudio ebookId={ebookId} tab="research" />
      <Footer />
    </>
  );
}
