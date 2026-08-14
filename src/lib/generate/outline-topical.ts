/**
 * Topic-aware outline construction.
 *
 * The previous generic planner emitted titles built by pasting the topic into
 * a fixed frame ("<topic> की पृष्ठभूमि", "<topic>: अतिरिक्त शोध-पक्ष 12"),
 * which is exactly the templated output this rebuild has to remove.
 *
 * This module instead derives chapter subjects from two real signals:
 *   1. section headings actually present in the retrieved sources, and
 *   2. a discipline-appropriate skeleton (history / philosophy / science /
 *      educational) whose slots are filled with those real subjects.
 *
 * When neither yields enough material we return fewer chapters rather than
 * padding with numbered filler — the validator then reports the shortfall
 * instead of the book silently shipping empty sections.
 */

import type { EbookSettings, SourceRecord, TopicAnalysis } from "../types";
import type { PlannedChapter } from "./outline";
import { isHindiOutput } from "../language";
import { matchHaystack, termOccurs } from "../research/translit";

export type Discipline = "history" | "philosophy" | "science" | "educational" | "general";

/** Decide which structural skeleton fits the subject. */
export function disciplineFor(analysis: TopicAnalysis, settings: EbookSettings): Discipline {
  const blob = `${analysis.topic} ${settings.type} ${analysis.category}`.toLowerCase();
  const hi = analysis.topic;

  if (
    /philosoph|metaphysic|epistemolog|ethic|ontolog|logic\b/.test(blob) ||
    /दर्शन|दार्शनिक|तत्त्वमीमांसा|ज्ञानमीमांसा|वेदांत|वेदान्त|मीमांसा|न्याय दर्शन|सांख्य/.test(hi)
  ) {
    return "philosophy";
  }
  if (
    analysis.category === "historical" ||
    /histor|civilisation|civilization|empire|dynasty|colonial|movement/.test(blob) ||
    /इतिहास|ऐतिहासिक|साम्राज्य|औपनिवेशिक|आंदोलन|स्वतंत्रता/.test(hi)
  ) {
    return "history";
  }
  if (
    analysis.category === "scientific" ||
    /physic|chemistr|biolog|scien|astronom|geolog|mathematic/.test(blob) ||
    /विज्ञान|भौतिकी|रसायन|जीवविज्ञान|गणित/.test(hi)
  ) {
    return "science";
  }
  if (
    ["school", "exam", "programming", "technical"].includes(analysis.category) ||
    /textbook|course|notes|guide|syllabus|tutorial/.test(blob) ||
    /पाठ्यक्रम|कक्षा|परीक्षा|मार्गदर्शिका/.test(hi)
  ) {
    return "educational";
  }
  return "general";
}

/** Section headings mined from retrieved source text, filtered to useful ones. */
export function subjectsFromSources(sources: SourceRecord[], topic: string, limit = 40): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const noise =
    /^(see also|references|external links|further reading|notes|bibliography|citations|sources|contents|gallery|footnotes|इन्हें भी देखें|सन्दर्भ|बाहरी कड़ियाँ)$/i;

  for (const source of sources) {
    const text = source.extractedText || "";
    for (const line of text.split("\n")) {
      const match = line.trim().match(/^=+\s*(.+?)\s*=+$/);
      if (!match) continue;
      const heading = match[1].replace(/\s+/g, " ").trim();
      if (!heading || heading.length < 3 || heading.length > 70) continue;
      if (noise.test(heading)) continue;
      const key = heading.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(heading);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Salient proper nouns / recurring capitalised phrases in the sources — used to
 * name chapters after real people, schools, and works rather than generic slots.
 */
export function entitiesFromSources(sources: SourceRecord[], limit = 30): string[] {
  const counts = new Map<string, number>();
  for (const source of sources) {
    const text = (source.extractedText || "").slice(0, 20000);
    const matches = text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2}\b/g) || [];
    for (const raw of matches) {
      const term = raw.trim();
      if (term.length < 4) continue;
      if (/^(The|This|That|These|Those|There|Their|From|With|When|Where|While|After|Before|Chapter|Article|Part|Section|It|In|On|At|As|By|For|And|But)\b/.test(term)) {
        continue;
      }
      counts.set(term, (counts.get(term) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

interface Slot {
  /** Stable role, used to phrase the research question. */
  role: string;
  en: string;
  hi: string;
}

/** Discipline skeletons. Slots are phrased about the SUBJECT, not the template. */
function skeleton(discipline: Discipline, topic: string, hindi: boolean): Slot[] {
  const t = topic.trim();
  const S = (role: string, en: string, hi: string): Slot => ({ role, en, hi });

  switch (discipline) {
    case "philosophy":
      return [
        S("definition", `What ${t} means: scope and central problem`, `${t}: अर्थ, क्षेत्र और केंद्रीय समस्या`),
        S("origins", `Textual roots and earliest formulations`, `पाठ-मूल और आरंभिक प्रतिपादन`),
        S("development", `Historical development of the tradition`, `परंपरा का ऐतिहासिक विकास`),
        S("thinkers", `Major thinkers and their contributions`, `प्रमुख आचार्य और उनका योगदान`),
        S("schools", `Schools and internal divisions`, `संप्रदाय और आंतरिक भेद`),
        S("concepts", `Core concepts and technical vocabulary`, `मूल अवधारणाएँ और पारिभाषिक शब्दावली`),
        S("arguments", `Principal arguments and their structure`, `प्रमुख तर्क और उनकी संरचना`),
        S("counter", `Objections, counterarguments, and replies`, `आपत्तियाँ, प्रतिवाद और उत्तर`),
        S("compare", `Comparison with rival positions`, `प्रतिद्वंद्वी मतों से तुलना`),
        S("texts", `Primary texts and how to read them`, `प्राथमिक ग्रंथ और उन्हें पढ़ने की विधि`),
        S("commentary", `Commentarial tradition and transmission`, `भाष्य-परंपरा और अनुवर्तन`),
        S("modern", `Modern scholarship and reinterpretation`, `आधुनिक विद्वत्ता और पुनर्व्याख्या`),
        S("disputes", `Unsettled questions and scholarly disputes`, `अनिर्णीत प्रश्न और विद्वत्-विवाद`),
        S("legacy", `Influence and continuing relevance`, `प्रभाव और वर्तमान प्रासंगिकता`),
      ];
    case "history":
      return [
        S("question", `The historical question and its scope`, `ऐतिहासिक प्रश्न और उसका दायरा`),
        S("background", `Background and preceding conditions`, `पृष्ठभूमि और पूर्ववर्ती परिस्थितियाँ`),
        S("chronology", `Chronology: sequence of events`, `कालक्रम: घटनाओं का अनुक्रम`),
        S("origins", `Origins and early phase`, `उद्भव और आरंभिक चरण`),
        S("turning", `Turning points and decisive episodes`, `निर्णायक मोड़ और घटनाएँ`),
        S("people", `Key figures and their roles`, `प्रमुख व्यक्ति और उनकी भूमिका`),
        S("institutions", `Institutions, structures, and administration`, `संस्थाएँ, संरचनाएँ और प्रशासन`),
        S("society", `Society, economy, and everyday life`, `समाज, अर्थव्यवस्था और दैनिक जीवन`),
        S("sources", `Primary sources and the evidence base`, `प्राथमिक स्रोत और साक्ष्य-आधार`),
        S("method", `How historians evaluate this evidence`, `इतिहासकार इस साक्ष्य का मूल्यांकन कैसे करते हैं`),
        S("interpretations", `Competing historical interpretations`, `प्रतिस्पर्धी ऐतिहासिक व्याख्याएँ`),
        S("disputes", `Disputed claims and uncertain evidence`, `विवादित दावे और अनिश्चित साक्ष्य`),
        S("aftermath", `Consequences and aftermath`, `परिणाम और उत्तरवर्ती प्रभाव`),
        S("legacy", `Legacy and historiography`, `विरासत और इतिहास-लेखन`),
      ];
    case "science":
      return [
        S("definition", `Defining the subject and its scope`, `विषय की परिभाषा और क्षेत्र`),
        S("foundations", `Foundational principles`, `आधारभूत सिद्धांत`),
        S("history", `How current understanding developed`, `वर्तमान समझ का विकास`),
        S("mechanisms", `Underlying mechanisms explained`, `अंतर्निहित क्रियाविधि की व्याख्या`),
        S("models", `Models, equations, and diagrams`, `मॉडल, समीकरण और आरेख`),
        S("evidence", `Experimental and observational evidence`, `प्रायोगिक और प्रेक्षणात्मक साक्ष्य`),
        S("established", `Established science versus open hypotheses`, `स्थापित विज्ञान बनाम खुली परिकल्पनाएँ`),
        S("methods", `Methods and measurement`, `विधियाँ और मापन`),
        S("examples", `Worked examples and applications`, `हल किए गए उदाहरण और अनुप्रयोग`),
        S("misconceptions", `Common misconceptions corrected`, `सामान्य भ्रांतियों का निवारण`),
        S("limits", `Limitations and uncertainty`, `सीमाएँ और अनिश्चितता`),
        S("frontier", `Current research frontier`, `वर्तमान शोध-सीमांत`),
        S("ethics", `Practical and ethical implications`, `व्यावहारिक और नैतिक निहितार्थ`),
        S("further", `Further study and key literature`, `आगे का अध्ययन और प्रमुख साहित्य`),
      ];
    case "educational":
      return [
        S("orientation", `Orientation: what you will learn`, `परिचय: आप क्या सीखेंगे`),
        S("prereq", `Prerequisites and basic vocabulary`, `पूर्वापेक्षाएँ और आधारभूत शब्दावली`),
        S("core1", `Core concepts, part one`, `मूल अवधारणाएँ — भाग एक`),
        S("core2", `Core concepts, part two`, `मूल अवधारणाएँ — भाग दो`),
        S("worked", `Worked examples step by step`, `चरण-दर-चरण हल किए गए उदाहरण`),
        S("intermediate", `Intermediate topics`, `मध्यवर्ती विषय`),
        S("advanced", `Advanced topics`, `उन्नत विषय`),
        S("application", `Applications and case studies`, `अनुप्रयोग और केस अध्ययन`),
        S("mistakes", `Common mistakes and how to avoid them`, `सामान्य भूलें और उनसे बचाव`),
        S("practice", `Practice problems with full solutions`, `पूर्ण हल सहित अभ्यास प्रश्न`),
        S("assessment", `Self-assessment and checkpoints`, `स्व-मूल्यांकन और जाँच-बिंदु`),
        S("revision", `Revision notes and summary tables`, `पुनरावृत्ति नोट्स और सारांश तालिकाएँ`),
        S("exam", `Exam-style questions`, `परीक्षा-शैली प्रश्न`),
        S("next", `Where to go next`, `आगे की दिशा`),
      ];
    default:
      return [
        S("definition", `Defining ${t}`, `${t} की परिभाषा`),
        S("background", `Background and context`, `पृष्ठभूमि और संदर्भ`),
        S("development", `How it developed`, `इसका विकास कैसे हुआ`),
        S("components", `Main components explained`, `मुख्य घटकों की व्याख्या`),
        S("people", `Key figures and contributions`, `प्रमुख व्यक्ति और योगदान`),
        S("evidence", `Evidence and sources`, `साक्ष्य और स्रोत`),
        S("examples", `Concrete examples`, `ठोस उदाहरण`),
        S("debates", `Debates and differing views`, `बहसें और भिन्न मत`),
        S("problems", `Problems and limitations`, `समस्याएँ और सीमाएँ`),
        S("applications", `Applications today`, `आज के अनुप्रयोग`),
        S("compare", `Comparisons and contrasts`, `तुलना और अंतर`),
        S("uncertain", `What remains uncertain`, `जो अनिश्चित है`),
        S("summary", `Synthesis of the argument`, `तर्क का संश्लेषण`),
        S("further", `Further reading and research`, `आगे का अध्ययन और शोध`),
      ];
  }
}

function researchQuestionFor(role: string, subject: string, hindi: boolean): string {
  if (hindi) {
    switch (role) {
      case "definition":
        return `${subject} का सटीक अर्थ क्या है और इसकी सीमाएँ कहाँ हैं?`;
      case "origins":
      case "background":
        return `${subject} की उत्पत्ति के बारे में प्राथमिक स्रोत क्या स्थापित करते हैं?`;
      case "thinkers":
      case "people":
        return `${subject} में किन व्यक्तियों का योगदान प्रमाणित है और वह क्या था?`;
      case "arguments":
        return `${subject} के पक्ष में दिए गए तर्क किस संरचना पर आधारित हैं?`;
      case "counter":
        return `${subject} के विरुद्ध कौन-सी आपत्तियाँ उठाई गई हैं और उनके उत्तर क्या हैं?`;
      case "disputes":
      case "uncertain":
        return `${subject} के बारे में कौन-से दावे अब भी विवादित या अप्रमाणित हैं?`;
      case "sources":
      case "evidence":
        return `${subject} के लिए कौन-से प्राथमिक स्रोत उपलब्ध हैं और वे कितने विश्वसनीय हैं?`;
      default:
        return `${subject} के बारे में विश्वसनीय स्रोत क्या स्थापित करते हैं?`;
    }
  }
  switch (role) {
    case "definition":
      return `What exactly does ${subject} mean, and where are its boundaries?`;
    case "origins":
    case "background":
      return `What do primary sources establish about the origins of ${subject}?`;
    case "thinkers":
    case "people":
      return `Whose contributions to ${subject} are documented, and what were they?`;
    case "arguments":
      return `How are the arguments concerning ${subject} structured?`;
    case "counter":
      return `What objections have been raised against ${subject}, and how are they answered?`;
    case "disputes":
    case "uncertain":
      return `Which claims about ${subject} remain disputed or unproven?`;
    case "sources":
    case "evidence":
      return `Which primary sources document ${subject}, and how reliable are they?`;
    default:
      return `What do reliable sources establish about ${subject}?`;
  }
}

/**
 * Build a topic-specific chapter plan.
 *
 * `count` is honoured exactly when there is enough real material; the caller
 * validates the result rather than this function inventing filler chapters.
 */
export function buildTopicalPlan(opts: {
  topic: string;
  analysis: TopicAnalysis;
  settings: EbookSettings;
  sources: SourceRecord[];
  count: number;
}): PlannedChapter[] {
  const { topic, analysis, settings, sources, count } = opts;
  const hindi = isHindiOutput(analysis.outputLanguage || settings.outputLanguage || settings.language);
  const discipline = disciplineFor(analysis, settings);
  const slots = skeleton(discipline, topic, hindi);
  const headings = subjectsFromSources(sources, topic);
  const entities = entitiesFromSources(sources);

  // Pair skeleton slots with real source headings so titles name actual
  // subject matter instead of repeating the topic string.
  const usedHeadings = new Set<string>();
  const plan: PlannedChapter[] = [];

  for (let i = 0; i < Math.min(count, slots.length); i++) {
    const slot = slots[i];
    const base = hindi ? slot.hi : slot.en;

    // Attach the most relevant unused source heading to this slot.
    const slotHay = matchHaystack(`${slot.role} ${slot.en}`);
    let attached = "";
    for (const heading of headings) {
      if (usedHeadings.has(heading)) continue;
      const words = slot.en.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      const hHay = matchHaystack(heading);
      if (words.some((w) => termOccurs(w, hHay)) || termOccurs(heading, slotHay)) {
        attached = heading;
        usedHeadings.add(heading);
        break;
      }
    }

    const title = attached && !base.toLowerCase().includes(attached.toLowerCase()) ? `${base} — ${attached}` : base;
    const subject = attached || base;

    plan.push({
      title,
      summary: hindi
        ? `यह अध्याय «${topic}» के अंतर्गत ${subject} की व्याख्या करता है, केवल एकत्रित एवं सत्यापित स्रोतों के आधार पर।`
        : `This chapter explains ${subject} within “${topic}”, based only on the collected and verified sources.`,
      historicalScope: hindi
        ? `${subject} से संबंधित वह दायरा जिसे उपलब्ध स्रोत वास्तव में प्रमाणित करते हैं।`
        : `The scope of ${subject} that the available sources actually document.`,
      keyTopics: buildKeyTopics(subject, headings, entities, i, hindi),
      researchQuestion: researchQuestionFor(slot.role, subject, hindi),
      primarySources: [],
      secondarySources: [],
      claimsToVerify: hindi
        ? [`${subject} से जुड़े कारण-संबंधी दावों की स्वतंत्र पुष्टि आवश्यक है।`]
        : [`Causal claims about ${subject} require independent confirmation.`],
      uncertaintyNotes: hindi
        ? "जहाँ साक्ष्य अपर्याप्त हो वहाँ दावे को परिकल्पना या विवादित के रूप में चिह्नित करें।"
        : "Where evidence is insufficient, mark the claim as hypothesis or disputed.",
      evidenceVsInterpretation: hindi
        ? "A. स्थापित साक्ष्य — केवल उद्धृत प्राथमिक/आधिकारिक स्रोत। B. विद्वत् व्याख्या। C. किसी नामित लेखक की व्याख्या, अलग से। D. परिकल्पना। E. विवादित/अनिश्चित दावे।"
        : "A. Established evidence from cited primary/official sources only. B. Scholarly interpretation. C. A named author’s interpretation, kept separate. D. Hypothesis. E. Disputed/uncertain claims.",
    });
  }

  return plan;
}

function buildKeyTopics(
  subject: string,
  headings: string[],
  entities: string[],
  index: number,
  hindi: boolean
): string[] {
  const topics: string[] = [];
  const cleaned = subject.replace(/^[^—]*—\s*/, "").trim();
  if (cleaned) topics.push(cleaned);
  // Spread real source headings and entities across chapters so each chapter
  // carries distinct, source-grounded key topics.
  for (let i = index; i < headings.length; i += Math.max(1, Math.floor(headings.length / 4) || 1)) {
    if (headings[i] && !topics.includes(headings[i])) topics.push(headings[i]);
    if (topics.length >= 4) break;
  }
  for (let i = index; i < entities.length && topics.length < 6; i += 3) {
    if (entities[i] && !topics.includes(entities[i])) topics.push(entities[i]);
  }
  return topics.slice(0, 6);
}
