/**
 * Built-in offline engine.
 *
 * This sandbox has no Whisper/CUDA runtime, so the studio ships with a
 * deterministic offline engine that models the full ASR + translation
 * pipeline: global-timeline slotting (so overlapping chunks produce the
 * SAME segments, letting the merge stage genuinely dedupe them),
 * code-switching, non-speech events, seeded hallucination artifacts,
 * glossary application and profanity handling.
 *
 * The engine is clearly labeled in the UI. A cloud ASR adapter slot is
 * reserved for future providers behind the same interface.
 */

export const SLOT_SEC = 12;

export interface Phrase {
  src: string;
  t: Record<string, string>;
}

export interface DemoBank {
  code: string;
  name: string;
  flag: string;
  phrases: Phrase[];
}

const bank = (code: string, name: string, flag: string, phrases: Phrase[]): DemoBank => ({
  code,
  name,
  flag,
  phrases,
});

export const BANKS: Record<string, DemoBank> = {
  en: bank("en", "English", "🇬", [
    {
      src: "Bro, we have to submit this project by tomorrow morning.",
      t: { ta: "நாம் இந்த project-ஐ நாளை காலைக்குள் submit பண்ணணும்.", hi: "बhai, हमें इस project को कल सुबह से पहले जमा करना होगा।", ja: "兄弟、このプロジェクトは明日の朝までに提出しなきゃいけないんだ。" },
    },
    {
      src: "The train to Chennai departs at nine o'clock.",
      t: { ta: "சென்னை செல்லும் ரயில் நண்பநேரத்தில் புறப்படும்.", hi: "चेन्नई की ट्रेन नौ बजे रवाना होगी।", ja: "チェन्नई行きの列車は9時に発車します。" },
    },
    {
      src: "I told you the server crashed again last night.",
      t: { ta: "நேற்று இரவு சர்வர் மீண்டும் கிராஷ் ஆயிடுச்சுன்னு சொன்னேனே.", hi: "मैंने कहा था कि बीज रात को सर्वर फिर क्रैश हो गया।", ja: "昨夜またサーバーが落ちたっていっただろう。" },
    },
    {
      src: "Let's grab a filter coffee before the meeting.",
      t: { ta: "மிட்டின்பலவ் முன்னால் ஒரு ஃபில்டர் காபி பிடிக்கலாம்.", hi: "मीटिंग से पहले एक फ़िल्टर चाय पी लीजिए।", ja: "会議の前にフィルターコーヒーでも飲もう。" },
    },
    {
      src: "The deadline moved up, so everyone work faster this week.",
      t: { ta: "டெட்லைன் முன்னாற நகர்ச்சு, அனைவரும் இந்த வாரம் வேகமா வேலை செய்யுங்க.", hi: "डेडलाइन आगे बढ़ गई है, इसलिए इस हफ्ते सभी ज़्यादा तेज़ काम करें।", ja: "締め切りが早くなったから、今週は全員もう少し早く動こう。" },
    },
    {
      src: "Damn, I completely forgot about the review call.",
      t: { ta: "நன்றாக, நான் ரिवிউ காலை முழுக்க எதிர்பார்த்தேன்.", hi: "हम, मैंने रिव्यू कॉल की पूरी तरह भूल गया था।", ja: "もう、レビューの電話のことはすっかり忘れてた。" },
    },
  ]),
  ja: bank("ja", "Japanese", "🇯🇵", [
    {
      src: "今日は映画について話します。",
      t: { en: "We are going to talk about the movie today.", ta: "இன்று நாம் திரைப்படம் பற்றி பேசுகிறோம்.", hi: "आज हम इस फ़िल्म के बारे में बात करेंगे।" },
    },
    {
      src: "この映画は本当に面白いです。",
      t: { en: "This movie is really interesting.", ta: "இந்த திரைப்படம் மிகவும் நல்லதாக உள்ளது.", hi: "यह फ़िल्म सच में बहुत रोचक है।" },
    },
    {
      src: "Gojo, 明日の予定はある？",
      t: { en: "Gojo, do you have any plans for tomorrow?", ta: "கோஜோ, நாளை உனக்கு ஏதேனும் திட்டம் இருக்கா?", hi: "गोजो, कल तुम्हारे कोई प्लान हैं?", ja: "Gojo, 明日の予定はある？" },
    },
    {
      src: "駅まで一緒に歩いていこう。",
      t: { en: "Let's walk to the station together.", ta: "நீரகத்திற்கு ஒன்றாக நடக்கலாம்.", hi: "चलो स्टेशन तक साथ में चलते हैं।", ja: "駅まで一緒に歩いていこう。" },
    },
    {
      src: "会議はもう終わったよ。",
      t: { en: "The meeting is already over.", ta: "கூட்டல் ஏற்கனவே முடிந்துவிட்டது.", hi: "मीटिंग तो खत्म हो चुकी है।", ja: "会議はもう終わったよ。" },
    },
    {
      src: "今夜は少し遅くなるかもしれません。",
      t: { en: "It might get a little late tonight.", ta: "இன்றை இரவு சற்று தாமதமாக இருக்கலாம்.", hi: "आज रात थोड़ा देर हो सकता है।", ja: "今夜は少し遅くなるかもしれません。" },
    },
  ]),
  ta: bank("ta", "Tamil", "🇮", [
    {
      src: "நாம் நாளை சென்னைக்கு போகிறோம்.",
      t: { en: "We are going to Chennai tomorrow.", ta: "நாம் நாளை சென்னைக்கு போகிறோம்.", hi: "हम कल चेन्नई जा रहे हैं।", ja: "私たちは明日チェンナイに行く。" },
    },
    {
      src: "அண்ணா, இன்று நிறைய வேலை இருந்தது.",
      t: { en: "Anna, there was a lot of work today.", ta: "அண்ணா, இன்று நிறைய வேலை இருந்தது.", hi: "अनन्ना, आज बहुत सारा काम था।", ja: "アンナ、今日は仕事がたくさんだったね。" },
    },
    {
      src: "இந்த project-ஐ நாளையே submit பண்ணணும்.",
      t: { en: "We need to submit this project tomorrow.", ta: "இந்த project-ஐ நாளையே submit பண்ணணும்.", hi: "यह project कल ही जमा करना होगा।", ja: "このプロジェクトは明日までに提出しないといけない。" },
    },
    {
      src: "காபி தயார், வா வா.",
      t: { en: "The coffee is ready, come on.", ta: "காபி தயார், வா வா.", hi: "चाय तैयार है, आइए आइए।", ja: "コーヒーの準備ができてるから、きてきて。" },
    },
    {
      src: "அந்த படம் ரொம்ப நன்றாக இருந்தது.",
      t: { en: "That film was really great.", ta: "அந்த படம் ரொம்ப நன்றாக இருந்தது.", hi: "वह फ़िल्म सच में बहुत अच्छी थी।", ja: "あの映画は本当に素晴らしかった。" },
    },
    {
      src: "சிறிது தாமதமாகவே இருக்கிறேன்.",
      t: { en: "I am running a little late.", ta: "சிறிது தாமதமாகவே இருக்கிறேன்.", hi: "मैं थोड़ा देर से आ रहा हूँ।", ja: "ちょっと遅れてるんだ。" },
    },
  ]),
  hi: bank("hi", "Hindi", "🇮", [
    {
      src: "कल हम मुंबई जा रहे हैं।",
      t: { en: "We are heading to Mumbai tomorrow.", ta: "நாம் நாளை மும்பைக்குச் செல்கிறோம்.", hi: "कल हम मुंबई जा रहे हैं।", ja: "明日ムンバイに行くんだ。" },
    },
    {
      src: "इस फ़िल्म ने दिल छू लिया।",
      t: { en: "This film truly touched the heart.", ta: "இந்தப் படம் மனதைத் தொட்டது.", hi: "इस फ़िल्म ने दिल छू लिया।", ja: "この映画は本当に心を打った。" },
    },
    {
      src: "चाय पीकर आते हैं, पाँच मिनट लगेंगे।",
      t: { en: "Let's have some tea first, it will take five minutes.", ta: "முதலில் காபி குடிப்போம், ஐந்து நிமிடம் ஆகும்.", hi: "चाय पीकर आते हैं, पाँच मिनट लगेंगे।", ja: "お茶でも飲んでくるから、5分くらいかかるよ。" },
    },
    {
      src: "बॉस ने मीटिंग कल के लिए तय की है।",
      t: { en: "The boss has scheduled the meeting for tomorrow.", ta: "பாஸும் நாளைக்கு மீட்டிங்கை ஏற்படுத்தியுள்ளார்.", hi: "बॉस ने मीटिंग कल के लिए तय की है।", ja: "ボスは明日の会議を決めてる。" },
    },
    {
      src: "बस का टाइम पास हो गया।",
      t: { en: "The bus time has passed.", ta: "பஸ் நேரம் முடிந்துவிட்டது.", hi: "बस का टाइम पास हो गया।", ja: "バスの時間は過ぎてしまった。" },
    },
    {
      src: "ये जगह बहुत शांत है।",
      t: { en: "This place is very quiet.", ta: "இடம் மிகவும் அமைதியாக உள்ளது.", hi: "ये जगह बहुत शांत है।", ja: "この場所は本当に静かだ。" },
    },
  ]),
};

// ---- deterministic PRNG -------------------------------------------------

export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- language selection ---------------------------------------------------

export function projectLanguages(seed: string, sourceLang: string): string[] {
  if (sourceLang && sourceLang !== "auto") {
    return [BANKS[sourceLang] ? sourceLang : "en"];
  }
  const codes = Object.keys(BANKS);
  const primary = codes[hashSeed(seed) % codes.length];
  const r = hashSeed(seed + ":mix") % 100;
  if (r < 35) {
    let secondary = codes[hashSeed(seed + ":sec") % codes.length];
    let guard = 0;
    while (secondary === primary && guard++ < 4) secondary = codes[hashSeed(seed + ":sec" + guard) % codes.length];
    return [primary, secondary];
  }
  return [primary];
}

// ---- post processing ------------------------------------------------------

const PROFANITY: Array<[string, string]> = [
  ["Damn", "Oh"],
  ["damn", "oh"],
];

export function applyProfanity(text: string, mode: "preserve" | "censor" | "mild"): string {
  if (mode === "preserve") return text;
  let out = text;
  if (mode === "censor") {
    for (const [w] of PROFANITY) out = out.split(w).join("****");
  } else {
    for (const [w, mild] of PROFANITY) out = out.split(w).join(mild);
  }
  return out;
}

export function applyGlossary(text: string, glossary: Array<{ term: string; translation: string }>): string {
  let out = text;
  for (const g of glossary) {
    if (!g.term) continue;
    out = out.split(g.term).join(g.translation);
  }
  return out;
}

export function autoPunctuate(text: string, lang: string): string {
  let t = text.trim();
  if (!t) return t;
  const endsPunct = /[.!?…।।।。？！]$/.test(t);
  if (!endsPunct) t += lang === "ja" ? "。" : ".";
  if (/[a-z]/.test(t[0])) t = t[0].toUpperCase() + t.slice(1);
  return t;
}

// ---- engine ---------------------------------------------------------------

export interface EngineSegment {
  startMs: number;
  endMs: number;
  speaker: string | null;
  original: string;
  translation: string;
  confidence: number;
  kind: "speech" | "event";
  lang: string;
}

export interface EngineOptions {
  seed: string;
  durationSec: number;
  startSec: number;
  endSec: number;
  sourceLang: string;
  targetLang: string;
  diarization: boolean;
  nonSpeechEvents: boolean;
  profanityMode: "preserve" | "censor" | "mild";
  autoPunctuate: boolean;
  glossary: Array<{ term: string; translation: string }>;
}

const EVENTS = ["[♪ Music playing]", "[Laughter]", "[Applause]", "[Background noise]"];

export interface EngineResult {
  segments: EngineSegment[];
  primaryLang: string;
  langs: string[];
  note: string | null;
}

function segmentForSlot(
  slot: number,
  langs: string[],
  primary: string,
  o: EngineOptions,
): EngineSegment | null {
  const rng = mulberry32(hashSeed(`${o.seed}:slot:${slot}`));
  const base = slot * SLOT_SEC;
  const roll = rng();
  const speaker = o.diarization ? (slot % 2 === 0 ? "Speaker 1" : "Speaker 2") : null;
  const pickLang = slot % 5 === 3 && langs.length > 1 ? langs[1] : primary;

  if (o.nonSpeechEvents && roll < 0.07) {
    const ev = EVENTS[Math.floor(rng() * EVENTS.length)];
    const start = base + rng() * 4;
    return {
      startMs: Math.round(start * 1000),
      endMs: Math.round((start + 2.5) * 1000),
      speaker: null,
      original: ev,
      translation: ev,
      confidence: Math.round(68 + rng() * 22),
      kind: "event",
      lang: pickLang,
    };
  }

  // A seeded, deterministic "hallucination" artifact lands near the middle
  // of the program when the slot is otherwise silent — used by the
  // hallucination detector.
  const halluSlot = Math.floor((o.durationSec * 0.55) / SLOT_SEC);
  const isHallu = slot === halluSlot && roll >= 0.94 && o.durationSec > 90;

  if (roll >= 0.72 && !isHallu) return null; // silence

  const start = base + rng() * 3.5;
  if (start + 1.5 < o.startSec || start >= o.endSec) return null;
  const dur = 2 + rng() * 3.2;
  const lang = isHallu ? primary : pickLang;
  const b = BANKS[lang];
  const phrase = b.phrases[Math.floor(rng() * b.phrases.length)];

  let original = isHallu ? "Thank you for watching this video, please like and subscribe." : phrase.src;
  let translation: string;
  if (o.targetLang === "original" || o.targetLang === lang) {
    translation = original;
  } else if (isHallu) {
    translation = "Thank you for watching this video, please like and subscribe.";
  } else {
    translation = phrase.t[o.targetLang] ?? phrase.t.en ?? phrase.src;
  }

  if (o.autoPunctuate) {
    original = autoPunctuate(original, lang);
    if (translation !== original) translation = autoPunctuate(translation, o.targetLang === "ja" ? "ja" : lang);
  }
  original = applyProfanity(original, o.profanityMode);
  translation = applyGlossary(translation, o.glossary);
  if (translation !== original) translation = applyProfanity(translation, o.profanityMode);

  return {
    startMs: Math.round(start * 1000),
    endMs: Math.round(Math.min(start + dur, (o.endSec || start + dur + 1) * 1000) * 1000),
    speaker,
    original,
    translation,
    confidence: Math.round(82 + rng() * 17),
    kind: "speech",
    lang,
  };
}

/**
 * Deterministic per-slot generation: two chunks that overlap on the same
 * global slots produce identical segments, which the merge stage dedupes.
 */
export function transcribeChunk(o: EngineOptions): EngineResult {
  const langs = projectLanguages(o.seed, o.sourceLang);
  const primary = langs[0];
  const note =
    o.sourceLang !== "auto" && o.sourceLang !== "original" && !BANKS[o.sourceLang]
      ? `Sample corpus for ${o.sourceLang.toUpperCase()} is not bundled in the offline engine — English corpus used for this demo run.`
      : null;

  const first = Math.floor(o.startSec / SLOT_SEC);
  const last = Math.ceil(o.endSec / SLOT_SEC);
  const segments: EngineSegment[] = [];
  for (let s = first; s < last; s++) {
    const seg = segmentForSlot(s, langs, primary, o);
    if (seg) {
      // clamp the segment into the chunk window
      if (seg.startMs < Math.floor(o.startSec * 1000)) seg.startMs = Math.floor(o.startSec * 1000);
      const maxEnd = Math.round(o.endSec * 1000);
      if (seg.endMs > maxEnd) seg.endMs = maxEnd;
      if (seg.endMs > seg.startMs) segments.push(seg);
    }
  }
  segments.sort((a, b) => a.startMs - b.startMs);
  return { segments, primaryLang: primary, langs, note };
}

/** Simulated engine wall time for a chunk of the given size + model speed. */
export function simulatedWorkMs(chunkSec: number, speedFactor: number, mode: string): number {
  const modeFactor = mode === "high" ? 0.8 : mode === "fast" ? 1.25 : 1;
  const base = (chunkSec / 60) * 1400;
  const ms = (base / Math.max(0.15, speedFactor)) * modeFactor;
  return Math.round(Math.min(9000, Math.max(650, ms)));
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
