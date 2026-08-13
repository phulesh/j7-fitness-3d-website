import { nanoid } from "nanoid";
import type {
  Chapter,
  ChapterImage,
  ChapterSection,
  EbookSettings,
  FaqItem,
  GlossaryEntry,
  OutlineItem,
  QuizItem,
  SourceRecord,
  TopicAnalysis,
} from "../../types";
import { countWords, escapeHtml, chapterPlain } from "../text";
import { figuresToHtml } from "../images";
import { ACHHOOT_CHAPTERS_A } from "./content-a";
import { ACHHOOT_CHAPTERS_B } from "./content-b";
import { ACHHOOT_CHAPTERS_C } from "./content-c";
import { achhootSourceMap, type AchhootSourceKey } from "./sources";
import type { AchhootChapterContent } from "./types";

export { augmentAchhootSources, ACHHOOT_SOURCE_TEMPLATES } from "./sources";

export const COMPLETE_ACHHOOT_CHAPTERS: AchhootChapterContent[] = [
  ...ACHHOOT_CHAPTERS_A,
  ...ACHHOOT_CHAPTERS_B,
  ...ACHHOOT_CHAPTERS_C,
];

function resolve(text: string, sourceMap: Record<AchhootSourceKey, number | undefined>) {
  return (text || "").replace(/\{\{([a-z0-9]+)}}/gi, (_whole, key: AchhootSourceKey) => {
    const id = sourceMap[key];
    return id ? `[${id}]` : "";
  });
}

function citedIds(text: string): number[] {
  return [...new Set([...text.matchAll(/\[(\d+)]/g)].map((match) => Number(match[1])))];
}

function paragraphsHtml(paragraphs: string[], sourceMap: Record<AchhootSourceKey, number | undefined>) {
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(resolve(paragraph, sourceMap))}</p>`)
    .join("\n");
}

function makeSection(
  heading: string,
  paragraphs: string[],
  sourceMap: Record<AchhootSourceKey, number | undefined>,
  className?: string
): ChapterSection {
  const resolved = paragraphs.map((paragraph) => resolve(paragraph, sourceMap));
  const body = resolved.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n");
  return {
    id: nanoid(8),
    heading,
    html: className ? `<aside class="${className}">${body}</aside>` : body,
    sourceIds: citedIds(resolved.join("\n")),
  };
}

function factInterpretationHtml(
  content: AchhootChapterContent,
  sourceMap: Record<AchhootSourceKey, number | undefined>
) {
  const rows = content.factInterpretation
    .map(
      (pair) =>
        `<tr><td><strong>तथ्य:</strong> ${escapeHtml(resolve(pair.fact, sourceMap))}</td><td><strong>व्याख्या:</strong> ${escapeHtml(
          resolve(pair.interpretation, sourceMap)
        )}</td></tr>`
    )
    .join("");
  return `<table class="fact-interpretation-table"><caption>तथ्य को व्याख्या या परिकल्पना में बदलने से बचें</caption><thead><tr><th>स्रोत से स्थापित बात</th><th>उससे निकाला गया अर्थ</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function makeReviewQuestions(
  content: AchhootChapterContent,
  sourceMap: Record<AchhootSourceKey, number | undefined>
): QuizItem[] {
  const compact = (part: string) => {
    const sentences = part.match(/[^।!?]+[।!?]?/g) || [part];
    return sentences.slice(0, 2).join(" ").trim();
  };
  const answer = (parts: string[]) => {
    const labels = ["सीधा उत्तर", "प्रमाण और विवेचना", "निष्कर्ष तथा सीमा"];
    return parts.slice(0, 3).map((part, index) => `${labels[index]}: ${resolve(compact(part), sourceMap)}`).join("\n\n");
  };
  const sourceIds = (parts: string[]) => citedIds(parts.map((part) => resolve(part, sourceMap)).join("\n"));

  const reviews: { question: string; parts: string[] }[] = [
    {
      question: content.mainQuestion,
      parts: [content.detailedAnswer[0], content.detailedAnswer[1] || content.evidence[0], content.conclusion[0]],
    },
    {
      question: `“${content.title}” के अध्ययन में कौन-से प्राथमिक स्रोत उपलब्ध हैं और वे क्या सिद्ध नहीं करते?`,
      parts: [content.primarySources[0], content.primarySources[1] || content.evidence[0], content.uncertainty[0]],
    },
    {
      question: `इस अध्याय के विषय पर डॉ. बी. आर. आंबेडकर ने क्या तर्क दिया, और उस तर्क की सीमा क्या है?`,
      parts: [content.ambedkar[0], content.ambedkar[1] || content.critique[0], content.critique[0]],
    },
    {
      question: `इतिहासकारों/विद्वानों की अलग-अलग व्याख्याएँ क्या हैं, और उनमें मुख्य मतभेद कहाँ है?`,
      parts: [content.interpretations[0], content.interpretations[1] || content.evidence[1], content.uncertainty[0]],
    },
    {
      question: `तथ्य और व्याख्या को अलग रखते हुए इस अध्याय का सबसे सुरक्षित निष्कर्ष क्या है?`,
      parts: [content.evidence[0], content.uncertainty[1] || content.uncertainty[0], content.conclusion[content.conclusion.length - 1]],
    },
  ];

  return reviews.map(({ question, parts }) => ({
    question,
    answer: answer(parts),
    explanation: "उत्तर में स्थापित प्रमाण, नामित व्याख्या और अनिश्चितता को अलग रखा गया है।",
    sourceIds: sourceIds(parts),
  }));
}

/** Deterministic, complete edition used for the named Hindi research book. */
export function composeCompleteAchhootChapter(opts: {
  index: number;
  item: OutlineItem;
  settings: EbookSettings;
  analysis: TopicAnalysis;
  sources: SourceRecord[];
  images?: ChapterImage[];
}): Chapter {
  const content = COMPLETE_ACHHOOT_CHAPTERS[opts.index];
  if (!content) throw new Error(`Complete Hindi content is missing for chapter ${opts.index + 1}`);
  const sourceMap = achhootSourceMap(opts.sources);
  const sectionSourceIds = (paragraphs: string[]) => citedIds(paragraphs.map((p) => resolve(p, sourceMap)).join("\n"));

  const sections: ChapterSection[] = [
    makeSection("1. अध्याय का परिचय", content.introduction, sourceMap),
    makeSection("2. ऐतिहासिक पृष्ठभूमि", content.background, sourceMap),
    {
      id: nanoid(8),
      heading: "3. मुख्य प्रश्न",
      html: `<div class="main-question"><p><strong>प्रश्न:</strong> ${escapeHtml(resolve(content.mainQuestion, sourceMap))}</p></div>`,
      sourceIds: citedIds(resolve(content.mainQuestion, sourceMap)),
    },
    makeSection("4. प्रश्न का विस्तृत उत्तर", content.detailedAnswer, sourceMap),
    makeSection("5. उपलब्ध प्राथमिक स्रोत", content.primarySources, sourceMap, "source-analysis-box"),
    makeSection("6. स्रोतों से क्या प्रमाण मिलता है", content.evidence, sourceMap),
    makeSection("7. इतिहासकारों/विद्वानों की अलग-अलग व्याख्याएँ", content.interpretations, sourceMap),
    makeSection("8. डॉ. बी. आर. आंबेडकर की व्याख्या", content.ambedkar, sourceMap, "ambedkar-box"),
    makeSection("9. आंबेडकर की व्याख्या की आलोचनात्मक जाँच", content.critique, sourceMap),
    makeSection("10. प्रमाण की स्थिति — स्पष्ट सीमाएँ", content.uncertainty, sourceMap, "uncertainty-box"),
    {
      id: nanoid(8),
      heading: "11. तथ्य और व्याख्या को अलग रखें",
      html: factInterpretationHtml(content, sourceMap),
      sourceIds: sectionSourceIds(content.factInterpretation.flatMap((pair) => [pair.fact, pair.interpretation])),
    },
    makeSection("12. अध्याय का निष्कर्ष", content.conclusion, sourceMap, "conclusion-box"),
  ];

  const images = (opts.images || []).slice(0, 3);
  if (images.length) sections[1].html += figuresToHtml(images, "hi");
  const questions = makeReviewQuestions(content, sourceMap);
  const keyPoints = content.keyPoints.map((point) => resolve(point, sourceMap));

  const chapter: Chapter = {
    id: opts.item.id,
    index: opts.index,
    title: content.title,
    subtitle: "स्रोत, प्रमाण, व्याख्या और आलोचनात्मक उत्तर",
    learningObjectives: [
      "अध्याय के मुख्य ऐतिहासिक प्रश्न का प्रमाण-आधारित उत्तर समझना।",
      "प्राथमिक स्रोत, आंबेडकर की व्याख्या और बाद की विद्वत् व्याख्या में भेद करना।",
      "जहाँ प्रमाण सीमित या विवादित है, वहाँ निष्कर्ष की उचित सीमा पहचानना।",
    ],
    sections,
    keyPoints,
    examples: [],
    commonMistakes: [
      "आंबेडकर की परिकल्पना को बिना स्वतंत्र प्रमाण स्थापित तथ्य मान लेना।",
      "नियमात्मक ग्रंथ को पूरे भारत के वास्तविक व्यवहार का सीधा सर्वेक्षण समझना।",
      "आधुनिक कानूनी या प्रशासनिक श्रेणी को बिना जाँच प्राचीन काल पर आरोपित करना।",
    ],
    summary: content.conclusion.map((paragraph) => resolve(paragraph, sourceMap)).join("\n\n"),
    questions,
    mcqs: [],
    images,
    sourceIds: [
      ...new Set([
        ...sections.flatMap((section) => section.sourceIds),
        ...questions.flatMap((question) => question.sourceIds),
      ]),
    ],
    wordCount: 0,
    status: "complete",
  };
  chapter.wordCount = countWords(chapterPlain(chapter));
  return chapter;
}

export function composeCompleteAchhootFrontMatter(opts: {
  settings: EbookSettings;
  analysis: TopicAnalysis;
  sources: SourceRecord[];
  outline: OutlineItem[];
}): { introduction: string; conclusion: string; faqs: FaqItem[]; glossary: GlossaryEntry[]; disclaimer: string } {
  const sourceMap = achhootSourceMap(opts.sources);
  const r = (text: string) => resolve(text, sourceMap);
  const introduction = [
    "यह पुस्तक अस्पृश्यता की उत्पत्ति पर तैयार एक पूर्ण, स्रोत-आधारित ऐतिहासिक अध्ययन है। इसका केंद्र डॉ. बी. आर. आंबेडकर की 1948 की कृति The Untouchables: Who Were They and Why They Became Untouchables? है, लेकिन पुस्तक उस कृति की थीसिस को स्थापित तथ्य नहीं मानती। हर अध्याय प्राथमिक प्रमाण, आंबेडकर की व्याख्या, बाद की विद्वत् व्याख्या और विवादित बातों को अलग रखता है। {{ambedkar7}}",
    "यहाँ ‘अछूत’ शब्द केवल ऐतिहासिक स्रोतों और पुस्तक के मूल प्रश्न के संदर्भ में है। जीवित व्यक्तियों और समुदायों के लिए सम्मानजनक, स्वीकृत नाम—जैसे समुदाय का अपना नाम, ‘दलित’, अथवा उचित कानूनी संदर्भ में ‘अनुसूचित जाति’—प्रयोग करना चाहिए। कोई मनुष्य जन्म, पेशे, भोजन या धर्म से अशुद्ध नहीं होता; अध्ययन का विषय बहिष्कार करने वाली संस्था है।",
    "पुस्तक का पद्धतिगत नियम सरल है। A: प्राथमिक स्रोत यह स्थापित करता है कि उसके लेखक/संस्था ने क्या लिखा या किया। B: उससे अतीत के कारण पर निकाला गया निष्कर्ष व्याख्या है। C: Broken Men, बौद्ध पहचान, गोमांस और लगभग चौथी शताब्दी का संबंध आंबेडकर की परिकल्पना है। D: बाद के इतिहासकार क्रमिक सामाजिक स्तरीकरण, श्रम, भूमि, राज्य और औपनिवेशिक वर्गीकरण जैसे विकल्प देते हैं। E: जहाँ कड़ी स्वतंत्र रूप से प्रमाणित नहीं, वहाँ साफ ‘प्रमाण सीमित/विवादित’ लिखा गया है। {{annotated}} {{vivekanand}}",
    "आधुनिक कानूनी अध्याय अलग प्रमाण-स्तर पर है। संविधान का अनुच्छेद 17 अस्पृश्यता को समाप्त और उसके व्यवहार को किसी भी रूप में निषिद्ध करता है। यह कानूनी तथ्य आंबेडकर की प्राचीन उत्पत्ति-परिकल्पना की पुष्टि या खंडन नहीं; समानता का स्वतंत्र संवैधानिक आदेश है। {{constitution}}",
    `पुस्तक में ठीक ${opts.outline.length} अध्याय हैं। प्रत्येक अध्याय परिचय, पृष्ठभूमि, मुख्य प्रश्न, विस्तृत उत्तर, प्राथमिक स्रोत, प्रमाण, विद्वत् मत, आंबेडकर का मत, आलोचनात्मक जाँच, प्रमाण की सीमा, तथ्य/व्याख्या का भेद, निष्कर्ष, मुख्य बिंदु और पाँच पूरे उत्तरों सहित समीक्षा-प्रश्न देता है।`,
  ].map(r).join("\n\n");

  const conclusion = [
    "इस अध्ययन का अंतिम उत्तर यह है कि ऐतिहासिक रूप से अस्पृश्य कहे गए लोग कोई एक सिद्ध नस्ल या अखिल-भारतीय कबीला नहीं थे। वे विविध समुदाय थे जिन्हें अलग-अलग क्षेत्रों में जन्म-आधारित दूरी, कलंकित श्रम, भूमि और पानी से वंचना, अंतर्विवाह, धार्मिक वैधता तथा स्थानीय/राजकीय शक्ति ने अधीन बनाया। उत्पत्ति बहु-कारक और क्रमिक थी।",
    "आंबेडकर की Broken Men–बौद्ध–गोमांस थीसिस ने प्राकृतिक हीनता के सिद्धांतों को तोड़ा और आहार, धर्म तथा सत्ता को साहसपूर्वक जोड़ा। प्राचीन आहार की विविधता और गाय के प्रति दृष्टि का बदलना समर्थित है; Broken Men की सार्वदेशिक पहचान, उनका बौद्ध होना, गोमांस को निर्णायक कारण और लगभग 400 ईस्वी की एक जन्म-तिथि प्रमाण सीमित/विवादित हैं। {{ambedkar7}} {{dnjha}} {{annotated}}",
    "आंबेडकर की सबसे स्थायी विरासत किसी एक अनुमानित तारीख से बड़ी है: जाति मानवनिर्मित है; लोकतंत्र केवल शासन-रूप नहीं बल्कि साथ रहने का समान संबंध है; और स्वतंत्रता, समानता तथा बंधुत्व सामाजिक जीवन में उतरने चाहिए। संविधान का अनुच्छेद 17 इस विरासत को कानूनी आदेश देता है। {{ambedkar1}} {{constitution}}",
    "इतिहास की अनिश्चितता न्याय की अनिश्चितता नहीं। उत्पत्ति पर बहस जारी रह सकती है, किंतु जन्म-आधारित अपमान और वंचना का निषेध स्पष्ट है। पाठक का अगला कदम स्रोत स्वयं पढ़ना, समुदायों की अपनी आवाज़ सुनना, और रोजमर्रा के संस्थानों में समान गरिमा को वास्तविक बनाना है।",
  ].map(r).join("\n\n");

  const glossary: GlossaryEntry[] = [
    ["अस्पृश्यता", "जन्म से जुड़े सामाजिक बहिष्कार का वह तंत्र जिसमें संपर्क, संसाधन, प्रवेश, श्रम और सम्मान पर निर्योग्यताएँ लगाई जाती थीं।"],
    ["दलित", "कई बहिष्कृत समुदायों द्वारा अपनाई आधुनिक आत्मसम्मान और राजनीतिक पहचान; इसका प्रयोग संदर्भ और समुदाय की पसंद के अनुसार हो।"],
    ["अनुसूचित जाति", "संवैधानिक/वैधानिक प्रक्रिया से अधिसूचित प्रशासनिक श्रेणी; यह हर ऐतिहासिक शब्द का पर्याय नहीं।"],
    ["वर्ण", "ब्राह्मणीय ग्रंथों में समाज की चार-भागीय वैचारिक योजना; वास्तविक जातियों का पूर्ण नक्शा नहीं।"],
    ["जाति", "प्रायः जन्म, अंतर्विवाह, रिश्तेदारी, स्थानीय प्रतिष्ठा और ऐतिहासिक पेशे से जुड़ा सामाजिक समूह।"],
    ["Broken Men", "आंबेडकर की प्रस्तावित श्रेणी: पराजित/बिखरे कबीलाई लोग जो बसे गाँवों से जुड़े और बाहर रहे; प्रत्यक्ष अखिल-भारतीय जनगणना-श्रेणी नहीं।"],
    ["प्राथमिक स्रोत", "अध्ययनाधीन व्यक्ति, काल या संस्था से सीधे जुड़ा पाठ, अभिलेख, वस्तु या गवाही; प्राथमिक होना निष्पक्ष होने की गारंटी नहीं।"],
    ["नियमात्मक स्रोत", "जो व्यवहार कैसा होना चाहिए बताता है; वास्तविक व्यवहार का स्वतः सर्वेक्षण नहीं।"],
    ["परिकल्पना", "उपलब्ध तथ्यों को जोड़ने वाला परीक्षण योग्य प्रस्ताव, जिसे स्थापित तथ्य की तरह नहीं लिखना चाहिए।"],
    ["सामाजिक बहिष्कार", "संसाधन, संस्थान, संबंध, प्रतिष्ठा या निर्णय-प्रक्रिया में समान भागीदारी से व्यवस्थित वंचना।"],
    ["क्रमबद्ध असमानता", "आंबेडकर का पद: ऐसा पदानुक्रम जिसमें अनेक स्तर अपने से ऊपर और नीचे दोनों से संबंध रखते हैं, जिससे समानता-विरोधी संरचना टिकती है।"],
    ["अनुच्छेद 17", "भारतीय संविधान का मौलिक अधिकार जो अस्पृश्यता समाप्त करता और उसके व्यवहार को किसी भी रूप में निषिद्ध करता है।"],
  ].map(([term, definition]) => ({ term, definition, context: "इस पुस्तक में प्रयुक्त आलोचनात्मक अर्थ।", sourceIds: [] }));

  const faqs: FaqItem[] = [
    {
      question: "क्या पुस्तक आंबेडकर की थीसिस को सिद्ध इतिहास मानती है?",
      answer: "नहीं। पुस्तक ठीक-ठीक बताती है कि आंबेडकर ने क्या तर्क दिया, किन स्वतंत्र प्रमाणों से उसके कुछ भाग समर्थित हैं, और Broken Men, बौद्ध पहचान, गोमांस-कारण तथा तारीख कहाँ सीमित/विवादित हैं।",
      sourceIds: [sourceMap.ambedkar7, sourceMap.annotated].filter((id): id is number => Boolean(id)),
    },
    {
      question: "क्या सभी अनुसूचित जातियाँ एक ही मूल समुदाय की वंशज हैं?",
      answer: "ऐसा कोई सर्वमान्य प्रमाण नहीं। समुदायों के क्षेत्रीय इतिहास, भाषा, पेशे, धार्मिक परंपरा और राजनीतिक अनुभव अलग हैं। साझा बात जन्म-आधारित बहिष्कार की संस्था है, एक सिद्ध जैविक वंश नहीं।",
      sourceIds: [],
    },
    {
      question: "क्या प्राचीन भारत में गोमांस खाया जाता था?",
      answer: "कुछ प्राचीन पाठों में गोवंश-बलि और मांस के संदर्भ हैं और बाद के काल में दृष्टि बदलती दिखाई देती है। इससे हर व्यक्ति या हर क्षेत्र की समान आदत सिद्ध नहीं, और अस्पृश्यता का पूरा कारण स्वतः सिद्ध नहीं होता।",
      sourceIds: [sourceMap.dnjha].filter((id): id is number => Boolean(id)),
    },
    {
      question: "क्या Article 17 के बाद अस्पृश्यता समाप्त हो गई?",
      answer: "वह कानूनी रूप से समाप्त और उसका व्यवहार निषिद्ध हो गया। सामाजिक प्रथा का पूर्ण उन्मूलन अलग ऐतिहासिक प्रक्रिया है, जिसके लिए कानून, क्रियान्वयन और सामाजिक-आर्थिक परिवर्तन आवश्यक हैं।",
      sourceIds: [sourceMap.constitution, sourceMap.pcr].filter((id): id is number => Boolean(id)),
    },
    {
      question: "स्रोत-सूची में आधिकारिक और scholarly दोनों स्रोत क्यों हैं?",
      answer: "आधिकारिक स्रोत आंबेडकर के मूल पाठ, संविधान, बहस और कानून स्थापित करते हैं। scholarly works प्राचीन ग्रंथ, आहार, जाति, census और वैकल्पिक कारणों की आलोचनात्मक व्याख्या देते हैं। दोनों का प्रमाण-कार्य अलग है।",
      sourceIds: [],
    },
  ];

  const disclaimer = "ऐतिहासिक और भाषायी टिप्पणी: ‘अछूत’ शब्द केवल उद्धृत ऐतिहासिक श्रेणी/पुस्तक-शीर्षक के लिए है। आंबेडकर की उत्पत्ति-थीसिस को परिकल्पना के रूप में चिह्नित किया गया है। कानूनी अध्याय शैक्षिक है, व्यक्तिगत विधिक सलाह नहीं; वास्तविक मामले में अद्यतन आधिकारिक कानून और योग्य अधिवक्ता देखें।";
  return { introduction, conclusion, faqs, glossary, disclaimer };
}

export function validateCompleteAchhootContent(chapter: Chapter): string[] {
  const errors: string[] = [];
  const required = [
    "अध्याय का परिचय",
    "ऐतिहासिक पृष्ठभूमि",
    "मुख्य प्रश्न",
    "प्रश्न का विस्तृत उत्तर",
    "उपलब्ध प्राथमिक स्रोत",
    "स्रोतों से क्या प्रमाण मिलता है",
    "इतिहासकारों/विद्वानों की अलग-अलग व्याख्याएँ",
    "डॉ. बी. आर. आंबेडकर की व्याख्या",
    "आंबेडकर की व्याख्या की आलोचनात्मक जाँच",
    "प्रमाण की स्थिति",
    "तथ्य और व्याख्या",
    "अध्याय का निष्कर्ष",
  ];
  for (const heading of required) {
    if (!chapter.sections.some((section) => section.heading.includes(heading))) errors.push(`missing section: ${heading}`);
  }
  const uncertainty = chapter.sections.find((section) => section.heading.includes("प्रमाण की स्थिति"));
  if (!uncertainty || !/प्रमाण सीमित\/विवादित/.test(uncertainty.html)) {
    errors.push("evidence-limit section must explicitly identify limited/disputed claims");
  }
  if (chapter.questions.length < 5 || chapter.questions.length > 10) errors.push("chapter must have 5–10 review questions");
  chapter.questions.forEach((question, index) => {
    const paras = question.answer.split(/\n{2,}/).filter((part) => part.trim().length > 40);
    if (paras.length < 3) errors.push(`question ${index + 1} needs at least three substantial answer paragraphs`);
  });
  if (!chapter.summary.trim()) errors.push("missing conclusion/summary");
  const plain = chapterPlain(chapter);
  if (/\[यहाँ|placeholder|lorem ipsum|उत्तर स्रोत के प्रकार और लेखक के अनुमान पर निर्भर करता है/i.test(plain)) {
    errors.push("placeholder or research-note language found");
  }
  return errors;
}
