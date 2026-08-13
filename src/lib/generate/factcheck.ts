import { nanoid } from "nanoid";
import { webSearch } from "../research/search";
import { extractReadable, splitSentences } from "../research/extract";
import { wikiSearch, fetchWikiPage } from "../research/wikipedia";
import { chat, aiConfigured, RESEARCH_WRITER_SYSTEM } from "../ai";
import type { EbookDocument, FactFlag, SourceRecord } from "../types";
import { chapterPlain } from "./write";

export async function factCheckEbook(doc: EbookDocument): Promise<FactFlag[]> {
  const claims = collectClaims(doc).slice(0, 24);
  const flags: FactFlag[] = [];

  for (const claim of claims) {
    const flag = await checkClaim(claim, doc);
    flags.push(flag);
  }

  if (aiConfigured() && flags.length) {
    const extra = await aiReview(doc, flags);
    if (extra.length) {
      for (const e of extra) {
        const i = flags.findIndex((f) => f.claim.slice(0, 40) === e.claim.slice(0, 40));
        if (i >= 0) flags[i] = { ...flags[i], ...e, id: flags[i].id };
        else flags.push(e);
      }
    }
  }
  return flags;
}

function collectClaims(doc: EbookDocument): string[] {
  const texts: string[] = [doc.introduction, doc.conclusion];
  for (const ch of doc.chapters) texts.push(chapterPlain(ch));
  const blob = texts.join("\n");
  const sentences = splitSentences(blob.replace(/<[^>]+>/g, " "));
  return sentences.filter((s) => {
    if (s.length < 50 || s.length > 320) return false;
    if (/this ebook|this chapter|learning objective|review question/i.test(s)) return false;
    return /\d|[A-Z][a-z]{3,}/.test(s);
  });
}

async function checkClaim(claim: string, doc: EbookDocument): Promise<FactFlag> {
  const id = nanoid(8);
  const localHits = doc.sources.filter((s) => overlap(claim, `${s.title} ${s.snippet} ${s.extractedText || ""}`));
  let remoteSupport = 0;
  const remoteIds: number[] = localHits.map((s) => s.id);

  try {
    const { searchCorpus } = await import("../research/corpus");
    const local = searchCorpus(claim.split(/\s+/).slice(0, 10).join(" "), 3);
    for (const h of local) {
      if (overlap(claim, `${h.title} ${h.extract}`)) remoteSupport++;
    }
    const q = claim.split(/\s+/).slice(0, 12).join(" ");
    const wiki = await wikiSearch(q, doc.analysis?.wikiLanguage || "en", 3);
    if (wiki[0]) {
      const page = await fetchWikiPage(wiki[0].title, doc.analysis?.wikiLanguage || "en");
      if (page && overlap(claim, page.extract)) remoteSupport++;
    }
    const web = await webSearch(q, { count: 4 });
    for (const h of web.slice(0, 2)) {
      if (overlap(claim, `${h.title} ${h.snippet}`)) remoteSupport++;
      else {
        const full = await extractReadable(h.url);
        if (full && overlap(claim, full.text)) remoteSupport++;
      }
    }
  } catch {
    /* network — fall back to local */
  }

  const support = localHits.length + remoteSupport;
  let status: FactFlag["status"] = "needs_review";
  if (support >= 2) status = "verified";
  else if (support === 0) status = "unsupported";

  return {
    id,
    claim,
    status,
    explanation:
      status === "verified"
        ? `Corroborated by ${support} source signal(s), including ${localHits.map((s) => s.organization).slice(0, 3).join(", ") || "live search"}.`
        : status === "unsupported"
          ? "No overlapping reliable source was found for this wording. Do not treat it as established fact."
          : "Only weak overlap with collected sources. Review the claim or add a better citation.",
    sourceIds: remoteIds.slice(0, 6),
    suggestedFix: status === "unsupported" ? `Information could not be independently verified: “${claim}”` : undefined,
  };
}

function overlap(claim: string, corpus: string): boolean {
  const tokens = claim
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (tokens.length < 4) return corpus.toLowerCase().includes(claim.toLowerCase().slice(0, 40));
  const hay = corpus.toLowerCase();
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits / tokens.length >= 0.55;
}

async function aiReview(doc: EbookDocument, flags: FactFlag[]): Promise<FactFlag[]> {
  const src = doc.sources
    .slice(0, 15)
    .map((s) => `[${s.id}] ${s.title} — ${s.url}`)
    .join("\n");
  const raw = await chat(
    [
      { role: "system", content: RESEARCH_WRITER_SYSTEM },
      {
        role: "user",
        content: `Fact-check these claims against the source list. Return JSON array of {claim, status: verified|needs_review|unsupported, explanation, suggestedFix}.
Do not invent sources.

SOURCES:
${src}

CLAIMS:
${flags.map((f, i) => `${i + 1}. ${f.claim}`).join("\n")}`,
      },
    ],
    { maxTokens: 2500, temperature: 0 }
  );
  if (!raw) return [];
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as any[];
    return arr.map((x) => ({
      id: nanoid(8),
      claim: String(x.claim || ""),
      status: (["verified", "needs_review", "unsupported"].includes(x.status) ? x.status : "needs_review") as FactFlag["status"],
      explanation: String(x.explanation || ""),
      sourceIds: [],
      suggestedFix: x.suggestedFix ? String(x.suggestedFix) : undefined,
    }));
  } catch {
    return [];
  }
}

export function applyFlagsToEbook(doc: EbookDocument, flags: FactFlag[], applyIds: string[]): EbookDocument {
  const apply = new Set(applyIds);
  let introduction = doc.introduction;
  let conclusion = doc.conclusion;
  const chapters = doc.chapters.map((ch) => ({
    ...ch,
    sections: ch.sections.map((s) => ({ ...s })),
  }));

  for (const f of flags) {
    if (!apply.has(f.id) || !f.suggestedFix) continue;
    introduction = introduction.replace(f.claim, f.suggestedFix);
    conclusion = conclusion.replace(f.claim, f.suggestedFix);
    for (const ch of chapters) {
      for (const s of ch.sections) {
        s.html = s.html.replace(escapeForHtml(f.claim), escapeForHtml(f.suggestedFix));
      }
      ch.summary = ch.summary.replace(f.claim, f.suggestedFix);
    }
    f.applied = true;
  }
  return { ...doc, introduction, conclusion, chapters };
}

function escapeForHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function attachFlags(doc: EbookDocument, flags: FactFlag[]) {
  const byChapter = doc.chapters.map((ch) => {
    const text = chapterPlain(ch).toLowerCase();
    return {
      ...ch,
      factFlags: flags.filter((f) => text.includes(f.claim.slice(0, 32).toLowerCase())),
    };
  });
  return byChapter;
}
