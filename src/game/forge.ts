/**
 * Кузница: улучшение качества, изношенности и уровня снаряжения.
 * Попытка стоит золота. Без реагентов неудача уничтожает предмет, как раньше;
 * с реагентами вещь при неудаче остаётся целой, а риск падает тем сильнее, чем полнее набор.
 */
import type { GearItem, Player, RarityTier, WearTier } from "./types";
import { GEAR_BASES, ITEMS, LEGENDARY_PASSIVES, gearAffinity, gearKindOfBase } from "./content";
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
  /** Шанс неудачи без реагентов, 0..1. Без реагентов такая неудача уничтожает предмет. */
  failChance: number;
  /** Шанс неудачи при полном наборе реагентов, 0..1. */
  failChanceFull: number;
  /** Сколько всего единиц реагентов нужно для полного набора. */
  reagentTotal: number;
  /** Сколько из них обязательно металлолома. */
  reagentScrap: number;
  /** Металлолом в это улучшение не кладут: качество и уровень делают на других реагентах. */
  reagentForbidScrap: boolean;
  available: boolean;
}

const RARITY_ORDER: RarityTier[] = ["common", "rare", "epic", "legendary"];
const WEAR_ORDER: WearTier[] = ["battered", "worn", "new"];
/** Старые цены работы: качество зависит от текущего качества, изношенность — от текущей. */
const RARITY_COST: Record<RarityTier, number> = { common: 100, rare: 500, epic: 1000, legendary: 0 };
const WEAR_COST: Record<WearTier, number> = { battered: 100, worn: 375, new: 0 };
/** Шанс неудачи без реагентов: без реагентов такая неудача уничтожает вещь. */
const RARITY_FAIL: Record<RarityTier, number> = { common: 0.25, rare: 0.5, epic: 0.75, legendary: 0 };
const WEAR_FAIL: Record<WearTier, number> = { battered: 0.3, worn: 0.6, new: 0 };
/**
 * Полный набор реагентов и шанс неудачи при нём:
 * качество обычное → редкое 5 реагентов (10%), редкое → эпическое 15 (25%),
 * эпическое → легендарное 25 (45%);
 * изношенность потрёпанное → ношеное 5 металлолома (0%), ношеное → новое
 * 10 металлолома + 5 других реагентов (25%);
 * уровень — 2 реагента за каждый уровень предмета, шанс неудачи вдвое ниже обычного.
 */
const RARITY_REAGENTS: Record<RarityTier, { total: number; fail: number }> = {
  common: { total: 5, fail: 0.1 },
  rare: { total: 15, fail: 0.25 },
  epic: { total: 25, fail: 0.45 },
  legendary: { total: 0, fail: 0 },
};
const WEAR_REAGENTS: Record<WearTier, { total: number; scrap: number; fail: number }> = {
  battered: { total: 5, scrap: 5, fail: 0 },
  worn: { total: 15, scrap: 10, fail: 0.25 },
  new: { total: 0, scrap: 0, fail: 0 },
};
/** Эти реагенты идут только на свитки, зелья и прочие рецепты — в горн их не кладут. */
export const FORGE_BANNED_REAGENTS = ["parchment", "magic_ink", "vial"];

/** Цена повышения уровня: 100 + 50 × (уровень + 1). */
export function levelUpgradeCost(level: number): number {
  return 100 + 50 * (clampGearLevel(level) + 1);
}

/** Обычный шанс неудачи при повышении уровня: 10% + 5% за каждый уровень сверх первого. */
export function levelFailChance(level: number): number {
  return Math.min(1, Math.round((0.1 + 0.05 * (clampGearLevel(level) - 1)) * 100) / 100);
}

/** Сколько реагентов нужно на улучшение и какой шанс неудачи останется при полном наборе. */
export function forgeReagentNeed(
  item: GearItem,
  kind: ForgeUpgradeKind,
): { total: number; scrap: number; forbidScrap: boolean; failFull: number } {
  if (kind === "rarity") {
    const r = RARITY_REAGENTS[item.rarity];
    return { total: r.total, scrap: 0, forbidScrap: true, failFull: r.fail };
  }
  if (kind === "wear") {
    const w = WEAR_REAGENTS[item.wear];
    return { total: w.total, scrap: w.scrap, forbidScrap: false, failFull: w.fail };
  }
  const lvl = clampGearLevel(item.level ?? 1);
  return {
    total: 2 * lvl,
    scrap: 0,
    forbidScrap: true,
    failFull: Math.min(1, Math.round((levelFailChance(lvl) / 2) * 100) / 100),
  };
}

export function forgeOptions(item: GearItem): ForgeOption[] {
  const ri = RARITY_ORDER.indexOf(item.rarity);
  const wi = WEAR_ORDER.indexOf(item.wear);
  const nextRarity = RARITY_ORDER[ri + 1];
  const nextWear = WEAR_ORDER[wi + 1];
  const lvl = clampGearLevel(item.level ?? 1);
  const rarityNeed = forgeReagentNeed(item, "rarity");
  const wearNeed = forgeReagentNeed(item, "wear");
  const levelNeed = forgeReagentNeed(item, "level");
  return [
    {
      kind: "rarity",
      label: "Качество",
      from: item.rarity,
      to: nextRarity ?? item.rarity,
      cost: RARITY_COST[item.rarity],
      failChance: RARITY_FAIL[item.rarity],
      failChanceFull: rarityNeed.failFull,
      reagentTotal: rarityNeed.total,
      reagentScrap: rarityNeed.scrap,
      reagentForbidScrap: rarityNeed.forbidScrap,
      available: !!nextRarity,
    },
    {
      kind: "wear",
      label: "Изношенность",
      from: item.wear,
      to: nextWear ?? item.wear,
      cost: WEAR_COST[item.wear],
      failChance: WEAR_FAIL[item.wear],
      failChanceFull: wearNeed.failFull,
      reagentTotal: wearNeed.total,
      reagentScrap: wearNeed.scrap,
      reagentForbidScrap: wearNeed.forbidScrap,
      available: !!nextWear,
    },
    {
      kind: "level",
      label: "Уровень",
      from: String(lvl),
      to: String(Math.min(MAX_GEAR_LEVEL, lvl + 1)),
      cost: levelUpgradeCost(lvl),
      failChance: levelFailChance(lvl),
      failChanceFull: levelNeed.failFull,
      reagentTotal: levelNeed.total,
      reagentScrap: levelNeed.scrap,
      reagentForbidScrap: levelNeed.forbidScrap,
      available: lvl < MAX_GEAR_LEVEL,
    },
  ];
}

/** Реагент годится для горна: это реагент и он не зарезервирован за рецептами. */
export function isForgeReagent(id: string): boolean {
  const def = ITEMS[id];
  return !!def && def.kind === "reagent" && !FORGE_BANNED_REAGENTS.includes(id);
}

export interface ForgeReagentPlan {
  /** Что уйдёт в горн: id реагента → количество. */
  picked: Record<string, number>;
  /** Сколько всего единиц вложено. */
  total: number;
  /** Сколько из них металлолома. */
  scrap: number;
}

/**
 * Раскладка реагентов: сначала обязательный металлолом, затем самые дешёвые
 * реагенты из сумки. Возвращает только то, что реально есть.
 */
export function forgeReagentPlan(
  bag: Record<string, number>,
  need: { total: number; scrap: number; forbidScrap?: boolean },
): ForgeReagentPlan {
  /* Качество и уровень не делают на металлоломе: он годится только на изношенность. */
  const noScrap = need.forbidScrap === true;
  const avail: Record<string, number> = {};
  for (const [id, n] of Object.entries(bag)) {
    if (n <= 0 || !isForgeReagent(id)) continue;
    if (noScrap && id === "scrap_metal") continue;
    avail[id] = n;
  }
  const picked: Record<string, number> = {};
  let left = need.total;
  const take = (id: string, want: number) => {
    const got = Math.min(want, avail[id] ?? 0, left);
    if (got <= 0) return;
    picked[id] = (picked[id] ?? 0) + got;
    avail[id] -= got;
    left -= got;
  };
  take("scrap_metal", noScrap ? 0 : need.scrap);
  const rest = Object.keys(avail)
    .filter((id) => (avail[id] ?? 0) > 0)
    .sort((a, b) => (ITEMS[a]?.price ?? 0) - (ITEMS[b]?.price ?? 0) || a.localeCompare(b));
  for (const id of rest) {
    if (left <= 0) break;
    take(id, left);
  }
  const total = need.total - left;
  return { picked, total, scrap: picked.scrap_metal ?? 0 };
}

/** Шанс неудачи при вложенных реагентах: доля от полного набора линейно снижает риск. */
export function forgeFailChance(opt: ForgeOption, reagents: number): number {
  if (opt.reagentTotal <= 0) return opt.failChance;
  const share = Math.min(1, Math.max(0, reagents) / opt.reagentTotal);
  return Math.round((opt.failChance + (opt.failChanceFull - opt.failChance) * share) * 100) / 100;
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
  /** Попытка без реагентов при неудаче уничтожает вещь. */
  destroyed: boolean;
  success: boolean;
  cost: number;
  message: string;
  item?: GearItem;
  /** Сколько единиц реагентов ушло в горн. */
  reagentsUsed: number;
  /** Итоговый шанс неудачи этой попытки, 0..1. */
  failChance: number;
}

function spendReagents(bag: Record<string, number>, picked: Record<string, number>): Record<string, number> {
  const out = { ...bag };
  for (const [id, n] of Object.entries(picked)) {
    const left = (out[id] ?? 0) - n;
    if (left > 0) out[id] = left;
    else delete out[id];
  }
  return out;
}

const GEAR_NAME = (item: GearItem) => GEAR_BASES[item.baseId]?.name ?? "Предмет";

/**
 * Выполняет попытку улучшения. Золото списывается всегда.
 * Если реагенты в горн не клали, неудача уничтожает вещь — как раньше.
 * С реагентами вещь при неудаче остаётся целой: сгорают только золото и реагенты.
 * Полный набор даёт шанс неудачи из таблицы улучшений.
 */
export function forgeUpgrade(
  player: Player,
  uid: string,
  kind: ForgeUpgradeKind,
  rng: () => number = Math.random,
  useReagents = false,
): ForgeResult {
  const item = player.armory.find((g) => g.uid === uid);
  if (!item) {
    return { player, destroyed: false, success: false, cost: 0, message: "Предмет не найден.", reagentsUsed: 0, failChance: 0 };
  }
  const opt = forgeOptions(item).find((o) => o.kind === kind);
  if (!opt || !opt.available) {
    return {
      player, destroyed: false, success: false, cost: 0,
      message: "Это улучшение уже недостижимо.", reagentsUsed: 0, failChance: 0,
    };
  }
  if (player.gold < opt.cost) {
    return { player, destroyed: false, success: false, cost: 0, message: "Не хватает золота.", reagentsUsed: 0, failChance: 0 };
  }

  const plan = useReagents
    ? forgeReagentPlan(player.bag, {
        total: opt.reagentTotal,
        scrap: opt.reagentScrap,
        forbidScrap: opt.reagentForbidScrap,
      })
    : { picked: {}, total: 0, scrap: 0 };
  const failChance = forgeFailChance(opt, plan.total);
  const paid: Player = { ...player, gold: player.gold - opt.cost, bag: spendReagents(player.bag, plan.picked) };
  const spent = plan.total > 0 ? ` Золото и реагенты (${plan.total}) потрачены.` : " Золото потрачено.";

  if (rng() < failChance) {
    /* Без реагентов горн не щадит вещь: неудача её уничтожает. */
    if (plan.total === 0) {
      const equip = { ...paid.equip };
      for (const slot of Object.keys(equip) as (keyof typeof equip)[]) {
        if (equip[slot] === uid) equip[slot] = null;
      }
      return {
        player: { ...paid, armory: paid.armory.filter((g) => g.uid !== uid), equip },
        destroyed: true,
        success: false,
        cost: opt.cost,
        message: `«${GEAR_NAME(item)}» не выдержал горна и уничтожен.${spent}`,
        reagentsUsed: 0,
        failChance,
      };
    }
    return {
      player: paid,
      destroyed: false,
      success: false,
      cost: opt.cost,
      message: `Горн не взял работу: «${GEAR_NAME(item)}» остался как был.${spent}`,
      reagentsUsed: plan.total,
      failChance,
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
    message: `«${GEAR_NAME(upgraded)}»: ${opt.label.toLowerCase()} → ${opt.to}.${spent}`,
    item: upgraded,
    reagentsUsed: plan.total,
    failChance,
  };
}
