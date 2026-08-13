import { LANGUAGES } from "./types";

const SCRIPT_TESTS: { code: string; re: RegExp }[] = [
  { code: "hi", re: /[\u0900-\u097F]/ },
  { code: "bn", re: /[\u0980-\u09FF]/ },
  { code: "pa", re: /[\u0A00-\u0A7F]/ },
  { code: "gu", re: /[\u0A80-\u0AFF]/ },
  { code: "or", re: /[\u0B00-\u0B7F]/ },
  { code: "ta", re: /[\u0B80-\u0BFF]/ },
  { code: "te", re: /[\u0C00-\u0C7F]/ },
  { code: "kn", re: /[\u0C80-\u0CFF]/ },
  { code: "ml", re: /[\u0D00-\u0D7F]/ },
  { code: "si", re: /[\u0D80-\u0DFF]/ },
  { code: "th", re: /[\u0E00-\u0E7F]/ },
  { code: "ar", re: /[\u0600-\u06FF]/ },
  { code: "he", re: /[\u0590-\u05FF]/ },
  { code: "ru", re: /[\u0400-\u04FF]/ },
  { code: "zh", re: /[\u4E00-\u9FFF]/ },
  { code: "ja", re: /[\u3040-\u30FF]/ },
  { code: "ko", re: /[\uAC00-\uD7AF]/ },
];

const HI_MARKERS = ["का", "की", "के", "है", "में", "और", "एक", "यह", "भारत", "कक्षा", "इतिहास", "जीवनी"];
const MR_MARKERS = ["आहे", "मध्ये", "करण्या", "मराठी", "महाराष्ट्र"];
const NE_MARKERS = ["छ", "हो", "नेपाल", "गर्ने"];
const UR_MARKERS = ["ہے", "کی", "میں", "اور", "اردو", "پاکستان"];
const AR_MARKERS = ["في", "من", "على", "هذا", "العربية"];

export function detectScriptLanguage(text: string): string {
  const sample = text.slice(0, 800);
  for (const t of SCRIPT_TESTS) {
    if (t.re.test(sample)) {
      if (t.code === "hi") {
        if (countHits(sample, MR_MARKERS) > countHits(sample, HI_MARKERS)) return "mr";
        if (countHits(sample, NE_MARKERS) > 0 && countHits(sample, NE_MARKERS) >= countHits(sample, HI_MARKERS))
          return "ne";
        return "hi";
      }
      if (t.code === "ar") {
        if (countHits(sample, UR_MARKERS) > countHits(sample, AR_MARKERS)) return "ur";
        return "ar";
      }
      return t.code;
    }
  }
  return "en";
}

function countHits(text: string, words: string[]) {
  return words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
}

export function resolveOutputLanguage(selected: string, topic: string): string {
  if (!selected || selected === "auto") return detectScriptLanguage(topic);
  return selected;
}

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name || code;
}

export function languageNative(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.native || code;
}

export function wikiLang(code: string): string {
  const map: Record<string, string> = {
    zh: "zh",
    ja: "ja",
    ko: "ko",
    pt: "pt",
    auto: "en",
  };
  return map[code] || code;
}

export function isRtl(code: string) {
  return code === "ar" || code === "ur" || code === "he" || code === "fa";
}

export const UI_STRINGS: Record<string, Record<string, string>> = {
  en: {
    researching: "Researching topic...",
    finding: "Finding reliable sources...",
    structure: "Creating ebook structure...",
    writing: "Writing chapters...",
    factcheck: "Fact checking...",
    preparing: "Preparing download...",
  },
  hi: {
    researching: "विषय पर शोध हो रहा है...",
    finding: "विश्वसनीय स्रोत खोजे जा रहे हैं...",
    structure: "पुस्तक की रूपरेखा बन रही है...",
    writing: "अध्याय लिखे जा रहे हैं...",
    factcheck: "तथ्यों की जाँच हो रही है...",
    preparing: "डाउनलोड तैयार हो रहा है...",
  },
};
