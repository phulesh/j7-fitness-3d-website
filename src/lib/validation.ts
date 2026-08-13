import { z } from "zod";
import { EBOOK_TYPES, DIFFICULTIES, COVER_STYLES, AUDIENCES, STYLES } from "./types";

export const settingsSchema = z.object({
  topic: z.string().trim().min(3).max(400),
  title: z.string().trim().max(200).optional(),
  customTitle: z.string().trim().max(200).optional(),
  language: z.string().min(2).max(32).default("auto"),
  outputLanguage: z.string().min(2).max(32).optional(),
  type: z.enum(EBOOK_TYPES).default("Educational Book"),
  audience: z.string().min(2).max(80).default("General readers"),
  difficulty: z.enum(DIFFICULTIES).default("Beginner"),
  chapterCount: z.number().int().min(5).max(25).default(10),
  length: z.enum(["short", "medium", "long", "comprehensive"]).default("medium"),
  style: z.string().max(80).default("Clear academic"),
  includeExamples: z.boolean().default(true),
  includeExercises: z.boolean().default(true),
  includeMcqs: z.boolean().default(true),
  includeGlossary: z.boolean().default(true),
  includeReferences: z.boolean().default(true),
  includeImages: z.boolean().default(true),
  includeToc: z.boolean().default(true),
  includePageNumbers: z.boolean().default(true),
  includeAuthor: z.boolean().default(true),
  includeCover: z.boolean().default(true),
  authorName: z.string().max(80).default(""),
  coverStyle: z.enum(COVER_STYLES).default("Academic"),
  subtitle: z.string().max(240).optional(),
  researchQuestions: z.array(z.string().max(400)).optional(),
  customInstructions: z.string().max(4000).optional(),
  citationStyle: z.enum(["simple", "apa", "mla", "chicago"]).optional(),
  researchDepth: z.enum(["standard", "deep", "exhaustive"]).optional(),
  factCheckIntensity: z.enum(["standard", "strict"]).optional(),
  targetWordCount: z.number().int().min(1000).max(200000).optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(100),
});

export const outlineSchema = z.array(
  z.object({
    id: z.string(),
    chapterNumber: z.number().int().min(1).max(40).optional(),
    title: z.string().min(1).max(200),
    summary: z.string().max(4000).default(""),
    purpose: z.string().max(2000).optional(),
    historicalScope: z.string().max(2000).optional(),
    researchQuestion: z.string().max(800).optional(),
    researchQuestions: z.array(z.string().max(400)).optional(),
    keyTopics: z.array(z.string().max(200)).optional(),
    evidence: z.array(z.string().max(800)).optional(),
    importantClaims: z.array(z.string().max(800)).optional(),
    claimsToVerify: z.array(z.string().max(800)).optional(),
    uncertaintyNotes: z.string().max(2000).optional(),
    primarySources: z.array(z.string().max(400)).optional(),
    secondarySources: z.array(z.string().max(400)).optional(),
    evidenceVsInterpretation: z.string().max(4000).optional(),
    sourceIds: z.array(z.number()).optional(),
    children: z
      .array(z.object({ title: z.string(), summary: z.string().optional().default("") }))
      .optional(),
  })
);

export { AUDIENCES, STYLES };
