import { useState } from "react";
import { Brain, Dumbbell, Wind, type LucideIcon } from "lucide-react";
import { STAT_META } from "../game/content";
import type { StatKey } from "../game/types";

/**
 * Основная характеристика в левой панели: иконка и значение.
 * Наведение (фокус или тап) открывает подсказку: что это за характеристика и что она даёт.
 */

const STAT_ICON: Record<StatKey, LucideIcon> = {
  str: Dumbbell,
  agi: Wind,
  int: Brain,
};

export function StatBadge({ stat, value, align = "left" }: { stat: StatKey; value: number; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const meta = STAT_META[stat];
  const Icon = STAT_ICON[stat];
  const tipId = `stat-tip-${stat}`;
  return (
    <div
      className="relative block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${meta.name}: ${value}`}
        aria-describedby={open ? tipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-2 border border-line/70 bg-black/15 px-3 py-2.5 text-flame transition-colors hover:border-flame hover:bg-flame/10 focus:outline-none focus-visible:border-flame"
      >
        <Icon size={20} aria-hidden />
        <span className="font-mono text-base tab text-parch">{value}</span>
      </button>
      {open && (
        <div
          role="tooltip"
          id={tipId}
          className={`pointer-events-none absolute top-full z-50 mt-2 w-[min(19rem,72vw)] border border-flamedim bg-black/95 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.75)] ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="flex items-center gap-2 text-flame">
            <Icon size={16} aria-hidden />
            <span className="font-display text-[0.95rem] uppercase tracking-[0.06em] text-flamehi">{meta.name}</span>
            <span className="ml-auto font-mono text-[0.72rem] text-mute">{meta.short}</span>
          </div>
          <p className="mt-1.5 text-[0.86rem] leading-snug text-parch/90">{meta.blurb}</p>
          <p className="mt-1.5 border-t border-line/70 pt-1.5 text-[0.84rem] leading-snug text-mute">
            <span className="text-parch">Даёт: </span>
            {meta.gain}
          </p>
          <p className="mt-1 font-mono text-[0.72rem] text-mute">Значение: {value} из 10</p>
        </div>
      )}
    </div>
  );
}
