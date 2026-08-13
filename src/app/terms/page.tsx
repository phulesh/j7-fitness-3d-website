import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="prose-ebook mx-auto max-w-3xl px-4 py-14">
        <h1>Terms</h1>
        <p>
          Folio is an educational research tool. Generated books can be wrong, incomplete, or out of date. They are not legal,
          medical, or financial advice. Check official sources before high-stakes use.
        </p>
        <p>
          You are responsible for how you use generated text. Do not use Folio to copy copyrighted books. Wikipedia extracts
          are used under CC BY-SA and must keep attribution, which Folio lists in the reference section.
        </p>
        <p>Rate limits and file-size limits exist to keep the service stable. Accounts may be guest or registered.</p>
      </main>
      <Footer />
    </>
  );
}
