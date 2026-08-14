/**
 * Cross-script term matching for research relevance.
 *
 * The relevance system must understand that these refer to the same things:
 *   वेदांत = वेदान्त = Vedanta = Vedānta
 *   शंकराचार्य = Shankaracharya = Śaṅkarācārya
 *
 * It provides:
 *  - foldDevanagari: canonicalises anusvara/conjunct-nasal spelling variants
 *    (वेदान्त -> वेदांत) and strips nukta so spelling variants match.
 *  - stripLatinDiacritics: Vedānta -> vedanta, Śaṅkarācārya -> sankaracarya.
 *  - looseLatin: collapses common transliteration ambiguities (sh/s, ch/c,
 *    doubled vowels) so "Shankaracharya" and "Śaṅkarācārya" compare equal.
 *  - translitDevanagariToLatin: a compact ISO-ish transliterator good enough
 *    for term matching (not for display).
 *  - textHasTerm / termVariants: script-agnostic containment checks used by
 *    the source-relevance scorer and chapter matchers.
 */

const DEV_CONSONANTS: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n",
  च: "c", छ: "ch", ज: "j", झ: "jh", ञ: "n",
  ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n",
  त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "ph", ब: "b", भ: "bh", म: "m",
  य: "y", र: "r", ल: "l", व: "v", श: "sh",
  ष: "sh", स: "s", ह: "h",
  क़: "q", ख़: "kh", ग़: "g", ज़: "z", ड़: "r", ढ़: "rh", फ़: "f", य़: "y",
};

const DEV_VOWELS: Record<string, string> = {
  अ: "a", आ: "a", इ: "i", ई: "i", उ: "u", ऊ: "u",
  ऋ: "ri", ए: "e", ऐ: "ai", ओ: "o", औ: "au",
  ऍ: "e", ऑ: "o",
};

const DEV_MATRAS: Record<string, string> = {
  "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u",
  "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
  "ॅ": "e", "ॉ": "o",
};

const VIRAMA = "्";
const ANUSVARA = "ं";
const CANDRABINDU = "ँ";
const VISARGA = "ः";
const NUKTA = "़";

export function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text || "");
}

/**
 * Canonicalise Devanagari spelling variants:
 *  - homorganic nasal + virama -> anusvara  (वेदान्त -> वेदांत)
 *  - candrabindu -> anusvara
 *  - strip nukta
 */
export function foldDevanagari(text: string): string {
  return (text || "")
    .replace(new RegExp(`[नमङञण]${VIRAMA}(?=[\u0915-\u0939])`, "g"), ANUSVARA)
    .replace(new RegExp(CANDRABINDU, "g"), ANUSVARA)
    .replace(new RegExp(NUKTA, "g"), "");
}

/** Vedānta -> vedanta, Śaṅkarācārya -> sankaracarya (NFD + strip marks). */
export function stripLatinDiacritics(text: string): string {
  return (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Collapse common transliteration ambiguities so alternate romanisations
 * compare equal: sh->s, chh/ch->c, doubled vowels, w->v, q->k.
 * Only used for fuzzy term comparison, never for display.
 */
export function looseLatin(text: string): string {
  return stripLatinDiacritics((text || "").toLowerCase())
    .replace(/chh/g, "c")
    .replace(/ch/g, "c")
    .replace(/sh/g, "s")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/dh/g, "d")
    .replace(/bh/g, "b")
    .replace(/gh/g, "g")
    .replace(/kh/g, "k")
    .replace(/jh/g, "j")
    .replace(/aa/g, "a")
    .replace(/ee/g, "i")
    .replace(/ii/g, "i")
    .replace(/oo/g, "u")
    .replace(/uu/g, "u")
    .replace(/w/g, "v")
    .replace(/q/g, "k")
    .replace(/x/g, "ks");
}

/** Compact Devanagari -> Latin transliteration for matching purposes. */
export function translitDevanagariToLatin(text: string): string {
  const src = foldDevanagari(text || "");
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (DEV_CONSONANTS[ch]) {
      out += DEV_CONSONANTS[ch];
      const next = src[i + 1];
      if (next === VIRAMA) {
        i++; // no inherent vowel
      } else if (next && DEV_MATRAS[next]) {
        out += DEV_MATRAS[next];
        i++;
      } else if (next === ANUSVARA) {
        out += "an";
        i++;
      } else {
        out += "a";
      }
    } else if (DEV_VOWELS[ch]) {
      out += DEV_VOWELS[ch];
    } else if (ch === ANUSVARA) {
      out += "n";
    } else if (ch === VISARGA) {
      out += "h";
    } else if (/[\u0966-\u096F]/.test(ch)) {
      out += String(ch.charCodeAt(0) - 0x0966);
    } else if (/[\u0900-\u097F]/.test(ch)) {
      // other Devanagari signs — skip
    } else {
      out += ch;
    }
  }
  // trailing inherent 'a' is usually dropped in Hindi romanisation (Vedant/Vedanta)
  return out.toLowerCase();
}

/** Strip common Hindi plural / oblique suffixes for stem matching. */
export function hindiStem(word: string): string {
  const w = foldDevanagari(word || "");
  return w
    .replace(/(ियों|ियाँ|ियां|ाओं|ाएँ|ाएं|ओं|एँ|एं|ों|ें|ीं)$/u, "")
    .replace(/(ता|त्व|पन)$/u, "");
}

/** All matchable spellings of a term across scripts. */
export function termVariants(term: string): string[] {
  const t = (term || "").trim().toLowerCase();
  if (!t) return [];
  const out = new Set<string>();
  if (hasDevanagari(t)) {
    const folded = foldDevanagari(t);
    out.add(folded);
    const stem = hindiStem(folded);
    if (stem.length >= 3) out.add(stem);
    const latin = looseLatin(translitDevanagariToLatin(folded));
    if (latin.length >= 3) {
      out.add(latin);
      if (latin.endsWith("a")) out.add(latin.slice(0, -1)); // vedanta / vedant
      else out.add(latin + "a");
    }
  } else {
    const loose = looseLatin(t);
    out.add(loose);
    if (loose.endsWith("a") && loose.length > 4) out.add(loose.slice(0, -1));
  }
  return [...out].filter((v) => v.length >= 3);
}

/** Fold arbitrary text into the two comparison spaces (native + loose latin). */
export function foldedForms(text: string): { native: string; latin: string } {
  const lower = (text || "").toLowerCase();
  const native = foldDevanagari(lower);
  const latinParts = [looseLatin(lower)];
  if (hasDevanagari(lower)) latinParts.push(looseLatin(translitDevanagariToLatin(native)));
  return { native, latin: latinParts.join(" ") };
}

function latinWordsOf(latin: string): string[] {
  return latin.split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
}

/**
 * Latin-space match: substring, or stem/prefix relation between whole words.
 * This lets "Shankara" match "Śaṅkarācārya" (sankara ⊂ sankaracarya) and
 * "उपनिषद" match "Upanishads" despite suffix differences.
 */
function latinMatch(latin: string, latinWords: string[], v: string): boolean {
  if (latin.includes(v)) return true;
  if (v.length < 5) return false;
  for (const w of latinWords) {
    if (v.startsWith(w) || w.startsWith(v)) return true;
  }
  return false;
}

/** Script-agnostic containment: does `text` mention `term` in any spelling? */
export function textHasTerm(text: string, term: string): boolean {
  if (!text || !term) return false;
  const { native, latin } = foldedForms(text);
  const latinWords = latinWordsOf(latin);
  for (const v of termVariants(term)) {
    if (hasDevanagari(v)) {
      if (native.includes(v)) return true;
    } else if (latinMatch(latin, latinWords, v)) {
      return true;
    }
  }
  return false;
}

/** Count occurrences of a single term (any spelling) inside `text`. */
export function countTermOccurrences(text: string, term: string): number {
  if (!text || !term) return 0;
  const { native, latin } = foldedForms(text);
  let count = 0;
  for (const v of termVariants(term)) {
    const hay = hasDevanagari(v) ? native : latin;
    let idx = 0;
    while ((idx = hay.indexOf(v, idx)) !== -1) {
      count++;
      idx += v.length;
      if (count > 50) return count;
    }
    if (count) break; // count only the best-matching variant
  }
  return count;
}

/** Count how many of `terms` appear (any spelling) in `text`. */
export function termsInText(text: string, terms: string[]): string[] {
  if (!text) return [];
  const { native, latin } = foldedForms(text);
  const latinWords = latinWordsOf(latin);
  const hits: string[] = [];
  for (const term of terms) {
    let found = false;
    for (const v of termVariants(term)) {
      if (hasDevanagari(v) ? native.includes(v) : latinMatch(latin, latinWords, v)) {
        found = true;
        break;
      }
    }
    if (found) hits.push(term);
  }
  return hits;
}
