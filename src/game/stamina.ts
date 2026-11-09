import type { StatKey } from "./types";

/* Выносливость героя: пул на раунд. Действия тратят её, в начале раунда пул восстанавливается наполовину. */

/** Базовая выносливость героя. */
export const STAMINA_BASE = 90;
/** Прибавка за очко ЛОВ. */
export const STAMINA_PER_AGI = 10;
/** Прибавка за очко СИЛ. */
export const STAMINA_PER_STR = 5;

/** Стоимость удара по весу оружия: лёгкое 10, среднее 15, тяжёлое 25. */
export const STAMINA_BY_WEIGHT: Record<"light" | "medium" | "heavy", number> = { light: 10, medium: 15, heavy: 25 };
/** Удар без оружия считается как лёгкое оружие. */
export const STAMINA_UNARMED = STAMINA_BY_WEIGHT.light;
/** Приём = вес оружия (или брони) + эта добавка. */
export const STAMINA_TECHNIQUE_EXTRA = 10;
/** Защита: тратит выносливость и заканчивает ход. */
export const STAMINA_GUARD = 10;
/** Предмет из рюкзака. Предмет из сумки (слоты для зелий) бесплатен. */
export const STAMINA_BACKPACK = 5;

/** Восстановление в начале раунда: доля максимума (половина), не выше максимума. */
export const STAMINA_ROUND_RECOVERY = 0.5;
/** Восстановление в начале каждого хода героя (сверх полного восстановления в начале раунда). */
export const STAMINA_TURN_RECOVERY = 20;

/** Самая дешёвая платная трата: если выносливости меньше, ход заканчивается сам. */
export const STAMINA_MIN_PAID = STAMINA_BACKPACK;

export function staminaMax(stats: Record<StatKey, number>): number {
  return STAMINA_BASE + STAMINA_PER_AGI * Math.max(0, stats.agi) + STAMINA_PER_STR * Math.max(0, stats.str);
}

export function weaponStaminaCost(gearClass: "light" | "medium" | "heavy"): number {
  return STAMINA_BY_WEIGHT[gearClass];
}
