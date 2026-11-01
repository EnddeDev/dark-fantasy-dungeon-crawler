/**
 * Новые базовые формулы характеристик.
 * Считается полное значение СИЛ/ЛОВ/ИНТ, включая стартовую единицу.
 */
import type { StatKey } from "./types";

export const STAT_FORMULAS = {
  str: {
    /** Базовое здоровье: 10 ОЗ есть даже при нулевой Силе. */
    healthBase: 10,
    healthPerPoint: 10,
    damageBase: 2,
    damagePerPoint: 1,
    tenacityPerPoint: 0.05,
  },
  agi: {
    actionsPerPoint: 1,
    evasionPerPoint: 0.05,
    consumableBase: 7,
    consumablePerPoint: 1.5,
    critChanceBase: 0.02,
    critChancePerPoint: 0.01,
    critDamagePerPoint: 0.10,
  },
  int: {
    magicResistPerPoint: 0.05,
    techniqueBase: 10,
    techniquePerPoint: 2,
  },
} as const;

/**
 * Здоровье = базовые 10 + 10 за каждое очко Силы.
 * Сила 0 — 10 ОЗ, Сила 1 — 20 ОЗ, Сила 10 — 110 ОЗ.
 */
export function statHealth(str: number): number {
  return STAT_FORMULAS.str.healthBase + STAT_FORMULAS.str.healthPerPoint * Math.max(0, Math.floor(str));
}
export function statDamage(str: number): number {
  return STAT_FORMULAS.str.damageBase + STAT_FORMULAS.str.damagePerPoint * Math.max(0, str);
}
export function statTenacity(str: number): number {
  return STAT_FORMULAS.str.tenacityPerPoint * Math.max(0, str);
}
export function statActions(agi: number): number {
  return STAT_FORMULAS.agi.actionsPerPoint * Math.max(0, agi);
}
export function statEvasion(agi: number): number {
  return STAT_FORMULAS.agi.evasionPerPoint * Math.max(0, agi);
}
export function statConsumableDamage(agi: number): number {
  return STAT_FORMULAS.agi.consumableBase + STAT_FORMULAS.agi.consumablePerPoint * Math.max(0, agi);
}
export function statCritChance(agi: number): number {
  return STAT_FORMULAS.agi.critChanceBase + STAT_FORMULAS.agi.critChancePerPoint * Math.max(0, agi);
}
export function statCritDamage(agi: number): number {
  return STAT_FORMULAS.agi.critDamagePerPoint * Math.max(0, agi);
}
export function statMagicResist(int: number): number {
  return STAT_FORMULAS.int.magicResistPerPoint * Math.max(0, int);
}
export function statTechniqueDamage(int: number): number {
  return STAT_FORMULAS.int.techniqueBase + STAT_FORMULAS.int.techniquePerPoint * Math.max(0, int);
}

export function statSummary(stat: StatKey, value: number): string {
  if (stat === "str") return `${statHealth(value)} ОЗ · +${statDamage(value)} урона · ${Math.round(statTenacity(value) * 100)}% стойкости`;
  if (stat === "agi") return `${statActions(value)} ход. · ${Math.round(statEvasion(value) * 100)}% уклонения · ${statConsumableDamage(value)} урон расходников`;
  return `${Math.round(statMagicResist(value) * 100)}% маг. сопротивления · ${statTechniqueDamage(value)} урон приёмов/свитков`;
}
