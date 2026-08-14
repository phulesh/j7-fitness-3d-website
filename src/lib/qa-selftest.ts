/**
 * Unit self-test for the central Q&A/MCQ validators, cross-script matching,
 * and the publishing gate. Run: npm run test:qa
 */
import { validateQuestionAnswer, validateMcq, ensureChapterQA, buildQuestionsFromEvidence, buildMcqsFromEvidence } from "./generate/qa";
import { validateBookForPublishing } from "./generate/publish-gate";
import { textHasTerm, termsInText, foldDevanagari, termVariants } from "./research/translit";
import type { Chapter, EbookDocument, QuizItem } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { nanoid } from "nanoid";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// ---- validateQuestionAnswer ----
check("rejects empty answer", !validateQuestionAnswer("What is Vedanta?", "").valid);
check("rejects TODO", !validateQuestionAnswer("What is Vedanta?", "TODO write the answer later with more research").valid);
check("rejects [insert answer]", !validateQuestionAnswer("What is Vedanta?", "[insert answer] to be completed by the editor later on").valid);
check("rejects 'उत्तर: ...' stub", !validateQuestionAnswer("ब्रह्म क्या है?", "उत्तर: ...").valid);
check("rejects deferred Hindi placeholder", !validateQuestionAnswer("यह तथ्य है या व्याख्या?", "उत्तर स्रोत के प्रकार और लेखक के अनुमान पर निर्भर करता है।").valid);
check("rejects question repetition", !validateQuestionAnswer("What is the meaning of Vedanta?", "What is the meaning of Vedanta").valid);
check(
  "rejects unrelated answer",
  !validateQuestionAnswer("अद्वैत वेदांत में ब्रह्म और आत्मा का संबंध क्या है?", "क्रिकेट एक लोकप्रिय खेल है जो भारत में बहुत खेला जाता है और इसके नियम सरल हैं। यह बल्ले और गेंद से खेला जाता है।").valid
);
check(
  "accepts complete Hindi answer",
  validateQuestionAnswer(
    "अद्वैत वेदांत में ब्रह्म और आत्मा का संबंध क्या माना जाता है?",
    "अद्वैत वेदांत में आदि शंकराचार्य की व्याख्या के अनुसार अंतिम वास्तविकता ब्रह्म है और आत्मा का वास्तविक स्वरूप उसी ब्रह्म से अभिन्न माना जाता है। अज्ञान के कारण व्यक्ति अपने वास्तविक स्वरूप को सीमित पहचान से जोड़ता है। ज्ञान के माध्यम से इस अज्ञान का निवारण मोक्ष की दिशा में ले जाता है।"
  ).valid
);

// ---- validateMcq ----
const goodMcq: QuizItem = {
  question: "अद्वैत वेदांत के प्रमुख आचार्य कौन माने जाते हैं?",
  options: ["रामानुजाचार्य", "मध्वाचार्य", "शंकराचार्य", "वल्लभाचार्य"],
  answer: "शंकराचार्य",
  explanation: "शंकराचार्य अद्वैत वेदांत की प्रमुख दार्शनिक व्याख्या के लिए प्रसिद्ध हैं।",
  sourceIds: [],
};
check("accepts valid MCQ", validateMcq(goodMcq).valid);
check("rejects 3-option MCQ", !validateMcq({ ...goodMcq, options: goodMcq.options!.slice(0, 3) }).valid);
check("rejects MCQ whose answer matches no option", !validateMcq({ ...goodMcq, answer: "निंबार्क" }).valid);
check("rejects MCQ without explanation", !validateMcq({ ...goodMcq, explanation: "" }).valid);
check("accepts letter answers (C)", validateMcq({ ...goodMcq, answer: "C" }).valid);
check("rejects duplicate options", !validateMcq({ ...goodMcq, options: ["A", "A", "B", "C"] }).valid);

// ---- cross-script matching ----
check("वेदान्त folds to वेदांत", foldDevanagari("वेदान्त") === "वेदांत");
check("Vedanta matches वेदांत", textHasTerm("Vedanta is one of six schools", "वेदांत"));
check("Vedānta matches वेदांत", textHasTerm("Vedānta philosophy", "वेदांत"));
check("Śaṅkarācārya matches शंकराचार्य", textHasTerm("Ādi Śaṅkarācārya's commentaries", "शंकराचार्य"));
check("Shankaracharya matches शंकराचार्य", textHasTerm("Adi Shankaracharya of Kaladi", "शंकराचार्य"));
check("देवनागरी text matches Latin term", textHasTerm("आदि शंकराचार्य ने भाष्य लिखे", "shankaracharya"));
check("no false positive on unrelated", !textHasTerm("The quick brown fox jumps", "वेदांत"));
check("termsInText counts cross-script", termsInText("Ramanuja and Madhvacharya debated Vedanta", ["रामानुज", "मध्व", "वेदांत"]).length === 3, JSON.stringify(termVariants("रामानुज")));

// ---- ensureChapterQA repairs only failing pieces ----
function mkChapter(): Chapter {
  return {
    id: nanoid(8),
    index: 0,
    title: "वेदांत दर्शन की केंद्रीय अवधारणाएँ",
    learningObjectives: [],
    sections: [
      {
        id: nanoid(8),
        heading: "मुख्य चर्चा",
        html: "<p>वेदांत दर्शन में ब्रह्म को परम सत्ता माना गया है और आत्मा के स्वरूप की विवेचना की गई है। उपनिषदों में ब्रह्म और आत्मा के संबंध पर अनेक संवाद मिलते हैं। अद्वैत परंपरा में शंकराचार्य ने ब्रह्म और आत्मा की अभिन्नता का प्रतिपादन किया, जबकि रामानुजाचार्य ने विशिष्टाद्वैत और मध्वाचार्य ने द्वैत मत की स्थापना की। मोक्ष की अवधारणा सभी शाखाओं में केंद्रीय है, परंतु उसके साधन पर मतभेद है। ज्ञान, भक्ति और कर्म तीनों मार्गों की चर्चा वेदांत की परंपराओं में होती है।</p>",
        sourceIds: [1],
      },
    ],
    keyPoints: ["ब्रह्म परम सत्ता है"],
    examples: [],
    commonMistakes: [],
    summary: "वेदांत की केंद्रीय अवधारणाओं का सार।",
    questions: [
      { question: "वेदांत में ब्रह्म की अवधारणा क्या है?", answer: "उत्तर: ...", sourceIds: [] }, // broken
      {
        question: "मोक्ष के साधनों पर शाखाओं में क्या मतभेद है?",
        answer:
          "वेदांत की शाखाओं में मोक्ष के साधन को लेकर स्पष्ट मतभेद है: अद्वैत परंपरा में शंकराचार्य ज्ञान को ही मुक्ति का साधन मानते हैं, विशिष्टाद्वैत में रामानुजाचार्य भक्ति और शरणागति को प्रमुख मानते हैं, और द्वैत मत में मध्वाचार्य ईश्वर-कृपा को निर्णायक मानते हैं। तीनों शाखाएँ मोक्ष को परम लक्ष्य मानती हैं।",
        sourceIds: [],
      }, // good
    ],
    mcqs: [
      { question: "ब्रह्म क्या है?", options: ["सत्ता", "सत्ता"], answer: "??", sourceIds: [] }, // malformed
    ],
    images: [],
    sourceIds: [1],
    wordCount: 0,
    status: "complete",
  };
}
const ch = mkChapter();
const goodAnswerBefore = ch.questions[1].answer;
const res = ensureChapterQA(ch, { lang: "hi", sources: [], includeExercises: true, includeMcqs: true });
check("repaired the broken answer only", ch.questions[1].answer === goodAnswerBefore && validateQuestionAnswer(ch.questions[0].question, ch.questions[0].answer).valid, `repaired=${res.repairedAnswers}`);
check("topped questions up to >= 5", ch.questions.length >= 5, String(ch.questions.length));
check("all answers valid after repair", ch.questions.every((q) => validateQuestionAnswer(q.question, q.answer).valid));
check("malformed MCQ replaced with valid ones", ch.mcqs.length >= 2 && ch.mcqs.every((m) => validateMcq(m).valid), String(ch.mcqs.length));

// ---- evidence builders ----
const ctx = {
  lang: "hi",
  chapterTitle: ch.title,
  paragraphs: ch.sections.map((s) => s.html.replace(/<[^>]+>/g, " ").trim()),
  sources: [],
  sourceIds: [1],
};
const builtQ = buildQuestionsFromEvidence(ctx, 6);
check("evidence questions have complete answers", builtQ.length >= 5 && builtQ.every((q) => validateQuestionAnswer(q.question, q.answer).valid));
const builtM = buildMcqsFromEvidence(ctx, 4);
check("evidence MCQs are well-formed", builtM.length >= 2 && builtM.every((m) => validateMcq(m).valid));

// ---- publishing gate ----
function mkDoc(overrides: Partial<EbookDocument>): EbookDocument {
  const base: any = {
    id: "gate-test",
    ebookId: "gate-test",
    userId: "t",
    title: "Test",
    subtitle: "",
    language: "hi",
    outputLanguage: "hi",
    type: "Educational Book",
    settings: { ...DEFAULT_SETTINGS, chapterCount: 1, length: "short", includeImages: false },
    outline: [{ id: "o1", title: ch.title, summary: "", sourceIds: [] }],
    chapters: [ch],
    introduction: "परिचय ".repeat(30),
    conclusion: "निष्कर्ष ".repeat(30),
    faqs: [],
    glossary: [{ term: "ब्रह्म", definition: "परम सत्ता", sourceIds: [] }],
    sources: [
      { id: 1, title: "Vedanta", organization: "Wikipedia", url: "https://en.wikipedia.org/wiki/Vedanta", domain: "wikipedia.org", snippet: "", extractedText: "x".repeat(300), retrievedAt: "", tier: 7, score: 90, used: true },
    ],
    facts: [],
    cover: { style: "Academic", svg: "<svg/>" },
    wordCount: 0,
    chapterCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "complete",
    progress: { step: "complete", percent: 100, message: "" },
  };
  return { ...base, ...overrides } as EbookDocument;
}
// pad the chapter so it beats the short minimum
ch.sections.push({
  id: nanoid(8),
  heading: "विस्तार",
  html: `<p>${"वेदांत परंपरा की विस्तृत चर्चा और स्रोत-विवेचन। ".repeat(40)}</p>`,
  sourceIds: [1],
});
const okDoc = mkDoc({});
const okGate = validateBookForPublishing(okDoc);
check("gate passes a complete book", okGate.valid, okGate.errors.slice(0, 3).join("; "));
check("gate stats words > 0", okGate.stats.words > 0, String(okGate.stats.words));

const emptyChapter: Chapter = { ...mkChapter(), sections: [], questions: [], mcqs: [], title: "खाली" };
const badDoc = mkDoc({ chapters: [emptyChapter], outline: [{ id: "o1", title: "खाली", summary: "", sourceIds: [] } as any] });
const badGate = validateBookForPublishing(badDoc);
check("gate fails an empty book", !badGate.valid, badGate.errors.slice(0, 2).join("; "));
check("gate reports 0-word chapter", badGate.errors.some((e) => /no sections|0 words/i.test(e)));

const noSources = mkDoc({ sources: [] });
check("gate fails without sources", !validateBookForPublishing(noSources).valid);

console.log(failures ? `\n${failures} FAILURES` : "\nALL PASS");
process.exit(failures ? 1 : 0);
