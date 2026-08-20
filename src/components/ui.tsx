import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function Btn({
  children,
  onClick,
  variant = "ghost",
  size = "md",
  disabled,
  title,
  icon,
  className = "",
  type,
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "primary" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  title?: string;
  icon?: IconName;
  className?: string;
  type?: "button" | "submit";
}) {
  const v = variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "";
  const s = size === "sm" ? "btn-sm" : size === "lg" ? "!py-2.5 !px-5 !text-[0.9rem]" : "";
  return (
    <button
      type={type ?? "button"}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`btn ${v} ${s} ${className}`}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 13 : 15} />}
      {children}
    </button>
  );
}

const tones: Record<string, [string, string]> = {
  neutral: ["var(--bg3)", "var(--muted)"],
  accent: ["var(--accent-soft)", "var(--accent)"],
  teal: ["var(--teal-soft)", "var(--teal)"],
  ok: ["var(--ok-soft)", "var(--ok)"],
  warn: ["var(--warn-soft)", "var(--warn)"],
  err: ["var(--err-soft)", "var(--err)"],
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  pulse,
}: {
  tone?: keyof typeof tones;
  icon?: IconName;
  children: ReactNode;
  pulse?: boolean;
}) {
  const [bg, fg] = tones[tone];
  return (
    <span
      className="chip"
      style={{ background: bg, color: fg, borderColor: "transparent" }}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="lbl mb-1.5 block">{label}</span>
      {children}
      {hint && (
        <span className="mt-1 block text-[0.7rem] leading-snug" style={{ color: "var(--faint)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <select
      className="input"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors"
      style={{
        borderColor: checked ? "color-mix(in srgb, var(--accent) 55%, transparent)" : "var(--line)",
        background: checked ? "var(--accent-soft)" : "var(--bg3)",
      }}
    >
      <span
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
        style={{ background: checked ? "var(--accent)" : "var(--bg4)" }}
      >
        <span
          className="absolute h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.82rem] font-bold leading-tight">{label}</span>
        {hint && (
          <span className="block text-[0.7rem] leading-snug" style={{ color: "var(--faint)" }}>
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

export function Progress({ value, tone = "accent" }: { value: number; tone?: "accent" | "ok" | "teal" }) {
  const color = tone === "ok" ? "var(--ok)" : tone === "teal" ? "var(--teal)" : "var(--accent)";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bg3)" }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  );
}

export function Bar({
  label,
  value,
  display,
  tone = "teal",
}: {
  label: string;
  value: number; // 0..100
  display?: string;
  tone?: "accent" | "teal" | "ok" | "warn";
}) {
  const color =
    tone === "accent" ? "var(--accent)" : tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--teal)";
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[0.68rem] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg3)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
        />
      </div>
      <span className="mono w-20 shrink-0 text-right text-[0.68rem]" style={{ color: "var(--muted)" }}>
        {display ?? `${Math.round(value)}%`}
      </span>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]">
      <div className="fixed inset-0" style={{ background: "rgba(5,7,10,0.72)" }} onClick={onClose} />
      <div
        className={`panel slide-in relative z-10 w-full ${wide ? "max-w-2xl" : "max-w-md"} p-5`}
        role="dialog"
        aria-modal
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-[1rem] font-bold">{title}</h3>
          <Btn size="sm" icon="x" onClick={onClose} title="Close" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "accent" | "teal" | "ok" | "warn" | "err";
}) {
  const color =
    tone === "accent" ? "var(--accent)" :
    tone === "teal" ? "var(--teal)" :
    tone === "ok" ? "var(--ok)" :
    tone === "warn" ? "var(--warn)" :
    tone === "err" ? "var(--err)" : "var(--text)";
  return (
    <div className="panel-inset px-3 py-2.5">
      <div className="lbl">{label}</div>
      <div className="font-display mt-1 text-[1.02rem] font-bold leading-tight" style={{ color }}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 truncate text-[0.68rem]" style={{ color: "var(--faint)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="mono rounded border px-1.5 py-0.5 text-[0.65rem] font-semibold"
      style={{ borderColor: "var(--line2)", background: "var(--bg3)", color: "var(--muted)" }}
    >
      {children}
    </kbd>
  );
}

export function SectionTitle({
  icon,
  children,
  right,
}: {
  icon?: IconName;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-display flex items-center gap-2 text-[0.95rem] font-bold tracking-tight">
        {icon && <Icon name={icon} size={16} style={{ color: "var(--accent)" }} />}
        {children}
      </h2>
      {right}
    </div>
  );
}
