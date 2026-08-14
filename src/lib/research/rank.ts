import { domainOf } from "../http";
import type { SourceTier } from "../types";

const GOV = [
  "gov",
  "gov.in",
  "nic.in",
  "gov.uk",
  "gc.ca",
  "europa.eu",
  "un.org",
  "who.int",
  "unesco.org",
  "imf.org",
  "worldbank.org",
  "oecd.org",
  "nasa.gov",
  "nih.gov",
  "cdc.gov",
  "fda.gov",
  "loc.gov",
  "nara.gov",
  "census.gov",
  "bls.gov",
  "nsf.gov",
  "noaa.gov",
  "usgs.gov",
  "whitehouse.gov",
  "congress.gov",
  "supremecourt.gov",
  "legislative.gov.in",
  "india.gov.in",
  "eci.gov.in",
  "rbi.org.in",
  "ncert.nic.in",
  "cbse.gov.in",
  "ugc.gov.in",
  "nta.ac.in",
  "education.gov.in",
  "mea.gov.in",
  "mha.gov.in",
  "prsindia.org",
];

const INSTITUTIONS = [
  "who.int",
  "un.org",
  "unesco.org",
  "unicef.org",
  "ilo.org",
  "wto.org",
  "iso.org",
  "ietf.org",
  "w3.org",
  "ieee.org",
  "acm.org",
  "ietf.org",
];

const UNIVERSITIES = [
  ".edu",
  ".ac.uk",
  ".ac.in",
  ".edu.au",
  "mit.edu",
  "stanford.edu",
  "harvard.edu",
  "ox.ac.uk",
  "cam.ac.uk",
  "iit",
  "iisc.ac.in",
  "iim",
];

const DOCS = [
  "docs.python.org",
  "developer.mozilla.org",
  "learn.microsoft.com",
  "docs.oracle.com",
  "kubernetes.io",
  "react.dev",
  "nodejs.org",
  "pytorch.org",
  "tensorflow.org",
  "scikit-learn.org",
  "numpy.org",
  "pandas.pydata.org",
  "w3.org",
  "rfc-editor.org",
  "postgresql.org",
  "mysql.com",
];

const PAPERS = [
  "arxiv.org",
  "doi.org",
  "nature.com",
  "science.org",
  "cell.com",
  "plos.org",
  "nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "springer.com",
  "wiley.com",
  "ieee.org",
  "acm.org",
  "jstor.org",
  "ssrn.com",
  "biorxiv.org",
  "medrxiv.org",
  "crossref.org",
];

const BOOKS = [
  "openlibrary.org",
  "archive.org",
  "gutenberg.org",
  "wikibooks.org",
  "wikisource.org",
  "loc.gov",
  "hathitrust.org",
];

const PUBLISHERS = [
  "britannica.com",
  "oup.com",
  "cambridge.org",
  "mitpress.mit.edu",
  "press.princeton.edu",
  "yale.edu",
];

const NEWS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "npr.org",
  "thehindu.com",
  "indianexpress.com",
  "pib.gov.in",
  "theguardian.com",
  "nytimes.com",
  "washingtonpost.com",
  "economist.com",
  "nature.com",
  "scientificamerican.com",
];

const WIKI = ["wikipedia.org", "wikidata.org", "wikimedia.org", "wiktionary.org"];

export function sourceTier(url: string): SourceTier {
  const d = domainOf(url).toLowerCase();
  if (!d) return 9;
  if (matches(d, GOV) || d.endsWith(".gov") || d.endsWith(".gov.in") || d.endsWith(".nic.in")) return 1;
  if (matches(d, INSTITUTIONS)) return 2;
  if (matches(d, UNIVERSITIES) || d.endsWith(".edu") || d.endsWith(".ac.in") || d.endsWith(".ac.uk")) return 3;
  if (matches(d, DOCS)) return 4;
  if (matches(d, PAPERS)) return 5;
  if (matches(d, BOOKS)) return 6;
  if (matches(d, PUBLISHERS)) return 7;
  if (matches(d, NEWS)) return 8;
  if (matches(d, WIKI)) return 7;
  return 9;
}

function matches(domain: string, list: string[]) {
  return list.some((x) => domain === x || domain.endsWith(x) || domain.includes(x));
}

export function organizationFromDomain(url: string): string {
  const d = domainOf(url);
  if (!d) return "Unknown";
  const known: Record<string, string> = {
    "en.wikipedia.org": "Wikipedia",
    "hi.wikipedia.org": "विकिपीडिया",
    "wikipedia.org": "Wikipedia",
    "wikidata.org": "Wikidata",
    "ncert.nic.in": "NCERT",
    "cbse.gov.in": "CBSE",
    "legislative.gov.in": "Government of India — Legislative Department",
    "india.gov.in": "National Portal of India",
    "prsindia.org": "PRS Legislative Research",
    "arxiv.org": "arXiv",
    "nih.gov": "National Institutes of Health",
    "who.int": "World Health Organization",
    "un.org": "United Nations",
    "britannica.com": "Encyclopaedia Britannica",
    "openlibrary.org": "Open Library",
    "archive.org": "Internet Archive",
    "gutenberg.org": "Project Gutenberg",
    "developer.mozilla.org": "MDN Web Docs",
    "docs.python.org": "Python Software Foundation",
    "crossref.org": "Crossref",
    "pubmed.ncbi.nlm.nih.gov": "PubMed",
    "nasa.gov": "NASA",
    "loc.gov": "Library of Congress",
  };
  for (const [k, v] of Object.entries(known)) {
    if (d === k || d.endsWith(k)) return v;
  }
  return d.replace(/\.(com|org|net|edu|gov|in|uk)$/g, "").split(".").slice(-2, -1)[0] || d;
}

export function scoreSource(input: {
  url: string;
  title: string;
  snippet: string;
  topic: string;
  extractedLen?: number;
}): number {
  const tier = sourceTier(input.url);
  const tierScore = (10 - tier) * 10;
  const topicWords = tokenize(input.topic);
  const blob = `${input.title} ${input.snippet}`.toLowerCase();
  const overlap = topicWords.filter((w) => blob.includes(w)).length;
  const coverage = topicWords.length ? (overlap / topicWords.length) * 20 : 0;
  const lengthBonus = Math.min(15, (input.extractedLen || input.snippet.length) / 400);
  return Math.round(tierScore + coverage + lengthBonus);
}

export function tokenize(s: string): string[] {
  return (
    s
      .toLowerCase()
      // \p{M} must be kept: Devanagari and most non-Latin scripts write vowels
      // as combining marks, and dropping them destroys every word.
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
      .split(/\s+/)
      // Non-Latin words are meaningful at 2 characters; a >2 filter silently
      // discarded valid Devanagari tokens.
      .filter((w) => (/[^\u0000-\u024F]/.test(w) ? w.length >= 2 : w.length > 2) && !STOP.has(w))
  );
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "are",
  "was",
  "were",
  "you",
  "your",
  "into",
  "about",
  "complete",
  "course",
  "book",
  "guide",
  "class",
  "chapter",
]);
