/**
 * Характеристики монстров: СИЛ, ЛОВ, ИНТ.
 *
 * Раскладка: главная характеристика типа (сильный — СИЛ, ловкий — ЛОВ, умный — ИНТ)
 * строго больше двух других, а каждая из двух других не ниже главной минус 2.
 * Сумма растёт с уровнем: 1 уровень — 2–3, дальше от (уровня+1) до (уровня+3).
 *
 * Всё, что дают характеристики герою, даёт и монстру: формулы берутся из statFormulas.ts.
 */
import type { MonsterType } from "./monsters";
import {
  STAT_FORMULAS,
  statCritChance,
  statCritDamage,
  statEvasion,
  statMagicResist,
  statTenacity,
} from "./statFormulas";

export type MonsterStatKey = "str" | "agi" | "int";

export interface MonsterStats {
  str: number;
  agi: number;
  int: number;
}

/** Нет характеристик (старое состояние боя или тест без раскладки). */
export const NO_MONSTER_STATS: MonsterStats = { str: 0, agi: 0, int: 0 };

/** Главная характеристика каждого типа. */
export const MONSTER_MAIN_STAT: Record<MonsterType, MonsterStatKey> = {
  strong: "str",
  agile: "agi",
  smart: "int",
};

/** Сумма характеристик для уровня: 1 уровень — 2–3, дальше от (уровня+1) до (уровня+3). */
export function monsterStatTotalRange(level: number): [number, number] {
  const lvl = Math.max(1, Math.floor(level));
  if (lvl === 1) return [2, 3];
  return [lvl + 1, lvl + 3];
}

/** Все допустимые раскладки суммы с заданной главной характеристикой. */
export function monsterStatLayouts(main: MonsterStatKey, total: number): MonsterStats[] {
  const others = (["str", "agi", "int"] as const).filter((k) => k !== main);
  const out: MonsterStats[] = [];
  for (let m = 1; m <= total; m++) {
    const lo = Math.max(0, m - 2);
    for (let a = lo; a <= m - 1; a++) {
      for (let c = lo; c <= m - 1; c++) {
        if (m + a + c !== total) continue;
        const stats: MonsterStats = { str: 0, agi: 0, int: 0 };
        stats[main] = m;
        stats[others[0]] = a;
        stats[others[1]] = c;
        out.push(stats);
      }
    }
  }
  return out;
}

/** Случайная раскладка для типа и уровня. rng — тот же источник, что у спавна, чтобы бои оставались воспроизводимыми. */
export function rollMonsterStats(mtype: MonsterType, level: number, rng: () => number = Math.random): MonsterStats {
  const [lo, hi] = monsterStatTotalRange(level);
  const total = lo + Math.floor(rng() * (hi - lo + 1));
  const layouts = monsterStatLayouts(MONSTER_MAIN_STAT[mtype] ?? "str", total);
  return layouts[Math.min(layouts.length - 1, Math.floor(rng() * layouts.length))] ?? { ...NO_MONSTER_STATS, str: total };
}

/* ── Что дают характеристики монстру: те же формулы, что у героя ── */

/** СИЛ: очки здоровья (×10 за очко, без базы: база уже есть у монстра). */
export function monsterHealthBonus(str: number): number {
  return STAT_FORMULAS.str.healthPerPoint * Math.max(0, str);
}

/** СИЛ: прибавка к удару за очко. */
export function monsterDamageBonus(str: number): number {
  return STAT_FORMULAS.str.damagePerPoint * Math.max(0, str);
}

/** ЛОВ: дополнительные ходы в раунде (как у героя, +1 за очко). */
export function monsterActionsBonus(agi: number): number {
  return STAT_FORMULAS.agi.actionsPerPoint * Math.max(0, agi);
}

/** ЛОВ: уклонение от удара героя. */
export function monsterEvasionBonus(agi: number): number {
  return statEvasion(agi);
}

/** ЛОВ: шанс критического удара (база 2% плюс 1% за очко). */
export function monsterCritChance(agi: number): number {
  return statCritChance(agi);
}

/** ЛОВ: прибавка к множителю критического удара. */
export function monsterCritDamageBonus(agi: number): number {
  return statCritDamage(agi);
}

/** СИЛ: стойкость к негативным эффектам героя. */
export function monsterTenacity(str: number): number {
  return statTenacity(str);
}

/** ИНТ: сопротивление магическому урону. */
export function monsterMagicResist(int: number): number {
  return statMagicResist(int);
}

/** ИНТ: прибавка к урону приёмов за очко (как урон приёмов героя). */
export function monsterTechniqueBonus(int: number): number {
  return STAT_FORMULAS.int.techniquePerPoint * Math.max(0, int);
}

/** Короткая подпись раскладки для сводки: «СИЛ 4 · ЛОВ 2 · ИНТ 1». */
export function monsterStatsLabel(s: MonsterStats): string {
  return `СИЛ ${s.str} · ЛОВ ${s.agi} · ИНТ ${s.int}`;
}
