import { nanoid } from "nanoid";
import { isHindiOutput } from "../language";
import { isAmbedkarUntouchablesTopic, type TopicProfile } from "../research/relevance";
import { buildTopicalPlan } from "./outline-topical";
import type {
  EbookSettings,
  ExtractedFact,
  OutlineItem,
  SourceRecord,
  TopicAnalysis,
} from "../types";

export interface PlannedChapter {
  title: string;
  summary: string;
  historicalScope: string;
  keyTopics: string[];
  researchQuestion: string;
  primarySources: string[];
  secondarySources: string[];
  claimsToVerify: string[];
  uncertaintyNotes: string;
  evidenceVsInterpretation: string;
}

const GENERIC_HI = [
  "यह विषय क्या है और क्यों महत्वपूर्ण है",
  "यह विषय क्या है और क्यों महत्त्वपूर्ण है",
  "आधार और शब्दावली",
  "मूल विचार विस्तार से",
  "विधियाँ और कार्य-प्रणाली",
  "वास्तविक अनुप्रयोग",
];

const GENERIC_EN = [
  "what this subject is and why it matters",
  "foundations and vocabulary",
  "core ideas in depth",
  "methods and how work is done",
  "applications in the real world",
  "setting the scene",
];

export function isGenericOutlineTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return GENERIC_HI.some((g) => t === g.toLowerCase()) || GENERIC_EN.some((g) => t === g);
}

export const ACHHOOT_HINDI_TITLES = [
  "अछूत कौन थे और प्रश्न का ऐतिहासिक महत्व",
  "‘अछूत’, अस्पृश्यता और सामाजिक बहिष्कार की अवधारणा",
  "डॉ. बी. आर. आंबेडकर का ऐतिहासिक तर्क",
  "‘Broken Men’ की अवधारणा",
  "बौद्ध धर्म, ब्राह्मणवाद और सामाजिक संघर्ष",
  "गोमांस/Beef-eating का ऐतिहासिक प्रश्न",
  "अस्पृश्यता के उद्भव की आंबेडकर की व्याख्या",
  "जाति, सामाजिक बहिष्कार और सत्ता",
  "प्राथमिक स्रोत और ऐतिहासिक प्रमाण",
  "आधुनिक इतिहासकारों की वैकल्पिक व्याख्याएँ",
  "आंबेडकर के तर्क की आलोचनात्मक समीक्षा",
  "औपनिवेशिक भारत, जनगणना और जाति-वर्गीकरण",
  "संविधान, अनुच्छेद 17 और अस्पृश्यता का कानूनी उन्मूलन",
  "निष्कर्ष: आंबेडकर की विरासत और आज का प्रश्न",
] as const;

export function isAchhootResearchTopic(topic: string): boolean {
  if (isAmbedkarUntouchablesTopic(topic)) return true;
  const raw = topic || "";
  if (/अछूत\s*कौन\s*थे/.test(raw) || /अछूत\s*कैसे\s*बने/.test(raw)) return true;
  if (/अस्पृश्य\s*कौन/.test(raw) && /आंबेडकर|अम्बेडकर|अछूत|अस्पृश्य/.test(raw)) return true;
  return false;
}

function achhootHindiPlan(): PlannedChapter[] {
  return [
    {
      title: ACHHOOT_HINDI_TITLES[0],
      summary:
        "पुस्तक के मूल प्रश्न को ऐतिहासिक शोध-प्रश्न के रूप में स्थापित करें। इसे जीवनी या सामान्य जाति-सर्वेक्षण न बनाएँ।",
      historicalScope: "प्राचीन से औपनिवेशिक भारत तक का वह दायरा जिसमें आंबेडकर ने ‘अछूत कौन थे’ पूछा; 1948 का प्रकाशन-संदर्भ।",
      keyTopics: ["ऐतिहासिक प्रश्न", "अस्पृश्यता", "शोध-विधि", "The Untouchables (1948)"],
      researchQuestion: "‘अछूत कौन थे’ को एक ऐतिहासिक प्रश्न के रूप में कैसे पढ़ा जाए, और यह प्रश्न क्यों महत्त्वपूर्ण है?",
      primarySources: [
        "B. R. Ambedkar, The Untouchables: Who Were They and Why They Became Untouchables? (1948)",
        "Dr. Babasaheb Ambedkar: Writings and Speeches — संबंधित खंड",
      ],
      secondarySources: [
        "विश्वसनीय विश्वकोश / पुस्तकालय अभिलेख जो 1948 की पुस्तक को दर्ज करते हैं",
        "आंबेडकर के लेखन पर विश्वविद्यालय-स्तरीय परिचय",
      ],
      claimsToVerify: ["पुस्तक की तिथि और शीर्षक के पुस्तकालय/संग्रह अभिलेख", "प्रश्न का आंबेडकर द्वारा स्वयं का फ्रेम"],
      uncertaintyNotes: "प्रश्न का महत्त्व स्थापित तथ्य है; उसके उत्तर की पूर्णता नहीं।",
      evidenceVsInterpretation:
        "A. स्थापित: 1948 में आंबेडकर ने यह ऐतिहासिक प्रश्न उठाया। B. व्याख्या: प्रश्न का उत्तर कैसे दिया जाए। C. आंबेडकर की व्याख्या बाद के अध्यायों में। D/E. उद्भव-कथा परिकल्पना है, सिद्ध सार्वभौमिक तथ्य नहीं।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[1],
      summary: "अछूत, अस्पृश्यता और सामाजिक बहिष्कार को परिभाषित करें। कानूनी वर्णन और जीवित बहिष्कार को अलग रखें।",
      historicalScope: "दक्षिण एशियाई सामाजिक व्यवहार; औपनिवेशिक शब्दावली; आधुनिक कानूनी परिभाषा से तुलना।",
      keyTopics: ["अस्पृश्यता", "सामाजिक बहिष्कार", "शब्दावली", "अनुच्छेद 17 (केवल अवधारणा)"],
      researchQuestion: "‘अछूत’ और अस्पृश्यता किन सामाजिक व्यवहारों का नाम हैं, और इन्हें कानूनी उन्मूलन से कैसे अलग पढ़ें?",
      primarySources: ["संविधान का अनुच्छेद 17 (कानूनी वर्णन)", "आंबेडकर की पुस्तक में प्रयुक्त परिभाषाएँ"],
      secondarySources: ["विश्वसनीय विश्वकोश प्रविष्टियाँ — Untouchability / Dalit", "सरकारी / संस्थागत व्याख्याएँ"],
      claimsToVerify: ["शब्दों के ऐतिहासिक प्रयोग", "कानूनी बनाम सामाजिक अर्थ का अंतर"],
      uncertaintyNotes: "एक शब्द कई ऐतिहासिक अवधियों में एक ही अर्थ नहीं रखता।",
      evidenceVsInterpretation:
        "A. स्थापित: अस्पृश्यता एक दर्ज सामाजिक-कानूनी श्रेणी रही। C. आंबेडकर की परिभाषा लेखक का फ्रेम है। E. उत्पत्ति अभी विवादास्पद है।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[2],
      summary: "The Untouchables (1948) में आंबेडकर का तर्क-क्रम प्रस्तुत करें — लेखक का फ्रेम, निर्विवाद जनगणना तथ्य नहीं।",
      historicalScope: "1940 के दशक का आंबेडकर-लेखन; पुस्तक का उद्देश्य और प्रश्न-विधान।",
      keyTopics: ["आंबेडकर", "1948", "ऐतिहासिक विधि", "तर्क-संरचना"],
      researchQuestion: "आंबेडकर ने ‘अछूत कैसे बने’ का उत्तर किन चरणों में दिया?",
      primarySources: ["The Untouchables (1948) — आंबेडकर का मूल पाठ", "Writings and Speeches"],
      secondarySources: ["पुस्तकालय / Internet Archive अभिलेख", "आंबेडकर-अध्ययन की परिचयात्मक समीक्षाएँ"],
      claimsToVerify: ["पुस्तक में तर्क का क्रम", "कौन-से दावे साक्ष्य हैं और कौन-से अनुमान"],
      uncertaintyNotes: "तर्क का सार लेखक की रचना है; उसे सिद्ध इतिहास न माना जाए।",
      evidenceVsInterpretation:
        "C. यह अध्याय मुख्यतः आंबेडकर की व्याख्या है। A. स्थापित केवल यह कि उन्होंने यह तर्क लिखा। D. कारण-कथा परिकल्पना है।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[3],
      summary: "Broken Men परिकल्पना को व्याख्या के रूप में समझाएँ। दावों को साक्ष्य / व्याख्या / विवाद में बाँटें।",
      historicalScope: "आंबेडकर द्वारा प्रस्तावित प्राचीन-मध्यकालीन सामाजिक प्रक्रिया; स्वतंत्र पुरातात्त्विक काल-निर्धारण नहीं।",
      keyTopics: ["Broken Men", "बसी हुई समुदाय", "गाँव की सीमा", "परिकल्पना"],
      researchQuestion: "आंबेडकर की ‘Broken Men’ अवधारणा क्या कहती है, और यह किस प्रकार की व्याख्या है?",
      primarySources: ["The Untouchables — Broken Men संबंधी अध्याय", "आंबेडकर द्वारा उद्धृत पाठ (जहाँ उपलब्ध)"],
      secondarySources: ["Broken Men सिद्धांत पर परवर्ती विद्वत् चर्चा", "जाति-इतिहास की वैकल्पिक रूपरेखाएँ"],
      claimsToVerify: ["Broken Men का ऐतिहासिक अस्तित्व", "गाँव-बाह्य निवास का कारण-संबंध"],
      uncertaintyNotes: "Broken Men एक लेखक-प्रस्तावित श्रेणी है। स्वतंत्र समकालीन जनगणना इसे प्रमाणित नहीं करती।",
      evidenceVsInterpretation:
        "C. Broken Men आंबेडकर की व्याख्या/परिकल्पना है। A. स्थापित नहीं कि यह सार्वभौमिक ऐतिहासिक जनसमूह था। E. विद्वानों में मतभेद है।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[4],
      summary: "बौद्ध धर्म, ब्राह्मणवाद और सामाजिक संघर्ष को आंबेडकर के तर्क के भीतर रखें; स्वतंत्र धार्मिक इतिहास न घुसाएँ।",
      historicalScope: "आंबेडकर द्वारा वर्णित बौद्ध-ब्राह्मण प्रतिस्पर्धा; भारत में बौद्ध धर्म के ह्रास का व्यापक इतिहास केवल संदर्भ में।",
      keyTopics: ["बौद्ध धर्म", "ब्राह्मणवाद", "सामाजिक संघर्ष", "घृणा की व्याख्या"],
      researchQuestion: "आंबेडकर बौद्ध धर्म और ब्राह्मणवाद के संघर्ष को अस्पृश्यता से कैसे जोड़ते हैं?",
      primarySources: ["The Untouchables — बौद्ध धर्म संबंधी तर्क", "आंबेडकर के अन्य संबंधित लेख (यदि स्रोत में हों)"],
      secondarySources: ["भारतीय बौद्ध धर्म के ह्रास पर मानक इतिहास-लेखन", "जाति और धर्म पर विद्वत् व्याख्याएँ"],
      claimsToVerify: ["Broken Men और बौद्ध पहचान का प्रस्तावित संबंध", "बौद्धों के प्रति स्थायी घृणा का दावा"],
      uncertaintyNotes: "बौद्ध-पहचान वाली कड़ी स्वतंत्र साक्ष्य के बिना परिकल्पना रहती है।",
      evidenceVsInterpretation:
        "C. संबंध आंबेडकर की व्याख्या है। A. बौद्ध धर्म का ऐतिहासिक अस्तित्व स्थापित है। D. अस्पृश्यता का कारण-संबंध परिकल्पना है।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[5],
      summary: "गोमांस-भक्षण वाले तर्क को आंबेडकर की प्रस्तावित व्याख्या के रूप में रखें, सार्वभौमिक आहार-इतिहास के रूप में नहीं।",
      historicalScope: "आंबेडकर द्वारा उद्धृत प्राचीन पाठ-साक्ष्य और उनकी आहार-संबंधी अनुमान-श्रृंखला।",
      keyTopics: ["Beef-eating", "गोमांस", "गाय", "ब्राह्मण", "आहार-निषेध"],
      researchQuestion: "आंबेडकर गोमांस-भक्षण को अस्पृश्यता की व्याख्या में कैसे लाते हैं, और यह कितना सत्यापित है?",
      primarySources: ["The Untouchables — आहार संबंधी अध्याय", "आंबेडकर द्वारा उद्धृत संस्कृत/धर्मशास्त्र अंश (स्रोत में हों तो)"],
      secondarySources: ["प्राचीन भारतीय आहार पर विद्वत् शोध", "गाय और पवित्रता की इतिहास-लेखन"],
      claimsToVerify: ["क्या प्राचीन हिन्दू गोमांस खाते थे — आंबेडकर के उद्धरण बनाम स्वतंत्र पाठ-आलोचना", "ब्राह्मणों द्वारा गोमांस त्याग का काल"],
      uncertaintyNotes: "आहार-इतिहास विवादास्पद है। एक लेखक के उद्धरण पूरे उपमहाद्वीप का आहार सिद्ध नहीं करते।",
      evidenceVsInterpretation:
        "C. गोमांस-तर्क आंबेडकर की प्रस्तावित व्याख्या है। A. कुछ प्राचीन पाठ मांस/गोमांस का उल्लेख करते हैं — उन्हें संदर्भ में पढ़ें। E. काल और कारण विवादित हैं।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[6],
      summary: "अस्पृश्यता के उद्भव की आंबेडकर-व्याख्या को चरणबद्ध करें। तिथियाँ जहाँ अनुमान हैं वहाँ परिकल्पना लिखें।",
      historicalScope: "आंबेडकर की प्रस्तावित काल-रेखा; स्वतंत्र पुरातात्त्विक/अभिलेखीय तिथि नहीं गढ़ी जाए।",
      keyTopics: ["उद्भव", "काल-रेखा", "गाँव", "बहिष्कार की स्थायिता"],
      researchQuestion: "आंबेडकर के अनुसार अस्पृश्यता कब और कैसे वंशानुगत बहिष्कार बनी?",
      primarySources: ["The Untouchables — उद्भव और काल संबंधी खंड"],
      secondarySources: ["जाति के उद्भव पर वैकल्पिक इतिहास-लेखन", "औपनिवेशिक नृवंशलेखन (सतर्कता के साथ)"],
      claimsToVerify: ["प्रस्तावित तिथियाँ", "कारण-श्रृंखला का प्रत्येक चरण"],
      uncertaintyNotes: "उद्भव की कोई एक सर्वस्वीकृत तिथि नहीं है।",
      evidenceVsInterpretation:
        "C/D. उद्भव-कथा आंबेडकर की व्याख्या और परिकल्पना है। A. बाद की शताब्दियों में बहिष्कार दर्ज है। E. कारण अभी भी विवादित है।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[7],
      summary: "जाति, बहिष्कार और सत्ता को आंबेडकर के तर्क तथा दर्ज सामाजिक संरचना के बीच रखकर पढ़ें।",
      historicalScope: "जाति-व्यवस्था का सामाजिक-राजनीतिक आयाम; सत्ता और श्रम का संबंध।",
      keyTopics: ["जाति", "सत्ता", "बहिष्कार", "श्रम", "गाँव"],
      researchQuestion: "अस्पृश्यता जाति-सत्ता की संरचना में कैसे काम करती है, और आंबेडकर इसे कैसे पढ़ते हैं?",
      primarySources: ["आंबेडकर — The Untouchables तथा जाति संबंधी अन्य प्राथमिक पाठ (स्रोत हों तो)"],
      secondarySources: ["जाति और सत्ता पर समाजशास्त्रीय/ऐतिहासिक अध्ययन", "ग्राम-अध्ययन"],
      claimsToVerify: ["बहिष्कार और आर्थिक निर्भरता का संबंध", "सत्ता-व्याख्या बनाम धार्मिक-व्याख्या"],
      uncertaintyNotes: "एक ही तंत्र पूरे उपमहाद्वीप में एक समान नहीं था।",
      evidenceVsInterpretation:
        "A. जाति और बहिष्कार दर्ज सामाजिक तथ्य हैं। C. आंबेडकर की कारण-व्याख्या लेखक का तर्क है। B. समाजशास्त्रीय व्याख्याएँ अलग हो सकती हैं।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[8],
      summary: "प्राथमिक स्रोत और ऐतिहासिक प्रमाण की सूची बनाएँ। जो उपलब्ध नहीं, उसे गढ़ें नहीं।",
      historicalScope: "आंबेडकर द्वारा प्रयुक्त साक्ष्य-प्रकार; आधुनिक अभिलेखागार और कानूनी पाठ।",
      keyTopics: ["प्राथमिक स्रोत", "पाठ-साक्ष्य", "अभिलेख", "प्रमाण की सीमा"],
      researchQuestion: "इस विषय पर कौन-से प्राथमिक स्रोत वास्तव में उपलब्ध हैं, और वे क्या सिद्ध करते हैं?",
      primarySources: [
        "The Untouchables (1948)",
        "Writings and Speeches",
        "संविधान — अनुच्छेद 17",
        "Internet Archive / Wikisource अभिलेख जहाँ सत्यापित हों",
      ],
      secondarySources: ["पुस्तकालय सूची", "विश्वकोश जो प्राथमिक पाठ की ओर संकेत करते हैं"],
      claimsToVerify: ["प्रत्येक उद्धृत ग्रंथ का अस्तित्व और संदर्भ", "आंबेडकर के उद्धरण की सटीकता"],
      uncertaintyNotes: "अनुपलब्ध अभिलेख की कल्पना करना शोध-त्रुटि है।",
      evidenceVsInterpretation:
        "A. उपलब्ध प्राथमिक पाठ ही साक्ष्य हैं। C. उन पाठों से आंबेडकर जो निष्कर्ष निकालते हैं वह व्याख्या है। D. अधूरे साक्ष्य पर परिकल्पना।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[9],
      summary: "आधुनिक इतिहासकारों की वैकल्पिक व्याख्याएँ। आलोचक गढ़ें नहीं। स्रोत पतले हों तो स्पष्ट कहें।",
      historicalScope: "1948 के बाद का इतिहास-लेखन; जाति और अस्पृश्यता के उद्भव पर प्रतिस्पर्धी मत।",
      keyTopics: ["इतिहास-लेखन", "वैकल्पिक व्याख्या", "आलोचना", "अनुसंधान की सीमा"],
      researchQuestion: "परवर्ती विद्वान आंबेडकर के उद्भव-तर्क को कैसे पढ़ते या चुनौती देते हैं?",
      primarySources: ["आंबेडकर का मूल तर्क (तुलना के लिए)"],
      secondarySources: [
        "विश्वविद्यालय / जर्नल स्रोत जो वास्तव में शोध में मिले",
        "जाति-इतिहास की मानक समीक्षाएँ (केवल यदि स्रोत सूची में हों)",
      ],
      claimsToVerify: ["किसी आलोचक का नाम या पुस्तक — केवल सत्यापित स्रोत से"],
      uncertaintyNotes: "यदि शोध में नामित आलोचक न मिलें तो यह स्पष्ट लिखें। काल्पनिक विद्वान न जोड़ें।",
      evidenceVsInterpretation:
        "B. यह अध्याय परवर्ती विद्वत् व्याख्या है। स्रोत न हों तो ‘अपर्याप्त साक्ष्य’ लिखें। कभी भी गढ़े हुए लेखक न दें।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[10],
      summary: "आंबेडकर के तर्क की आलोचनात्मक समीक्षा: साक्ष्य, मान्यताएँ, शक्तियाँ और सीमाएँ।",
      historicalScope: "1948 के तर्क का आंतरिक मूल्यांकन; बाद की राजनीति से अलग।",
      keyTopics: ["विधि", "मान्यताएँ", "सीमाएँ", "आलोचनात्मक पठन"],
      researchQuestion: "Broken Men / गोमांस तर्क किन मान्यताओं पर टिका है, और वे कहाँ कमजोर हैं?",
      primarySources: ["The Untouchables — विधि और निष्कर्ष वाले खंड"],
      secondarySources: ["ऐतिहासिक विधि पर सामान्य मार्गदर्शन", "उपलब्ध विद्वत् आलोचनाएँ"],
      claimsToVerify: ["प्रत्येक कारण-कड़ी की तार्किक आवश्यकता", "वैकल्पिक कारण जो पुस्तक नहीं उठाती"],
      uncertaintyNotes: "आलोचना का अर्थ अनादर नहीं; यह शोध-पठन है।",
      evidenceVsInterpretation:
        "C. आंबेडकर की व्याख्या का मूल्यांकन। A. उनके लिखे दावे पाठ-साक्ष्य हैं। D. जो वे सिद्ध नहीं कर सके वह परिकल्पना रह जाता है।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[11],
      summary: "औपनिवेशिक जनगणना और जाति-वर्गीकरण को आंबेडकर-प्रश्न के संदर्भ में रखें। जनगणना को उद्भव का प्रमाण न मानें।",
      historicalScope: "उन्नीसवीं–बीसवीं शताब्दी की औपनिवेशिक जनगणना और जाति-सूचियाँ।",
      keyTopics: ["औपनिवेशिक भारत", "जनगणना", "जाति-वर्गीकरण", "Scheduled Castes"],
      researchQuestion: "औपनिवेशिक जनगणना ने अस्पृश्य/दलित श्रेणियों को कैसे वर्गीकृत किया, और यह आंबेडकर के प्राचीन-उद्भव तर्क से कैसे भिन्न है?",
      primarySources: ["औपनिवेशिक जनगणना रिपोर्ट (यदि स्रोत में हों)", "सरकारी अनुसूचित जाति संबंधी पाठ"],
      secondarySources: ["जनगणना और जाति पर इतिहास-लेखन", "औपनिवेशिक ज्ञान-रचना पर अध्ययन"],
      claimsToVerify: ["जनगणना श्रेणियों की तिथि और परिभाषा", "क्या जनगणना उद्भव सिद्ध करती है (नहीं)"],
      uncertaintyNotes: "औपनिवेशिक श्रेणियाँ स्वयं एक ऐतिहासिक रचना हैं।",
      evidenceVsInterpretation:
        "A. जनगणना दस्तावेज स्थापित प्राथमिक स्रोत हैं (जहाँ उपलब्ध)। B. वे औपनिवेशिक वर्गीकरण की व्याख्या भी हैं। C. आंबेडकर का प्राचीन उद्भव उनसे सिद्ध नहीं होता।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[12],
      summary: "अनुच्छेद 17 और कानूनी उन्मूलन को स्थापित संवैधानिक तथ्य के रूप में लिखें — 1948 की ऐतिहासिक परिकल्पना से अलग।",
      historicalScope: "1946–1950 संविधान सभा; 26 जनवरी 1950; अनुच्छेद 17।",
      keyTopics: ["अनुच्छेद 17", "संविधान", "कानूनी उन्मूलन", "संविधान सभा"],
      researchQuestion: "भारतीय संविधान अस्पृश्यता का कानूनी उन्मूलन कैसे करता है, और यह आंबेडकर की ऐतिहासिक व्याख्या से कैसे भिन्न तथ्य है?",
      primarySources: [
        "Constitution of India, Article 17",
        "legislative.gov.in / आधिकारिक संविधान पाठ",
        "संविधान सभा संबंधी आधिकारिक अभिलेख (यदि स्रोत में हों)",
      ],
      secondarySources: ["PRS / सरकारी व्याख्या", "संवैधानिक विधि की मानक टिप्पणियाँ"],
      claimsToVerify: ["अनुच्छेद 17 का पाठ", "उन्मूलन का कानूनी अर्थ बनाम सामाजिक अवशेष"],
      uncertaintyNotes: "कानूनी उन्मूलन सामाजिक व्यवहार के तत्काल अंत का प्रमाण नहीं।",
      evidenceVsInterpretation:
        "A. अनुच्छेद 17 स्थापित संवैधानिक तथ्य है। C. 1948 की उद्भव-कथा इससे सिद्ध/असिद्ध नहीं होती। वे दो अलग दावे हैं।",
    },
    {
      title: ACHHOOT_HINDI_TITLES[13],
      summary: "आंबेडकर की विरासत और आज के प्रश्न को साक्ष्य व व्याख्या की सीमाओं के साथ समेटें।",
      historicalScope: "1948 से वर्तमान तक का पाठकीय प्रश्न; कानूनी और सामाजिक अवशेष।",
      keyTopics: ["विरासत", "अनुच्छेद 17", "आज का प्रश्न", "शोध-नीति"],
      researchQuestion: "आधुनिक पाठक आंबेडकर के प्रश्न को कैसे पढ़े बिना परिकल्पना को तथ्य मान ले?",
      primarySources: ["The Untouchables (1948)", "अनुच्छेद 17"],
      secondarySources: ["आंबेडकर-विरासत पर उपलब्ध विश्वसनीय स्रोत"],
      claimsToVerify: ["कौन-से दावे आज भी शोध-प्रश्न हैं"],
      uncertaintyNotes: "विरासत का मूल्यांकन व्याख्या है; संवैधानिक उन्मूलन तथ्य है।",
      evidenceVsInterpretation:
        "A. पुस्तक, अनुच्छेद 17, और अस्पृश्यता का कानूनी निषेध स्थापित हैं। C. उद्भव की कथा व्याख्या/परिकल्पना है। पाठक को दोनों को मिलाकर नहीं पढ़ना चाहिए।",
    },
  ];
}

export function achhootEnglishPlan(): PlannedChapter[] {
  return [
    {
      title: "Who were the Untouchables, and why the historical question matters",
      summary: "Frame Ambedkar’s question as a historical research problem, not a biography.",
      historicalScope: "The 1948 inquiry and the long social history it tries to explain.",
      keyTopics: ["historical question", "untouchability", "method"],
      researchQuestion: "How should ‘Who were the Untouchables?’ be read as a historical question?",
      primarySources: ["B. R. Ambedkar, The Untouchables (1948)"],
      secondarySources: ["Library / encyclopaedia records of the 1948 book"],
      claimsToVerify: ["Publication date and the author’s own framing"],
      uncertaintyNotes: "The importance of the question is not the same as a settled answer.",
      evidenceVsInterpretation:
        "A. Established: Ambedkar posed this question in 1948. C. His answer is interpretation. D. Origin stories remain hypotheses.",
    },
    {
      title: "Untouchability, exclusion, and the vocabulary of social boycott",
      summary: "Define terms; separate legal description from lived exclusion.",
      historicalScope: "South Asian social practice and modern legal language.",
      keyTopics: ["untouchability", "exclusion", "Article 17 as legal description"],
      researchQuestion: "What social practices do these terms name?",
      primarySources: ["Article 17", "Ambedkar’s definitions in The Untouchables"],
      secondarySources: ["Reliable encyclopaedia entries"],
      claimsToVerify: ["Historical range of the terms"],
      uncertaintyNotes: "Words do not keep one meaning across centuries.",
      evidenceVsInterpretation: "A. Untouchability is a documented social-legal category. C. Ambedkar’s framing is his.",
    },
    {
      title: "Ambedkar’s historical argument in The Untouchables (1948)",
      summary: "Reconstruct the book’s argument as the author’s case.",
      historicalScope: "Ambedkar’s 1940s writings.",
      keyTopics: ["Ambedkar", "1948", "argument structure"],
      researchQuestion: "In what steps did Ambedkar answer why people became Untouchables?",
      primarySources: ["The Untouchables (1948)"],
      secondarySources: ["Collected works / library records"],
      claimsToVerify: ["Order of the argument in the book"],
      uncertaintyNotes: "A reconstructed argument is not established history.",
      evidenceVsInterpretation: "C. This chapter is Ambedkar’s interpretation. A. Only the text of the book is established.",
    },
    {
      title: "The Broken Men concept",
      summary: "Explain Broken Men as hypothesis, not census fact.",
      historicalScope: "Ambedkar’s proposed ancient/medieval process.",
      keyTopics: ["Broken Men", "village outskirts"],
      researchQuestion: "What does the Broken Men concept claim, and what kind of claim is it?",
      primarySources: ["The Untouchables — Broken Men chapters"],
      secondarySources: ["Later scholarly discussion, if collected"],
      claimsToVerify: ["Whether Broken Men names a verifiable historical group"],
      uncertaintyNotes: "Broken Men is an author-proposed category.",
      evidenceVsInterpretation: "C/D. Interpretation and hypothesis. E. Disputed.",
    },
    {
      title: "Buddhism, Brahmanism, and social conflict",
      summary: "Keep the Buddhist identification inside Ambedkar’s thesis.",
      historicalScope: "Ambedkar’s account of Buddhist–Brahmanical conflict.",
      keyTopics: ["Buddhism", "Brahmanism", "contempt"],
      researchQuestion: "How does Ambedkar link Buddhism to untouchability?",
      primarySources: ["The Untouchables — Buddhism argument"],
      secondarySources: ["Standard histories of Indian Buddhism, if sourced"],
      claimsToVerify: ["Broken Men as Buddhists"],
      uncertaintyNotes: "The Buddhist identification needs independent evidence.",
      evidenceVsInterpretation: "C. Ambedkar’s interpretation. A. Buddhism’s historical presence is established.",
    },
    {
      title: "Beef-eating as a historical question",
      summary: "Treat the dietary argument as a proposed explanation.",
      historicalScope: "Textual diet evidence cited by Ambedkar.",
      keyTopics: ["beef-eating", "cow", "dietary prohibition"],
      researchQuestion: "How does Ambedkar use beef-eating, and what can be verified?",
      primarySources: ["The Untouchables — diet chapters"],
      secondarySources: ["Scholarship on ancient Indian diet, if sourced"],
      claimsToVerify: ["Ancient Hindu beef-eating; dates of Brahmin renunciation"],
      uncertaintyNotes: "Dietary history is contested.",
      evidenceVsInterpretation: "C. Proposed explanation. E. Dates and causes are disputed.",
    },
    {
      title: "Ambedkar’s account of how untouchability arose",
      summary: "Stage the origin story; mark dates as hypothesis where inferential.",
      historicalScope: "Ambedkar’s proposed chronology.",
      keyTopics: ["origins", "chronology", "hereditary exclusion"],
      researchQuestion: "When and how, according to Ambedkar, did exclusion become hereditary?",
      primarySources: ["The Untouchables — origin/chronology"],
      secondarySources: ["Alternative origin theories, if sourced"],
      claimsToVerify: ["Every causal step and date"],
      uncertaintyNotes: "There is no single agreed origin date.",
      evidenceVsInterpretation: "C/D. Interpretation and hypothesis.",
    },
    {
      title: "Caste, social exclusion, and power",
      summary: "Read exclusion as a structure of power as well as a religious story.",
      historicalScope: "Caste as social-political order.",
      keyTopics: ["caste", "power", "labour"],
      researchQuestion: "How does untouchability operate inside caste power?",
      primarySources: ["Ambedkar’s caste writings present in sources"],
      secondarySources: ["Historical sociology of caste, if sourced"],
      claimsToVerify: ["Link between exclusion and economic dependence"],
      uncertaintyNotes: "Regional variation is large.",
      evidenceVsInterpretation: "A. Caste exclusion is documented. C. Causal theory is Ambedkar’s.",
    },
    {
      title: "Primary sources and historical evidence",
      summary: "Inventory real sources. Do not invent archives.",
      historicalScope: "Evidence Ambedkar used and official texts available now.",
      keyTopics: ["primary sources", "limits of evidence"],
      researchQuestion: "Which primary sources actually exist, and what do they prove?",
      primarySources: ["The Untouchables (1948)", "Article 17", "verified archive copies"],
      secondarySources: ["Library catalogues"],
      claimsToVerify: ["Existence of each cited work"],
      uncertaintyNotes: "Missing records must be stated as missing.",
      evidenceVsInterpretation: "A. Surviving texts. C. Inferences from them.",
    },
    {
      title: "Alternative explanations by later historians",
      summary: "Report later readings. Invent no critics.",
      historicalScope: "Post-1948 historiography.",
      keyTopics: ["historiography", "alternative explanations"],
      researchQuestion: "How have later scholars read or challenged the 1948 argument?",
      primarySources: ["Ambedkar’s text for comparison"],
      secondarySources: ["Only scholars actually present in the source list"],
      claimsToVerify: ["Any named critic must be sourced"],
      uncertaintyNotes: "If sources are thin, say so.",
      evidenceVsInterpretation: "B. Later scholarly interpretation. Never fabricate authors.",
    },
    {
      title: "A critical review of Ambedkar’s argument",
      summary: "Assumptions, strengths, limits.",
      historicalScope: "Internal critique of the 1948 book.",
      keyTopics: ["method", "assumptions", "limits"],
      researchQuestion: "What assumptions does the Broken Men / beef-eating case require?",
      primarySources: ["The Untouchables"],
      secondarySources: ["Collected critiques, if any"],
      claimsToVerify: ["Each causal link"],
      uncertaintyNotes: "Critique is not dismissal.",
      evidenceVsInterpretation: "C. Evaluation of an interpretation.",
    },
    {
      title: "Colonial India, the census, and caste classification",
      summary: "Census categories are not proof of ancient origins.",
      historicalScope: "Nineteenth–twentieth-century colonial enumeration.",
      keyTopics: ["census", "colonial classification", "Scheduled Castes"],
      researchQuestion: "How did the colonial census classify excluded castes?",
      primarySources: ["Census reports if collected", "official SC lists"],
      secondarySources: ["Histories of the census, if sourced"],
      claimsToVerify: ["Dates and definitions of census categories"],
      uncertaintyNotes: "Colonial categories are themselves historical constructions.",
      evidenceVsInterpretation: "A. Census documents (where held). C. They do not prove Ambedkar’s ancient chronology.",
    },
    {
      title: "The Constitution, Article 17, and legal abolition",
      summary: "Legal abolition is established fact, distinct from the 1948 hypothesis.",
      historicalScope: "1946–1950 Constituent Assembly; Article 17.",
      keyTopics: ["Article 17", "Constitution", "legal abolition"],
      researchQuestion: "How does the Constitution abolish untouchability, and why is that a different claim?",
      primarySources: ["Constitution of India, Article 17", "legislative.gov.in"],
      secondarySources: ["Official / PRS explainers"],
      claimsToVerify: ["Text of Article 17"],
      uncertaintyNotes: "Legal abolition is not instant social disappearance.",
      evidenceVsInterpretation: "A. Article 17 is established. C. The 1948 origin story is separate.",
    },
    {
      title: "Conclusion: Ambedkar’s legacy and the question today",
      summary: "Close with what a careful reader can hold as fact versus hypothesis.",
      historicalScope: "1948 to the present as a reader’s problem.",
      keyTopics: ["legacy", "Article 17", "research ethics"],
      researchQuestion: "What should a modern reader take as established, and what remains open?",
      primarySources: ["The Untouchables (1948)", "Article 17"],
      secondarySources: ["Reliable legacy overviews, if sourced"],
      claimsToVerify: ["Which claims remain research questions"],
      uncertaintyNotes: "Legacy judgments are interpretive.",
      evidenceVsInterpretation: "A. Book, Article 17. C/D. Origin narrative remains interpretation/hypothesis.",
    },
  ];
}

interface HistoricalStrategy {
  id: string;
  match: (topic: string) => boolean;
  hindi: (topic: string, n: number) => PlannedChapter[];
  english: (topic: string, n: number) => PlannedChapter[];
}

function titled(topic: string, hi: string, en: string, hindi: boolean) {
  return hindi ? hi.replace("{t}", topic) : en.replace("{t}", topic);
}

function chapterFromSeed(
  title: string,
  topic: string,
  hindi: boolean,
  extras: Partial<PlannedChapter> = {}
): PlannedChapter {
  return {
    title,
    summary:
      extras.summary ||
      (hindi
        ? `शोध-आधारित अध्याय: ${title} — विषय «${topic}» के प्राथमिक और द्वितीयक स्रोतों से।`
        : `Research chapter on ${title} for the topic “${topic}”.`),
    historicalScope:
      extras.historicalScope ||
      (hindi ? `«${topic}» से जुड़ा ऐतिहासिक दायरा; केवल सत्यापित स्रोत।` : `Historical scope of “${topic}”; verified sources only.`),
    keyTopics: extras.keyTopics?.length ? extras.keyTopics : title.split(/[—:,]/).map((s) => s.trim()).filter(Boolean).slice(0, 5),
    researchQuestion:
      extras.researchQuestion ||
      (hindi ? `${title} के बारे में प्राथमिक स्रोत क्या कहते हैं?` : `What do primary sources establish about ${title}?`),
    primarySources: extras.primarySources?.length
      ? extras.primarySources
      : [hindi ? "प्राथमिक पाठ / अभिलेख जो शोध में एकत्र हों" : "Primary texts / archives collected in research"],
    secondarySources: extras.secondarySources?.length
      ? extras.secondarySources
      : [hindi ? "विश्वसनीय द्वितीयक / विद्वत् स्रोत" : "Reliable secondary / scholarly sources"],
    claimsToVerify: extras.claimsToVerify?.length
      ? extras.claimsToVerify
      : [hindi ? "इस अध्याय के कारण-दावों की स्वतंत्र जाँच आवश्यक है।" : "Causal claims in this chapter require verification."],
    uncertaintyNotes:
      extras.uncertaintyNotes ||
      (hindi
        ? "अपर्याप्त साक्ष्य होने पर दावे को परिकल्पना या विवादित चिह्नित करें।"
        : "If evidence is thin, mark the claim as hypothesis or disputed."),
    evidenceVsInterpretation:
      extras.evidenceVsInterpretation ||
      (hindi
        ? "A. स्थापित साक्ष्य केवल उद्धृत प्राथमिक/आधिकारिक स्रोत। B. विद्वत् व्याख्या। C. यदि कोई प्राथमिक लेखक हो तो उसकी व्याख्या अलग। D. परिकल्पना। E. विवादित दावे।"
        : "A. Established evidence from cited primary/official sources only. B. Scholarly interpretation. C. A named primary author’s interpretation, separately. D. Hypothesis. E. Disputed claims."),
  };
}

function scalePlan(plan: PlannedChapter[], n: number, topic: string, hindi: boolean): PlannedChapter[] {
  if (plan.length === n) return plan;
  if (plan.length > n) {
    const keep = plan.slice(0, n);
    if (n >= 3) keep[n - 1] = plan[plan.length - 1];
    return keep;
  }
  const extra: PlannedChapter[] = [];
  let i = 0;
  while (plan.length + extra.length < n) {
    extra.push(
      chapterFromSeed(
        hindi ? `${topic}: अतिरिक्त शोध-पक्ष ${plan.length + extra.length + 1}` : `${topic}: further research theme ${plan.length + extra.length + 1}`,
        topic,
        hindi
      )
    );
    i++;
    if (i > 20) break;
  }
  return [...plan, ...extra].slice(0, n);
}

function independencePlan(topic: string, n: number, hindi: boolean): PlannedChapter[] {
  const titles = hindi
    ? [
        "भारतीय स्वतंत्रता आंदोलन: प्रश्न और ऐतिहासिक दायरा",
        "उन्नीसवीं शताब्दी की पृष्ठभूमि और 1857",
        "मध्यमार्गी राजनीति, कांग्रेस और प्रारंभिक संगठन",
        "स्वदेशी, बहिष्कार और जन-आंदोलन",
        "गाँधी, असहयोग और सविनय अवज्ञा",
        "क्रांतिकारी धाराएँ और वैकल्पिक मार्ग",
        "दलित, किसान, मजदूर और सामाजिक प्रश्न",
        "मुस्लिम राजनीति, साम्प्रदायिकता और विभाजन की पृष्ठभूमि",
        "द्वितीय विश्व युद्ध, भारत छोड़ो और 1940 का दशक",
        "प्राथमिक स्रोत: घोषणाएँ, पत्राचार, अदालती अभिलेख",
        "इतिहासकारों की प्रतिस्पर्धी व्याख्याएँ",
        "स्वतंत्रता, विभाजन और विरासत",
      ]
    : [
        "The Indian freedom struggle: question and historical scope",
        "Nineteenth-century background and 1857",
        "Early Congress politics and moderate organisation",
        "Swadeshi, boycott, and mass politics",
        "Gandhi, Non-Cooperation, and Civil Disobedience",
        "Revolutionary currents and alternative paths",
        "Dalit, peasant, and labour questions inside the movement",
        "Muslim politics, communalism, and the road to Partition",
        "The Second World War, Quit India, and the 1940s",
        "Primary sources: declarations, correspondence, court records",
        "Competing historical interpretations",
        "Independence, Partition, and legacy",
      ];
  return scalePlan(
    titles.map((t) => chapterFromSeed(t, topic, hindi)),
    n,
    topic,
    hindi
  );
}

function ancientSocietyPlan(topic: string, n: number, hindi: boolean): PlannedChapter[] {
  const titles = hindi
    ? [
        "प्राचीन भारतीय समाज: शोध-प्रश्न और स्रोतों की प्रकृति",
        "काल-विभाजन: सिंधु, वैदिक, महाजनपद, मौर्य, उत्तर-मौर्य",
        "वर्ण, जाति और सामाजिक स्तरीकरण — साक्ष्य बनाम बाद की व्याख्या",
        "अर्थव्यवस्था, कृषि और नगर",
        "धर्म, पंथ और सामाजिक आचार",
        "लिंग, परिवार और दैनिक जीवन",
        "राज्य, दंड और धर्मशास्त्र",
        "प्राथमिक स्रोत: अभिलेख, सिक्के, ग्रंथ, पुरातत्त्व",
        "इतिहास-लेखन और औपनिवेशिक निर्माण",
        "जो आज भी अनिश्चित या विवादास्पद है",
      ]
    : [
        "Ancient Indian society: research questions and the nature of sources",
        "Periodisation: Indus, Vedic, mahajanapada, Mauryan, post-Mauryan",
        "Varna, jati, and stratification — evidence versus later interpretation",
        "Economy, agriculture, and towns",
        "Religion, sects, and social ethics",
        "Gender, family, and everyday life",
        "State, punishment, and dharmashastra",
        "Primary sources: inscriptions, coins, texts, archaeology",
        "Historiography and colonial constructions",
        "What remains uncertain or disputed",
      ];
  return scalePlan(
    titles.map((t) => chapterFromSeed(t, topic, hindi)),
    n,
    topic,
    hindi
  );
}

function buddhismPlan(topic: string, n: number, hindi: boolean): PlannedChapter[] {
  const titles = hindi
    ? [
        "बौद्ध धर्म का इतिहास: प्रश्न, काल और स्रोत",
        "बुद्ध का ऐतिहासिक संदर्भ और प्रारंभिक संघ",
        "त्रिपिटक और प्रारंभिक शिक्षाएँ — पाठ बनाम परंपरा",
        "अशोक, मौर्य संरक्षण और अभिलेखीय साक्ष्य",
        "निकाय, महायान और दार्शनिक विकास",
        "भारत में विस्तार, संस्थाएँ और विहार",
        "ह्रास की व्याख्याएँ: साक्ष्य और विवाद",
        "एशिया में प्रसार",
        "आधुनिक पुनरुत्थान और आंबेडकर (केवल यदि स्रोत माँगें)",
        "इतिहास-लेखन और खुले प्रश्न",
      ]
    : [
        "History of Buddhism: questions, period, and sources",
        "The Buddha’s historical setting and the early sangha",
        "Tipitaka and early teachings — text versus tradition",
        "Ashoka, Mauryan patronage, and inscriptions",
        "Nikayas, Mahayana, and philosophical development",
        "Expansion, monasteries, and institutions in India",
        "Explanations of decline: evidence and dispute",
        "Transmission across Asia",
        "Modern revival (only where sources require it)",
        "Historiography and open questions",
      ];
  return scalePlan(
    titles.map((t) => chapterFromSeed(t, topic, hindi)),
    n,
    topic,
    hindi
  );
}

function colonialPlan(topic: string, n: number, hindi: boolean): PlannedChapter[] {
  const titles = hindi
    ? [
        "औपनिवेशिक भारत: ऐतिहासिक प्रश्न और काल-सीमा",
        "कंपनी राज्य से ब्रिटिश राज तक",
        "भूमि, राजस्व और ग्रामीण समाज",
        "ज्ञान, जनगणना और औपनिवेशिक वर्गीकरण",
        "कानून, पुलिस और राज्य-हिंसा",
        "अर्थव्यवस्था, अकाल और उद्योग",
        "सामाजिक-धार्मिक आंदोलन",
        "प्रतिरोध: 1857 से जन-आंदोलनों तक",
        "प्राथमिक स्रोत: राजकीय अभिलेख, यात्रियों के विवरण, देशी पत्रकारिता",
        "इतिहासकारों की व्याख्याएँ: राष्ट्रवादी, साम्राज्यवादी, सबaltern",
        "विरासत और उत्तर-औपनिवेशिक बहस",
      ]
    : [
        "Colonial India: historical questions and periodisation",
        "From Company rule to the British Raj",
        "Land, revenue, and rural society",
        "Knowledge, the census, and colonial classification",
        "Law, police, and state violence",
        "Economy, famine, and industry",
        "Social and religious movements",
        "Resistance: 1857 to mass movements",
        "Primary sources: official records, travelogues, vernacular press",
        "Interpretations: nationalist, imperial, subaltern",
        "Legacy and postcolonial debate",
      ];
  return scalePlan(
    titles.map((t) => chapterFromSeed(t, topic, hindi)),
    n,
    topic,
    hindi
  );
}

function constitutionPlan(topic: string, n: number, hindi: boolean): PlannedChapter[] {
  const titles = hindi
    ? [
        "भारतीय संविधान का इतिहास: शोध-प्रश्न",
        "औपनिवेशिक संवैधानिक प्रयोग और 1935 का अधिनियम",
        "राष्ट्रीय आंदोलन में संवैधानिक कल्पना",
        "संविधान सभा: संरचना, सदस्य, प्रक्रिया",
        "मौलिक अधिकार और नीति-निर्देशक तत्त्व",
        "संघवाद, भाषा और अल्पसंख्यक प्रश्न",
        "अनुच्छेद 17 और सामाजिक न्याय के प्रावधान",
        "प्रारूप समिति और आंबेडकर की भूमिका — साक्ष्य बनाम किंवदंती",
        "26 नवंबर 1949, 26 जनवरी 1950 और प्रारंभिक वर्ष",
        "प्राथमिक स्रोत: वाद-विवाद, प्रारूप, राजपत्र",
        "संशोधन और न्यायिक व्याख्या का आरंभ",
        "इतिहास-लेखन और विवादित प्रश्न",
      ]
    : [
        "History of the Indian Constitution: research questions",
        "Colonial constitutional experiments and the 1935 Act",
        "Constitutional imagination in the national movement",
        "The Constituent Assembly: membership and procedure",
        "Fundamental Rights and Directive Principles",
        "Federalism, language, and minority questions",
        "Article 17 and social-justice provisions",
        "The Drafting Committee and Ambedkar’s role — evidence versus legend",
        "26 November 1949, 26 January 1950, and the early years",
        "Primary sources: debates, drafts, gazettes",
        "Early amendments and judicial interpretation",
        "Historiography and contested questions",
      ];
  return scalePlan(
    titles.map((t) => chapterFromSeed(t, topic, hindi)),
    n,
    topic,
    hindi
  );
}

function peasantPlan(topic: string, n: number, hindi: boolean): PlannedChapter[] {
  const titles = hindi
    ? [
        "किसान आंदोलनों का इतिहास: प्रश्न और परिभाषा",
        "भूमि-व्यवस्था, राजस्व और ग्रामीण शोषण",
        "उन्नीसवीं शताब्दी के विद्रोह और क्षेत्रीय संघर्ष",
        "चम्पारण, खेड़ा, बारदोली: गाँधी और किसान",
        "तेभागा, तेलंगाना और वाम धाराएँ",
        "आदिवासी / वनवासी प्रतिरोध और किसान प्रश्न",
        "महिलाएँ, जाति और ग्रामीण आंदोलन",
        "स्वतंत्र भारत में किसान संघर्ष",
        "प्राथमिक स्रोत: याचिकाएँ, अखबार, अदालती फ़ाइलें",
        "इतिहास-लेखन: rascal, सबaltern, राजनीतिक-अर्थशास्त्र",
        "विरासत और समकालीन बहस",
      ]
    : [
        "History of peasant movements: questions and definitions",
        "Land systems, revenue, and rural extraction",
        "Nineteenth-century revolts and regional struggles",
        "Champaran, Kheda, Bardoli: Gandhi and peasants",
        "Tebhaga, Telangana, and left currents",
        "Adivasi resistance and the agrarian question",
        "Women, caste, and rural movements",
        "Peasant struggles in independent India",
        "Primary sources: petitions, newspapers, court files",
        "Historiography: rascal, subaltern, political economy",
        "Legacy and contemporary debate",
      ];
  return scalePlan(
    titles.map((t) => chapterFromSeed(t, topic, hindi)),
    n,
    topic,
    hindi
  );
}

const STRATEGIES: HistoricalStrategy[] = [
  {
    id: "indian-independence",
    match: (t) =>
      /स्वतंत्रता आंदोलन|indian independence|freedom struggle|quit india|भारत छोड़ो|1857/.test(t.toLowerCase()),
    hindi: (topic, n) => independencePlan(topic, n, true),
    english: (topic, n) => independencePlan(topic, n, false),
  },
  {
    id: "ancient-india",
    match: (t) => /प्राचीन भारतीय समाज|ancient indian society|vedic society|सिंधु घाटी|mauryan society/.test(t.toLowerCase()),
    hindi: (topic, n) => ancientSocietyPlan(topic, n, true),
    english: (topic, n) => ancientSocietyPlan(topic, n, false),
  },
  {
    id: "buddhism-history",
    match: (t) => /बौद्ध धर्म का इतिहास|history of buddhism|buddhist history|बुद्ध का इतिहास/.test(t.toLowerCase()),
    hindi: (topic, n) => buddhismPlan(topic, n, true),
    english: (topic, n) => buddhismPlan(topic, n, false),
  },
  {
    id: "colonial-india",
    match: (t) => /औपनिवेशिक भारत|colonial india|british raj|कंपनी राज/.test(t.toLowerCase()),
    hindi: (topic, n) => colonialPlan(topic, n, true),
    english: (topic, n) => colonialPlan(topic, n, false),
  },
  {
    id: "constitution-history",
    match: (t) =>
      /संविधान का इतिहास|history of (the )?indian constitution|constituent assembly|संविधान सभा/.test(t.toLowerCase()),
    hindi: (topic, n) => constitutionPlan(topic, n, true),
    english: (topic, n) => constitutionPlan(topic, n, false),
  },
  {
    id: "peasant-movements",
    match: (t) => /किसान आंदोलन|peasant movement|tebhaga|telangana revolt|champaran/.test(t.toLowerCase()),
    hindi: (topic, n) => peasantPlan(topic, n, true),
    english: (topic, n) => peasantPlan(topic, n, false),
  },
];

function genericHistoricalPlan(topic: string, n: number, hindi: boolean, analysis: TopicAnalysis): PlannedChapter[] {
  const short = topic.replace(/\s+/g, " ").trim();
  const titles = hindi
    ? [
        `${short}: ऐतिहासिक प्रश्न और दायरा`,
        `${short} की पृष्ठभूमि और काल-सीमा`,
        `${short} की प्रमुख घटनाएँ और मोड़`,
        `${short} के प्रमुख व्यक्ति और संस्थाएँ`,
        `${short} में विचार, संघर्ष और सत्ता`,
        `${short} के प्राथमिक स्रोत और प्रमाण`,
        `${short} पर इतिहासकारों की व्याख्याएँ`,
        `${short}: विवाद, अनिश्चितता और खुले प्रश्न`,
        `${short} की विरासत और समकालीन पाठ`,
        `${short}: निष्कर्ष और आगे की शोध-दिशा`,
      ]
    : [
        `${short}: historical question and scope`,
        `Background and periodisation of ${short}`,
        `Turning points in ${short}`,
        `Key people and institutions in ${short}`,
        `Ideas, conflict, and power in ${short}`,
        `Primary sources and evidence for ${short}`,
        `Historians’ interpretations of ${short}`,
        `${short}: disputes, uncertainties, and open questions`,
        `Legacy and contemporary readings of ${short}`,
        `${short}: conclusion and further research`,
      ];
  const qs = analysis.researchQuestions || [];
  const planned = titles.map((t, i) =>
    chapterFromSeed(t, topic, hindi, {
      researchQuestion: qs[i] || undefined,
    })
  );
  return scalePlan(planned, n, topic, hindi);
}

export function plannedChaptersForTopic(opts: {
  topic: string;
  settings: EbookSettings;
  analysis: TopicAnalysis;
  requestedCount: number;
  sources?: SourceRecord[];
}): PlannedChapter[] {
  const { topic, settings, analysis, requestedCount, sources = [] } = opts;
  const hindi = isHindiOutput(analysis.outputLanguage || settings.outputLanguage || settings.language);
  const n = Math.max(4, Math.min(20, requestedCount || 10));

  if (isAchhootResearchTopic(topic)) {
    const full = hindi ? achhootHindiPlan() : achhootEnglishPlan();
    if (hindi) return full.slice(0, Math.max(full.length, n)).slice(0, 14);
    return scalePlan(full, n, topic, false);
  }

  const strategy = STRATEGIES.find((s) => s.match(topic) || s.match(`${topic} ${settings.type}`));
  if (strategy) return hindi ? strategy.hindi(topic, n) : strategy.english(topic, n);

  // Every remaining topic gets a discipline-appropriate, source-derived plan.
  // The old behaviour dropped generic topics into a single "historical"
  // template and padded any shortfall with "<topic>: अतिरिक्त शोध-पक्ष 12",
  // which is precisely the generic output this rebuild removes.
  const topical = buildTopicalPlan({ topic, analysis, settings, sources, count: n });
  if (topical.length) return topical;

  return [];
}

export function plannedToOutlineItems(
  plan: PlannedChapter[],
  bundle: { sources: SourceRecord[]; facts: ExtractedFact[] }
): OutlineItem[] {
  return plan.map((ch, i) =>
    fillOutlineItem(
      {
        id: nanoid(8),
        chapterNumber: i + 1,
        title: ch.title,
        summary: ch.summary,
        purpose: ch.summary,
        historicalScope: ch.historicalScope,
        researchQuestion: ch.researchQuestion,
        researchQuestions: [ch.researchQuestion],
        keyTopics: ch.keyTopics,
        primarySources: ch.primarySources,
        secondarySources: ch.secondarySources,
        claimsToVerify: ch.claimsToVerify,
        importantClaims: ch.claimsToVerify,
        uncertaintyNotes: ch.uncertaintyNotes,
        evidenceVsInterpretation: ch.evidenceVsInterpretation,
        sourceIds: [],
        children: [],
      },
      i,
      bundle
    )
  );
}

function pickSourceTitles(sources: SourceRecord[], pred: (s: SourceRecord) => boolean, fallback: string[]): string[] {
  const hit = sources.filter(pred).slice(0, 4).map((s) => {
    const year = s.year || (s.publishedAt ? s.publishedAt.slice(0, 4) : "");
    const author = s.author || s.organization;
    return [s.title, author, year].filter(Boolean).join(" — ");
  });
  return hit.length ? hit : fallback;
}

export function fillOutlineItem(
  item: OutlineItem,
  index: number,
  bundle: { sources: SourceRecord[]; facts: ExtractedFact[] }
): OutlineItem {
  const title = item.title.trim();
  const primary = pickSourceTitles(
    bundle.sources,
    (s) => Boolean(s.primarySource) || s.sourceType === "primary" || s.sourceType === "legal" || s.sourceType === "archive",
    item.primarySources || []
  );
  const secondary = pickSourceTitles(
    bundle.sources,
    (s) => Boolean(s.academicSource) || s.sourceType === "secondary" || s.sourceType === "scholarly" || s.sourceType === "encyclopedia",
    item.secondarySources || []
  );
  const relatedFacts = (bundle.facts || [])
    .filter((f) => title.split(/\s+/).some((w) => w.length > 3 && f.text.toLowerCase().includes(w.toLowerCase())))
    .slice(0, 4)
    .map((f) => f.text);
  const researchQuestion =
    item.researchQuestion ||
    item.researchQuestions?.[0] ||
    `${title} के बारे में स्रोत क्या स्थापित करते हैं?`;
  return {
    ...item,
    chapterNumber: item.chapterNumber || index + 1,
    title,
    summary: item.summary || item.purpose || title,
    purpose: item.purpose || item.summary || title,
    historicalScope: item.historicalScope || item.summary || title,
    researchQuestion,
    researchQuestions: item.researchQuestions?.length ? item.researchQuestions : [researchQuestion],
    keyTopics: item.keyTopics?.length ? item.keyTopics : title.split(/[—:,/]/).map((s) => s.trim()).filter(Boolean).slice(0, 6),
    primarySources: item.primarySources?.length ? item.primarySources : primary.length ? primary : ["शोध में एकत्र प्राथमिक स्रोत — अध्याय से मिलाएँ"],
    secondarySources: item.secondarySources?.length ? item.secondarySources : secondary.length ? secondary : ["शोध में एकत्र द्वितीयक / विद्वत् स्रोत"],
    claimsToVerify: item.claimsToVerify?.length
      ? item.claimsToVerify
      : item.importantClaims?.length
        ? item.importantClaims
        : relatedFacts.length
          ? relatedFacts
          : ["इस अध्याय के कारण-दावों की स्वतंत्र जाँच आवश्यक है।"],
    importantClaims: item.importantClaims?.length ? item.importantClaims : item.claimsToVerify || relatedFacts,
    uncertaintyNotes:
      item.uncertaintyNotes ||
      "अपर्याप्त साक्ष्य होने पर दावे को स्थापित तथ्य न लिखें; परिकल्पना या विवादित चिह्नित करें।",
    evidenceVsInterpretation:
      item.evidenceVsInterpretation ||
      "A. स्थापित ऐतिहासिक साक्ष्य — केवल उद्धृत प्राथमिक/आधिकारिक स्रोत। B. विद्वत् व्याख्या। C. आंबेडकर या अन्य प्राथमिक लेखक की व्याख्या (यदि लागू)। D. परिकल्पना। E. विवादित/अनिश्चित दावे।",
    evidence: item.evidence?.length ? item.evidence : relatedFacts,
    sourceIds: item.sourceIds?.length ? item.sourceIds : bundle.sources.slice(0, 8).map((s) => s.id),
  };
}

export function assertNoAmbedkarLeak(topic: string, items: OutlineItem[]) {
  if (isAchhootResearchTopic(topic)) return;
  const leaked = items.filter((it) => /broken men|अछूत कौन थे और प्रश्न|गोमांस\/Beef-eating/i.test(it.title));
  if (leaked.length >= 3) {
    throw new Error("Ambedkar chapter plan leaked into an unrelated topic.");
  }
}

export function historicalPeriodFor(topic: string, analysis?: TopicAnalysis): string {
  if (isAchhootResearchTopic(topic)) return "प्राचीन काल से 1950 — आंबेडकर 1948 / संविधान 1950";
  if (/स्वतंत्रता|independence|1857/.test(topic.toLowerCase())) return "c. 1857–1947";
  if (/औपनिवेशिक|colonial|raj/.test(topic.toLowerCase())) return "c. 1757–1947";
  if (/संविधान|constitution/.test(topic.toLowerCase())) return "1935–1950";
  if (/बौद्ध|buddhis/.test(topic.toLowerCase())) return "c. 5th century BCE – present";
  if (/प्राचीन|ancient|vedic/.test(topic.toLowerCase())) return "c. 2600 BCE – 600 CE";
  return analysis?.summary?.slice(0, 80) || "";
}

export type { TopicProfile };
