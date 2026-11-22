import { useRef, useState, type ReactNode } from "react";
import type { AttackDamagePart } from "../game/battle";
import { DAMAGE_NUMBER_COLORS, DAMAGE_NUMBER_NAMES, type DamageNumberType } from "../game/damageNumbers";
import { useFitInViewport } from "./useFitInViewport";

/*
 * Общий вид урона и подсказок действий: бой и дуэли выглядят одинаково.
 * Числа урона окрашены по типу; при наведении на число видны источник и шанс.
 */

/** Склонение «раунд» для числа. */
export const roundWord = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? "раунд" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "раунда" : "раундов";

/** Подсказка действия: изменение концентрации («Концентрация +1», «Концентрация 0»). */
export const concText = (delta: number) =>
  delta === 0 ? "Концентрация 0" : `Концентрация ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;

/** Диапазон числа в разборе атаки: одно значение или «от–до». */
export function partRange(p: AttackDamagePart): string {
  return p.min === p.max ? `${p.min}` : `${p.min}–${p.max}`;
}

/** Число над персонажем: урон, промах, блок или лечение. Цвет — тип урона, если он известен. */
export interface FloatNumber {
  kind: "hit" | "guard" | "miss" | "heal";
  amount: number;
  dmg?: DamageNumberType;
}

export function floatText(f: FloatNumber): string {
  if (f.kind === "heal") return `+${f.amount}`;
  if (f.kind === "miss") return "мимо";
  if (f.kind === "guard") return "−";
  return `−${f.amount}`;
}

export function floatColor(f: FloatNumber): { color: string } | undefined {
  return f.kind === "hit" && f.dmg ? { color: DAMAGE_NUMBER_COLORS[f.dmg] } : undefined;
}

/**
 * Число в разборе атаки: цвет — тип урона, при наведении — источник и шанс.
 * Подсказка открывается при наводке и фокусе.
 */
export function AttackDamageNumber({ part, text }: { part: AttackDamagePart; text: string }) {
  const [open, setOpen] = useState(false);
  const color = DAMAGE_NUMBER_COLORS[part.type];
  const trigger =
    part.trigger ??
    (part.chance !== undefined ? `Шанс ${Math.round(part.chance * 100)}% при попадании` : "Срабатывает при каждом попадании");
  const ticks = part.effect && part.ticks ? `Тик ${partRange(part)} за ход, ${part.ticks} ${roundWord(part.ticks)}` : null;
  return (
    <span
      className="relative inline-block"
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className="cursor-help underline decoration-dotted underline-offset-4" style={{ color }}>
        {text}
      </span>
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-[60] mb-1.5 block w-56 -translate-x-1/2 border border-line bg-black/95 p-2 text-left font-sans text-[0.78rem] leading-snug text-parch/90 shadow-[0_10px_30px_rgba(0,0,0,0.75)]"
        >
          <span className="block font-display text-[0.85rem] uppercase tracking-[0.06em]" style={{ color }}>
            {DAMAGE_NUMBER_NAMES[part.type]}
          </span>
          <span className="mt-1 block text-mute">{part.source}</span>
          <span className="mt-1 block font-mono text-parch/90">{trigger}</span>
          {ticks && <span className="block font-mono text-mute">{ticks}</span>}
        </span>
      )}
    </span>
  );
}

/**
 * Подсказка действия: открывается при наводке и фокусе. Отступ сверху держит её открытой
 * при переходе мыши с кнопки на числа внутри подсказки.
 */
export function HoverTip({ tip, children }: { tip: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  useFitInViewport(tipRef, open);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <div ref={tipRef} role="tooltip" className="absolute left-1/2 top-full z-50 w-[min(19rem,80vw)] -translate-x-1/2 pt-1.5">
          <div className="border border-line bg-black/95 p-3 text-left text-[0.84rem] leading-snug text-parch/90 shadow-[0_10px_30px_rgba(0,0,0,0.75)]">
            {tip}
          </div>
        </div>
      )}
    </div>
  );
}

/** Содержимое подсказки действия: название, описание, урон по типам, эффекты с шансом, строки и блок. */
export function ActionTipBody({
  name,
  desc,
  direct,
  procs,
  extra,
  note,
  lines,
  block,
}: {
  name: string;
  desc: string;
  /** Прямой урон действия (строка «Урон за атаку»). Нет или пусто — строки нет. */
  direct?: AttackDamagePart[];
  /** Эффекты, которые срабатывают при попадании, с шансом. */
  procs?: AttackDamagePart[];
  extra?: ReactNode;
  note?: string;
  lines: string[];
  block?: string | null;
}) {
  return (
    <>
      <div className="font-display text-[0.95rem] uppercase tracking-[0.06em] text-flamehi">{name}</div>
      <p className="mt-1 text-mute">{desc}</p>
      {direct && direct.length > 0 && (
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line/50 pt-2">
          <span className="sc text-[0.78rem] text-flamedim">Урон за атаку</span>
          <span className="font-mono text-[1.05rem] tab">
            {direct.map((p, i) => (
              <span key={i}>
                {i > 0 && " "}
                {i > 0 && <span className="text-mute">+</span>}
                <AttackDamageNumber part={p} text={partRange(p)} />
              </span>
            ))}
          </span>
        </div>
      )}
      {procs && procs.length > 0 && (
        <div className="mt-2">
          <div className="sc text-[0.78rem] text-flamedim">Эффекты при попадании</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[0.95rem]">
            {procs.map((p, i) => (
              <span key={i} className="inline-flex items-baseline gap-1">
                <AttackDamageNumber part={p} text={`+${partRange(p)}`} />
                <span className="text-[0.72rem] text-mute">{DAMAGE_NUMBER_NAMES[p.type].toLowerCase()}/ход</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {extra && <p className="mt-1 text-mute">{extra}</p>}
      {note && <p className="mt-1 text-mute">{note}</p>}
      {lines.length > 0 && (
        <div className="mt-2 space-y-0.5 font-mono text-[0.8rem] text-mute">
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      {block && <p className="mt-2 text-rubric">{block}</p>}
    </>
  );
}
