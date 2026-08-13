export const LANGUAGES = [
  { code: "auto", name: "Auto Detect Language", native: "Auto" },
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ur", name: "Urdu", native: "اردو" },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "as", name: "Assamese", native: "অসমীয়া" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const EBOOK_TYPES = [
  "Educational Book",
  "School Textbook",
  "College Notes",
  "Competitive Exam Guide",
  "Course Book",
  "Technical Book",
  "Programming Book",
  "Research-Based Book",
  "Biography",
  "History Book",
  "Study Guide",
  "Revision Notes",
  "Question Bank",
  "Complete Beginner Guide",
  "Professional Guide",
] as const;

export type EbookType = (typeof EBOOK_TYPES)[number];

export const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced", "Expert"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const AUDIENCES = [
  "School students",
  "High school / Class 9–12",
  "College / university students",
  "Competitive exam aspirants",
  "Working professionals",
  "Complete beginners",
  "Teachers / educators",
  "Researchers",
  "General readers",
  "Children (ages 8–12)",
] as const;

export const LENGTHS = [
  { id: "short", label: "Short", hint: "~6–10k words", chapters: 6 },
  { id: "medium", label: "Medium", hint: "~12–20k words", chapters: 10 },
  { id: "long", label: "Long", hint: "~25–40k words", chapters: 14 },
  { id: "comprehensive", label: "Comprehensive", hint: "~45k+ words", chapters: 18 },
] as const;

export const STYLES = [
  "Clear academic",
  "Conversational teacher",
  "Exam-oriented concise",
  "Story-driven narrative",
  "Technical reference",
  "Step-by-step tutorial",
] as const;

export const COVER_STYLES = [
  "Minimal",
  "Academic",
  "Modern",
  "Professional",
  "Creative",
  "Technical",
  "Textbook",
  "Historical",
  "Documentary",
  "Illustrated",
  "Photorealistic",
  "3D",
] as const;

export type CoverStyle = (typeof COVER_STYLES)[number];

export type TopicCategory =
  | "academic"
  | "technical"
  | "programming"
  | "historical"
  | "scientific"
  | "medical"
  | "legal"
  | "financial"
  | "professional"
  | "biography"
  | "language"
  | "exam"
  | "school"
  | "general";

export type SourceTier =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9;

export type ClaimKind =
  | "primary-source-evidence"
  | "author-interpretation"
  | "later-scholarly-interpretation"
  | "contested-uncertain";

export type SourceType =
  | "primary"
  | "secondary"
  | "archive"
  | "encyclopedia"
  | "legal"
  | "scholarly"
  | "official"
  | "other";

export type SourceVerificationStatus = "verified" | "needs_review" | "unverified" | "rejected";

export interface SourceRecord {
  id: number;
  title: string;
  organization: string;
  url: string;
  domain: string;
  snippet: string;
  extractedText: string;
  publishedAt?: string;
  retrievedAt: string;
  tier: SourceTier;
  license?: string;
  score: number;
  used: boolean;
  language?: string;
  relevanceScore?: number;
  authorityScore?: number;
  primarySource?: boolean;
  academicSource?: boolean;
  reasonForInclusion?: string;
  author?: string;
  year?: string;
  publisher?: string;
  sourceType?: SourceType;
  identifier?: string;
  relevantChapter?: string;
  claimSupported?: string;
  verificationStatus?: SourceVerificationStatus;
  reliabilityNote?: string;
  publication?: string;
  citation?: string;
  chapterIds?: string[];
  notes?: string;
}

export type ResearchRunStatus = "idle" | "running" | "success" | "error" | "cancelled";

export interface ChapterResearchRecord {
  chapterId: string;
  chapterIndex: number;
  title: string;
  status: "pending" | "running" | "complete" | "failed";
  sourcesFound: number;
  sourceIds: number[];
  notes: string;
  evidenceNotes?: string;
  researchQuestion?: string;
  facts: ExtractedFact[];
}

export interface ResearchRunState {
  status: ResearchRunStatus;
  startedAt?: string;
  finishedAt?: string;
  currentChapter?: number;
  currentChapterTitle?: string;
  percent: number;
  sourcesFound: number;
  message: string;
  detail?: string;
  error?: string;
}

export interface RejectedSource {
  title: string;
  url: string;
  snippet?: string;
  provider?: string;
  relevanceScore: number;
  rejectionReason: string;
}

export interface ResearchQualityReport {
  relevantCount: number;
  rejectedCount: number;
  generationBlocked: boolean;
  contaminationReason?: string;
  approved: {
    id: number;
    title: string;
    url: string;
    organization: string;
    relevanceScore: number;
    authorityScore: number;
    primarySource: boolean;
    academicSource: boolean;
    reasonForInclusion: string;
  }[];
  rejected: RejectedSource[];
}

export interface ExtractedFact {
  id: string;
  text: string;
  sourceIds: number[];
  confidence: "high" | "medium" | "low";
  verifiedBy: number;
  category: "definition" | "date" | "statistic" | "event" | "concept" | "process" | "quote" | "other";
  entities: string[];
  claimKind?: ClaimKind;
}

export interface ChapterSection {
  id: string;
  heading: string;
  html: string;
  sourceIds: number[];
}

export interface QuizItem {
  question: string;
  options?: string[];
  answer: string;
  explanation?: string;
  sourceIds: number[];
}

export type ChapterImageType =
  | "photograph"
  | "portrait"
  | "map"
  | "timeline"
  | "diagram"
  | "infographic"
  | "document"
  | "manuscript"
  | "comparison"
  | "illustration";

export interface ChapterImage {
  id?: string;
  url: string;
  localPath?: string;
  caption: string;
  credit: string;
  alt: string;
  license: string;
  sourceUrl: string;
  imageType?: ChapterImageType;
  verifiedHistoricalPhoto?: boolean;
  chapterIndex?: number;
  figureLabel?: string;
  placement?: "after-intro" | "mid" | "end" | "inline";
}

export interface Chapter {
  id: string;
  index: number;
  title: string;
  subtitle?: string;
  learningObjectives: string[];
  sections: ChapterSection[];
  keyPoints: string[];
  examples: string[];
  commonMistakes: string[];
  summary: string;
  questions: QuizItem[];
  mcqs: QuizItem[];
  images: ChapterImage[];
  sourceIds: number[];
  wordCount: number;
  status: "pending" | "writing" | "complete" | "failed";
  factFlags?: FactFlag[];
}

export type FactDisplayStatus = "Supported" | "Partially supported" | "Contested" | "Unsupported";
export type FactClassification = "FACT" | "INTERPRETATION" | "HYPOTHESIS" | "CONTROVERSY";

export interface FactFlag {
  id: string;
  claim: string;
  status: "verified" | "needs_review" | "unsupported" | "contested" | "partial";
  displayStatus?: FactDisplayStatus;
  classification?: FactClassification;
  confidence?: number;
  evidence?: string;
  source?: string;
  explanation: string;
  sourceIds: number[];
  suggestedFix?: string;
  applied?: boolean;
}

export interface OutlineItem {
  id: string;
  chapterNumber?: number;
  title: string;
  summary: string;
  purpose?: string;
  historicalScope?: string;
  researchQuestion?: string;
  researchQuestions?: string[];
  keyTopics?: string[];
  evidence?: string[];
  importantClaims?: string[];
  claimsToVerify?: string[];
  uncertaintyNotes?: string;
  primarySources?: string[];
  secondarySources?: string[];
  evidenceVsInterpretation?: string;
  sourceIds: number[];
  children?: { title: string; summary: string }[];
}

export interface SyllabusInfo {
  detected: boolean;
  subject?: string;
  classLevel?: string;
  board?: string;
  institution?: string;
  units: { title: string; topics: string[]; objectives: string[] }[];
  sourceTitle?: string;
  sourceUrl?: string;
  lastVerified?: string;
  fromUpload?: boolean;
}

export interface TopicAnalysis {
  topic: string;
  normalizedTitle: string;
  subtitle: string;
  detectedLanguage: string;
  outputLanguage: string;
  category: TopicCategory;
  audienceSuggestion: string;
  needsCurrentInfo: boolean;
  copyrightMode: boolean;
  copyrightNotice?: string;
  sensitiveDomain: "none" | "medical" | "legal" | "financial" | "scientific";
  prioritySourceHints: string[];
  searchQueries: string[];
  wikiLanguage: string;
  summary: string;
  researchQuestions?: string[];
  topicKind?: string;
  workTitle?: string;
  authorName?: string;
  focusTerms?: string[];
  allowBiography?: boolean;
  allowScientificPapers?: boolean;
}

export interface EbookSettings {
  topic: string;
  title?: string;
  customTitle?: string;
  language: string;
  outputLanguage?: string;
  type: EbookType;
  audience: string;
  difficulty: Difficulty;
  chapterCount: number;
  length: "short" | "medium" | "long" | "comprehensive";
  style: string;
  includeExamples: boolean;
  includeExercises: boolean;
  includeMcqs: boolean;
  includeGlossary: boolean;
  includeReferences: boolean;
  includeImages: boolean;
  includeToc: boolean;
  includePageNumbers: boolean;
  includeAuthor: boolean;
  includeCover: boolean;
  authorName: string;
  coverStyle: CoverStyle;
  subtitle?: string;
  researchQuestions?: string[];
  historicalPeriod?: string;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  sourceIds: number[];
}

export interface FaqItem {
  question: string;
  answer: string;
  sourceIds: number[];
}

export type EbookStage =
  | "draft"
  | "settings"
  | "research"
  | "sources"
  | "outline"
  | "writing"
  | "factcheck"
  | "cover"
  | "complete";

export interface EbookDocument {
  id: string;
  ebookId: string;
  userId: string;
  title: string;
  customTitle?: string;
  subtitle: string;
  language: string;
  outputLanguage: string;
  type: EbookType;
  audience: string;
  difficulty: Difficulty;
  status:
    | "draft"
    | "analyzing"
    | "researching"
    | "outlining"
    | "awaiting_outline"
    | "writing"
    | "fact_checking"
    | "exporting"
    | "complete"
    | "failed"
    | "paused";
  settings: EbookSettings;
  analysis?: TopicAnalysis;
  syllabus?: SyllabusInfo;
  researchQuestions?: string[];
  outline: OutlineItem[];
  introduction: string;
  conclusion: string;
  chapters: Chapter[];
  glossary: GlossaryEntry[];
  faqs: FaqItem[];
  sources: SourceRecord[];
  rejectedSources?: RejectedSource[];
  researchQuality?: ResearchQualityReport;
  chapterResearch?: ChapterResearchRecord[];
  researchRun?: ResearchRunState;
  facts: ExtractedFact[];
  cover: {
    style: CoverStyle;
    svg: string;
    pngPath?: string;
  };
  disclaimer?: string;
  wordCount: number;
  chapterCount: number;
  lastCompletedStage?: EbookStage;
  generationRequestId?: string;
  languageCheck?: {
    expected: string;
    passed: boolean;
    regeneratedSections: string[];
    detail?: string;
  };
  progress: {
    step: string;
    percent: number;
    message: string;
    detail?: string;
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isGuest: boolean;
  createdAt: string;
}

export interface GenerationJob {
  id: string;
  ebookId: string;
  userId: string;
  kind?: "research" | "generate" | "factcheck" | "export";
  status: "queued" | "running" | "complete" | "failed" | "paused" | "cancelled";
  step: string;
  percent: number;
  message: string;
  lastChapterIndex: number;
  requestId?: string;
  idempotencyKey?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationRecord {
  id: string;
  ebookId: string;
  userId: string;
  kind: string;
  idempotencyKey: string;
  status: "running" | "complete" | "failed";
  jobId?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SETTINGS: EbookSettings = {
  topic: "",
  language: "auto",
  outputLanguage: "auto",
  type: "Educational Book",
  audience: "General readers",
  difficulty: "Beginner",
  chapterCount: 10,
  length: "medium",
  style: "Clear academic",
  includeExamples: true,
  includeExercises: true,
  includeMcqs: true,
  includeGlossary: true,
  includeReferences: true,
  includeImages: true,
  includeToc: true,
  includePageNumbers: true,
  includeAuthor: true,
  includeCover: true,
  authorName: "",
  coverStyle: "Academic",
  researchQuestions: [],
};

export function displayStatus(status: EbookDocument["status"]): string {
  switch (status) {
    case "draft":
    case "paused":
      return "Draft";
    case "analyzing":
    case "researching":
      return "Researching";
    case "outlining":
    case "awaiting_outline":
      return "Outline Ready";
    case "writing":
    case "fact_checking":
    case "exporting":
      return "Writing";
    case "complete":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}
