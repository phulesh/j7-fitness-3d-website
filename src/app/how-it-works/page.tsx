import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = { title: "How Folio researches" };

export default function HowPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-14">
        <p className="stamp text-gold-500">Method</p>
        <h1 className="font-display mt-4 text-4xl">विषय लिखिए — बाकी Folio करेगा</h1>
        <div className="prose-ebook mt-8">
          <p>
            Folio does not play a fake “researching…” animation while a model writes from memory. The server issues live
            requests to encyclopedias, library catalogs, scholarly indexes, and the open web. The reference list you see is
            the set of URLs that came back.
          </p>
          <h2>Source order</h2>
          <ol>
            <li>Government websites</li>
            <li>Official institutions</li>
            <li>Universities and educational institutions</li>
            <li>Official documentation</li>
            <li>Original research papers</li>
            <li>Books and library catalogs</li>
            <li>Reputable publishers</li>
            <li>Reputable news organizations</li>
            <li>Other reliable pages</li>
          </ol>
          <h2>Pipeline</h2>
          <p>
            Topic analysis → focused search queries → web research → snippet/content inspection → relevance scoring (0–100) →
            reject below 70 → authority scoring → fact extraction → cross-check → topic-locked outline → chapter writing →
            citation mapping → review → PDF / DOCX / EPUB.
          </p>
          <h2>Relevance gate</h2>
          <p>
            Every hit is judged against the original topic, the generated research questions, and the chapter plan. Titles
            alone are never enough. Unrelated biography dumps, entertainment homonyms, and off-topic scientific papers
            (including arXiv physics results on a historical question) are rejected automatically. Writing is blocked if the
            approved list is still contaminated or too thin.
          </p>
          <h2>What we will not do</h2>
          <p>
            We will not reproduce a copyrighted book from its title. If you enter a novel or trade book, Folio writes an
            original study guide. We will not invent statistics, researchers, or URLs. Thin evidence is labelled “Information
            could not be independently verified.” Historical hypotheses are labelled as interpretation or as contested, not as
            universally established fact.
          </p>
          <h2>Optional AI</h2>
          <p>
            If <code>AI_API_KEY</code> is configured, prose can be rewritten from the same research notes. The notes still
            come from the network. If a search key is configured (Tavily, Brave, or Serper), it is used first; otherwise Folio
            uses Wikipedia, DuckDuckGo, Crossref, arXiv, Open Library, PubMed, Wikimedia Commons, and GitHub.
            When a host cannot reach Wikipedia, Folio falls back to retrieved CC BY-SA extracts and GitHub
            search — still real sources, still cited, never a fake spinner.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
