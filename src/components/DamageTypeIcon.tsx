import { useEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { DAMAGE_TYPES, isDamageElement, type DamageTypeId, type DamageTypeInfo } from "../game/damageTypes";
import type { DamageElement } from "../game/monsters";
import { ELEMENT_NAMES } from "../game/monsters";
import { EffectGlyph } from "./EffectIcon";

/**
 * Иконки видов урона и всплывающее окно с описанием. Яд и кровотечение
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
  bleed: "#d0404a",
};

const GLYPHS: Record<Exclude<DamageTypeId, "poison" | "bleed">, ReactElement> = {
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
  if (id === "poison" || id === "bleed") {
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

/** Ширина подсказки и отступ от краёв экрана. */
const TIP_WIDTH = 304;
const TIP_GAP = 8;

interface TipPlace {
  left: number;
  top?: number;
  bottom?: number;
}

/**
 * Место подсказки у кнопки. Окно выносится в body через портал: контейнеры
 * с прокруткой (меню предметов, журнал) его не обрежут. Открывается под кнопкой,
 * а у нижнего края экрана — над ней; по горизонтали держится внутри экрана.
 */
function placeTip(rect: DOMRect): TipPlace {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(TIP_WIDTH, vw - TIP_GAP * 2);
  const left = Math.max(TIP_GAP, Math.min(rect.left, vw - width - TIP_GAP));
  if (rect.bottom > vh * 0.6) return { left, bottom: vh - rect.top + TIP_GAP };
  return { left, top: rect.bottom + TIP_GAP };
}

function DamageTip({ info, place }: { info: DamageTypeInfo; place: TipPlace }) {
  const color = DAMAGE_COLOR[info.id];
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[100] border bg-black/95 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.75)]"
      style={{
        left: place.left,
        top: place.top,
        bottom: place.bottom,
        width: `min(${TIP_WIDTH}px, calc(100vw - ${TIP_GAP * 2}px))`,
        borderColor: color,
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center" style={{ color }}>
          <DamageGlyph id={info.id} size={17} />
        </span>
        <span className="min-w-0 flex-1 break-words font-display text-[0.92rem] uppercase tracking-[0.06em]" style={{ color }}>
          {info.name}
        </span>
        <span className="whitespace-nowrap font-mono text-[0.66rem] uppercase text-mute">{damageKindLabel(info)}</span>
      </div>
      <p className="mt-1.5 border-t border-line/70 pt-1.5 text-[0.84rem] leading-snug text-parch/90">{info.text}</p>
    </div>,
    document.body,
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
  const [place, setPlace] = useState<TipPlace | null>(null);
  const buttonRef = useRef<HTMLSpanElement>(null);
  const open = place !== null;
  const info = DAMAGE_TYPES.find((t) => t.id === id);

  /* Прокрутка сдвигает кнопку, а подсказка стоит на месте: закрываем её. */
  useEffect(() => {
    if (!open) return;
    const close = () => setPlace(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!info) return null;
  const color = DAMAGE_COLOR[id];
  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPlace(placeTip(rect));
  };
  const hide = () => setPlace(null);
  /* Значок часто стоит внутри кнопки предмета: клик не должен выбирать предмет,
     поэтому это не кнопка, а картинка с подсказкой. */
  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <span
        ref={buttonRef}
        role="img"
        aria-label={`${info.name}: вид урона, подробнее по наведению`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (open) hide();
          else show();
        }}
        className="inline-flex cursor-help items-center gap-1 leading-none"
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
      </span>
      {open && place && <DamageTip info={info} place={place} />}
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
