import type { Chapter } from "../types";

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function chapterPlain(ch: Chapter): string {
  return [
    ch.title,
    ...ch.learningObjectives,
    ...ch.sections.map((s) => s.heading + " " + s.html.replace(/<[^>]+>/g, " ")),
    ...ch.keyPoints,
    ch.summary,
    ...ch.questions.flatMap((question) => [question.question, question.answer, question.explanation || ""]),
    ...ch.mcqs.flatMap((question) => [question.question, question.answer, question.explanation || ""]),
  ].join(" ");
}

export function countWords(s: string) {
  return (s.trim().match(/[\p{L}\p{M}\p{N}]+/gu) || []).length;
}

export function labelsFor(lang: string) {
  if (lang === "hi") {
    return {
      overview: "परिचय",
      explanation: "व्याख्या",
      subtopics: "उपविषय",
      practice: "अभ्यास",
      objectives: "अधिगम उद्देश्य",
      keyPoints: "मुख्य बिंदु",
      examples: "उदाहरण",
      mistakes: "सामान्य भूलें",
      summary: "सारांश",
      questions: "प्रश्न",
      mcqs: "बहुविकल्पीय प्रश्न",
      answers: "उत्तर",
      references: "संदर्भ",
      glossary: "शब्दावली",
      faq: "अक्सर पूछे जाने वाले प्रश्न",
      conclusion: "निष्कर्ष",
      introduction: "भूमिका",
      toc: "विषय सूची",
      sources: "स्रोत",
      unverified: "स्वतंत्र रूप से सत्यापित नहीं किया जा सका",
      chapter: "अध्याय",
    };
  }
  return {
    overview: "Overview",
    explanation: "Explanation",
    subtopics: "Related subtopics",
    practice: "Practice note",
    objectives: "Learning objectives",
    keyPoints: "Key points",
    examples: "Examples",
    mistakes: "Common mistakes",
    summary: "Chapter summary",
    questions: "Review questions",
    mcqs: "Multiple-choice questions",
    answers: "Answers",
    references: "References",
    glossary: "Glossary",
    faq: "Frequently asked questions",
    conclusion: "Conclusion",
    introduction: "Introduction",
    toc: "Table of contents",
    sources: "Sources",
    unverified: "Information could not be independently verified",
    chapter: "Chapter",
  };
}
