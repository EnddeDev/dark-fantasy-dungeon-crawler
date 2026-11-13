import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFitInViewport } from "./useFitInViewport";
import {
  ArrowLeftRight,
  Crosshair,
  EyeOff,
  Hourglass,
  ListChecks,
  Shield,
  ShieldCheck,
  ShieldPlus,
  Skull,
  Sparkles,
  Sword,
  Target,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * Боевой параметр в левой панели и сводке боя: иконка и значение.
 * Наведение (фокус или тап) открывает подсказку: что это за параметр и что он даёт.
 */

export type MetricKey =
  | "damage"
  | "techMultiplier"
  | "armor"
  | "evade"
  | "crit"
  | "ap"
  | "stamina"
  | "resist"
  | "magicResist"
  | "fortify"
  | "enemyDamage"
  | "incomingDamage"
  | "missChance"
  | "guard"
  | "stats";

interface MetricInfo {
  label: string;
  icon: LucideIcon;
  what: string;
}

export const METRIC_INFO: Record<MetricKey, MetricInfo> = {
  damage: {
    label: "Урон оружия",
    icon: Sword,
    what: "Диапазон одного удара оружием. Сила добавляет плоский урон.",
  },
  techMultiplier: {
    label: "Множитель приёма",
    icon: Sparkles,
    what: "Сила приёма оружия: чем выше, тем сильнее приём при той же характеристике.",
  },
  armor: {
    label: "Броня",
    icon: Shield,
    what: "Снижает физический урон по вам на величину брони.",
  },
  evade: {
    label: "Уклонение",
    icon: ArrowLeftRight,
    what: "Шанс уйти от физического удара целиком.",
  },
  crit: {
    label: "Критический удар",
    icon: Crosshair,
    what: "Шанс нанести усиленный удар. Множитель показывает, во сколько раз он сильнее.",
  },
  stamina: {
    label: "Выносливость",
    icon: Hourglass,
    what: "Сколько действий можно сделать в свой ход: каждое тратит выносливость. В начале раунда восстанавливается половина максимума, в начале каждого своего хода — 20. Растёт от ловкости (+10) и силы (+5).",
  },
  ap: {
    label: "Ходы за раунд",
    icon: Hourglass,
    what: "Сколько блоков действий у героя за раунд. Растёт от ловкости и ускорения предметов.",
  },
  resist: {
    label: "Стойкость",
    icon: ShieldCheck,
    what: "Шанс сопротивляться негативным эффектам: яду, кровотечению, проклятиям, оглушению.",
  },
  magicResist: {
    label: "Маг. сопротивление",
    icon: WandSparkles,
    what: "Снижает магический урон по вам.",
  },
  fortify: {
    label: "Укрепление",
    icon: ShieldPlus,
    what: "Снижает физический урон по вам.",
  },
  enemyDamage: {
    label: "Урон по врагу",
    icon: Target,
    what: "Сколько урона нанесёт удар по текущему врагу после его брони и защиты.",
  },
  incomingDamage: {
    label: "Входящий урон",
    icon: Skull,
    what: "Сколько урона вы получите от удара врага после ваших защит.",
  },
  missChance: {
    label: "Промах в мраке",
    icon: EyeOff,
    what: "В тёмном подземелье физический удар может промахнуться. Проверка идёт и для вас, и для врага.",
  },
  guard: {
    label: "Защита",
    icon: ShieldPlus,
    what: "Глухая защита: броня +25%, пока враг в обороне.",
  },
  stats: {
    label: "Характеристики",
    icon: ListChecks,
    what: "Ваши основные характеристики: СИЛ, ЛОВ и ИНТ. От них зависят урон, выносливость, приёмы и сопротивления.",
  },
};

/**
 * Выравнивание подсказки относительно бейджа. Панель обрезает всё, что выходит за её края,
 * поэтому бейдж выбирает край по своей колонке: левая — от левого края, средняя — по центру,
 * правая — по правому краю.
 */
export type TipAlign = "left" | "center" | "right";

/** Колонка сетки из трёх бейджей по порядку (0, 1, 2, 0, …). */
export function tipAlignForColumn(index: number): TipAlign {
  return (["left", "center", "right"] as const)[index % 3];
}

export function tipAlignClass(align: TipAlign): string {
  if (align === "right") return "right-0";
  if (align === "center") return "left-1/2 -translate-x-1/2";
  return "left-0";
}

/** Ширина подсказки и отступ от краёв экрана (как у подсказок урона). */
const TIP_WIDTH = 304;
const TIP_GAP = 8;

interface TipPlace {
  left: number;
  top?: number;
  bottom?: number;
}

/**
 * Место подсказки у бейджа. Подсказка выносится в body через портал, поэтому левая панель
 * с прокруткой её не обрезает. Открывается под бейджем, у нижнего края экрана — над ним.
 */
function placeTip(rect: DOMRect): TipPlace {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(TIP_WIDTH, vw - TIP_GAP * 2);
  const left = Math.max(TIP_GAP, Math.min(rect.left, vw - width - TIP_GAP));
  if (rect.bottom > vh * 0.6) return { left, bottom: vh - rect.top + TIP_GAP };
  return { left, top: rect.bottom + TIP_GAP };
}

export function MetricBadge({
  metric,
  value,
  note,
}: {
  metric: MetricKey;
  value: string;
  note?: string;
}) {
  const [place, setPlace] = useState<TipPlace | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const open = place !== null;
  useFitInViewport(tipRef, open);
  const info = METRIC_INFO[metric];
  const Icon = info.icon;
  const tipId = `metric-tip-${metric}`;
  const show = () => {
    if (wrapRef.current) setPlace(placeTip(wrapRef.current.getBoundingClientRect()));
  };
  const hide = () => setPlace(null);
  return (
    <div ref={wrapRef} className="relative block" onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        aria-label={`${info.label}: ${value}`}
        aria-describedby={open ? tipId : undefined}
        onFocus={show}
        onBlur={hide}
        onClick={() => (open ? hide() : show())}
        className="flex w-full items-center justify-center gap-2 border border-line/80 bg-black/20 px-2 py-2.5 text-flame transition-colors hover:border-flame hover:bg-flame/10 focus:outline-none focus-visible:border-flame"
      >
        <Icon size={18} aria-hidden />
        <span className="font-mono text-[0.98rem] leading-tight tab text-flamehi">{value}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            id={tipId}
            className="pointer-events-none fixed z-[100] border border-flamedim bg-black/95 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.75)]"
            style={{
              left: place.left,
              top: place.top,
              bottom: place.bottom,
              width: `min(${TIP_WIDTH}px, calc(100vw - ${TIP_GAP * 2}px))`,
            }}
          >
            <div className="flex items-center gap-2 text-flame">
              <Icon size={16} aria-hidden />
              <span className="font-display text-[0.95rem] uppercase tracking-[0.06em] text-flamehi">{info.label}</span>
              <span className="ml-auto font-mono text-[0.9rem] text-parch">{value}</span>
            </div>
            <p className="mt-1.5 text-[0.86rem] leading-snug text-parch/90">{info.what}</p>
            {note && <p className="mt-1.5 border-t border-line/70 pt-1.5 text-[0.84rem] leading-snug text-mute">{note}</p>}
          </div>,
          document.body,
        )}
    </div>
  );
}
