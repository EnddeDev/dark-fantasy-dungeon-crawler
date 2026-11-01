/**
 * Кузница: улучшение качества, изношенности и уровня снаряжения.
 * Каждая попытка стоит золота и может уничтожить предмет.
 */
import type { GearItem, Player, RarityTier, WearTier } from "./types";
import { GEAR_BASES, LEGENDARY_PASSIVES, gearAffinity, gearKindOfBase } from "./content";
import { GEAR_PASSIVES, archetypePassive, effectCountForGear, effectPoolForGear, passivePoolFor } from "./gearEffects";
import { clampGearLevel, MAX_GEAR_LEVEL, rollEffectBase } from "./gearScaling";
import { canRollExtraAp } from "./content";
import type { GearEffectId, GearPassiveId } from "./gearEffects";
import type { LegendaryPassiveId } from "./types";
import { WEAR_RANGE } from "./types";

export type ForgeUpgradeKind = "rarity" | "wear" | "level";

export interface ForgeOption {
  kind: ForgeUpgradeKind;
  label: string;
  from: string;
  to: string;
  cost: number;
  /** Шанс уничтожения предмета, 0..1. Если предмет не уничтожен, улучшение успешно. */
  destroyChance: number;
  available: boolean;
}

const RARITY_ORDER: RarityTier[] = ["common", "rare", "epic", "legendary"];
const WEAR_ORDER: WearTier[] = ["battered", "worn", "new"];
const RARITY_COST: Record<RarityTier, number> = { common: 100, rare: 500, epic: 1000, legendary: 0 };
const RARITY_RISK: Record<RarityTier, number> = { common: 0.25, rare: 0.5, epic: 0.75, legendary: 0 };
const WEAR_COST: Record<WearTier, number> = { battered: 100, worn: 375, new: 0 };
const WEAR_RISK: Record<WearTier, number> = { battered: 0.3, worn: 0.6, new: 0 };

export function levelUpgradeCost(level: number): number {
  return 100 + 50 * (clampGearLevel(level) + 1);
}

/** Риск уничтожения при повышении уровня: 10% + 5% за каждый текущий уровень сверх первого. */
export function levelUpgradeDestroyChance(level: number): number {
  return Math.min(1, Math.round((0.1 + 0.05 * (clampGearLevel(level) - 1)) * 100) / 100);
}

export function forgeOptions(item: GearItem): ForgeOption[] {
  const ri = RARITY_ORDER.indexOf(item.rarity);
  const wi = WEAR_ORDER.indexOf(item.wear);
  const nextRarity = RARITY_ORDER[ri + 1];
  const nextWear = WEAR_ORDER[wi + 1];
  const lvl = clampGearLevel(item.level ?? 1);
  return [
    {
      kind: "rarity",
      label: "Качество",
      from: item.rarity,
      to: nextRarity ?? item.rarity,
      cost: RARITY_COST[item.rarity],
      destroyChance: RARITY_RISK[item.rarity],
      available: !!nextRarity,
    },
    {
      kind: "wear",
      label: "Изношенность",
      from: item.wear,
      to: nextWear ?? item.wear,
      cost: WEAR_COST[item.wear],
      destroyChance: WEAR_RISK[item.wear],
      available: !!nextWear,
    },
    {
      kind: "level",
      label: "Уровень",
      from: String(lvl),
      to: String(Math.min(MAX_GEAR_LEVEL, lvl + 1)),
      cost: levelUpgradeCost(lvl),
      destroyChance: levelUpgradeDestroyChance(lvl),
      available: lvl < MAX_GEAR_LEVEL,
    },
  ];
}

function pickUnique<T>(pool: T[], count: number, rng: () => number, exclude: T[] = []): T[] {
  const avail = pool.filter((x) => !exclude.includes(x));
  const out: T[] = [];
  while (out.length < count && avail.length) {
    out.push(avail.splice(Math.floor(rng() * avail.length), 1)[0]);
  }
  return out;
}

/** Повышает качество, добирая недостающие аффиксы/эффекты/пассивки. */
export function upgradeRarity(item: GearItem, rng: () => number = Math.random): GearItem {
  const ri = RARITY_ORDER.indexOf(item.rarity);
  const next = RARITY_ORDER[ri + 1];
  if (!next) return item;
  const base = GEAR_BASES[item.baseId];
  const stat = base?.stat ?? gearAffinity(item);
  const arch = base?.archetype ?? null;
  const kind = gearKindOfBase(base);
  const weaponType = base?.weaponType;
  const out: GearItem = { ...item, rarity: next, identified: true, kind };

  const have = out.effects ?? [];
  const pool = effectPoolForGear({
    kind,
    weaponType,
    gearClass: base?.gearClass ?? item.gearClass,
    stat,
    requiresNothing: base?.noReq === true,
    archetype: arch,
  }).filter((id) => id !== "ap" || canRollExtraAp(next, out.level ?? 1));
  /* Новое качество обязано дать положенное число свойств: аксессуар — минимум одно. */
  const target = effectCountForGear({ kind, rarity: next, weaponType });
  const need = Math.max(0, target - have.length);
  out.effects = [...have, ...pickUnique(pool, need, rng, have)] as GearEffectId[];
  out.effectRolls = { ...(out.effectRolls ?? {}) };
  for (const id of out.effects ?? []) {
    if (out.effectRolls[id] == null) out.effectRolls[id] = rollEffectBase(id, rng);
  }
  if (next === "legendary" && !out.passive) {
    const signature = arch ? archetypePassive(arch) : null;
    const ppool = passivePoolFor(stat, arch).filter((id) => id !== signature);
    out.passive = (signature ?? pickUnique(ppool, 1, rng)[0] ?? Object.keys(GEAR_PASSIVES)[0]) as GearPassiveId;
  }
  if (next === "legendary" && !out.legendaryPassive) {
    const ids = Object.keys(LEGENDARY_PASSIVES) as LegendaryPassiveId[];
    out.legendaryPassive = pickUnique(ids, 1, rng)[0];
  }
  return out;
}

export interface ForgeResult {
  player: Player;
  destroyed: boolean;
  success: boolean;
  cost: number;
  message: string;
  item?: GearItem;
}

/**
 * Выполняет попытку улучшения. Золото списывается всегда;
 * единственный риск — уничтожение предмета. Если он уцелел, улучшение гарантировано.
 */
export function forgeUpgrade(
  player: Player,
  uid: string,
  kind: ForgeUpgradeKind,
  rng: () => number = Math.random,
): ForgeResult {
  const item = player.armory.find((g) => g.uid === uid);
  if (!item) return { player, destroyed: false, success: false, cost: 0, message: "Предмет не найден." };
  const opt = forgeOptions(item).find((o) => o.kind === kind);
  if (!opt || !opt.available) return { player, destroyed: false, success: false, cost: 0, message: "Это улучшение уже недостижимо." };
  if (player.gold < opt.cost) return { player, destroyed: false, success: false, cost: 0, message: "Не хватает золота." };

  const paid: Player = { ...player, gold: player.gold - opt.cost };
  const destroyed = rng() < opt.destroyChance;
  if (destroyed) {
    const equip = { ...paid.equip };
    for (const slot of Object.keys(equip) as (keyof typeof equip)[]) {
      if (equip[slot] === uid) equip[slot] = null;
    }
    return {
      player: { ...paid, armory: paid.armory.filter((g) => g.uid !== uid), equip },
      destroyed: true,
      success: false,
      cost: opt.cost,
      message: `«${GEAR_BASES[item.baseId]?.name ?? "Предмет"}» не выдержал горна и уничтожен.`,
    };
  }

  let upgraded: GearItem;
  if (kind === "rarity") upgraded = upgradeRarity(item, rng);
  else if (kind === "wear") {
    const next = WEAR_ORDER[WEAR_ORDER.indexOf(item.wear) + 1];
    upgraded = { ...item, wear: next, wearMult: WEAR_RANGE[next].base };
  } else {
    upgraded = { ...item, level: clampGearLevel((item.level ?? 1) + 1) };
  }
  return {
    player: { ...paid, armory: paid.armory.map((g) => (g.uid === uid ? upgraded : g)) },
    destroyed: false,
    success: true,
    cost: opt.cost,
    message: `«${GEAR_BASES[upgraded.baseId]?.name ?? "Предмет"}» улучшен: ${opt.label.toLowerCase()} → ${opt.to}.`,
    item: upgraded,
  };
}
