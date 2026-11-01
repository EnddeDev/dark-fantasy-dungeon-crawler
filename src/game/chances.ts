/**
 * Единое правило для вероятностей и процентных сопротивлений.
 * Источники не складываются плоско, а применяются последовательно:
 * 20% и 10% дают 28%, 70% и 70% дают 91%.
 * Итог никогда не достигает 100%.
 */
export const CHANCE_CAP = 0.99;

export function clampChance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(CHANCE_CAP, value));
}

/** layers передаются в порядке: характеристики → предметы → эффекты → боевые эффекты. */
export function combineChances(layers: readonly number[]): number {
  let remaining = 1;
  for (const layer of layers) {
    remaining *= 1 - clampChance(layer);
  }
  return clampChance(1 - remaining);
}

export function chancePercent(value: number): number {
  return Math.round(clampChance(value) * 1000) / 10;
}

export type ChanceKey = "evade" | "crit" | "fortify" | "magicResist" | "tenacity" | "stun";

export interface ChanceLayers {
  stats: number[];
  items: number[];
  effects: number[];
}

export function emptyChanceLayers(): Record<ChanceKey, ChanceLayers> {
  return {
    evade: { stats: [], items: [], effects: [] },
    crit: { stats: [], items: [], effects: [] },
    fortify: { stats: [], items: [], effects: [] },
    magicResist: { stats: [], items: [], effects: [] },
    tenacity: { stats: [], items: [], effects: [] },
    stun: { stats: [], items: [], effects: [] },
  };
}

/** Итог с учётом боевых эффектов четвёртым слоем. */
export function combatChance(layers: ChanceLayers, combat: readonly number[] = []): number {
  return combineChances([...layers.stats, ...layers.items, ...layers.effects, ...combat]);
}

export function staticChance(layers: ChanceLayers): number {
  return combatChance(layers);
}
