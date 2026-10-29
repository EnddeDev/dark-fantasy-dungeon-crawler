import type { CSSProperties, ReactNode } from "react";
import type { RarityTier } from "../game/types";

/** Рамки карточек по редкости: обычное — обычная, редкое — сине-голубая, эпическое — фиолетовое, легендарное — золотое. */
export const RARITY_STYLE: Record<RarityTier, CSSProperties> = {
  common: { borderColor: "#322720" },
  rare: {
    borderColor: "#3f86c8",
    boxShadow: "inset 0 0 30px -16px #5aa9e6, 0 0 24px -16px #5aa9e6",
  },
  epic: {
    borderColor: "#8b5cf6",
    boxShadow: "inset 0 0 30px -16px #a78bfa, 0 0 24px -16px #a78bfa",
  },
  legendary: {
    borderColor: "#e0a33c",
    boxShadow: "inset 0 0 30px -14px #f6d48a, 0 0 26px -14px #e0a33c",
  },
};

export const RARITY_FRAME: Record<RarityTier, string> = {
  common: "border-line",
  rare: "border-[#3f86c8]",
  epic: "border-[#8b5cf6]",
  legendary: "border-[#e0a33c]",
};

export const RARITY_TEXT: Record<RarityTier, string> = {
  common: "text-mute",
  rare: "text-[#5aa9e6]",
  epic: "text-[#a78bfa]",
  legendary: "text-flamehi",
};

export function RarityBadge({ tier, className = "" }: { tier: RarityTier; className?: string }) {
  return (
    <span
      style={RARITY_STYLE[tier]}
      className={`inline-block border px-1.5 py-[3px] font-mono text-[0.64rem] uppercase leading-none tracking-[0.08em] ${RARITY_TEXT[tier]} ${className}`}
    >
      {tier === "common" ? "обычное" : tier === "rare" ? "редкое" : tier === "epic" ? "эпическое" : "легендарное"}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  tone = "ghost",
  className = "",
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "ghost" | "flame" | "danger" | "verd";
  className?: string;
  title?: string;
  type?: "button" | "submit";
}) {
  const tones: Record<string, string> = {
    ghost: "border-line bg-slab2/70 text-parch hover:border-flamedim hover:text-flamehi hover:bg-slab2",
    flame: "border-flamedim bg-flame text-ink hover:bg-flamehi shadow-[0_0_28px_-8px_#e0a33c]",
    danger: "border-rubric/60 bg-slab2/70 text-rubric hover:bg-rubric hover:text-parch",
    verd: "border-verd/60 bg-slab2/70 text-verd hover:bg-verd hover:text-ink",
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-[2px] border px-4 py-2.5 font-display text-[0.78rem] uppercase leading-none tracking-[0.16em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame/70 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-line disabled:hover:text-parch ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Meter({
  value,
  max,
  tone = "flame",
  className = "",
  ticks = 10,
}: {
  value: number;
  max: number;
  tone?: "flame" | "rubric" | "verd" | "paper";
  className?: string;
  ticks?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const bar: Record<string, string> = {
    flame: "linear-gradient(180deg,#f6d48a,#e0a33c 55%,#8a5f1e)",
    rubric: "linear-gradient(180deg,#e0705f,#c0392b 55%,#6d1a14)",
    verd: "linear-gradient(180deg,#8fc4ae,#5f8f7a 55%,#2e4c41)",
    paper: "linear-gradient(180deg,#f0e4c8,#d9c9a6 55%,#8f7f5e)",
  };
  return (
    <div className={`relative h-3 w-full overflow-hidden border border-line bg-black/60 ${className}`}>
      <div
        className="h-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: bar[tone] }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, rgba(0,0,0,0.55) 0 1px, transparent 1px ${100 / ticks}%)`,
        }}
      />
    </div>
  );
}

export function Pips({ value, tone = "#e0a33c" }: { value: number; tone?: string }) {
  return (
    <span className="inline-flex gap-[3px]">
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className="h-[7px] w-[7px] border"
          style={{
            borderColor: i < value ? tone : "#322720",
            background: i < value ? tone : "transparent",
            boxShadow: i === 4 || i === 9 ? `0 0 0 1px ${i < value ? tone : "#4a3a2e"}` : undefined,
          }}
        />
      ))}
    </span>
  );
}

export function Panel({
  children,
  className = "",
  title,
  right,
  style,
  onMouseEnter,
  onMouseLeave,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  right?: ReactNode;
  style?: CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <section
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
      className={`border border-line bg-slab/90 shadow-[inset_0_1px_0_rgba(246,212,138,0.06)] ${className}`}
    >
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-line/80 px-3 py-2">
          <h3 className="sc text-flamedim">{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Rune({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 8" className={`h-2 w-10 text-flamedim ${className}`} aria-hidden>
      <path d="M0 4h13M27 4h13" stroke="currentColor" strokeWidth="1" />
      <path d="M20 0.5 24 4l-4 3.5L16 4z" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function Modal({
  title,
  sub,
  children,
  actions,
  onClose,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
  actions: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-[3px]">
      <div className="rise w-full max-w-lg border border-line bg-slab shadow-[0_40px_90px_-30px_rgba(0,0,0,1)]">
        <div className="border-b border-line bg-slab2/60 px-5 py-4">
          <div className="mb-1 flex items-center justify-between gap-4">
            <h2 className="font-display text-xl uppercase tracking-[0.14em] text-flamehi">{title}</h2>
            {onClose && (
              <button
                onClick={onClose}
                className="text-mute transition-colors hover:text-rubric"
                aria-label="Закрыть"
              >
                ✕
              </button>
            )}
          </div>
          {sub && <p className="text-sm text-mute italic">{sub}</p>}
        </div>
        {children && <div className="px-5 py-4 text-[0.95rem] leading-relaxed text-parch">{children}</div>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-black/30 px-5 py-3">{actions}</div>
      </div>
    </div>
  );
}

export function Tag({
  children,
  tone = "mute",
  title,
}: {
  children: ReactNode;
  tone?: "mute" | "flame" | "verd" | "rubric";
  title?: string;
}) {
  const t: Record<string, string> = {
    mute: "border-line text-mute",
    flame: "border-flamedim text-flame",
    verd: "border-verd/70 text-verd",
    rubric: "border-rubric/70 text-rubric",
  };
  return (
    <span title={title} className={`inline-block border px-1.5 py-[3px] font-mono text-[0.66rem] leading-none ${t[tone]}`}>
      {children}
    </span>
  );
}
