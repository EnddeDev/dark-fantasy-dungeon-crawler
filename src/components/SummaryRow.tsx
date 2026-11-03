import { useState } from "react";
import { METRIC_INFO, type MetricKey } from "./MetricBadge";

/**
 * Строка «Сводки боя»: иконка и значение.
 * Название, описание, «было → стало», статус и подсказка открываются по наведению, фокусу или тапу.
 */

export interface SummaryRowData {
  metric: MetricKey;
  label: string;
  base: string;
  now: string;
  hint: string;
  badge?: { text: string; tone: "rubric" | "flame" | "verd" };
  boon?: boolean;
}

const BADGE_TONE = {
  rubric: { dot: "bg-rubric", text: "text-rubric" },
  flame: { dot: "bg-flamehi", text: "text-flamehi" },
  verd: { dot: "bg-verd", text: "text-verd" },
} as const;

export function SummaryRow({ row, live, align = "left" }: { row: SummaryRowData; live: boolean; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const info = METRIC_INFO[row.metric];
  const Icon = info.icon;
  const tipId = `summary-tip-${row.metric}`;
  const tone = row.badge ? BADGE_TONE[row.badge.tone] : null;
  return (
    <div
      className={`relative flex items-center gap-2 border-b border-line/40 pb-1.5 ${row.boon ? "boon-row -mx-1 rounded-sm px-1" : ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${row.label}: ${row.now}`}
        aria-describedby={open ? tipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="flex shrink-0 items-center justify-center text-flame transition-colors hover:text-flamehi focus:outline-none focus-visible:text-flamehi"
      >
        <Icon size={17} aria-hidden />
      </button>
      {row.boon && (
        <span aria-hidden className="boon-mark font-mono text-[0.7rem]" title="временно усилено">
          ▲
        </span>
      )}
      {tone && row.badge && (
        <span role="img" aria-label={row.badge.text} title={row.badge.text} className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
      )}
      <span className="ml-auto flex shrink-0 items-baseline gap-1.5 font-mono tab">
        {live && <span className="text-[0.86rem] text-mute line-through decoration-rubric/70">{row.base}</span>}
        <span
          key={row.now}
          className={`value-pop text-[1.02rem] font-bold ${
            live ? (row.badge?.tone === "rubric" ? "text-rubric" : "text-flame") : "text-flamehi"
          }`}
        >
          {row.now}
        </span>
      </span>

      {open && (
        <div
          role="tooltip"
          id={tipId}
          className={`pointer-events-none absolute top-full z-50 mt-1 w-[min(19rem,72vw)] border border-flamedim bg-black/95 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.75)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="flex items-center gap-2 text-flame">
            <Icon size={16} aria-hidden />
            <span className="font-display text-[0.95rem] uppercase tracking-[0.06em] text-flamehi">{row.label}</span>
            <span className="ml-auto font-mono text-[0.9rem] text-parch">{row.now}</span>
          </div>
          {live && <p className="mt-1 font-mono text-[0.78rem] text-mute">Было: {row.base}</p>}
          <p className="mt-1.5 text-[0.86rem] leading-snug text-parch/90">{info.what}</p>
          {row.badge && tone && (
            <p className={`mt-1.5 font-mono text-[0.8rem] font-bold ${tone.text}`}>{row.badge.text}</p>
          )}
          {row.hint && (
            <p className="mt-1.5 border-t border-line/70 pt-1.5 text-[0.84rem] leading-snug text-mute">{row.hint}</p>
          )}
        </div>
      )}
    </div>
  );
}
