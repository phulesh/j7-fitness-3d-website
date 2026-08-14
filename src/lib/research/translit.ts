/**
 * Cross-script matching helpers.
 *
 * Two problems make Devanagari topics unmatchable against real sources:
 *
 * 1. Orthographic variance — "वेदांत" (anusvara) and "वेदान्त" (conjunct nasal)
 *    are the same word with different code points, as are ि/ी and ु/ू in loose
 *    spelling. Exact substring matching therefore misses obvious hits.
 * 2. Script mismatch — a Hindi topic must still be researched against English
 *    scholarship. "वेदांत" has to reach a page that only ever writes "Vedanta".
 *
 * `foldIndic` solves (1) and `transliterateDevanagari` solves (2). Both are
 * deliberately lossy: they exist for *matching*, never for display, and never
 * for generating text shown to a reader.
 */

const CONSONANTS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v", "ळ": "l",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h",
  "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f",
};

const VOWEL_SIGNS: Record<string, string> = {
  "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u",
  "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
  "ॉ": "o", "ॅ": "e",
};

const INDEPENDENT_VOWELS: Record<string, string> = {
  "अ": "a", "आ": "a", "इ": "i", "ई": "i", "उ": "u", "ऊ": "u",
  "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
  "ऑ": "o",
};

const VIRAMA = "\u094D";
const ANUSVARA = "\u0902";
const CHANDRABINDU = "\u0901";
const VISARGA = "\u0903";
const NUKTA = "\u093C";

/**
 * Romanise Devanagari into a loose ASCII form suitable for substring matching
 * against English text. Inherent-'a' handling is approximate by design.
 */
export function transliterateDevanagari(input: string): string {
  if (!input) return "";
  const text = input.normalize("NFC");
  let out = "";

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === NUKTA) continue;
    if (ch === VISARGA) {
      out += "h";
      continue;
    }
    if (ch === ANUSVARA || ch === CHANDRABINDU) {
      // Nasal before a consonant is realised as n/m; both are folded to "n"
      // because English transcriptions vary freely (Vedanta / Vedaanta).
      out += "n";
      continue;
    }
    if (ch === VIRAMA) continue;

    if (INDEPENDENT_VOWELS[ch]) {
      out += INDEPENDENT_VOWELS[ch];
      continue;
    }
    if (VOWEL_SIGNS[ch]) {
      out += VOWEL_SIGNS[ch];
      continue;
    }

    const cons = CONSONANTS[ch];
    if (cons) {
      out += cons;
      // Add the inherent 'a' unless a vowel sign or virama follows. An
      // anusvara does NOT suppress it: "शं" is "shan", not "shn".
      const suppress = next === VIRAMA || (next !== undefined && VOWEL_SIGNS[next] !== undefined);
      if (!suppress) out += "a";
      continue;
    }

    out += ch;
  }

  return out;
}

/**
 * Collapse orthographic variants so the same word matches itself regardless of
 * spelling choice. Applied to both needle and haystack.
 */
export function foldIndic(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFC");
  // Conjunct nasals (न् / म् / ण् before a consonant) behave like anusvara.
  s = s.replace(/[\u0928\u092E\u0923]\u094D(?=[\u0915-\u0939])/g, ANUSVARA);
  s = s.replace(new RegExp(`[${CHANDRABINDU}]`, "g"), ANUSVARA);
  // Long/short vowel and sibilant distinctions are unreliable in casual text.
  s = s
    .replace(/\u0940/g, "\u093F")
    .replace(/\u0942/g, "\u0941")
    .replace(/\u0908/g, "\u0907")
    .replace(/\u090A/g, "\u0909")
    .replace(/\u0906/g, "\u0905")
    .replace(/\u0937/g, "\u0936")
    .replace(new RegExp(NUKTA, "g"), "");
  return s;
}

/** Loose ASCII fold so "vedanta", "vedaanta" and "vedant" all compare equal. */
export function foldLatin(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/aa/g, "a")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/v/g, "w")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasDevanagari(s: string): boolean {
  return /[\u0900-\u097F]/.test(s || "");
}

/**
 * Hindi -> English equivalents for high-frequency academic vocabulary.
 *
 * Romanising "इतिहास" yields "itihasa", which never occurs in English
 * scholarship that simply says "history". This lexicon exists purely so
 * cross-script relevance matching can see that correspondence. It is never
 * used to generate reader-facing text or citations.
 */
const HI_EN_EQUIVALENTS: Record<string, string[]> = {
  "इतिहास": ["history", "historical"],
  "ऐतिहासिक": ["historical", "history"],
  "दर्शन": ["philosophy", "philosophical", "darshana"],
  "दार्शनिक": ["philosopher", "philosophical"],
  "विकास": ["development", "evolution", "growth"],
  "प्रमुख": ["major", "principal", "leading", "prominent"],
  "आचार्य": ["acharya", "teacher", "preceptor", "master"],
  "सिद्धांत": ["doctrine", "theory", "principle"],
  "विचार": ["thought", "idea", "concept"],
  "अवधारणा": ["concept", "notion"],
  "परंपरा": ["tradition", "lineage"],
  "साहित्य": ["literature", "texts"],
  "ग्रंथ": ["text", "treatise", "scripture"],
  "शास्त्र": ["scripture", "science", "treatise"],
  "धर्म": ["religion", "dharma"],
  "समाज": ["society", "social"],
  "संस्कृति": ["culture", "cultural"],
  "राजनीति": ["politics", "political"],
  "अर्थशास्त्र": ["economics", "economy"],
  "विज्ञान": ["science", "scientific"],
  "गणित": ["mathematics", "math"],
  "भौतिकी": ["physics"],
  "रसायन": ["chemistry", "chemical"],
  "जीव": ["biology", "life", "organism"],
  "शिक्षा": ["education", "pedagogy"],
  "आंदोलन": ["movement"],
  "स्वतंत्रता": ["independence", "freedom"],
  "संविधान": ["constitution", "constitutional"],
  "संवैधानिक": ["constitutional", "constitution"],
  "प्रावधान": ["provision", "clause", "article"],
  "अनुच्छेद": ["article", "clause"],
  "भारत": ["india", "indian", "bharat"],
  "भारतीय": ["indian", "india"],
  "अधिकार": ["right", "rights", "authority"],
  "कर्तव्य": ["duty", "duties"],
  "न्यायालय": ["court", "judiciary"],
  "सर्वोच्च": ["supreme", "highest"],
  "संसद": ["parliament", "parliamentary"],
  "सरकार": ["government", "governance"],
  "राज्य": ["state", "province"],
  "नागरिक": ["citizen", "civic"],
  "स्वराज": ["swaraj", "self-rule"],
  "अस्पृश्यता": ["untouchability", "untouchable"],
  "जाति": ["caste", "jati"],
  "सभा": ["assembly", "council"],
  "निर्माण": ["making", "formation", "construction"],
  "संशोधन": ["amendment", "revision"],
  "कानून": ["law", "legal"],
  "युद्ध": ["war", "battle"],
  "साम्राज्य": ["empire", "imperial"],
  "प्राचीन": ["ancient"],
  "मध्यकालीन": ["medieval"],
  "आधुनिक": ["modern"],
  "उपनिषद": ["upanishad", "upanisad"],
  "वेद": ["veda", "vedic"],
  "योग": ["yoga"],
  "मोक्ष": ["moksha", "liberation"],
  "ब्रह्म": ["brahman", "brahma"],
  "आत्मा": ["atman", "self", "soul"],
  "माया": ["maya", "illusion"],
  "अद्वैत": ["advaita", "nondualism", "non-dualism", "monism"],
  "द्वैत": ["dvaita", "dualism"],
  "विशिष्टाद्वैत": ["vishishtadvaita", "visistadvaita"],
  "भक्ति": ["bhakti", "devotion"],
  "ज्ञान": ["jnana", "knowledge"],
  "कर्म": ["karma", "action"],
};

/** English equivalents registered for a Devanagari term, if any. */
export function englishEquivalents(term: string): string[] {
  const key = foldIndic((term || "").trim());
  for (const [hi, en] of Object.entries(HI_EN_EQUIVALENTS)) {
    if (foldIndic(hi) === key) return en;
  }
  return [];
}

/**
 * All comparable forms of a term: folded native script plus a romanised form
 * (and a trailing-'a' variant, since "vedanta"/"vedant" both occur).
 */
export function matchForms(term: string): string[] {
  const forms = new Set<string>();
  const trimmed = (term || "").trim();
  if (!trimmed) return [];

  if (hasDevanagari(trimmed)) {
    forms.add(foldIndic(trimmed));
    const roman = foldLatin(transliterateDevanagari(trimmed));
    if (roman.length >= 3) {
      forms.add(roman);
      if (roman.endsWith("a")) forms.add(roman.slice(0, -1));
      // Long Sanskrit compounds are frequently shortened in English writing
      // ("शंकराचार्य" -> "Shankara"). A 7-character stem is long enough to stay
      // discriminating while catching those.
      if (roman.length >= 10) forms.add(roman.slice(0, 7));
    }
    for (const en of englishEquivalents(trimmed)) forms.add(foldLatin(en));
  } else {
    forms.add(foldLatin(trimmed));
  }
  return [...forms].filter((f) => f.length >= 2);
}

/**
 * Build a haystack that can be searched with any of the forms above.
 * Returns folded-native and folded-latin views of the same text.
 */
export function matchHaystack(text: string): { indic: string; latin: string } {
  const t = text || "";
  return { indic: foldIndic(t.toLowerCase()), latin: foldLatin(t) };
}

/** True when `term` occurs in `hay` under any script/spelling variant. */
export function termOccurs(term: string, hay: { indic: string; latin: string }): boolean {
  for (const form of matchForms(term)) {
    if (!form) continue;
    if (/[\u0900-\u097F]/.test(form)) {
      if (hay.indic.includes(form)) return true;
    } else if (hay.latin.includes(form)) {
      return true;
    }
  }
  return false;
}
