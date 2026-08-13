import { createEbook, deleteEbook, findRecentDuplicateDraft, listEbooks, updateEbook, getEbook } from "./ebooks";
import { isAcceptableHindi, normalizeOutputLanguage, resolveOutputLanguage } from "./language";
import { composeHindiChapter } from "./generate/hindi";
import { DEFAULT_SETTINGS } from "./types";

export function runUpgradeSelftest() {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];

  const hi = normalizeOutputLanguage("Hindi — हिन्दी");
  checks.push({ name: "Hindi language code", ok: hi === "hi", detail: hi });

  const resolved = resolveOutputLanguage("hi", "Python for Beginners");
  checks.push({ name: "Hindi is not overwritten by English topic", ok: resolved === "hi", detail: resolved });

  const chapter = composeHindiChapter({
    index: 0,
    item: { id: "t1", title: "अस्पृश्यता क्या है?", summary: "परिभाषा", sourceIds: [] },
    settings: { ...DEFAULT_SETTINGS, language: "hi", outputLanguage: "hi", topic: "The Untouchables — B. R. Ambedkar" },
    analysis: {
      topic: "The Untouchables — B. R. Ambedkar",
      normalizedTitle: "The Untouchables",
      subtitle: "शोध",
      detectedLanguage: "en",
      outputLanguage: "hi",
      category: "historical",
      audienceSuggestion: "Researchers",
      needsCurrentInfo: false,
      copyrightMode: false,
      sensitiveDomain: "none",
      prioritySourceHints: [],
      searchQueries: [],
      wikiLanguage: "hi",
      summary: "शोध",
      researchQuestions: ["अस्पृश्यता क्या है?"],
    },
    sources: [
      {
        id: 1,
        title: "The Untouchables",
        organization: "Archive",
        url: "https://archive.org/details/untouchables",
        domain: "archive.org",
        snippet: "Ambedkar 1948",
        extractedText: "Ambedkar published The Untouchables in 1948.",
        retrievedAt: new Date().toISOString(),
        tier: 2,
        score: 90,
        used: true,
        primarySource: true,
      },
    ],
    facts: [],
  });
  checks.push({
    name: "Hindi chapter is Devanagari",
    ok: isAcceptableHindi(`${chapter.title} ${chapter.summary} ${chapter.sections.map((s) => s.html).join(" ")}`),
    detail: chapter.title,
  });

  const userId = "selftest-user";
  const first = createEbook(userId, { ...DEFAULT_SETTINGS, topic: "Selftest Unique Topic XYZ", language: "hi" });
  const dup = findRecentDuplicateDraft(userId, "Selftest Unique Topic XYZ");
  checks.push({ name: "Recent draft reuse", ok: Boolean(dup && dup.id === first.id), detail: first.ebookId });

  const updated = updateEbook(first.id, { title: "Updated once" });
  const listed = listEbooks(userId).filter((e) => e.id === first.id);
  checks.push({ name: "Update keeps one ebookId", ok: listed.length === 1 && updated?.ebookId === first.id, detail: updated?.ebookId });
  checks.push({ name: "ebookId equals id", ok: first.ebookId === first.id && getEbook(first.ebookId)?.id === first.id });

  // Language persistence: a Hindi book must report settings.language === "hi"
  // on hydration so the Edit dropdown never shows "Auto".
  const hindiBook = createEbook(userId, { ...DEFAULT_SETTINGS, topic: "Hindi Persistence Topic", language: "hi", outputLanguage: "hi" });
  const reloaded = getEbook(hindiBook.id);
  checks.push({
    name: "Hindi settings.language persists on hydrate",
    ok: reloaded?.settings.language === "hi" && reloaded?.outputLanguage === "hi",
    detail: `settings=${reloaded?.settings.language} out=${reloaded?.outputLanguage}`,
  });

  // User title survives a settings round-trip (must not revert to a derived title).
  const titled = createEbook(userId, { ...DEFAULT_SETTINGS, topic: "Some Topic", language: "hi", customTitle: "अछूत कौन थे" });
  const titledReloaded = getEbook(titled.id);
  checks.push({
    name: "Custom Hindi title preserved",
    ok: titledReloaded?.title === "अछूत कौन थे",
    detail: titledReloaded?.title,
  });
  deleteEbook(titled.id, userId);

  deleteEbook(first.id, userId);
  deleteEbook(hindiBook.id, userId);

  return checks;
}

const isDirect = typeof require !== "undefined" && require.main === module;
if (isDirect) {
  const results = runUpgradeSelftest();
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  if (results.some((r) => !r.ok)) process.exit(1);
}
