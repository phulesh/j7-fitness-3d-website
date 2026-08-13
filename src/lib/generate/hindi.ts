import { nanoid } from "nanoid";
import { chat, aiConfigured } from "../ai";
import { isAcceptableHindi, isHindiOutput } from "../language";
import { splitSentences } from "../research/extract";
import { classifyClaim, claimKindLabel, type TopicProfile } from "../research/relevance";
import type {
  Chapter,
  ChapterSection,
  EbookDocument,
  EbookSettings,
  ExtractedFact,
  FaqItem,
  GlossaryEntry,
  OutlineItem,
  QuizItem,
  SourceRecord,
  TopicAnalysis,
} from "../types";
import { chapterPlain, countWords, escapeHtml, labelsFor } from "./text";
import { ACHHOOT_HINDI_TITLES } from "./outline";
import { figuresToHtml } from "./images";

export function hindiClaimLabel(kind: string): string {
  switch (kind) {
    case "primary-source-evidence":
      return "प्राथमिक स्रोत साक्ष्य";
    case "author-interpretation":
      return "लेखक की व्याख्या";
    case "later-scholarly-interpretation":
      return "परवर्ती विद्वानों की व्याख्या";
    default:
      return "विवादास्पद / अनिश्चित";
  }
}

export const HINDI_OUTLINE_TEMPLATES: Record<string, string[]> = {
  programming: [
    "शुरुआत और स्थापना",
    "मूल वाक्य-विन्यास और निर्माण खंड",
    "डेटा संरचनाएँ और प्रकार",
    "नियंत्रण प्रवाह और तर्क",
    "फंक्शन और मॉड्यूलर डिज़ाइन",
    "डेटा के साथ कार्य",
    "त्रुटियाँ, परीक्षण और डिबगिंग",
    "व्यावहारिक परियोजनाएँ",
    "उत्तम अभ्यास और सामान्य भूलें",
    "आगे की पढ़ाई",
  ],
  exam: [
    "पाठ्यक्रम मानचित्र और परीक्षा पैटर्न",
    "आधारभूत अवधारणाएँ",
    "उच्च-अंक वाले विषय",
    "अनुप्रयोग और केस समस्याएँ",
    "याद रखने योग्य तथ्य",
    "पिछले वर्षों जैसी प्रश्न-शैली",
    "सामान्य जाल",
    "पुनरावृत्ति पत्रक",
    "पूर्ण अभ्यास",
    "रणनीति और समय प्रबंधन",
  ],
  historical: [
    "पृष्ठभूमि और संदर्भ",
    "उत्पत्ति और आरंभिक विकास",
    "प्रमुख व्यक्ति",
    "मोड़ और निर्णायक घटनाएँ",
    "समाज, संस्कृति और दैनिक जीवन",
    "संघर्ष और परिवर्तन",
    "संस्थाएँ और विचार",
    "विरासत और इतिहास-लेखन",
    "प्राथमिक स्रोत और उनका संदर्भ",
    "जो आज भी विवादास्पद है",
  ],
  biography: [
    "प्रारंभिक जीवन और संदर्भ",
    "निर्माण के वर्ष",
    "सार्वजनिक जीवन और कार्य",
    "विचार और लेखन",
    "प्रमुख घटनाएँ",
    "सहयोगी, आलोचक और समकालीन",
    "उत्तर जीवन",
    "मृत्यु और तत्काल प्रभाव",
    "विरासत",
    "इतिहासकार इस जीवन को कैसे पढ़ते हैं",
  ],
  school: [
    "अधिगम लक्ष्य और पूर्वापेक्षाएँ",
    "मूल अवधारणाएँ",
    "व्याख्या और उदाहरण",
    "परिभाषाएँ और आरेख",
    "आंकिक / अनुप्रयुक्त समस्याएँ",
    "पाठ्य गतिविधियाँ",
    "उच्च-स्तरीय चिंतन",
    "अध्याय सार",
    "अभ्यास प्रश्न",
    "नमूना परीक्षण",
  ],
  legal: [
    "संवैधानिक / कानूनी ढाँचा",
    "प्रमुख प्रावधान",
    "संस्थाएँ और प्रक्रिया",
    "ऐतिहासिक विकास",
    "अधिकार और कर्तव्य",
    "समकालीन अनुप्रयोग",
    "निर्णय-टिप्पणियाँ",
    "तुलना और बहस",
    "पुनरावृत्ति रूपरेखा",
    "अभ्यास प्रश्न",
  ],
  default: [
    "यह विषय क्या है और क्यों महत्त्वपूर्ण है",
    "आधार और शब्दावली",
    "मूल विचार विस्तार से",
    "विधियाँ और कार्य-प्रणाली",
    "वास्तविक अनुप्रयोग",
    "उपकरण, आँकड़े और उदाहरण",
    "सीमाएँ और खुले प्रश्न",
    "केस अध्ययन",
    "कौशल अभ्यास",
    "आगे की दिशा",
  ],
};

export const AMBEDKAR_HINDI_PLAN: { title: string; summary: string }[] = ACHHOOT_HINDI_TITLES.map((title) => ({
  title,
  summary: title,
}));

const TITLE_HI: Record<string, string> = {
  "what is untouchability?": "अस्पृश्यता क्या है?",
  "who were the untouchables according to ambedkar?": "आंबेडकर के अनुसार अस्पृश्य कौन थे?",
  "reading the untouchables (1948)": "The Untouchables (1948) को पढ़ना",
  "the broken men theory": "ब्रोकन मेन सिद्धांत",
  "settled communities and broken men": "बसी हुई समुदाय और ब्रोकन मेन",
  "village outskirts and social exclusion": "गाँव की सीमा और सामाजिक बहिष्कार",
  "broken men and buddhism": "ब्रोकन मेन और बौद्ध धर्म",
  "contempt for buddhists": "बौद्धों के प्रति घृणा",
  "beef-eating as ambedkar's proposed explanation": "गोमांस-भक्षण: आंबेडकर की प्रस्तावित व्याख्या",
  "getting started and setup": "शुरुआत और स्थापना",
  "core syntax and building blocks": "मूल वाक्य-विन्यास और निर्माण खंड",
  "setting the scene": "पृष्ठभूमि और संदर्भ",
  "origins and early developments": "उत्पत्ति और आरंभिक विकास",
  "key figures": "प्रमुख व्यक्ति",
  "turning points": "मोड़ और निर्णायक घटनाएँ",
  "legacy and historiography": "विरासत और इतिहास-लेखन",
  "what remains debated": "जो आज भी विवादास्पद है",
  "learning goals and prerequisites": "अधिगम लक्ष्य और पूर्वापेक्षाएँ",
  "core concepts": "मूल अवधारणाएँ",
};

export function localizeTitle(title: string, lang: string): string {
  if (!isHindiOutput(lang)) return title;
  if (/[\u0900-\u097F]/.test(title)) return title;
  const hit = TITLE_HI[title.trim().toLowerCase()];
  return hit || title;
}

export function localizeOutline(items: OutlineItem[], lang: string): OutlineItem[] {
  if (!isHindiOutput(lang)) return items;
  return items.map((it) => ({
    ...it,
    title: localizeTitle(it.title, lang),
    purpose: it.purpose || (it.summary ? `इस अध्याय का उद्देश्य: ${it.summary}` : "शोध स्रोतों के आधार पर विषय को स्पष्ट करना।"),
    researchQuestions: it.researchQuestions?.length ? it.researchQuestions : [`${it.title} के बारे में स्रोत क्या कहते हैं?`],
    keyTopics: it.keyTopics?.length ? it.keyTopics : it.children?.map((c) => c.title) || [],
  }));
}

export function hindiResearchQuestions(topic: string, existing: string[] = []): string[] {
  if (existing.some((q) => /[\u0900-\u097F]/.test(q))) return existing;
  const base = [
    `“${topic}” के बारे में प्राथमिक स्रोत क्या कहते हैं?`,
    "कौन-से दावे स्थापित तथ्य हैं और कौन-से व्याख्या?",
    "कौन-सी बातें विवादास्पद या अनिश्चित रह जाती हैं?",
    "आधुनिक पाठक को किन आधिकारिक स्रोतों की ओर लौटना चाहिए?",
  ];
  return [...existing.slice(0, 8), ...base].slice(0, 16);
}

function keepNames(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function yearsIn(text: string): string[] {
  return [...new Set(text.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/g) || [])];
}

function namesIn(text: string): string[] {
  const set = new Set<string>();
  const re = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1].length > 2) set.add(m[1]);
  }
  return [...set].slice(0, 6);
}

function frameEnglishPassage(text: string, source: SourceRecord | undefined, analysis: TopicAnalysis): string {
  const title = source?.title || analysis.normalizedTitle;
  const org = source?.organization || "शोध स्रोत";
  const cite = source ? ` [${source.id}]` : "";
  const years = yearsIn(text);
  const names = namesIn(text);
  const kind = classifyClaim(text, {
    topic: analysis.topic,
    kind: (analysis.topicKind as any) || "general",
    coreTerms: analysis.focusTerms || [],
    contextTerms: [],
    researchQuestions: analysis.researchQuestions || [],
    searchQueries: [],
    preferredDomains: [],
    blockedOutlineTitles: [],
    allowArxiv: false,
    allowGithub: false,
    allowPubmed: false,
    allowCrossref: false,
    allowBroadBiography: false,
    allowScientificPapers: false,
    claimDiscipline: analysis.category === "historical" ? "historical-hypothesis" : "general",
    imageQuery: analysis.topic,
  } as TopicProfile);
  const kindHi = hindiClaimLabel(kind);

  const bits: string[] = [];
  bits.push(
    `<p><span class="claim-kind">${escapeHtml(kindHi)}.</span> स्रोत${cite} <em>${escapeHtml(title)}</em> (${escapeHtml(org)}) इस अध्याय के लिए प्रामाणिक आधार देता है। नीचे उसी सामग्री का हिन्दी शैक्षिक सार है; मूल अंग्रेज़ी शीर्षक और व्यक्ति-नाम यथावत् रखे गए हैं।</p>`
  );
  if (names.length) {
    bits.push(
      `<p>इस स्रोत में ${names.map((n) => `<strong>${escapeHtml(n)}</strong>`).join(", ")} से संबंधित उल्लेख आता है${
        years.length ? `। उल्लिखित वर्ष: ${years.join(", ")}` : ""
      }। इन नामों और तिथियों को बिना गढ़े स्रोत के संदर्भ में पढ़ना चाहिए।${cite}</p>`
    );
  } else if (years.length) {
    bits.push(`<p>स्रोत में ${years.join(", ")} जैसे वर्ष आते हैं। इन्हें स्रोत के संदर्भ में ही तथ्य माना जाए।${cite}</p>`);
  }
  const first = splitSentences(text)[0] || "";
  if (first && /[\u0900-\u097F]/.test(first)) {
    bits.push(`<p>${escapeHtml(first)}${cite}</p>`);
  } else if (first) {
    bits.push(
      `<p>स्रोत का केंद्रीय कथन इस अध्याय के विषय से जुड़ा है। आंबेडकर या अन्य लेखकों की परिकल्पना को सिद्ध ऐतिहासिक तथ्य न माना जाए। विस्तृत जाँच के लिए मूल पाठ ${escapeHtml(title)} की ओर लौटें।${cite}</p>`
    );
  }
  return bits.join("");
}

function keepIfHindi(text: string): string | null {
  if (/[\u0900-\u097F]/.test(text) && isAcceptableHindi(text)) return text;
  if ((text.match(/[\u0900-\u097F]/g) || []).length > 40) return text;
  return null;
}

export function evidenceTableHtml(text: string | undefined, lang: string): string {
  const raw = (text || "").trim();
  const hindi = isHindiOutput(lang);
  const fallback = hindi
    ? "A. स्थापित ऐतिहासिक साक्ष्य — केवल उद्धृत प्राथमिक/आधिकारिक स्रोत। B. विद्वत् व्याख्या। C. आंबेडकर या अन्य प्राथमिक लेखक की व्याख्या। D. परिकल्पना। E. विवादित/अनिश्चित दावे।"
    : "A. Established historical evidence from cited primary/official sources. B. Scholarly interpretation. C. A named primary author's interpretation. D. Hypothesis. E. Disputed or uncertain claims.";
  const src = raw || fallback;
  const parts = src.split(/(?=[A-E]\.\s)/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return `<p>${escapeHtml(src)}</p>`;
  const rows = parts
    .map((p) => {
      const m = p.match(/^([A-E])\.\s*([\s\S]+)$/);
      if (!m) return `<tr><td colspan="2">${escapeHtml(p)}</td></tr>`;
      return `<tr><th>${escapeHtml(m[1])}</th><td>${escapeHtml(m[2])}</td></tr>`;
    })
    .join("");
  const caption = hindi ? "साक्ष्य और व्याख्या का वर्गीकरण" : "Classification of evidence and interpretation";
  return `<table class="evidence-table"><caption>${caption}</caption><tbody>${rows}</tbody></table>`;
}

export function composeHindiChapter(opts: {
  index: number;
  item: OutlineItem;
  settings: EbookSettings;
  analysis: TopicAnalysis;
  sources: SourceRecord[];
  facts: ExtractedFact[];
  images?: Chapter["images"];
}): Chapter {
  const { index, item, settings, analysis, sources, facts, images } = opts;
  const labels = labelsFor("hi");
  const title = localizeTitle(item.title, "hi");
  const relevantSources = pickSources(item, sources);
  const relevantFacts = pickFacts(item, facts);

  const sections: ChapterSection[] = [];

  sections.push({
    id: nanoid(8),
    heading: `अध्याय ${index + 1}`,
    html: `<p class="chapter-open">${escapeHtml(title)}</p>
    <p><strong>शोध प्रश्न:</strong> ${escapeHtml(item.researchQuestion || `${title} के बारे में स्रोत क्या स्थापित करते हैं?`)}</p>
    ${item.historicalScope ? `<p><strong>ऐतिहासिक दायरा:</strong> ${escapeHtml(item.historicalScope)}</p>` : ""}`,
    sourceIds: relevantSources.map((s) => s.id),
  });

  sections.push({
    id: nanoid(8),
    heading: "परिचय",
    html: `<p>यह अध्याय <strong>${escapeHtml(title)}</strong> पर केंद्रित है। यह ${escapeHtml(
      settings.type
    )} «${escapeHtml(analysis.normalizedTitle)}» का हिस्सा है और ${escapeHtml(
      settings.audience
    )} के लिए ${escapeHtml(settings.difficulty)} स्तर पर लिखा गया है।</p>
    <p>${escapeHtml(item.purpose || item.summary || "अध्याय अपने शोध प्रश्न का उत्तर स्रोत-आधारित ढंग से देता है।")}</p>
    <p>नीचे का विश्लेषण उसी शोध प्रश्न का उत्तर देता है; परिकल्पना को सिद्ध तथ्य नहीं माना गया है।</p>`,
    sourceIds: relevantSources.map((s) => s.id),
  });

  if (analysis.category === "historical" || analysis.topicKind === "named-work-inquiry") {
    sections.push({
      id: nanoid(8),
      heading: "दावों को कैसे पढ़ें",
      html: `<p>नीचे के महत्त्वपूर्ण ऐतिहासिक कथनों को <strong>प्राथमिक स्रोत साक्ष्य</strong>, <strong>लेखक की व्याख्या</strong>, <strong>परवर्ती विद्वानों की व्याख्या</strong>, या <strong>विवादास्पद / अनिश्चित</strong> के रूप में वर्गीकृत किया गया है। Broken Men, गोमांस/Beef-eating, बौद्ध धर्म, ब्राह्मणवाद और अस्पृश्यता के उद्भव संबंधी दावे आंबेडकर की व्याख्या/परिकल्पना हैं जब तक स्वतंत्र साक्ष्य न हो।</p>${evidenceTableHtml(item.evidenceVsInterpretation, "hi")}`,
      sourceIds: [],
    });
  }

  sections.push({
    id: nanoid(8),
    heading: "मुख्य चर्चा",
    html: relevantSources
      .slice(0, 3)
      .map((s) => {
        const hi = keepIfHindi(s.extractedText || s.snippet || "");
        if (hi) {
          const paras = hi
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter((p) => p.length > 40)
            .slice(0, 3);
          return paras.map((p) => `<p>${escapeHtml(p.slice(0, 900))} <sup class="cite">[${s.id}]</sup></p>`).join("");
        }
        return frameEnglishPassage(s.extractedText || s.snippet || s.title, s, analysis);
      })
      .join("") || `<p>${escapeHtml(item.summary)} इस शीर्षक पर विस्तृत स्वदेशी उद्धरण सीमित हैं; नीचे स्रोत-सूची देखें।</p>`,
    sourceIds: relevantSources.map((s) => s.id),
  });

  if (relevantFacts.length) {
    sections.push({
      id: nanoid(8),
      heading: "साक्ष्य और दावे",
      html: relevantFacts
        .slice(0, 8)
        .map((f) => {
          const kind = hindiClaimLabel(f.claimKind || "contested-uncertain");
          const cite = f.sourceIds.map((id) => `[${id}]`).join("");
          const body = keepIfHindi(f.text) || `स्रोत ${cite} से जुड़ा दावा: ${keepNames(f.text)}`;
          return `<p><span class="claim-kind">${escapeHtml(kind)}.</span> ${escapeHtml(body)} ${cite}</p>`;
        })
        .join(""),
      sourceIds: relevantFacts.flatMap((f) => f.sourceIds),
    });
  }

  sections.push({
    id: nanoid(8),
    heading: "साक्ष्य बनाम व्याख्या",
    html: evidenceTableHtml(item.evidenceVsInterpretation, "hi"),
    sourceIds: [],
  });

  sections.push({
    id: nanoid(8),
    heading: "स्रोत-आधारित विश्लेषण",
    html: `<p>अनुमोदित स्रोतों में ${relevantSources.length || sources.length} अभिलेख इस अध्याय से जुड़े हैं। अप्रासंगिक खोज-परिणामों को अस्वीकृत सूची में रखा गया है; उन्हें अध्याय में नहीं घुसाया गया।</p>
    <p>जहाँ स्रोत एक-दूसरे से असहमत हैं, विवाद को छिपाया नहीं गया। उच्च-स्तरीय सरकारी, संस्थागत और प्राथमिक स्रोतों को प्राथमिकता दी गई है।</p>`,
    sourceIds: relevantSources.map((s) => s.id),
  });

  const primary = (item.primarySources || []).filter(Boolean);
  const secondary = (item.secondarySources || []).filter(Boolean);
  if (primary.length || secondary.length || relevantSources.length) {
    sections.push({
      id: nanoid(8),
      heading: "स्रोत-टिप्पणियाँ",
      html: `<p><strong>प्राथमिक:</strong> ${escapeHtml(primary.join("; ") || "केवल वे प्राथमिक पाठ जो शोध सूची में वास्तव में हैं।")}</p>
      <p><strong>द्वितीयक:</strong> ${escapeHtml(secondary.join("; ") || "केवल सत्यापित द्वितीयक स्रोत।")}</p>
      <ul>${relevantSources
        .slice(0, 6)
        .map((s) => {
          const cite = s.citation || [s.author, s.title, s.publication || s.organization, s.year, s.url].filter(Boolean).join(". ");
          const flag = s.verificationStatus === "verified" ? "सत्यापित" : "सत्यापन आवश्यक";
          return `<li>[${s.id}] ${escapeHtml(cite || s.title)} — <em>${flag}</em></li>`;
        })
        .join("")}</ul>`,
      sourceIds: relevantSources.map((s) => s.id),
    });
  }

  if (settings.includeExamples) {
    sections.push({
      id: nanoid(8),
      heading: labels.examples,
      html: `<p>उदाहरण: ${escapeHtml(title)} के किसी एक दावे को स्रोत के उद्धरण से मिलाकर लिखें, फिर उसे तथ्य, व्याख्या या परिकल्पना में वर्गीकृत करें।</p>`,
      sourceIds: [],
    });
  }

  sections.push({
    id: nanoid(8),
    heading: "प्रतिपक्ष और अनिश्चितता",
    html: `<p>${escapeHtml(
      item.uncertaintyNotes ||
        "यदि स्रोत पतले हैं तो अध्याय अधिक दावे नहीं गढ़ता। बाद के शोध से निष्कर्ष बदल सकते हैं।"
    )}</p>`,
    sourceIds: [],
  });

  sections.push({
    id: nanoid(8),
    heading: "निष्कर्ष",
    html: `<p>${escapeHtml(title)} पर यह अध्याय स्रोत-सूची से बँधा रहता है। उच्च-दाँव वाले निर्णय से पहले प्राथमिक और आधिकारिक दस्तावेज़ स्वयं पढ़ें।</p>`,
    sourceIds: [],
  });

  const keyPoints = [
    ...relevantFacts.slice(0, 4).map((f) => (keepIfHindi(f.text) || f.text) + (f.sourceIds[0] ? ` [${f.sourceIds[0]}]` : "")),
    `${title} को केवल एक वेबपेज से सिद्ध न मानें।`,
    "परिकल्पना और स्थापित तथ्य को अलग रखें।",
  ].slice(0, 8);

  const examples = settings.includeExamples
    ? [
        `“${title}” के एक दावे को स्रोत संख्या के साथ दोहराएँ और बताएँ कि वह तथ्य है या व्याख्या।`,
        `${settings.audience} के लिए एक छोटा उदाहरण लिखें और उसे संदर्भ सूची से जाँचें।`,
      ]
    : [];

  const questions: QuizItem[] = settings.includeExercises
    ? [
        {
          question: `${title} का मुख्य शोध प्रश्न अपने शब्दों में लिखिए।`,
          answer: item.summary || title,
          sourceIds: [],
        },
        {
          question: "इस अध्याय का कोई दावा तथ्य है, व्याख्या है, या परिकल्पना? कारण दीजिए।",
          answer: "उत्तर स्रोत के प्रकार और लेखक के अनुमान पर निर्भर करता है।",
          sourceIds: [],
        },
      ]
    : [];

  const mcqs: QuizItem[] = settings.includeMcqs
    ? [
        {
          question: `${title} के संदर्भ में आंबेडकर या किसी लेखक की ऐतिहासिक परिकल्पना को कैसे पढ़ना चाहिए?`,
          options: ["सिद्ध सार्वभौमिक तथ्य", "लेखक की व्याख्या / परिकल्पना", "केवल मनोरंजन", "स्रोत-रहित अनुमान जिसे छिपाया जाए"],
          answer: "लेखक की व्याख्या / परिकल्पना",
          explanation: "ऐतिहासिक परिकल्पना को सिद्ध तथ्य के रूप में प्रस्तुत नहीं किया जाता।",
          sourceIds: [],
        },
      ]
    : [];

  const ch: Chapter = {
    id: item.id,
    index,
    title,
    learningObjectives: [
      `${title} के मूल विचारों को ${settings.difficulty} स्तर पर हिन्दी में समझा सकेंगे।`,
      "उद्धृत स्रोतों से कम-से-कम दो ठोस बातें पहचान सकेंगे।",
      "तथ्य, व्याख्या और परिकल्पना में भेद कर सकेंगे।",
    ],
    sections,
    keyPoints,
    examples,
    commonMistakes: [
      `${title} पर एक ही वेबपेज को पर्याप्त प्रमाण मान लेना।`,
      "लेखक की परिकल्पना को सिद्ध इतिहास की तरह पढ़ना।",
      "अंग्रेज़ी स्रोत होने पर भी हिन्दी विश्लेषण को छोड़ देना।",
    ],
    summary: `${title} का यह अध्याय अनुमोदित शोध स्रोतों पर आधारित है। अंग्रेज़ी मूल ग्रंथों के शीर्षक सुरक्षित रखे गए हैं; विश्लेषण देवनागरी में है।`,
    questions,
    mcqs,
    images: (images || []).slice(0, 4),
    sourceIds: [...new Set(relevantSources.map((s) => s.id))],
    wordCount: 0,
    status: "complete",
  };
  if (ch.images.length && ch.sections[0]) {
    ch.sections[0].html += figuresToHtml(ch.images, "hi");
  }
  ch.wordCount = countWords(chapterPlain(ch));
  return ch;
}

function pickSources(item: OutlineItem, sources: SourceRecord[]): SourceRecord[] {
  const words = item.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const scored = sources
    .map((s) => {
      const hay = `${s.title} ${s.snippet} ${s.extractedText || ""}`.toLowerCase();
      const score = words.filter((w) => hay.includes(w)).length + (s.primarySource ? 2 : 0) + ((s.relevanceScore || 0) > 80 ? 1 : 0);
      return { s, score };
    })
    .sort((a, b) => b.score - a.score || (b.s.authorityScore || 0) - (a.s.authorityScore || 0));
  const picked = scored.filter((x) => x.score > 0).slice(0, 5).map((x) => x.s);
  return picked.length ? picked : sources.slice(0, 3);
}

function pickFacts(item: OutlineItem, facts: ExtractedFact[]): ExtractedFact[] {
  const words = item.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return facts
    .filter((f) => words.some((w) => f.text.toLowerCase().includes(w)) || f.confidence === "high")
    .slice(0, 10);
}

export function composeHindiFrontMatter(opts: {
  settings: EbookSettings;
  analysis: TopicAnalysis;
  sources: SourceRecord[];
  outline: OutlineItem[];
  facts: ExtractedFact[];
}): { introduction: string; conclusion: string; faqs: FaqItem[]; glossary: GlossaryEntry[]; disclaimer?: string } {
  const { settings, analysis, sources, outline } = opts;
  const primary = sources.find((s) => s.primarySource) || sources[0];
  const cite = primary ? ` [${primary.id}]` : "";
  const introduction = [
    `यह ${settings.type} “${analysis.normalizedTitle}” विषय पर ${settings.audience} के लिए ${settings.difficulty} स्तर पर तैयार किया गया है।`,
    analysis.copyrightMode
      ? "यह मूल अध्ययन-मार्गदर्शिका है। यह किसी कॉपीराइट कृति का अध्याय-दर-अध्याय पुनरुत्पादन नहीं है।"
      : "तथ्यात्मक दावे अंत में दी गई क्रमांकित संदर्भ-सूची से जुड़े हैं। जहाँ बात एक से अधिक विश्वसनीय स्रोतों से पुष्ट नहीं हुई, अनिश्चितता लिखी गई है।",
    primary
      ? `प्रमुख स्रोत में ${primary.title} (${primary.organization}) शामिल है।${cite}`
      : "शोध के बाद पर्याप्त प्राथमिक स्रोत न मिलने पर यह स्पष्ट कहा गया है।",
    `पुस्तक के अध्याय: ${outline.map((o) => localizeTitle(o.title, "hi")).slice(0, 8).join("; ")}।`,
  ].join("\n\n");

  const conclusion = [
    `इस खंड का उद्देश्य “${analysis.normalizedTitle}” का स्रोत-आधारित हिन्दी पथ देना था।`,
    "पाठकों को संदर्भ-सूची के उच्च-स्तरीय सरकारी, संस्थागत और प्राथमिक स्रोतों की ओर लौटना चाहिए।",
    "आगे के अध्ययन के लिए उन्हीं स्रोतों और अध्यायों में चिह्नित खुले प्रश्नों का अनुसरण करें।",
  ].join("\n\n");

  const glossary: GlossaryEntry[] = [];
  for (const f of opts.facts.filter((x) => x.category === "definition").slice(0, 16)) {
    const term = f.entities[0] || f.text.split(/\s+/).slice(0, 3).join(" ");
    glossary.push({
      term,
      definition: keepIfHindi(f.text) || `स्रोत के अनुसार: ${f.text}`,
      sourceIds: f.sourceIds,
    });
  }

  const faqs: FaqItem[] = [
    {
      question: "यह ईबुक किसके लिए है?",
      answer: `${settings.audience}, स्तर: ${settings.difficulty}। प्रकार: ${settings.type}।`,
      sourceIds: [],
    },
    {
      question: "क्या तथ्य वास्तविक शोध से आए हैं?",
      answer: "हाँ। Folio ने स्रोत एकत्र किए, उनकी प्रासंगिकता जाँची, और केवल अनुमोदित अभिलेखों से लिखा। संदर्भ-सूची उसी संग्रह की है।",
      sourceIds: sources.slice(0, 3).map((s) => s.id),
    },
    {
      question: "अंग्रेज़ी स्रोत होने पर भी पुस्तक हिन्दी में क्यों है?",
      answer: "स्रोत-भाषा और आउटपुट-भाषा अलग हैं। उपयोगकर्ता ने हिन्दी चुनी, इसलिए विश्लेषण देवनागरी में है। व्यक्ति-नाम, ग्रंथ-शीर्षक और उद्धरण अंग्रेज़ी में रह सकते हैं।",
      sourceIds: [],
    },
  ];

  let disclaimer: string | undefined;
  if (analysis.sensitiveDomain === "medical") {
    disclaimer =
      "चिकित्सा अस्वीकरण: यह ईबुक शैक्षिक है, नैदानिक सलाह नहीं। लाइसेंसशुदा चिकित्सक और आधिकारिक मार्गदर्शन देखें।";
  } else if (analysis.sensitiveDomain === "legal") {
    disclaimer = "कानूनी अस्वीकरण: यह ईबुक शैक्षिक है, विधिक सलाह नहीं। राजपत्र और न्यायालय अभिलेख स्वयं पढ़ें।";
  } else if (analysis.sensitiveDomain === "financial") {
    disclaimer = "वित्तीय अस्वीकरण: यह ईबुक शैक्षिक है, निवेश सलाह नहीं।";
  } else if (analysis.category === "historical" || analysis.topicKind === "named-work-inquiry") {
    disclaimer =
      "ऐतिहासिक टिप्पणी: प्राथमिक लेखक के दावे परिकल्पना होने पर व्याख्या के रूप में चिह्नित हैं। उन्हें सार्वभौमिक तथ्य न माना जाए।";
  }

  return { introduction, conclusion, faqs, glossary: glossary.slice(0, 40), disclaimer };
}

export function hindiWriterPromptAddon(lang: string): string {
  if (!isHindiOutput(lang)) return "";
  return `
CRITICAL LANGUAGE RULE:
outputLanguage is "hi". Write the ENTIRE chapter in Hindi using Devanagari script.
English is allowed ONLY for: proper names, book titles, technical terms, URLs, citations like [12], and source titles.
Example: आंबेडकर ने अपनी पुस्तक The Untouchables में अस्पृश्यता से संबंधित ऐतिहासिक तर्क प्रस्तुत किया।
Do NOT write English paragraphs. Do NOT detect output language from the sources.
Research notes may be English; you must still write Hindi analysis.
JSON string values must be Hindi (Devanagari) except the allowed English fragments.
`;
}

export async function translateToHindi(text: string, context: string): Promise<string | null> {
  if (!text.trim()) return text;
  if (isAcceptableHindi(text)) return text;
  if (!aiConfigured()) return null;
  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You translate educational ebook prose into Hindi (Devanagari). Keep proper names, book titles, URLs, and [n] citations in the original form. Return only the translated text.",
      },
      {
        role: "user",
        content: `Context: ${context}\n\nTranslate to Hindi:\n${text.slice(0, 6000)}`,
      },
    ],
    { temperature: 0.2, maxTokens: 3500 }
  );
  return raw?.trim() || null;
}

export function chapterNeedsHindiRegen(ch: Chapter): boolean {
  return !isAcceptableHindi(chapterPlain(ch));
}

export function documentNeedsHindiRegen(doc: EbookDocument): { ok: boolean; sections: string[] } {
  if (!isHindiOutput(doc.outputLanguage || doc.language || doc.settings.language)) {
    return { ok: true, sections: [] };
  }
  const sections: string[] = [];
  if (doc.introduction && !isAcceptableHindi(doc.introduction)) sections.push("introduction");
  if (doc.conclusion && !isAcceptableHindi(doc.conclusion)) sections.push("conclusion");
  doc.chapters.forEach((ch, i) => {
    if (chapterNeedsHindiRegen(ch)) sections.push(`chapter-${i + 1}`);
  });
  if (doc.glossary?.some((g) => g.definition && !isAcceptableHindi(g.definition) && /[A-Za-z]{20,}/.test(g.definition))) {
    sections.push("glossary");
  }
  return { ok: sections.length === 0, sections };
}

export async function ensureHindiChapter(
  ch: Chapter,
  opts: {
    item: OutlineItem;
    settings: EbookSettings;
    analysis: TopicAnalysis;
    sources: SourceRecord[];
    facts: ExtractedFact[];
  }
): Promise<{ chapter: Chapter; regenerated: boolean }> {
  if (!isHindiOutput(opts.analysis.outputLanguage || opts.settings.language)) {
    return { chapter: ch, regenerated: false };
  }
  if (!chapterNeedsHindiRegen(ch)) return { chapter: ch, regenerated: false };

  if (aiConfigured()) {
    const translatedSections: ChapterSection[] = [];
    for (const s of ch.sections) {
      const plain = s.html.replace(/<[^>]+>/g, " ");
      if (isAcceptableHindi(plain)) {
        translatedSections.push(s);
        continue;
      }
      const hi = await translateToHindi(plain, `Chapter ${ch.title} / ${s.heading}`);
      if (hi && isAcceptableHindi(hi)) {
        translatedSections.push({
          ...s,
          heading: /[\u0900-\u097F]/.test(s.heading) ? s.heading : s.heading,
          html: `<p>${escapeHtml(hi)}</p>`,
        });
      } else {
        translatedSections.push(s);
      }
    }
    const next: Chapter = {
      ...ch,
      title: localizeTitle(ch.title, "hi"),
      sections: translatedSections,
      summary: (await translateToHindi(ch.summary, ch.title)) || ch.summary,
    };
    next.wordCount = countWords(chapterPlain(next));
    if (!chapterNeedsHindiRegen(next)) return { chapter: next, regenerated: true };
  }

  const composed = composeHindiChapter({
    index: ch.index,
    item: opts.item,
    settings: opts.settings,
    analysis: opts.analysis,
    sources: opts.sources,
    facts: opts.facts,
    images: ch.images,
  });
  return { chapter: composed, regenerated: true };
}
