"use client";

import { Field, Modal, SectionTitle, Select, Toggle, Btn } from "./ui";
import { Icon } from "./icons";
import type { StudioSettings } from "@/lib/types";

export interface Prefs {
  theme: "dark" | "light";
  fs: "md" | "lg" | "xl";
  contrast: boolean;
}

export default function SettingsModal({
  open,
  onClose,
  prefs,
  setPrefs,
  settings,
  setSettings,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  settings: StudioSettings;
  setSettings: (patch: Partial<StudioSettings>) => void;
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Settings" wide>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <SectionTitle icon="eye">Appearance & accessibility</SectionTitle>
          <div className="space-y-3">
            <Field label="Theme">
              <Select
                value={prefs.theme}
                onChange={(v) => setPrefs({ ...prefs, theme: v as Prefs["theme"] })}
                options={[
                  { value: "dark", label: "Dark (studio)" },
                  { value: "light", label: "Light" },
                ]}
              />
            </Field>
            <Field label="Interface font size">
              <Select
                value={prefs.fs}
                onChange={(v) => setPrefs({ ...prefs, fs: v as Prefs["fs"] })}
                options={[
                  { value: "md", label: "Default" },
                  { value: "lg", label: "Large" },
                  { value: "xl", label: "Extra large" },
                ]}
              />
            </Field>
            <Toggle
              checked={prefs.contrast}
              onChange={(v) => setPrefs({ ...prefs, contrast: v })}
              label="High contrast mode"
              hint="stronger borders and text for low-vision use"
            />
          </div>
        </div>

        <div>
          <SectionTitle icon="gear">Pipeline defaults</SectionTitle>
          <div className="space-y-3">
            <Field label="Profanity handling">
              <Select
                value={settings.profanityMode}
                onChange={(v) => setSettings({ profanityMode: v as StudioSettings["profanityMode"] })}
                options={[
                  { value: "preserve", label: "Preserve exactly (default)" },
                  { value: "censor", label: "Censor (****)" },
                  { value: "mild", label: "Replace with milder language" },
                ]}
              />
            </Field>
            <Field label={`Max subtitle duration: ${settings.maxDurationSec}s`}>
              <input
                type="range" min={4} max={12} step={1}
                value={settings.maxDurationSec}
                onChange={(e) => setSettings({ maxDurationSec: Number(e.target.value) })}
                className="w-full"
              />
            </Field>
            <Field label={`Reading speed limit: ${settings.cpsLimit} CPS`}>
              <input
                type="range" min={12} max={24} step={1}
                value={settings.cpsLimit}
                onChange={(e) => setSettings({ cpsLimit: Number(e.target.value) })}
                className="w-full"
              />
            </Field>
            <Toggle
              checked={settings.autoProcessNew}
              onChange={(v) => setSettings({ autoProcessNew: v })}
              label="Auto-process new files"
              hint="web equivalent of the watch-folder: new uploads start immediately"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <SectionTitle icon="shield">Processing & privacy</SectionTitle>
          <div className="panel-inset space-y-2 px-4 py-3 text-[0.78rem] leading-relaxed" style={{ color: "var(--muted)" }}>
            <div className="flex items-center gap-2 font-bold" style={{ color: "var(--ok)" }}>
              <Icon name="shield" size={14} /> Local by default
            </div>
            <p>
              Everything runs on the studio server and this browser. No media, transcript or subtitle is uploaded to any
              third party. Logs never contain dialogue text — only counts, languages and timings.
            </p>
            <p className="text-[0.72rem]" style={{ color: "var(--faint)" }}>
              Optional cloud ASR providers (OpenAI Whisper, Google, Azure) plug into the same engine interface. They are
              disabled in this build until a provider key is configured server-side and FFmpeg is available for chunk
              extraction. When enabled, the badge in the header switches from “Local processing” to “Cloud API”.
            </p>
            <div className="flex justify-end pt-1">
              <Btn size="sm" onClick={onClose}>Done</Btn>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
