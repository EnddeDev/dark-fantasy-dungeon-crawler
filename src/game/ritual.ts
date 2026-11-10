/**
 * Магический ритуал волшебника: замена, снятие и хаос-замена свойств снаряжения.
 *
 * Открыт при доверии волшебника 3 и выше. Все функции чистые: состояние героя
 * возвращается новым объектом, случайность — через rng.
 */
import { GEAR_EFFECTS, ACTIVE_GEAR_EFFECTS, type GearEffectId } from "./gearEffects";
import { ITEMS, canRollExtraAp, pick, reagentPoolForFloor, scaledGearStats } from "./content";
import { rollEffectBase } from "./gearScaling";
import { trustOf } from "./quests";
import type { GearItem, Player } from "./types";

export const RITUAL_MIN_TRUST = 3;
export const RITUAL_INK_ID = "magic_ink";

/** Цены ритуала: золото и магические чернила. */
export const RITUAL_COSTS = {
  replace: { gold: 150, ink: 5 },
  strip: { gold: 100, ink: 0 },
  chaos: { gold: 200, ink: 7 },
} as const;

export type RitualReplaceKind = "replace" | "chaos";
export type RitualKind = RitualReplaceKind | "strip";

export function ritualUnlocked(player: Player): boolean {
  return trustOf(player, "wizard") >= RITUAL_MIN_TRUST;
}

/** Снятие: 1–2 уровень даёт 1 реагент, 3–4 — 2 и так далее до 9–10 (5 реагентов). */
export function stripReagentCount(level: number): number {
  return Math.min(5, Math.max(1, Math.ceil(Math.max(1, Math.floor(level)) / 2)));
}

/** Предмет, на котором можно провести ритуал: исследованный, со свойствами. */
export function ritualEligible(item: GearItem): boolean {
  return item.identified && item.effects.length > 0;
}

/**
 * Свойства, которые могут выпасть вместо заменяемого.
 * Замена держится в той же характеристике (требование свойства); хаос — любая характеристика.
 * Свойства, которых у предмета уже нет, и «Ускорение» не по правилам уровня — не попадают.
 */
export function ritualCandidates(item: GearItem, effectId: GearEffectId, kind: RitualReplaceKind): GearEffectId[] {
  const has = new Set(item.effects);
  const stat = GEAR_EFFECTS[effectId].stat;
  return ACTIVE_GEAR_EFFECTS.filter(
    (id) =>
      !has.has(id) &&
      (id !== "ap" || canRollExtraAp(item.rarity, item.level)) &&
      (kind === "chaos" || GEAR_EFFECTS[id].stat === stat),
  );
}

export interface RitualResult {
  player: Player;
  message: string;
}

/** Не хватает золота или чернил — ритуал не проводится и ничего не списывается. */
function canAfford(player: Player, cost: { gold: number; ink: number }): boolean {
  return player.gold >= cost.gold && (player.bag[RITUAL_INK_ID] ?? 0) >= cost.ink;
}

function spendRitual(player: Player, cost: { gold: number; ink: number }): Pick<Player, "gold" | "bag"> {
  const bag = { ...player.bag };
  if (cost.ink > 0) {
    const left = (bag[RITUAL_INK_ID] ?? 0) - cost.ink;
    if (left > 0) bag[RITUAL_INK_ID] = left;
    else delete bag[RITUAL_INK_ID];
  }
  return { gold: player.gold - cost.gold, bag };
}

function withItem(player: Player, uid: string, next: GearItem): Player["armory"] {
  return player.armory.map((g) => (g.uid === uid ? next : g));
}

/** Замена и хаос-замена: свойство `effectId` заменяется случайным из кандидатов. */
export function ritualReplace(
  player: Player,
  uid: string,
  effectId: GearEffectId,
  kind: RitualReplaceKind,
  rng: () => number = Math.random,
): RitualResult | null {
  if (!ritualUnlocked(player)) return null;
  const item = player.armory.find((g) => g.uid === uid);
  if (!item || !ritualEligible(item) || !item.effects.includes(effectId)) return null;
  const cost = RITUAL_COSTS[kind];
  if (!canAfford(player, cost)) return null;
  const candidates = ritualCandidates(item, effectId, kind);
  if (candidates.length === 0) return null;

  const next = pick(candidates, rng);
  const effectRolls = { ...(item.effectRolls ?? {}) };
  delete effectRolls[effectId];
  effectRolls[next] = rollEffectBase(next, rng);
  const changed: GearItem = {
    ...item,
    effects: item.effects.map((id) => (id === effectId ? next : id)),
    effectRolls,
  };
  const label = kind === "chaos" ? "Хаос замены" : "Замена";
  return {
    player: { ...player, ...spendRitual(player, cost), armory: withItem(player, uid, changed) },
    message: `${label}: «${GEAR_EFFECTS[effectId].name}» → «${GEAR_EFFECTS[next].name}» (${scaledGearStats(changed).base.name}).`,
  };
}

/** Снятие: свойство пропадает, герой получает реагенты по уровню предмета. */
export function ritualStrip(
  player: Player,
  uid: string,
  effectId: GearEffectId,
  rng: () => number = Math.random,
): RitualResult | null {
  if (!ritualUnlocked(player)) return null;
  const item = player.armory.find((g) => g.uid === uid);
  if (!item || !ritualEligible(item) || !item.effects.includes(effectId)) return null;
  const cost = RITUAL_COSTS.strip;
  if (!canAfford(player, cost)) return null;

  const level = Math.max(1, Math.floor(item.level));
  const reagent = pick(reagentPoolForFloor(level), rng);
  const amount = stripReagentCount(level);
  const effectRolls = { ...(item.effectRolls ?? {}) };
  delete effectRolls[effectId];
  const changed: GearItem = {
    ...item,
    effects: item.effects.filter((id) => id !== effectId),
    effectRolls,
  };
  const spent = spendRitual(player, cost);
  const bag = { ...spent.bag, [reagent]: (spent.bag[reagent] ?? 0) + amount };
  return {
    player: { ...player, gold: spent.gold, bag, armory: withItem(player, uid, changed) },
    message: `Снятие: «${GEAR_EFFECTS[effectId].name}» снято. Получено: ${ITEMS[reagent]?.name ?? reagent} ×${amount}.`,
  };
}
