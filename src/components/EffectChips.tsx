import { useState } from "react";
import {
  EFFECT_CHIPS_VISIBLE,
  durationLabel,
  dotSummary,
  type EffectChip,
} from "../game/effects";
import { EffectGlyph, ImmunityShield } from "./EffectIcon";

/**
 * Полоса эффектов: усиления в синей рамке со свечением внутрь, дебаффы —
 * в рамке своего цвета, иммунитеты — со щитом за глифом.
 * Наведение (или тап) раскрывает подсказку: срок, что делает, сколько урона.
 */

const POLARITY_LABEL: Record<string, string> = {
  good: "усиление",
  bad: "дебафф",
};

function ChipFace({ chip, size }: { chip: EffectChip; size: number }) {
  const buff = chip.polarity === "good";
  return (
    <span
      className="relative flex items-center justify-center"
      style={{
        width: size,
        height: size,
        border: `1.5px solid ${buff ? "#5b8dd6" : chip.color}`,
        background: buff ? "rgba(37,63,102,0.55)" : "rgba(12,10,9,0.72)",
        boxShadow: buff
          ? `inset 0 0 ${Math.round(size * 0.42)}px rgba(91,141,214,0.55), 0 0 6px rgba(91,141,214,0.35)`
          : "none",
        color: buff ? "#a8c6f0" : chip.color,
      }}
    >
      {chip.immune && <ImmunityShield size={size - 2} />}
      <EffectGlyph id={chip.id} size={Math.round(size * 0.62)} className="relative" />
      {chip.badge && (
        <span
          className="absolute -bottom-1 -right-1 border border-current bg-soot px-0.5 font-mono text-[0.6rem] leading-[1.1]"
          style={{ color: chip.color }}
        >
          {chip.badge}
        </span>
      )}
      {!chip.badge && chip.rounds != null && chip.rounds > 0 && !chip.unit && (
        <span className="absolute -bottom-1 -right-1 min-w-[0.95rem] border border-line bg-soot px-0.5 text-center font-mono text-[0.6rem] leading-[1.1] text-parch">
          {chip.rounds}
        </span>
      )}
    </span>
  );
}

function ChipTip({ chip }: { chip: EffectChip }) {
  const buff = chip.polarity === "good";
  const accent = buff ? "#8fb8ec" : chip.color;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-[min(19rem,72vw)] border bg-black/95 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.75)]"
      style={{ borderColor: accent }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center" style={{ color: accent }}>
          <EffectGlyph id={chip.id} size={17} />
        </span>
        <span className="min-w-0 flex-1 font-display text-[0.92rem] uppercase tracking-[0.06em]" style={{ color: accent }}>
          {chip.name}
        </span>
        <span className="shrink-0 font-mono text-[0.66rem] uppercase text-mute">
          {chip.immune ? "иммунитет" : POLARITY_LABEL[chip.polarity]}
        </span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5 border-t border-line/70 pt-1.5 font-mono text-[0.78rem]">
        <span className="text-mute">срок:</span>
        <span className="text-parch">{durationLabel(chip)}</span>
      </div>

      {chip.details.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[0.84rem] leading-snug text-parch/90">
          {chip.details.map((line) => (
            <li key={line} className="flex gap-1.5">
              <span className="shrink-0" style={{ color: accent }}>
                ·
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      {chip.boosts.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chip.boosts.map((b) => (
            <span
              key={b.stat + b.value}
              className="border px-1.5 py-0.5 font-mono text-[0.72rem]"
              style={{ borderColor: `${accent}88`, color: accent, background: `${accent}14` }}
            >
              {b.stat} {b.value}
            </span>
          ))}
        </div>
      )}

      {chip.dot && (
        <div className="mt-1.5 border-t border-line/70 pt-1.5">
          <div className="flex items-baseline justify-between gap-2 font-mono text-[0.78rem]">
            <span className="text-mute">урон</span>
            <span className="text-rubric">{chip.dot.perTick} ОЗ / тик</span>
          </div>
          <div className="mt-0.5 text-[0.8rem] leading-snug text-parch/85">{dotSummary(chip.dot)}</div>
          {chip.dot.total != null && (
            <div className="mt-1 flex items-baseline justify-between gap-2 border border-rubric/40 bg-rubric/10 px-1.5 py-0.5 font-mono text-[0.78rem]">
              <span className="text-mute">всего за срок</span>
              <span className="font-bold text-rubric">{chip.dot.total} ОЗ</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EffectChips({
  chips,
  size = 36,
  max = EFFECT_CHIPS_VISIBLE,
  label,
}: {
  chips: EffectChip[];
  size?: number;
  max?: number;
  /** Подпись для скринридеров: «эффекты героя», «эффекты врага». */
  label: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (chips.length === 0) return null;
  const shown = chips.slice(0, max);
  const rest = chips.length - shown.length;

  return (
    <div className="flex flex-wrap items-start gap-1.5" role="list" aria-label={label}>
      {shown.map((chip, i) => {
        const key = `${chip.id}-${chip.name}-${i}`;
        const isOpen = open === key;
        return (
          <div key={key} className="relative" role="listitem">
            <button
              type="button"
              aria-label={`${chip.name}: ${durationLabel(chip)}`}
              aria-expanded={isOpen}
              onMouseEnter={() => setOpen(key)}
              onMouseLeave={() => setOpen((v) => (v === key ? null : v))}
              onFocus={() => setOpen(key)}
              onBlur={() => setOpen((v) => (v === key ? null : v))}
              onClick={() => setOpen((v) => (v === key ? null : key))}
              className="block cursor-help leading-none transition-transform hover:scale-105 focus:outline-none focus-visible:ring-1 focus-visible:ring-flame"
            >
              <ChipFace chip={chip} size={size} />
            </button>
            {isOpen && <ChipTip chip={chip} />}
          </div>
        );
      })}
      {rest > 0 && (
        <div className="relative" role="listitem">
          <button
            type="button"
            aria-expanded={open === "rest"}
            onMouseEnter={() => setOpen("rest")}
            onMouseLeave={() => setOpen((v) => (v === "rest" ? null : v))}
            onFocus={() => setOpen("rest")}
            onBlur={() => setOpen((v) => (v === "rest" ? null : v))}
            onClick={() => setOpen((v) => (v === "rest" ? null : "rest"))}
            className="flex items-center justify-center border border-line bg-black/70 font-mono text-[0.78rem] text-mute hover:text-flamehi"
            style={{ width: size, height: size }}
            aria-label={`ещё эффектов: ${rest}`}
          >
            +{rest}
          </button>
          {open === "rest" && (
            <div
              role="tooltip"
              className="absolute left-0 top-full z-50 mt-2 w-[min(17rem,72vw)] border border-line bg-black/95 p-2 text-left shadow-[0_10px_30px_rgba(0,0,0,0.75)]"
            >
              <div className="sc mb-1 text-flamedim">ещё эффекты</div>
              <ul className="space-y-0.5 font-mono text-[0.78rem]">
                {chips.slice(max).map((c, i) => (
                  <li key={`${c.id}-${i}`} className="flex items-baseline justify-between gap-2">
                    <span style={{ color: c.polarity === "good" ? "#8fb8ec" : c.color }}>{c.name}</span>
                    <span className="text-mute">{durationLabel(c)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
