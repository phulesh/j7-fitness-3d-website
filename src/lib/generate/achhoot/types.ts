export interface FactInterpretationPair {
  fact: string;
  interpretation: string;
}

export interface AchhootChapterContent {
  title: string;
  introduction: string[];
  background: string[];
  mainQuestion: string;
  detailedAnswer: string[];
  primarySources: string[];
  evidence: string[];
  interpretations: string[];
  ambedkar: string[];
  critique: string[];
  uncertainty: string[];
  factInterpretation: FactInterpretationPair[];
  conclusion: string[];
  keyPoints: string[];
  reviewLead?: string;
}
