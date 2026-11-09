"use client";

import { useCallback, useState } from "react";
import { Btn, Field, SectionTitle, Select } from "./ui";
import { Icon } from "./icons";
import { SOURCE_LANGS, TARGET_LANGS, langFlag } from "@/lib/types";
import { translateTexts } from "@/lib/client";

const OPUS_LANGUAGES = [
  { code: "ja", name: "Japanese (日本語)", flag: "🇯🇵" },
  { code: "ta", name: "Tamil (தமிழ்)", flag: "🇮🇳" },
  { code: "hi", name: "Hindi (हिन्दी)", flag: "🇮🇳" },
  { code: "te", name: "Telugu (తెలుగు)", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam (മലയാളം)", flag: "🇮🇳" },
  { code: "kn", name: "Kannada (ಕನ್ನಡ)", flag: "🇮🇳" },
  { code: "fr", name: "French (Français)", flag: "🇫🇷" },
  { code: "de", name: "German (Deutsch)", flag: "🇩🇪" },
  { code: "es", name: "Spanish (Español)", flag: "🇪🇸" },
  { code: "zh", name: "Chinese (中文)", flag: "🇨🇳" },
  { code: "ar", name: "Arabic (العربية)", flag: "🇸🇦" },
];

export default function TranslationView({
  onToast,
  onBack,
}: {
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
  onBack?: () => void;
}) {
  const [sourceLang, setSourceLang] = useState("ja");
  const [targetLang, setTargetLang] = useState("en");
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [translating, setTranslating] = useState(false);
  const [charCount, setCharCount] = useState(0);

  const handleTranslate = useCallback(async () => {
    const raw = inputText.trim();
    if (!raw) {
      onToast("warn", "Please enter some text to translate.");
      return;
    }

    setTranslating(true);
    try {
      // Split into lines or paragraphs to preserve structure
      const lines = raw.split("\n");
      const results = await translateTexts(lines, sourceLang, targetLang);
      setOutputText(results.join("\n"));
      onToast("ok", "Translation completed via local OPUS-MT model!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Translation failed";
      onToast("err", msg);
    } finally {
      setTranslating(false);
    }
  }, [inputText, sourceLang, targetLang, onToast]);

  const copyResult = () => {
    if (!outputText) return;
    navigator.clipboard.writeText(outputText);
    onToast("ok", "Copied translation to clipboard!");
  };

  const swapLanguages = () => {
    // If source isn't en and target is en
    if (targetLang === "en" && sourceLang !== "en") {
      onToast("info", "OPUS-MT local engine specializes in Source → English on your hardware.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <Btn size="sm" icon="chevron-right" onClick={onBack} title="Back to Studio">
              Studio
            </Btn>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI Neural Machine Translation</h1>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Direct local multilingual OPUS-MT neural engine (Japanese, Tamil, Hindi, Dravidian, French, German to English)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip" style={{ background: "var(--teal-soft)", color: "var(--teal)" }}>
            <Icon name="spark" size={12} />
            Helsinki-NLP OPUS Local · Free & Private
          </span>
        </div>
      </div>

      {/* Language Selector Bar */}
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-56">
            <label className="lbl mb-1 block text-xs">Source Language</label>
            <select
              className="input text-sm"
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
            >
              {OPUS_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={swapLanguages}
            className="btn btn-sm mt-5 flex h-9 w-9 items-center justify-center rounded-lg border"
            style={{ borderColor: "var(--line)" }}
            title="Swap"
          >
            <Icon name="waveform" size={14} />
          </button>

          <div className="w-56">
            <label className="lbl mb-1 block text-xs">Target Language</label>
            <select
              className="input text-sm"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
            >
              <option value="en">🇬🇧 English</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-4 md:pt-0">
          <Btn
            size="md"
            variant="primary"
            icon="spark"
            disabled={translating || !inputText.trim()}
            onClick={handleTranslate}
          >
            {translating ? "Translating with OPUS..." : "Translate Text"}
          </Btn>
        </div>
      </div>

      {/* Side by side Text Editors */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Source Text Box */}
        <div className="panel flex flex-col p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
              Source Text ({inputText.length} chars)
            </span>
            {inputText && (
              <button
                type="button"
                onClick={() => setInputText("")}
                className="text-xs hover:underline"
                style={{ color: "var(--err)" }}
              >
                Clear
              </button>
            )}
          </div>
          <textarea
            className="input min-h-[340px] flex-1 resize-y p-3 text-sm leading-relaxed"
            placeholder={`Enter or paste your text here (e.g. Japanese: こんにちは / Tamil: வணக்கம், எப்படி இருக்கீங்க?)...`}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              setCharCount(e.target.value.length);
            }}
          />
        </div>

        {/* Target Translation Box */}
        <div className="panel flex flex-col p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
              English Translation
            </span>
            {outputText && (
              <Btn size="sm" icon="check" onClick={copyResult}>
                Copy Translation
              </Btn>
            )}
          </div>
          <textarea
            readOnly
            className="input min-h-[340px] flex-1 resize-y p-3 text-sm leading-relaxed"
            style={{ background: "var(--bg-inset)" }}
            placeholder="Translations will appear here..."
            value={outputText}
          />
        </div>
      </div>

      {/* Preset Quick Prompts for Multilingual Testing */}
      <div className="panel p-4">
        <SectionTitle>Quick Multilingual Test Prompts</SectionTitle>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            className="chip cursor-pointer hover:border-accent"
            onClick={() => {
              setSourceLang("ja");
              setInputText("こんにちは！AIビデオ字幕ジェネレーターへようこそ。高精度のニューラル翻訳をテストしています。");
            }}
          >
            🇯🇵 Japanese Sample
          </button>
          <button
            type="button"
            className="chip cursor-pointer hover:border-accent"
            onClick={() => {
              setSourceLang("ta");
              setInputText("வணக்கம் நண்பா! இந்த புதிய வீடியோ வசன மொழிபெயர்ப்பு கருவி சிறப்பாக செயல்படுகிறது.");
            }}
          >
            🇮🇳 Tamil Sample
          </button>
          <button
            type="button"
            className="chip cursor-pointer hover:border-accent"
            onClick={() => {
              setSourceLang("hi");
              setInputText("नमस्ते! यह नया वीडियो सबटाइटल जनरेटर बहुत अच्छा काम करता है।");
            }}
          >
            🇮🇳 Hindi Sample
          </button>
          <button
            type="button"
            className="chip cursor-pointer hover:border-accent"
            onClick={() => {
              setSourceLang("fr");
              setInputText("Bonjour! C'est un test de traduction neuronale locale de haute qualité.");
            }}
          >
            🇫🇷 French Sample
          </button>
        </div>
      </div>
    </div>
  );
}
