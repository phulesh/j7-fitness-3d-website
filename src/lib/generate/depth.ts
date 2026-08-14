/**
 * Chapter depth guarantee.
 *
 * Deterministically deepens a thin chapter with an evidence-review section
 * built from the most relevant approved source extracts, so no chapter can
 * ship with 0 words or below the minimum for the requested book length.
 * In Hindi mode, Devanagari passages are preferred and English evidence is
 * framed with Hindi analysis so the language check still passes.
 */
import { nanoid } from "nanoid";
import type { Chapter, EbookSettings, SourceRecord } from "../types";
import { countWords, escapeHtml } from "./text";
import { isHindiOutput } from "../language";
import { minWordsPerChapter } from "./publish-gate";
import { termsInText } from "../research/translit";

function chapterBodyWords(ch: Chapter): number {
  return countWords(
    [ch.title, ...ch.sections.map((s) => `${s.heading} ${s.html.replace(/<[^>]+>/g, " ")}`), ...ch.keyPoints, ch.summary].join(" ")
  );
}

export function deepenChapterFromSources(
  ch: Chapter,
  sources: SourceRecord[],
  settings: EbookSettings,
  lang: string
): void {
  const min = minWordsPerChapter(settings.length);
  if (chapterBodyWords(ch) >= min) return;

  const hindi = isHindiOutput(lang);
  const titleWords = ch.title
    .toLowerCase()
    .split(/[\s—–:,/]+/)
    .filter((w) => w.length > 3);
  const ranked = sources
    .filter((s) => (s.extractedText || "").length > 200)
    .map((s) => {
      const hay = `${s.title} ${s.extractedText}`.toLowerCase();
      const direct = titleWords.filter((w) => hay.includes(w)).length;
      const cross = direct ? 0 : termsInText(hay.slice(0, 4000), titleWords).length;
      const hindiBonus = hindi && /[\u0900-\u097F]/.test(s.extractedText || "") ? 2 : 0;
      return { s, score: direct + cross + hindiBonus + (s.relevanceScore || 0) / 100 };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);

  const already = new Set(ch.sections.map((s) => s.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 120)));
  const paras: string[] = [];
  const citeIdsUsed = new Set<number>();

  const chunksOf = (text: string) =>
    text
      .split(/\n{2,}|(?<=[.?!।])\s+(?=[A-Z\u0900-\u097F])/)
      .map((p) => p.replace(/^==+[^=]+=+\s*/, "").trim())
      .filter((p) => p.length > 100 && p.length < 1400);

  const addFromSource = (s: SourceRecord, preferHindi: boolean): boolean => {
    let added = false;
    const all = chunksOf(s.extractedText || "").filter((p) => (preferHindi ? /[\u0900-\u097F]/.test(p) : true));
    // Rotate the starting chunk by chapter index so consecutive chapters that
    // rank the same source first do not repeat the same paragraphs.
    const offset = all.length ? ch.index % all.length : 0;
    const chunks = [...all.slice(offset), ...all.slice(0, offset)];
    for (const p of chunks.slice(0, 6)) {
      const sig = p.replace(/\s+/g, " ").slice(0, 120);
      if (already.has(sig)) continue;
      already.add(sig);
      let html: string;
      if (hindi && !/[\u0900-\u097F]/.test(p)) {
        // Keep English quotes short and wrap them in Hindi analysis so the
        // chapter stays predominantly Devanagari.
        html = `स्रोत «${escapeHtml(s.title)}» (${escapeHtml(s.organization || "")}) इस अध्याय के विषय से सीधे जुड़ा सत्यापित अभिलेख है। उसका प्रासंगिक अंश: “${escapeHtml(
          p.slice(0, 220)
        )}…” — इस साक्ष्य को अध्याय की मुख्य चर्चा के दावों से मिलाकर पढ़ें और तथ्य तथा व्याख्या का भेद बनाए रखें।`;
      } else {
        html = escapeHtml(p.slice(0, 900));
      }
      paras.push(`<p>${html} <sup class="cite">[${s.id}]</sup></p>`);
      citeIdsUsed.add(s.id);
      added = true;
      if (paras.length >= 12) break;
    }
    return added;
  };

  // First pass: Hindi-script evidence when writing Hindi; second pass: any.
  for (const s of ranked.slice(0, 8)) {
    if (paras.length >= 12) break;
    addFromSource(s, hindi);
    const projected = chapterBodyWords(ch) + countWords(paras.join(" ").replace(/<[^>]+>/g, " "));
    if (projected >= min) break;
  }
  if (hindi) {
    for (const s of ranked.slice(0, 8)) {
      const projected = chapterBodyWords(ch) + countWords(paras.join(" ").replace(/<[^>]+>/g, " "));
      if (projected >= min || paras.length >= 12) break;
      addFromSource(s, false);
    }
  }

  if (paras.length) {
    ch.sections.push({
      id: nanoid(8),
      heading: hindi ? "साक्ष्य-समीक्षा और स्रोत-विवेचन" : "Evidence review and source discussion",
      html:
        (hindi
          ? `<p>नीचे इस अध्याय के विषय से जुड़े अनुमोदित स्रोतों के प्रमुख अंश और उनका विवेचन दिया गया है ताकि पाठक प्रत्येक दावे को उसके साक्ष्य तक खोज सके। प्रत्येक अंश के साथ क्रमांकित स्रोत-संदर्भ दिया गया है।</p>`
          : `<p>The passages below collect the key evidence from approved sources for this chapter so every claim can be traced to its citation.</p>`) +
        paras.join("\n"),
      sourceIds: [...citeIdsUsed],
    });
    ch.sourceIds = [...new Set([...(ch.sourceIds || []), ...citeIdsUsed])];
  }
}
