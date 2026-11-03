import { useState } from "react";
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
 * Боевой параметр в левой панели: иконка и значение.
 * Наведение (фокус или тап) открывает подсказку: что это за параметр и что он даёт.
 */

export type MetricKey =
  | "damage"
  | "techMultiplier"
  | "armor"
  | "evade"
  | "crit"
  | "ap"
  | "resist"
  | "magicResist"
  | "fortify"
  | "enemyDamage"
  | "incomingDamage"
  | "missChance"
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
  ap: {
    label: "Ходы за раунд",
    icon: Hourglass,
    what: "Сколько действий у вас за раунд. Растёт от ловкости и ускорения предметов.",
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
  stats: {
    label: "Характеристики",
    icon: ListChecks,
    what: "Ваши основные характеристики: СИЛ, ЛОВ и ИНТ. От них зависят урон, ходы, приёмы и сопротивления.",
  },
};

export function MetricBadge({
  metric,
  value,
  note,
  align = "left",
}: {
  metric: MetricKey;
  value: string;
  note?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const info = METRIC_INFO[metric];
  const Icon = info.icon;
  const tipId = `metric-tip-${metric}`;
  return (
    <div
      className="relative block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${info.label}: ${value}`}
        aria-describedby={open ? tipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-2 border border-line/80 bg-black/20 px-2 py-2.5 text-flame transition-colors hover:border-flame hover:bg-flame/10 focus:outline-none focus-visible:border-flame"
      >
        <Icon size={18} aria-hidden />
        <span className="font-mono text-[0.98rem] leading-tight tab text-flamehi">{value}</span>
      </button>
      {open && (
        <div
          role="tooltip"
          id={tipId}
          className={`pointer-events-none absolute top-full z-50 mt-2 w-[min(19rem,72vw)] border border-flamedim bg-black/95 p-2.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.75)] ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="flex items-center gap-2 text-flame">
            <Icon size={16} aria-hidden />
            <span className="font-display text-[0.95rem] uppercase tracking-[0.06em] text-flamehi">{info.label}</span>
            <span className="ml-auto font-mono text-[0.9rem] text-parch">{value}</span>
          </div>
          <p className="mt-1.5 text-[0.86rem] leading-snug text-parch/90">{info.what}</p>
          {note && (
            <p className="mt-1.5 border-t border-line/70 pt-1.5 text-[0.84rem] leading-snug text-mute">{note}</p>
          )}
        </div>
      )}
    </div>
  );
}
