/**
 * Семь новых боевых эффектов: замедление, разрушение, немота, истощение, побои, ослабление, иссушение.
 * Чистые правила без состояния боя: бой подключает их в своих местах, тесты проверяют формулы здесь.
 * Значения одобрены. Длительности — в раундах (как у остальных эффектов).
 */

/** Замедление: ходы цели −1 в раунде, но не меньше одного. */
export const SLOW_TURN_PENALTY = 1;
export const SLOW_ROUNDS = 2;

/** Разрушение: Укрепление, Магическое сопротивление и Стойкость цели умножаются на этот коэффициент (−25%). */
export const SHATTER_MULT = 0.75;
export const SHATTER_ROUNDS = 3;

/** Немота: запрет свитков, магических приёмов и спец-приёма архетипа. */
export const MUTE_ROUNDS = 2;

/** Истощение: при первом наложении снимает столько случайных положительных эффектов. */
export const DEPLETE_PICK = 2;
export const DEPLETE_ROUNDS = 2;

/** Побои: урон, получаемый целью, умножается на этот коэффициент (+20%). */
export const BEAT_MULT = 1.2;
export const BEAT_ROUNDS = 2;

/** Ослабление: множитель урона от характеристик умножается на этот коэффициент (−25%). */
export const WEAKEN_MULT = 0.75;
export const WEAKEN_ROUNDS = 2;

/** Иссушение: каждый раунд цель теряет эту долю максимального здоровья (игнорирует броню). */
export const DRAIN_SHARE = 0.06;
/** Иссушение: применивший лечится на эту долю нанесённого урона. */
export const DRAIN_HEAL_SHARE = 0.5;
export const DRAIN_ROUNDS = 3;

/** Ходы в раунде с учётом замедления. Не меньше одного хода. */
export function slowedTurns(baseTurns: number, slowRounds: number): number {
  if (slowRounds <= 0) return baseTurns;
  return Math.max(1, baseTurns - SLOW_TURN_PENALTY);
}

/** Разрушение: значение характеристики после −25%, округлённое вниз до целого. */
export function shatteredStat(value: number, shatterRounds: number): number {
  if (shatterRounds <= 0) return value;
  return Math.floor(value * SHATTER_MULT);
}

/** Побои: урон после +20%. */
export function beatenDamage(damage: number, beatRounds: number): number {
  if (beatRounds <= 0) return damage;
  return Math.round(damage * BEAT_MULT);
}

/** Ослабление: множитель от характеристик после −25%. */
export function weakenedMult(mult: number, weakenRounds: number): number {
  if (weakenRounds <= 0) return mult;
  return mult * WEAKEN_MULT;
}

/** Иссушение: урон за раунд (ОЗ цели) и лечение применившему. Урон не меньше 1 при активном эффекте. */
export function drainTick(maxHp: number, drainRounds: number): { damage: number; heal: number } {
  if (drainRounds <= 0) return { damage: 0, heal: 0 };
  const damage = Math.max(1, Math.round(maxHp * DRAIN_SHARE));
  return { damage, heal: Math.round(damage * DRAIN_HEAL_SHARE) };
}

/**
 * Истощение: снимает положительные эффекты.
 * Первое наложение — DEPLETE_PICK случайных. Продление (эффект уже действует) — все оставшиеся.
 * `rng` возвращает число от 0 до 1 (как Math.random), чтобы тесты были детерминированы.
 */
export function depleteRemove(
  positives: readonly string[],
  alreadyActive: boolean,
  rng: () => number = Math.random,
): { removed: string[]; remaining: string[] } {
  if (alreadyActive) return { removed: [...positives], remaining: [] };
  const pool = [...positives];
  const removed: string[] = [];
  while (removed.length < DEPLETE_PICK && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    removed.push(pool.splice(i, 1)[0]);
  }
  return { removed, remaining: pool };
}

/** Немота: запрещает ли статус действие-свиток, магический приём или спец-приём. */
export function muteBlocks(muteRounds: number): boolean {
  return muteRounds > 0;
}
