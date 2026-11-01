/**
 * Проверка сохранения игрока на сервере.
 *
 * Клиент присылает героя целиком, поэтому сервер обязан сам убедиться, что
 * структура допустима: известные базы снаряжения, допустимые состояния и
 * редкости, ссылки `equip` на реальные предметы, характеристики в рамках
 * бюджета уровня. Всё, что не проходит проверку, отклоняется (400), а не
 * записывается в базу.
 *
 * Ограничение: это проверка схемы и инвариантов. Полная защита от накрутки
 * (когда клиент честно присылает «валидное» сохранение с большим золотом или
 * редким предметом) требует серверного подсчёта экономики — здесь она
 * ограничена потолками и бюджетом очков, чтобы урон от читерства был
 * ограниченным.
 */
import {
  EPIC_SKILLS,
  GEAR_BASES,
  ITEMS,
  LEGENDARY_PASSIVES,
  MAX_LEVEL,
  RECIPES,
  WEAPON_TECHNIQUES,
  statPointCost,
} from "../src/game/content";
import { xpForNextLevel } from "../src/game/content";
import { GEAR_EFFECTS, GEAR_PASSIVES, type GearEffectId, type GearPassiveId } from "../src/game/gearEffects";
import { statMilestoneById } from "../src/game/statMilestones";
import { ARCHETYPE_ORDER, type ArchetypeId } from "../src/game/archetypes";
import { totalStatPoints } from "../src/game/progression";
import { derived } from "../src/game/battle";
import { SHOP_MAX_LEVEL } from "../src/game/world";
import {
  SLOT_ORDER,
  WEAR_RANGE,
  type GearItem,
  type GearKind,
  type LegendaryPassiveId,
  type Player,
  type Slot,
  type StatKey,
} from "../src/game/types";
import { HttpError } from "./http";

/** Потолки, выше которых сохранение считается подделкой. */
export const GOLD_CAP = 1_000_000;
export const ARMORY_CAP = 240;
export const BAG_TYPES_CAP = 120;
export const BAG_COUNT_CAP = 999;
export const STATUS_CAP = 99;
/**
 * Запас «бесплатных» очков характеристик: события карты иногда дают +1 к
 * характеристике в обход очков уровня. Разрешаем по два таких очка за
 * открытый этаж — события появляются не чаще двух на этаж.
 */
export const FREE_STAT_PER_FLOOR = 2;

const WEAR_TIERS = Object.keys(WEAR_RANGE) as (keyof typeof WEAR_RANGE)[];
const RARITIES = ["common", "rare", "epic", "legendary"] as const;
const GEAR_KINDS = ["weapon", "armor", "accessory"] as const;
const GEAR_CLASSES = ["light", "medium", "heavy"] as const;
const STATS: StatKey[] = ["str", "agi", "int"];
const STATUS_KEYS = ["wound", "curse", "poison", "cursePower", "chill", "fear", "wither", "burn"] as const;

const EFFECT_IDS = new Set(Object.keys(GEAR_EFFECTS));
const EPIC_IDS = new Set(Object.keys(EPIC_SKILLS));
const PASSIVE_IDS = new Set(Object.keys(GEAR_PASSIVES));
const LEGENDARY_IDS = new Set(Object.keys(LEGENDARY_PASSIVES));
const RECIPE_IDS = new Set(RECIPES.map((r) => r.id));
const PASSIVE_RE = /^[a-z0-9_]{1,40}$/;

function bad(reason: string): never {
  throw new HttpError(400, `Некорректное сохранение: ${reason}`);
}

function asObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) bad(`${name} должен быть объектом`);
  return value as Record<string, unknown>;
}

function int(value: unknown, min: number, max: number, name: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) bad(`${name} не число`);
  return Math.max(min, Math.min(max, Math.round(n)));
}

function optionalInt(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function uidOf(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 48) bad("некорректный uid предмета");
  return value;
}

/** Снаряжение: известная база, допустимые редкость/состояние и только известные свойства. */
function sanitizeGear(raw: unknown, index: number): GearItem {
  const item = asObject(raw, `предмет #${index}`);
  const baseId = String(item.baseId ?? "");
  const base = GEAR_BASES[baseId];
  if (!base) bad(`неизвестный предмет «${baseId}»`);

  const wear = oneOf(item.wear, WEAR_TIERS, "worn");
  const rarity = oneOf(item.rarity, RARITIES, "common");
  const kind = oneOf<GearKind>(item.kind ?? base.kind, GEAR_KINDS, "weapon");
  const gearClass = oneOf(item.gearClass ?? base.gearClass, GEAR_CLASSES, "medium");
  const effects = Array.isArray(item.effects)
    ? (item.effects.filter((id) => typeof id === "string" && EFFECT_IDS.has(id)) as GearEffectId[])
    : [];

  const skillId = typeof item.skillId === "string" && WEAPON_TECHNIQUES[item.skillId] ? item.skillId : undefined;
  const epicSkill = typeof item.epicSkill === "string" && EPIC_IDS.has(item.epicSkill) ? (item.epicSkill as GearItem["epicSkill"]) : undefined;
  const passive = typeof item.passive === "string" && PASSIVE_IDS.has(item.passive) ? (item.passive as GearPassiveId) : undefined;
  const legendaryPassive = typeof item.legendaryPassive === "string" && LEGENDARY_IDS.has(item.legendaryPassive)
    ? (item.legendaryPassive as LegendaryPassiveId)
    : undefined;

  const dmgRollRaw = item.dmgRoll;
  const dmgRoll: [number, number] | undefined = Array.isArray(dmgRollRaw) && dmgRollRaw.length === 2
    ? [int(dmgRollRaw[0], 0, 9999, "урон"), int(dmgRollRaw[1], 0, 9999, "урон")]
    : undefined;
  const statRollsRaw = item.statRolls === undefined || item.statRolls === null ? null : asObject(item.statRolls, "параметры предмета");
  const statRolls = statRollsRaw
    ? {
        hp: optionalInt(statRollsRaw.hp, 0, 9999) ?? 0,
        armor: optionalInt(statRollsRaw.armor, 0, 9999) ?? 0,
        evade: optionalInt(statRollsRaw.evade, 0, 1),
      }
    : undefined;
  const effectRollsRaw = item.effectRolls === undefined || item.effectRolls === null ? null : asObject(item.effectRolls, "броски свойств");
  const effectRolls: GearItem["effectRolls"] = {};
  if (effectRollsRaw) {
    for (const id of effects) {
      const rolled = optionalInt(effectRollsRaw[id], 0, 9999);
      if (rolled !== undefined) effectRolls[id] = rolled;
    }
  }

  const out: GearItem = {
    uid: uidOf(item.uid),
    baseId,
    slot: base.slot,
    level: int(item.level ?? 1, 1, 10, `уровень предмета #${index}`),
    gearClass,
    kind,
    wear,
    rarity,
    identified: bool(item.identified, false),
    wearMult: optionalInt(item.wearMult, 0.5, 2) ?? WEAR_RANGE[wear].base,
    statMult: optionalInt(item.statMult, 0.5, 2) ?? 1,
    effects,
  };
  if (dmgRoll) out.dmgRoll = dmgRoll;
  if (statRolls) out.statRolls = statRolls;
  if (Object.keys(effectRolls).length) out.effectRolls = effectRolls;
  if (skillId) out.skillId = skillId;
  if (epicSkill) out.epicSkill = epicSkill;
  if (passive) out.passive = passive;
  if (legendaryPassive) out.legendaryPassive = legendaryPassive;
  if (bool(item.noReq)) out.noReq = true;
  if (item.grip === "one" || item.grip === "two") out.grip = item.grip;
  if (base.weaponType) out.weaponType = base.weaponType;
  return out;
}

/**
 * Приводит сохранение к допустимому виду и проверяет инварианты.
 * `floors` — сколько этажей открыто (для запаса «событийных» характеристик).
 */
export function sanitizePlayer(raw: unknown, floors = 1): Player {
  const input = asObject(raw, "герой");
  const level = int(input.level ?? 1, 1, MAX_LEVEL, "уровень");

  const statsInput = asObject(input.stats, "характеристики");
  const stats = {
    str: int(statsInput.str ?? 1, 1, 10, "Сила"),
    agi: int(statsInput.agi ?? 1, 1, 10, "Ловкость"),
    int: int(statsInput.int ?? 1, 1, 10, "Интеллект"),
  };

  const total = totalStatPoints(level);
  const statPoints = int(input.statPoints ?? 0, 0, total, "очки характеристик");
  const spent = STATS.reduce((sum, stat) => {
    let cost = 0;
    for (let value = 1; value < stats[stat]; value++) cost += statPointCost(stat, value);
    return sum + cost;
  }, 0);
  const allowance = total - statPoints + FREE_STAT_PER_FLOOR * Math.max(1, Math.min(10, Math.floor(floors)));
  if (spent > allowance) bad("характеристики превышают очки уровня");

  const xp = int(input.xp ?? 0, 0, Math.max(0, xpForNextLevel(level) - 1), "опыт");

  const bagInput = input.bag === undefined ? {} : asObject(input.bag, "сумка");
  const bag: Record<string, number> = {};
  for (const [id, count] of Object.entries(bagInput)) {
    if (!ITEMS[id]) bad(`неизвестный предмет в сумке: «${id}»`);
    const value = int(count, 0, BAG_COUNT_CAP, "количество в сумке");
    if (value > 0) bag[id] = value;
  }
  if (Object.keys(bag).length > BAG_TYPES_CAP) bad("слишком много видов предметов");

  const armoryInput = Array.isArray(input.armory) ? input.armory : bad("арсенал должен быть списком");
  if (armoryInput.length > ARMORY_CAP) bad("слишком много предметов в арсенале");
  const armory = armoryInput.map((item, index) => sanitizeGear(item, index));
  const uids = new Set(armory.map((item) => item.uid));
  if (uids.size !== armory.length) bad("повторяющиеся uid предметов");

  const equipInput = input.equip === undefined ? {} : asObject(input.equip, "снаряжение");
  const equip = {} as Record<Slot, string | null>;
  const worn = new Set<string>();
  for (const slot of SLOT_ORDER) {
    const value = equipInput[slot];
    if (typeof value === "string" && uids.has(value) && !worn.has(value)) {
      equip[slot] = value;
      worn.add(value);
    } else {
      equip[slot] = null;
    }
  }

  const passives = Array.isArray(input.passives)
    ? [...new Set(input.passives.filter((id): id is string => typeof id === "string" && PASSIVE_RE.test(id)))].slice(0, 60)
    : [];

  const milestonesRaw = input.statMilestones === undefined || input.statMilestones === null ? null : asObject(input.statMilestones, "рубежи");
  const statMilestones: Player["statMilestones"] = {};
  if (milestonesRaw) {
    for (const stat of STATS) {
      const tiersRaw = milestonesRaw[stat];
      if (!tiersRaw || typeof tiersRaw !== "object") continue;
      const tiers = tiersRaw as Record<string, unknown>;
      for (const tier of ["5", "10"] as const) {
        const id = tiers[tier];
        if (typeof id !== "string") continue;
        const option = statMilestoneById(id);
        if (!option || option.stat !== stat || String(option.tier) !== tier) continue;
        (statMilestones[stat] ??= {})[Number(tier) as 5 | 10] = id;
      }
    }
  }

  const statusesInput = input.statuses === undefined ? {} : asObject(input.statuses, "эффекты");
  const statuses: Player["statuses"] = { wound: 0, curse: 0, poison: 0 };
  for (const key of STATUS_KEYS) {
    const value = int(statusesInput[key] ?? 0, 0, STATUS_CAP, `эффект «${key}»`);
    if (value > 0) (statuses as Record<string, number>)[key] = value;
  }

  const archetype = typeof input.archetype === "string" && ARCHETYPE_ORDER.includes(input.archetype as ArchetypeId)
    ? (input.archetype as ArchetypeId)
    : null;

  const knownRecipes = Array.isArray(input.knownRecipes)
    ? [...new Set(input.knownRecipes.filter((id): id is string => typeof id === "string" && RECIPE_IDS.has(id)))]
    : [];

  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 24) : "Покоритель";

  const player: Player = {
    name,
    level,
    xp,
    statPoints,
    stats,
    hp: int(input.hp ?? 1, 0, 100_000, "здоровье"),
    gold: int(input.gold ?? 0, 0, GOLD_CAP, "золото"),
    bag,
    knownRecipes,
    armory,
    equip,
    passives,
    archetype,
    statMilestones,
    statuses,
    kills: int(input.kills ?? 0, 0, 1_000_000, "убийства"),
    shopLevel: int(input.shopLevel ?? 1, 1, SHOP_MAX_LEVEL, "уровень лавки"),
  };

  /* Здоровье не может превышать максимум по текущим характеристикам и снаряжению. */
  const maxHp = derived(player).maxHp;
  player.hp = Math.max(1, Math.min(maxHp, player.hp));
  return player;
}
