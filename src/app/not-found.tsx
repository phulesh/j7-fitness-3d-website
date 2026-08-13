import Link from "next/link";
import { Header } from "@/components/Header";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="stamp text-gold-500 mx-auto w-fit">404</p>
        <h1 className="font-display mt-4 text-3xl">This page is not in the catalogue</h1>
        <Link href="/" className="btn-gold mt-6">
          Back to the desk
        </Link>
      </main>
    </>
  );
}
