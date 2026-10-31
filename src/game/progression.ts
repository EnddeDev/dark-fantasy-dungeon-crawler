/**
 * Сброс характеристик: возврат всех очков уровня и возврат к стартовым 1/1/1.
 * Стоимость растёт на 100 золотых за каждый уровень персонажа.
 */
import type { Player, Slot } from "./types";
import { canWear, MAX_LEVEL } from "./content";
import { normalizeStatMilestones } from "./statMilestones";
import { derived } from "./battle";

export const START_STAT_POINTS = 2;
export const STAT_POINTS_PER_LEVEL = 3;

export function totalStatPoints(level: number): number {
  const lvl = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return START_STAT_POINTS + STAT_POINTS_PER_LEVEL * (lvl - 1);
}

export function statResetCost(level: number): number {
  return 100 * Math.max(1, Math.floor(level));
}

export interface ResetResult {
  player: Player;
  cost: number;
  refunded: number;
  removedSlots: Slot[];
}

export function canResetStats(player: Player): boolean {
  return player.gold >= statResetCost(player.level);
}

/**
 * Полный сброс. Возвращает все очки, заработанные за уровни; событийные прибавки
 * к характеристикам при этом теряются (они не были куплены за очки).
 * Снаряжение, которое герой больше не может носить, снимается.
 */
export function resetStats(player: Player): ResetResult | null {
  const cost = statResetCost(player.level);
  if (player.gold < cost) return null;
  const total = totalStatPoints(player.level);
  const refunded = Math.max(0, total - player.statPoints);
  let next: Player = {
    ...player,
    gold: player.gold - cost,
    stats: { str: 1, agi: 1, int: 1 },
    statPoints: total,
    statMilestones: {},
  };
  next = normalizeStatMilestones(next);
  const removedSlots: Slot[] = [];
  const equip = { ...next.equip };
  for (const slot of Object.keys(equip) as Slot[]) {
    const uid = equip[slot];
    if (!uid) continue;
    const item = next.armory.find((g) => g.uid === uid);
    if (!item || !canWear(item, next)) {
      equip[slot] = null;
      removedSlots.push(slot);
    }
  }
  next = { ...next, equip };
  const maxHp = derived(next).maxHp;
  next = { ...next, hp: Math.max(1, Math.min(next.hp, maxHp)) };
  return { player: next, cost, refunded, removedSlots };
}
