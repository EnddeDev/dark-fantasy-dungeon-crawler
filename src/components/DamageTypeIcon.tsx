import { useState, type ReactElement } from "react";
import { DAMAGE_TYPES, isDamageElement, type DamageTypeId, type DamageTypeInfo } from "../game/damageTypes";
import type { DamageElement } from "../game/monsters";
import { ELEMENT_NAMES } from "../game/monsters";
import { EffectGlyph } from "./EffectIcon";

/**
 * Иконки видов урона и всплывающее окно с описанием. Яд, горение и кровотечение
 * берут глифы эффектов; остальные виды рисуются тонким контуром в своём цвете.
 * Наведение, фокус или тап раскрывают подсказку: школа, правило и текст.
 */

export const DAMAGE_COLOR: Record<DamageTypeId, string> = {
  phys: "#c9c2b4",
  magic: "#b48cff",
  fire: "#f2b541",
  ice: "#8fd3ff",
  acid: "#c4e04a",
  light: "#fbe7a1",
  poison: "#7fc45a",
  burn: "#e0623c",
  bleed: "#d0404a",
};

const GLYPHS: Record<Exclude<DamageTypeId, "poison" | "burn" | "bleed">, ReactElement> = {
  phys: (
    <>
      <path d="M14.6 4.2l5.2 5.2-9.4 9.4-5.2-5.2z" />
      <path d="M4.2 19.8l3-3M6.8 14.6l2.6 2.6" />
    </>
  ),
  magic: (
    <>
      <path d="M12 2.8l1.9 6.3 6.3 1.9-6.3 1.9L12 19.2l-1.9-6.3-6.3-1.9 6.3-1.9z" />
      <path d="M19 17.4v3.2M17.4 19h3.2" />
    </>
  ),
  fire: (
    <>
      <circle cx="14.2" cy="9.8" r="5.2" />
      <path d="M10.4 13.6L3.6 20.4M8.6 12.4L5.6 15.4" />
    </>
  ),
  ice: (
    <>
      <path d="M12 2.8l4.2 6.2L12 21.2 7.8 9z" />
      <path d="M7.8 9h8.4" />
    </>
  ),
  acid: (
    <>
      <path d="M9.4 3.2h5.2M10.2 3.2v5.1L5.6 16.6A2.3 2.3 0 0 0 7.6 20h8.8a2.3 2.3 0 0 0 2-3.4L13.8 8.3V3.2" />
      <circle cx="10.2" cy="15.6" r="1" />
      <circle cx="14" cy="13.6" r="0.8" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.2M12 19v2.2M2.8 12h2.2M19 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
    </>
  ),
};

export function DamageGlyph({ id, size = 18 }: { id: DamageTypeId; size?: number }) {
  if (id === "poison" || id === "burn" || id === "bleed") {
    return <EffectGlyph id={id} size={size} />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {GLYPHS[id]}
    </svg>
  );
}

/** Подпись школы для всплывающего окна. Все стихии — магический урон. */
export function damageKindLabel(info: DamageTypeInfo): string {
  if (info.group === "periodic") return "периодический";
  if (info.id === "phys") return "физический";
  if (isDamageElement(info.id)) return "магический · стихия";
  return "магический";
}

function DamageTip({ info }: { info: DamageTypeInfo }) {
  const color = DAMAGE_COLOR[info.id];
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-[min(19rem,72vw)] border bg-black/95 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.75)]"
      style={{ borderColor: color }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center" style={{ color }}>
          <DamageGlyph id={info.id} size={17} />
        </span>
        <span className="min-w-0 flex-1 font-display text-[0.92rem] uppercase tracking-[0.06em]" style={{ color }}>
          {info.name}
        </span>
        <span className="shrink-0 font-mono text-[0.66rem] uppercase text-mute">{damageKindLabel(info)}</span>
      </div>
      <p className="mt-1.5 border-t border-line/70 pt-1.5 text-[0.84rem] leading-snug text-parch/90">{info.text}</p>
    </div>
  );
}

/** Иконка вида урона; при наведении, фокусе или тапе открывает подсказку. */
export function DamageTypeTag({
  id,
  size = 18,
  showName = false,
  className = "",
}: {
  id: DamageTypeId;
  size?: number;
  showName?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const info = DAMAGE_TYPES.find((t) => t.id === id);
  if (!info) return null;
  const color = DAMAGE_COLOR[id];
  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={`${info.name}: подробнее`}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-help items-center gap-1 leading-none focus:outline-none focus-visible:ring-1 focus-visible:ring-flame"
        style={{ color }}
      >
        <span
          className="flex items-center justify-center border"
          style={{
            width: size + 6,
            height: size + 6,
            borderColor: `${color}aa`,
            background: `${color}1f`,
          }}
        >
          <DamageGlyph id={id} size={size} />
        </span>
        {showName && (
          <span className="font-display text-[0.8rem] uppercase tracking-[0.06em] text-parch">{info.name}</span>
        )}
      </button>
      {open && <DamageTip info={info} />}
    </span>
  );
}

/** Строка стихий рода: «уязвим: огонь, лёд» / «иммунитет: свет» значками. */
export function ElementRow({
  label,
  elements,
}: {
  label: string;
  elements: DamageElement[];
}) {
  if (elements.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-mute">{label}</span>
      {elements.map((e) => (
        <span key={e} className="inline-flex items-center gap-1">
          <DamageTypeTag id={e} size={14} />
          <span className="text-parch/85">{ELEMENT_NAMES[e]}</span>
        </span>
      ))}
    </span>
  );
}
