import type { Difficulty, EbookDocument, EbookSettings, EbookType } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export const DRAFT_KEY = "folio:create-draft";
export const LAST_BOOK_KEY = "folio:last-book";
export const WIZARD_KEY = "folio:wizard";

export const SIMPLE_LANGUAGES = [
  { id: "hi", label: "Hindi", native: "हिन्दी", code: "hi" },
  { id: "en", label: "English", native: "English", code: "en" },
  { id: "hinglish", label: "Hinglish", native: "Hinglish", code: "hinglish" },
  { id: "other", label: "Other", native: "अन्य", code: "other" },
] as const;

export const SIMPLE_AUDIENCES = [
  {
    id: "general",
    label: "General Readers",
    hint: "सामान्य पाठक",
    audience: "General readers",
    type: "Educational Book" as EbookType,
    difficulty: "Beginner" as Difficulty,
  },
  {
    id: "students",
    label: "Students",
    hint: "विद्यार्थी",
    audience: "College / university students",
    type: "Course Book" as EbookType,
    difficulty: "Intermediate" as Difficulty,
  },
  {
    id: "children",
    label: "Children",
    hint: "बच्चे",
    audience: "Children (ages 8–12)",
    type: "Complete Beginner Guide" as EbookType,
    difficulty: "Beginner" as Difficulty,
  },
  {
    id: "researchers",
    label: "Researchers",
    hint: "शोधकर्ता",
    audience: "Researchers",
    type: "Research-Based Book" as EbookType,
    difficulty: "Advanced" as Difficulty,
  },
  {
    id: "professionals",
    label: "Professionals",
    hint: "पेशेवर",
    audience: "Working professionals",
    type: "Professional Guide" as EbookType,
    difficulty: "Advanced" as Difficulty,
  },
] as const;

export const SIMPLE_SIZES = [
  { id: "short", label: "Short", hint: "5–7 अध्याय", length: "short" as const, chapters: 6 },
  { id: "medium", label: "Medium", hint: "8–12 अध्याय", length: "medium" as const, chapters: 10 },
  { id: "detailed", label: "Detailed", hint: "13–18 अध्याय", length: "long" as const, chapters: 15 },
  { id: "deep", label: "Deep Research", hint: "18–25 अध्याय", length: "comprehensive" as const, chapters: 22 },
] as const;

export const SIMPLE_STYLES = [
  { id: "simple", label: "Simple", hint: "आसान भाषा", style: "Conversational teacher" },
  { id: "academic", label: "Academic", hint: "शैक्षणिक", style: "Clear academic" },
  { id: "story", label: "Storytelling", hint: "कहानी जैसा", style: "Story-driven narrative" },
  { id: "research", label: "Research-based", hint: "शोध आधारित", style: "Clear academic", type: "Research-Based Book" as EbookType },
  { id: "professional", label: "Professional", hint: "पेशेवर", style: "Technical reference" },
] as const;

export const CREATE_STEPS = [
  { id: "understand", label: "Understanding topic", hi: "विषय समझा जा रहा है" },
  { id: "plan", label: "Planning research", hi: "शोध की योजना बन रही है" },
  { id: "find", label: "Finding sources", hi: "स्रोत खोजे जा रहे हैं" },
  { id: "check", label: "Checking sources", hi: "स्रोतों की जाँच हो रही है" },
  { id: "outline", label: "Building outline", hi: "अध्याय-रूपरेखा बन रही है" },
  { id: "write", label: "Writing chapters", hi: "अध्याय लिखे जा रहे हैं" },
  { id: "images", label: "Creating images", hi: "चित्र बनाए जा रहे हैं" },
  { id: "facts", label: "Fact checking", hi: "तथ्यों की जाँच हो रही है" },
  { id: "prep", label: "Preparing book", hi: "किताब तैयार हो रही है" },
] as const;

export type WizardState = {
  topic: string;
  language: string;
  otherLanguage: string;
  audience: string;
  size: string;
  style: string;
  title: string;
  subtitle: string;
  authorName: string;
  includeImages: boolean;
  includeGlossary: boolean;
  includeReferences: boolean;
  includeExamples: boolean;
  includeExercises: boolean;
  includeMcqs: boolean;
  chapterCount?: number;
  targetWords?: number;
  citationStyle: string;
  researchDepth: "standard" | "deep" | "exhaustive";
  difficulty: Difficulty;
  coverStyle: EbookSettings["coverStyle"];
  customInstructions: string;
  syllabusText: string;
  factCheckIntensity: "standard" | "strict";
};

export const DEFAULT_WIZARD: WizardState = {
  topic: "",
  language: "hi",
  otherLanguage: "en",
  audience: "general",
  size: "medium",
  style: "simple",
  title: "",
  subtitle: "",
  authorName: "",
  includeImages: true,
  includeGlossary: true,
  includeReferences: true,
  includeExamples: true,
  includeExercises: false,
  includeMcqs: false,
  citationStyle: "simple",
  researchDepth: "standard",
  difficulty: "Beginner",
  coverStyle: "Academic",
  customInstructions: "",
  syllabusText: "",
  factCheckIntensity: "standard",
};

export function suggestTitle(topic: string, language = "hi"): string {
  const t = topic.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (language === "hi" || /[\u0900-\u097F]/.test(t)) return t;
  if (language === "hinglish") return t;
  return t
    .split(" ")
    .map((w) => (/^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function resolveLanguage(wizard: WizardState): string {
  if (wizard.language === "other") return wizard.otherLanguage || "en";
  return wizard.language || "hi";
}

export function wizardToSettings(wizard: WizardState): EbookSettings {
  const audience = SIMPLE_AUDIENCES.find((a) => a.id === wizard.audience) || SIMPLE_AUDIENCES[0];
  const size = SIMPLE_SIZES.find((s) => s.id === wizard.size) || SIMPLE_SIZES[1];
  const style = SIMPLE_STYLES.find((s) => s.id === wizard.style) || SIMPLE_STYLES[0];
  const language = resolveLanguage(wizard);
  let chapters = wizard.chapterCount || size.chapters;
  if (!wizard.chapterCount) {
    if (wizard.researchDepth === "deep") chapters = Math.max(chapters, 14);
    if (wizard.researchDepth === "exhaustive") chapters = Math.max(chapters, 18);
  }
  chapters = Math.max(5, Math.min(25, chapters));
  let length = size.length;
  if (wizard.targetWords) {
    if (wizard.targetWords < 10000) length = "short";
    else if (wizard.targetWords < 22000) length = "medium";
    else if (wizard.targetWords < 40000) length = "long";
    else length = "comprehensive";
  }
  const title = (wizard.title || suggestTitle(wizard.topic, language)).trim();
  const type = "type" in style && style.type ? style.type : audience.type;
  const researchQuestions = wizard.customInstructions.trim()
    ? wizard.customInstructions
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  return {
    ...DEFAULT_SETTINGS,
    topic: wizard.topic.trim(),
    title,
    customTitle: title,
    subtitle: wizard.subtitle.trim() || undefined,
    language,
    outputLanguage: language,
    type,
    audience: audience.audience,
    difficulty: wizard.difficulty || audience.difficulty,
    chapterCount: chapters,
    length,
    style: language === "hinglish" ? "Hinglish conversational" : style.style,
    includeExamples: wizard.includeExamples,
    includeExercises: wizard.includeExercises,
    includeMcqs: wizard.includeMcqs,
    includeGlossary: wizard.includeGlossary,
    includeReferences: wizard.includeReferences,
    includeImages: wizard.includeImages,
    includeToc: true,
    includePageNumbers: true,
    includeAuthor: Boolean(wizard.authorName.trim()),
    includeCover: true,
    authorName: wizard.authorName.trim(),
    coverStyle: wizard.coverStyle || "Academic",
    researchQuestions,
    customInstructions: wizard.customInstructions.trim() || undefined,
    citationStyle: (wizard.citationStyle as EbookSettings["citationStyle"]) || "simple",
    researchDepth: wizard.researchDepth,
    factCheckIntensity: wizard.factCheckIntensity,
    targetWordCount: wizard.targetWords,
  };
}

export function progressStepIndex(doc: EbookDocument | null | undefined): number {
  if (!doc) return 0;
  const step = doc.progress?.step || doc.status;
  const percent = doc.progress?.percent || 0;
  if (doc.status === "complete") return CREATE_STEPS.length;
  if (step === "fact_checking" || doc.status === "fact_checking") return 7;
  if (step === "writing" || doc.status === "writing") return percent >= 70 ? 6 : 5;
  if (step === "outlining" || step === "awaiting_outline" || doc.status === "outlining" || doc.status === "awaiting_outline")
    return 4;
  if (step === "researching" || doc.status === "researching") return percent >= 25 ? 3 : 2;
  if (step === "analyzing" || doc.status === "analyzing") return percent >= 8 ? 1 : 0;
  if (percent >= 90) return 8;
  if (percent >= 70) return 6;
  if (percent >= 45) return 5;
  if (percent >= 30) return 4;
  if (percent >= 18) return 2;
  return 0;
}

export function isGenerating(doc: EbookDocument | null | undefined): boolean {
  if (!doc) return false;
  return (
    ["analyzing", "researching", "outlining", "writing", "fact_checking", "exporting"].includes(doc.status) ||
    doc.researchRun?.status === "running"
  );
}

export function friendlyStatus(doc: EbookDocument): string {
  if (doc.status === "complete") return "तैयार";
  if (doc.status === "failed") return "रुक गई";
  if (doc.status === "paused" || doc.status === "draft") return "ड्राफ्ट";
  if (isGenerating(doc)) return "बन रही है";
  if (doc.status === "awaiting_outline") return "लगभग तैयार";
  return "जारी";
}

export type LastBook = { id: string; title: string; status: string; updatedAt: string };

export function readLastBook(): LastBook | null {
  try {
    const raw = localStorage.getItem(LAST_BOOK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.id) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeLastBook(doc: { id?: string; ebookId?: string; title?: string; status?: string; updatedAt?: string }) {
  try {
    const id = doc.ebookId || doc.id;
    if (!id) return;
    const payload: LastBook = {
      id,
      title: doc.title || "किताब",
      status: doc.status || "draft",
      updatedAt: doc.updatedAt || new Date().toISOString(),
    };
    localStorage.setItem(LAST_BOOK_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadWizard(): WizardState {
  try {
    const raw = localStorage.getItem(WIZARD_KEY);
    if (raw) return { ...DEFAULT_WIZARD, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_WIZARD };
}

export function saveWizard(state: WizardState) {
  try {
    localStorage.setItem(WIZARD_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function clearWizard() {
  try {
    localStorage.removeItem(WIZARD_KEY);
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function htmlToPlain(html: string): string {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function plainToHtml(text: string): string {
  return (text || "")
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
