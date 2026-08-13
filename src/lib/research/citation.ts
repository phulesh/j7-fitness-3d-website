import type { SourceRecord, SourceVerificationStatus } from "../types";
import { isHindiOutput } from "../language";

export const UNVERIFIED_LABEL = "सत्यापन आवश्यक";

export function isHttpUrl(url: string | undefined | null): boolean {
  return Boolean(url && /^https?:\/\/\S+$/i.test(url.trim()));
}

/** Build a citation only from fields that actually exist. Never invent author, year, URL, or title. */
export function formatCitation(s: Partial<Pick<SourceRecord, "author" | "title" | "publication" | "publisher" | "organization" | "year" | "url">>): string {
  const bits: string[] = [];
  if (s.author?.trim()) bits.push(s.author.trim());
  if (s.title?.trim()) bits.push(s.title.trim());
  const pub = (s.publication || s.publisher || s.organization || "").trim();
  if (pub && pub !== s.title?.trim() && pub !== s.author?.trim()) bits.push(pub);
  if (s.year?.trim()) bits.push(s.year.trim());
  if (isHttpUrl(s.url)) bits.push((s.url || "").trim());
  return bits.join(". ") + (bits.length ? "." : "");
}

export function verificationLabel(status: SourceVerificationStatus | undefined, lang?: string): string {
  if (status === "verified") return isHindiOutput(lang) ? "सत्यापित" : "Verified";
  if (status === "rejected") return isHindiOutput(lang) ? "अस्वीकृत" : "Rejected";
  return UNVERIFIED_LABEL;
}

export function resolveVerification(s: SourceRecord): SourceVerificationStatus {
  if (s.verificationStatus === "rejected") return "rejected";
  if (s.verificationStatus === "verified" && isHttpUrl(s.url)) return "verified";
  if (isHttpUrl(s.url) && (s.used || (s.extractedText || "").length > 80) && (s.relevanceScore || 0) >= 70) {
    return "verified";
  }
  if (isHttpUrl(s.url)) return "needs_review";
  return "unverified";
}

export function finalizeSourceRecord(s: SourceRecord, chapterIds?: string[]): SourceRecord {
  const verificationStatus = resolveVerification(s);
  const publication = s.publication || s.publisher || s.organization || "";
  const citation = s.citation || formatCitation({ ...s, publication });
  const notes =
    s.notes ||
    (verificationStatus === "verified"
      ? s.reasonForInclusion || s.reliabilityNote || ""
      : UNVERIFIED_LABEL);
  return {
    ...s,
    publication,
    publisher: s.publisher || s.organization,
    citation,
    chapterIds: chapterIds?.length ? chapterIds : s.chapterIds || [],
    verificationStatus,
    reliabilityNote:
      verificationStatus === "verified"
        ? s.reliabilityNote || s.reasonForInclusion || ""
        : s.reliabilityNote && s.reliabilityNote !== UNVERIFIED_LABEL
          ? `${UNVERIFIED_LABEL} — ${s.reliabilityNote}`
          : UNVERIFIED_LABEL,
    notes,
    url: isHttpUrl(s.url) ? s.url.trim() : "",
  };
}
