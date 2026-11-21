/**
 * Параметры брони и аксессуаров: уклонение, броня, здоровье, регенерация, маг. барьер.
 *
 * Значение = база типа + модификатор слота. Оба слагаемых линейны по уровню предмета:
 *   база типа на 1 уровне + прирост за каждый новый уровень × (уровень − 1);
 *   модификатор слота — так же, на 1 уровне и с приростом.
 * Множителей от уровня нет. Износ — обычный множитель состояния предмета.
 *
 * Слот, которого нет в таблице модификаторов, получает только базу типа («общее правило»).
 * null в модификаторе — слот параметр не получает совсем.
 *
 * Разброс ±1 при выпадении применяется только к положительным значениям:
 * параметр, который у типа и слота равен нулю, не появляется из броска.
 */
import type { Slot } from "./types";

export type GearParamClass = "light" | "medium" | "heavy";
export type GearParamKey = "evade" | "armor" | "hp" | "regen" | "barrier";

/** [значение на 1 уровне, прирост за каждый новый уровень]. Уклонение — в процентах. */
type Pair = [number, number];

export const GEAR_PARAM_TYPE: Record<GearParamKey, Record<GearParamClass, Pair>> = {
  evade: { light: [3, 1], medium: [2, 0.75], heavy: [0, 0] },
  armor: { light: [0, 0], medium: [3, 3], heavy: [7, 5] },
  hp: { light: [25, 10], medium: [13, 5], heavy: [17, 7] },
  regen: { light: [3, 2], medium: [1, 0.5], heavy: [2, 1] },
  barrier: { light: [15, 7], medium: [8, 4], heavy: [0, 0] },
};

/** Модификаторы слотов. null — параметра у слота нет. Нет записи — только база типа. */
const SLOT_PARAM_MOD: Partial<Record<Slot, Partial<Record<GearParamKey, Pair | null>>>> = {
  head: {
    evade: [-1, -0.25],
    armor: [-1, -1],
    hp: [-5, -2],
    regen: [-1, -1],
    barrier: [-2, -1],
  },
  wrists: {
    evade: [1, 0],
    armor: [-2, -2],
    hp: [-5, -3],
    regen: [-1, -1],
    barrier: [-2, -2],
  },
  feet: {
    evade: [-0.5, -0.25],
    armor: [-2, -1],
    hp: [-3, -1],
    regen: null,
    barrier: [-1, -1],
  },
  offHand: {
    armor: [2, 1],
    hp: null,
  },
  ring1: { evade: null, armor: null },
  ring2: { evade: null, armor: null },
  amulet: { evade: null, armor: null },
};

/** Целые параметры (броня, здоровье, барьер) хранятся целыми; уклонение и регенерация — с сотыми. */
const WHOLE_PARAMS: ReadonlySet<GearParamKey> = new Set<GearParamKey>(["armor", "hp", "barrier"]);

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Значение параметра до износа и разброса: база типа + модификатор слота.
 * null — слот этот параметр не получает. Не ниже нуля.
 */
export function gearParamBase(key: GearParamKey, gearClass: GearParamClass, slot: Slot, level: number): number | null {
  const mod = SLOT_PARAM_MOD[slot]?.[key];
  if (mod === null) return null;
  const [a, b] = GEAR_PARAM_TYPE[key][gearClass];
  const [ma, mb] = mod ?? [0, 0];
  const k = Math.max(0, Math.min(10, Math.floor(level))) - 1;
  return Math.max(0, a + b * k + ma + mb * k);
}

/** Бросок ±1 из статов предмета. Старые сохранения хранили большие числа — их не трактуем как разброс. */
export function gearParamOffset(roll: number | undefined): number {
  if (roll === undefined || !Number.isFinite(roll) || Math.abs(roll) > 1) return 0;
  return Math.round(roll);
}

/**
 * Итоговое значение параметра предмета: (база + разброс) × износ.
 * Разброс добавляется только к положительной базе. Целые параметры округляются, остальные — до сотых.
 */
export function gearParamValue(
  key: GearParamKey,
  gearClass: GearParamClass,
  slot: Slot,
  level: number,
  roll: number | undefined,
  wearMult: number,
): number {
  const base = gearParamBase(key, gearClass, slot, level);
  if (base === null) return 0;
  const withRoll = base > 0 ? Math.max(0, base + gearParamOffset(roll)) : 0;
  const value = withRoll * wearMult;
  return WHOLE_PARAMS.has(key) ? Math.round(value) : round2(value);
}
