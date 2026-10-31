import {
  EXTRA_BOSSES,
  EXTRA_ENEMIES,
  EXTRA_GEAR,
  EXTRA_ITEMS,
  EXTRA_REAGENTS,
  EXTRA_RECIPES,
  rollFromTable,
  SHOP_MAX_LEVEL,
  shopRarityTable,
  shopWearTable,
} from "./world";
import type {
  EnemyPassive,
  EpicSkillId,
  GearItem,
  LegendaryPassiveId,
  Player,
  RareAffixId,
  RarityTier,
  Slot,
  StatKey,
  Threat,
  WearTier,
} from "./types";
import { WEAR_RANGE } from "./types";
export { WEAR_RANGE } from "./types";
import { effectPoolFor, passivePoolFor, archetypePassive, type GearEffectId, type GearPassiveId } from "./gearEffects";
import {
  clampGearLevel,
  epicMagnitude,
  gearLevelMultiplier,
  legendaryMagnitude,
  rareAffixMagnitude,
  scaleIntegerByLevel,
  scaleMultByLevel,
  scalePercentByLevel,
  techniqueIntReq,
} from "./gearScaling";
import type { ArchetypeId } from "./archetypes";
export { ARCHETYPES, ARCHETYPE_ORDER, archetypeForStat, archetypeMilestoneIds, archetypeByMilestone } from "./archetypes";
export type { ArchetypeId } from "./archetypes";

/* Таблицы лавки живут в world.ts; пробрасываем их здесь для удобства. */
export { SHOP_MAX_LEVEL, shopRarityTable, shopUpgradeCost, shopWearTable } from "./world";

/* ─────────────  УРОВНИ, ОПЫТ И ОЧКИ ХАРАКТЕРИСТИК  ───────────── */

export const MAX_LEVEL = 10;

const XP_TABLE: Record<number, number> = {
  1: 60,
  2: 150,
  3: 280,
  4: 470,
  5: 720,
  6: 1050,
  7: 1480,
  8: 2020,
  9: 2700,
};

export function xpForNextLevel(level: number): number {
  return XP_TABLE[level] ?? 0;
}

/**
 * Цена подъёма характеристики с currentVal до currentVal+1.
 * Диапазоны считаются по целевому значению: СИЛ 1–3/4–6/7–9/10,
 * ЛОВ всегда 2, кроме 5 и 10 (3), ИНТ 1–3/4–8/9–10.
 */
export function statPointCost(stat: StatKey, currentVal: number): number {
  const next = Math.min(10, currentVal + 1);
  if (stat === "agi") return next === 5 || next === 10 ? 3 : 2;
  if (stat === "int") return next <= 3 ? 1 : next <= 8 ? 2 : 4;
  return next <= 3 ? 1 : next <= 6 ? 2 : next <= 9 ? 3 : 4;
}

/**
 * Опыт начисляется без ограничений по этажу: уровень растёт всегда.
 * Чем выше уровень, тем дороже следующий, поэтому поздние уровни требуют
 * всё больше вылазок — тем глубже, тем больше заходов.
 */
export function grantXp(p0: Player, gained: number): { player: Player; levelsGained: number } {
  if (p0.level >= MAX_LEVEL || gained <= 0) {
    return { player: p0, levelsGained: 0 };
  }
  let level = p0.level;
  let xp = p0.xp + gained;
  let statPoints = p0.statPoints;
  let levelsGained = 0;

  while (level < MAX_LEVEL) {
    const need = xpForNextLevel(level);
    if (xp < need) break;
    xp -= need;
    level += 1;
    statPoints += 3;
    levelsGained += 1;
  }
  if (level >= MAX_LEVEL) xp = 0;

  return {
    player: { ...p0, level, xp, statPoints },
    levelsGained,
  };
}

/* ─────────────  ХАРАКТЕРИСТИКИ И ПАССИВКИ  ───────────── */

export const STAT_META: Record<
  StatKey,
  { name: string; short: string; blurb: string; gain: string }
> = {
  str: {
    name: "Сила",
    short: "СИЛ",
    blurb: "Здоровье, тяжесть удара оружием и устойчивость к негативным эффектам и ловушкам.",
    gain: "+6 здоровья, +0.8 к урону, +6% стойкости",
  },
  agi: {
    name: "Ловкость",
    short: "ЛОВ",
    blurb: "Количество ходов в раунде, сила расходников, урон ловкого оружия и обезвреживание ловушек.",
    gain: "+1 ход каждые 2 очка, урон ловкого оружия и расходников",
  },
  int: {
    name: "Интеллект",
    short: "ИНТ",
    blurb: "Использование свитков, открытие способностей оружия и экипировки, исследование редкости и алхимия.",
    gain: "открывает свитки, приёмы оружия и исследование",
  },
};

export interface Passive {
  id: string;
  name: string;
  desc: string;
}

/** Старые рубежи характеристик оставлены только для совместимости сохранений. */

export const PASSIVES: Record<StatKey, Record<"5" | "10", [Passive, Passive]>> = {
  str: {
    5: [
      { id: "stone_skin", name: "Каменная кожа", desc: "Ловушки наносят на 25% меньше урона, сопротивление эффектам +15%." },
      { id: "heavy_hand", name: "Тяжёлая рука", desc: "+3 к урону каждым ударом оружия." },
    ],
    10: [
      { id: "iron_will", name: "Железная воля", desc: "+22 к здоровью и +3 восстановления за раунд в бою." },
      { id: "relentless", name: "Неумолимый", desc: "Ниже 35% здоровья удары и приёмы бьют в полтора раза сильнее." },
    ],
  },
  agi: {
    5: [
      { id: "light_step", name: "Лёгкий шаг", desc: "+30% к шансу обезвредить ловушку без урона." },
      { id: "first_blood", name: "Форсаж", desc: "+1 дополнительный ход в первом раунде каждого боя." },
    ],
    10: [
      { id: "shadow_dance", name: "Танец теней", desc: "+15% шанс полностью уклониться от любой атаки врага." },
      { id: "saboteur", name: "Клин в броню", desc: "+20% шанс нанести двойной критический урон." },
    ],
  },
  int: {
    5: [
      { id: "scribe", name: "Тайновед", desc: "Свитки, приёмы оружия и исследование предметов требуют на 1 ИНТ меньше." },
      { id: "brewer", name: "Знаток зелий", desc: "Каждая варка в алхимии приносит на 1 предмет больше." },
    ],
    10: [
      { id: "resonance", name: "Резонанс разума", desc: "Свитки и способности снаряжения наносят и лечат на 40% сильнее." },
      { id: "echo", name: "Эхо мысли", desc: "35% шанс, что свиток не потратится, а приём оружия не уйдёт на перезарядку." },
    ],
  },
};

/* ─────────────  ИЗНОШЕННОСТЬ И КАЧЕСТВО (РЕДКОСТЬ)  ───────────── */

export const WEAR_META: Record<
  WearTier,
  { name: string; mult: number; priceMult: number; desc: string }
> = {
  new: {
    name: "Новое",
    mult: 1.25,
    priceMult: 1.35,
    desc: "Множитель ×1.25 к характеристикам предмета.",
  },
  worn: {
    name: "Ношенное",
    mult: 1.0,
    priceMult: 1.0,
    desc: "Множитель ×1.0 к характеристикам предмета.",
  },
  battered: {
    name: "Изношенное",
    mult: 0.75,
    priceMult: 0.7,
    desc: "Множитель ×0.75 к характеристикам предмета.",
  },
};

export const RARITY_META: Record<
  RarityTier,
  { name: string; tone: "mute" | "verd" | "flame" | "rubric"; priceMult: number; summary: string }
> = {
  common: {
    name: "Обычное",
    tone: "mute",
    priceMult: 1.0,
    summary: "Только базовые характеристики (и техника оружия).",
  },
  rare: {
    name: "Редкое",
    tone: "verd",
    priceMult: 1.45,
    summary: "Базовые характеристики + 1 дополнительный параметр.",
  },
  epic: {
    name: "Эпическое",
    tone: "flame",
    priceMult: 2.1,
    summary: "Свойство Редкого + особая активная способность предмета.",
  },
  legendary: {
    name: "Легендарное",
    tone: "rubric",
    priceMult: 3.1,
    summary: "Свойства Редкого и Эпического + уникальный пассивный эффект.",
  },
};

export interface RareAffixDef {
  id: RareAffixId;
  name: string;
  desc: string;
}

export function legendaryPassiveDesc(id: LegendaryPassiveId, level = 1): string {
  const l = clampGearLevel(level);
  const n = (key: string) => legendaryMagnitude(id, key, l);
  switch (id) {
    case "executioner":
      return `По врагам с менее чем 50% здоровья весь твой урон увеличен на ${n("damage")}%.`;
    case "time_weaver":
      return `Даёт +${n("ap")} дополнительный ход в каждом раунде боя.`;
    case "immortal_pact":
      return `Один раз за бой спасает от смерти и восстанавливает ${n("heal")}% максимального здоровья.`;
    case "archmage_blood":
      return `Урон свитков и заклинаний +${n("spellDamage")}%; требования ИНТ снижены на ${n("intDiscount")}.`;
    case "titan_heart":
      return `+${n("hp")} максимального здоровья, +${n("armor")} брони; иммунитет к кровотечению и яду.`;
  }
}

export function rareAffixDesc(id: RareAffixId, level = 1): string {
  const l = clampGearLevel(level);
  const n = (key: string) => rareAffixMagnitude(id, key, l);
  switch (id) {
    case "vamp": return `${n("ratio")}% урона возвращается здоровьем.`;
    case "crit": return `+${n("chance")}% к шансу критического удара.`;
    case "thorns": return `+${n("damage")} урона врагу за каждый его удар по тебе.`;
    case "regen": return `+${n("heal")} здоровья в конце каждого раунда.`;
    case "pierce": return `Атаки игнорируют ${n("armor")} брони врага.`;
    case "swift": return `+${n("evade")}% к уклонению.`;
    case "might": return `+${n("damage")} к урону всеми атаками и +${n("hp")} к максимальному здоровью.`;
  }
}

export const RARE_AFFIXES: Record<RareAffixId, RareAffixDef> = {
  vamp: {
    id: "vamp",
    name: "Вампиризм",
    desc: "Исцеляет на 20% от урона, нанесённого оружием и приёмами.",
  },
  crit: {
    id: "crit",
    name: "Острота",
    desc: "+15% к шансу нанести двойной критический удар.",
  },
  thorns: {
    id: "thorns",
    name: "Шипы склепа",
    desc: "Возвращает атакующему врагу 5 ед. урона при каждом попадании по тебе.",
  },
  regen: {
    id: "regen",
    name: "Кровь тролля",
    desc: "Восстанавливает +4 здоровья в конце каждого раунда боя.",
  },
  pierce: {
    id: "pierce",
    name: "Пролом брони",
    desc: "Все твои удары игнорируют 2 ед. брони противника.",
  },
  swift: {
    id: "swift",
    name: "Ускользание",
    desc: "+8% к уклонению в бою и +12% к шансу обезвредить ловушку.",
  },
  might: {
    id: "might",
    name: "Тяжесть стали",
    desc: "+3 к урону всеми атаками и +10 к максимальному здоровью.",
  },
};

export interface EpicSkillDef {
  id: EpicSkillId;
  name: string;
  intReq: number;
  cooldown: number;
  desc: string;
}

export const EPIC_SKILLS: Record<EpicSkillId, EpicSkillDef> = {
  fireball: {
    id: "fireball",
    name: "Огненный шар",
    intReq: 4,
    cooldown: 3,
    desc: "Взрыв пламени: 20 + 3.5×ИНТ чистого урона и поджог врага (4 урона/раунд на 3 раунда).",
  },
  blood_lance: {
    id: "blood_lance",
    name: "Кровавое копьё",
    intReq: 4,
    cooldown: 3,
    desc: "Пронзает броню на 16 + 2.5×СИЛ урона и восстанавливает тебе 50% от этого урона.",
  },
  ash_aegis: {
    id: "ash_aegis",
    name: "Эгида пепла",
    intReq: 3,
    cooldown: 3,
    desc: "Восстанавливает 16 + 2.5×ИНТ здоровья, снимает кровотечение/проклятие и ставит в Защиту.",
  },
  shadow_volley: {
    id: "shadow_volley",
    name: "Теневой росчерк",
    intReq: 4,
    cooldown: 2,
    desc: "Серия выпадов на 16 + 3×ЛОВ урона сквозь броню и ослабление атаки врага на 2 раунда.",
  },
  frost_nova: {
    id: "frost_nova",
    name: "Дыхание склепа",
    intReq: 5,
    cooldown: 3,
    desc: "Наносит 16 + 3×ИНТ урона, сковывает врага холодом на 3 раунда и отнимает у него 1 ход.",
  },
};

export function epicSkillDesc(id: EpicSkillId, level = 1): string {
  const l = clampGearLevel(level);
  const n = (key: string) => epicMagnitude(id, key, l);
  switch (id) {
    case "fireball":
      return `Взрыв пламени: ${n("base")} + ${n("scale")}×ИНТ чистого урона и поджог врага (${n("burn")} урона/раунд на ${n("rounds")} раунда).`;
    case "blood_lance":
      return `Пронзает броню на ${n("base")} + ${n("scale")}×СИЛ урона и восстанавливает тебе ${n("leech")}% от этого урона.`;
    case "ash_aegis":
      return `Восстанавливает ${n("base")} + ${n("scale")}×ИНТ здоровья, снимает кровотечение/проклятие и ставит в Защиту.`;
    case "shadow_volley":
      return `Серия выпадов на ${n("base")} + ${n("scale")}×ЛОВ урона сквозь броню и ослабление атаки врага на ${n("rounds")} раунда.`;
    case "frost_nova":
      return `Наносит ${n("base")} + ${n("scale")}×ИНТ урона, сковывает врага холодом на ${n("rounds")} раунда и отнимает у него ${n("stun")} ход.`;
  }
}

export interface LegendaryPassiveDef {
  id: LegendaryPassiveId;
  name: string;
  desc: string;
}

export const LEGENDARY_PASSIVES: Record<LegendaryPassiveId, LegendaryPassiveDef> = {
  executioner: {
    id: "executioner",
    name: "Приговор слабым",
    desc: "По врагам с менее чем 50% здоровья весь твой урон увеличен на 35%.",
  },
  time_weaver: {
    id: "time_weaver",
    name: "Поступь вне времени",
    desc: "Даёт дополнительные ходы только в первом раунде боя (скейлится от уровня предмета).",
  },
  immortal_pact: {
    id: "immortal_pact",
    name: "Печать бессмертия",
    desc: "Раз за бой смертельный удар не убивает тебя, а оставляет с 18 ОЗ и даёт Защиту.",
  },
  archmage_blood: {
    id: "archmage_blood",
    name: "Кровь архимага",
    desc: "Свитки и способности снаряжения бьют на 30% сильнее, а их требования к ИНТ снижены на 1.",
  },
  titan_heart: {
    id: "titan_heart",
    name: "Сердце колосса",
    desc: "+24 к максимальному здоровью, +2 к броне и полный иммунитет к кровотечению.",
  },
};

/* ─────────────  ШАБЛОНЫ СНАРЯЖЕНИЯ И ОРУЖЕЙНЫЕ ПРИЁМЫ (ОТ ИНТ)  ───────────── */

export interface WeaponSkillDef {
  id: string;
  /** Уровень предмета, от которого масштабирован приём. */
  level?: number;
  name: string;
  intReq: number;
  cooldown: number;
  scaleStat: StatKey;
  scaleMult: number;
  effect?:
    | "bleed" | "pierce" | "guard" | "chill" | "sunder" | "stun" | "leech" | "poison"
    | "armor_damage" | "guard_wall" | "missing_hp" | "enemy_missing" | "double_attack"
    | "guaranteed_crit" | "first_strike" | "debuff_damage" | "dodge_action"
    | "skill_leech" | "curse_brand" | "create_scroll" | "full_guard";
  desc: string;
  passiveNote: string;
}

export interface GearBaseDef {
  id: string;
  name: string;
  slot: Slot;
  price: number;
  minFloor: number;
  /** Уровень предмета 1…10: требования исследования и ассортимент лавки. */
  level?: number;
  /** Вес/габарит снаряжения. Не определяет характеристику: нож лёгкий, но ловкий. */
  gearClass?: "light" | "medium" | "heavy";
  /** Характеристика требования, эффектов и приёмов. Заполняется явно для каждой базы. */
  stat?: StatKey;
  /** 2 — двуручное: занимает обе руки. */
  hands?: 1 | 2;
  /** Щит: надевается в левую руку. */
  shield?: boolean;
  /** Допустимые слоты (кольца влезают в оба). */
  altSlots?: Slot[];
  idIntReq: number;
  idGoldCost: number;
  dmg?: [number, number];
  armor?: number;
  hp?: number;
  evade?: number;
  desc: string;
  weaponSkill?: WeaponSkillDef;
  preferredEpic?: EpicSkillId;
  /** Боевой архетип предмета: задаёт пул эффектов и легендарную пассивку. */
  archetype?: ArchetypeId;
}

/* До введения новых слотов базы использовали «weapon»/«armor»/«trinket»;
   SLOT_FIX ниже переводит их в современные ячейки. */
type LegacyGear = Omit<GearBaseDef, "slot"> & { slot: Slot | "weapon" | "armor" | "trinket" };

const CORE_GEAR_BASES: Record<string, LegacyGear> = {
  /* ── ОРУЖИЕ ── */
  knife: {
    id: "knife",
    name: "Ржавый финский нож",
    slot: "weapon",
    dmg: [4, 6],
    price: 55,
    minFloor: 1,
    idIntReq: 2,
    idGoldCost: 30,
    desc: "Короткий клинок с зазубриной. Кто знает анатомию — режет глубже.",
    preferredEpic: "shadow_volley",
    weaponSkill: {
      id: "artery_cut",
      name: "Удар в артерию",
      intReq: 2,
      cooldown: 2,
      scaleStat: "agi",
      scaleMult: 1.5,
      effect: "bleed",
      desc: "Урон оружия + 1.5×ЛОВ и глубокое кровотечение врагу (4 урона/раунд, 3 раунда).",
      passiveNote: "При ИНТ ≥ 2 обычные удары получают +0.5×ЛОВ к урону.",
    },
  },
  rapier: {
    id: "rapier",
    name: "Рапира дуэлянта",
    slot: "weapon",
    dmg: [5, 8],
    price: 155,
    minFloor: 1,
    idIntReq: 3,
    idGoldCost: 45,
    desc: "Узкая сталь для тех, кто считает шаги и чужие вдохи.",
    preferredEpic: "shadow_volley",
    weaponSkill: {
      id: "fencing",
      name: "Фехтование",
      intReq: 3,
      cooldown: 2,
      scaleStat: "agi",
      scaleMult: 2.4,
      effect: "pierce",
      desc: "Точный выпад: урон оружия + 2.4×ЛОВ дополнительного урона, полностью игнорирует броню.",
      passiveNote: "При ИНТ ≥ 3 обычные удары рапирой получают +0.8×ЛОВ доп. урона.",
    },
  },
  sword: {
    id: "sword",
    name: "Меч стражи",
    slot: "weapon",
    dmg: [6, 10],
    price: 175,
    minFloor: 1,
    idIntReq: 3,
    idGoldCost: 50,
    desc: "Прямой полуторный клинок с потёртым яблоком.",
    preferredEpic: "blood_lance",
    weaponSkill: {
      id: "riposte_stance",
      name: "Ответная стойка",
      intReq: 3,
      cooldown: 2,
      scaleStat: "str",
      scaleMult: 1.6,
      effect: "guard",
      desc: "Рубящий удар с бонусом +1.6×СИЛ и мгновенный переход в Защиту (входящий урон вдвое меньше).",
      passiveNote: "При ИНТ ≥ 3 обычные удары мечом получают +0.6×СИЛ доп. урона.",
    },
  },
  staff: {
    id: "staff",
    name: "Боевой посох пепла",
    slot: "weapon",
    dmg: [6, 9],
    price: 190,
    minFloor: 1,
    idIntReq: 3,
    idGoldCost: 50,
    desc: "Окованный медью ясень с рунами внутри сердцевины.",
    preferredEpic: "fireball",
    weaponSkill: {
      id: "arcane_pulse",
      name: "Тайный разряд",
      intReq: 3,
      cooldown: 2,
      scaleStat: "int",
      scaleMult: 2.5,
      effect: "chill",
      desc: "Удар посохом с выбросом разума (+2.5×ИНТ урона сквозь броню) и ослаблением врага на 2 раунда.",
      passiveNote: "При ИНТ ≥ 3 обычные удары посохом получают +0.9×ИНТ доп. урона.",
    },
  },
  axe: {
    id: "axe",
    name: "Топор палача",
    slot: "weapon",
    dmg: [8, 13],
    price: 310,
    minFloor: 2,
    idIntReq: 4,
    idGoldCost: 70,
    desc: "За один замах открывает не только двери, но и латы.",
    preferredEpic: "blood_lance",
    weaponSkill: {
      id: "bone_cleave",
      name: "Рассечение кости",
      intReq: 4,
      cooldown: 2,
      scaleStat: "str",
      scaleMult: 2.0,
      effect: "sunder",
      desc: "Сокрушительный удар (+2.0×СИЛ урона), раскалывающий броню врага на −2 до конца боя.",
      passiveNote: "При ИНТ ≥ 4 обычные удары топором получают +0.7×СИЛ доп. урона.",
    },
  },
  hammer: {
    id: "hammer",
    name: "Молот паломника",
    slot: "weapon",
    dmg: [10, 16],
    price: 490,
    minFloor: 3,
    idIntReq: 5,
    idGoldCost: 90,
    desc: "Освящён чем-то, что больше не канонизируют.",
    preferredEpic: "frost_nova",
    weaponSkill: {
      id: "verdict_bell",
      name: "Колокол приговора",
      intReq: 5,
      cooldown: 3,
      scaleStat: "str",
      scaleMult: 2.4,
      effect: "stun",
      desc: "Тяжёлый удар (+2.4×СИЛ), оглушающий врага: он теряет 1 ход в следующем раунде.",
      passiveNote: "При ИНТ ≥ 5 обычные удары молотом получают +0.9×СИЛ доп. урона.",
    },
  },
  abyss: {
    id: "abyss",
    name: "Клинок бездны",
    slot: "weapon",
    dmg: [12, 18],
    price: 780,
    minFloor: 4,
    idIntReq: 6,
    idGoldCost: 115,
    desc: "Гудит, когда рядом чужая тень или чужая кровь.",
    preferredEpic: "fireball",
    weaponSkill: {
      id: "void_reap",
      name: "Жатва бездны",
      intReq: 6,
      cooldown: 2,
      scaleStat: "int",
      scaleMult: 2.8,
      effect: "leech",
      desc: "Разрез сквозь броню (+2.8×ИНТ урона), похищающий 40% нанесённого урона в здоровье.",
      passiveNote: "При ИНТ ≥ 6 обычные удары клинком получают +1.0×ИНТ доп. урона.",
    },
  },

  /* ── БРОНЯ ── */
  rag: {
    id: "rag",
    name: "Рваная кольчуга",
    slot: "armor",
    armor: 1,
    hp: 6,
    price: 45,
    minFloor: 1,
    idIntReq: 2,
    idGoldCost: 25,
    desc: "Плетена из проволоки и упрямства.",
    preferredEpic: "ash_aegis",
  },
  mail: {
    id: "mail",
    name: "Кольчуга стражи",
    slot: "armor",
    armor: 2,
    hp: 14,
    price: 185,
    minFloor: 1,
    idIntReq: 3,
    idGoldCost: 50,
    desc: "Звучит глухо — значит, держит удар.",
    preferredEpic: "ash_aegis",
  },
  shroud: {
    id: "shroud",
    name: "Одеяние пепельных монахов",
    slot: "armor",
    armor: 2,
    hp: 16,
    evade: 0.06,
    price: 300,
    minFloor: 2,
    idIntReq: 4,
    idGoldCost: 65,
    desc: "Шёлк, вымоченный в золе, с зашитыми в подол знаками.",
    preferredEpic: "fireball",
  },
  plate: {
    id: "plate",
    name: "Латный нагрудник",
    slot: "armor",
    armor: 4,
    hp: 28,
    price: 430,
    minFloor: 3,
    idIntReq: 5,
    idGoldCost: 85,
    desc: "Пятнадцать килограммов холодного спокойствия.",
    preferredEpic: "ash_aegis",
  },

  /* ── УКРАШЕНИЯ / ОБЕРЕГИ ── */
  amulet: {
    id: "amulet",
    name: "Амулет живой воды",
    slot: "trinket",
    hp: 16,
    price: 150,
    minFloor: 1,
    idIntReq: 3,
    idGoldCost: 45,
    desc: "Внутри стеклянной капли что-то всё ещё движется.",
    preferredEpic: "ash_aegis",
  },
  ring_stone: {
    id: "ring_stone",
    name: "Перстень камня",
    slot: "trinket",
    hp: 20,
    armor: 1,
    price: 260,
    minFloor: 2,
    idIntReq: 4,
    idGoldCost: 60,
    desc: "Тёплый, будто его только что вынули из глубокой земли.",
    preferredEpic: "blood_lance",
  },
  boots: {
    id: "boots",
    name: "Сапоги ворона",
    slot: "trinket",
    hp: 10,
    evade: 0.1,
    price: 320,
    minFloor: 2,
    idIntReq: 4,
    idGoldCost: 70,
    desc: "Подошвы не стучат по камню. Никогда.",
    preferredEpic: "shadow_volley",
  },
  seal: {
    id: "seal",
    name: "Печать звездочёта",
    slot: "trinket",
    hp: 18,
    armor: 1,
    evade: 0.06,
    price: 440,
    minFloor: 3,
    idIntReq: 5,
    idGoldCost: 90,
    desc: "Старый астролябийный диск на кожаном шнуре.",
    preferredEpic: "frost_nova",
  },
};

/* Старым вещам проставляются современные слоты, уровни и цены. */
const SLOT_FIX: Record<string, Slot> = {
  /* оружие старого списка живёт в правой руке */
  knife: "mainHand",
  rapier: "mainHand",
  sword: "mainHand",
  staff: "mainHand",
  axe: "mainHand",
  hammer: "mainHand",
  abyss: "mainHand",
  /* броня и обереги */
  rag: "body",
  mail: "body",
  shroud: "body",
  plate: "body",
  amulet: "amulet",
  seal: "amulet",
  boots: "feet",
  ring_stone: "ring1",
};
const ALT_FIX: Record<string, Slot[]> = { ring_stone: ["ring1", "ring2"] };

/**
 * Вес и габарит снаряжения. Класс не навязывает характеристику:
 * лёгкий нож и рапира используют Ловкость, лёгкий посох — Интеллект.
 */
const GEAR_CLASS_FIX: Record<string, "light" | "medium" | "heavy"> = {
  /* Лёгкое: короткие клинки, фехтовальное оружие, посох, ткань, обувь, украшения. */
  knife: "light", dagger: "light", rapier: "light", staff: "light",
  shroud: "light", boots: "light", shoes: "light", strider_boots: "light",
  wraps: "light", runed_bracers: "light", buckler: "light",
  amulet: "light", seal: "light", ring_stone: "light", ring_band: "light",
  ring_edge: "light", ring_ward: "light", ring_venom: "light",
  tooth: "light", icon: "light", soulstone: "light",
  /* Среднее: одноручный меч, копьё, кольчуга, открытые шлемы, круглый щит, магический клинок. */
  sword: "medium", spear: "medium", abyss: "medium",
  rag: "medium", mail: "medium", coif: "medium", helm: "medium", shield_round: "medium",
  /* Тяжёлое: массивное ударное/двуручное оружие, латы, закрытые шлемы, башенный щит. */
  axe: "heavy", hammer: "heavy", greatsword: "heavy", warhammer2: "heavy",
  plate: "heavy", greathelm: "heavy", crown_husk: "heavy", shield_tower: "heavy",
  greaves: "heavy", vambraces: "heavy",
};

/** Характеристика назначения: физическое ловкое — ЛОВ, силовое — СИЛ, магическое — ИНТ. */
const GEAR_STAT_FIX: Record<string, StatKey> = {
  knife: "agi", dagger: "agi", rapier: "agi", spear: "agi",
  staff: "int", abyss: "int",
  sword: "str", axe: "str", hammer: "str", greatsword: "str", warhammer2: "str",
  rag: "str", mail: "str", coif: "str", helm: "str", plate: "str",
  greathelm: "str", crown_husk: "str", greaves: "str", vambraces: "str",
  shield_round: "str", shield_tower: "str",
  shroud: "int", runed_bracers: "int",
  boots: "agi", shoes: "agi", strider_boots: "agi", wraps: "agi", buckler: "agi",
  amulet: "int", seal: "int", soulstone: "int", icon: "int",
  ring_stone: "str", ring_band: "agi", ring_edge: "agi", ring_ward: "int", ring_venom: "agi",
  tooth: "agi",
};

/**
 * Базовые защитные свойства класса для сопоставимых слотов.
 * Порядок при одинаковых уровне/состоянии: защита Т>С>Л, ОЗ Л>Т>С, уклонение С>Л>Т.
 */
const CLASS_DEFENSE: Record<"light" | "medium" | "heavy", { armor: number; hp: number; evade: number }> = {
  light: { armor: 1, hp: 18, evade: 4 },
  medium: { armor: 3, hp: 12, evade: 7 },
  heavy: { armor: 5, hp: 15, evade: 2 },
};
const SLOT_DEFENSE_SCALE: Partial<Record<Slot, number>> = {
  mainHand: 0.55,
  offHand: 1,
  head: 0.7,
  body: 1,
  feet: 0.7,
  wrists: 0.6,
};
function classDefense(slot: Slot, gearClass: "light" | "medium" | "heavy") {
  const t = CLASS_DEFENSE[gearClass];
  const k = SLOT_DEFENSE_SCALE[slot] ?? 0;
  if (k === 0) return { armor: 0, hp: 0, evade: 0 };
  return {
    armor: Math.max(0, Math.round(t.armor * k)),
    hp: Math.max(1, Math.round(t.hp * k)),
    evade: Math.max(1, Math.round(t.evade * k)) / 100,
  };
}

function normalizeGearBases(list: LegacyGear[]): Record<string, GearBaseDef> {
  const out: Record<string, GearBaseDef> = {};
  for (const raw of list) {
    const level = raw.level ?? Math.max(1, Math.min(SHOP_MAX_LEVEL, raw.minFloor ?? 1));
    const slot = SLOT_FIX[raw.id] ?? raw.slot;
    /* И вес, и характеристика берутся из явных таблиц; запасной путь нужен только неизвестным базам. */
    const gearClass: "light" | "medium" | "heavy" =
      raw.gearClass ?? GEAR_CLASS_FIX[raw.id] ?? "medium";
    const stat: StatKey =
      raw.stat ?? GEAR_STAT_FIX[raw.id] ?? raw.weaponSkill?.scaleStat ??
      (gearClass === "heavy" ? "str" : gearClass === "light" ? "int" : "agi");
    const hasClassTemplate = SLOT_DEFENSE_SCALE[slot] !== undefined;
    const defense = hasClassTemplate ? classDefense(slot, gearClass) : null;
    const isWeapon = !!raw.dmg;
    const hands = gearClass === "medium" && slot === "mainHand" && isWeapon ? 1 : raw.hands;
    out[raw.id] = {
      ...raw,
      level,
      slot,
      gearClass,
      stat,
      hands,
      armor: defense ? defense.armor : raw.armor,
      hp: defense ? defense.hp : raw.hp,
      evade: defense ? defense.evade : raw.evade,
      altSlots: raw.altSlots ?? ALT_FIX[raw.id],
      minFloor: raw.minFloor ?? level,
    };
  }
  return out;
}

/* ─────────────  КЛАССЫ СНАРЯЖЕНИЯ И ТРЕБОВАНИЯ  ───────────── */

export const GEAR_CLASS_META: Record<
  "light" | "medium" | "heavy",
  { name: string; desc: string }
> = {
  light: {
    name: "Лёгкое",
    desc: "Малый вес: больше здоровья и уклонения, чем у тяжёлого; меньше защиты, чем у среднего.",
  },
  medium: {
    name: "Среднее",
    desc: "Сбалансированное снаряжение: больше защиты, чем у лёгкого, и больше уклонения, чем у обоих других классов.",
  },
  heavy: {
    name: "Тяжёлое",
    desc: "Массивное снаряжение: больше защиты и здоровья, чем у среднего; уклонение ниже, чем у лёгкого.",
  },
};

export function gearClassFor(item: GearItem): "light" | "medium" | "heavy" {
  return GEAR_BASES[item.baseId]?.gearClass ?? item.gearClass ?? "medium";
}

/** Характеристика предмета не выводится из веса: лёгкий нож остаётся ловким. */
export function gearAffinity(item: GearItem): StatKey {
  const base = GEAR_BASES[item.baseId];
  if (base?.stat) return base.stat;
  const cls = gearClassFor(item);
  return cls === "heavy" ? "str" : cls === "light" ? "int" : "agi";
}

/** Требуемая характеристика для надевания предмета. */
export function gearStatReq(item: GearItem): { stat: StatKey; value: number } {
  const level = item.level ?? 1;
  return { stat: gearAffinity(item), value: Math.max(1, Math.min(10, 1 + level)) };
}

/** Строка требования для карточки предмета: «СИЛ 4» и т.п. */
export function gearStatReqLabel(item: GearItem): string {
  const { stat, value } = gearStatReq(item);
  return `${STAT_META[stat].short} ${value}`;
}

/**
 * Надеть можно, если уровень предмета не выше уровня персонажа
 * и характеристика требования набрана.
 */
export function canWear(item: GearItem, player: Player): boolean {
  if ((item.level ?? 1) > player.level) return false;
  const { stat, value } = gearStatReq(item);
  return (player.stats[stat] ?? 0) >= value;
}

/** Причина отказа — для сообщения интерфейсу. */
export function wearRequirementNote(item: GearItem, player: Player): string {
  const clsName = GEAR_CLASS_META[gearClassFor(item)].name.toLowerCase();
  if ((item.level ?? 1) > player.level) {
    return `${clsName} снаряжение ${item.level ?? 1}-го уровня: нужен персонаж ${item.level ?? 1}-го уровня.`;
  }
  const { stat, value } = gearStatReq(item);
  const have = player.stats[stat] ?? 0;
  return `${clsName} снаряжение требует ${STAT_META[stat].short} ${value}, у тебя ${have}.`;
}

/** Вариативный множитель приёма по характеристике, а не по весу предмета. */
export function rollScaleMult(stat: StatKey, rng: () => number = Math.random): number {
  const ranges: Record<StatKey, [number, number]> = {
    str: [1.5, 3.5],
    agi: [1.5, 2.5],
    int: [2, 4.5],
  };
  const [lo, hi] = ranges[stat];
  return Number((lo + rng() * (hi - lo)).toFixed(1));
}

const ARCHETYPE_GEAR: GearBaseDef[] = [
  {
    id: "bulwark_mace", name: "Булава бастиона", slot: "mainHand", gearClass: "medium", stat: "str", archetype: "bulwark",
    dmg: [6, 10], armor: 1, hp: 12, price: 420, level: 3, minFloor: 3, idIntReq: 4, idGoldCost: 80,
    desc: "Короткая булава для боя за щитом. Чем тяжелее доспех, тем страшнее её ответ.",
    preferredEpic: "ash_aegis",
    weaponSkill: { id: "bulwark_answer", name: "Ответ бастиона", intReq: 3, cooldown: 2, scaleStat: "str", scaleMult: 2.0, effect: "armor_damage", desc: "Удар щитом и булавой: урон оружия + 2.0×СИЛ и +50% брони к урону; включает Защиту.", passiveNote: "При ИНТ ≥ 3 обычные удары получают +0.7×СИЛ." },
  },
  {
    id: "barbarian_greataxe", name: "Секира кровавого обета", slot: "mainHand", hands: 2, gearClass: "heavy", stat: "str", archetype: "barbarian",
    dmg: [24, 39], hp: 26, price: 760, level: 5, minFloor: 5, idIntReq: 5, idGoldCost: 120,
    desc: "Двуручная секира втрое тяжелее одноручного топора. Не защищает — заставляет бить первым и последним.",
    preferredEpic: "blood_lance",
    weaponSkill: { id: "blood_reckoning", name: "Кровавый расчёт", intReq: 4, cooldown: 3, scaleStat: "str", scaleMult: 3.0, effect: "missing_hp", desc: "Урон оружия + 3.0×СИЛ; за каждые 10% недостающего здоровья +6% урона (до 60%).", passiveNote: "При ИНТ ≥ 4 обычные удары получают +1.1×СИЛ." },
  },
  {
    id: "blood_hide", name: "Шкура кровавого зверя", slot: "body", gearClass: "medium", stat: "str", archetype: "barbarian",
    hp: 64, price: 520, level: 4, minFloor: 4, idIntReq: 4, idGoldCost: 90,
    desc: "Не держит удар — держит жизнь. Варвар выбирает мясо и кровь вместо стали.",
    preferredEpic: "blood_lance",
  },
  {
    id: "assassin_stiletto", name: "Стилет последней ночи", slot: "mainHand", gearClass: "light", stat: "agi", archetype: "assassin",
    dmg: [5, 8], price: 480, level: 3, minFloor: 3, idIntReq: 4, idGoldCost: 85,
    desc: "Тонкий клинок для первого удара. В начале боя находит щель в любой броне.",
    preferredEpic: "shadow_volley",
    weaponSkill: { id: "death_mark", name: "Метка смерти", intReq: 3, cooldown: 3, scaleStat: "agi", scaleMult: 2.2, effect: "guaranteed_crit", desc: "Урон оружия + 2.2×ЛОВ; в первые 2 раунда крит гарантирован.", passiveNote: "При ИНТ ≥ 3 обычные удары получают +0.8×ЛОВ." },
  },
  {
    id: "ninja_kusarigama", name: "Кусаригама тени", slot: "mainHand", gearClass: "light", stat: "agi", archetype: "ninja",
    dmg: [5, 7], price: 460, level: 3, minFloor: 3, idIntReq: 4, idGoldCost: 85,
    desc: "Серп на цепи. Не сильнее меча, но оставляет руку свободной для порохов и ядов.",
    preferredEpic: "shadow_volley",
    weaponSkill: { id: "shadow_snare", name: "Теневой захват", intReq: 3, cooldown: 2, scaleStat: "agi", scaleMult: 1.8, effect: "debuff_damage", desc: "Урон оружия + 1.8×ЛОВ; +10% урона за каждый негативный эффект на враге (до 40%).", passiveNote: "При ИНТ ≥ 3 обычные удары получают +0.6×ЛОВ." },
  },
  {
    id: "warlock_scepter", name: "Скипетр тёмного пакта", slot: "mainHand", gearClass: "light", stat: "int", archetype: "warlock",
    dmg: [6, 9], price: 540, level: 4, minFloor: 4, idIntReq: 5, idGoldCost: 100,
    desc: "Не для удара — для печати. Каждый приём возвращает часть крови владельца.",
    preferredEpic: "fireball",
    weaponSkill: { id: "pact_drain", name: "Отток пакта", intReq: 4, cooldown: 2, scaleStat: "int", scaleMult: 3.0, effect: "skill_leech", desc: "Урон оружия + 3.0×ИНТ сквозь броню; лечит на 25% нанесённого урона и сокращает откат этого приёма на 1.", passiveNote: "При ИНТ ≥ 4 обычные удары получают +1.1×ИНТ." },
  },
  {
    id: "sage_censer", name: "Кадило живого слова", slot: "mainHand", gearClass: "light", stat: "int", archetype: "sage",
    dmg: [5, 8], price: 560, level: 4, minFloor: 4, idIntReq: 5, idGoldCost: 100,
    desc: "Дым от кадла складывается в строки. Мудрец творит свитки прямо в бою.",
    preferredEpic: "ash_aegis",
    weaponSkill: { id: "word_creation", name: "Слово творения", intReq: 4, cooldown: 3, scaleStat: "int", scaleMult: 2.4, effect: "create_scroll", desc: "Урон оружия + 2.4×ИНТ; создаёт 1 случайный свиток и сразу применяет его без траты хода.", passiveNote: "При ИНТ ≥ 4 обычные удары получают +0.8×ИНТ." },
  },
];

export const GEAR_BASES: Record<string, GearBaseDef> = normalizeGearBases([
  ...Object.values(CORE_GEAR_BASES),
  ...EXTRA_GEAR,
  ...ARCHETYPE_GEAR,
]);

/* ─────────────  ВАРИАНТЫ ПРИЁМОВ ОРУЖИЯ  ───────────── */

const EXTRA_TECHNIQUES: WeaponSkillDef[] = [
  {
    id: "quick_cut",
    name: "Быстрый порез",
    intReq: 2,
    cooldown: 1,
    scaleStat: "agi",
    scaleMult: 1.8,
    effect: "pierce",
    desc: "Короткий укол сквозь броню: урон оружия + 1.8×ЛОВ.",
    passiveNote: "При ИНТ ≥ 2 обычные удары получают +0.6×ЛОВ к урону.",
  },
  {
    id: "venom_edge",
    name: "Ядовитая кромка",
    intReq: 3,
    cooldown: 2,
    scaleStat: "agi",
    scaleMult: 1.4,
    effect: "poison",
    desc: "Режущий удар + 1.4×ЛОВ и отравление живой цели на 3 раунда.",
    passiveNote: "При ИНТ ≥ 3 обычные удары получают +0.5×ЛОВ к урону.",
  },
  {
    id: "disarming_thrust",
    name: "Обезоруживающий выпад",
    intReq: 3,
    cooldown: 2,
    scaleStat: "agi",
    scaleMult: 1.7,
    effect: "sunder",
    desc: "Выпад + 1.7×ЛОВ, раскалывающий броню врага на −2.",
    passiveNote: "При ИНТ ≥ 3 обычные удары рапирой получают +0.7×ЛОВ к урону.",
  },
  {
    id: "duelist_guard",
    name: "Стойка дуэлянта",
    intReq: 4,
    cooldown: 2,
    scaleStat: "agi",
    scaleMult: 1.9,
    effect: "guard",
    desc: "Укол + 1.9×ЛОВ и переход в Защиту до следующего хода.",
    passiveNote: "При ИНТ ≥ 4 обычные удары рапирой получают +0.8×ЛОВ к урону.",
  },
  {
    id: "sweeping_cut",
    name: "Секущий удар",
    intReq: 3,
    cooldown: 2,
    scaleStat: "str",
    scaleMult: 1.5,
    effect: "bleed",
    desc: "Широкий взмах + 1.5×СИЛ и кровотечение на 3 раунда.",
    passiveNote: "При ИНТ ≥ 3 обычные удары мечом получают +0.6×СИЛ к урону.",
  },
  {
    id: "sundering_blade",
    name: "Раскол лат",
    intReq: 4,
    cooldown: 2,
    scaleStat: "str",
    scaleMult: 1.9,
    effect: "sunder",
    desc: "Тяжёлый рубящий удар + 1.9×СИЛ, снижающий броню врага на −2.",
    passiveNote: "При ИНТ ≥ 4 обычные удары мечом получают +0.7×СИЛ к урону.",
  },
  {
    id: "ember_strike",
    name: "Удар углей",
    intReq: 3,
    cooldown: 2,
    scaleStat: "int",
    scaleMult: 2.2,
    effect: "bleed",
    desc: "Разряд посоха + 2.2×ИНТ и горение врага на 3 раунда.",
    passiveNote: "При ИНТ ≥ 3 обычные удары посохом получают +0.8×ИНТ к урону.",
  },
  {
    id: "warding_strike",
    name: "Оберегающий взмах",
    intReq: 4,
    cooldown: 2,
    scaleStat: "int",
    scaleMult: 1.8,
    effect: "guard",
    desc: "Удар + 1.8×ИНТ и Защитная стойка до следующего хода.",
    passiveNote: "При ИНТ ≥ 4 обычные удары посохом получают +0.9×ИНТ к урону.",
  },
  {
    id: "reckless_swing",
    name: "Безрассудный замах",
    intReq: 4,
    cooldown: 3,
    scaleStat: "str",
    scaleMult: 2.3,
    effect: "stun",
    desc: "Мощный замах + 2.3×СИЛ, оглушающий врага на 1 ход.",
    passiveNote: "При ИНТ ≥ 4 обычные удары топором получают +0.8×СИЛ к урону.",
  },
  {
    id: "rending_axe",
    name: "Рваная рана",
    intReq: 4,
    cooldown: 2,
    scaleStat: "str",
    scaleMult: 1.8,
    effect: "bleed",
    desc: "Рубящий удар + 1.8×СИЛ и кровотечение на 3 раунда.",
    passiveNote: "При ИНТ ≥ 4 обычные удары топором получают +0.7×СИЛ к урону.",
  },
  {
    id: "crushing_blow",
    name: "Сокрушение",
    intReq: 5,
    cooldown: 3,
    scaleStat: "str",
    scaleMult: 2.7,
    effect: "sunder",
    desc: "Удар молотом + 2.7×СИЛ, раскалывающий броню на −3.",
    passiveNote: "При ИНТ ≥ 5 обычные удары молотом получают +1.0×СИЛ к урону.",
  },
  {
    id: "bulwark_smash",
    name: "Удар оплота",
    intReq: 5,
    cooldown: 2,
    scaleStat: "str",
    scaleMult: 2.0,
    effect: "guard",
    desc: "Размашистый удар + 2.0×СИЛ и переход в Защиту.",
    passiveNote: "При ИНТ ≥ 5 обычные удары молотом получают +0.9×СИЛ к урону.",
  },
  {
    id: "shadow_rend",
    name: "Разрез тени",
    intReq: 6,
    cooldown: 2,
    scaleStat: "agi",
    scaleMult: 2.6,
    effect: "pierce",
    desc: "Теневой выпад + 2.6×ЛОВ, полностью игнорирующий броню.",
    passiveNote: "При ИНТ ≥ 6 обычные удары клинком получают +1.0×ЛОВ к урону.",
  },
  {
    id: "soul_drink",
    name: "Питьё душ",
    intReq: 7,
    cooldown: 3,
    scaleStat: "str",
    scaleMult: 2.4,
    effect: "leech",
    desc: "Удар + 2.4×СИЛ, похищающий 40% нанесённого урона в здоровье.",
    passiveNote: "При ИНТ ≥ 7 обычные удары клинком получают +1.0×СИЛ к урону.",
  },
];

const ARCHETYPE_TECHNIQUES: WeaponSkillDef[] = [
  { id: "bulwark_wall", name: "Стена щитов", intReq: 3, cooldown: 3, scaleStat: "str", scaleMult: 1.6, effect: "guard_wall", desc: "Урон оружия + 1.6×СИЛ; Защита на 2 хода и +4 брони до конца боя.", passiveNote: "При ИНТ ≥ 3 обычные удары получают +0.6×СИЛ." },
  { id: "bulwark_verdict", name: "Приговор лат", intReq: 4, cooldown: 2, scaleStat: "str", scaleMult: 2.2, effect: "armor_damage", desc: "Урон оружия + 2.2×СИЛ и +75% брони к урону.", passiveNote: "При ИНТ ≥ 4 обычные удары получают +0.8×СИЛ." },
  { id: "rage_sweep", name: "Яростный размах", intReq: 4, cooldown: 3, scaleStat: "str", scaleMult: 2.4, effect: "double_attack", desc: "Два обычных удара подряд без дополнительного бонуса; каждый отдельно бросает крит, оглушение и эффекты от удара.", passiveNote: "При ИНТ ≥ 4 обычные удары получают +0.8×СИЛ." },
  { id: "skull_split", name: "Раскол черепа", intReq: 5, cooldown: 3, scaleStat: "str", scaleMult: 3.2, effect: "enemy_missing", desc: "Урон оружия + 3.2×СИЛ; за каждые 10% недостающего здоровья врага +6% урона (до 60%).", passiveNote: "При ИНТ ≥ 5 обычные удары получают +1.1×СИЛ." },
  { id: "twin_fangs", name: "Парные клыки", intReq: 3, cooldown: 2, scaleStat: "agi", scaleMult: 1.7, effect: "double_attack", desc: "Два обычных удара подряд без дополнительного бонуса; каждый отдельно бросает крит, оглушение и эффекты от удара.", passiveNote: "При ИНТ ≥ 3 обычные удары получают +0.6×ЛОВ." },
  { id: "opening_strike", name: "Удар открытия", intReq: 4, cooldown: 3, scaleStat: "agi", scaleMult: 2.4, effect: "first_strike", desc: "Урон оружия + 2.4×ЛОВ; в первые 2 раунда урон приёма удваивается.", passiveNote: "При ИНТ ≥ 4 обычные удары получают +0.8×ЛОВ." },
  { id: "venom_chain", name: "Ядовитая цепь", intReq: 3, cooldown: 2, scaleStat: "agi", scaleMult: 1.6, effect: "poison", desc: "Урон оружия + 1.6×ЛОВ и отравление на 3 раунда.", passiveNote: "При ИНТ ≥ 3 обычные удары получают +0.6×ЛОВ." },
  { id: "empty_step", name: "Пустой шаг", intReq: 4, cooldown: 3, scaleStat: "agi", scaleMult: 1.5, effect: "dodge_action", desc: "Урон оружия + 1.5×ЛОВ; следующая атака врага полностью ускользает, а в следующем раунде +1 ход.", passiveNote: "При ИНТ ≥ 4 обычные удары получают +0.5×ЛОВ." },
  { id: "curse_brand", name: "Печать проклятия", intReq: 4, cooldown: 3, scaleStat: "int", scaleMult: 2.6, effect: "curse_brand", desc: "Урон оружия + 2.6×ИНТ; проклятие и холод на 3 раунда.", passiveNote: "При ИНТ ≥ 4 обычные удары получают +0.9×ИНТ." },
  { id: "soul_reprise", name: "Реприза души", intReq: 5, cooldown: 4, scaleStat: "int", scaleMult: 3.4, effect: "skill_leech", desc: "Урон оружия + 3.4×ИНТ сквозь броню; лечит на 35% урона и сокращает откат на 2.", passiveNote: "При ИНТ ≥ 5 обычные удары получают +1.2×ИНТ." },
  { id: "warding_word", name: "Слово защиты", intReq: 4, cooldown: 4, scaleStat: "int", scaleMult: 2.0, effect: "full_guard", desc: "Урон оружия + 2.0×ИНТ; полная защита от урона на 2 хода.", passiveNote: "При ИНТ ≥ 4 обычные удары получают +0.7×ИНТ." },
  { id: "scroll_tempest", name: "Буря свитков", intReq: 5, cooldown: 4, scaleStat: "int", scaleMult: 2.8, effect: "create_scroll", desc: "Урон оружия + 2.8×ИНТ; создаёт 2 случайных свитка и сразу применяет один.", passiveNote: "При ИНТ ≥ 5 обычные удары получают +1.0×ИНТ." },
];

export const WEAPON_TECHNIQUES: Record<string, WeaponSkillDef> = Object.fromEntries([
  ...Object.values(GEAR_BASES)
    .filter((b) => b.weaponSkill)
    .map((b) => [b.weaponSkill!.id, b.weaponSkill!]),
  ...EXTRA_TECHNIQUES.map((s) => [s.id, s]),
  ...ARCHETYPE_TECHNIQUES.map((s) => [s.id, s]),
]);

export const TECHNIQUE_POOL: Record<string, string[]> = {
  knife: ["artery_cut", "quick_cut", "venom_edge"],
  rapier: ["fencing", "disarming_thrust", "duelist_guard"],
  sword: ["riposte_stance", "sweeping_cut", "sundering_blade"],
  staff: ["arcane_pulse", "ember_strike", "warding_strike"],
  axe: ["bone_cleave", "reckless_swing", "rending_axe"],
  hammer: ["verdict_bell", "crushing_blow", "bulwark_smash"],
  abyss: ["void_reap", "shadow_rend", "soul_drink"],
  bulwark_mace: ["bulwark_answer", "bulwark_wall", "bulwark_verdict"],
  barbarian_greataxe: ["blood_reckoning", "rage_sweep", "skull_split"],
  assassin_stiletto: ["death_mark", "twin_fangs", "opening_strike"],
  ninja_kusarigama: ["shadow_snare", "venom_chain", "empty_step"],
  warlock_scepter: ["pact_drain", "curse_brand", "soul_reprise"],
  sage_censer: ["word_creation", "warding_word", "scroll_tempest"],
};

export function weaponSkillFor(item: GearItem | null | undefined): WeaponSkillDef | null {
  if (!item) return null;
  const base = GEAR_BASES[item.baseId] ?? GEAR_BASES.knife;
  const raw = item.skillId && WEAPON_TECHNIQUES[item.skillId]
    ? WEAPON_TECHNIQUES[item.skillId]
    : base.weaponSkill;
  if (!raw) return null;

  const level = clampGearLevel(item.level);
  const scaleStat = gearAffinity(item);
  const range: [number, number] =
    scaleStat === "int" ? [2, 4.5] : scaleStat === "str" ? [1.5, 3.5] : [1.5, 2.5];
  const mid = (range[0] + range[1]) / 2;
  const deviation = Math.max(-0.5, Math.min(0.5, raw.scaleMult - mid));
  const baseMult = Number(Math.max(range[0], Math.min(range[1], mid + deviation)).toFixed(1));
  const scaleMult = scaleMultByLevel(baseMult, level);
  const intReq = techniqueIntReq(level, scaleStat);
  const short = STAT_META[scaleStat].short;
  const desc = raw.desc.replace(/(\d+(?:\.\d+)?)×(?:ЛОВ|СИЛ|ИНТ)/g, `${scaleMult}×${short}`);
  const passiveBonus = scaleMultByLevel(baseMult * 0.35, level);
  const passiveNote = `При ИНТ ≥ ${intReq} обычные удары получают +${passiveBonus.toFixed(2)}×${short} к урону.`;
  return { ...raw, level, scaleStat, scaleMult, intReq, desc, passiveNote };
}

let gearSeq = 100;

/** Рост характеристик с уровнем предмета: каждый уровень +20% с округлением вверх. */
export function gearLevelMult(item: GearItem): number {
  return gearLevelMultiplier(item.level ?? 1);
}

export function canTwoHandGrip(item: GearItem): boolean {
  const base = GEAR_BASES[item.baseId];
  return !!base?.dmg && base.slot === "mainHand" && gearClassFor(item) === "medium";
}

export function effectiveHands(item: GearItem): 1 | 2 {
  if (canTwoHandGrip(item) && item.grip === "two") return 2;
  return (GEAR_BASES[item.baseId]?.hands ?? 1) >= 2 ? 2 : 1;
}

export function scaledGearStats(item: GearItem) {
  const base = GEAR_BASES[item.baseId] ?? GEAR_BASES.knife;
  const m = item.wearMult ?? WEAR_META[item.wear].mult;
  const v = item.statMult ?? 1;
  const level = clampGearLevel(item.level);
  const roll = item.dmgRoll ?? base.dmg;
  let dmg: [number, number] | undefined = roll
    ? [
        Math.max(1, scaleIntegerByLevel(Math.ceil(roll[0] * m), level)),
        Math.max(2, scaleIntegerByLevel(Math.ceil(roll[1] * m), level)),
      ]
    : undefined;
  if (dmg && canTwoHandGrip(item) && item.grip === "two") {
    dmg = [Math.ceil(dmg[0] * 1.5), Math.ceil(dmg[1] * 1.5)];
  }
  const armor = base.armor ? scaleIntegerByLevel(Math.ceil(base.armor * m * v), level) : 0;
  const hp = base.hp ? scaleIntegerByLevel(Math.ceil(base.hp * m * v), level) : 0;
  const evade = base.evade ? scalePercentByLevel(Math.ceil(base.evade * 100 * m * v), level) / 100 : 0;
  return { base, dmg, armor, hp, evade, skill: weaponSkillFor(item), level, wearMult: m };
}

/** Требования исследования предмета растут вместе с его уровнем. */
export function identifyReqs(item: GearItem): { int: number; gold: number } {
  const lvl = item.level ?? 1;
  return { int: Math.min(8, 1 + lvl), gold: 20 * lvl };
}

/** Разброс урона конкретного клинка: узкий (3–5) или размашистый (2–7). */
export function rollDamageSpread(base: [number, number]): [number, number] {
  const style = Math.random();
  let lo = base[0];
  let hi = base[1];
  if (style < 0.22) {
    lo = base[0] - 2;
    hi = base[1] + 1 + Math.round(Math.random() * 2);
  } else if (style < 0.45) {
    lo = base[0] - 1;
    hi = base[1];
  } else if (style < 0.78) {
    lo = base[0];
    hi = base[1] + 1;
  } else {
    lo = base[0];
    hi = base[1] + 2 + Math.round(Math.random() * 2);
  }
  lo = Math.max(1, lo);
  hi = Math.max(lo + 1, hi);
  return [lo, hi];
}

/** Случайный разброс параметров брони и украшений: −10% … +10%. */
export function rollStatSpread(): number {
  return Number((0.9 + Math.random() * 0.2).toFixed(2));
}

/**
 * Множитель состояния предмета:
 * изношенное 0.75 (0.70–0.80), ношенное 1.0 (0.90–1.10), новое 1.25 (1.30–1.35).
 */
export function rollWearMult(wear: WearTier, rng: () => number = Math.random): number {
  const range = WEAR_RANGE[wear];
  return Number((range.lo + rng() * (range.hi - range.lo)).toFixed(3));
}

export function gearBuyPrice(item: GearItem): number {
  const base = GEAR_BASES[item.baseId] ?? GEAR_BASES.knife;
  /* Пока предмет не исследован, лавочник берёт цену от изношенности и уровня, без наценки за редкость */
  const wearMult = WEAR_META[item.wear].priceMult;
  const rarityMult = item.identified ? RARITY_META[item.rarity].priceMult : 1.0;
  return Math.max(20, Math.round((base.price * gearLevelMult(item) * wearMult * rarityMult) / 5) * 5);
}

export function gearSellPrice(item: GearItem): number {
  const base = GEAR_BASES[item.baseId] ?? GEAR_BASES.knife;
  const wearMult = WEAR_META[item.wear].priceMult;
  const rarityMult = item.identified ? RARITY_META[item.rarity].priceMult : 0.9;
  return Math.max(10, Math.round((base.price * gearLevelMult(item) * wearMult * rarityMult * 0.45) / 5) * 5);
}


const ALL_EPIC_IDS = Object.keys(EPIC_SKILLS) as EpicSkillId[];
const ALL_LEG_IDS = Object.keys(LEGENDARY_PASSIVES) as LegendaryPassiveId[];

/** Базовые веса редкости: 60% обычное, 30% редкое, 8% эпическое, 2% легендарное. */
export const BASE_RARITY_WEIGHTS: Record<RarityTier, number> = {
  common: 60,
  rare: 30,
  epic: 8,
  legendary: 2,
};

export function rollRarity(
  weights: Record<RarityTier, number> = BASE_RARITY_WEIGHTS,
  rng: () => number = Math.random,
): RarityTier {
  const total = (Object.keys(weights) as RarityTier[]).reduce((s, k) => s + weights[k], 0);
  let r = rng() * total;
  const order: RarityTier[] = ["legendary", "epic", "rare", "common"];
  for (const tier of order) {
    r -= weights[tier];
    if (r <= 0) return tier;
  }
  return "common";
}

export function createGearItem(opts: {
  baseId: string;
  wear?: WearTier;
  rarity?: RarityTier;
  identified?: boolean;
  floor?: number;
  level?: number;
  rarityWeights?: Record<RarityTier, number>;
  skillId?: string;
}): GearItem {
  const base = GEAR_BASES[opts.baseId] ?? GEAR_BASES.knife;

  const wear: WearTier =
    opts.wear ??
    (() => {
      const r = Math.random();
      if (r < 0.32) return "battered";
      if (r < 0.76) return "worn";
      return "new";
    })();

  const rarity: RarityTier = opts.rarity ?? rollRarity(opts.rarityWeights);
  const gearClass: "light" | "medium" | "heavy" =
    base.gearClass ?? (["plate", "shield_tower", "greathelm"].includes(base.id) ? "heavy" : "medium");

  /* Характеристика назначения важнее веса: лёгкий нож получает ловкие свойства. */
  const reqStat = base.stat ?? (gearClass === "heavy" ? "str" : gearClass === "light" ? "int" : "agi");

  /* Более высокое качество обладает всеми свойствами прошлого!
     Пул свойств зависит от характеристики предмета. */
  const statAffixes: Record<StatKey, RareAffixId[]> = {
    // Магическое: вампиризм, регенерация, ускользание
    int: ["vamp", "regen", "swift"],
    // Ловкое: крит, вампиризм, ускользание
    agi: ["crit", "vamp", "swift"],
    // Силовое: шипы, регенерация, мощь, пролом брони
    str: ["thorns", "regen", "might", "pierce"],
  };
  const affixPool: RareAffixId[] = [
    ...(statAffixes[reqStat] ?? []),
    "crit" as RareAffixId,
    "vamp" as RareAffixId,
    "regen" as RareAffixId,
  ];
  const rareAffix: RareAffixId | undefined =
    rarity === "rare" || rarity === "epic" || rarity === "legendary"
      ? pick(affixPool)
      : undefined;

  const itemLevelForAp = opts.level ?? base.level ?? 1;
  const legacyPool = ALL_LEG_IDS.filter((id) => id !== "time_weaver" || itemLevelForAp >= 3);
  const legacyPassive: LegendaryPassiveId | undefined =
    rarity === "legendary" ? pick(legacyPool) : undefined;

  /* Множитель состояния: изношенное 0.75±0.05, ношенное 1.0±0.10, новое 1.25±0.05…0.10 */
  const wearMult = rollWearMult(wear);

  /* Качество: обычное — без бафов;
     редкое — 1 уникальный эффект по характеристике требования;
     эпическое — свойство редкого + (2 доп. эффекта ИЛИ 1 боевой приём);
     легендарное — всё выше + пассивная способность по той же характеристике. */
  const pool = effectPoolFor(reqStat, base.archetype).filter((id) => id !== "ap" || itemLevelForAp >= 3);
  const effects: GearEffectId[] = [];

  const hasTechnique = !!(TECHNIQUE_POOL[base.id] ?? []).length;
  let epicSkill: EpicSkillId | undefined;

  if (rarity === "epic" || rarity === "legendary") {
    /* Выбор между двумя дополнительными эффектами и боевым приёмом */
    if (hasTechnique && (rarity === "legendary" || Math.random() < 0.5)) {
      epicSkill =
        base.preferredEpic && Math.random() < 0.6
          ? base.preferredEpic
          : pick(ALL_EPIC_IDS);
    }
  }

  if (rarity !== "common") {
    const rest = [...pool];
    effects.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    if (rarity === "epic" || rarity === "legendary") {
      if (epicSkill) {
        /* Один боевой приём вместо двух эффектов */
      } else {
        for (let i = 0; i < 2 && rest.length; i++) {
          effects.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
        }
      }
    }
  }

  const passivePool = passivePoolFor(reqStat, base.archetype).filter((id) => id !== "assassin_shadow" || itemLevelForAp >= 3);
  const passive: GearPassiveId | undefined =
    rarity === "legendary"
      ? base.archetype && (archetypePassive(base.archetype) !== "assassin_shadow" || itemLevelForAp >= 3)
        ? archetypePassive(base.archetype)
        : pick(passivePool.length ? passivePool : passivePoolFor(reqStat))
      : undefined;

  return {
    uid: `g_${Date.now().toString(36)}_${++gearSeq}_${Math.random().toString(36).slice(2, 8)}`,
    wearMult,
    effects,
    passive,
    baseId: base.id,
    slot: base.slot,
    level: opts.level ?? base.level ?? 1,
    gearClass: base.gearClass ?? "medium",
    wear,
    rarity,
    identified: opts.identified ?? false,
    dmgRoll: base.dmg ? rollDamageSpread(base.dmg) : undefined,
    statMult: rollStatSpread(),
    skillId: base.weaponSkill
      ? opts.skillId && (TECHNIQUE_POOL[base.id] ?? []).includes(opts.skillId)
        ? opts.skillId
        : pick(TECHNIQUE_POOL[base.id] ?? [base.weaponSkill.id])
      : undefined,
    rareAffix,
    epicSkill,
    legendaryPassive: legacyPassive,
  };
}

/**
 * Ассортимент лавки: только предметы уровня ≤ уровня лавки.
 * Изношенность и редкость берутся из таблиц уровня лавки.
 * Уровень 1: изношенность 5/25/70, редкость 80/15/5/0.
 * Уровень 10: изношенность 40/60/0, редкость 40/25/20/15.
 */
export function rollShopStock(shopLevel: number, floor = 1, rng: () => number = Math.random): GearItem[] {
  const lvl = Math.max(1, Math.min(SHOP_MAX_LEVEL, shopLevel));
  const pool = Object.values(GEAR_BASES).filter((b) => (b.level ?? 1) <= lvl);
  if (!pool.length) return [];
  const wearTable = shopWearTable(lvl);
  const rarityTable = shopRarityTable(lvl);

  /* Пробежка 1: лучший предмет каждой ячейки — лавка покрывает все слоты.
     Пробежка 2: второй предмет там, где есть выбор. Добор — случайные. */
  const bySlot = new Map<Slot, GearBaseDef[]>();
  for (const b of pool) {
    const list = bySlot.get(b.slot) ?? [];
    list.push(b);
    bySlot.set(b.slot, list);
  }

  const seen = new Set<string>();
  const chosen: GearBaseDef[] = [];
  const sortedBySlot = [...bySlot.values()].map((list) =>
    [...list].sort((a, b) => (b.level ?? 1) - (a.level ?? 1)),
  );

  for (const list of sortedBySlot) {
    const b = list[0];
    if (!b || seen.has(b.id)) continue;
    seen.add(b.id);
    chosen.push(b);
  }
  for (const list of sortedBySlot) {
    if (chosen.length >= 15) break;
    const b = list[1];
    if (!b || seen.has(b.id)) continue;
    seen.add(b.id);
    chosen.push(b);
  }
  const rest = pool.filter((b) => !seen.has(b.id));
  for (const b of rest) {
    if (chosen.length >= 18) break;
    if (rng() < 0.75) chosen.push(b);
  }
  /* Порядок витрины не подсказывает, где дешёвая вещь. */
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }

  return chosen.map((b) =>
    createGearItem({
      baseId: b.id,
      level: b.level ?? 1,
      wear: rollFromTable(wearTable, rng),
      rarityWeights: rarityTable,
      floor: Math.max(1, floor),
      identified: false,
    }),
  );
}

/* ─────────────  СЛОТЫ СНАРЯЖЕНИЯ: руки, броня, кольца  ───────────── */

export function slotsForItem(item: GearItem): Slot[] {
  const base = GEAR_BASES[item.baseId];
  if (!base) return [item.slot];
  if (base.altSlots) return base.altSlots;
  /* Лёгкое оружие можно взять в любую руку. */
  if (base.dmg && gearClassFor(item) === "light" && (base.slot === "mainHand" || base.slot === "offHand")) {
    return base.slot === "mainHand" ? ["mainHand", "offHand"] : ["offHand", "mainHand"];
  }
  return [base.slot];
}

export interface EquipResult {
  player: Player;
  /** Человекочитаемое примечание: что было вытеснено. */
  note?: string;
}

/**
 * Надеть предмет. Учитывает двуручное оружие (занимает обе руки),
 * парное оружие, щиты и два слота под кольца.
 */
export function equipItem(player: Player, uid: string, slot: Slot, grip?: "one" | "two"): EquipResult {
  const item = player.armory.find((g) => g.uid === uid);
  if (!item) return { player, note: "Предмет не найден в арсенале." };

  if (!canWear(item, player)) {
    return { player, note: wearRequirementNote(item, player) };
  }

  const allowed = slotsForItem(item);
  if (!allowed.includes(slot)) return { player, note: "Этот предмет не влезет в этот слот." };

  const base = GEAR_BASES[item.baseId];
  const byUid = new Map(player.armory.map((g) => [g.uid, g]));
  const equip: Record<Slot, string | null> = { ...player.equip };
  let armory = player.armory;
  let note: string | undefined;

  /* Среднее оружие можно взять двумя руками: левая рука освобождается, урон ×1.5. */
  if (slot === "mainHand" && canTwoHandGrip(item)) {
    const nextGrip = grip ?? item.grip ?? "one";
    armory = player.armory.map((g) => (g.uid === uid ? { ...g, grip: nextGrip } : g));
    if (nextGrip === "two" && equip.offHand) {
      note = `Левая рука освобождена: ${base?.name ?? "оружие"} взято двумя руками.`;
      equip.offHand = null;
    }
  }

  /* Двуручное оружие вытесняет левую руку. */
  if (slot === "mainHand" && base?.hands === 2 && equip.offHand) {
    const off = equip.offHand ? byUid.get(equip.offHand) : null;
    note = `Левая рука освобождена: двуручник вытесняет ${off ? GEAR_BASES[off.baseId]?.name ?? "предмет" : "щит"}.`;
    equip.offHand = null;
  }
  /* Вторая рука вытесняет двуручное оружие или требует сменить хват. */
  if (slot === "offHand" && equip.mainHand) {
    const main = byUid.get(equip.mainHand);
    if (main && canTwoHandGrip(main) && main.grip === "two") {
      return { player, note: "Правая рука держит оружие двумя руками. Смените хват на одноручный, чтобы занять левую руку." };
    }
    if (main && GEAR_BASES[main.baseId]?.hands === 2) {
      note = `Двуручник снят в пользу ${base?.name ?? "предмета"} во второй руке.`;
      equip.mainHand = null;
    }
  }

  (Object.keys(equip) as Slot[]).forEach((s) => {
    if (equip[s] === uid) equip[s] = null;
  });
  equip[slot] = uid;

  /* Здоровье подрезает вызывающая сторона: в контенте нет derived, чтобы не было цикла импортов. */
  return { player: { ...player, armory, equip }, note };
}

export function unequipSlot(player: Player, slot: Slot): Player {
  if (!player.equip[slot]) return player;
  return { ...player, equip: { ...player.equip, [slot]: null } };
}

/* ─────────────  РАСХОДНИКИ, СВИТКИ И РЕАГЕНТЫ (БЕЗ МАНЫ)  ───────────── */

export type ItemKind = "potion" | "scroll" | "reagent" | "throwable";

export type ReagentCat = "mineral" | "plant" | "cloth" | "monster";

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  desc: string;
  price?: number;
  /** Категория реагента: в магазине реагенты идут отдельным отделом. */
  reagentCat?: ReagentCat;
  /** Уровень припаса = минимальный этаж, с которого он выпадает. */
  level?: number;
  minFloor?: number;
  use?: {
    type:
      | "heal" | "damage" | "cleanse" | "rage" | "flee" | "chill" | "sunder_damage"
      | "throw" | "poison" | "smoke" | "explosion" | "fear"
      | "haste" | "terror" | "stun_enemy" | "acid" | "stone"
      | "iron_tonic" | "blood_rage" | "quickblade" | "shadow_dust" | "pact_elixir" | "scroll_creation"
      | "bleed" | "blight" | "wither";
    power?: number;
    scale?: number;
    /** Характеристика масштабирования: у всех расходников ЛОВ. */
    scaleStat?: StatKey;
    intReq?: number;
    fleeRate?: number;
    rounds?: number;
    /** Против какого типа существ усилен эффект. */
    vs?: CreatureType;
  };
}

const I = (d: ItemDef) => d;

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  [
    /* зелья и расходники */
    I({ id: "potion_s", name: "Малое зелье лечения", kind: "potion", price: 45, use: { type: "heal", power: 28, scale: 1, scaleStat: "agi" }, desc: "Восстанавливает 28 + 1×ЛОВ здоровья. Вкус жжёного мёда и золы." }),
    I({ id: "potion_l", name: "Большое зелье лечения", kind: "potion", price: 120, use: { type: "heal", power: 65, scale: 1.5, scaleStat: "agi" }, desc: "Восстанавливает 65 + 1.5×ЛОВ здоровья. Густое, тёплое, варится на слезе банши." }),
    I({ id: "antidote", name: "Горечь полыни", kind: "potion", price: 42, use: { type: "cleanse", power: 8, scale: 0.5, scaleStat: "agi" }, desc: "Снимает кровотечение, проклятие и яд, возвращает 8 + 0.5×ЛОВ здоровья." }),
    I({ id: "rage", name: "Эликсир ярости", kind: "potion", price: 95, use: { type: "rage", rounds: 5 }, desc: "Пять раундов злости: +50% к урону." }),
    /* оружейные расходники не требуют Интеллекта */
    I({ id: "throwing_knife", name: "Метательный кинжал", kind: "throwable", price: 28, use: { type: "throw", power: 10, scale: 1.5, scaleStat: "agi" }, desc: "Быстрый бросок: 10 + 1.5×ЛОВ физического урона." }),
    I({ id: "poison_dart", name: "Отравленный дротик", kind: "throwable", price: 48, use: { type: "poison", power: 5, scale: 1, scaleStat: "agi", rounds: 3 }, desc: "Прокалывает кожу и травит живую цель 3 раунда. Нежить и големы невосприимчивы." }),
    I({ id: "smoke_bomb", name: "Дымовая бомба", kind: "throwable", price: 78, use: { type: "smoke", rounds: 2 }, desc: "Густой дым не даёт врагу попасть по тебе в следующие 2 атаки. Это не побег." }),
    I({ id: "blast_bomb", name: "Взрывная бомба", kind: "throwable", price: 95, use: { type: "explosion", power: 24, scale: 1.5, scaleStat: "agi" }, desc: "Взрыв наносит 24 + 1.5×ЛОВ урона, игнорируя броню." }),
    I({ id: "fear_vial", name: "Зелье ужаса", kind: "potion", price: 70, level: 2, minFloor: 2, use: { type: "fear", rounds: 2 }, desc: "Живая цель пропустит 2 следующих хода. Нежить и големы страха не знают." }),
    /* свитки (требуют Интеллект) */
    I({ id: "scroll_spark", name: "Свиток искры", kind: "scroll", price: 60, use: { type: "damage", power: 16, scale: 3, scaleStat: "agi", intReq: 2 }, desc: "16 + 3×ЛОВ урона. Короткая формула поджога; чтение требует ИНТ 2." }),
    I({ id: "scroll_fire", name: "Свиток огня", kind: "scroll", price: 85, use: { type: "damage", power: 24, scale: 4, scaleStat: "agi", intReq: 3 }, desc: "24 + 4×ЛОВ урона. Буквы в нём дописаны от руки, спеша; чтение требует ИНТ 3." }),
    I({ id: "scroll_heal", name: "Свиток исцеления", kind: "scroll", price: 90, use: { type: "heal", power: 32, scale: 4, scaleStat: "agi", intReq: 3 }, desc: "32 + 4×ЛОВ здоровья и снимает кровотечение. Чтение требует ИНТ 3." }),
    I({ id: "scroll_shadow", name: "Свиток тени", kind: "scroll", price: 155, use: { type: "flee", fleeRate: 0, intReq: 4 }, desc: "Тень не теряет добычу — уносит из боя без потерь." }),
    I({ id: "scroll_frost", name: "Свиток ледяных оков", kind: "scroll", price: 135, use: { type: "chill", power: 20, scale: 3, scaleStat: "agi", intReq: 5, rounds: 3 }, desc: "20 + 3×ЛОВ урона и холод на 3 раунда (урон врага −30%). Чтение требует ИНТ 5." }),
    I({ id: "scroll_bolt", name: "Свиток молнии", kind: "scroll", price: 175, use: { type: "sunder_damage", power: 38, scale: 5, scaleStat: "agi", intReq: 6 }, desc: "38 + 5×ЛОВ урона сквозь броню и раскол защиты (−2 брони). Чтение требует ИНТ 6." }),
    /* реагенты */
    I({ id: "moss", name: "Кровавый мох", kind: "reagent", reagentCat: "plant", price: 28, desc: "Растёт на том, что не похоронили." }),
    I({ id: "bone", name: "Костяная пыль", kind: "reagent", reagentCat: "monster", price: 28, desc: "Растёртые ошмётки чьего-то упрямства." }),
    I({ id: "fire", name: "Огненный гриб", kind: "reagent", reagentCat: "plant", price: 34, desc: "Тёплый на ощупь даже в холодной ладони." }),
    I({ id: "tear", name: "Слеза банши", kind: "reagent", reagentCat: "monster", price: 65, desc: "Собрана в полночь. Не высыхает." }),
    ...EXTRA_ITEMS,
    I({ id: "iron_tonic", name: "Тоник железной кожи", kind: "potion", price: 120,
      use: { type: "iron_tonic", rounds: 4 },
      desc: "Бастион: +4 брони и +4 регенерации на 4 раунда, снимает кровотечение." }),
    I({ id: "blood_rage", name: "Кровавая ярость", kind: "potion", price: 130,
      use: { type: "blood_rage", rounds: 4 },
      desc: "Варвар: ярость на 4 раунда (+50% урона) и +15% вампиризма оружием." }),
    I({ id: "quickblade_oil", name: "Масло быстрого клинка", kind: "potion", price: 125,
      use: { type: "quickblade", rounds: 3 },
      desc: "Ассасин: +25% шанса крита и +50% силы крита на 3 раунда." }),
    I({ id: "shadow_dust", name: "Пыль тени", kind: "throwable", price: 115,
      use: { type: "shadow_dust", rounds: 2 },
      desc: "Ниндзя: дымовая завеса на 2 атаки и +1 ход в следующем раунде." }),
    I({ id: "pact_elixir", name: "Эликсир пакта", kind: "potion", price: 140,
      use: { type: "pact_elixir", rounds: 3 },
      desc: "Колдун: сбрасывает перезарядку приёмов и даёт +25% урона приёмов на 3 раунда." }),
    I({ id: "scroll_creation", name: "Свиток сотворения", kind: "scroll", price: 160,
      use: { type: "scroll_creation", intReq: 5 },
      desc: "Мудрец: создаёт 2 случайных свитка в рюкзак и сразу применяет один из них." }),
  ].map((it) => [it.id, it]),
);

/** Уровень припаса = минимальный этаж дропа. */
export const SUPPLY_LEVELS: Record<string, number> = {
  potion_s: 1, antidote: 1, rage: 2, throwing_knife: 1, poison_dart: 1, smoke_bomb: 2,
  blast_bomb: 2, fear_vial: 2, scroll_spark: 1, scroll_fire: 2, scroll_heal: 2,
  scroll_shadow: 3, scroll_frost: 3, scroll_bolt: 4, potion_l: 3, potion_haste: 3,
  potion_stone: 3, scroll_terror: 3, scroll_snare: 4, acid_vial: 2, holy_water: 3,
  bomb_flash: 3, iron_tonic: 4, blood_rage: 4, quickblade_oil: 4, shadow_dust: 4,
  pact_elixir: 5, scroll_creation: 5, serrated_knife: 2, frost_bomb: 3,
  blight_powder: 4, wither_dust: 5,
};
for (const it of Object.values(ITEMS)) {
  if (it.use && it.level == null) {
    it.level = SUPPLY_LEVELS[it.id] ?? 1;
    it.minFloor = it.level;
  }
}
export function supplyLevel(id: string): number {
  return ITEMS[id]?.level ?? SUPPLY_LEVELS[id] ?? 1;
}

/** Только свитки требуют Интеллекта; зелья и метательные расходники доступны без него. */
export function consumableIntReq(def: ItemDef, intDiscount = 0): number {
  if (def.kind !== "scroll") return 0;
  return Math.max(0, (def.use?.intReq ?? 0) - intDiscount);
}

/** Все расходники масштабируются от ЛОВ; свитки по-прежнему требуют ИНТ для чтения. */
export function consumableScaleStat(def: ItemDef): StatKey | null {
  if (!def.use) return null;
  return "agi";
}

/** Единая формула для боя, лобби и подсказок: база + масштаб × характеристика. */
export function consumablePower(def: ItemDef, stats: Record<StatKey, number>): number {
  const u = def.use;
  if (!u) return 0;
  const stat = consumableScaleStat(def);
  return (u.power ?? 0) + (u.scale ?? 0) * (stat ? stats[stat] : 0);
}

export function consumableScaleLabel(def: ItemDef): string {
  const u = def.use;
  const stat = consumableScaleStat(def);
  if (!u?.scale || !stat) return "";
  return ` + ${u.scale}×${STAT_META[stat].short}`;
}

export type CraftStation = "alchemy" | "workshop";

export interface Recipe {
  id: string;
  out: string;
  count: number;
  need: string[];
  intReq: number;
  price: number;
  /** Алхимия варит зелья и свитки, мастерская собирает метательные расходники. */
  station?: CraftStation;
}

export const RECIPES: Recipe[] = [
  { id: "r1", out: "potion_s", count: 1, need: ["moss", "fire"], intReq: 1, price: 35 },
  { id: "r2", out: "antidote", count: 1, need: ["bone", "moss"], intReq: 2, price: 45 },
  { id: "r3", out: "scroll_spark", count: 1, need: ["fire", "bone"], intReq: 2, price: 55 },
  { id: "r4", out: "rage", count: 1, need: ["fire", "moss", "bone"], intReq: 3, price: 70 },
  { id: "r5", out: "potion_l", count: 1, need: ["moss", "moss", "tear"], intReq: 4, price: 95 },
  { id: "r6", out: "scroll_fire", count: 1, need: ["fire", "fire", "bone"], intReq: 4, price: 95 },
  { id: "r7", out: "scroll_frost", count: 1, need: ["tear", "bone"], intReq: 5, price: 110 },
  { id: "r8", out: "scroll_bolt", count: 1, need: ["tear", "fire", "bone"], intReq: 6, price: 140 },
  ...EXTRA_RECIPES,
  { id: "r15", out: "iron_tonic", count: 1, need: ["root", "ember", "bone"], intReq: 4, price: 100 },
  { id: "r16", out: "blood_rage", count: 1, need: ["fang", "moss", "fire"], intReq: 4, price: 105 },
  { id: "r17", out: "quickblade_oil", count: 1, need: ["gland", "powder", "silk"], intReq: 4, price: 105 },
  { id: "r18", out: "shadow_dust", count: 1, need: ["powder", "silk", "gland"], intReq: 3, price: 95, station: "workshop" },
  { id: "r19", out: "pact_elixir", count: 1, need: ["tear", "ember", "cloth"], intReq: 5, price: 120 },
  { id: "r20", out: "scroll_creation", count: 1, need: ["cloth", "tear", "bone"], intReq: 6, price: 140 },
];

export const BREW_FAILURE_CHANCE = 0.2;

export function hasIngredients(bag: Record<string, number>, need: string[]): boolean {
  const counts: Record<string, number> = {};
  need.forEach((id) => (counts[id] = (counts[id] ?? 0) + 1));
  return Object.entries(counts).every(([id, count]) => (bag[id] ?? 0) >= count);
}

export function attemptBrew(
  player: Player,
  recipe: Recipe,
  roll = Math.random(),
): { player: Player; success: boolean } | null {
  if (!player.knownRecipes.includes(recipe.id) || player.stats.int < recipe.intReq) return null;
  if (!hasIngredients(player.bag, recipe.need)) return null;

  const bag = { ...player.bag };
  recipe.need.forEach((id) => {
    bag[id] -= 1;
    if (bag[id] === 0) delete bag[id];
  });

  const success = roll >= BREW_FAILURE_CHANCE;
  if (success) {
    const amount = recipe.count + (player.passives.includes("brewer") ? 1 : 0);
    bag[recipe.out] = (bag[recipe.out] ?? 0) + amount;
  }
  return { player: { ...player, bag }, success };
}

/* ─────────────  ВРАГИ И БОССЫ ПЕРЕД ЛЕСТНИЦЕЙ  ───────────── */

export type CreatureType = "beast" | "undead" | "humanoid" | "construct" | "demon";

export const CREATURE_META: Record<CreatureType, { name: string; note: string }> = {
  beast: { name: "Зверь", note: "Подвержен яду и страху." },
  undead: { name: "Нежить", note: "Нельзя отравить или испугать." },
  humanoid: { name: "Живой", note: "Подвержен яду и страху." },
  construct: { name: "Конструкт", note: "Нельзя отравить или испугать." },
  demon: { name: "Демон", note: "Восприимчив к яду, но не знает страха." },
};

export function isImmuneTo(type: CreatureType, effect: "poison" | "fear"): boolean {
  return type === "undead" || type === "construct" || (type === "demon" && effect === "fear");
}

export type EnemyMove =
  | "attack"
  | "heavy"
  | "guard"
  | "wound"
  | "curse"
  | "drain"
  | "sunder"
  | "bell_stun"
  | "poison"
  | "multi"
  | "terror"
  | "seal_items"
  | "seal_skills"
  | "seal_attack";

export interface EnemyDef {
  id: string;
  name: string;
  type: CreatureType;
  title?: string;
  isBoss?: boolean;
  art: string;
  hp: number;
  ap: number;
  atk: [number, number];
  armor: number;
  gold: [number, number];
  xp: number;
  minFloor: number;
  /** Ярус обитания: 1 — низкие, 2 — средние, 3 — высокие. */
  tier?: 1 | 2 | 3;
  flavor: string;
  moves: EnemyMove[];
  abilitiesDesc?: string[];
  /** Пассивный эффект (боссам задаётся вручную, катастрофам выпадает случайно) */
  passiveId?: string;
}

export const ENEMIES: EnemyDef[] = [
  {
    id: "vermin",
    name: "Крысиный поводырь",
    type: "beast",
    art: "images/foe-vermin.jpg",
    hp: 24,
    ap: 2,
    atk: [3, 6],
    armor: 0,
    gold: [14, 28],
    xp: 6,
    minFloor: 1,
    flavor: "За ним идут те, кто мельче. Он их и не считает.",
    moves: ["attack", "wound", "attack"],
  },
  {
    id: "husk",
    name: "Гнилой ходок",
    type: "undead",
    art: "images/foe-husk.jpg",
    hp: 32,
    ap: 2,
    atk: [4, 8],
    armor: 1,
    gold: [18, 34],
    xp: 8,
    minFloor: 1,
    flavor: "Идёт на запах свечи и не устаёт.",
    moves: ["attack", "heavy", "attack", "wound"],
  },
  {
    id: "bone",
    name: "Костяной воин",
    type: "undead",
    art: "images/foe-bone.jpg",
    hp: 40,
    ap: 3,
    atk: [5, 9],
    armor: 2,
    gold: [26, 48],
    xp: 10,
    minFloor: 2,
    flavor: "Держит строй, которого давно никто не отдаёт.",
    moves: ["attack", "guard", "heavy", "attack"],
  },
  {
    id: "wraith",
    name: "Плачущая тень",
    type: "undead",
    art: "images/foe-wraith.jpg",
    hp: 36,
    ap: 3,
    atk: [6, 11],
    armor: 0,
    gold: [30, 54],
    xp: 11,
    minFloor: 2,
    flavor: "Сначала плачет, потом спрашивает твоё имя.",
    moves: ["attack", "curse", "drain", "attack"],
  },
  {
    id: "brute",
    name: "Огр-мясник",
    type: "humanoid",
    art: "images/foe-brute.jpg",
    hp: 62,
    ap: 3,
    atk: [9, 15],
    armor: 2,
    gold: [46, 82],
    xp: 15,
    minFloor: 3,
    flavor: "Считает трупы. У него пока мало.",
    moves: ["attack", "heavy", "guard", "sunder"],
  },
  {
    id: "seer",
    name: "Ослеплённый пророк",
    type: "humanoid",
    art: "images/foe-wraith.jpg",
    hp: 54,
    ap: 4,
    atk: [8, 13],
    armor: 1,
    gold: [52, 95],
    xp: 17,
    minFloor: 4,
    flavor: "Видит, куда придёшь, но не когда.",
    moves: ["curse", "attack", "drain", "heavy"],
  },
  {
    id: "golem",
    name: "Страж из шлака",
    type: "construct",
    art: "images/foe-brute.jpg",
    hp: 68,
    ap: 2,
    atk: [9, 14],
    armor: 4,
    gold: [38, 68],
    xp: 16,
    minFloor: 3,
    flavor: "Огонь в трещинах не согревает камень.",
    moves: ["heavy", "guard", "sunder", "attack"],
  },
  {
    id: "imp",
    name: "Угольный бес",
    type: "demon",
    art: "images/foe-wraith.jpg",
    hp: 47,
    ap: 4,
    atk: [7, 12],
    armor: 1,
    gold: [42, 75],
    xp: 14,
    minFloor: 4,
    flavor: "Смеётся, когда слышит панику в твоём дыхании.",
    moves: ["attack", "heavy", "curse", "attack"],
  },
];

export const BOSSES: EnemyDef[] = [
  {
    id: "boss_warden",
    name: "Смотритель Катакомб",
    type: "undead",
    title: "Страж лестницы I яруса",
    isBoss: true,
    art: "images/foe-boss.jpg",
    hp: 58,
    ap: 3,
    atk: [6, 10],
    armor: 2,
    gold: [65, 95],
    xp: 24,
    minFloor: 1,
    flavor: "Ключи от нижних ступеней прикованы к его кадилу.",
    moves: ["attack", "curse", "heavy", "guard", "sunder"],
    passiveId: "stone_hide",
    abilitiesDesc: [
      "Кадило пепла — накладывает проклятие (−30% к твоему урону)",
      "Раскол лат — пробивает и снижает твою броню",
      "Железный заслон — уходит в глухую оборону",
    ],
  },
  {
    id: "boss_prelate",
    name: "Костяной Архиерей",
    type: "undead",
    title: "Страж лестницы II яруса",
    isBoss: true,
    art: "images/foe-boss.jpg",
    hp: 76,
    ap: 3,
    atk: [7, 12],
    armor: 2,
    gold: [90, 135],
    xp: 34,
    minFloor: 2,
    flavor: "Читает отходную по тем, кто ещё пытается дышать.",
    moves: ["drain", "curse", "bell_stun", "attack", "heavy"],
    passiveId: "regen",
    abilitiesDesc: [
      "Погребальный звон — оглушает, отнимая 1 ход в следующем раунде",
      "Жатва дыхания — вытягивает здоровье и лечит себя",
      "Анафема — накладывает тяжёлое проклятие",
    ],
  },
  {
    id: "boss_inquisitor",
    name: "Пепельный Инквизитор",
    type: "humanoid",
    title: "Страж лестницы III яруса",
    isBoss: true,
    art: "images/foe-boss.jpg",
    hp: 96,
    ap: 4,
    atk: [9, 14],
    armor: 3,
    gold: [125, 180],
    xp: 46,
    minFloor: 3,
    flavor: "Его приговор всегда один — спускаться ниже живым запрещено.",
    moves: ["wound", "sunder", "heavy", "bell_stun", "drain"],
    passiveId: "frenzy",
    abilitiesDesc: [
      "Клеймо еретика — глубокое кровотечение",
      "Судный колокол — лишает 1 хода в раунде",
      "Сокрушение — раскалывает броню и бьёт в 1.7× силы",
    ],
  },
];

/* Бестиарий: прежние обитатели + три новых яруса. */
ENEMIES.push(...EXTRA_ENEMIES);
BOSSES.push(...EXTRA_BOSSES);

/** Подписи и объяснения приёмов врагов — их читают в кодексе противника. */
export const ENEMY_MOVE_META: Record<EnemyMove, { name: string; desc: string }> = {
  attack: { name: "Обычная атака", desc: "Стандартный удар: урон равен броску оружия, минус твоя броня." },
  heavy: { name: "Сокрушительный удар", desc: "Бьёт в 1.7× силы. Медленно замахивается — заметно на два хода вперёд." },
  guard: { name: "Глухая защита", desc: "Уходит в щит: получаемый им урон вдвое меньше, пока он в обороне." },
  wound: { name: "Рваная рана", desc: "0.9× урона и попытка открыть кровотечение на 3 раунда; сила сопротивляется." },
  curse: { name: "Проклятие", desc: "0.7× урона и накладывает порчу: твой урон −30% на 3 раунда." },
  drain: { name: "Похищение жизни", desc: "Бьёт по духу (игнорирует броню) и лечится половиной нанесённого." },
  sunder: { name: "Раскол брони", desc: "Удар по швам доспеха: −1 к твоей броне до конца боя." },
  bell_stun: { name: "Оглушающий звон", desc: "Бьёт по рассудку: −1 ход тебе в следующем раунде." },
  poison: { name: "Ядовитый удар", desc: "Ранит и вводит яд: раунды 4 урона за каждый пройденный раунд." },
  multi: { name: "Двойной выпад", desc: "Два удара по 65% урона подряд — броня считается каждый раз." },
  terror: { name: "Насмешка и заслон", desc: "Накладывает проклятие на 2 раунда и тут же уходит в защиту." },
  seal_items: { name: "Печать немоты", desc: "Запрещает игроку использовать расходники в его следующий ход." },
  seal_skills: { name: "Печать забвения", desc: "Запрещает игроку использовать приёмы в его следующий ход." },
  seal_attack: { name: "Печать оков", desc: "Запрещает игроку обычную атаку в его следующий ход." },
};

export const STAT_ORDER: StatKey[] = ["str", "agi", "int"];

export function randInt(lo: number, hi: number, rng: () => number = Math.random) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pick<T>(arr: T[], rng: () => number = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

export const REAGENTS = ["moss", "bone", "fire", "tear", ...EXTRA_REAGENTS];

/* ─────────────  УГРОЗЫ, УРОВНИ МОНСТРОВ, ТАБЛИЦЫ ВЫПАДЕНИЯ  ───────────── */

export const THREAT_META: Record<
  Threat,
  { name: string; desc: string; chance: number; hpMult: number; atkMult: number; gearOnly: boolean }
> = {
  normal: {
    name: "Обычный",
    desc: "Стандартная угроза своего этажа. Дроп по общим правилам.",
    chance: 0.8,
    hpMult: 1,
    atkMult: 1,
    gearOnly: false,
  },
  horror: {
    name: "Ужас",
    desc: "Крепче и злее обычного, с дополнительным приёмом. Пустых рук не оставляет: доля «ничего» уходит в снаряжение.",
    chance: 0.15,
    hpMult: 1.45,
    atkMult: 1.3,
    gearOnly: true,
  },
    catastrophe: {
    name: "Катастрофа",
    desc: "Мини-босс: не меньше двух особых приёмов и пассивный эффект. Чаще всех оставляет снаряжение.",
    chance: 0.05,
    hpMult: 1.85,
    atkMult: 1.55,
    gearOnly: false,
  },
};

export const ENEMY_PASSIVES: Record<string, EnemyPassive> = {
  stone_hide: {
    id: "stone_hide",
    name: "Каменная шкура",
    desc: "Физический урон по нему снижен на 25%.",
  },
  regen: {
    id: "regen",
    name: "Регенерация",
    desc: "Восстанавливает 4 ОЗ в конце каждого раунда.",
  },
  venom: {
    id: "venom",
    name: "Ядовитый",
    desc: "Его удары отравляют тебя на 2 раунда.",
  },
  frenzy: {
    id: "frenzy",
    name: "Исступление",
    desc: "Действует на один ход больше.",
  },
};

/** Уровень монстра на этаже N: N−1 (20%), N (55%), N+1 (25%). На 1-м этаже возможен уровень 0. */
export function monsterLevelForRoll(floor: number, roll: number): number {
  const f = Math.max(1, Math.floor(floor));
  const delta = roll < 0.2 ? -1 : roll < 0.75 ? 0 : 1;
  return Math.max(0, f + delta);
}

export function rollMonsterLevel(floor: number, rng: () => number = Math.random): number {
  return monsterLevelForRoll(floor, rng());
}

export function threatForRoll(roll: number): Threat {
  return roll < 0.8 ? "normal" : roll < 0.95 ? "horror" : "catastrophe";
}

export function rollThreat(rng: () => number = Math.random): Threat {
  return threatForRoll(rng());
}

export interface LootTable {
  nothing: number;
  gold: number;
  reagents: number;
  supplies: number;
  gear: number;
}

/**
 * Базовая таблица обычного монстра: 30% ничего, 30% золото, 20% реагенты,
 * 15% припасы, 5% снаряжение.
 * За каждый уровень монстра выше этажа «ничего» теряет 1 п.п., а золото,
 * реагенты, припасы и снаряжение получают по 1 п.п. (итого −4 п.п. у «ничего»).
 * Ужас: всё, кроме «ничего», превращается в снаряжение.
 * Катастрофа: минус 8 п.п. у «ничего», прибавка снаряжению, золоту и реагентам.
 */
export function lootTableFor(level: number, floor: number, threat: Threat): LootTable {
  const delta = level - floor;
  const t: LootTable = {
    gold: Math.max(0, 30 + delta),
    reagents: Math.max(0, 20 + delta),
    supplies: Math.max(0, 15 + delta),
    gear: Math.max(0, 5 + delta),
    nothing: 0,
  };
  const rewardTotal = t.gold + t.reagents + t.supplies + t.gear;
  t.nothing = Math.max(0, 100 - rewardTotal);

  if (threat !== "normal") {
    // Ужас и катастрофа не оставляют пустых рук: доля «ничего» уходит в снаряжение.
    t.gear += t.nothing;
    t.nothing = 0;
  }
  if (threat === "catastrophe") {
    // Мини-босс: ещё треть расходников и золота тоже превращается в снаряжение.
    const moved = (t.gold + t.reagents + t.supplies) * 0.3;
    t.gold *= 0.7;
    t.reagents *= 0.7;
    t.supplies *= 0.7;
    t.gear += moved;
  }

  const total = t.nothing + t.gold + t.reagents + t.supplies + t.gear || 1;
  if (Math.abs(total - 100) > 0.0001) {
    const scale = 100 / total;
    t.nothing *= scale;
    t.gold *= scale;
    t.reagents *= scale;
    t.supplies *= scale;
    t.gear *= scale;
  }
  return t;
}

export function lootCategoryForRoll(table: LootTable, roll: number): keyof LootTable {
  let r = Math.max(0, Math.min(0.999999, roll)) * 100;
  const order: (keyof LootTable)[] = ["nothing", "gold", "reagents", "supplies", "gear"];
  for (const key of order) {
    if (r < table[key]) return key;
    r -= table[key];
  }
  return "gear";
}

/** Веса редкости: 60/30/8/2, усиленные угрозой и уровнем монстра. */
export function rarityWeightsFor(threat: Threat, levelDelta: number): Record<RarityTier, number> {
  const w: Record<RarityTier, number> = { ...BASE_RARITY_WEIGHTS };
  if (threat === "horror") {
    w.rare += 8;
    w.epic += 4;
    w.legendary += 2;
  } else if (threat === "catastrophe") {
    w.rare += 12;
    w.epic += 8;
    w.legendary += 4;
  }
  if (levelDelta !== 0) {
    w.rare += levelDelta * 2;
    w.epic += levelDelta;
    w.legendary += levelDelta * 0.5;
  }
  w.common = Math.max(1, w.common - (w.rare - 30) - (w.epic - 8) - (w.legendary - 2));
  return w;
}

const SUPPLY_POOL = [
  "potion_s",
  "potion_l",
  "antidote",
  "rage",
  "potion_haste",
  "potion_stone",
  "scroll_spark",
  "scroll_fire",
  "scroll_heal",
  "scroll_terror",
  "scroll_snare",
  "throwing_knife",
  "poison_dart",
  "smoke_bomb",
  "blast_bomb",
  "bomb_flash",
  "acid_vial",
  "holy_water",
  "iron_tonic",
  "blood_rage",
  "quickblade_oil",
  "shadow_dust",
  "pact_elixir",
  "scroll_creation",
  "serrated_knife",
  "frost_bomb",
  "blight_powder",
  "wither_dust",
];

function pickGearBase(level: number): string {
  const pool = Object.values(GEAR_BASES).filter((b) => b.minFloor <= level + 1);
  const usable = pool.length ? pool : Object.values(GEAR_BASES);
  // Чем глубже, тем реже попадает простая сталь.
  const weighted = usable.map((b) => ({ b, w: 1 + b.minFloor * 0.6 }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const { b, w } of weighted) {
    r -= w;
    if (r <= 0) return b.id;
  }
  return usable[0].id;
}

/** Дроп с обычного монстра: 30% ничего, 30% золото, 20% реагенты, 15% припасы, 5% снаряжение. */
export function rollEnemyLoot(
  level: number,
  floor: number,
  threat: Threat,
  rng: () => number = Math.random,
): { gold: number; items: string[]; gear: GearItem[] } {
  const table = lootTableFor(level, floor, threat);
  const category = lootCategoryForRoll(table, rng());
  const out: { gold: number; items: string[]; gear: GearItem[] } = { gold: 0, items: [], gear: [] };

  if (category === "nothing") return out;
  if (category === "gold") {
    out.gold = randInt(6 + level * 3, 14 + level * 6, rng);
    return out;
  }
  if (category === "reagents") {
    out.items.push(pick(REAGENTS, rng));
    if (rng() < 0.25) out.items.push(pick(REAGENTS, rng));
    return out;
  }
  if (category === "supplies") {
    const pool = SUPPLY_POOL.filter((id) => supplyLevel(id) <= floor);
    out.items.push(pick(pool.length ? pool : SUPPLY_POOL, rng));
    return out;
  }

  out.gear.push(
    createGearItem({
      baseId: pickGearBase(level),
      floor: level,
      rarityWeights: rarityWeightsFor(threat, level - floor),
    }),
  );
  return out;
}
