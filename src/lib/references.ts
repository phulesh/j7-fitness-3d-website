import type { SourceRecord } from "./types";

export type ReferenceGroupKey = "primary" | "secondary" | "government" | "archives" | "other";

export interface ReferenceGroup {
  key: ReferenceGroupKey;
  title: string;
  titleHi: string;
  sources: SourceRecord[];
}

export function groupReferences(sources: SourceRecord[]): ReferenceGroup[] {
  const groups: ReferenceGroup[] = [
    { key: "primary", title: "Primary Sources", titleHi: "प्राथमिक स्रोत", sources: [] },
    { key: "secondary", title: "Secondary Sources", titleHi: "द्वितीयक स्रोत", sources: [] },
    { key: "government", title: "Government / Legal Sources", titleHi: "सरकारी / कानूनी स्रोत", sources: [] },
    { key: "archives", title: "Digital Archives", titleHi: "डिजिटल अभिलेखागार", sources: [] },
    { key: "other", title: "Other Sources", titleHi: "अन्य स्रोत", sources: [] },
  ];
  for (const source of sources) {
    const hay = `${source.domain} ${source.organization} ${source.url}`.toLowerCase();
    let key: ReferenceGroupKey = "other";
    if (source.sourceType === "legal" || source.sourceType === "official" || source.tier <= 2 || /\.gov\.|\.gov$|constitution|parliament|legislative/.test(hay)) key = "government";
    else if (source.sourceType === "archive" || /archive\.org|archives|repository/.test(hay)) key = "archives";
    else if (source.primarySource) key = "primary";
    else if (source.academicSource || ["secondary", "scholarly", "encyclopedia"].includes(source.sourceType || "")) key = "secondary";
    groups.find((group) => group.key === key)!.sources.push(source);
  }
  return groups.filter((group) => group.sources.length > 0);
}

export function sourceCitation(source: SourceRecord): string {
  return source.citation || [source.author, source.title, source.publication || source.publisher || source.organization, source.year].filter(Boolean).join(". ");
}
