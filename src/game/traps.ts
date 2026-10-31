/**
 * Ловушки подземелья: обычный механизм, яд, кровотечение и проклятие.
 * Проклятие держится до конца следующего боя; «Горечь полыни» снимает его заранее.
 */
import type { StatKey } from "./types";

export type TrapKind = "normal" | "poison" | "bleed" | "curse";
export type TrapAction = "prepare" | "bypass" | "disarm";

export const TRAP_KINDS: TrapKind[] = ["normal", "poison", "bleed", "curse"];
/** Сентинел в statuses.curse: проклятие не тикает, а ждёт конца боя. */
export const BATTLE_CURSE = 999;

export const TRAP_META: Record<TrapKind, { name: string; desc: string }> = {
  normal: { name: "Обычная ловушка", desc: "Пластина под сапогом уходит вниз со щелчком." },
  poison: { name: "Ядовитая ловушка", desc: "Иглы покрываются зеленоватой слизью." },
  bleed: { name: "Ловушка с лезвиями", desc: "Из щелей высовываются зазубренные клинки." },
  curse: { name: "Проклятая ловушка", desc: "Руна на полу вспыхивает и впивается в тень." },
};

export function rollTrapKind(rng: () => number = Math.random): TrapKind {
  const r = Math.min(Math.max(rng(), 0), 0.999999);
  if (r < 0.4) return "normal";
  if (r < 0.65) return "poison";
  if (r < 0.9) return "bleed";
  return "curse";
}

export function isBattleCurse(value: number): boolean {
  return value >= BATTLE_CURSE;
}

export interface TrapSetup {
  kind: TrapKind;
  floor: number;
  stats: Record<StatKey, number>;
  /** Дополнительные шансы от снаряжения/пассивов. */
  bypassBonus?: number;
  stoneSkin?: boolean;
}

export interface TrapState {
  kind: TrapKind;
  /** Урон при полном срабатывании, до подготовки. */
  damage: number;
  /** Длительность яда/раны при полном срабатывании. */
  rounds: number;
  /** Сила проклятия в процентах снижения урона (базово 30). */
  cursePower: number;
  bypassChance: number;
  disarmChance: number;
}

export function trapDamage(floor: number, stoneSkin = false): number {
  const base = 6 + Math.max(1, Math.floor(floor)) * 4;
  return Math.max(1, Math.round(base * (stoneSkin ? 0.75 : 1)));
}

/** Обход — от Ловкости; обезвреживание набором сапёра — от Интеллекта. */
export function trapBypassChance(stats: Record<StatKey, number>, bonus = 0): number {
  return Math.min(0.9, 0.22 + stats.agi * 0.05 + bonus);
}
export function trapDisarmChance(stats: Record<StatKey, number>, bonus = 0): number {
  return Math.min(0.95, 0.3 + stats.int * 0.06 + bonus);
}

export function makeTrap(setup: TrapSetup): TrapState {
  const kind = setup.kind;
  return {
    kind,
    damage: kind === "curse" ? 0 : trapDamage(setup.floor, setup.stoneSkin),
    rounds: kind === "poison" || kind === "bleed" ? 3 : 0,
    cursePower: kind === "curse" ? 30 : 0,
    bypassChance: trapBypassChance(setup.stats, setup.bypassBonus),
    disarmChance: trapDisarmChance(setup.stats, setup.bypassBonus),
  };
}

/** Подготовка: −10% последствий за каждое очко Силы, максимум −90%. */
export function prepareMultiplier(str: number): number {
  return Math.max(0.1, 1 - Math.max(0, Math.floor(str)) * 0.1);
}

export interface TrapOutcome {
  success: boolean;
  damage: number;
  rounds: number;
  cursePower: number;
  /** Потрачен ли набор сапёра. */
  usedKit: boolean;
  xp: number;
  message: string;
}

export function resolveTrap(
  trap: TrapState,
  action: TrapAction,
  stats: Record<StatKey, number>,
  hasKit: boolean,
  floor: number,
  rng: () => number = Math.random,
): TrapOutcome {
  const xp = 2 + Math.max(1, Math.floor(floor));
  if (action === "disarm" && !hasKit) {
    return { success: false, damage: 0, rounds: 0, cursePower: 0, usedKit: false, xp: 0, message: "Нужно снаряжение сапёра." };
  }
  const usedKit = action === "disarm";
  if (action === "prepare") {
    const m = prepareMultiplier(stats.str);
    return {
      success: true,
      damage: Math.ceil(trap.damage * m),
      rounds: Math.ceil(trap.rounds * m),
      cursePower: Math.ceil(trap.cursePower * m),
      usedKit: false,
      xp: 0,
      message: "Ты сгруппировался и принял срабатывание на себя.",
    };
  }
  const chance = action === "bypass" ? trap.bypassChance : trap.disarmChance;
  const success = rng() < chance;
  if (success) {
    return {
      success: true, damage: 0, rounds: 0, cursePower: 0, usedKit, xp,
      message: action === "bypass" ? "Ты обошёл механизм стороной." : "Механизм обезврежен.",
    };
  }
  return {
    success: false,
    damage: trap.damage * 2,
    rounds: trap.rounds * 2,
    cursePower: Math.min(90, trap.cursePower * 2),
    usedKit,
    xp: 0,
    message: action === "bypass" ? "Обойти не вышло — механизм сработал вдвойне." : "Обезвредить не вышло — механизм сработал вдвойне.",
  };
}

export function applyTrapOutcome(
  statuses: { wound: number; curse: number; poison: number; cursePower?: number },
  trap: TrapState,
  outcome: TrapOutcome,
): { wound: number; curse: number; poison: number; cursePower?: number } {
  const next = { ...statuses };
  if (outcome.damage <= 0 && outcome.rounds <= 0 && outcome.cursePower <= 0) return next;
  if (trap.kind === "poison") next.poison = Math.max(next.poison, outcome.rounds);
  if (trap.kind === "bleed") next.wound = Math.max(next.wound, outcome.rounds);
  if (trap.kind === "curse") {
    next.curse = BATTLE_CURSE;
    next.cursePower = Math.max(next.cursePower ?? 0, outcome.cursePower);
  }
  return next;
}

/** Отмычки: шанс открыть дверь без ключа, зависит от Ловкости. */
export function lockpickChance(agi: number): number {
  return Math.min(0.9, 0.25 + Math.max(0, Math.floor(agi)) * 0.06);
}
