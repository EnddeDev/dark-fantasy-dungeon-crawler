import {
  BOSSES,
  ENEMIES,
  ENEMY_PASSIVES,
  EPIC_SKILLS,
  GEAR_BASES,
  ITEMS,
  REAGENTS,
  BOSS_RARITY_WEIGHTS,
  CHEST_RARITY_WEIGHTS,
  THREAT_META,
  consumableIntReq,
  consumablePower,
  canRollExtraAp,
  createGearItem,
  isImmuneTo,
  pick,
  randInt,
  rollDungeonWear,
  rollEnemyLoot,
  rollMonsterLevel,
  rollThreat,
  scaledGearStats,
  effectiveHands,
  gearAffinity,
  supplyLevel,

  type EnemyDef,
  type ItemDef,
  type EnemyMove,
  type EpicSkillDef,
  type WeaponSkillDef,
} from "./content";
import {
  ELEMENT_NAMES,
  MONSTER_RACE_META,
  MONSTER_TYPE_META,
  coerceMonsterType,
  monsterEvade,
  raceApDelta,
  raceBonusMoves,
  raceCannotHeal,
  raceEffectResist,
  raceElementMult,
  raceFortify,
  raceGuardBonus,
  raceImmuneTo,
  type DamageElement,
  type MonsterType,
} from "./monsters";
import { SLOT_ORDER } from "./types";
import { enemyLevelMult, scaledEnemyXp } from "./enemyScaling";
import { isBattleCurse } from "./traps";
import {
  FIRE_BURN_STEP,
  ICE_TURN_DAMAGE,
  biomeHealingAmount,
  biomeMissChance,
  biomeStrikeMult,
  fireBurnDamage,
  normalizeBiome,
  type BiomeId,
} from "./biomes";
import { BOSS_EFFECT_RESIST, enemyChance, enemyEffectPower, rollEnemyEffects } from "./enemyEffects";
import { combatChance, emptyChanceLayers, staticChance, type ChanceKey, type ChanceLayers } from "./chances";
import {
  statActions,
  statCritChance,
  statCritDamage,
  statDamage,
  statEvasion,
  statHealth,
  statMagicResist,
  statTechniqueDamage,
  statTenacity,
} from "./statFormulas";
import { GEAR_EFFECTS } from "./gearEffects";
import { CHILL_HEAL_MULT, magicTickDamage, statusTickDamage } from "./statusEffects";
import type { ArchetypeId } from "./archetypes";
import type { GearEffectId, GearPassiveId } from "./gearEffects";
import {
  GEAR_PASSIVE_BASE,
  MAX_EXTRA_AP,
  effectMagnitude,
  epicMagnitude,
  legendaryMagnitude,
  passiveMagnitude,
  rareAffixMagnitude,
  scaleByLevel,
  scaleIntegerByLevel,
  techniqueIntReq,
} from "./gearScaling";
import type {
  EnemyPassive,
  EpicSkillId,
  GearItem,
  LegendaryPassiveId,
  Player,
  RareAffixId,
  Slot,
  StatKey,
  Threat,
} from "./types";

export interface LogLine {
  id: number;
  text: string;
  kind: "p" | "e" | "sys";
}

export interface BattleState {
  floor: number;
  /** Активный факел с карты: снимает штраф мрака на время действия. */
  torchTurns?: number;

  /** Правило среды текущего этажа. */
  biome: BiomeId;
  isBoss: boolean;
  enemy: {
    def: EnemyDef;
    /** Уровень монстра: этаж −1 … этаж +1 */
    level: number;
    /** Угроза: обычный, ужас, катастрофа */
    threat: Threat;
    /** Пассивный эффект врага (у катастроф и боссов) */
    passive: EnemyPassive | null;
    /** Итоговый боевой тип (с учётом ограничений рода). */
    mtype: MonsterType;
    /** Сколько твоих попаданий выдержал дракон (для «залпа»). */
    hitsTaken: number;
    /** Ярость дракона приходит один раз за бой. */
    furyUsed: boolean;
    /** Раунды ярости дракона: двойной урон и лечение в конце хода. */
    fury: number;
    /**
     * Ходы истощения: положительные эффекты врага (укрепление, шипы, лечение,
     * сопротивление, ярость) не работают. Броня, урон, ходы и стойка — обычные
     * параметры, истощение их не трогает.
     */
    depleted: number;
    /** Набор приёмов с учётом угрозы */
    moves: EnemyMove[];
    /** Эффекты «как у снаряжения» у боссов и катастроф. */
    effects: GearEffectId[];
    effectPower: Partial<Record<GearEffectId, number>>;
    hp: number;
    maxHp: number;
    ap: number;
    atk: [number, number];
    armor: number;
    gold: [number, number];
    xp: number;
    statuses: { chill: number; bleed: number; poison: number; fear: number; stunAp: number; blight: number; wither: number; burning: number; burn: number; curse: number; cursePower: number; sundered: number };
    guard: boolean;
    /** Раунды, в которые враг вынужден держать защиту (свиток ужаса, бомба). */
    forceGuard: number;
    /** Прошлый ход врага закончился промахом: следующий ход — приём. */
    lastMiss: boolean;
  };
  p: {
    hp: number;
    maxHp: number;
    /** Уровень героя: от него зависит множитель опыта за монстра. */
    level: number;
    armor: number;
    evade: number;
    ap: number;
    firstRoundApBonus: number;
    stats: Record<StatKey, number>;
    passives: string[];
    hit: [number, number];
    /** Итоговый шанс крита без боевых эффектов (для ведомости). */
    critChance: number;
    critDamage: number;
    tenacity: number;
    magicResist: number;
    fortify: number;
    chanceLayers: Record<ChanceKey, ChanceLayers>;
    weaponName: string;
    weaponSkill: WeaponSkillDef | null;
    weaponCd: number;
    epicSkills: EpicSkillDef[];
    epicCds: Record<string, number>;
    rareAffixes: RareAffixId[];
    legendaryPassives: LegendaryPassiveId[];
    gearEffects: GearEffectId[];
    gearPassives: GearPassiveId[];
    effectPower: Partial<Record<GearEffectId, number>>;
    passivePower: Partial<Record<GearPassiveId, Record<string, number>>>;
    rareAffixPower: Partial<Record<RareAffixId, Record<string, number>>>;
    legendaryPower: Partial<Record<LegendaryPassiveId, Record<string, number>>>;
    epicSkillLevels: Partial<Record<EpicSkillId, number>>;
    archetype: ArchetypeId | null;
    gearHands: 1 | 2;
    gearArchetype: ArchetypeId | null;
    intDiscount: number;
    immortalUsed: boolean;
    statuses: {
      wound: number;
      curse: number;
      cursePower?: number;
      poison: number;
      rage: number;
      sundered: number;
      stunAp: number;
      smoke: number;
      /** Раунды действия зелья скорости: +1 ход в раунде. */
      haste: number;
      /** Раунды каменной кожи: входящий урон −30%. */
      stone: number;
      /** Бастион: тоник железной кожи. */
      ironTonic: number;
      /** Варвар: кровавая ярость (вампиризм оружием). */
      bloodRage: number;
      /** Ассасин: масло быстрого клинка. */
      quickblade: number;
      /** Колдун: эликсир пакта (урон приёмов). */
      pactElixir: number;
      /** Полная защита от урона (свитки/приёмы мудреца). */
      fullGuard: number;
      /** Временная броня от приёмов бастиона. */
      tempArmor: number;
      /** Гарантированное уклонение от следующей атаки. */
      dodgeNext: number;
      /** Дополнительные ходы в следующем раунде. */
      shadowStep: number;
      /** Слои горения огненных недр: усилиются в начале каждого своего хода. */
      burning: number;
      /** Горение как негативный эффект: периодический урон от макс. ОЗ. */
      burn: number;
      /** Обморожение: лечение −50% и периодический урон. */
      chill: number;
      /** Страх: автоматическая защита в ход цели. */
      fear: number;
      /** Увядание: лечение переходит в магический урон. */
      wither: number;
      /** Холодное касание призрака: раунды, в которые лечение не действует. */
      noHeal: number;
      /** Мрак вампира: до конца раунда половина твоих атак уходит мимо. */
      darkness: number;
      /** Печати босса: запрет действий в следующий ход игрока. */
      sealItems: number;
      sealSkills: number;
      sealAttack: number;
    };
    guard: boolean;
    firstAttackDone: boolean;
  };
  bag: Record<string, number>;
  queue: ("p" | "e")[];
  idx: number;
  round: number;
  log: LogLine[];
  over: null | "win" | "lose" | "flee";
  fleeRate: number;
  loot: { gold: number; items: string[]; gear: GearItem[]; xp: number };
  flash: { id: number; target: "p" | "e"; kind: "hit" | "guard" | "miss" | "heal"; amount: number } | null;
}

export type PlayerAction =
  | { type: "attack" }
  | { type: "weapon_skill" }
  | { type: "epic_skill"; id: EpicSkillId }
  | { type: "item"; id: string }
  | { type: "guard" }
  | { type: "flee"; rate?: number };

let flashSeq = 0;

export function getEquippedGear(pl: Player): Record<Slot, GearItem | null> {
  const byUid = new Map(pl.armory.map((g) => [g.uid, g]));
  const out = {} as Record<Slot, GearItem | null>;
  for (const slot of SLOT_ORDER) {
    const uid = pl.equip[slot];
    out[slot] = uid ? (byUid.get(uid) ?? null) : null;
  }
  return out;
}

/** Снаряжение во всех ячейках (для сводки характеристик). */
export function equippedList(pl: Player): GearItem[] {
  const eq = getEquippedGear(pl);
  return SLOT_ORDER.map((s) => eq[s]).filter((g): g is GearItem => !!g);
}

export interface DerivedStats {
  maxHp: number;
  ap: number;
  /** Дополнительные ходы первого раунда от пассивов/легендарных свойств, не от ускорения предметов. */
  firstRoundApBonus: number;
  armor: number;
  evade: number;
  hit: [number, number];
  weaponName: string;
  weaponSkill: WeaponSkillDef | null;
  /** Названия вещей во всех ячейках — для карточки характеристик. */
  gearNames: Partial<Record<Slot, string>>;
  rareAffixes: RareAffixId[];
  epicSkills: EpicSkillDef[];
  legendaryPassives: LegendaryPassiveId[];
  gearEffects: GearEffectId[];
  gearPassives: GearPassiveId[];
  effectPower: Partial<Record<GearEffectId, number>>;
  passivePower: Partial<Record<GearPassiveId, Record<string, number>>>;
  rareAffixPower: Partial<Record<RareAffixId, Record<string, number>>>;
  legendaryPower: Partial<Record<LegendaryPassiveId, Record<string, number>>>;
  epicSkillLevels: Partial<Record<EpicSkillId, number>>;
  archetype: ArchetypeId | null;
  gearHands: 1 | 2;
  gearArchetype: ArchetypeId | null;
  intDiscount: number;
  critChance: number;
  critDamage: number;
  tenacity: number;
  magicResist: number;
  fortify: number;
  chanceLayers: Record<ChanceKey, ChanceLayers>;
  hpBonus: number;
  armorBonus: number;
  evadeBonus: number;
  strFlat: number;
}

export function derived(pl: Player): DerivedStats {
  const eq = getEquippedGear(pl);

  const rareAffixes: RareAffixId[] = [];
  const epicSkills: EpicSkillDef[] = [];
  const legendaryPassives: LegendaryPassiveId[] = [];
  const gearEffects: GearEffectId[] = [];
  const gearPassives: GearPassiveId[] = [];
  const effectPower: Partial<Record<GearEffectId, number>> = {};
  const passivePower: Partial<Record<GearPassiveId, Record<string, number>>> = {};
  const rareAffixPower: Partial<Record<RareAffixId, Record<string, number>>> = {};
  const legendaryPower: Partial<Record<LegendaryPassiveId, Record<string, number>>> = {};
  const epicSkillLevels: Partial<Record<EpicSkillId, number>> = {};
  let gearHands: 1 | 2 = 1;
  let gearArchetype: ArchetypeId | null = null;
  const gearNames: Partial<Record<Slot, string>> = {};

  let hpBonus = 0;
  let armorBonus = 0;
  let evadeBonus = 0;
  let hitLo = 0;
  let hitHi = 0;
  let mainName = "Кулаки";
  let weaponSkill: WeaponSkillDef | null = null;

  for (const slot of SLOT_ORDER) {
    const g = eq[slot];
    if (!g) continue;
    gearNames[slot] = (GEAR_BASES[g.baseId] ?? { name: "Предмет" }).name;
    const st = scaledGearStats(g);
    hpBonus += st.hp ?? 0;
    armorBonus += st.armor ?? 0;
    evadeBonus += st.evade ?? 0;

    /* Урон считают обе руки: двуручник один, в паре — правая + левая. */
    const isHand = slot === "mainHand" || slot === "offHand";
    if (isHand && st.dmg) {
      hitLo += st.dmg[0];
      hitHi += st.dmg[1];
      if (slot === "mainHand") {
        mainName = st.base.name;
        weaponSkill = st.skill;
      } else if (!weaponSkill) {
        weaponSkill = st.skill;
      }
    }

    if (slot === "mainHand") {
      gearHands = effectiveHands(g);
      gearArchetype = GEAR_BASES[g.baseId]?.archetype ?? null;
    }
    if (!g.identified) continue;
    const itemLevel = g.level ?? 1;
    if (g.effects) {
      gearEffects.push(...g.effects);
      for (const id of g.effects) {
        /* «Ускорение» имеет смысл только на эпической вещи с 5 уровня. */
        if (id === "ap" && !canRollExtraAp(g.rarity, itemLevel)) continue;
        const value = effectMagnitude(id, itemLevel, g.effectRolls?.[id]);
        /* Дополнительные ходы не складываются: берём самое большое значение. */
        if (id === "ap") effectPower[id] = Math.max(effectPower[id] ?? 0, value);
        else effectPower[id] = (effectPower[id] ?? 0) + value;
      }
    }
    if (g.passive) {
      gearPassives.push(g.passive);
      const cur = passivePower[g.passive] ?? {};
      for (const key of Object.keys(GEAR_PASSIVE_BASE[g.passive])) {
        cur[key] = Math.max(cur[key] ?? 0, passiveMagnitude(g.passive, key, itemLevel));
      }
      passivePower[g.passive] = cur;
    }
    if (g.rareAffix) {
      rareAffixes.push(g.rareAffix);
      const cur = rareAffixPower[g.rareAffix] ?? {};
      for (const key of ["ratio", "chance", "damage", "heal", "armor", "evade", "hp"]) {
        const v = rareAffixMagnitude(g.rareAffix, key, itemLevel);
        if (v) cur[key] = (cur[key] ?? 0) + v;
      }
      rareAffixPower[g.rareAffix] = cur;
    }
    if (g.epicSkill) {
      if (!epicSkills.some((e) => e.id === g.epicSkill)) epicSkills.push({ ...EPIC_SKILLS[g.epicSkill], intReq: techniqueIntReq(itemLevel, gearAffinity(g)) });
      epicSkillLevels[g.epicSkill] = Math.max(epicSkillLevels[g.epicSkill] ?? 1, itemLevel);
    }
    if (g.legendaryPassive) {
      legendaryPassives.push(g.legendaryPassive);
      const cur = legendaryPower[g.legendaryPassive] ?? {};
      for (const key of ["damage", "ap", "heal", "spellDamage", "intDiscount", "hp", "armor"]) {
        const v = legendaryMagnitude(g.legendaryPassive, key, itemLevel);
        if (v) cur[key] = Math.max(cur[key] ?? 0, v);
      }
      legendaryPower[g.legendaryPassive] = cur;
    }
  }

  const hasPassive = (id: string) => pl.passives.includes(id);
  const mightHp = rareAffixPower.might?.hp ?? 0;
  const swiftEvade = (rareAffixPower.swift?.evade ?? 0) / 100;
  const titanHp = legendaryPower.titan_heart?.hp ?? 0;
  const titanArmor = legendaryPower.titan_heart?.armor ?? 0;
  const strFlat = statDamage(pl.stats.str);
  const maxHp = statHealth(pl.stats.str) + hpBonus + (hasPassive("iron_will") ? 22 : 0) + mightHp + titanHp;

  const chanceLayers = emptyChanceLayers();
  chanceLayers.evade.stats.push(statEvasion(pl.stats.agi));
  /* Уклонение от брони и аксессуаров: лёгкая броня и ловкие украшения. */
  if (evadeBonus > 0) chanceLayers.evade.items.push(evadeBonus);
  chanceLayers.crit.stats.push(statCritChance(pl.stats.agi));
  chanceLayers.tenacity.stats.push(statTenacity(pl.stats.str));
  chanceLayers.magicResist.stats.push(statMagicResist(pl.stats.int));

  // Слой предметов: каждое свойство применяется последовательно.
  for (const slot of SLOT_ORDER) {
    const g = eq[slot];
    if (!g || !g.identified) continue;
    const lvl = g.level ?? 1;
    for (const id of g.effects ?? []) {
      const v = effectMagnitude(id, lvl, g.effectRolls?.[id]) / 100;
      if (id === "crit_chance") chanceLayers.crit.items.push(v);
      if (id === "fortify") chanceLayers.fortify.items.push(v);
      if (id === "magic_resist") chanceLayers.magicResist.items.push(v);
      if (id === "evade") chanceLayers.evade.items.push(v);
      if (id === "resist") chanceLayers.tenacity.items.push(v);
    }
  }

  // Слой эффектов: пассивы, архетипы и легендарные свойства.
  if (hasPassive("shadow_dance")) chanceLayers.evade.effects.push(0.15);
  if (swiftEvade > 0) chanceLayers.evade.effects.push(swiftEvade);
  if (passivePower.ninja_phantom?.evade) chanceLayers.evade.effects.push(passivePower.ninja_phantom.evade / 100);
  if (hasPassive("arch_ninja_10")) chanceLayers.evade.effects.push(0.15);
  if (hasPassive("saboteur")) chanceLayers.crit.effects.push(0.2);
  if (rareAffixPower.crit?.chance) chanceLayers.crit.effects.push(rareAffixPower.crit.chance / 100);
  if (passivePower.precision?.crit) chanceLayers.crit.effects.push(passivePower.precision.crit / 100);
  if (hasPassive("arch_bulwark_5")) chanceLayers.tenacity.effects.push(0.15);
  if (hasPassive("arch_barbarian_5")) chanceLayers.tenacity.effects.push(0.10);
  if (passivePower.fortress?.resist) {
    chanceLayers.fortify.effects.push(passivePower.fortress.resist / 100);
    chanceLayers.magicResist.effects.push(passivePower.fortress.resist / 100);
  }

  const ap = Math.max(1, statActions(pl.stats.agi)) + Math.min(MAX_EXTRA_AP, effectPower.ap ?? 0);
  let firstRoundApBonus = 0;
  for (const slot of SLOT_ORDER) {
    const g = eq[slot];
    if (!g || !g.identified) continue;
    const lvl = g.level ?? 1;
    if (g.passive === "assassin_shadow") firstRoundApBonus += passiveMagnitude("assassin_shadow", "ap", lvl);
    if (g.legendaryPassive === "time_weaver") firstRoundApBonus += legendaryMagnitude("time_weaver", "ap", lvl);
  }
  const armor = Math.max(0, armorBonus) + titanArmor;
  const evade = staticChance(chanceLayers.evade);
  const hit: [number, number] = hitLo > 0 ? [hitLo, hitHi] : [2, 4];
  const critChance = staticChance(chanceLayers.crit);
  const critDamage = 2 + statCritDamage(pl.stats.agi) + (effectPower.crit_mult ?? 0) / 100;
  const tenacity = staticChance(chanceLayers.tenacity);
  const magicResist = staticChance(chanceLayers.magicResist);
  const fortify = staticChance(chanceLayers.fortify);
  const intDiscount = (hasPassive("scribe") ? 1 : 0) + (legendaryPower.archmage_blood?.intDiscount ?? 0);

  return {
    maxHp,
    ap,
    armor,
    evade,
    hit,
    weaponName: mainName,
    weaponSkill,
    gearNames,
    rareAffixes,
    epicSkills,
    legendaryPassives,
    gearEffects,
    gearPassives,
    effectPower,
    passivePower,
    rareAffixPower,
    legendaryPower,
    epicSkillLevels,
    archetype: pl.archetype ?? null,
    gearHands,
    gearArchetype,
    intDiscount,
    critChance,
    critDamage,
    tenacity,
    magicResist,
    fortify,
    chanceLayers,
    hpBonus,
    armorBonus,
    evadeBonus,
    strFlat,
    firstRoundApBonus,
  };
}

/** Ускорение предмета: дополнительные ходы в каждом раунде. */
export function gearExtraAp(g: GearItem): number {
  if (!g.identified || !g.effects?.includes("ap")) return 0;
  /* Свойство доп. ходов бывает только у эпического снаряжения с 5 уровня. */
  if (!canRollExtraAp(g.rarity, g.level ?? 1)) return 0;
  return Math.min(MAX_EXTRA_AP, effectMagnitude("ap", g.level ?? 1, g.effectRolls?.ap));
}

/**
 * Очередь ходов: раунд — это отрезок, который каждая сторона делит на равные
 * доли. Ход героя наступает в точках 1/P, 2/P, … , ход врага — в 1/E, 2/E, …;
 * кто ближе по отрезку, тот и действует. Так 5 против 2 дают П П В П П В П,
 * а не П П П В П В П: быстрый враг вклинивается между ударами, а не копится
 * в конце раунда.
 */
export function buildQueue(apP: number, apE: number): ("p" | "e")[] {
  const a = Math.max(1, Math.floor(apP));
  const c = Math.max(1, Math.floor(apE));
  const out: ("p" | "e")[] = [];
  let i = 0;
  let j = 0;
  let last: "p" | "e" | null = null;
  while (i < a || j < c) {
    let side: "p" | "e";
    if (i >= a) side = "e";
    else if (j >= c) side = "p";
    else {
      const pDue = (i + 1) / a;
      const eDue = (j + 1) / c;
      if (pDue < eDue) side = "p";
      else if (eDue < pDue) side = "e";
      /* Доли совпали — чередуем, чтобы никто не забирал все равные ходы. */
      else side = last === "p" ? "e" : "p";
    }
    if (side === "p") i++;
    else j++;
    out.push(side);
    last = side;
  }
  return out;
}

export function rollEnemy(floor: number, rng: () => number = Math.random): EnemyDef {
  const pool = ENEMIES.filter((e) => e.minFloor <= floor);
  const weights = pool.map((e) => 1 / (1 + (floor - e.minFloor) * 0.55));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1] ?? ENEMIES[0];
}

export function rollBoss(floor: number): EnemyDef {
  const idx = Math.min(BOSSES.length - 1, Math.max(0, floor - 1));
  return BOSSES[idx];
}

export interface SpawnedEnemy {
  def: EnemyDef;
  level: number;
  threat: Threat;
  /** Итоговый боевой тип после ограничений рода. */
  mtype: MonsterType;
  passive: EnemyPassive | null;
  moves: EnemyMove[];
  effects: GearEffectId[];
  effectPower: Partial<Record<GearEffectId, number>>;
  hp: number;
  ap: number;
  atk: [number, number];
  armor: number;
  gold: [number, number];
  xp: number;
}

const SPECIAL_MOVES: EnemyMove[] = ["wound", "curse", "drain", "sunder", "bell_stun"];

/** Печати (немота, забвение, оковы) — только у стражей лестниц и катастроф. */
export const SEAL_MOVES: EnemyMove[] = ["seal_items", "seal_skills", "seal_attack"];

/** Кому положены печати: боссу и катастрофе. У обычного монстра и «ужаса» их нет. */
export function mayHaveSeals(isBoss: boolean, threat: Threat): boolean {
  return isBoss || threat === "catastrophe";
}

/** Спавн монстра: уровень (этаж ±1, на первом этаже возможен 0), угроза (80/15/5). */
export function spawnEnemy(floor: number, isBoss = false, rng: () => number = Math.random): SpawnedEnemy {
  const def = isBoss ? rollBoss(floor) : rollEnemy(floor, rng);
  const threat: Threat = isBoss ? "catastrophe" : rollThreat(rng);
  const level = isBoss ? floor : rollMonsterLevel(floor, rng);
  const meta = THREAT_META[threat];

  /* Тип задаёт профиль: сильные крепче и бьют тяжелее, ловкие уклоняются и
     получают лишний ход, умные держат урон на приёмах. Род ограничивает тип:
     конструкт бывает только сильным. */
  const mtype = coerceMonsterType(def.race, def.type);
  const typeMeta = MONSTER_TYPE_META[mtype];

  // Шаг усиления падает на 0.05 за уровень, но не ниже ×1.05 (кроме ходов).
  const levelMult = enemyLevelMult(level);
  const hpMult = levelMult * (isBoss ? 1 : meta.hpMult) * typeMeta.hpMult;
  const atkMult = levelMult * (isBoss ? 1 : meta.atkMult) * typeMeta.atkMult;

  /* Приёмы рода (запугивание, мрак, холодное касание, сила ада) есть у каждой твари. */
  const moves: EnemyMove[] = [...def.moves, ...raceBonusMoves(def.race)];
  if (!isBoss && threat !== "normal") {
    const need = threat === "catastrophe" ? 2 : 1;
    const pool = SPECIAL_MOVES.filter((mv) => !moves.includes(mv));
    while (pool.length && moves.filter((mv) => SPECIAL_MOVES.includes(mv)).length < need) {
      moves.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
  }

  const passiveId = isBoss
    ? def.passiveId
    : threat === "catastrophe"
      ? pick(Object.values(ENEMY_PASSIVES), rng).id
      : undefined;
  const passive = passiveId ? ENEMY_PASSIVES[passiveId] ?? null : null;
  const apBonus = passive?.id === "frenzy" ? 1 : 0;
  const threatXp = isBoss ? 1.6 : threat === "horror" ? 1.35 : threat === "catastrophe" ? 1.8 : 1;
  const effectCount = isBoss ? Math.max(1, floor) : threat === "catastrophe" ? 2 : 0;
  const effects = rollEnemyEffects(def, level, effectCount, rng);
  if (mayHaveSeals(isBoss, threat)) {
    /* Одна печать на тварь, и только та, которой у неё ещё нет. */
    const free = SEAL_MOVES.filter((mv) => !moves.includes(mv));
    if (free.length) moves.push(free[Math.floor(rng() * free.length)]);
  } else {
    /* Правило важнее данных: если обычной твари печать прописали в бестиарии,
       на поле она её не получит. */
    for (let k = moves.length - 1; k >= 0; k--) {
      if (SEAL_MOVES.includes(moves[k])) moves.splice(k, 1);
    }
  }

  const apBase = def.ap + apBonus + (effects.includes("ap") ? effectMagnitude("ap", level) : 0) +
    typeMeta.apDelta + raceApDelta(def.race);

  return {
    def,
    level,
    threat,
    mtype,
    passive,
    moves,
    effects,
    effectPower: enemyEffectPower(effects, level),
    hp: Math.max(1, Math.round(def.hp * hpMult)),
    ap: Math.max(1, Math.min(10, apBase)),
    atk: [
      Math.max(1, Math.round(def.atk[0] * atkMult)),
      Math.max(2, Math.round(def.atk[1] * atkMult)),
    ],
    /* Броня: уровень плюс прибавка типа (у ловких она отрицательная). */
    armor: Math.max(0, Math.round(def.armor * levelMult) + typeMeta.armorDelta),
    gold: [
      Math.round(def.gold[0] * (1 + (floor - 1) * 0.5)),
      Math.round(def.gold[1] * (1 + (floor - 1) * 0.5)),
    ],
    xp: Math.max(1, Math.round(def.xp * Math.max(0.8, 1 + 0.12 * (level - 1)) * threatXp)),
  };
}

export function rollConsumableLoot(floor: number, count: number): string[] {
  const table: [string, number][] = [
    ["moss", 13],
    ["bone", 12],
    ["fire", 12],
    ["tear", 6],
    ["potion_s", 14],
    ["antidote", 8],
    ["rage", 6],
    ["throwing_knife", 8],
    ["poison_dart", 7],
    ["smoke_bomb", 5],
    ["blast_bomb", floor >= 2 ? 5 : 2],
    ["fear_vial", 3],
    ["potion_l", floor >= 2 ? 7 : 3],
    ["scroll_spark", 8],
    ["scroll_fire", 7],
    ["scroll_heal", 6],
    ["scroll_shadow", floor >= 2 ? 4 : 2],
    ["scroll_frost", floor >= 2 ? 5 : 2],
    ["scroll_bolt", floor >= 3 ? 5 : 1],
    /* новые припасы и реагенты */
    ["potion_haste", 6],
    ["potion_stone", floor >= 2 ? 6 : 3],
    ["scroll_terror", 5],
    ["scroll_snare", floor >= 2 ? 5 : 2],
    ["acid_vial", 6],
    ["holy_water", 5],
    ["bomb_flash", 4],
    ["dispel_powder", floor >= 2 ? 6 : 0],
    ["scroll_dispel", floor >= 3 ? 5 : 0],
    ["powder", 9],
    ["cloth", 8],
    ["root", 9],
    ["herb", 9],
    ["silk", floor >= 2 ? 6 : 3],
    ["fang", floor >= 2 ? 6 : 3],
    ["gland", 4],
    ["ember", floor >= 3 ? 5 : 2],
    ["serrated_knife", floor >= 2 ? 6 : 0],
    ["frost_bomb", floor >= 3 ? 5 : 0],
    ["blight_powder", floor >= 4 ? 5 : 0],
    ["wither_dust", floor >= 5 ? 4 : 0],
  ].filter(([id, w]) => (w as number) > 0 && (ITEMS[id as string]?.use ? supplyLevel(id as string) <= floor : true)) as [string, number][];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = table.reduce((s, t) => s + t[1], 0);
    let r = Math.random() * total;
    for (const [id, w] of table) {
      r -= w;
      if (r <= 0) {
        out.push(id);
        break;
      }
    }
  }
  return out;
}

/**
 * Снаряжение из подземелья: сундук, событие карты или трофей босса.
 * Качество берётся из переданной таблицы (сундук / босс), изношенность — подземная:
 * нового не бывает, 75% изношенное и 25% ношенное.
 * Уровень вещи равен уровню монстра; у сундука остаётся уровнем модели.
 */
export function rollGearDrop(
  floor: number,
  weights: Record<GearItem["rarity"], number> = CHEST_RARITY_WEIGHTS,
  monsterLevel?: number,
  rng: () => number = Math.random,
): GearItem {
  const pool = Object.values(GEAR_BASES).filter((g) => g.minFloor <= floor + 1);
  const base = pick(pool.length ? pool : Object.values(GEAR_BASES), rng);
  return createGearItem({
    baseId: base.id,
    floor,
    level: monsterLevel === undefined ? undefined : Math.max(1, Math.min(10, Math.floor(monsterLevel))),
    rarityWeights: weights,
    wear: rollDungeonWear(rng),
    identified: false,
    rng,
  });
}

function clone(b: BattleState): BattleState {
  return {
    ...b,
    enemy: { ...b.enemy, statuses: { ...b.enemy.statuses }, moves: [...b.enemy.moves] },
    p: {
      ...b.p,
      epicCds: { ...b.p.epicCds },
      chanceLayers: Object.fromEntries(
        Object.entries(b.p.chanceLayers).map(([k, v]) => [k, { stats: [...v.stats], items: [...v.items], effects: [...v.effects] }]),
      ) as Record<ChanceKey, ChanceLayers>,
      gearEffects: [...b.p.gearEffects],
      gearPassives: [...b.p.gearPassives],
      effectPower: { ...b.p.effectPower },
      passivePower: Object.fromEntries(Object.entries(b.p.passivePower).map(([k, v]) => [k, { ...v }])),
      rareAffixPower: Object.fromEntries(Object.entries(b.p.rareAffixPower).map(([k, v]) => [k, { ...v }])),
      legendaryPower: Object.fromEntries(Object.entries(b.p.legendaryPower).map(([k, v]) => [k, { ...v }])),
      epicSkillLevels: { ...b.p.epicSkillLevels },
      passives: [...b.p.passives],
      statuses: { ...b.p.statuses },
    },
    bag: { ...b.bag },
    log: b.log.slice(-70),
    queue: [...b.queue],
    loot: {
      ...b.loot,
      items: [...b.loot.items],
      gear: [...b.loot.gear],
    },
  };
}

function push(b: BattleState, text: string, kind: LogLine["kind"]) {
  b.log = [...b.log.slice(-69), { id: (b.log[b.log.length - 1]?.id ?? 0) + 1, text, kind }];
}

function flash(b: BattleState, target: "p" | "e", kind: "hit" | "guard" | "miss" | "heal", amount: number) {
  b.flash = { id: ++flashSeq, target, kind, amount };
}

export function newBattle(pl: Player, floor: number, isBoss = false, biome: BiomeId = "classic", torchTurns = 0, initialBurning = 0): BattleState {
  const d = derived(pl);
  const s = spawnEnemy(floor, isBoss);
  const def = s.def;
  const firstRoundAp = d.ap + d.firstRoundApBonus +
    (pl.passives.includes("first_blood") ? 1 : 0) +
    (pl.passives.includes("arch_assassin_5") ? 1 : 0);

  const b: BattleState = {
    floor,
    biome: normalizeBiome(biome),
    torchTurns: Math.max(0, torchTurns),
    isBoss,
    enemy: {
      def,
      level: s.level,
      threat: s.threat,
      mtype: s.mtype,
      hitsTaken: 0,
      furyUsed: false,
      fury: 0,
      depleted: 0,
      passive: s.passive,
      moves: s.moves,
      effects: s.effects,
      effectPower: s.effectPower,
      hp: s.hp,
      maxHp: s.hp,
      ap: s.ap,
      atk: s.atk,
      armor: s.armor,
      gold: s.gold,
      xp: s.xp,
      statuses: { chill: 0, bleed: 0, poison: 0, fear: 0, stunAp: 0, blight: 0, wither: 0, burning: 0, burn: 0, curse: 0, cursePower: 30, sundered: 0 },
      guard: false,
      forceGuard: 0,
    lastMiss: false,
    },
    p: {
      hp: Math.max(1, pl.hp),
      maxHp: d.maxHp,
      level: Math.max(1, pl.level),
      armor: d.armor,
      evade: d.evade,
      ap: d.ap,
      firstRoundApBonus: d.firstRoundApBonus,
      stats: { ...pl.stats },
      passives: [...pl.passives],
      hit: d.hit,
      critChance: d.critChance,
      critDamage: d.critDamage,
      tenacity: d.tenacity,
      magicResist: d.magicResist,
      fortify: d.fortify,
      chanceLayers: d.chanceLayers,
      weaponName: d.weaponName,
      weaponSkill: d.weaponSkill,
      weaponCd: 0,
      epicSkills: d.epicSkills,
      epicCds: {},
      rareAffixes: d.rareAffixes,
      legendaryPassives: d.legendaryPassives,
      gearEffects: d.gearEffects,
      gearPassives: d.gearPassives,
      effectPower: { ...d.effectPower },
      passivePower: Object.fromEntries(Object.entries(d.passivePower).map(([k, v]) => [k, { ...v }])),
      rareAffixPower: Object.fromEntries(Object.entries(d.rareAffixPower).map(([k, v]) => [k, { ...v }])),
      legendaryPower: Object.fromEntries(Object.entries(d.legendaryPower).map(([k, v]) => [k, { ...v }])),
      epicSkillLevels: { ...d.epicSkillLevels },
      archetype: d.archetype,
      gearHands: d.gearHands,
      gearArchetype: d.gearArchetype,
      intDiscount: d.intDiscount,
      immortalUsed: false,
      statuses: {
        wound: pl.statuses.wound,
        curse: pl.statuses.curse,
        cursePower: pl.statuses.cursePower,
        poison: pl.statuses.poison,
        rage: 0,
        sundered: 0,
        stunAp: 0,
        smoke: 0,
        haste: 0,
        stone: 0,
        ironTonic: 0,
        bloodRage: 0,
        quickblade: 0,
        pactElixir: 0,
        fullGuard: 0,
        tempArmor: 0,
        dodgeNext: 0,
        shadowStep: 0,
        burning: normalizeBiome(biome) === "fire" ? Math.max(0, initialBurning) : 0,
        burn: 0,
        chill: pl.statuses.chill ?? 0,
        fear: pl.statuses.fear ?? 0,
        wither: pl.statuses.wither ?? 0,
        noHeal: 0,
        darkness: 0,
        sealItems: 0,
        sealSkills: 0,
        sealAttack: 0,
      },
      guard: false,
      firstAttackDone: false,
    },
    bag: { ...pl.bag },
    queue: buildQueue(firstRoundAp, s.ap),
    idx: 0,
    round: 1,
    log: [],
    over: null,
    fleeRate: 0.7,
    loot: { gold: 0, items: [], gear: [], xp: s.xp },
    flash: null,
  };

  if (isBoss) {
    push(b, `БОСС: ${def.name} преграждает спуск! Уровень ${s.level}, ходов: ${s.ap}. Сопротивление эффектам 25%.`, "sys");
  } else {
    const threatName = THREAT_META[s.threat].name;
    push(b, `${def.name} выходит из темноты. Уровень ${s.level}, угроза: ${threatName}. Ходов: ${s.ap}.`, "sys");
  }
  if (s.effects.length) {
    push(b, `Эффекты противника: ${s.effects.map((id) => GEAR_EFFECTS[id]?.name ?? id).join(", ")}.`, "sys");
  }
  if (s.passive) {
    push(b, `Пассивный эффект: ${s.passive.name} — ${s.passive.desc}`, "sys");
  }
  beginTurn(b);
  return b;
}

const hasPassive = (b: BattleState, id: string) => b.p.passives.includes(id);
const rarePower = (b: BattleState, id: RareAffixId, key: string) => b.p.rareAffixPower[id]?.[key] ?? 0;
const hasLeg = (b: BattleState, id: LegendaryPassiveId) => b.p.legendaryPassives.includes(id);
const legPower = (b: BattleState, id: LegendaryPassiveId, key: string) => b.p.legendaryPower[id]?.[key] ?? 0;
const effectPower = (b: BattleState, id: GearEffectId) => b.p.effectPower[id] ?? 0;
const hasGearPassive = (b: BattleState, id: GearPassiveId) => b.p.gearPassives.includes(id);
const passivePower = (b: BattleState, id: GearPassiveId, key: string) => b.p.passivePower[id]?.[key] ?? 0;

function missingHpRatio(b: BattleState) {
  return Math.max(0, 1 - b.p.hp / Math.max(1, b.p.maxHp));
}
function enemyMissingRatio(b: BattleState) {
  return Math.max(0, 1 - b.enemy.hp / Math.max(1, b.enemy.maxHp));
}
function enemyDebuffCount(b: BattleState) {
  const s = b.enemy.statuses;
  return (s.chill > 0 ? 1 : 0) + (s.bleed > 0 ? 1 : 0) + (s.poison > 0 ? 1 : 0) + (s.fear > 0 ? 1 : 0) + (s.stunAp > 0 ? 1 : 0) + (s.blight > 0 ? 1 : 0) + (s.wither > 0 ? 1 : 0) + (s.burn > 0 ? 1 : 0) + (s.curse > 0 ? 1 : 0);
}
function techValue(ws: WeaponSkillDef, base: number, precision = 1): number {
  return scaleByLevel(base, ws.level ?? 1, precision);
}
function skillCd(b: BattleState, base: number) {
  const reduction = effectPower(b, "skill_cd") + (hasPassive(b, "arch_warlock_5") ? 1 : 0) + passivePower(b, "warlock_pact", "cd");
  return Math.max(1, base - reduction);
}
function skillScaleBonus(b: BattleState) {
  return effectPower(b, "skill_scale") + (hasPassive(b, "arch_warlock_10") ? 0.8 : 0);
}
function skillDamageMult(b: BattleState) {
  return 1 + effectPower(b, "skill_damage") / 100 + passivePower(b, "warlock_pact", "skillDamage") / 100 +
    (hasPassive(b, "arch_warlock_5") ? 0.20 : 0) + (b.p.statuses.pactElixir > 0 ? 0.25 : 0) +
    (b.p.stats.int * effectPower(b, "wisdom")) / 100;
}
/** База приёмов и свитков: 10 + 2×ИНТ. Коэффициент задаёт конкретный приём. */
export function techniqueDamage(int: number, coefficient = 1): number {
  return statTechniqueDamage(int) * coefficient;
}
function rageBonus(b: BattleState): number {
  const steps = Math.min(10, Math.floor(missingHpRatio(b) * 10));
  return (effectPower(b, "rage") / 100) * steps + (b.p.statuses.rage > 0 ? 0.10 * steps : 0);
}
function statusRounds(b: BattleState, base: number) {
  return base + effectPower(b, "status_duration") + passivePower(b, "time_warp", "duration") +
    (hasPassive(b, "arch_warlock_10") ? 2 : 0);
}
function playerResistChance(b: BattleState) {
  return combatChance(b.p.chanceLayers.tenacity, hasPassive(b, "stone_skin") ? [0.15] : []);
}
function tryResist(b: BattleState, label: string) {
  if (Math.random() < playerResistChance(b)) {
    push(b, `Стойкость отражает ${label}.`, "p");
    return true;
  }
  return false;
}
function eEffect(b: BattleState, id: GearEffectId): number {
  return b.enemy.effectPower?.[id] ?? 0;
}
function eChance(b: BattleState, id: GearEffectId): number {
  return enemyChance(b.enemy.effects, b.enemy.level, id);
}
/**
 * Истощение: пока счётчик больше нуля, положительные эффекты врага не работают.
 * Речь только об эффектах — броня, урон, ходы, стойка и врождённые свойства
 * породы остаются при нём.
 */
function effectsDepleted(b: BattleState): boolean {
  return (b.enemy.depleted ?? 0) > 0;
}

/** Уклонение твари: тип плюс род, всегда от текущего определения. */
function enemyEvade(b: BattleState): number {
  return monsterEvade(b.enemy.def.race, b.enemy.mtype);
}

function bossResists(b: BattleState): boolean {
  if (!b.isBoss) return false;
  if (Math.random() < BOSS_EFFECT_RESIST) {
    push(b, `${b.enemy.def.name} отражает эффект (сопротивление босса 25%).`, "e");
    return true;
  }
  return false;
}
function applyEnemyStatus(b: BattleState, key: "chill" | "bleed" | "poison" | "fear" | "blight" | "wither" | "curse" | "burn", rounds: number) {
  const immuneKeys: Record<string, "poison" | "bleed" | "fear"> = { poison: "poison", bleed: "bleed", fear: "fear" };
  const immuneKey = immuneKeys[key];
  if (immuneKey && raceImmuneTo(b.enemy.def.race, immuneKey)) {
    push(b, `${b.enemy.def.name} невосприимчив к этому эффекту (${MONSTER_RACE_META[b.enemy.def.race].name.toLowerCase()}).`, "sys");
    return;
  }
  /* Дракон устойчив ко всем эффектам: половина наложений просто не держится. */
  const raceResist = raceEffectResist(b.enemy.def.race);
  if (raceResist > 0 && Math.random() < raceResist) {
    push(b, `${b.enemy.def.name} стряхивает эффект (сопротивление ${Math.round(raceResist * 100)}%).`, "e");
    return;
  }
  if (bossResists(b)) return;
  const resist = effectsDepleted(b) ? 0 : eChance(b, "resist");
  if (resist > 0 && Math.random() < resist) {
    push(b, `${b.enemy.def.name} сопротивляется эффекту.`, "e");
    return;
  }
  b.enemy.statuses[key] = Math.max(b.enemy.statuses[key], statusRounds(b, rounds));
}
/** Свойства оружия, которые срабатывают прямо от удара: кровотечение, яд, раскол. */
function weaponHitEffects(b: BattleState) {
  if (b.enemy.hp <= 0) return;
  const chanceOf = (id: GearEffectId) => Math.min(0.95, effectPower(b, id) / 100);
  const bleedChance = chanceOf("bleed");
  if (bleedChance > 0 && Math.random() < bleedChance) {
    applyEnemyStatus(b, "bleed", 3);
    if (b.enemy.statuses.bleed > 0) push(b, `${b.enemy.def.name} истекает кровью от раны.`, "p");
  }
  const poisonChance = chanceOf("poison_damage");
  if (b.enemy.hp > 0 && poisonChance > 0 && Math.random() < poisonChance) {
    applyEnemyStatus(b, "poison", 3);
    if (b.enemy.statuses.poison > 0) push(b, `Яд с клинка разъедает ${b.enemy.def.name}.`, "p");
  }
  const sunderChance = chanceOf("sunder");
  if (b.enemy.hp > 0 && sunderChance > 0 && b.enemy.armor > 0 && !bossResists(b) && Math.random() < sunderChance) {
    b.enemy.armor = Math.max(0, b.enemy.armor - 1);
    push(b, `Раскол: броня ${b.enemy.def.name} треснула (осталось ${b.enemy.armor}).`, "p");
  }
}

function healEnemy(b: BattleState, amount: number): number {
  if (effectsDepleted(b)) {
    push(b, `${b.enemy.def.name} не может лечиться: истощение (ещё ${b.enemy.depleted} ход.).`, "e");
    return 0;
  }
  if (raceCannotHeal(b.enemy.def.race)) {
    push(b, `${b.enemy.def.name} не восстанавливает здоровье: конструкт не поддаётся лечению.`, "e");
    return 0;
  }
  if (b.enemy.statuses.wither > 0) {
    const dmg = Math.max(1, Math.round(amount * (1 - eChance(b, "magic_resist"))));
    b.enemy.hp = Math.max(0, b.enemy.hp - dmg);
    push(b, `Увядание обращает лечение ${b.enemy.def.name} в ${dmg} магического урона.`, "p");
    return 0;
  }
  const mult = b.enemy.statuses.chill > 0 ? CHILL_HEAL_MULT : 1;
  const requested = Math.max(0, Math.round(amount * mult));
  const heal = biomeHealingAmount(b.biome, requested);
  const actual = Math.min(b.enemy.maxHp - b.enemy.hp, heal);
  b.enemy.hp += actual;
  return actual;
}

/** Единая точка лечения игрока: болото режет всё, кроме зелий. Возвращает реально восстановленные ОЗ. */
function healPlayer(b: BattleState, amount: number, isPotion = false): number {
  if (b.p.statuses.noHeal > 0) {
    push(b, `Холодное касание глушит жизнь: лечение не действует (ещё ${b.p.statuses.noHeal} ход.).`, "e");
    return 0;
  }
  if (b.p.statuses.wither > 0) {
    const dmg = Math.max(1, Math.round(amount * (1 - combatChance(b.p.chanceLayers.magicResist))));
    b.p.hp = Math.max(0, b.p.hp - dmg);
    push(b, `Увядание обращает лечение в ${dmg} магического урона.`, "e");
    return 0;
  }
  const mult = b.p.statuses.chill > 0 ? CHILL_HEAL_MULT : 1;
  const heal = biomeHealingAmount(b.biome, Math.round(amount * mult), isPotion);
  const actual = Math.min(b.p.maxHp - b.p.hp, heal);
  b.p.hp += actual;
  return actual;
}
function grantDodgeAction(b: BattleState) {
  const chance = Math.min(1, effectPower(b, "dodge_action") / 100 + passivePower(b, "ninja_phantom", "dodge") / 100);
  if (hasPassive(b, "arch_ninja_10")) {
    b.p.statuses.shadowStep += 1;
    push(b, "Пустое тело: уклонение открывает +1 ход в следующем раунде.", "p");
  } else if (chance > 0 && Math.random() < chance) {
    b.p.statuses.shadowStep += 1;
    push(b, "Шаг в тень: в следующем раунде +1 ход.", "p");
  }
}

function calcWeaponRoll(b: BattleState, mult = 1, bonusFlat = 0, opts: { skill?: boolean; forceCrit?: boolean; multi?: boolean } = {}) {
  const [lo, hi] = b.p.hit;
  let d = randInt(lo, hi) + statDamage(b.p.stats.str) + bonusFlat;

  /* Пассивное раскрытие техники оружия при достаточном Интеллекте */
  const ws = b.p.weaponSkill;
  if (ws && !opts.multi && b.p.stats.int >= Math.max(1, ws.intReq - b.p.intDiscount)) {
    d += Math.round(techniqueDamage(b.p.stats.int, ws.scaleMult * 0.35));
  }

  if (hasPassive(b, "heavy_hand")) d += 3;
  d += rarePower(b, "might", "damage");

  let damageMult = 1;
  const missing = missingHpRatio(b);
  const enemyMissing = enemyMissingRatio(b);
  damageMult += rageBonus(b);
  damageMult += (b.p.stats.str * effectPower(b, "might")) / 100;
  damageMult += (effectPower(b, "missing_hp_damage") / 100) * Math.min(10, Math.floor(missing * 10));
  damageMult += (effectPower(b, "enemy_missing_damage") / 100) * Math.min(10, Math.floor(enemyMissing * 10));
  if (hasPassive(b, "arch_barbarian_5")) {
    damageMult += Math.floor(missing * 10) * 0.04;
    if (b.p.gearHands === 2) damageMult += 0.25;
  }
  if (hasPassive(b, "arch_barbarian_10") && enemyMissing >= 0.5) damageMult += 0.35;
  if (hasGearPassive(b, "barbarian_rage") && b.p.hp < b.p.maxHp * 0.5) damageMult += passivePower(b, "barbarian_rage", "damage") / 100;
  if (b.p.gearHands === 2) damageMult += effectPower(b, "two_hand_damage") / 100;
  const armorBonus = effectPower(b, "armor_damage") / 100 + (hasPassive(b, "arch_bulwark_10") ? 0.5 : 0);
  if (armorBonus > 0) d += Math.round(b.p.armor * armorBonus);
  if (b.round <= 2) {
    damageMult += effectPower(b, "first_strike") / 100;
    if (hasPassive(b, "arch_assassin_5")) damageMult += 0.0;
  }
  const debuffs = enemyDebuffCount(b);
  damageMult += (effectPower(b, "debuff_damage") / 100) * Math.min(4, debuffs);
  if (hasPassive(b, "arch_ninja_10")) damageMult += Math.min(0.4, debuffs * 0.10);
  if (opts.skill) damageMult *= skillDamageMult(b);

  d *= damageMult;
  if (b.p.statuses.curse > 0) d = Math.round(d * (1 - (b.p.statuses.cursePower ?? 30) / 100));
  if (hasPassive(b, "relentless") && b.p.hp < b.p.maxHp * 0.35) d = Math.round(d * 1.5);
  if (hasLeg(b, "executioner") && b.enemy.hp <= b.enemy.maxHp * 0.5) d = Math.round(d * (1 + legPower(b, "executioner", "damage") / 100));

  const combatCrit: number[] = [];
  if (b.round <= 2 && hasPassive(b, "arch_assassin_5")) combatCrit.push(0.25);
  if (b.round <= 2 && hasGearPassive(b, "assassin_shadow")) combatCrit.push(passivePower(b, "assassin_shadow", "crit") / 100);
  if (b.p.statuses.quickblade > 0) combatCrit.push(0.25);
  const critChance = combatChance(b.p.chanceLayers.crit, combatCrit);
  let critMult = b.p.critDamage;
  if (b.round <= 2 && hasPassive(b, "arch_assassin_5")) critMult += 0.5;
  if (b.round <= 2 && hasGearPassive(b, "assassin_shadow")) critMult += passivePower(b, "assassin_shadow", "critMult") / 100;
  if (b.p.statuses.quickblade > 0) critMult += 0.5;
  let crit = false;
  const forceCrit = opts.forceCrit || (!b.p.firstAttackDone && hasPassive(b, "arch_assassin_10"));
  if (forceCrit || (critChance > 0 && Math.random() < critChance)) {
    d *= critMult;
    crit = true;
  }
  return { d: Math.max(1, Math.round(d * mult * biomeStrikeMult(b.biome))), crit };
}

function applyVamp(b: BattleState, dealt: number, extraRatio = 0, source: "weapon" | "skill" | "consumable" | "scroll" | "any" = "any", kind: "phys" | "magic" | "true" = "phys") {
  let ratio = rarePower(b, "vamp", "ratio") / 100 + extraRatio;
  if (kind === "phys") ratio += effectPower(b, "vamp") / 100;
  else ratio += effectPower(b, "magic_vamp") / 100;
  if (source === "weapon" || source === "skill" || source === "any") ratio += effectPower(b, "vamp_str") / 100;
  if (source === "weapon" || source === "skill") {
    if (b.p.statuses.bloodRage > 0) ratio += 0.15;
    if (hasPassive(b, "arch_barbarian_5")) ratio += 0.08;
    if (hasGearPassive(b, "barbarian_rage")) ratio += passivePower(b, "barbarian_rage", "vamp") / 100;
  }
  if (source === "skill") {
    ratio += effectPower(b, "skill_vamp") / 100;
    if (hasPassive(b, "arch_warlock_5")) ratio += 0.10;
    if (hasGearPassive(b, "warlock_pact")) ratio += passivePower(b, "warlock_pact", "vamp") / 100;
  }
  if (source === "consumable") {
    ratio += effectPower(b, "consumable_vamp") / 100;
    if (hasPassive(b, "arch_ninja_5")) ratio += 0.08;
    if (hasGearPassive(b, "ninja_phantom")) ratio += passivePower(b, "ninja_phantom", "vamp") / 100;
  }
  if (source === "scroll") {
    ratio += effectPower(b, "scroll_vamp") / 100;
    if (hasPassive(b, "arch_sage_5")) ratio += 0.08;
  }
  if (ratio <= 0 || dealt <= 0) return;
  const heal = healPlayer(b, Math.max(1, Math.round(dealt * ratio)));
  if (heal > 0) push(b, `Похищение жизни: +${heal} здоровья.`, "p");
}

function hitEnemy(
  b: BattleState,
  raw: number,
  kind: "phys" | "magic" | "true",
  note = "",
  strike = kind === "phys",
): number {
  const darkMiss = (b.torchTurns ?? 0) > 0 ? 0 : biomeMissChance(b.biome);
  if (strike && darkMiss > 0 && Math.random() < darkMiss) {
    flash(b, "e", "miss", 0);
    push(b, `Мрак скрывает цель: удар проходит мимо.${note}`, "sys");
    return 0;
  }
  /* «Мрак» вампира: до конца раунда половина ударов героя уходит в пустоту. */
  if (strike && b.p.statuses.darkness > 0 && Math.random() < 0.5) {
    flash(b, "e", "miss", 0);
    push(b, `Мрак вампира съедает удар: промах.${note}`, "e");
    return 0;
  }
  /* Базовое уклонение — параметр породы и телосложения, оно остаётся;
     уклонение от эффектов при истощении гаснет. */
  const effectEvade = effectsDepleted(b) ? 0 : eChance(b, "evade");
  const evade = kind === "phys" ? effectEvade + enemyEvade(b) : 0;
  if (evade > 0 && Math.random() < evade) {
    flash(b, "e", "miss", 0);
    push(b, `${b.enemy.def.name} уклоняется от удара.${note}`, "e");
    return 0;
  }
  let d = raw;
  if (hasLeg(b, "executioner") && kind !== "phys" && b.enemy.hp <= b.enemy.maxHp * 0.5) {
    d = Math.round(d * (1 + legPower(b, "executioner", "damage") / 100));
  }
  if (kind === "phys") {
    const pierce = rarePower(b, "pierce", "armor");
    const effArmor = Math.max(0, b.enemy.armor - pierce);
    d -= effArmor;
    /* Каменная шкура и укрепление рода — врождённые свойства породы,
       а не эффекты: истощение их не снимает. */
    if (b.enemy.passive?.id === "stone_hide") d = Math.round(d * 0.75);
    const fortify = raceFortify(b.enemy.def.race);
    if (fortify > 0) d = Math.round(d * (1 - fortify));
    if (!effectsDepleted(b)) d = Math.round(d * (1 - eChance(b, "fortify")));
  } else if (!effectsDepleted(b)) {
    d = Math.round(d * (1 - eChance(b, "magic_resist")));
  }
  /* Стойка — действие, а не эффект: она режет урон и при истощении. */
  if (b.enemy.guard) {
    d = Math.floor(d / 2);
    const guardBonus = eEffect(b, "guard_bonus") / 100 + raceGuardBonus(b.enemy.def.race);
    d = Math.round(d * Math.max(0.2, 1 - guardBonus));
  }
  if (!effectsDepleted(b)) d -= eEffect(b, "damage_resist");
  d = Math.max(1, d);
  b.enemy.hp -= d;
  flash(b, "e", "hit", d);
  push(b, `${b.enemy.def.name} получает ${d} урона.${note}`, "p");
  /* Шипы врага ранят только того, кто бьёт вплотную: обычная атака, второй
     удар, контратака и физические приёмы. Магия и «чистый» урон их не будят. */
  const thorns = !effectsDepleted(b) && kind === "phys" ? eEffect(b, "thorns") : 0;
  if (thorns > 0 && b.p.hp > 0) {
    b.p.hp -= thorns;
    push(b, `Шипы противника ранят тебя: −${thorns} ОЗ.`, "e");
  }
  /* Дракон копит ярость: после трёх твоих попаданий бьёт вдвое и залечивает раны. */
  if (b.enemy.def.race === "dragon" && b.enemy.hp > 0 && !effectsDepleted(b)) {
    b.enemy.hitsTaken += 1;
    /* Ярость приходит один раз за бой: иначе дракон просто не убивается. */
    if (!b.enemy.furyUsed && b.enemy.fury <= 0 && b.enemy.hitsTaken >= 3) {
      b.enemy.hitsTaken = 0;
      b.enemy.fury = 3;
      b.enemy.furyUsed = true;
      push(b, `${b.enemy.def.name} впадает в ярость: 3 хода двойного урона и лечения!`, "e");
    }
  }
  return d;
}

/**
 * Урон стихией: уязвимый род получает в полтора раза больше, а иммунный —
 * ничего. Стихию знают свитки, зелья и часть приёмов.
 */
function elementalHit(
  b: BattleState,
  raw: number,
  kind: "phys" | "magic" | "true",
  note: string,
  element: DamageElement | undefined,
): number {
  const mult = raceElementMult(b.enemy.def.race, element);
  if (element && mult <= 0) {
    flash(b, "e", "miss", 0);
    push(b, `${b.enemy.def.name} не получает урона от стихии (${ELEMENT_NAMES[element]}).${note}`, "sys");
    return 0;
  }
  if (element && mult > 1) {
    push(b, `Уязвимость к стихии: ${ELEMENT_NAMES[element]} бьёт в ×${mult}.`, "p");
    return hitEnemy(b, Math.round(raw * mult), kind, note);
  }
  return hitEnemy(b, raw, kind, note);
}

/** false означает, что враг промахнулся: побочные эффекты атаки тоже не срабатывают. */
function incoming(
  b: BattleState,
  raw: number,
  kind: "phys" | "magic",
  src: string,
  strike = kind === "phys",
  /** Пробивает броню, сопротивление и уклонение (холодное касание призрака). */
  ignoreDefense = false,
): boolean {
  const darkMiss = (b.torchTurns ?? 0) > 0 ? 0 : biomeMissChance(b.biome);
  if (!ignoreDefense && strike && darkMiss > 0 && Math.random() < darkMiss) {
    flash(b, "p", "miss", 0);
    push(b, `Мрак скрывает тебя: ${src} — промах.`, "sys");
    return false;
  }
  if (b.p.statuses.fullGuard > 0) {
    flash(b, "p", "guard", 0);
    push(b, `Полная защита поглощает удар (${src}).`, "p");
    return false;
  }
  if (b.p.statuses.dodgeNext > 0) {
    b.p.statuses.dodgeNext--;
    flash(b, "p", "miss", 0);
    push(b, `Пустой шаг: атака (${src}) полностью ускользает.`, "p");
    grantDodgeAction(b);
    return false;
  }
  if (b.p.statuses.smoke > 0) {
    b.p.statuses.smoke--;
    flash(b, "p", "miss", 0);
    push(b, `Дымовая завеса скрыла тебя от атаки. Осталось укрытий: ${b.p.statuses.smoke}.`, "p");
    grantDodgeAction(b);
    return false;
  }
  if (!ignoreDefense && kind === "phys" && Math.random() < combatChance(b.p.chanceLayers.evade)) {
    flash(b, "p", "miss", 0);
    push(b, `Ты уходишь с линии удара — промах!`, "e");
    grantDodgeAction(b);
    return false;
  }
  let d = raw;
  if (strike) d = Math.round(d * biomeStrikeMult(b.biome));
  const effArmor = Math.max(0, b.p.armor + b.p.statuses.tempArmor + (b.p.statuses.ironTonic > 0 ? 4 : 0) - b.p.statuses.sundered);
  if (kind === "phys") {
    if (!ignoreDefense) {
      d -= effArmor;
      d = Math.round(d * (1 - combatChance(b.p.chanceLayers.fortify)));
    }
  } else if (!ignoreDefense) {
    d = Math.round(d * (1 - combatChance(b.p.chanceLayers.magicResist)));
  }
  if (!ignoreDefense) d -= effectPower(b, "damage_resist");
  if (b.p.statuses.stone > 0) d = Math.round(d * 0.7);
  if (b.p.guard) d = Math.floor(d / 2);
  let guardMult = 1;
  if (b.p.guard) {
    guardMult -= effectPower(b, "guard_bonus") / 100;
    if (hasPassive(b, "arch_bulwark_5")) guardMult -= 0.15;
    if (hasGearPassive(b, "bulwark_wall")) guardMult -= passivePower(b, "bulwark_wall", "guard") / 100;
  }
  d = Math.round(d * Math.max(0.2, guardMult));
  if (hasGearPassive(b, "fortress")) d = Math.round(d * (1 - passivePower(b, "fortress", "resist") / 100));
  d = Math.max(1, d);
  b.p.hp -= d;
  flash(b, "p", b.p.guard ? "guard" : "hit", d);
  push(b, `${src} — тебе ${d} урона.`, "e");

  // Ядовитый враг отравляет игрока физическим уроном.
  if (b.enemy.passive?.id === "venom" && kind === "phys" && b.p.hp > 0 && !tryResist(b, "яд")) {
    b.p.statuses.poison = Math.max(b.p.statuses.poison, 2);
    push(b, "Яд врага попал в кровь: отравление на 2 раунда.", "e");
  }

  /* Шипы отвечают только на физическую атаку: магический выпад тварь
     проводит на расстоянии и не накалывается. */
  const thorns = kind === "phys" ? playerThorns(b) : 0;
  if (thorns > 0 && b.enemy.hp > 0) {
    b.enemy.hp = Math.max(1, b.enemy.hp - thorns);
    push(b, `Шипы возвращают ${b.enemy.def.name} ${thorns} урона.`, "p");
  }

  /* Контратака / ответный выпад */
  const counterChance = Math.min(1, effectPower(b, "counter") / 100 + passivePower(b, "dance", "counter") / 100 +
    (hasPassive(b, "arch_assassin_10") ? 0.10 : 0));
  if (b.p.hp > 0 && b.enemy.hp > 0 && counterChance > 0 && Math.random() < counterChance) {
    const { d: cd } = calcWeaponRoll(b, 0.6);
    const dealt = hitEnemy(b, cd, "phys", " [Контратака]");
    applyVamp(b, dealt, 0, "weapon");
  }

  if (b.p.hp <= 0) {
    if (hasPassive(b, "arch_bulwark_10") && !b.p.immortalUsed) {
      b.p.immortalUsed = true;
      b.p.hp = 0;
      const heal = healPlayer(b, 1);
      b.p.guard = true;
      flash(b, "p", "heal", heal);
      push(b, `Непробиваемый: смертельный удар оставил ${heal} ОЗ и включил Защиту!`, "p");
      return true;
    }
    if (hasLeg(b, "immortal_pact") && !b.p.immortalUsed) {
      b.p.immortalUsed = true;
      b.p.hp = 0;
      const heal = healPlayer(b, 18);
      b.p.guard = true;
      flash(b, "p", "heal", heal);
      push(b, `Печать бессмертия вспыхивает! Ты остаёшься на ногах с ${heal} ОЗ и в Защите.`, "p");
      return true;
    }
    b.p.hp = 0;
    b.over = "lose";
  }
  return true;
}

/** Опыт за монстра с поправкой на разницу уровней: сильнее враг — больше опыта. */
function enemyXpFor(b: BattleState): number {
  return scaledEnemyXp(b.enemy.xp, b.p.level, b.enemy.level);
}

function gainLoot(b: BattleState) {
  const e = b.enemy;
  if (b.isBoss) {
    // Боссы сохраняют прежний щедрый дроп: золото, припасы и гарантированный трофей.
    const gold = randInt(e.gold[0], e.gold[1]);
    const items = rollConsumableLoot(b.floor, 2);
    // Босс — единственный, кто может оставить легендарное: 50/10/1.
    const gear: GearItem[] = [rollGearDrop(b.floor, BOSS_RARITY_WEIGHTS, e.level)];
    b.loot = { gold, items, gear, xp: enemyXpFor(b) };
    return;
  }

  // Обычный монстр: 30% ничего, 30% золото, 20% реагенты, 15% припасы, 5% снаряжение.
  const drop = rollEnemyLoot(e.level, b.floor, e.threat);
  b.loot = { gold: drop.gold, items: drop.items, gear: drop.gear, xp: enemyXpFor(b) };
}

/** Environmental tick at the start of the active side's turn. Called once per queue step. */
function beginTurn(b: BattleState) {
  if (b.over) return;
  const side = b.queue[b.idx];
  if (!side) return;

  if (b.biome === "ice" && side === "p") {
    b.p.hp = Math.max(0, b.p.hp - ICE_TURN_DAMAGE);
    flash(b, "p", "hit", ICE_TURN_DAMAGE);
    push(b, `Ледяные просторы: холод отнимает ${ICE_TURN_DAMAGE} здоровья в начале твоего хода.`, "sys");
  }

  /* Огненные недра жгут только в бою и только когда ходит герой:
     в свой ход монстр не получает урона от жара, а на карте горения нет вовсе. */
  if (b.biome === "fire" && side === "p") {
    b.p.statuses.burning += 1;
    const dmg = fireBurnDamage(b.p.statuses.burning);
    b.p.hp = Math.max(0, b.p.hp - dmg);
    flash(b, "p", "hit", dmg);
    push(b, `Огненные недра: горение ×${b.p.statuses.burning} отнимает ${dmg} здоровья (каждый слой +${FIRE_BURN_STEP}).`, "sys");
    b.enemy.statuses.burning += 1;
    const eDmg = fireBurnDamage(b.enemy.statuses.burning);
    b.enemy.hp = Math.max(0, b.enemy.hp - eDmg);
    flash(b, "e", "hit", eDmg);
    push(b, `Огненные недра: ${b.enemy.def.name} горит ×${b.enemy.statuses.burning} и теряет ${eDmg} здоровья.`, "sys");
  }

  if (b.enemy.hp <= 0) {
    b.enemy.hp = 0;
    b.over = "win";
    gainLoot(b);
    push(b, `${b.enemy.def.name} повержен! (+${enemyXpFor(b)} опыта)`, "sys");
    return;
  }
  if (b.p.hp <= 0) {
    b.p.hp = 0;
    b.over = "lose";
  }
}

function advance(b: BattleState) {
  if (b.over) return;
  //.Печати живут ровно один ход игрока: снимаются после его действия.
  if (b.queue[b.idx] === "p") {
    b.p.statuses.sealItems = Math.max(0, b.p.statuses.sealItems - 1);
    b.p.statuses.sealSkills = Math.max(0, b.p.statuses.sealSkills - 1);
    b.p.statuses.sealAttack = Math.max(0, b.p.statuses.sealAttack - 1);
  }
  const idx = b.idx + 1;
  if (idx >= b.queue.length) {
    /* конец раунда */
    if (b.p.statuses.wound > 0 && !hasLeg(b, "titan_heart")) {
      const d = statusTickDamage(b.p.maxHp, "bleed");
      b.p.hp -= d;
      push(b, `Кровотечение отнимает ${d} здоровья (5% макс. ОЗ).`, "sys");
    }
    if (b.p.statuses.poison > 0 && b.p.hp > 0) {
      const d = statusTickDamage(b.p.maxHp, "poison");
      b.p.hp -= d;
      push(b, `Яд в твоей крови отнимает ${d} здоровья (4% макс. ОЗ).`, "e");
    }
    if (b.p.statuses.burn > 0 && b.p.hp > 0) {
      const d = statusTickDamage(b.p.maxHp, "burn");
      b.p.hp -= d;
      push(b, `Горение отнимает ${d} здоровья (5% макс. ОЗ).`, "e");
    }
    if (b.p.statuses.chill > 0 && b.p.hp > 0) {
      const d = magicTickDamage(b.p.maxHp, "chill", combatChance(b.p.chanceLayers.magicResist));
      b.p.hp -= d;
      push(b, `Обморожение отнимает ${d} здоровья и режет лечение вдвое.`, "e");
    }
    if (b.p.statuses.curse > 0 && b.p.hp > 0) {
      const d = magicTickDamage(b.p.maxHp, "curse", combatChance(b.p.chanceLayers.magicResist));
      b.p.hp -= d;
      push(b, `Проклятие выжигает ${d} здоровья.`, "e");
    }
    if (b.enemy.statuses.bleed > 0 && b.enemy.hp > 0) {
      const d = statusTickDamage(b.enemy.maxHp, "bleed");
      b.enemy.hp -= d;
      push(b, `${b.enemy.def.name} истекает кровью: −${d} ОЗ (5% макс. ОЗ).`, "p");
    }
    if (b.enemy.statuses.poison > 0 && b.enemy.hp > 0) {
      const d = statusTickDamage(b.enemy.maxHp, "poison");
      b.enemy.hp -= d;
      push(b, `Яд разъедает ${b.enemy.def.name}: −${d} ОЗ (4% макс. ОЗ).`, "p");
    }
    if (b.enemy.statuses.burn > 0 && b.enemy.hp > 0) {
      const d = statusTickDamage(b.enemy.maxHp, "burn");
      b.enemy.hp -= d;
      push(b, `${b.enemy.def.name} горит: −${d} ОЗ (5% макс. ОЗ).`, "p");
    }
    if (b.enemy.statuses.chill > 0 && b.enemy.hp > 0) {
      const d = magicTickDamage(b.enemy.maxHp, "chill", eChance(b, "magic_resist"));
      b.enemy.hp -= d;
      push(b, `Обморожение отнимает ${d} ОЗ у ${b.enemy.def.name}.`, "p");
    }
    if (b.enemy.statuses.curse > 0 && b.enemy.hp > 0) {
      const d = magicTickDamage(b.enemy.maxHp, "curse", eChance(b, "magic_resist"));
      b.enemy.hp -= d;
      push(b, `Проклятие выжигает ${d} ОЗ у ${b.enemy.def.name}.`, "p");
    }
    if (b.enemy.statuses.blight > 0 && b.enemy.hp > 0) {
      const d = statusTickDamage(b.enemy.maxHp, "blight");
      b.enemy.hp -= d;
      push(b, `Порча разъедает ${b.enemy.def.name}: −${d} ОЗ.`, "p");
    }
    if (b.enemy.passive?.id === "regen" && !raceCannotHeal(b.enemy.def.race) && b.enemy.hp > 0 && b.enemy.hp < b.enemy.maxHp) {
      const heal = healEnemy(b, 4);
      push(b, `${b.enemy.def.name} затягивает раны (+${heal} ОЗ).`, "e");
    }
    const eRegen = eEffect(b, "regen");
    if (eRegen > 0 && !raceCannotHeal(b.enemy.def.race) && b.enemy.hp > 0 && b.enemy.hp < b.enemy.maxHp) {
      const heal = healEnemy(b, eRegen);
      push(b, `Эффект противника затягивает раны (+${heal} ОЗ).`, "e");
    }

    /* Ярость дракона: лечится в конце своего хода и держится три раунда. */
    if (b.enemy.fury > 0 && b.enemy.hp > 0) {
      const heal = healEnemy(b, Math.round(b.enemy.maxHp * 0.1));
      if (heal > 0) push(b, `Ярость дракона затягивает раны (+${heal} ОЗ).`, "e");
      b.enemy.fury -= 1;
      if (b.enemy.fury === 0) push(b, `${b.enemy.def.name} выдыхается: ярость угасла.`, "sys");
    }

    const regen = (hasPassive(b, "iron_will") ? 3 : 0) + rarePower(b, "regen", "heal") +
      effectPower(b, "regen") +
      (hasPassive(b, "arch_bulwark_5") ? 3 : 0) +
      passivePower(b, "bulwark_wall", "regen") +
      (b.p.statuses.ironTonic > 0 ? 4 : 0);
    if (regen > 0 && b.p.hp > 0) {
      const healed = healPlayer(b, regen);
      if (healed > 0) push(b, `Регенерация: +${healed} здоровья.`, "p");
    }

    const prevCurse = b.p.statuses.curse;
    const prevRage = b.p.statuses.rage;
    const prevWound = b.p.statuses.wound;
    const prevPoison = b.p.statuses.poison;

    b.p.statuses.wound = Math.max(0, b.p.statuses.wound - 1);
    if (!isBattleCurse(b.p.statuses.curse)) b.p.statuses.curse = Math.max(0, b.p.statuses.curse - 1);
    b.p.statuses.poison = Math.max(0, b.p.statuses.poison - 1);
    b.p.statuses.burn = Math.max(0, b.p.statuses.burn - 1);
    b.p.statuses.chill = Math.max(0, b.p.statuses.chill - 1);
    b.p.statuses.wither = Math.max(0, b.p.statuses.wither - 1);
    b.p.statuses.rage = Math.max(0, b.p.statuses.rage - 1);
    b.p.statuses.ironTonic = Math.max(0, b.p.statuses.ironTonic - 1);
    b.p.statuses.bloodRage = Math.max(0, b.p.statuses.bloodRage - 1);
    b.p.statuses.noHeal = Math.max(0, b.p.statuses.noHeal - 1);
    b.p.statuses.darkness = Math.max(0, b.p.statuses.darkness - 1);
    b.p.statuses.quickblade = Math.max(0, b.p.statuses.quickblade - 1);
    b.p.statuses.pactElixir = Math.max(0, b.p.statuses.pactElixir - 1);
    b.p.statuses.fullGuard = Math.max(0, b.p.statuses.fullGuard - 1);

    if (prevCurse > 0 && b.p.statuses.curse === 0)
      push(b, "Проклятие рассеялось! Твой урон вернулся к норме.", "sys");
    if (prevRage > 0 && b.p.statuses.rage === 0)
      push(b, "Ярость угасла: урон вернулся к обычному.", "sys");
    if (prevWound > 0 && b.p.statuses.wound === 0)
      push(b, "Раны затянулись — кровотечение остановилось.", "sys");
    if (prevPoison > 0 && b.p.statuses.poison === 0)
      push(b, "Яд вышел из крови.", "sys");

    b.enemy.statuses.chill = Math.max(0, b.enemy.statuses.chill - 1);
    b.enemy.statuses.bleed = Math.max(0, b.enemy.statuses.bleed - 1);
    b.enemy.statuses.poison = Math.max(0, b.enemy.statuses.poison - 1);
    b.enemy.statuses.blight = Math.max(0, b.enemy.statuses.blight - 1);
    b.enemy.statuses.wither = Math.max(0, b.enemy.statuses.wither - 1);
    b.enemy.statuses.burn = Math.max(0, b.enemy.statuses.burn - 1);
    b.enemy.statuses.curse = Math.max(0, b.enemy.statuses.curse - 1);
    if (b.enemy.depleted > 0) {
      b.enemy.depleted -= 1;
      if (b.enemy.depleted === 0) push(b, `Истощение спадает: ${b.enemy.def.name} снова чувствует свои эффекты.`, "e");
    }

    if (b.p.weaponCd > 0) b.p.weaponCd -= 1;
    for (const k of Object.keys(b.p.epicCds)) {
      if (b.p.epicCds[k] > 0) b.p.epicCds[k] -= 1;
    }

    b.round += 1;
    b.idx = 0;
    const hasteBonus = b.p.statuses.haste > 0 ? 1 : 0;
    const sageAp = hasPassive(b, "arch_sage_10") ? 1 : 0;
    const shadowAp = b.p.statuses.shadowStep;
    /* Дополнительных ходов не бывает больше трёх за раунд. */
    const extraAp = Math.min(MAX_EXTRA_AP, hasteBonus + sageAp + shadowAp);
    const pAp = Math.max(1, b.p.ap + extraAp);
    const eAp = Math.max(1, b.enemy.ap);
    if (hasteBonus > 0) push(b, `Зелье скорости: в этом раунде у тебя +1 ход (осталось ${b.p.statuses.haste}).`, "p");
    if (shadowAp > 0) push(b, `Шаг в тень даёт +${shadowAp} ход в этом раунде.`, "p");
    if (sageAp > 0) push(b, "Библиотека душ: +1 ход в этом раунде.", "p");
    b.p.statuses.shadowStep = 0;
    const prevHaste = b.p.statuses.haste;
    const prevStone = b.p.statuses.stone;
    b.p.statuses.haste = Math.max(0, b.p.statuses.haste - 1);
    b.p.statuses.stone = Math.max(0, b.p.statuses.stone - 1);
    if (prevHaste > 0 && b.p.statuses.haste === 0)
      push(b, "Действие зелья скорости закончилось: количество ходов вернулось к норме.", "sys");
    if (prevStone > 0 && b.p.statuses.stone === 0)
      push(b, "Каменная кожа осыпалась: входящий урон больше не снижен.", "sys");
    b.queue = buildQueue(pAp, eAp);
    push(b, `— Раунд ${b.round} —`, "sys");

    if (b.enemy.hp <= 0) {
      b.enemy.hp = 0;
      b.over = "win";
      gainLoot(b);
      return;
    }
    if (b.p.hp <= 0) {
      b.p.hp = 0;
      b.over = "lose";
      return;
    }
    beginTurn(b);
    return;
  }
  b.idx = idx;
  beginTurn(b);
}

const CREATED_SCROLLS = ["scroll_bolt", "scroll_heal", "scroll_frost", "scroll_terror"];
function createScrolls(b: BattleState, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = pick(CREATED_SCROLLS);
    b.bag[id] = (b.bag[id] ?? 0) + 1;
    out.push(ITEMS[id]?.name ?? id);
  }
  return out;
}
function castCreatedScroll(b: BattleState, name: string) {
  const id = CREATED_SCROLLS.find((x) => ITEMS[x]?.name === name);
  if (!id || !b.bag[id]) return;
  const def = ITEMS[id];
  const power = consumablePower(def, b.p.stats);
  const mult = consumableDamageMult(b, def);
  if (def.use?.type === "heal") {
    const amt = healPlayer(b, Math.round(power * mult));
    push(b, `${def.name} сразу применяется: +${amt} здоровья.`, "p");
  } else if (def.use?.type === "chill") {
    const dealt = hitEnemy(b, Math.round(power * mult), "magic", ` [${def.name}, сотворён]`);
    applyEnemyStatus(b, "chill", 3);
    applyVamp(b, dealt, 0, "scroll", "magic");
  } else if (def.use?.type === "terror") {
    b.enemy.forceGuard = Math.max(b.enemy.forceGuard, 2);
    push(b, `${def.name} сразу применяется: враг держит защиту.`, "p");
  } else {
    const dealt = hitEnemy(b, Math.round(power * mult), "true", ` [${def.name}, сотворён]`);
    applyVamp(b, dealt, 0, "scroll", "magic");
  }
  b.bag[id]--;
  if (b.bag[id] <= 0) delete b.bag[id];
}
function consumableDamageMult(b: BattleState, def: { kind: string; use?: { type: string } }) {
  const isScroll = def.kind === "scroll";
  const spellPowerMult = (hasPassive(b, "resonance") ? 1.4 : 1) * (1 + legPower(b, "archmage_blood", "spellDamage") / 100);
  let m = isScroll ? spellPowerMult : 1;
  if (isScroll) {
    m *= 1 + (b.p.stats.int * effectPower(b, "wisdom")) / 100 +
      effectPower(b, "scroll_damage") / 100 + passivePower(b, "sage_library", "scrollDamage") / 100;
    if (hasPassive(b, "arch_sage_5")) m *= 1.25;
  } else if (def.use?.type !== "heal" && def.use?.type !== "cleanse") {
    m *= 1 + (b.p.stats.agi * effectPower(b, "precision")) / 100 + effectPower(b, "consumable_damage") / 100;
    if (hasPassive(b, "arch_ninja_5")) m *= 1.2;
  }
  const debuffs = enemyDebuffCount(b);
  m *= 1 + (effectPower(b, "debuff_damage") / 100) * Math.min(4, debuffs);
  if (hasPassive(b, "arch_ninja_10")) m *= 1 + Math.min(0.4, debuffs * 0.10);
  return m;
}
function consumablePowerWithGear(b: BattleState, def: ItemDef) {
  return consumablePower(def, b.p.stats);
}

export function playerAct(b0: BattleState, a: PlayerAction): BattleState {
  if (b0.over || b0.queue[b0.idx] !== "p") return b0;
  const b = clone(b0);
  if (b.p.statuses.stunAp > 0) {
    b.p.statuses.stunAp--;
    push(b, "Оглушение: ты пропускаешь этот ход.", "e");
    advance(b);
    return b;
  }
  if (b.p.statuses.fear > 0) {
    b.p.statuses.fear--;
    b.p.guard = true;
    flash(b, "p", "guard", 0);
    push(b, "Страх сковывает волю: ты автоматически уходишь в защиту.", "e");
    advance(b);
    return b;
  }
  const previousGuard = b.p.guard;
  b.p.guard = false;

  const err = (msg: string) => {
    b.p.guard = previousGuard;
    push(b, msg, "sys");
    return b;
  };

  const spellPowerMult =
    (hasPassive(b, "resonance") ? 1.4 : 1) * (1 + legPower(b, "archmage_blood", "spellDamage") / 100);

  if (a.type === "attack" && b.p.statuses.sealAttack > 0) return err("Печать оков запрещает обычную атаку в этот ход.");
  if ((a.type === "weapon_skill" || a.type === "epic_skill") && b.p.statuses.sealSkills > 0) return err("Печать забвения запрещает приёмы в этот ход.");
  if (a.type === "item" && b.p.statuses.sealItems > 0) return err("Печать немоты запрещает расходники в этот ход.");

  switch (a.type) {
    case "attack": {
      const { d, crit } = calcWeaponRoll(b);
      const dealt = hitEnemy(b, d, "phys", crit ? " Критический удар!" : "");
      applyVamp(b, dealt, 0, "weapon");
      b.p.firstAttackDone = true;
      weaponHitEffects(b);
      if (crit && hasPassive(b, "arch_assassin_10")) {
        const heal = healPlayer(b, Math.max(1, Math.round(dealt * 0.15)));
        if (heal > 0) push(b, `Тень смерти: крит возвращает +${heal} здоровья.`, "p");
      }
      const stunChance = combatChance(b.p.chanceLayers.stun, [
        effectPower(b, "stun_chance") / 100,
        passivePower(b, "heavy_blow", "stun") / 100,
        passivePower(b, "barbarian_rage", "stun") / 100,
        hasPassive(b, "arch_barbarian_10") ? 0.15 : 0,
      ]);
      if (b.enemy.hp > 0 && stunChance > 0 && Math.random() < stunChance && !bossResists(b)) {
        b.enemy.statuses.stunAp = Math.min(2, b.enemy.statuses.stunAp + 1);
        push(b, `${b.enemy.def.name} оглушён и потеряет 1 ход в следующем раунде!`, "p");
      }
      const counterChance = Math.min(1, effectPower(b, "counter") / 100 + passivePower(b, "dance", "counter") / 100);
      if (b.enemy.hp > 0 && counterChance > 0 && Math.random() < counterChance) {
        const { d: cd } = calcWeaponRoll(b, 0.6);
        const dealt2 = hitEnemy(b, cd, "phys", " [Второй удар]");
        applyVamp(b, dealt2, 0, "weapon");
      }
      break;
    }

    case "weapon_skill": {
      const ws = b.p.weaponSkill;
      if (!ws) return err("У этого оружия нет особого приёма.");
      if (b.p.weaponCd > 0) return err(`Приём «${ws.name}» перезаряжается ещё ${b.p.weaponCd} р.`);
      const req = Math.max(1, ws.intReq - b.p.intDiscount);
      if (b.p.stats.int < req) return err(`Для приёма «${ws.name}» требуется ИНТ ${req}.`);

      const scale = ws.scaleMult + skillScaleBonus(b);
      let bonus = Math.round(techniqueDamage(b.p.stats.int, scale) * spellPowerMult);
      const eff = ws.effect;
      if (eff === "armor_damage") bonus += Math.round(b.p.armor * techValue(ws, ws.id === "bulwark_verdict" ? 0.75 : 0.5, 100));
      if (eff === "missing_hp") bonus = Math.round(bonus * (1 + Math.min(10, Math.floor(missingHpRatio(b) * 10)) * techValue(ws, 0.06, 100)));
      if (eff === "enemy_missing") bonus = Math.round(bonus * (1 + Math.min(10, Math.floor(enemyMissingRatio(b) * 10)) * techValue(ws, 0.06, 100)));
      if (eff === "debuff_damage") bonus = Math.round(bonus * (1 + Math.min(4, enemyDebuffCount(b)) * techValue(ws, 0.10, 100)));
      if (eff === "first_strike" && b.round <= 2) bonus = Math.round(bonus * techValue(ws, 2, 100));
      const trueDamage = eff === "pierce" || eff === "chill" || eff === "leech" || eff === "skill_leech";
      const magicSkill = !!ws.magic;
      const hits = eff === "double_attack" ? scaleIntegerByLevel(2, ws.level ?? 1) : 1;
      let dealtTotal = 0;
      for (let i = 0; i < hits; i++) {
        //.Multi-hit: каждый удар — отдельная обычная атака без бонуса приёма.
        const isMulti = eff === "double_attack";
        const { d, crit } = calcWeaponRoll(b, 1, isMulti ? 0 : bonus, { skill: !isMulti, multi: isMulti, forceCrit: !isMulti && eff === "guaranteed_crit" && b.round <= 2 });
        const hitKind: "phys" | "magic" | "true" = trueDamage ? "true" : magicSkill ? "magic" : "phys";
        const dealt = hitEnemy(b, d, hitKind, ` [Приём: ${ws.name}${crit ? ", КРИТ!" : ""}${hits > 1 ? ` ${i + 1}/${hits}` : ""}]`, true);
        dealtTotal += dealt;
        applyVamp(b, dealt, 0, "weapon", hitKind === "true" ? "phys" : hitKind);
        if (crit && hasPassive(b, "arch_assassin_10")) {
          healPlayer(b, Math.max(1, Math.round(dealt * 0.15)));
        }
        if (isMulti) b.p.firstAttackDone = true;
        if (isMulti && b.enemy.hp > 0) {
          const stunChance = combatChance(b.p.chanceLayers.stun, [
            effectPower(b, "stun_chance") / 100,
            passivePower(b, "heavy_blow", "stun") / 100,
            passivePower(b, "barbarian_rage", "stun") / 100,
            hasPassive(b, "arch_barbarian_10") ? 0.15 : 0,
          ]);
          if (stunChance > 0 && Math.random() < stunChance && !bossResists(b)) {
            b.enemy.statuses.stunAp = Math.min(2, b.enemy.statuses.stunAp + 1);
            push(b, `${b.enemy.def.name} оглушён ударом ${i + 1}/${hits}!`, "p");
          }
          const counterChance = Math.min(1, effectPower(b, "counter") / 100 + passivePower(b, "dance", "counter") / 100);
          if (b.enemy.hp > 0 && counterChance > 0 && Math.random() < counterChance) {
            const { d: cd } = calcWeaponRoll(b, 0.6);
            const dealt2 = hitEnemy(b, cd, "phys", ` [Второй удар ${i + 1}/${hits}]`);
            applyVamp(b, dealt2, 0, "weapon");
          }
        }
        if (b.enemy.hp <= 0) break;
      }
      b.p.firstAttackDone = true;

      if (eff === "bleed") {
        applyEnemyStatus(b, "bleed", techValue(ws, 3));
        push(b, `${b.enemy.def.name} истекает кровью (${b.enemy.statuses.bleed} раундов).`, "p");
      } else if (eff === "poison") {
        applyEnemyStatus(b, "poison", techValue(ws, 3));
        push(b, `${b.enemy.def.name} отравлен на ${b.enemy.statuses.poison} раунда.`, "p");
      } else if (eff === "guard") {
        b.p.guard = true;
        push(b, "Ответная стойка: ты в Защите до следующего хода.", "p");
      } else if (eff === "guard_wall") {
        b.p.guard = true;
        const wallArmor = techValue(ws, 4);
        b.p.statuses.tempArmor += wallArmor;
        push(b, `Стена щитов: Защита и +${wallArmor} брони до конца боя.`, "p");
      } else if (eff === "chill") {
        applyEnemyStatus(b, "chill", techValue(ws, 2));
        push(b, `${b.enemy.def.name} обморожен: лечение −50% и периодический урон (${b.enemy.statuses.chill} раунда).`, "p");
      } else if (eff === "sunder") {
        const breakAmount = techValue(ws, ws.id === "crushing_blow" ? 3 : 2);
        if (!bossResists(b)) {
          b.enemy.armor = Math.max(0, b.enemy.armor - breakAmount);
          push(b, `Броня противника расколота (−${breakAmount} брони, осталось ${b.enemy.armor}).`, "p");
        }
      } else if (eff === "stun") {
        const stunAp = techValue(ws, 1);
        if (!bossResists(b)) {
          b.enemy.statuses.stunAp = Math.min(4, b.enemy.statuses.stunAp + stunAp);
          push(b, `${b.enemy.def.name} оглушён и потеряет ${stunAp} ход в следующем раунде!`, "p");
        }
      } else if (eff === "dodge_action") {
        b.p.statuses.dodgeNext += techValue(ws, 1);
        b.p.statuses.shadowStep += techValue(ws, 1);
        push(b, "Пустой шаг: следующая атака ускользнёт, в следующем раунде +1 ход.", "p");
      } else if (eff === "curse_brand") {
        applyEnemyStatus(b, "curse", techValue(ws, 3));
        b.enemy.statuses.cursePower = 30;
        b.enemy.statuses.fear = Math.max(b.enemy.statuses.fear, statusRounds(b, techValue(ws, 1)));
        push(b, `${b.enemy.def.name} скован печатью проклятия: урон −30% и периодический магический урон.`, "p");
      } else if (eff === "full_guard") {
        const rounds = techValue(ws, 2) + (hasPassive(b, "arch_sage_10") ? 1 : 0);
        b.p.statuses.fullGuard = Math.max(b.p.statuses.fullGuard, rounds);
        push(b, `Слово защиты: полная защита от урона на ${rounds} хода.`, "p");
      } else if (eff === "buff_break") {
        /* Срок фиксирован: истощение держится ровно два хода, уровнем не растягивается. */
        const rounds = 2;
        if (!bossResists(b)) {
          b.enemy.depleted = Math.max(b.enemy.depleted, rounds);
          push(b, `Истощение ${b.enemy.def.name} на ${rounds} хода: его положительные эффекты гаснут.`, "p");
        }
      } else if (eff === "create_scroll") {
        const count = scaleIntegerByLevel(ws.id === "scroll_tempest" ? 2 : 1, ws.level ?? 1) + effectPower(b, "scroll_create") +
          passivePower(b, "sage_library", "create") +
          (hasPassive(b, "arch_sage_10") ? 1 : 0);
        const created = createScrolls(b, count);
        push(b, `Слово творения создаёт свитки: ${created.join(", ")}.`, "p");
        if (created.length > 0) castCreatedScroll(b, created[0]);
      }

      let leech = eff === "leech" ? techValue(ws, 0.4, 100) : eff === "skill_leech" ? techValue(ws, ws.id === "soul_reprise" ? 0.35 : 0.25, 100) : 0;
      if (eff !== "double_attack") applyVamp(b, dealtTotal, leech, "skill", trueDamage ? "magic" : "phys");
      else if (leech > 0) applyVamp(b, dealtTotal, leech, "skill", "phys");

      const noCd = (hasPassive(b, "echo") && Math.random() < 0.35) ||
        (hasPassive(b, "arch_warlock_10") && Math.random() < 0.25);
      if (noCd) {
        push(b, "Приём не ушёл на перезарядку!", "p");
      } else {
        let cd = skillCd(b, ws.cooldown);
        if (eff === "skill_leech") cd = Math.max(1, cd - techValue(ws, ws.id === "soul_reprise" ? 2 : 1));
        b.p.weaponCd = cd;
      }
      break;
    }

    case "epic_skill": {
      const sk = b.p.epicSkills.find((s) => s.id === a.id);
      if (!sk) return err("Эта способность недоступна.");
      const cd = b.p.epicCds[sk.id] ?? 0;
      if (cd > 0) return err(`«${sk.name}» перезаряжается (${cd} р.).`);
      const req = Math.max(1, sk.intReq - b.p.intDiscount);
      if (b.p.stats.int < req) return err(`Для «${sk.name}» требуется ИНТ ${req}.`);

      const skLevel = b.p.epicSkillLevels[sk.id] ?? 1;
      if (sk.id === "fireball") {
        const dmg = Math.round(techniqueDamage(b.p.stats.int, epicMagnitude(sk.id, "scale", skLevel) / 2) * spellPowerMult * skillDamageMult(b));
        const dealt = elementalHit(b, dmg, "true", " [Огненный шар]", "fire");
        applyVamp(b, dealt, 0, "skill", "magic");
        const burnRounds = epicMagnitude(sk.id, "rounds", skLevel);
        b.enemy.statuses.burn = Math.max(b.enemy.statuses.burn, burnRounds);
        push(b, `${b.enemy.def.name} объят пламенем (${burnRounds} раунда).`, "p");
      } else if (sk.id === "blood_lance") {
        const dmg = Math.round(techniqueDamage(b.p.stats.int, epicMagnitude(sk.id, "scale", skLevel) / 2) * spellPowerMult * skillDamageMult(b));
        const dealt = hitEnemy(b, dmg, "true", " [Кровавое копьё]");
        const heal = healPlayer(b, Math.max(2, Math.round(dealt * (epicMagnitude(sk.id, "leech", skLevel) / 100))));
        flash(b, "p", "heal", heal);
        push(b, `Кровавое копьё возвращает тебе +${heal} здоровья.`, "p");
      } else if (sk.id === "ash_aegis") {
        const heal = healPlayer(b, Math.round((epicMagnitude(sk.id, "base", skLevel) + epicMagnitude(sk.id, "scale", skLevel) * b.p.stats.int) * spellPowerMult));
        b.p.statuses.wound = 0;
        b.p.statuses.curse = 0;
        b.p.statuses.cursePower = 0;
        b.p.statuses.poison = 0;
        b.p.guard = true;
        flash(b, "p", "heal", heal);
        push(b, `Эгида пепла: +${heal} ОЗ, раны сняты, включена Защита.`, "p");
      } else if (sk.id === "shadow_volley") {
        const dmg = Math.round(techniqueDamage(b.p.stats.int, epicMagnitude(sk.id, "scale", skLevel) / 2) * spellPowerMult * skillDamageMult(b));
        const dealt = hitEnemy(b, dmg, "true", " [Теневой росчерк]");
        b.enemy.statuses.chill = Math.max(b.enemy.statuses.chill, epicMagnitude(sk.id, "rounds", skLevel));
        applyVamp(b, dealt, 0, "skill", "magic");
      } else if (sk.id === "frost_nova") {
        const dmg = Math.round(techniqueDamage(b.p.stats.int, epicMagnitude(sk.id, "scale", skLevel) / 2) * spellPowerMult * skillDamageMult(b));
        const dealt = elementalHit(b, dmg, "true", " [Дыхание склепа]", "ice");
        applyVamp(b, dealt, 0, "skill", "magic");
        b.enemy.statuses.chill = Math.max(b.enemy.statuses.chill, epicMagnitude(sk.id, "rounds", skLevel));
        b.enemy.statuses.stunAp = Math.min(4, b.enemy.statuses.stunAp + epicMagnitude(sk.id, "stun", skLevel));
        push(b, `${b.enemy.def.name} скован стужей и теряет 1 ход в следующем раунде.`, "p");
      }

      b.p.epicCds[sk.id] = skillCd(b, sk.cooldown);
      break;
    }

    case "guard": {
      b.p.guard = true;
      flash(b, "p", "guard", 0);
      push(b, "Ты уходишь в глухую защиту: входящий урон вдвое меньше.", "p");
      break;
    }

    case "item": {
      const def = ITEMS[a.id];
      if (!def?.use) return err("Этим нельзя воспользоваться.");
      if (def.kind === "special" || def.kind === "reagent") return err("Этот предмет используется только на карте.");
      if (!b.bag[a.id]) return err(`«${def.name}» закончился.`);
      const u = def.use;
      const req = consumableIntReq(def, b.p.intDiscount);
      if (b.p.stats.int < req) return err(`Для «${def.name}» нужен Интеллект ${req}.`);
      const itemPower = consumablePowerWithGear(b, def);
      const scrollMult = consumableDamageMult(b, def);
      if (u.type === "fear" && isImmuneTo(b.enemy.def.race, "fear")) {
        return err(`${b.enemy.def.name} не знает страха: флакон здесь бесполезен.`);
      }

      switch (u.type) {
        case "heal": {
          const healed = healPlayer(b, itemPower, def.kind === "potion");
          if (def.kind === "scroll") b.p.statuses.wound = 0;
          flash(b, "p", "heal", healed);
          push(b, `${def.name}: +${healed} здоровья.`, "p");
          break;
        }
        case "damage": {
          let dmg = Math.round(itemPower * scrollMult);
          if (u.vs && b.enemy.def.race === u.vs) dmg = Math.round(dmg * 2);
          if (b.p.statuses.rage > 0) dmg = Math.round(dmg * (1 + 0.10 * Math.min(10, Math.floor(missingHpRatio(b) * 10))));
          if (b.p.statuses.curse > 0) dmg = Math.round(dmg * (1 - (b.p.statuses.cursePower ?? 30) / 100));
          const dealt = elementalHit(b, dmg, u.vs ? "true" : "magic", ` [${def.name}]${u.vs && b.enemy.def.race === u.vs ? " · вдвойне против такого рода!" : ""}`, u.element);
          applyVamp(b, dealt, 0, def.kind === "scroll" ? "scroll" : "consumable", def.kind === "scroll" ? "magic" : "phys");
          break;
        }
        case "chill": {
          const dmg = Math.round(itemPower * scrollMult);
          const dealt = elementalHit(b, dmg, "magic", ` [${def.name}]`, u.element ?? "ice");
          applyVamp(b, dealt, 0, def.kind === "scroll" ? "scroll" : "consumable", def.kind === "scroll" ? "magic" : "phys");
          applyEnemyStatus(b, "chill", u.rounds ?? 3);
          push(b, `${b.enemy.def.name} обморожен: лечение −50% и периодический урон.`, "p");
          break;
        }
        case "sunder_damage": {
          let dmg = Math.round(itemPower * scrollMult);
          const dealt = hitEnemy(b, dmg, "true", ` [${def.name}]`);
          applyVamp(b, dealt, 0, def.kind === "scroll" ? "scroll" : "consumable", def.kind === "scroll" ? "magic" : "phys");
          b.enemy.armor = Math.max(0, b.enemy.armor - 2);
          push(b, `Молния раскалывает броню врага (−2 брони).`, "p");
          break;
        }
        case "cleanse": {
          b.p.statuses.wound = 0;
          b.p.statuses.curse = 0;
        b.p.statuses.cursePower = 0;
          b.p.statuses.poison = 0;
          const amt = healPlayer(b, Math.max(1, Math.round(itemPower)), def.kind === "potion");
          push(b, `${def.name}: раны, проклятие и яд сняты (+${amt} ОЗ).`, "p");
          break;
        }
        case "rage": {
          b.p.statuses.rage = statusRounds(b, u.rounds ?? 5);
          push(b, `${def.name}: ярость на ${u.rounds} раундов, +10% урона за каждые 10% недостающего ОЗ.`, "p");
          break;
        }
        case "flee": {
          b.over = "flee";
          b.fleeRate = u.fleeRate ?? 0.5;
          push(b, `${def.name}: ты ускользаешь во мрак.`, "p");
          break;
        }
        case "throw": {
          const dmg = Math.round(itemPower);
          const dealt = hitEnemy(b, dmg, "phys", ` [${def.name}]`);
          applyVamp(b, dealt, 0, "consumable", "phys");
          break;
        }
        case "poison": {
          const dmg = Math.round(itemPower);
          const dealt = hitEnemy(b, dmg, "phys", ` [${def.name}]`);
          applyVamp(b, dealt, 0, "consumable", "phys");
          if (isImmuneTo(b.enemy.def.race, "poison")) {
            push(b, `${b.enemy.def.name} (${MONSTER_RACE_META[b.enemy.def.race].name.toLowerCase()}) невосприимчив к яду!`, "sys");
          } else if (b.enemy.hp > 0) {
            applyEnemyStatus(b, "poison", u.rounds ?? 3);
            push(b, `${b.enemy.def.name} отравлен на ${b.enemy.statuses.poison} раунда.`, "p");
          }
          break;
        }
        case "smoke": {
          b.p.statuses.smoke = Math.max(b.p.statuses.smoke, u.rounds ?? 2);
          flash(b, "p", "guard", 0);
          push(b, `${def.name}: следующие ${b.p.statuses.smoke} атаки противника пройдут мимо тебя.`, "p");
          break;
        }
        case "explosion": {
          const dmg = Math.round(itemPower);
          const dealt = hitEnemy(b, dmg, "true", ` [${def.name}, взрыв]`);
          applyVamp(b, dealt, 0, "consumable", "phys");
          break;
        }
        case "fear": {
          applyEnemyStatus(b, "fear", u.rounds ?? 2);
          push(b, `${b.enemy.def.name} в ужасе: автоматически держит защиту ${b.enemy.statuses.fear} хода.`, "p");
          break;
        }
        case "haste": {
          b.p.statuses.haste = statusRounds(b, u.rounds ?? 3);
          push(b, `${def.name}: следующие ${b.p.statuses.haste} раунда ты действуешь на ход раньше.`, "p");
          break;
        }
        case "stone": {
          b.p.statuses.stone = statusRounds(b, u.rounds ?? 3);
          push(b, `${def.name}: входящий урон −30% на ${b.p.statuses.stone} раунда.`, "p");
          break;
        }
        case "terror": {
          b.enemy.forceGuard = u.rounds ?? 2;
          push(b, `${b.enemy.def.name} охвачен ужасом: держит защиту ${b.enemy.forceGuard} хода.`, "p");
          break;
        }
        case "stun_enemy": {
          if (!bossResists(b)) {
            b.enemy.statuses.stunAp = Math.min(4, b.enemy.statuses.stunAp + (u.rounds ?? 1));
            push(b, `${b.enemy.def.name} теряет ${u.rounds ?? 1} ход в следующем раунде.`, "p");
          }
          break;
        }
        case "iron_tonic": {
          b.p.statuses.ironTonic = statusRounds(b, u.rounds ?? 4);
          b.p.statuses.wound = 0;
          push(b, `${def.name}: +4 брони и +4 регенерации на ${b.p.statuses.ironTonic} раунда.`, "p");
          break;
        }
        case "blood_rage": {
          b.p.statuses.rage = statusRounds(b, u.rounds ?? 4);
          b.p.statuses.bloodRage = statusRounds(b, u.rounds ?? 4);
          push(b, `${def.name}: ярость и +15% вампиризма оружием на ${u.rounds} раунда.`, "p");
          break;
        }
        case "quickblade": {
          b.p.statuses.quickblade = statusRounds(b, u.rounds ?? 3);
          push(b, `${def.name}: +25% шанса крита и +50% силы крита на ${u.rounds} раунда.`, "p");
          break;
        }
        case "pact_elixir": {
          b.p.weaponCd = 0;
          for (const k of Object.keys(b.p.epicCds)) b.p.epicCds[k] = 0;
          b.p.statuses.pactElixir = statusRounds(b, u.rounds ?? 3);
          push(b, `${def.name}: перезарядки сброшены, +25% урона приёмов на ${u.rounds} раунда.`, "p");
          break;
        }
        case "scroll_creation": {
          const count = 2 + effectPower(b, "scroll_create") + passivePower(b, "sage_library", "create") +
            (hasPassive(b, "arch_sage_10") ? 1 : 0);
          const created = createScrolls(b, count);
          push(b, `${def.name}: созданы свитки (${created.join(", ")}).`, "p");
          if (created.length > 0) castCreatedScroll(b, created[0]);
          break;
        }
        case "acid": {
          const dmg = Math.round(itemPower);
          const dealt = elementalHit(b, dmg, "true", ` [${def.name}]`, u.element ?? "acid");
          applyVamp(b, dealt, 0, "consumable", "phys");
          if (!bossResists(b)) {
            b.enemy.armor = Math.max(0, b.enemy.armor - 3);
            push(b, `Кислота разъедает броню: −3 (осталось ${b.enemy.armor}).`, "p");
          }
          break;
        }
        case "bleed": {
          const dmg = Math.round(itemPower);
          const dealt = hitEnemy(b, dmg, "phys", ` [${def.name}]`);
          applyVamp(b, dealt, 0, "consumable", "phys");
          applyEnemyStatus(b, "bleed", u.rounds ?? 3);
          push(b, `${b.enemy.def.name} истекает кровью (${b.enemy.statuses.bleed} раундов).`, "p");
          break;
        }
        case "blight": {
          const dmg = Math.round(itemPower);
          const dealt = hitEnemy(b, dmg, "true", ` [${def.name}]`);
          applyVamp(b, dealt, 0, "consumable", "phys");
          applyEnemyStatus(b, "blight", u.rounds ?? 3);
          push(b, `Порча сковывает ${b.enemy.def.name}: урон −20% и потеря ОЗ за раунд.`, "p");
          break;
        }
        case "buff_break": {
          if (u.power || u.scale) {
            const dmg = Math.round(itemPower * scrollMult);
            const dealt = elementalHit(b, dmg, "true", ` [${def.name}]`, u.element);
            applyVamp(b, dealt, 0, def.kind === "scroll" ? "scroll" : "consumable", "magic");
          }
          if (bossResists(b)) break;
          const rounds = u.rounds ?? 2;
          b.enemy.depleted = Math.max(b.enemy.depleted, rounds);
          push(b, `${def.name}: истощение ${b.enemy.def.name} на ${rounds} хода — эффекты гаснут.`, "p");
          break;
        }
        case "wither": {
          const dmg = Math.round(itemPower);
          const dealt = hitEnemy(b, dmg, "true", ` [${def.name}]`);
          applyVamp(b, dealt, 0, "consumable", "phys");
          applyEnemyStatus(b, "wither", u.rounds ?? 3);
          push(b, `Увядание: любое лечение ${b.enemy.def.name} переходит в магический урон.`, "p");
          break;
        }
      }

      /* Эхо заклинаний: свиток может сработать повторно без расхода. */
      const echoChance = passivePower(b, "spell_echo", "echo") / 100;
      if (def.kind === "scroll" && echoChance > 0 && Math.random() < echoChance) {
        const echoPower = consumablePowerWithGear(b, def);
        const echoMult = consumableDamageMult(b, def);
        if (u.type === "heal") {
          const amt = healPlayer(b, Math.round(echoPower * echoMult));
          flash(b, "p", "heal", amt);
          push(b, `Эхо заклинаний повторяет ${def.name}: +${amt} здоровья.`, "p");
        } else if (u.type === "damage" || u.type === "chill" || u.type === "sunder_damage") {
          const dmg = Math.round(echoPower * echoMult);
          const dealt = hitEnemy(b, dmg, u.type === "sunder_damage" ? "true" : "magic", ` [Эхо: ${def.name}]`);
          applyVamp(b, dealt, 0, "scroll", "magic");
        }
      }

      const scrollSaveChance = (hasPassive(b, "echo") ? 0.35 : 0) + effectPower(b, "scroll_save") / 100 +
        (hasPassive(b, "arch_sage_5") ? 0.15 : 0) +
        (hasPassive(b, "arch_sage_10") ? 0.20 : 0) +
        passivePower(b, "sage_library", "save") / 100;
      const saveScroll = def.kind === "scroll" && scrollSaveChance > 0 && Math.random() < scrollSaveChance;
      if (!saveScroll) {
        b.bag[a.id] = (b.bag[a.id] ?? 0) - 1;
        if (b.bag[a.id] <= 0) delete b.bag[a.id];
      } else {
        push(b, "Эхо мысли сохраняет свиток — он не истлел!", "p");
      }
      break;
    }

    case "flee": {
      b.over = "flee";
      b.fleeRate = a.rate ?? 0.4 + Math.random() * 0.3;
      push(b, "Ты бросаешь бой и отступаешь в коридор.", "p");
      break;
    }
  }

  if (b.enemy.hp <= 0) {
    b.enemy.hp = 0;
    b.over = "win";
    gainLoot(b);
    push(b, `${b.enemy.def.name} повержен! (+${enemyXpFor(b)} опыта)`, "sys");
    return b;
  }
  if (b.over) return b;
  advance(b);
  return b;
}

/* ═══════════  ИНТЕЛЛЕКТ МОНСТРОВ  ═══════════ */

/** Приёмы с негативными эффектами: порча, яд, кровотечение, печати, страх. */
const DEBUFF_MOVES: EnemyMove[] = ["wound", "poison", "curse", "sunder", "bell_stun", "terror", "seal_items", "seal_skills", "seal_attack", "intimidate", "darkness"];
/** Приёмы, которые бьют по духу и считаются магическими. */
const MAGIC_MOVES: EnemyMove[] = ["curse", "drain", "bell_stun", "terror", "darkness", "cold_touch", "hell_force"];
/** Прямые удары оружием и когтями. */
const STRIKE_MOVES: EnemyMove[] = ["attack", "heavy", "multi"];

/**
 * Родовые свойства удара: вампир лечится от попадания, а зверь, призрак,
 * вампир и демон оставляют на герое свой след — яд, кровь, страх или огонь.
 */
function applyRaceStrike(b: BattleState, isStrike: boolean, rawBase: number, resistChance: number) {
  const e = b.enemy;
  const race = e.def.race;
  /* Вампиризм рода: любое попадание возвращает четверть силы удара. */
  if (race === "vampire" && e.hp > 0) {
    const heal = healEnemy(b, Math.max(1, Math.round(rawBase * 0.25)));
    if (heal > 0) push(b, `${e.def.name} пьёт жизнь: +${heal} ОЗ.`, "e");
  }
  if (!isStrike || b.p.hp <= 0) return;
  const lands = () => Math.random() > resistChance;
  if (race === "vampire" && lands()) {
    b.p.statuses.wound = Math.max(b.p.statuses.wound, 3);
    push(b, "Клыки рвут плоть: кровотечение на 3 раунда.", "e");
  } else if (race === "ghost" && lands()) {
    b.p.statuses.fear = Math.max(b.p.statuses.fear, 2);
    push(b, "Прикосновение призрака сеет страх на 2 раунда.", "e");
  } else if (race === "beast" && lands()) {
    if (Math.random() < 0.5) {
      b.p.statuses.wound = Math.max(b.p.statuses.wound, 3);
      push(b, "Зверь рвёт когтями: кровотечение на 3 раунда.", "e");
    } else {
      b.p.statuses.poison = Math.max(b.p.statuses.poison, 3);
      push(b, "Яд зверя в крови: 3 раунда отравления.", "e");
    }
  } else if (race === "demon" && lands()) {
    if (Math.random() < 0.5) {
      b.p.statuses.burn = Math.max(b.p.statuses.burn, statusRounds(b, 3));
      push(b, "Адское пламя липнет к коже: горение на 3 раунда.", "e");
    } else {
      b.p.statuses.fear = Math.max(b.p.statuses.fear, 2);
      push(b, "Взгляд демона парализует волю: страх на 2 раунда.", "e");
    }
  }
}

/** Порог «мало здоровья» для перехода в лечение или защитную стойку. */
export const ENEMY_LOW_HP_RATIO = 0.35;

/** Сколько ходов осталось у врага до конца раунда (включая текущий). */
function enemyTurnsLeft(b: BattleState): number {
  let n = 0;
  for (let i = b.idx; i < b.queue.length; i++) if (b.queue[i] === "e") n++;
  return n;
}

/** Шипы героя: физический удар по нему ранит самого нападающего. */
function playerThorns(b: BattleState): number {
  return (
    rarePower(b, "thorns", "damage") +
    effectPower(b, "thorns") +
    passivePower(b, "bulwark_wall", "thorns") +
    (hasPassive(b, "arch_bulwark_10") ? 6 : 0)
  );
}

/**
 * Решение монстра на его ход. Приоритеты:
 * 1. Мало ОЗ — лечащий приём (похищение жизни) либо защитная стойка.
 * 2. Промах на прошлом ходу — приём; при наличии магии именно магический удар.
 * 3. У героя шипы: бьёт магией, а на последнем ходу раунда — защита.
 * 4. Последний ход раунда: ходов больше — атака или приём, ходов меньше — защита.
 * 5. Обычная атака бьёт слабо — приёмы на негативные эффекты.
 * 6. Иначе — обычный случайный выбор из доступных приёмов.
 */
export function chooseEnemyMove(b: BattleState): EnemyMove {
  const e = b.enemy;
  const moves = (e.moves.length ? e.moves : e.def.moves).slice();
  const has = (m: EnemyMove) => moves.includes(m);
  const debuffs = moves.filter((m) => DEBUFF_MOVES.includes(m));
  const magics = moves.filter((m) => MAGIC_MOVES.includes(m));
  const strikes = moves.filter((m) => STRIKE_MOVES.includes(m));
  const hpRatio = e.hp / Math.max(1, e.maxHp);
  const turnsLeft = enemyTurnsLeft(b);
  const enemyTurns = b.queue.filter((s) => s === "e").length;
  const playerTurns = b.queue.filter((s) => s === "p").length;

  /* 1. Мало здоровья: лечимся похищением жизни либо держим стойку. */
  if (hpRatio <= ENEMY_LOW_HP_RATIO) {
    if (has("drain") && e.hp < e.maxHp) {
      return "drain";
    }
    return "guard";
  }

  /* 2. Промахнулся — следующий ход приём; с магией бьёт именно магией. */
  if (e.lastMiss) {
    if (magics.length) {
      return pick(magics);
    }
    if (debuffs.length) {
      return pick(debuffs);
    }
    if (has("heavy")) return "heavy";
  }

  /* 3. У героя шипы: вплотную бить накладно, поэтому при наличии магии тварь
     бьёт магией, а на последнем ходу раунда без дебаффов держит стойку. */
  if (playerThorns(b) > 0) {
    if (magics.length) return pick(magics);
    if (turnsLeft === 1 && !debuffs.length) {
      return "guard";
    }
  }

  /* 4. Последний ход раунда: кто быстрее, тот и распоряжается концовкой. */
  if (turnsLeft === 1) {
    if (enemyTurns < playerTurns) {
      return "guard";
    }
    if (enemyTurns > playerTurns) {
      const options = [...strikes, ...debuffs];
      if (options.length) return pick(options);
      return "attack";
    }
  }

  /* 5. Обычная атака почти не пробивает героя — давим негативными эффектами. */
  const plain = Math.round((e.atk[0] + e.atk[1]) / 2) - Math.max(0, b.p.armor);
  if (plain <= Math.max(2, Math.round(b.p.maxHp * 0.05)) && debuffs.length) {
    return pick(debuffs);
  }

  /* 6. Обычный выбор. */
  return moves.length ? pick(moves) : "attack";
}

export function enemyStep(b0: BattleState): BattleState {
  if (b0.over || b0.queue[b0.idx] !== "e") return b0;
  const b = clone(b0);
  b.enemy.guard = false;
  const e = b.enemy;
  if (e.statuses.stunAp > 0) {
    e.statuses.stunAp--;
    push(b, `${e.def.name} оглушён и пропускает ход.`, "p");
    advance(b);
    return b;
  }
  if (e.statuses.fear > 0) {
    e.statuses.fear--;
    e.guard = true;
    flash(b, "e", "guard", 0);
    push(b, `${e.def.name} в страхе автоматически уходит в защиту.`, "p");
    advance(b);
    return b;
  }
  /* Свиток ужаса / световая бомба: враг не выходит из обороны. */
  if (e.forceGuard > 0) {
    e.forceGuard -= 1;
    e.guard = true;
    flash(b, "e", "guard", 0);
    push(b, `${e.def.name} держит защиту от ужаса${e.forceGuard > 0 ? ` (осталось ${e.forceGuard} ход)` : ""}.`, "p");
    advance(b);
    return b;
  }

  const chill = (e.statuses.blight > 0 ? 0.8 : 1) * (e.statuses.curse > 0 ? 1 - (e.statuses.cursePower ?? 30) / 100 : 1);
  const move = chooseEnemyMove(b);
  const isStrikeMove = STRIKE_MOVES.includes(move);
  /* Промах запоминается только на один ход: после решения флаг снимаем. */
  e.lastMiss = false;
  /* Базовый удар — обычный параметр; усиления от эффектов при истощении не работают. */
  let base = randInt(e.atk[0], e.atk[1]);
  if (!effectsDepleted(b)) {
    base = Math.round(base * (1 + (eEffect(b, "rage") / 100) * Math.min(10, Math.floor(enemyMissingRatio(b) * 10))));
    base = Math.round(base * (1 + (e.level * eEffect(b, "might")) / 100));
    base = Math.round(base * (1 + eEffect(b, "missing_hp_damage") / 100 * Math.min(10, Math.floor(enemyMissingRatio(b) * 10))));
    base = Math.round(base * (1 + eEffect(b, "enemy_missing_damage") / 100 * Math.min(10, Math.floor(missingHpRatio(b) * 10))));
    if (b.round <= 2) base = Math.round(base * (1 + eEffect(b, "first_strike") / 100));
    base += Math.round(e.armor * eEffect(b, "armor_damage") / 100);
    const eCritChance = eChance(b, "crit_chance");
    if (eCritChance > 0 && Math.random() < eCritChance) {
      base = Math.round(base * (2 + eEffect(b, "crit_mult") / 100));
      push(b, `${e.def.name} наносит критический удар!`, "e");
    }
  }
  /* Тип задаёт, на чём держится урон: у умных приёмы бьют в 1.45× сильнее. */
  const typeMeta = MONSTER_TYPE_META[e.mtype] ?? MONSTER_TYPE_META.strong;
  if (!isStrikeMove && move !== "guard") base = Math.round(base * typeMeta.movePower);
  /* Агрессия зверя: ниже половины здоровья бьёт вдвое. */
  if (e.def.race === "beast" && e.hp > 0 && e.hp <= e.maxHp * 0.5 && isStrikeMove) {
    base = Math.round(base * 2);
  }
  /* Ярость дракона: двойной урон, пока держится. */
  if (e.def.race === "dragon" && e.fury > 0 && !effectsDepleted(b)) base = Math.round(base * 2);
  const resistChance = playerResistChance(b);
  const hpBeforeMove = b.p.hp;

  switch (move) {
    case "guard": {
      /* Истощение гасит эффекты, но стойка — обычное действие. */
      e.guard = true;
      flash(b, "e", "guard", 0);
      push(b, `${e.def.name} уходит в глухую защиту.`, "e");
      break;
    }
    case "heavy": {
      push(b, `${e.def.name} обрушивает сокрушительный удар!`, "e");
      if (!incoming(b, Math.round(base * 1.7 * chill), "phys", `${e.def.name} пробивает с плеча`)) e.lastMiss = true;
      break;
    }
    case "wound": {
      const landed = incoming(b, Math.round(base * 0.9 * chill), "phys", `${e.def.name} рвёт плоть`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && !hasLeg(b, "titan_heart") && Math.random() > resistChance) {
        b.p.statuses.wound = Math.max(b.p.statuses.wound, 3);
        push(b, "Открылось кровотечение на 3 раунда.", "e");
      } else if (landed && b.p.hp > 0) {
        push(b, "Твоя сила сдерживает рану — кровотечения нет.", "p");
      }
      break;
    }
    case "curse": {
      const landed = incoming(b, Math.round(base * 0.7 * chill), "magic", `${e.def.name} шепчет анафему`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && Math.random() > resistChance) {
        b.p.statuses.curse = Math.max(b.p.statuses.curse, 3);
        b.p.statuses.cursePower = Math.max(b.p.statuses.cursePower ?? 0, 30);
        push(b, "Проклятие висит 3 раунда: твой урон снижен на 30%.", "e");
      } else if (landed && b.p.hp > 0) {
        push(b, "Стойкость отбрасывает проклятие.", "p");
      }
      break;
    }
    case "drain": {
      const d = Math.round(base * 0.95 * chill);
      if (incoming(b, d, "magic", `${e.def.name} вытягивает жизненную силу`)) {
        const heal = healEnemy(b, Math.max(2, Math.round(d * 0.5)));
        push(b, `${e.def.name} восстанавливает себе ${heal} ОЗ.`, "e");
      }
      break;
    }
    case "sunder": {
      const landed = incoming(b, Math.round(base * 1.15 * chill), "phys", `${e.def.name} бьёт по швам доспеха`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0) {
        b.p.statuses.sundered = Math.min(4, b.p.statuses.sundered + 1);
        push(b, "Твоя броня промята (−1 к защите до конца боя).", "e");
      }
      break;
    }
    case "bell_stun": {
      const landed = incoming(b, Math.round(base * 1.1 * chill), "magic", `${e.def.name} бьёт в погребальный колокол`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && Math.random() > resistChance) {
        b.p.statuses.stunAp = 1;
        push(b, "Звон парализует волю: −1 ход в следующем раунде!", "e");
      } else if (landed && b.p.hp > 0) {
        push(b, "Ты выдерживаешь удар колокола без потери хода.", "p");
      }
      break;
    }
    case "intimidate": {
      b.p.statuses.sealAttack = 1;
      b.p.statuses.sealSkills = 1;
      push(b, `${e.def.name} давит волей: в следующий ход нельзя ни атаковать, ни применять приёмы.`, "e");
      break;
    }
    case "darkness": {
      b.p.statuses.darkness = 1;
      push(b, `${e.def.name} сгущает мрак: до конца раунда половина твоих атак уходит в пустоту.`, "e");
      break;
    }
    case "cold_touch": {
      const landed = incoming(b, Math.round(base * 1.1 * chill), "magic", `${e.def.name} касается холодом`, false, true);
      if (landed) {
        push(b, "Холодное касание проходит сквозь броню и любое сопротивление.", "e");
        b.p.statuses.noHeal = Math.max(b.p.statuses.noHeal, 2);
        if (b.p.hp > 0) push(b, "Стужа в костях: два хода лечение не действует.", "e");
      }
      break;
    }
    case "hell_force": {
      const landed = incoming(b, Math.round(base * 2 * chill), "magic", `${e.def.name} обрушивает силу ада`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && Math.random() > resistChance) {
        b.p.statuses.burn = Math.max(b.p.statuses.burn, statusRounds(b, 4));
        push(b, "Сила ада поджигает: 4 раунда горения.", "e");
      }
      break;
    }
    case "poison": {
      const landed = incoming(b, Math.round(base * 0.85 * chill), "phys", `${e.def.name} впивается зубами`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && !hasLeg(b, "titan_heart") && Math.random() > resistChance) {
        b.p.statuses.poison = Math.max(b.p.statuses.poison, 3);
        push(b, "Яд разъедает кровь: 4 урона за раунд.", "e");
      } else if (landed && b.p.hp > 0) {
        push(b, "Кровь выжигает яд на лету.", "p");
      }
      break;
    }
    case "multi": {
      const first = incoming(b, Math.round(base * 0.65 * chill), "phys", `${e.def.name} бьёт первым выпадом`);
      if (first && b.p.hp > 0) {
        const second = incoming(b, Math.round(base * 0.65 * chill), "phys", `${e.def.name} добивает вторым`);
        e.lastMiss = !second;
      } else {
        e.lastMiss = true;
      }
      break;
    }
    case "seal_items": {
      b.p.statuses.sealItems = 1;
      push(b, `${e.def.name} накладывает Печать немоты: расходники запрещены в твой следующий ход.`, "e");
      break;
    }
    case "seal_skills": {
      b.p.statuses.sealSkills = 1;
      push(b, `${e.def.name} накладывает Печать забвения: приёмы запрещены в твой следующий ход.`, "e");
      break;
    }
    case "seal_attack": {
      b.p.statuses.sealAttack = 1;
      push(b, `${e.def.name} накладывает Печать оков: обычная атака запрещена в твой следующий ход.`, "e");
      break;
    }
    case "terror": {
      const landed = incoming(b, Math.round(base * 0.6 * chill), "magic", `${e.def.name} рычит тебе в лицо`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && Math.random() > resistChance) {
        b.p.statuses.fear = Math.max(b.p.statuses.fear, 2);
        e.guard = true;
        flash(b, "e", "guard", 0);
        push(b, "Страх на 2 раунда: в свой ход ты автоматически уходишь в защиту.", "e");
      }
      break;
    }
    default: {
      if (!incoming(b, Math.round(base * chill), "phys", `${e.def.name} атакует`)) e.lastMiss = true;
    }
  }

  /* Родовые последствия удара: вампиризм, кровь, страх, яд, огонь. */
  if (!e.lastMiss && b.p.hp < hpBeforeMove) {
    applyRaceStrike(b, isStrikeMove, Math.round(base * chill), resistChance);
  }

  const magicMove = ["curse", "drain", "bell_stun", "terror"].includes(move);
  const eVamp = (magicMove ? eEffect(b, "magic_vamp") : eEffect(b, "vamp") + eEffect(b, "vamp_str")) / 100;
  if (eVamp > 0 && e.hp > 0 && b.p.hp > 0) {
    const heal = healEnemy(b, Math.max(1, Math.round(base * chill * eVamp)));
    if (heal > 0) push(b, `${e.def.name} восстанавливает ${heal} ОЗ от удара.`, "e");
  }
  const eStun = eChance(b, "stun_chance");
  if (eStun > 0 && b.p.hp > 0 && Math.random() < eStun) {
    b.p.statuses.stunAp = Math.max(b.p.statuses.stunAp, 1);
    push(b, `${e.def.name} оглушает тебя: −1 ход в следующем раунде.`, "e");
  }
  if (b.over) return b;
  advance(b);
  return b;
}

/* ═══════════  ЖИВАЯ СВОДКА ХАРАКТЕРИСТИК  ═══════════ */

export interface Modifier {
  id: string;
  label: string;
  /** Множитель (1 = не меняет) либо плоская прибавка. */
  mult?: number;
  flat?: number;
  good: boolean;
  rounds?: number;
  detail: string;
}

export interface CombatReadout {
  biome: BiomeId;
  /** Дополнительный шанс промаха физическим ударом из-за среды. */
  missChance: number;
  /** Урон оружия без модификаторов. */
  baseMin: number;
  baseMax: number;
  /** Урон с учётом всех активных эффектов, до брони врага. */
  dmgMin: number;
  dmgMax: number;
  dmgAvg: number;
  /** Урон после брони и защит врага — то, что реально увидит противник. */
  effMin: number;
  effMax: number;
  /** Что прилетит мне: диапазон после моей брони. */
  inMin: number;
  inMax: number;
  /** То же в глухой защите. */
  inGuardMin: number;
  inGuardMax: number;
  armor: number;
  armorBase: number;
  evade: number;
  crit: number;
  critDamage: number;
  tenacity: number;
  magicResist: number;
  fortify: number;
  ap: number;
  apBase: number;
  resist: number;
  dmgMods: Modifier[];
  defMods: Modifier[];
  enemyMods: Modifier[];
}

function multOf(list: Modifier[]) {
  return list.reduce((m, x) => m * (x.mult ?? 1), 1);
}
function flatOf(list: Modifier[]) {
  return list.reduce((m, x) => m + (x.flat ?? 0), 0);
}

/**
 * Сводка боя пересчитывается на каждое изменение состояния:
 * проклятие, ярость, скорость, каменная кожа и прочие эффекты
 * сразу видны в числах урона и защиты.
 */
export function combatReadout(b: BattleState): CombatReadout {
  const st = b.p.stats;
  const strFlat = statDamage(st.str);
  const baseMin = b.p.hit[0] + strFlat;
  const baseMax = b.p.hit[1] + strFlat;

  const dmgMods: Modifier[] = [];
  if (b.biome === "ice")
    dmgMods.push({ id: "biome_ice", label: "Ледяные просторы", mult: 0.75, good: false, detail: "Физические удары оружием слабее на 25%." });
  const ws = b.p.weaponSkill;
  const wsReq = ws ? Math.max(1, ws.intReq - b.p.intDiscount) : 0;
  if (ws && st.int >= wsReq) {
    const bonus = Math.round(techniqueDamage(st.int, ws.scaleMult * 0.35));
    if (bonus > 0)
      dmgMods.push({
        id: "weapon_passive",
        label: "Бонус оружия",
        flat: bonus,
        good: true,
        detail: `+${bonus} к каждому удару.`,
      });
  }
  if (b.p.passives.includes("heavy_hand"))
    dmgMods.push({ id: "heavy_hand", label: "Тяжёлая рука", flat: 3, good: true, detail: "+3 к урону каждым ударом." });
  const might = b.p.rareAffixes.filter((x) => x === "might").length;
  const mightDamage = rarePower(b, "might", "damage");
  const effectDamage = effectPower(b, "armor_damage") / 100 + (hasPassive(b, "arch_bulwark_10") ? 0.5 : 0);
  if (effectDamage > 0 && b.p.armor > 0)
    dmgMods.push({ id: "armor_damage", label: "Наступление", flat: Math.round(b.p.armor * effectDamage), good: true, detail: `+${Math.round(effectDamage * 100)}% брони к урону.` });
  const rageSteps = Math.min(10, Math.floor(missingHpRatio(b) * 10));
  const gearRageBonus = (effectPower(b, "rage") / 100) * rageSteps;
  const missingBonus = gearRageBonus + (b.p.stats.str * effectPower(b, "might")) / 100 +
    (effectPower(b, "missing_hp_damage") / 100) * Math.min(10, Math.floor(missingHpRatio(b) * 10)) +
    (hasPassive(b, "arch_barbarian_5") ? Math.floor(missingHpRatio(b) * 10) * 0.04 : 0);
  if (missingBonus > 0) dmgMods.push({ id: "missing_hp", label: "Ярость/Мощь", mult: 1 + missingBonus, good: true, detail: "Недостающее здоровье и Сила усиливают удар." });
  const enemyMissingBonus = (effectPower(b, "enemy_missing_damage") / 100) * Math.min(10, Math.floor(enemyMissingRatio(b) * 10)) +
    (hasPassive(b, "arch_barbarian_10") && enemyMissingRatio(b) >= 0.5 ? 0.35 : 0);
  if (enemyMissingBonus > 0) dmgMods.push({ id: "enemy_missing", label: "Добивание", mult: 1 + enemyMissingBonus, good: true, detail: "Раненый враг получает больше урона." });
  if (b.p.gearHands === 2) {
    const two = effectPower(b, "two_hand_damage") / 100 + (hasPassive(b, "arch_barbarian_5") ? 0.25 : 0);
    if (two > 0) dmgMods.push({ id: "two_hand", label: "Двуручный хват", mult: 1 + two, good: true, detail: "Двуручное оружие бьёт сильнее." });
  }
  if (b.round <= 2 && effectPower(b, "first_strike") > 0)
    dmgMods.push({ id: "first_strike", label: "Первый удар", mult: 1 + effectPower(b, "first_strike") / 100, good: true, detail: `+${effectPower(b, "first_strike")}% урона в первые 2 раунда.` });
  const debuffBonus = (effectPower(b, "debuff_damage") / 100) * Math.min(4, enemyDebuffCount(b)) +
    (hasPassive(b, "arch_ninja_10") ? Math.min(0.4, enemyDebuffCount(b) * 0.10) : 0);
  if (debuffBonus > 0) dmgMods.push({ id: "debuff_damage", label: "Удар по слабому", mult: 1 + debuffBonus, good: true, detail: "Негативные эффекты врага усиливают твой урон." });
  if (might)
    dmgMods.push({ id: "might", label: "Тяжесть стали", flat: mightDamage, good: true, detail: `+${mightDamage} к урону (свойств: ${might}).` });

  if (b.p.statuses.rage > 0)
    dmgMods.push({
      id: "rage",
      label: "Ярость",
      mult: 1 + 0.10 * Math.min(10, Math.floor(missingHpRatio(b) * 10)),
      good: true,
      rounds: b.p.statuses.rage,
      detail: "+10% урона за каждые 10% недостающего ОЗ.",
    });
  if (b.p.statuses.curse > 0)
    dmgMods.push({
      id: "curse",
      label: "Проклятие",
      mult: 1 - (b.p.statuses.cursePower ?? 30) / 100,
      good: false,
      rounds: isBattleCurse(b.p.statuses.curse) ? undefined : b.p.statuses.curse,
      detail: `Снижает ваш урон на ${b.p.statuses.cursePower ?? 30}%${isBattleCurse(b.p.statuses.curse) ? " до конца боя" : ""}.`,
    });
  if (b.p.passives.includes("relentless") && b.p.hp < b.p.maxHp * 0.35)
    dmgMods.push({
      id: "relentless",
      label: "Неумолимый",
      mult: 1.5,
      good: true,
      detail: "Ниже 35% здоровья удары в полтора раза сильнее.",
    });
  if (b.p.legendaryPassives.includes("executioner") && b.enemy.hp <= b.enemy.maxHp * 0.5)
    dmgMods.push({
      id: "executioner",
      label: "Приговор слабым",
      mult: 1.35,
      good: true,
      detail: "Противник ниже половины здоровья: урон +35%.",
    });

  const totalFlat = flatOf(dmgMods);
  const totalMult = multOf(dmgMods);
  const rawMin = Math.max(1, Math.round((baseMin + totalFlat) * totalMult));
  const rawMax = Math.max(1, Math.round((baseMax + totalFlat) * totalMult));

  /* Что останется после брони и защит противника. */
  const pierce = b.p.rareAffixes.filter((x) => x === "pierce").length * 2;
  const enemyArmor = Math.max(0, b.enemy.armor - pierce);
  const stoneHide = b.enemy.passive?.id === "stone_hide" ? 0.75 : 1;
  const guardMult = b.enemy.guard ? 0.5 : 1;
  const effMin = Math.max(1, Math.floor(Math.max(1, rawMin - enemyArmor) * stoneHide * guardMult));
  const effMax = Math.max(1, Math.floor(Math.max(1, rawMax - enemyArmor) * stoneHide * guardMult));

  /* Защита */
  const defMods: Modifier[] = [];
  if (b.biome === "swamp")
    defMods.push({ id: "biome_swamp", label: "Болото: лечение −50%", good: false, detail: "Действует на обоих участников. Зелья лечения и поддержки не ослабляются." });
  if (b.biome === "dark")
    defMods.push({ id: "biome_dark", label: "Мрак: промах 25%", good: false, detail: "Дополнительная проверка для физических ударов игрока и врага." });
  if (b.p.statuses.burning > 0)
    defMods.push({ id: "biome_burning", label: `Горение ×${b.p.statuses.burning}`, good: false, detail: `−${fireBurnDamage(b.p.statuses.burning)} ОЗ в начале своего хода; следующий слой −${fireBurnDamage(b.p.statuses.burning + 1)}.` });
  if (b.p.statuses.sundered > 0)
    defMods.push({
      id: "sundered",
      label: "Раскол брони",
      flat: -b.p.statuses.sundered,
      good: false,
      detail: `Броня снижена на ${b.p.statuses.sundered} до конца боя.`,
    });
  if (b.p.statuses.stone > 0)
    defMods.push({
      id: "stone",
      label: "Каменная кожа",
      mult: 0.7,
      good: true,
      rounds: b.p.statuses.stone,
      detail: "Входящий урон −30%.",
    });
  if (b.p.guard)
    defMods.push({ id: "guard", label: "Защита", mult: 0.5, good: true, detail: "Входящий урон вдвое меньше до твоего следующего хода." });
  if (b.p.statuses.smoke > 0)
    defMods.push({
      id: "smoke",
      label: "Дымовая завеса",
      good: true,
      rounds: b.p.statuses.smoke,
      detail: `Следующие ${b.p.statuses.smoke} атаки врага пройдут мимо.`,
    });
  if (b.p.statuses.wound > 0)
    defMods.push({
      id: "wound",
      label: "Кровотечение",
      good: false,
      rounds: b.p.statuses.wound,
      detail: `−${Math.max(1, Math.ceil(b.p.maxHp * 0.05))} здоровья в конце каждого раунда (5% макс. ОЗ).`,
    });
  if (b.p.statuses.poison > 0)
    defMods.push({
      id: "poison",
      label: "Отравление",
      good: false,
      rounds: b.p.statuses.poison,
      detail: `−${Math.max(1, Math.ceil(b.p.maxHp * 0.04))} здоровья в конце каждого раунда (4% макс. ОЗ).`,
    });
  if (b.p.statuses.burn > 0)
    defMods.push({ id: "burn", label: "Горение", good: false, rounds: b.p.statuses.burn, detail: `−${Math.max(1, Math.ceil(b.p.maxHp * 0.05))} ОЗ в конце раунда (5% макс. ОЗ).` });
  if (b.p.statuses.chill > 0)
    defMods.push({ id: "chill", label: "Обморожение", good: false, rounds: b.p.statuses.chill, detail: "Лечение −50% и периодический урон 3% макс. ОЗ." });
  if (b.p.statuses.wither > 0)
    defMods.push({ id: "wither", label: "Увядание", good: false, rounds: b.p.statuses.wither, detail: "Любое лечение переходит в магический урон." });
  if (b.p.statuses.fear > 0)
    defMods.push({ id: "fear", label: "Страх", good: false, rounds: b.p.statuses.fear, detail: "Автоматическая защита в твой ход." });
  if (b.p.statuses.sealAttack > 0)
    defMods.push({ id: "sealAttack", label: "Печать оков", good: false, rounds: b.p.statuses.sealAttack, detail: "Обычная атака запрещена в этот ход." });
  if (b.p.statuses.sealSkills > 0)
    defMods.push({ id: "sealSkills", label: "Печать забвения", good: false, rounds: b.p.statuses.sealSkills, detail: "Приёмы запрещены в этот ход." });
  if (b.p.statuses.sealItems > 0)
    defMods.push({ id: "sealItems", label: "Печать немоты", good: false, rounds: b.p.statuses.sealItems, detail: "Расходники запрещены в этот ход." });
  if (b.p.statuses.stunAp > 0)
    defMods.push({
      id: "stun",
      label: "Оглушение",
      good: false,
      rounds: b.p.statuses.stunAp,
      detail: `Пропуск ${b.p.statuses.stunAp} следующего хода.`,
    });
  if (b.p.legendaryPassives.includes("immortal_pact") && !b.p.immortalUsed)
    defMods.push({
      id: "immortal",
      label: "Печать бессмертия",
      good: true,
      detail: "Один раз за бой смертельный удар оставит 18 ОЗ и даст Защиту.",
    });

  if (b.p.statuses.tempArmor > 0) defMods.push({ id: "tempArmor", label: "Стена щитов", flat: b.p.statuses.tempArmor, good: true, detail: "Временная броня до конца боя." });
  if (b.p.statuses.ironTonic > 0) defMods.push({ id: "ironTonic", label: "Железная кожа", flat: 4, good: true, rounds: b.p.statuses.ironTonic, detail: "+4 брони и +4 регенерации." });
  if (b.p.statuses.fullGuard > 0) defMods.push({ id: "fullGuard", label: "Полная защита", good: true, rounds: b.p.statuses.fullGuard, detail: "Полностью поглощает входящий урон." });
  if (b.p.statuses.dodgeNext > 0) defMods.push({ id: "dodgeNext", label: "Пустой шаг", good: true, rounds: b.p.statuses.dodgeNext, detail: "Следующая атака врага полностью ускользнёт." });
  const resistFlat = effectPower(b, "damage_resist");
  if (resistFlat > 0) defMods.push({ id: "damage_resist", label: "Сопротивление урону", flat: -resistFlat, good: true, detail: `−${resistFlat} урона за каждый входящий удар.` });
  const armorBase = b.p.armor + b.p.statuses.tempArmor + (b.p.statuses.ironTonic > 0 ? 4 : 0) + b.p.statuses.sundered;
  const armor = Math.max(0, b.p.armor + b.p.statuses.tempArmor + (b.p.statuses.ironTonic > 0 ? 4 : 0) - b.p.statuses.sundered);

  /* Урон врага по мне */
  const enemyMods: Modifier[] = [];
  if (b.biome === "ice")
    enemyMods.push({ id: "biome_ice_enemy", label: "Лёд: удары врага −25%", mult: 0.75, good: true, detail: "Физические атаки противника ослаблены холодом." });
  if (b.enemy.statuses.burning > 0)
    enemyMods.push({ id: "biome_burning_enemy", label: `Горение врага ×${b.enemy.statuses.burning}`, good: true, detail: `−${fireBurnDamage(b.enemy.statuses.burning)} ОЗ врагу в начале его хода; следующий слой −${fireBurnDamage(b.enemy.statuses.burning + 1)}.` });
  if (b.enemy.statuses.burn > 0)
    enemyMods.push({ id: "eburn", label: "Горение врага", good: true, rounds: b.enemy.statuses.burn, detail: `−${Math.max(1, Math.ceil(b.enemy.maxHp * 0.05))} ОЗ врагу в конце раунда.` });
  if (b.enemy.statuses.curse > 0)
    enemyMods.push({ id: "ecurse", label: "Проклятие врага", mult: 0.7, good: true, rounds: b.enemy.statuses.curse, detail: "Урон врага −30% и периодический магический урон." });
  if (b.enemy.statuses.blight > 0)
    enemyMods.push({ id: "blight", label: "Порча", mult: 0.8, good: true, rounds: b.enemy.statuses.blight, detail: "Урон врага −20% и потеря ОЗ за раунд." });
  if (b.enemy.statuses.wither > 0)
    enemyMods.push({ id: "wither", label: "Увядание", good: true, rounds: b.enemy.statuses.wither, detail: "Любое лечение врага переходит в магический урон." });
  const chill = b.enemy.statuses.chill > 0;
  if (chill)
    enemyMods.push({
      id: "chill",
      label: "Обморожение врага",
      good: true,
      rounds: b.enemy.statuses.chill,
      detail: "Лечение врага −50% и периодический урон 3% макс. ОЗ.",
    });
  if (b.enemy.statuses.fear > 0)
    enemyMods.push({
      id: "fear",
      label: "Страх врага",
      good: true,
      rounds: b.enemy.statuses.fear,
      detail: "Автоматически уходит в защиту в свой ход.",
    });
  if (b.enemy.forceGuard > 0)
    enemyMods.push({
      id: "forceGuard",
      label: "Враг в обороне",
      good: true,
      rounds: b.enemy.forceGuard,
      detail: "Вынужден держать защиту и не атакует.",
    });
  if (b.enemy.statuses.bleed > 0)
    enemyMods.push({
      id: "bleed",
      label: "Кровотечение врага",
      good: true,
      rounds: b.enemy.statuses.bleed,
      detail: `−${Math.max(1, Math.ceil(b.enemy.maxHp * 0.05))} ОЗ врагу в конце раунда (5% макс. ОЗ).`,
    });
  if (b.enemy.statuses.poison > 0)
    enemyMods.push({
      id: "epoison",
      label: "Яд на враге",
      good: true,
      rounds: b.enemy.statuses.poison,
      detail: `−${Math.max(1, Math.ceil(b.enemy.maxHp * 0.04))} ОЗ врагу в конце раунда (4% макс. ОЗ).`,
    });
  if (b.enemy.passive?.id === "stone_hide")
    enemyMods.push({ id: "estone", label: "Каменная шкура врага", mult: 1, good: false, detail: "Твой физический урон по нему −25%." });
  if (b.enemy.passive?.id === "regen")
    enemyMods.push({ id: "eregen", label: "Регенерация врага", mult: 1, good: false, detail: "Враг восстанавливает 4 ОЗ каждый раунд." });
  if (b.enemy.passive?.id === "venom")
    enemyMods.push({ id: "evenom", label: "Ядовитый враг", mult: 1, good: false, detail: "Его удары отравляют тебя на 2 раунда." });

  const enemyMult = (b.enemy.statuses.blight > 0 ? 0.8 : 1) * (b.enemy.statuses.curse > 0 ? 0.7 : 1) * biomeStrikeMult(b.biome);
  const defMult = multOf(defMods.filter((m) => m.mult !== undefined));
  const eMin = Math.round(b.enemy.atk[0] * enemyMult);
  const eMax = Math.round(b.enemy.atk[1] * enemyMult);
  const afterArmor = (v: number) => Math.max(1, Math.round((v - armor - resistFlat) * defMult));

  const haste = b.p.statuses.haste;
  const apBase = b.p.ap;
  const sageAp = hasPassive(b, "arch_sage_10") ? 1 : 0;
  const ap = Math.max(1, apBase + (haste > 0 ? 1 : 0) + sageAp + b.p.statuses.shadowStep);

  return {
    biome: b.biome,
    missChance: (b.torchTurns ?? 0) > 0 ? 0 : biomeMissChance(b.biome),
    baseMin,
    baseMax,
    dmgMin: rawMin,
    dmgMax: rawMax,
    dmgAvg: Math.round((rawMin + rawMax) / 2),
    effMin,
    effMax,
    inMin: afterArmor(eMin),
    inMax: afterArmor(eMax),
    inGuardMin: Math.max(1, Math.floor(afterArmor(eMin) / 2)),
    inGuardMax: Math.max(1, Math.floor(afterArmor(eMax) / 2)),
    armor,
    armorBase,
    evade: combatChance(b.p.chanceLayers.evade),
    crit: combatChance(b.p.chanceLayers.crit, b.p.statuses.quickblade > 0 ? [0.25] : []),
    critDamage: b.p.critDamage + (b.p.statuses.quickblade > 0 ? 0.5 : 0),
    tenacity: playerResistChance(b),
    magicResist: combatChance(b.p.chanceLayers.magicResist),
    fortify: combatChance(b.p.chanceLayers.fortify),
    ap,
    apBase,
    resist: playerResistChance(b),
    dmgMods,
    defMods,
    enemyMods,
  };
}

export function queuePreview(b: BattleState, n = 8): ("p" | "e")[] {
  return b.queue.slice(b.idx, b.idx + n);
}

export const REAGENT_SET = new Set(REAGENTS);
