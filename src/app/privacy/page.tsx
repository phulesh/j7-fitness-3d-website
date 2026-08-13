import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="prose-ebook mx-auto max-w-3xl px-4 py-14">
        <h1>Privacy</h1>
        <p>
          Folio stores accounts, ebook drafts, retrieved source extracts, and uploaded syllabi on the server you run. Session
          cookies are httpOnly. API keys live only in environment variables and are never sent to the browser.
        </p>
        <p>
          Uploaded files are size-limited and are not executed. Do not upload documents you are not allowed to process.
          Guest accounts are temporary workspace identities, not anonymous browsing.
        </p>
        <p>Research requests go to third-party sites (Wikipedia, Crossref, and others) with a descriptive user agent.</p>
      </main>
      <Footer />
    </>
  );
}
