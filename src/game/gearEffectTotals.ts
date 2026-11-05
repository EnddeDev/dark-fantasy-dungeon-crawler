import type { GearItem } from "./types";
import { GEAR_EFFECTS, effectTotalDetail, type GearEffectId } from "./gearEffects";
import { GEAR_BASES, canRollExtraAp } from "./content";
import { MAX_EXTRA_AP, effectMagnitude } from "./gearScaling";

/** Вклад одного предмета в эффект. */
export interface EffectSource {
  uid: string;
  name: string;
  level: number;
  value: number;
  detail: string;
}

/** Суммарный эффект по всем надетым исследованным предметам. */
export interface EffectTotal {
  id: GearEffectId;
  name: string;
  /** Итоговое значение: сумма, а у дополнительных ходов — наибольшее, не больше MAX_EXTRA_AP. */
  total: number;
  detail: string;
  stacking: "sum" | "max";
  sources: EffectSource[];
}

/**
 * Суммирует эффекты предметов так же, как бой: только исследованные вещи,
 * дополнительные ходы не складываются (берётся наибольшее значение, но не больше трёх).
 */
export function gearEffectTotals(items: GearItem[]): EffectTotal[] {
  const totals = new Map<GearEffectId, EffectTotal>();
  for (const item of items) {
    if (!item.identified) continue;
    const level = item.level ?? 1;
    for (const id of item.effects ?? []) {
      if (id === "ap" && !canRollExtraAp(item.rarity, level)) continue;
      const value = effectMagnitude(id, level, item.effectRolls?.[id]);
      const stacking = id === "ap" ? "max" : "sum";
      const entry: EffectTotal = totals.get(id) ?? {
        id,
        name: GEAR_EFFECTS[id]?.name ?? id,
        total: 0,
        detail: "",
        stacking,
        sources: [],
      };
      entry.sources.push({
        uid: item.uid,
        name: GEAR_BASES[item.baseId]?.name ?? item.baseId,
        level,
        value,
        detail: effectTotalDetail(id, value),
      });
      entry.total = stacking === "max" ? Math.max(entry.total, value) : entry.total + value;
      totals.set(id, entry);
    }
  }
  return [...totals.values()].map((entry) => {
    const total = entry.stacking === "max" ? Math.min(MAX_EXTRA_AP, entry.total) : entry.total;
    return { ...entry, total, detail: effectTotalDetail(entry.id, total) };
  });
}
