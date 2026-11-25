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
  ARMOR_SKILL_IDS,
  ENEMIES,
  EPIC_SKILLS,
  GEAR_BASES,
  ITEMS,
  REMOVED_ITEM_IDS,
  LEGENDARY_PASSIVES,
  MAX_LEVEL,
  RECIPES,
  WEAPON_TECHNIQUES,
  statPointCost,
} from "../src/game/content";
import { xpForNextLevel } from "../src/game/content";
import { GEAR_EFFECTS, GEAR_PASSIVES, type GearEffectId, type GearPassiveId } from "../src/game/gearEffects";
import { statMilestoneById } from "../src/game/statMilestones";
import { SKILL_RANK_MAX, skillBranchById, skillPointsEarned, skillPointsSpent } from "../src/game/archetypeSkills";
import { ARCHETYPE_ORDER, type ArchetypeId } from "../src/game/archetypes";
import { migrateLegacyId, migrateLegacyPassives } from "../src/game/archetypeMigration";
import { totalStatPoints } from "../src/game/progression";
import { derived } from "../src/game/battle";
import { CHARACTER_NAME_MAX, DEFAULT_CHARACTER_NAME } from "../src/game/characterName";
import { SHOP_MAX_LEVEL } from "../src/game/world";
import { BLESSING_IDS } from "../src/game/blessings";
import { GIVER_ORDER, zeroTrust } from "../src/game/quests";
import {
  SLOT_ORDER,
  WEAR_RANGE,
  type GearItem,
  type GearKind,
  type LegendaryPassiveId,
  type Player,
  type Quest,
  type QuestGiverId,
  type QuestKind,
  type QuestLog,
  type QuestReward,
  type ShopLine,
  type Slot,
  type StatKey,
} from "../src/game/types";
import { TRUST_MAX, type Cell, type Maze, type Run, type Threat } from "../src/game/types";

const THREATS: readonly Threat[] = ["normal", "horror", "catastrophe"];
import { MAX_SIZE, MIN_SIZE } from "../src/game/maze";
import { canPouch, POUCH_SLOTS } from "../src/game/pouch";
import type { BiomeId } from "../src/game/biomes";
import { TRAP_KINDS, type TrapKind } from "../src/game/traps";
import type { ArmorSkillId } from "../src/game/types";
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
const STATUS_KEYS = [
  "wound", "curse", "poison", "cursePower", "chill", "fear", "wither", "burn",
  "woundTick", "poisonTick", "burnTick", "chillTick", "curseTick",
] as const;

const EFFECT_IDS = new Set(Object.keys(GEAR_EFFECTS));
const EPIC_IDS = new Set(Object.keys(EPIC_SKILLS));
const PASSIVE_IDS = new Set(Object.keys(GEAR_PASSIVES));
const LEGENDARY_IDS = new Set(Object.keys(LEGENDARY_PASSIVES));
const RECIPE_IDS = new Set(RECIPES.map((r) => r.id));
const PASSIVE_RE = /^[a-z0-9_]{1,40}$/;
const QUEST_KINDS: QuestKind[] = ["kill", "fetch", "reagents"];
const FETCH_SOURCES = ["drop", "remains", "captive"] as const;
const ENEMY_IDS = new Set(ENEMIES.map((e) => e.id));
const BLESSING_SET = new Set<string>(BLESSING_IDS);
const GIVER_SET = new Set<string>(GIVER_ORDER);
/** Потолок этажа задания: выше открыть нельзя, но запас оставляем. */
const QUEST_FLOOR_MAX = 200;

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
  const baseId = migrateLegacyId(String(item.baseId ?? ""));
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
  const passiveId = typeof item.passive === "string" ? migrateLegacyId(item.passive) : "";
  const passive = PASSIVE_IDS.has(passiveId) ? (passiveId as GearPassiveId) : undefined;
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
        /* Броски параметров: −1…+1 у нового снаряжения; старые большие значения сохраняются как есть. */
        hp: optionalInt(statRollsRaw.hp, -9999, 9999) ?? 0,
        armor: optionalInt(statRollsRaw.armor, -9999, 9999) ?? 0,
        evade: optionalInt(statRollsRaw.evade, -9999, 9999),
        regen: optionalInt(statRollsRaw.regen, -200, 200),
        barrier: optionalInt(statRollsRaw.barrier, -9999, 9999),
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
  /* Множитель урона экземпляра и качество брони задают характеристики: без них предмет меняется после перезагрузки. */
  const dmgMult = optionalInt(item.dmgMult, 0.5, 2);
  if (dmgMult !== undefined) out.dmgMult = dmgMult;
  const armorQuality = optionalInt(item.armorQuality, 0, 1);
  if (armorQuality !== undefined) out.armorQuality = armorQuality;
  if (typeof item.armorSkill === "string" && ARMOR_SKILL_IDS.includes(item.armorSkill as ArmorSkillId)) {
    out.armorSkill = item.armorSkill as ArmorSkillId;
  }
  return out;
}

/**
 * Приводит сохранение к допустимому виду и проверяет инварианты.
 * `floors` — сколько этажей открыто (для запаса «событийных» характеристик).
 */
function textOf(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || value.length > max) bad(`${name}: некорректный текст`);
  return value as string;
}

function listOf<T>(value: unknown, name: string, max: number, read: (item: unknown, index: number) => T): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) bad(`${name}: список`);
  return (value as unknown[]).map(read);
}

function sanitizeReward(raw: unknown): QuestReward {
  const r = asObject(raw, "награда задания");
  if (r.kind === "gold") return { kind: "gold", amount: int(r.amount ?? 0, 0, GOLD_CAP, "награда золотом") };
  if (r.kind === "supplies") {
    const items = listOf(r.items, "припасы награды", 3, (id) => {
      if (typeof id !== "string" || !ITEMS[id]) bad("неизвестный припас в награде");
      return id as string;
    });
    return { kind: "supplies", items };
  }
  if (r.kind === "gear") return { kind: "gear", level: int(r.level ?? 1, 1, MAX_LEVEL, "уровень награды") };
  bad("неизвестный вид награды");
}

function sanitizeQuest(raw: unknown): Quest {
  const q = asObject(raw, "задание");
  if (typeof q.id !== "string" || !/^[a-z0-9]{1,24}$/i.test(q.id)) bad("id задания");
  if (typeof q.giver !== "string" || !GIVER_SET.has(q.giver)) bad("неизвестный NPC задания");
  if (!QUEST_KINDS.includes(q.kind as QuestKind)) bad("неизвестный вид задания");
  const quest: Quest = {
    id: q.id as string,
    giver: q.giver as Quest["giver"],
    kind: q.kind as QuestKind,
    floor: int(q.floor ?? 1, 1, QUEST_FLOOR_MAX, "этаж задания"),
    title: textOf(q.title ?? "", "название задания", 120),
    text: textOf(q.text ?? "", "описание задания", 400),
    reward: sanitizeReward(q.reward),
    coupon: q.coupon === true,
  };
  if (q.enemyId !== undefined) {
    if (typeof q.enemyId !== "string" || !ENEMY_IDS.has(q.enemyId)) bad("неизвестное существо задания");
    quest.enemyId = q.enemyId as string;
  }
  if (q.enemyName !== undefined) quest.enemyName = textOf(q.enemyName, "имя существа", 80);
  if (q.source !== undefined) {
    if (!FETCH_SOURCES.includes(q.source as (typeof FETCH_SOURCES)[number])) bad("неизвестный источник принесения");
    quest.source = q.source as Quest["source"];
  }
  if (q.itemName !== undefined) quest.itemName = textOf(q.itemName, "название предмета задания", 160);
  if (q.reagent !== undefined) {
    if (typeof q.reagent !== "string" || !ITEMS[q.reagent]) bad("неизвестный реагент задания");
    quest.reagent = q.reagent as string;
  }
  if (q.amount !== undefined) quest.amount = int(q.amount, 1, 50, "количество реагентов");
  if (q.done === true) quest.done = true;
  return quest;
}

/** Доверие к жителям: каждому от 0 до TRUST_MAX, лишних ключей не бывает. */
function sanitizeTrust(raw: unknown): Record<QuestGiverId, number> {
  if (raw === undefined || raw === null) return zeroTrust();
  const input = asObject(raw, "доверие");
  for (const key of Object.keys(input)) if (!GIVER_SET.has(key)) bad("доверие: неизвестный NPC");
  const out = zeroTrust();
  for (const id of GIVER_ORDER) out[id] = int(input[id] ?? 0, 0, TRUST_MAX, `доверие: ${id}`);
  return out;
}

function sanitizeShopLines(raw: unknown, name: string): ShopLine[] {
  const lines = listOf(raw, name, 12, (line): ShopLine | null => {
    const l = asObject(line, name);
    /* Товар снят с игры, но остался в витрине старого сохранения: строка просто убирается. */
    if (typeof l.id === "string" && REMOVED_ITEM_IDS.has(l.id)) return null;
    if (typeof l.id !== "string" || !ITEMS[l.id]) bad(`${name}: неизвестный товар`);
    return {
      id: l.id as string,
      qty: int(l.qty ?? 0, 0, 3, `${name}: количество`),
      price: int(l.price ?? 0, 0, GOLD_CAP, `${name}: цена`),
    };
  });
  return lines.filter((line): line is ShopLine => line !== null);
}

/** Журнал заданий: задания, купоны, благословения и товары NPC. Вне схемы — 400. */
function sanitizeQuestLog(raw: unknown): QuestLog {
  const input = asObject(raw, "журнал заданий");
  const blessingNext = input.blessingNext === undefined || input.blessingNext === null ? null : input.blessingNext;
  if (blessingNext !== null && (typeof blessingNext !== "string" || !BLESSING_SET.has(blessingNext))) bad("благословение");
  return {
    offers: listOf(input.offers, "предложения заданий", 12, sanitizeQuest),
    active: listOf(input.active, "взятые задания", 8, sanitizeQuest),
    carried: listOf(input.carried, "принесённое", 40, (id) => {
      if (typeof id !== "string" || id.length > 40) bad("принесённое задание");
      return id as string;
    }),
    coupons: int(input.coupons ?? 0, 0, 20, "скидки"),
    trust: sanitizeTrust(input.trust),
    blessingOffers: listOf(input.blessingOffers, "благословения", 8, (id) => {
      if (typeof id !== "string" || !BLESSING_SET.has(id)) bad("благословение священника");
      return id as string;
    }),
    blessingNext: blessingNext as string | null,
    wizard: sanitizeShopLines(input.wizard, "волшебник"),
    villager: sanitizeShopLines(input.villager, "проходимец"),
    mercenary: listOf(input.mercenary, "наёмник", 6, (g, i) => sanitizeGear(g, i)),
  };
}

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
    if (REMOVED_ITEM_IDS.has(id)) continue;
    if (!ITEMS[id]) bad(`неизвестный предмет в сумке: «${id}»`);
    const value = int(count, 0, BAG_COUNT_CAP, "количество в сумке");
    if (value > 0) bag[id] = value;
  }
  if (Object.keys(bag).length > BAG_TYPES_CAP) bad("слишком много видов предметов");

  /* Сумка: пять слотов, в каждом зелье, свиток, расходник или пусто. Лишнее отбрасывается. */
  const pouchInput = Array.isArray(input.pouch) ? input.pouch : null;
  const pouch: (string | null)[] | undefined = pouchInput
    ? Array.from({ length: POUCH_SLOTS }, (_, i) => {
        const id = pouchInput[i];
        return typeof id === "string" && canPouch(id) ? id : null;
      })
    : undefined;

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
    ? [...new Set(migrateLegacyPassives(input.passives).filter((id) => PASSIVE_RE.test(id)))].slice(0, 60)
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

  const archetypeId = typeof input.archetype === "string" ? migrateLegacyId(input.archetype) : "";
  const archetype = ARCHETYPE_ORDER.includes(archetypeId as ArchetypeId) ? (archetypeId as ArchetypeId) : null;

  /* Ранги веток навыков: только ветки основного архетипа, сумма не больше очков уровня. */
  const skillsRaw = input.skillRanks === undefined || input.skillRanks === null ? null : asObject(input.skillRanks, "навыки");
  const skillRanks: Record<string, number> = {};
  if (skillsRaw) {
    for (const [id, value] of Object.entries(skillsRaw)) {
      const def = skillBranchById(id);
      if (!def || def.archetype !== archetype) continue;
      const rank = int(value ?? 0, 0, SKILL_RANK_MAX, `ранг ветки «${id}»`);
      if (rank > 0) skillRanks[id] = rank;
    }
  }
  if (skillPointsSpent(skillRanks) > skillPointsEarned(level)) bad("очки навыков превышают уровень");

  const knownRecipes = Array.isArray(input.knownRecipes)
    ? [...new Set(input.knownRecipes.filter((id): id is string => typeof id === "string" && RECIPE_IDS.has(id)))]
    : [];

  const name = typeof input.name === "string" && input.name.trim()
    ? input.name.trim().slice(0, CHARACTER_NAME_MAX)
    : DEFAULT_CHARACTER_NAME;

  const player: Player = {
    name,
    ...(input.dungeonIntroSeen === true ? { dungeonIntroSeen: true } : {}),
    level,
    xp,
    statPoints,
    stats,
    hp: int(input.hp ?? 1, 0, 100_000, "здоровье"),
    stamina: input.stamina === undefined ? undefined : int(input.stamina, 0, 100_000, "выносливость"),
    gold: int(input.gold ?? 0, 0, GOLD_CAP, "золото"),
    bag,
    ...(pouch ? { pouch } : {}),
    knownRecipes,
    armory,
    equip,
    passives,
    archetype,
    statMilestones,
    skillRanks,
    statuses,
    kills: int(input.kills ?? 0, 0, 1_000_000, "убийства"),
    shopLevel: int(input.shopLevel ?? 1, 1, SHOP_MAX_LEVEL, "уровень лавки"),
    /* Журнал заданий отсутствует у старых сохранений — тогда клиент создаст его при загрузке. */
    questLog: input.questLog === undefined ? undefined : sanitizeQuestLog(input.questLog),
    blessing: typeof input.blessing === "string" && BLESSING_SET.has(input.blessing) ? input.blessing : null,
  };

  /* Здоровье не может превышать максимум по текущим характеристикам и снаряжению. */
  const maxHp = derived(player).maxHp;
  player.hp = Math.max(1, Math.min(maxHp, player.hp));
  return player;
}

/* ─────────────────────────── карта похода ──────────────────────────── */

/** Глубина журнала и длина строки: лишнее обрезается, а не отклоняет сохранение целиком. */
export const RUN_LOG_MAX = 300;
const RUN_LINE_MAX = 400;
const RUN_FLOOR_MAX = 200;
const QUEST_MARK_KINDS = ["kill", "drop", "remains", "captive"] as const;
const EVENT_KINDS = ["positive", "neutral", "negative"] as const;
const BIOME_IDS: BiomeId[] = ["classic", "swamp", "ice", "dark", "fire"];

function mapCell(raw: unknown, size: number, name: string): Cell {
  const c = asObject(raw, name);
  return { x: int(c.x, 0, size - 1, `${name}: x`), y: int(c.y, 0, size - 1, `${name}: y`) };
}

function cellList(raw: unknown, name: string, size: number): number[] {
  return listOf(raw, name, size * size, (v) => int(v, 0, size * size - 1, name));
}

/** Стены: строк и столбцов size или size + 1, значения — булевы. */
function wallGrid(raw: unknown, name: string, size: number): boolean[][] {
  const rows = listOf(raw, name, size + 1, (row) => {
    if (!Array.isArray(row) || row.length > size + 1) bad(`${name}: строка`);
    return (row as unknown[]).map((v) => bool(v, false));
  });
  if (rows.length < size) bad(`${name}: размер карты`);
  return rows;
}

function sanitizeMaze(raw: unknown): Maze {
  const m = asObject(raw, "карта этажа");
  const size = int(m.size, MIN_SIZE, MAX_SIZE, "размер карты");
  const dist = listOf(m.dist, "расстояния", size, (row) => {
    if (!Array.isArray(row) || row.length > size) bad("расстояния: строка");
    return (row as unknown[]).map((v) => int(v, -1, size * size, "расстояние"));
  });
  if (dist.length !== size) bad("расстояния: размер карты");
  const rooms = listOf(m.rooms, "комнаты", 200, (r) => {
    const o = asObject(r, "комната");
    return {
      x: int(o.x, 0, size, "комната: x"),
      y: int(o.y, 0, size, "комната: y"),
      w: int(o.w, 1, size, "комната: ширина"),
      h: int(o.h, 1, size, "комната: высота"),
      kind: textOf(o.kind ?? "", "вид комнаты", 40),
      name: textOf(o.name ?? "", "название комнаты", 80),
      ...(o.tone === undefined ? {} : { tone: textOf(o.tone, "тон комнаты", 20) }),
      pillars: listOf(o.pillars, "пилоны", 64, (p) => {
        if (!Array.isArray(p) || p.length !== 2) bad("пилон");
        return [int(p[0], 0, size, "пилон"), int(p[1], 0, size, "пилон")] as [number, number];
      }),
    };
  });
  const maze: Maze = {
    size,
    h: wallGrid(m.h, "стены h", size),
    v: wallGrid(m.v, "стены v", size),
    start: mapCell(m.start, size, "старт"),
    stairs: mapCell(m.stairs, size, "лестница"),
    boss: mapCell(m.boss, size, "страж"),
    bossDefeated: bool(m.bossDefeated),
    doors: cellList(m.doors, "двери", size),
    openedDoors: cellList(m.openedDoors, "открытые двери", size),
    chests: cellList(m.chests, "сундуки", size),
    openedChests: cellList(m.openedChests, "открытые сундуки", size),
    keys: cellList(m.keys, "ключи", size),
    takenKeys: cellList(m.takenKeys, "взятые ключи", size),
    events: cellList(m.events, "события", size),
    usedEvents: cellList(m.usedEvents, "использованные события", size),
    monsters: cellList(m.monsters, "монстры", size),
    traps: cellList(m.traps, "ловушки", size),
    rooms,
    dist,
  };
  if (m.biome !== undefined) {
    if (!BIOME_IDS.includes(m.biome as BiomeId)) bad("неизвестный тип этажа");
    maze.biome = m.biome as BiomeId;
  }
  if (m.questMarks !== undefined) {
    maze.questMarks = listOf(m.questMarks, "метки заданий", 60, (q) => {
      const o = asObject(q, "метка задания");
      if (!QUEST_MARK_KINDS.includes(o.kind as (typeof QUEST_MARK_KINDS)[number])) bad("вид метки задания");
      const mark: NonNullable<Maze["questMarks"]>[number] = {
        cell: int(o.cell, 0, size * size - 1, "клетка метки"),
        questId: textOf(o.questId ?? "", "id задания", 40),
        kind: o.kind as (typeof QUEST_MARK_KINDS)[number],
        label: textOf(o.label ?? "", "подпись метки", 160),
      };
      if (o.enemyId !== undefined) {
        if (typeof o.enemyId !== "string" || !ENEMIES.some((e) => e.id === o.enemyId)) bad("существо метки");
        mark.enemyId = o.enemyId as string;
      }
      return mark;
    });
  }
  /* Виды монстров и ловушек на клетках: карта показывает их, бой и ловушка берут их же. */
  if (m.monsterKinds !== undefined) {
    maze.monsterKinds = listOf(m.monsterKinds, "виды монстров", 200, (k) => {
      const o = asObject(k, "вид монстра");
      if (typeof o.id !== "string" || !ENEMY_IDS.has(o.id)) bad("вид монстра");
      const threat = THREATS.includes(o.threat as Threat) ? (o.threat as Threat) : undefined;
      /* Погоня: куда монстр пойдёт, если потерял героя из виду (до двух шагов). */
      const hunt =
        o.hunt === undefined
          ? undefined
          : (() => {
              const h = asObject(o.hunt, "погоня монстра");
              return { x: int(h.x, 0, size - 1, "погоня монстра"), y: int(h.y, 0, size - 1, "погоня монстра"), left: int(h.left, 0, 2, "погоня монстра") };
            })();
      return {
        cell: int(o.cell, 0, size * size - 1, "клетка монстра"),
        id: o.id as string,
        ...(threat ? { threat } : {}),
        ...(hunt ? { hunt } : {}),
      };
    });
  }
  if (m.trapKinds !== undefined) {
    maze.trapKinds = listOf(m.trapKinds, "виды ловушек", 200, (k) => {
      const o = asObject(k, "вид ловушки");
      if (!TRAP_KINDS.includes(o.kind as TrapKind)) bad("вид ловушки");
      return { cell: int(o.cell, 0, size * size - 1, "клетка ловушки"), kind: o.kind as TrapKind };
    });
  }
  if (m.eventSpawns !== undefined) {
    maze.eventSpawns = listOf(m.eventSpawns, "события комнат", 200, (e) => {
      const o = asObject(e, "событие комнаты");
      if (!EVENT_KINDS.includes(o.kind as (typeof EVENT_KINDS)[number])) bad("вид события");
      return {
        room: int(o.room, 0, 199, "комната события"),
        cell: int(o.cell, 0, size * size - 1, "клетка события"),
        kind: o.kind as (typeof EVENT_KINDS)[number],
        eventId: textOf(o.eventId ?? "", "id события", 60),
      };
    });
  }
  return maze;
}

/** Набор предметов похода: те же правила, что у сумки героя. */
function runBagOf(value: unknown, what: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, count] of Object.entries(asObject(value, what))) {
    if (REMOVED_ITEM_IDS.has(id)) continue;
    if (!ITEMS[id]) bad(`неизвестный предмет: «${id}»`);
    const n = int(count, 0, BAG_COUNT_CAP, what);
    if (n > 0) out[id] = n;
  }
  if (Object.keys(out).length > BAG_TYPES_CAP) bad("слишком много видов предметов");
  return out;
}

/**
 * Карта похода целиком: этаж, позиция, открытые клетки, добыча и журнал.
 * Бой сюда не попадает: клиент сохраняет последнее состояние карты без боя.
 */
export function sanitizeRun(raw: unknown): Run {
  const r = asObject(raw, "карта похода");
  const maze = sanitizeMaze(r.maze);
  const size = maze.size;

  const seenInput = r.seen === undefined ? {} : asObject(r.seen, "открытые клетки");
  const seen: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(seenInput)) {
    if (!/^\d{1,2},\d{1,2}$/.test(key)) bad("открытая клетка");
    if (value === true) seen[key] = true;
  }

  const loot = listOf(r.loot, "добыча похода", 2000, (id) => {
    if (typeof id !== "string" || !ITEMS[id] || REMOVED_ITEM_IDS.has(id)) bad("неизвестный предмет похода");
    return id as string;
  });
  const gearLoot = listOf(r.gearLoot, "снаряжение похода", 500, (g, i) => sanitizeGear(g, i));
  const log = Array.isArray(r.log)
    ? r.log.slice(-RUN_LOG_MAX).map((line) => textOf(line, "строка журнала", RUN_LINE_MAX))
    : [];

  const run: Run = {
    floor: int(r.floor, 1, RUN_FLOOR_MAX, "этаж похода"),
    maze,
    pos: mapCell(r.pos, size, "позиция"),
    prevPos: mapCell(r.prevPos ?? r.pos, size, "прошлая позиция"),
    seen,
    gold: int(r.gold ?? 0, 0, GOLD_CAP, "золото похода"),
    loot,
    gearLoot,
    keys: int(r.keys ?? 0, 0, 999, "ключи похода"),
    steps: int(r.steps ?? 0, 0, 1_000_000, "шаги"),
    log,
  };
  if (r.bossSlain !== undefined) run.bossSlain = bool(r.bossSlain);
  /* Рюкзак перед походом: оставленное в лобби и сумка с спец. предметами, которые идут сами. */
  if (r.lobbyBag !== undefined) run.lobbyBag = runBagOf(r.lobbyBag, "рюкзак в лобби");
  if (r.keptBag !== undefined) run.keptBag = runBagOf(r.keptBag, "сумка похода");
  if (r.torchTurns !== undefined) run.torchTurns = int(r.torchTurns, 0, 1000, "факел");
  if (r.mapRevealed !== undefined) run.mapRevealed = bool(r.mapRevealed);
  if (r.burning !== undefined) run.burning = int(r.burning, 0, 99, "горение");
  if (r.battleCell === null) run.battleCell = null;
  else if (r.battleCell !== undefined) run.battleCell = int(r.battleCell, 0, size * size - 1, "клетка боя");
  if (r.pendingFight !== undefined && r.pendingFight !== null) {
    const pf = asObject(r.pendingFight, "открытый бой");
    const boss = bool(pf.boss);
    if (typeof pf.foe !== "string" || pf.foe.length > 64) bad("открытый бой");
    /* Обычный монстр — из списка существ; страж яруса выбирается по этажу, id сверяется по длине. */
    if (!boss && !ENEMY_IDS.has(pf.foe)) bad("открытый бой");
    run.pendingFight = { foe: pf.foe, boss };
  }
  if (r.clearedMonsters !== undefined) run.clearedMonsters = cellList(r.clearedMonsters, "побеждённые", size);
  if (r.revealedTraps !== undefined) run.revealedTraps = cellList(r.revealedTraps, "найденные ловушки", size);
  if (r.revealedEvents !== undefined) run.revealedEvents = cellList(r.revealedEvents, "найденные события", size);
  if (r.sprungTraps !== undefined) run.sprungTraps = cellList(r.sprungTraps, "сработавшие ловушки", size);
  if (r.questCarry !== undefined) {
    run.questCarry = listOf(r.questCarry, "принесённое", 40, (q) => {
      const o = asObject(q, "принесённое задание");
      return { questId: textOf(o.questId ?? "", "id задания", 40), label: textOf(o.label ?? "", "подпись", 160) };
    });
  }
  return run;
}
