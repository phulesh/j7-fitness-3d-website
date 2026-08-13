"use client";

import { useParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BookStudio } from "@/components/BookStudio";

export default function OutlinePage() {
  const { ebookId } = useParams<{ ebookId: string }>();
  return (
    <>
      <Header />
      <BookStudio ebookId={ebookId} tab="outline" />
      <Footer />
    </>
  );
}
