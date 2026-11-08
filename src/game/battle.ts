import {
  BOSSES,
  ENEMIES,
  ENEMY_PASSIVES,
  EPIC_SKILLS,
  GEAR_BASES,
  ARMOR_SKILLS,
  STAT_META,
  armorSkillDesc,
  armorSkillFor,
  type ArmorSkillView,
  ITEMS,
  REAGENTS,
  BOSS_RARITY_WEIGHTS,
  CHEST_RARITY_WEIGHTS,
  THREAT_META,
  BOSS_META,
  dungeonGold,
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
  GOLEM_FIRE_MULT,
  GOLEM_REFLECT_SHARE,
  MONSTER_RULES,
  MOVE_LABELS,
  RAT_CALL_HEAL_SHARE,
  ROT_ROUNDS,
  SEER_REPEAT_DODGE,
  boneShieldUp,
  nextRotStacks,
  ogreRageMult,
  piercingArmorCap,
  ratCallDue,
} from "./monsterRules";
import {
  ELEMENT_NAMES,
  MONSTER_RACE_META,
  MONSTER_TYPE_META,
  coerceMonsterType,
  monsterEvade,
  NONE_AGILE_COUNTER_CHANCE,
  NONE_SMART_MOVE,
  REVIVE_DEBUFF,
  WEAKNESS_STEP,
  raceApDelta,
  raceArmorMult,
  raceBonusMoves,
  raceCannotHeal,
  raceEffectResist,
  raceElementMult,
  raceFortify,
  raceImmuneTo,
  noneStrongRegen,
  raceRevives,
  raceWeakens,
  type DamageElement,
  type MonsterRace,
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
import { blessingEffect } from "./blessings";
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
import {
  CHILL_HEAL_MULT,
  IMMUNITY_EFFECTS,
  IMMUNITY_NAMES,
  IMMUNITY_ROUNDS,
  type ImmunityEffect,
  OIL_BLIND_MISS,
  OIL_ROUNDS,
  bossDotTick,
  dotBaseTick,
  dotSkillTick,
  skillDotTick,
  magicTickFrom,
  oilAcidArmorCut,
  oilHitDamage,
  oilIceAttackCut,
  oilTickDamage,
  oilTickFromHit,
  refreshedTick,
  type OilKind,
} from "./statusEffects";
import { damageTypeName, isDamageElement } from "./damageTypes";
import { ARCHETYPES, type ArchetypeId } from "./archetypes";
import type { GearEffectId, GearPassiveId } from "./gearEffects";
import { pouchIds } from "./pouch";
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
  /** Стихия удара: журнал показывает её иконку. */
  dmg?: DamageElement;
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
    /** Нежить: воскресла (полное ОЗ, урон и броня −50%). */
    revived?: boolean;
    /** Нежить: воскрешение уже было в этом бою. */
    reviveUsed?: boolean;
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
    statuses: {
      chill: number; bleed: number; poison: number; fear: number; stunAp: number;
      blight: number; wither: number; burning: number; burn: number; curse: number;
      /** Тик периодического урона, задан источником наложения (у каждого свой). */
      bleedTick: number; poisonTick: number; burnTick: number; chillTick: number; curseTick: number; blightTick: number;
      /** Тик масла: 10% от удара, которым масло наложено. */
      oilTick: number;
      /** Печать тишины: враг применяет только атаку и стойку. */
      sealMoves: number;
      cursePower: number; sundered: number;
      /** Наложения кровотечения и яда: урон за тик складывается. */
      bleedStacks?: number;
      poisonStacks?: number;
      /** Урон масла с клинка: один слот, новое масло заменяет старое. */
      oilType: OilKind | null;
      oilRounds: number;
    };
    guard: boolean;
    /** Раунды, в которые враг вынужден держать защиту (свиток ужаса, бомба). */
    forceGuard: number;
    /** Прошлый ход врага закончился промахом: следующий ход — приём. */
    lastMiss: boolean;
    /** Крыса: зов стаи уже был за этот бой. */
    ruleUsed?: boolean;
    /** Костяной воин: щит поднят в этом раунде. */
    shield?: boolean;
    /** Пророк: ход, объявленный в начале раунда. */
    announced?: EnemyMove | null;
    /**
     * Общая перезарядка приёмов с негативными эффектами: номер раунда,
     * с которого приёмы снова доступны. 0 — приёмы не на перезарядке.
     */
    specialCooldown?: number;
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
    /** Приёмы брони из надетых эпических и легендарных предметов. */
    armorSkills: ArmorSkillView[];
    armorCds: Record<string, number>;
    archetype: ArchetypeId | null;
    gearHands: 1 | 2;
    gearArchetype: ArchetypeId | null;
    intDiscount: number;
    immortalUsed: boolean;
    /** Счётчики за текущий ход героя: сбрасываются, когда очередь переходит дальше. */
    turnConsumables: number;
    turnScrolls: number;
    /** Зелье из сумки за ход: первое не тратит ход. */
    turnPouch: number;
    /** Концентрация 0–5: атака +1, приём −1, расходник +1, защита +2; при 5 — спец-приём архетипа. */
    concentration: number;
    /** Библиотека душ: первый удар по герою в бою уже заблокирован. */
    sageWardUsed: boolean;
    statuses: {
      wound: number;
      /** Наложения кровотечения: урон за тик складывается. */
      woundStacks?: number;
      curse: number;
      cursePower?: number;
      poison: number;
      /** Наложения яда: урон за тик складывается. */
      poisonStacks?: number;
      rage: number;
      sundered: number;
      /** Гниение: слои брони (не больше двух) и раунды до конца. */
      rot?: number;
      rotRounds?: number;
      stunAp: number;
      smoke: number;
      /** Раунды действия зелья скорости: +1 ход в раунде. */
      haste: number;
      /** Раунды каменной кожи: входящий урон −30%. */
      stone: number;
      /** Бастион: тоник железной кожи. */
      ironTonic: number;
      /** Зелье регенерации: +5 здоровья за раунд. */
      regenPotion: number;
      /** Зелье стойкости: +25% к сопротивлению эффектам. */
      resistPotion: number;
      /** Вампирская кровь: сколько ударов ещё похищают жизнь. */
      vampHits: number;
      /** Зелья иммунитета: сколько ходов защищает от каждого эффекта. */
      immune: Partial<Record<ImmunityEffect, number>>;
      /** Варвар: кровавая ярость (вампиризм оружием). */
      bloodRage: number;
      /** Ассасин: масло быстрого клинка. */
      quickblade: number;
      /** Смазанный клинок: вид урона масла и раунды, в которые оружие смазано (1). */
      oilType: OilKind | null;
      oilRounds: number;
      /** Колдун: эликсир пакта (урон приёмов). */
      pactElixir: number;
      /** Полная защита от урона (свитки/приёмы мудреца). */
      fullGuard: number;
      /** Неуязвимость (спец-приём колдуна): поглощает удары, приёмы и периодический урон. */
      invulnerable: number;
      /** Броня стойки, которая добавится к следующей обычной атаке бастиона (один раз). */
      bulwarkStrike: number;
      /** Неуловимость: физические атаки врага проходят мимо, раунды. */
      evadeTurn: number;
      /** Ответный замах: каждый физический удар врага, который прошёл, получает ответ, раунды. */
      counterTurn: number;
      /** Временная броня от приёмов бастиона. */
      tempArmor: number;
      /** Гарантированное уклонение от следующей атаки. */
      dodgeNext: number;
      /** Дополнительные ходы в следующем раунде. */
      shadowStep: number;
      /** Слои горения огненных недр: усилиются в начале каждого своего хода. */
      burning: number;
      /** Тик периодического урона героя, задан источником. */
      woundTick: number; poisonTick: number; burnTick: number; chillTick: number; curseTick: number;
      /** Горение как негативный эффект: периодический урон, величину задаёт источник. */
      burn: number;
      /** Обморожение: лечение −50% и периодический урон. */
      chill: number;
      /** Страх: автоматическая защита в ход цели. Не обновляется, пока держится. */
      fear: number;
      /** Иммунитет к страху после окончания: 1 раунд. */
      fearImmune: number;
      /** Увядание: лечение переходит в магический урон. */
      wither: number;
      /** Холодное касание призрака: раунды, в которые лечение не действует. */
      noHeal: number;
      /** Мрак вампира: до конца раунда половина твоих атак уходит мимо. */
      darkness: number;
      /** Слабость вампира: наложения за бой; твой урон от обычных атак −WEAKNESS_STEP за каждое. */
      weakness?: number;
      /** Печати босса: запрет действий в следующий ход игрока. */
      sealItems: number;
      sealSkills: number;
      sealAttack: number;
    };
    guard: boolean;
    firstAttackDone: boolean;
  };
  bag: Record<string, number>;
  /** Зелья из сумки (до трёх видов): первое за ход не тратит ход. */
  pouch: string[];
  /** Созданное в бою (свитки мудреца, расходники ниндзя): лежит в bag, герою после боя не переходит. */
  conjured: Record<string, number>;
  queue: ("p" | "e")[];
  idx: number;
  round: number;
  /** Пророк: последний приём героя и повтор подряд. */
  lastSkill?: string | null;
  repeatSkill?: boolean;
  /** Плачущая тень: броня поглощает не больше половины удара. */
  piercing?: boolean;
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
  | { type: "armor_skill"; id: string }
  | { type: "item"; id: string }
  | { type: "guard" }
  | { type: "archetype_skill" }
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
  armorSkills: ArmorSkillView[];
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
  const armorSkills: ArmorSkillView[] = [];
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

    /* Урон считают обе руки: двуручник один, в паре — правая + левая.
     * Оружие в левой руке наносит вдвое меньше: его вклад делится пополам. */
    const isHand = slot === "mainHand" || slot === "offHand";
    if (isHand && st.dmg) {
      const handMult = slot === "offHand" ? 0.5 : 1;
      hitLo += Math.round(st.dmg[0] * handMult);
      hitHi += Math.round(st.dmg[1] * handMult);
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
    const armorView = armorSkillFor(g);
    if (armorView && !armorSkills.some((a) => a.id === armorView.id)) armorSkills.push(armorView);
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
  const strFlat = statDamage(pl.stats.str, pl.passives);
  /* Благословение священника на поход: здоровье, броня и шансы из blessingEffect. */
  const bless = blessingEffect(pl.blessing);
  const baseHp = statHealth(pl.stats.str, pl.passives) + hpBonus + (hasPassive("iron_will") ? 22 : 0) + mightHp + titanHp;
  const maxHp = baseHp + (bless.hpPct ? Math.round(baseHp * bless.hpPct) : 0);

  const chanceLayers = emptyChanceLayers();
  chanceLayers.evade.stats.push(statEvasion(pl.stats.agi));
  if (bless.evade) chanceLayers.evade.effects.push(bless.evade);
  if (bless.crit) chanceLayers.crit.effects.push(bless.crit);
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
  const armor = Math.max(0, armorBonus) + titanArmor + bless.armor;
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
    armorSkills,
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
/** Нижняя граница удара обычного монстра до брони героя. Боссы не затрагиваются. */
export const NORMAL_MIN_ATK = 10;

/** Нижняя граница здоровья обычного монстра. Боссы не затрагиваются. */
export const NORMAL_MIN_HP = 35;

export function spawnEnemy(
  floor: number,
  isBoss = false,
  rng: () => number = Math.random,
  forcedThreat?: Threat,
  forcedEnemyId?: string,
): SpawnedEnemy {
  /* Вид задаётся заданием (убить или принести с существа); иначе — случайный по этажу. */
  const forced = !isBoss && forcedEnemyId ? ENEMIES.find((e) => e.id === forcedEnemyId) : undefined;
  const def = isBoss ? rollBoss(floor) : forced ?? rollEnemy(floor, rng);
  const threat: Threat = isBoss ? "catastrophe" : forcedThreat ?? rollThreat(rng, floor);
  const level = isBoss ? floor : rollMonsterLevel(floor, rng);
  const meta = THREAT_META[threat];

  /* Тип задаёт профиль: сильные крепче и бьют тяжелее, ловкие уклоняются и
     получают лишний ход, умные держат урон на приёмах. Род ограничивает тип:
     конструкт бывает только сильным. */
  const mtype = coerceMonsterType(def.race, def.type);
  const typeMeta = MONSTER_TYPE_META[mtype];

  // Шаг усиления падает на 0.05 за уровень, но не ниже ×1.05 (кроме ходов).
  const levelMult = enemyLevelMult(level);
  const scale = isBoss ? BOSS_META : meta;
  const hpMult = levelMult * scale.hpMult * typeMeta.hpMult;
  const atkMult = levelMult * scale.atkMult * typeMeta.atkMult;
  const armorMult = scale.armorMult;

  /* Приёмы рода (запугивание, мрак, холодное касание, сила ада) есть у каждой твари. */
  const moves: EnemyMove[] = [...def.moves, ...raceBonusMoves(def.race)];
  /* «Без рода», умный: один лишний приём сверх набора. */
  if (def.race === "none" && mtype === "smart") {
    const extra = [NONE_SMART_MOVE, "multi", "heavy", "sunder"].find((mv) => !moves.includes(mv as EnemyMove)) as EnemyMove | undefined;
    if (extra) moves.push(extra);
  }
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
    /* Обычные монстры держат минимум NORMAL_MIN_HP; боссы — как задано. */
    hp: isBoss ? Math.max(1, Math.round(def.hp * hpMult)) : Math.max(NORMAL_MIN_HP, Math.round(def.hp * hpMult)),
    ap: Math.max(1, Math.min(10, apBase)),
    /* Обычные монстры бьют минимум на NORMAL_MIN_ATK (до брони героя); боссы — как задано. */
    atk: isBoss
      ? [Math.max(1, Math.round(def.atk[0] * atkMult)), Math.max(2, Math.round(def.atk[1] * atkMult))]
      : [
          Math.max(NORMAL_MIN_ATK, Math.round(def.atk[0] * atkMult)),
          Math.max(NORMAL_MIN_ATK, Math.round(def.atk[1] * atkMult)),
        ],
    /* Броня: уровень плюс прибавка типа (у ловких она отрицательная). */
    armor: Math.max(0, Math.round(def.armor * levelMult * armorMult * raceArmorMult(def.race)) + typeMeta.armorDelta),
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
      armorCds: { ...b.p.armorCds },
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
      statuses: { ...b.p.statuses, immune: { ...b.p.statuses.immune } },
    },
    bag: { ...b.bag },
    conjured: { ...b.conjured },
    log: b.log.slice(-70),
    queue: [...b.queue],
    loot: {
      ...b.loot,
      items: [...b.loot.items],
      gear: [...b.loot.gear],
    },
  };
}

function push(b: BattleState, text: string, kind: LogLine["kind"], dmg?: DamageElement) {
  const line: LogLine = { id: (b.log[b.log.length - 1]?.id ?? 0) + 1, text, kind };
  if (dmg) line.dmg = dmg;
  b.log = [...b.log.slice(-69), line];
}

function flash(b: BattleState, target: "p" | "e", kind: "hit" | "guard" | "miss" | "heal", amount: number) {
  b.flash = { id: ++flashSeq, target, kind, amount };
}

export function newBattle(
  pl: Player,
  floor: number,
  isBoss = false,
  biome: BiomeId = "classic",
  torchTurns = 0,
  initialBurning = 0,
  forcedThreat?: Threat,
  forcedEnemyId?: string,
): BattleState {
  const d = derived(pl);
  const s = spawnEnemy(floor, isBoss, Math.random, forcedThreat, forcedEnemyId);
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
      statuses: {
        chill: 0, bleed: 0, poison: 0, fear: 0, stunAp: 0, blight: 0, wither: 0, burning: 0,
        burn: 0, curse: 0, cursePower: 30, sundered: 0, bleedStacks: 0, poisonStacks: 0,
        bleedTick: 0, poisonTick: 0, burnTick: 0, chillTick: 0, curseTick: 0, blightTick: 0, oilTick: 0,
        oilType: null, oilRounds: 0, sealMoves: 0,
      },
      guard: false,
      forceGuard: 0,
      lastMiss: false,
      specialCooldown: 0,
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
      armorSkills: d.armorSkills,
      armorCds: {},
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
      turnConsumables: 0,
      turnScrolls: 0,
      turnPouch: 0,
      concentration: 0,
      sageWardUsed: false,
      statuses: {
        wound: pl.statuses.wound,
        woundStacks: pl.statuses.wound > 0 ? 1 : 0,
        curse: pl.statuses.curse,
        cursePower: pl.statuses.cursePower,
        poison: pl.statuses.poison,
        poisonStacks: pl.statuses.poison > 0 ? 1 : 0,
        rage: 0,
        sundered: 0,
        stunAp: 0,
        smoke: 0,
        haste: 0,
        stone: 0,
        ironTonic: 0,
        regenPotion: 0,
        resistPotion: 0,
        vampHits: 0,
        bloodRage: 0,
        quickblade: 0,
        oilType: null,
        oilRounds: 0,
        immune: {},
        pactElixir: 0,
        fullGuard: 0,
        invulnerable: 0,
        bulwarkStrike: 0,
        evadeTurn: 0,
        counterTurn: 0,
        tempArmor: 0,
        dodgeNext: 0,
        shadowStep: 0,
        burning: normalizeBiome(biome) === "fire" ? Math.max(0, initialBurning) : 0,
        burn: 0,
        woundTick: pl.statuses.woundTick ?? 0, poisonTick: pl.statuses.poisonTick ?? 0,
        burnTick: pl.statuses.burnTick ?? 0, chillTick: pl.statuses.chillTick ?? 0,
        curseTick: pl.statuses.curseTick ?? 0,
        chill: pl.statuses.chill ?? 0,
        fear: pl.statuses.fear ?? 0,
        fearImmune: 0,
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
    pouch: pouchIds(pl),
    conjured: {},
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
  const rule = MONSTER_RULES[b.enemy.def.id];
  if (rule) push(b, `Правило: ${rule.title} — ${rule.text}`, "sys");
  prepareRoundRules(b);
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
  return (s.chill > 0 ? 1 : 0) + (s.bleed > 0 ? 1 : 0) + (s.poison > 0 ? 1 : 0) + (s.fear > 0 ? 1 : 0) + (s.stunAp > 0 ? 1 : 0) + (s.blight > 0 ? 1 : 0) + (s.wither > 0 ? 1 : 0) + (s.burn > 0 ? 1 : 0) + (s.curse > 0 ? 1 : 0) + (s.oilRounds > 0 ? 1 : 0);
}
function techValue(ws: WeaponSkillDef, base: number, precision = 1): number {
  return scaleByLevel(base, ws.level ?? 1, precision);
}
function skillCd(b: BattleState, base: number) {
  const reduction = effectPower(b, "skill_cd") + passivePower(b, "warlock_pact", "cd");
  return Math.max(1, base - reduction);
}
/** Перезарядка приёма сразу после использования. Колдун 5: 20% шанс −1 перезарядки этого приёма. */
function skillCdAfterUse(b: BattleState, base: number) {
  let cd = skillCd(b, base);
  if (hasPassive(b, "arch_warlock_5") && Math.random() < 0.2) cd = Math.max(1, cd - 1);
  return cd;
}
function skillScaleBonus(b: BattleState) {
  return techniqueSkillScale(b.p.effectPower, b.p.passives);
}
/**
 * Бонус приёма в текущем бою: формула по ХАР и множителю, а затем свойства конкретного приёма
 * (броня, недостающее здоровье, добивание, мрак, первый удар). Бой и сводка берут одно и то же значение.
 */
export function techniqueBonusNow(b: BattleState, ws: WeaponSkillDef): number {
  /* Колдун 10: скейл любого оружейного приёма идёт через ИНТ. */
  const scaleStat = hasPassive(b, "arch_warlock_10") ? "int" : ws.scaleStat;
  let bonus = Math.round(weaponTechniqueBonus(b.p.stats[scaleStat], ws.scaleMult, skillScaleBonus(b)));
  const eff = ws.effect;
  if (eff === "armor_damage") bonus += Math.round(b.p.armor * techValue(ws, ws.id === "bulwark_verdict" ? 0.75 : 0.5, 100));
  if (eff === "missing_hp") bonus = Math.round(bonus * (1 + Math.min(10, Math.floor(missingHpRatio(b) * 10)) * techValue(ws, 0.06, 100)));
  if (eff === "enemy_missing") bonus = Math.round(bonus * (1 + Math.min(10, Math.floor(enemyMissingRatio(b) * 10)) * techValue(ws, 0.06, 100)));
  if (eff === "debuff_damage") bonus = Math.round(bonus * (1 + Math.min(4, enemyDebuffCount(b)) * techValue(ws, 0.10, 100)));
  if (eff === "first_strike" && b.round <= 2) bonus = Math.round(bonus * techValue(ws, 2, 100));
  return bonus;
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
/** Добавка «бонус навыков» к множителю приёма: свойство предметов и арх. чернокнижника 10. */
export function techniqueSkillScale(effectPower: Partial<Record<GearEffectId, number>>, passives: readonly string[]): number {
  return (effectPower.skill_scale ?? 0) + (passives.includes("arch_warlock_10") ? 0.5 : 0);
}
/** Предел ХАР в формуле бонуса приёма оружия. */
export const TECHNIQUE_STAT_CAP = 10;
/**
 * Бонус приёма оружия, который добавляется к урону оружия:
 * урон приёма + (ХАР × (ХАР + множитель приёма + бонус навыков)) / 2.
 * ХАР — характеристика, которую требует предмет (СИЛ, ЛОВ или ИНТ), но не больше 10.
 */
export function weaponTechniqueBonus(stat: number, scaleMult: number, skillScale = 0): number {
  const x = Math.min(stat, TECHNIQUE_STAT_CAP);
  return (x * (x + scaleMult + skillScale)) / 2;
}
function rageBonus(b: BattleState): number {
  const steps = Math.min(10, Math.floor(missingHpRatio(b) * 10));
  return (effectPower(b, "rage") / 100) * steps + (b.p.statuses.rage > 0 ? 0.10 * steps : 0);
}
function statusRounds(b: BattleState, base: number) {
  return base + effectPower(b, "status_duration") + passivePower(b, "time_warp", "duration") +
    (hasPassive(b, "arch_warlock_10") ? 2 : 0);
}
export function playerResistChance(b: BattleState) {
  const extra = [
    ...(hasPassive(b, "stone_skin") ? [0.15] : []),
    ...(b.p.statuses.resistPotion > 0 ? [0.25] : []),
  ];
  return combatChance(b.p.chanceLayers.tenacity, extra);
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
/** Предел наложений периодических эффектов: урон за тик складывается. */
export const MAX_DOT_STACKS = 5;

/** Зелье иммунитета сейчас защищает героя от этого эффекта. */
function playerImmune(b: BattleState, id: ImmunityEffect): boolean {
  return (b.p.statuses.immune[id] ?? 0) > 0;
}

/** Иммунитет срабатывает: эффект не накладывается, в журнале видно почему. */
function immuneNote(b: BattleState, id: ImmunityEffect): boolean {
  if (!playerImmune(b, id)) return false;
  push(b, `Иммунитет: ${IMMUNITY_NAMES[id]} не накладывается.`, "p");
  return true;
}

/** Сколько наложений яда или кровотечения висит на герое. */
function playerDotStacks(b: BattleState, kind: "poison" | "wound"): number {
  const rounds = kind === "poison" ? b.p.statuses.poison : b.p.statuses.wound;
  if (rounds <= 0) return 1;
  const key = kind === "poison" ? "poisonStacks" : "woundStacks";
  return Math.max(1, b.p.statuses[key] ?? 1);
}

/**
 * Новое наложение яда или кровотечения на героя: срок обновляется до большего,
 * а урон за тик складывается. Больше MAX_DOT_STACKS наложений не держится.
 */
function applyPlayerDot(b: BattleState, kind: "poison" | "wound", rounds: number, tick: number): number {
  if (immuneNote(b, kind === "poison" ? "poison" : "bleed")) return 0;
  const key = kind === "poison" ? "poisonStacks" : "woundStacks";
  const tickKey = kind === "poison" ? "poisonTick" : "woundTick";
  const active = kind === "poison" ? b.p.statuses.poison > 0 : b.p.statuses.wound > 0;
  const prev = active ? (b.p.statuses[key] ?? 1) : 0;
  const stacks = Math.min(MAX_DOT_STACKS, prev + 1);
  b.p.statuses[key] = stacks;
  b.p.statuses[tickKey] = refreshedTick(active, b.p.statuses[tickKey], tick);
  if (kind === "poison") b.p.statuses.poison = Math.max(b.p.statuses.poison, rounds);
  else b.p.statuses.wound = Math.max(b.p.statuses.wound, rounds);
  return stacks;
}

/** Тик героя от прямой жертвы: горение, обморожение и проклятие ставятся без стеков. */
function setPlayerTick(b: BattleState, key: "burn" | "chill" | "curse", rounds: number, tick: number) {
  const active = b.p.statuses[key] > 0;
  const tickKey = key === "burn" ? "burnTick" : key === "chill" ? "chillTick" : "curseTick";
  b.p.statuses[tickKey] = refreshedTick(active, b.p.statuses[tickKey], tick);
  b.p.statuses[key] = Math.max(b.p.statuses[key], rounds);
}

/** Сколько наложений яда или кровотечения висит на враге. */
function enemyDotStacks(b: BattleState, kind: "poison" | "bleed"): number {
  const cur = kind === "poison" ? b.enemy.statuses.poison : b.enemy.statuses.bleed;
  if (cur <= 0) return 1;
  const key = kind === "poison" ? "poisonStacks" : "bleedStacks";
  return Math.max(1, b.enemy.statuses[key] ?? 1);
}

/** Сколько брони снимает раскол от свойства оружия: растёт с уровнем свойства. */
export function sunderBreakAmount(power: number): number {
  return Math.max(1, Math.round(Math.max(0, power) / 30));
}

/** Сколько брони снимает раскол монстра: растёт с его уровнем. */
export function enemySunderBreak(level: number): number {
  return 1 + Math.min(2, Math.max(0, Math.floor((Math.max(1, level) - 1) / 4)));
}

/** Прямое наложение горения, обморожения или проклятия врагу: тик и срок (без стеков). */
function setEnemyTick(b: BattleState, key: "burn" | "chill" | "curse", rounds: number, tick: number) {
  const active = b.enemy.statuses[key] > 0;
  const tk = ENEMY_TICK_KEY[key];
  const t = b.isBoss ? bossDotTick(key, b.enemy.maxHp) : tick;
  b.enemy.statuses[tk] = refreshedTick(active, b.enemy.statuses[tk], t);
  b.enemy.statuses[key] = Math.max(b.enemy.statuses[key], rounds);
}

/** Тик периодического урона врага по ключу статуса; у остальных эффектов тика нет. */
const ENEMY_TICK_KEY = {
  bleed: "bleedTick", poison: "poisonTick", burn: "burnTick", chill: "chillTick", curse: "curseTick", blight: "blightTick",
} as const;

function applyEnemyStatus(
  b: BattleState,
  key: "chill" | "bleed" | "poison" | "fear" | "blight" | "wither" | "curse" | "burn",
  rounds: number,
  tick = 0,
) {
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
  const wasActive = b.enemy.statuses[key] > 0;
  if (key in ENEMY_TICK_KEY) {
    const tk = ENEMY_TICK_KEY[key as keyof typeof ENEMY_TICK_KEY];
    /* Босс получает периодику процентом от своего макс. ОЗ; остальные — тик источника. */
    const t = b.isBoss ? bossDotTick(key as "bleed" | "poison" | "burn" | "chill" | "curse" | "blight", b.enemy.maxHp) : tick;
    b.enemy.statuses[tk] = refreshedTick(wasActive, b.enemy.statuses[tk], t);
  }
  b.enemy.statuses[key] = Math.max(b.enemy.statuses[key], statusRounds(b, rounds));
  /* Яд и кровотечение складываются: каждое новое наложение усиливает урон за тик. */
  if (key === "poison" || key === "bleed") {
    const stackKey = key === "poison" ? "poisonStacks" : "bleedStacks";
    const prev = wasActive ? (b.enemy.statuses[stackKey] ?? 1) : 0;
    b.enemy.statuses[stackKey] = Math.min(MAX_DOT_STACKS, prev + 1);
  }
}
/** Свойства оружия, которые срабатывают прямо от удара: кровотечение, яд, раскол. */
/** Масло данного вида сейчас действует на враге (срок не вышел). */
function enemyOil(b: BattleState, kind: OilKind): boolean {
  return b.enemy.statuses.oilType === kind && b.enemy.statuses.oilRounds > 0;
}

/** Кислота под маслом снимает с брони врага 1 + ЛОВ героя. */
function enemyOilArmorCut(b: BattleState): number {
  return enemyOil(b, "acid") ? oilAcidArmorCut(b.p.stats.agi) : 0;
}

/** Лёд под маслом режет силу атаки и физических приёмов врага на 0.05 за очко ИНТ героя. */
function enemyOilAttackMult(b: BattleState): number {
  return enemyOil(b, "ice") ? 1 - oilIceAttackCut(b.p.stats.int) : 1;
}

/**
 * Удар смазанным оружием накладывает вид масла на 3 раунда. Повторный удар обновляет срок.
 * Разовый урон (магия 3 + 3×ИНТ, свет 2×ИНТ) проходит сразу. Стихия, к которой род
 * невосприимчив, не действует.
 */
function oilOnHit(b: BattleState, hitDamage: number) {
  const kind = b.p.statuses.oilType;
  if (!kind || b.p.statuses.oilRounds <= 0 || b.enemy.hp <= 0) return;
  const element = isDamageElement(kind) ? kind : undefined;
  const name = damageTypeName(kind);
  if (element && raceElementMult(b.enemy.def.race, element) <= 0) {
    push(b, `${b.enemy.def.name} не поддаётся маслу: ${name} не действует.`, "sys", element);
    return;
  }
  const renew = enemyOil(b, kind);
  b.enemy.statuses.oilTick = refreshedTick(renew, b.enemy.statuses.oilTick, oilTickFromHit(hitDamage));
  b.enemy.statuses.oilType = kind;
  b.enemy.statuses.oilRounds = OIL_ROUNDS;
  push(
    b,
    renew
      ? `Смазанный клинок обновляет ${name} на ${b.enemy.def.name}: ${OIL_ROUNDS} раунда.`
      : `Смазанный клинок накладывает ${name} на ${b.enemy.def.name}: ${OIL_ROUNDS} раунда.`,
    "p",
    element,
  );
  const raw = oilHitDamage(kind, b.p.stats.int);
  if (raw > 0) elementalHit(b, raw, ` Масло: ${name}.`, element);
}

function weaponHitEffects(b: BattleState) {
  if (b.enemy.hp <= 0) return;
  const chanceOf = (id: GearEffectId) => Math.min(0.95, effectPower(b, id) / 100);
  const bleedChance = chanceOf("bleed");
  if (bleedChance > 0 && Math.random() < bleedChance) {
    applyEnemyStatus(b, "bleed", 3, dotBaseTick("bleed", b.p.level));
    if (b.enemy.statuses.bleed > 0) push(b, `${b.enemy.def.name} истекает кровью от раны.`, "p");
  }
  const poisonChance = chanceOf("poison_damage");
  if (b.enemy.hp > 0 && poisonChance > 0 && Math.random() < poisonChance) {
    applyEnemyStatus(b, "poison", 3, dotBaseTick("poison", b.p.level));
    if (b.enemy.statuses.poison > 0) push(b, `Яд с клинка разъедает ${b.enemy.def.name}.`, "p");
  }
  const sunderChance = chanceOf("sunder");
  if (b.enemy.hp > 0 && sunderChance > 0 && b.enemy.armor > 0 && !bossResists(b) && Math.random() < sunderChance) {
    /* Чем выше уровень свойства, тем больше брони снимает каждое наложение. */
    const breakAmount = sunderBreakAmount(effectPower(b, "sunder"));
    b.enemy.armor = Math.max(0, b.enemy.armor - breakAmount);
    push(b, `Раскол: броня ${b.enemy.def.name} треснула (−${breakAmount}, осталось ${b.enemy.armor}).`, "p");
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
  let d = randInt(lo, hi) + statDamage(b.p.stats.str, b.p.passives) + bonusFlat;

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
  /* Слабость вампира режет обычные атаки; приёмы считаются отдельно и её не получают. */
  if (!opts.skill && (b.p.statuses.weakness ?? 0) > 0) d *= weaknessMult(b.p.statuses.weakness ?? 0);
  if (b.p.statuses.curse > 0) d = Math.round(d * (1 - (b.p.statuses.cursePower ?? 30) / 100));
  if (hasPassive(b, "relentless") && b.p.hp < b.p.maxHp * 0.35) d = Math.round(d * 1.5);
  if (hasLeg(b, "executioner") && b.enemy.hp <= b.enemy.maxHp * 0.5) d = Math.round(d * (1 + legPower(b, "executioner", "damage") / 100));

  const combatCrit: number[] = [];
  if (b.round <= 1 && hasPassive(b, "arch_assassin_5")) combatCrit.push(0.25);
  if (b.round <= 2 && hasGearPassive(b, "assassin_shadow")) combatCrit.push(passivePower(b, "assassin_shadow", "crit") / 100);
  if (b.p.statuses.quickblade > 0) combatCrit.push(0.25);
  const critChance = combatChance(b.p.chanceLayers.crit, combatCrit);
  let critMult = b.p.critDamage;
  if (b.round <= 1 && hasPassive(b, "arch_assassin_5")) critMult += 0.5;
  if (b.round <= 2 && hasGearPassive(b, "assassin_shadow")) critMult += passivePower(b, "assassin_shadow", "critMult") / 100;
  if (b.p.statuses.quickblade > 0) critMult += 0.5;
  let crit = false;
  const forceCrit = !!opts.forceCrit;
  if (forceCrit || (critChance > 0 && Math.random() < critChance)) {
    d *= critMult;
    crit = true;
  }
  return { d: Math.max(1, Math.round(d * mult * biomeStrikeMult(b.biome))), crit };
}

export function applyVamp(b: BattleState, dealt: number, extraRatio = 0, source: "weapon" | "skill" | "consumable" | "scroll" | "any" = "any", kind: "phys" | "magic" = "phys") {
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
    if (hasPassive(b, "arch_ninja_5")) ratio += 0.15;
    if (hasGearPassive(b, "ninja_phantom")) ratio += passivePower(b, "ninja_phantom", "vamp") / 100;
  }
  if (source === "scroll") {
    ratio += effectPower(b, "scroll_vamp") / 100;
    if (hasPassive(b, "arch_sage_5")) ratio += 0.08;
  }
  if (dealt > 0 && b.p.statuses.vampHits > 0 && (source === "weapon" || source === "skill")) {
    ratio += 0.25;
    b.p.statuses.vampHits--;
  }
  if (ratio <= 0 || dealt <= 0) return;
  const heal = healPlayer(b, Math.max(1, Math.round(dealt * ratio)));
  if (heal > 0) push(b, `Похищение жизни: +${heal} здоровья.`, "p");
}

/** Броня врага сейчас: воскресшая нежить теряет половину; в стойке (как у героя) — ×1.25 до его следующего хода. */
export function enemyArmorNow(e: { armor: number; revived?: boolean; guard?: boolean }): number {
  const base = e.revived ? Math.round(e.armor * (1 - REVIVE_DEBUFF)) : e.armor;
  return e.guard ? Math.round(base * GUARD_ARMOR_MULT) : base;
}

/**
 * Урон, который доходит до врага после его брони, защит и эффектов.
 * Бой и сводка («По противнику», урон приёма) считают одной функцией.
 */
export function damageAfterEnemyDefense(b: BattleState, raw: number, kind: "phys" | "magic"): number {
  let d = raw;
  if (hasLeg(b, "executioner") && kind !== "phys" && b.enemy.hp <= b.enemy.maxHp * 0.5) {
    d = Math.round(d * (1 + legPower(b, "executioner", "damage") / 100));
  }
  if (kind === "phys") {
    const pierce = rarePower(b, "pierce", "armor");
    const effArmor = Math.max(0, enemyArmorNow(b.enemy) - pierce - enemyOilArmorCut(b));
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
  if (!effectsDepleted(b)) d -= eEffect(b, "damage_resist");
  d = Math.max(1, d);
  return d;
}

/** Нежить падает до 0 ОЗ — поднимается полностью. Один раз за бой. */
function tryRevive(b: BattleState): boolean {
  const e = b.enemy;
  if (e.hp > 0 || !raceRevives(e.def.race) || e.reviveUsed) return false;
  e.reviveUsed = true;
  e.revived = true;
  e.hp = e.maxHp;
  push(b, `${e.def.name} поднимается из праха: полное здоровье, урон и броня −50%.`, "e");
  return true;
}

function hitEnemy(
  b: BattleState,
  raw: number,
  kind: "phys" | "magic",
  note = "",
  strike = kind === "phys",
  element?: DamageElement,
): number {
  /* Ловкий «без рода»: часть физических ударов он уводит и сам контратакует без урона для себя.
     Контратака героя сюда не попадает — иначе цепочка ударов не кончится. */
  if (
    strike && kind === "phys" && b.enemy.hp > 0 && b.enemy.def.race === "none" && b.enemy.mtype === "agile" &&
    !note.includes("[Контратака]") && Math.random() < NONE_AGILE_COUNTER_CHANCE
  ) {
    flash(b, "e", "miss", 0);
    push(b, `${b.enemy.def.name} уходит от удара и сам контратакует!${note}`, "e");
    const base = enemyEffectDamage(b, randInt(b.enemy.atk[0], b.enemy.atk[1]));
    incoming(b, Math.round(base * enemyChill(b)), "phys", `${b.enemy.def.name} контратакует`);
    return 0;
  }
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
  /* Костяной воин: поднятый щит принимает первую физическую атаку раунда. */
  if (b.enemy.shield && kind === "phys") {
    b.enemy.shield = false;
    flash(b, "e", "miss", 0);
    push(b, `Костяной щит принимает удар.${note}`, "e");
    return 0;
  }
  /* Пророк предвидит повтор прошлого приёма и уходит от него. */
  if (b.enemy.def.id === "seer" && b.repeatSkill && Math.random() < SEER_REPEAT_DODGE) {
    flash(b, "e", "miss", 0);
    push(b, `${b.enemy.def.name} предвидел повтор приёма и уходит от удара.${note}`, "e");
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
  const d = damageAfterEnemyDefense(b, raw, kind);
  b.enemy.hp -= d;
  flash(b, "e", "hit", d);
  push(b, `${b.enemy.def.name} получает ${d} урона.${note}`, "p", element);
  /* Шипы врага ранят только того, кто бьёт вплотную: обычная атака, второй
     удар, контратака и физические приёмы. Магический урон их не будит. */
  const thorns = !effectsDepleted(b) && kind === "phys" ? eEffect(b, "thorns") : 0;
  if (thorns > 0 && b.p.hp > 0) {
    b.p.hp -= thorns;
    push(b, `Шипы противника ранят тебя: −${thorns} ОЗ.`, "e");
  }
  /* Шлаковая шкура: 10% физического урона по стражу возвращается герою. */
  if (b.enemy.def.id === "golem" && kind === "phys" && d > 0 && b.p.hp > 0) {
    const back = Math.round(d * GOLEM_REFLECT_SHARE);
    if (back > 0) {
      b.p.hp -= back;
      push(b, `Шлаковая шкура возвращает тебе ${back} урона.`, "e");
    }
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
 * Урон стихией. Стихийный урон всегда магический: броню и уклонение игнорирует,
 * режется магическим сопротивлением. Уязвимый род получает в полтора раза больше,
 * а иммунный — ничего. Стихию знают свитки, зелья и часть приёмов.
 */
function elementalHit(
  b: BattleState,
  raw: number,
  note: string,
  element: DamageElement | undefined,
): number {
  const mult = enemyElementMult(b, element);
  if (element && mult <= 0) {
    flash(b, "e", "miss", 0);
    push(b, `${b.enemy.def.name} не получает урона от стихии (${ELEMENT_NAMES[element]}).${note}`, "sys", element);
    return 0;
  }
  if (element && mult > 1) {
    push(b, `Уязвимость к стихии: ${ELEMENT_NAMES[element]} бьёт в ×${mult}.`, "p", element);
    return hitEnemy(b, Math.round(raw * mult), "magic", note, false, element);
  }
  return hitEnemy(b, raw, "magic", note, false, element);
}

/** Множитель стихии с учётом правил вида: огонь по Стражу из шлака вдвое слабее. */
export function enemyElementMult(b: BattleState, element: DamageElement | undefined): number {
  const base = raceElementMult(b.enemy.def.race, element);
  if (b.enemy.def.id === "golem" && element === "fire") return base * GOLEM_FIRE_MULT;
  return base;
}

/** В защите (кнопка «Защита») броня героя растёт на 25% до его следующего хода. Урон не делится. */
export const GUARD_ARMOR_MULT = 1.25;

/** Броня героя в бою сейчас: надетая, временная, тоник и раскол; в защите — ×1.25. */
export function playerArmorNow(b: BattleState): number {
  const base = Math.max(0, b.p.armor + b.p.statuses.tempArmor + (b.p.statuses.ironTonic > 0 ? 4 : 0) - b.p.statuses.sundered - (b.p.statuses.rot ?? 0));
  return b.p.guard ? Math.round(base * GUARD_ARMOR_MULT) : base;
}

/** false означает, что враг промахнулся: побочные эффекты атаки тоже не срабатывают. */
/** Урон по герою после всех защит: броня, укрепление, сопротивления, стойка. Без бросков и побочных эффектов. */
function damageAfterPlayerDefense(
  b: BattleState,
  raw: number,
  kind: "phys" | "magic",
  strike: boolean,
  ignoreDefense: boolean,
): number {
  let d = raw;
  if (strike) d = Math.round(d * biomeStrikeMult(b.biome));
  const effArmor = playerArmorNow(b);
  if (kind === "phys") {
    if (!ignoreDefense) {
      d -= b.piercing ? piercingArmorCap(d, effArmor) : effArmor;
      d = Math.round(d * (1 - combatChance(b.p.chanceLayers.fortify)));
    }
  } else if (!ignoreDefense) {
    d = Math.round(d * (1 - combatChance(b.p.chanceLayers.magicResist)));
  }
  if (!ignoreDefense) d -= effectPower(b, "damage_resist");
  if (b.p.statuses.stone > 0) d = Math.round(d * 0.7);
  let guardMult = 1;
  if (b.p.guard) {
    guardMult -= effectPower(b, "guard_bonus") / 100;
    if (hasPassive(b, "arch_bulwark_5")) guardMult -= 0.15;
    if (hasGearPassive(b, "bulwark_wall")) guardMult -= passivePower(b, "bulwark_wall", "guard") / 100;
  }
  d = Math.round(d * Math.max(0.2, guardMult));
  if (hasGearPassive(b, "fortress")) d = Math.round(d * (1 - passivePower(b, "fortress", "resist") / 100));
  d = Math.max(1, d);
  return d;
}

/** Шанс, что удар по герою вообще попадёт (промахи мрака, ослепления, уклонения). Блокировки, которые срабатывают всегда, дают 0. */
function playerHitChance(b: BattleState, kind: "phys" | "magic", strike: boolean, ignoreDefense: boolean): number {
  if (b.p.statuses.fullGuard > 0 || b.p.statuses.invulnerable > 0 || b.p.statuses.dodgeNext > 0 || b.p.statuses.smoke > 0) return 0;
  if (!ignoreDefense && kind === "phys" && b.p.statuses.evadeTurn > 0) return 0;
  let p = 1;
  const darkMiss = (b.torchTurns ?? 0) > 0 ? 0 : biomeMissChance(b.biome);
  if (!ignoreDefense && strike) p *= 1 - darkMiss;
  if (enemyOil(b, "light")) p *= 1 - OIL_BLIND_MISS;
  if (!ignoreDefense && kind === "phys") p *= 1 - combatChance(b.p.chanceLayers.evade);
  return p;
}

/** Первый удар героя в бою оглушает врага на ход (Ассасин 10). Босс устойчив, как и к другим оглушениям. */
function firstStrikeStun(b: BattleState) {
  if (b.enemy.hp <= 0 || bossResists(b)) return;
  b.enemy.statuses.stunAp = Math.min(2, b.enemy.statuses.stunAp + 1);
  push(b, `Первый удар в бою оглушает ${b.enemy.def.name}.`, "p");
}

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
  /* Световое масло на враге ослепляет его: каждый удар может уйти мимо. */
  if (enemyOil(b, "light") && Math.random() < OIL_BLIND_MISS) {
    flash(b, "p", "miss", 0);
    push(b, `${b.enemy.def.name} ослеплён светом: ${src} — промах.`, "sys");
    return false;
  }
  if (b.p.statuses.invulnerable > 0) {
    flash(b, "p", "guard", 0);
    push(b, `Неуязвимость поглощает удар (${src}).`, "p");
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
  if (!ignoreDefense && kind === "phys" && b.p.statuses.evadeTurn > 0) {
    flash(b, "p", "miss", 0);
    push(b, `Неуловимость: ${src} проходит мимо.`, "e");
    return false;
  }
  if (!ignoreDefense && kind === "phys" && Math.random() < combatChance(b.p.chanceLayers.evade)) {
    flash(b, "p", "miss", 0);
    push(b, `Ты уходишь с линии удара — промах!`, "e");
    grantDodgeAction(b);
    return false;
  }
  /* Библиотека душ (Мудрец 10): первый удар по герою в бою полностью блокируется. */
  if (hasPassive(b, "arch_sage_10") && !b.p.sageWardUsed) {
    b.p.sageWardUsed = true;
    flash(b, "p", "miss", 0);
    push(b, `Библиотека душ блокирует первый удар (${src}).`, "p");
    return false;
  }
  const d = damageAfterPlayerDefense(b, raw, kind, strike, ignoreDefense);
  b.p.hp -= d;
  flash(b, "p", "hit", d);
  push(b, `${src} — тебе ${d} урона.`, "e");
  /* Угольный бес: каждое попадание поджигает героя на раунд. */
  if (b.enemy.def.id === "imp" && b.p.hp > 0) {
    setPlayerTick(b, "burn", statusRounds(b, 1), dotBaseTick("burn", b.enemy.level));
    push(b, "Угольный жар поджигает тебя на 1 раунд.", "e");
  }

  // Ядовитый враг отравляет игрока физическим уроном.
  if (b.enemy.passive?.id === "venom" && kind === "phys" && b.p.hp > 0 && !tryResist(b, "яд")) {
    const stacks = applyPlayerDot(b, "poison", 2, dotBaseTick("poison", b.enemy.level));
    if (stacks > 0) push(b, `Яд врага попал в кровь: отравление на 2 раунда, наложений ${stacks}.`, "e");
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
  /* Ответный замах: каждый физический удар, который прошёл, получает ответ. */
  if (kind === "phys" && b.p.statuses.counterTurn > 0 && b.p.hp > 0 && b.enemy.hp > 0) {
    const { d: cd } = calcWeaponRoll(b, 0.6);
    const dealt = hitEnemy(b, cd, "phys", " [Ответный замах]");
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
    const gold = dungeonGold(randInt(e.gold[0], e.gold[1]));
    const items = rollConsumableLoot(b.floor, 2);
    // Босс — единственный, кто может оставить легендарное: 50/10/1.
    const gear: GearItem[] = [rollGearDrop(b.floor, BOSS_RARITY_WEIGHTS, e.level)];
    b.loot = { gold, items, gear, xp: enemyXpFor(b) };
    return;
  }

  // Обычный монстр: золото, реагенты, припасы и снаряжение выпадают каждое своим броском.
  const drop = rollEnemyLoot(e.level, b.floor, e.threat);
  b.loot = { gold: drop.gold, items: drop.items, gear: drop.gear, xp: enemyXpFor(b) };
}

/** Environmental tick at the start of the active side's turn. Called once per queue step. */
/**
 * Страх героя. Не обновляется, пока держится, и не возвращается сразу после окончания:
 * после него 1 раунд иммунитета. Если герой уже походил в этом раунде, страх
 * переходит на следующий раунд целиком (2 раунда счётчика), иначе — на текущий.
 */
/** После страха герой ещё столько раундов не боится (иммунитет тает по одному в конце раунда). */
const FEAR_IMMUNE_ROUNDS = 3;

function applyHeroFear(b: BattleState, note: string) {
  if (b.p.statuses.fear > 0) return;
  if (b.p.statuses.fearImmune > 0) {
    push(b, "Страх не действует: ты держишься после прошлого приступа.", "sys");
    return;
  }
  const heroTurnLeft = b.queue.slice(b.idx + 1).includes("p");
  b.p.statuses.fear = heroTurnLeft ? 1 : 2;
  push(b, note, "e");
}

function beginTurn(b: BattleState) {
  if (b.over) return;
  const side = b.queue[b.idx];
  if (!side) return;

  /* Страх: в свой ход герой сам встаёт в защиту, без кнопки. */
  if (side === "p" && b.p.statuses.fear > 0) {
    b.p.guard = true;
    flash(b, "p", "guard", 0);
    push(b, "Страх сковывает волю: ты в защите. Можно достать вещь из рюкзака или остаться в защите.", "e");
  }

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

  if (b.enemy.hp <= 0 && !tryRevive(b)) {
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

/** Правила, которые готовятся в начале раунда: щит костяного воина и объявление пророка. */
function prepareRoundRules(b: BattleState) {
  const e = b.enemy;
  if (e.def.id === "bone") {
    e.shield = boneShieldUp(b.round);
    if (e.shield) push(b, `${e.def.name} поднимает костяной щит: первая атака героя в этом раунде будет заблокирована.`, "e");
  }
  if (e.def.id === "seer" && e.hp > 0 && !b.over) {
    e.announced = chooseEnemyMove(b);
    push(b, `${e.def.name} объявляет: ${MOVE_LABELS[e.announced] ?? e.announced}.`, "e");
  }
}

function advance(b: BattleState) {
  if (b.over) return;
  /* Счётчики хода героя начинаются заново, когда очередь уходит дальше. */
  b.p.turnConsumables = 0;
  b.p.turnScrolls = 0;
  b.p.turnPouch = 0;
  //.Печати живут ровно один ход игрока: снимаются после его действия.
  if (b.queue[b.idx] === "p") {
    b.p.statuses.sealItems = Math.max(0, b.p.statuses.sealItems - 1);
    b.p.statuses.sealSkills = Math.max(0, b.p.statuses.sealSkills - 1);
    b.p.statuses.sealAttack = Math.max(0, b.p.statuses.sealAttack - 1);
  }
  const idx = b.idx + 1;
  if (idx >= b.queue.length) {
    /* конец раунда */
    const warded = b.p.statuses.invulnerable > 0;
    if (!warded && b.p.statuses.wound > 0 && !hasLeg(b, "titan_heart")) {
      const stacks = playerDotStacks(b, "wound");
      const d = b.p.statuses.woundTick * stacks;
      b.p.hp -= d;
      push(b, `Кровотечение отнимает ${d} здоровья${stacks > 1 ? ` (${stacks} наложения)` : ""}.`, "sys");
    }
    if (!warded && b.p.statuses.poison > 0 && b.p.hp > 0) {
      const stacks = playerDotStacks(b, "poison");
      const d = b.p.statuses.poisonTick * stacks;
      b.p.hp -= d;
      push(b, `Яд в твоей крови отнимает ${d} здоровья${stacks > 1 ? ` (${stacks} наложения)` : ""}.`, "e");
    }
    if (!warded && b.p.statuses.burn > 0 && b.p.hp > 0) {
      const d = b.p.statuses.burnTick;
      b.p.hp -= d;
      push(b, `Горение отнимает ${d} здоровья.`, "e");
    }
    if (!warded && b.p.statuses.chill > 0 && b.p.hp > 0) {
      const d = magicTickFrom(b.p.statuses.chillTick, combatChance(b.p.chanceLayers.magicResist));
      b.p.hp -= d;
      push(b, `Обморожение отнимает ${d} здоровья и режет лечение вдвое.`, "e");
    }
    if (!warded && b.p.statuses.curse > 0 && b.p.hp > 0) {
      const d = magicTickFrom(b.p.statuses.curseTick, combatChance(b.p.chanceLayers.magicResist));
      b.p.hp -= d;
      push(b, `Проклятие выжигает ${d} здоровья.`, "e");
    }
    if (b.enemy.statuses.bleed > 0 && b.enemy.hp > 0) {
      const stacks = enemyDotStacks(b, "bleed");
      const d = b.enemy.statuses.bleedTick * stacks;
      b.enemy.hp -= d;
      push(b, `${b.enemy.def.name} истекает кровью: −${d} ОЗ${stacks > 1 ? ` (${stacks} наложения)` : ""}.`, "p");
    }
    if (b.enemy.statuses.poison > 0 && b.enemy.hp > 0) {
      const stacks = enemyDotStacks(b, "poison");
      const d = b.enemy.statuses.poisonTick * stacks;
      b.enemy.hp -= d;
      push(b, `Яд разъедает ${b.enemy.def.name}: −${d} ОЗ${stacks > 1 ? ` (${stacks} наложения)` : ""}.`, "p");
    }
    if (b.enemy.statuses.burn > 0 && b.enemy.hp > 0) {
      const d = b.enemy.statuses.burnTick;
      b.enemy.hp -= d;
      push(b, `${b.enemy.def.name} горит: −${d} ОЗ.`, "p");
    }
    if (b.enemy.statuses.chill > 0 && b.enemy.hp > 0) {
      const d = magicTickFrom(b.enemy.statuses.chillTick, eChance(b, "magic_resist"));
      b.enemy.hp -= d;
      push(b, `Обморожение отнимает ${d} ОЗ у ${b.enemy.def.name}.`, "p");
    }
    if (b.enemy.statuses.curse > 0 && b.enemy.hp > 0) {
      const d = magicTickFrom(b.enemy.statuses.curseTick, eChance(b, "magic_resist"));
      b.enemy.hp -= d;
      push(b, `Проклятие выжигает ${d} ОЗ у ${b.enemy.def.name}.`, "p");
    }
    if (b.enemy.statuses.blight > 0 && b.enemy.hp > 0 && b.enemy.statuses.blightTick > 0) {
      const d = b.enemy.statuses.blightTick;
      b.enemy.hp -= d;
      push(b, `Порча разъедает ${b.enemy.def.name}: −${d} ОЗ.`, "p");
    }
    if (b.enemy.statuses.oilType && b.enemy.statuses.oilRounds > 0 && b.enemy.hp > 0) {
      const kind = b.enemy.statuses.oilType;
      const element = isDamageElement(kind) ? kind : undefined;
      const mult = element ? enemyElementMult(b, element) : 1;
      const raw = oilTickDamage(kind, b.enemy.statuses.oilTick, eChance(b, "magic_resist"));
      if (raw > 0 && mult > 0) {
        const d = Math.max(1, Math.round(raw * mult));
        b.enemy.hp -= d;
        const weak = mult > 1 ? ` Уязвимость ×${mult}.` : "";
        push(b, `${damageTypeName(kind)} масла отнимает ${d} ОЗ у ${b.enemy.def.name}.${weak}`, "p", element);
      }
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
      (hasPassive(b, "arch_bulwark_5") ? 3 + Math.floor(playerArmorNow(b) / 10) : 0) +
      passivePower(b, "bulwark_wall", "regen") +
      (hasPassive(b, "arch_barbarian_10") ? Math.round(b.p.maxHp * 0.01 * Math.min(10, Math.floor(missingHpRatio(b) * 10))) : 0) +
      (b.p.statuses.ironTonic > 0 ? 4 : 0) +
      (b.p.statuses.regenPotion > 0 ? 5 : 0);
    if (regen > 0 && b.p.hp > 0) {
      const healed = healPlayer(b, regen);
      if (healed > 0) push(b, `Регенерация: +${healed} здоровья.`, "p");
    }

    const prevCurse = b.p.statuses.curse;
    const prevRage = b.p.statuses.rage;
    const prevWound = b.p.statuses.wound;
    const prevPoison = b.p.statuses.poison;

    const fearWas = b.p.statuses.fear;
    if (fearWas > 0) {
      b.p.statuses.fear = fearWas - 1;
      if (b.p.statuses.fear === 0) {
        b.p.statuses.fearImmune = FEAR_IMMUNE_ROUNDS;
        push(b, `Страх отпустил. Ещё ${FEAR_IMMUNE_ROUNDS} раунда тебя не испугать.`, "sys");
      }
    } else if (b.p.statuses.fearImmune > 0) {
      b.p.statuses.fearImmune -= 1;
    }

    b.p.statuses.wound = Math.max(0, b.p.statuses.wound - 1);
    /* Гниение: слои держатся два раунда, потом броня возвращается. */
    if ((b.p.statuses.rotRounds ?? 0) > 0) {
      b.p.statuses.rotRounds = (b.p.statuses.rotRounds ?? 0) - 1;
      if (b.p.statuses.rotRounds === 0 && (b.p.statuses.rot ?? 0) > 0) {
        b.p.statuses.rot = 0;
        push(b, "Гниение отступило: броня вернулась.", "sys");
      }
    }
    if (!isBattleCurse(b.p.statuses.curse)) b.p.statuses.curse = Math.max(0, b.p.statuses.curse - 1);
    b.p.statuses.poison = Math.max(0, b.p.statuses.poison - 1);
    b.p.statuses.burn = Math.max(0, b.p.statuses.burn - 1);
    b.p.statuses.chill = Math.max(0, b.p.statuses.chill - 1);
    b.p.statuses.wither = Math.max(0, b.p.statuses.wither - 1);
    b.p.statuses.rage = Math.max(0, b.p.statuses.rage - 1);
    b.p.statuses.ironTonic = Math.max(0, b.p.statuses.ironTonic - 1);
    b.p.statuses.regenPotion = Math.max(0, b.p.statuses.regenPotion - 1);
    b.p.statuses.resistPotion = Math.max(0, b.p.statuses.resistPotion - 1);
    b.p.statuses.bloodRage = Math.max(0, b.p.statuses.bloodRage - 1);
    b.p.statuses.noHeal = Math.max(0, b.p.statuses.noHeal - 1);
    b.p.statuses.darkness = Math.max(0, b.p.statuses.darkness - 1);
    b.p.statuses.quickblade = Math.max(0, b.p.statuses.quickblade - 1);
    b.p.statuses.pactElixir = Math.max(0, b.p.statuses.pactElixir - 1);
    b.p.statuses.fullGuard = Math.max(0, b.p.statuses.fullGuard - 1);
    b.p.statuses.invulnerable = Math.max(0, b.p.statuses.invulnerable - 1);
    b.p.statuses.evadeTurn = Math.max(0, b.p.statuses.evadeTurn - 1);
    b.p.statuses.counterTurn = Math.max(0, b.p.statuses.counterTurn - 1);
    for (const k of IMMUNITY_EFFECTS) {
      const left = b.p.statuses.immune[k] ?? 0;
      if (left <= 0) continue;
      b.p.statuses.immune[k] = left - 1;
      if (left === 1) push(b, `Иммунитет: ${IMMUNITY_NAMES[k]} снова может накладываться.`, "sys");
    }

    if (prevCurse > 0 && b.p.statuses.curse === 0)
      push(b, "Проклятие рассеялось! Твой урон вернулся к норме.", "sys");
    if (prevRage > 0 && b.p.statuses.rage === 0)
      push(b, "Ярость угасла: урон вернулся к обычному.", "sys");
    if (prevWound > 0 && b.p.statuses.wound === 0)
      push(b, "Раны затянулись — кровотечение остановилось.", "sys");
    if (prevPoison > 0 && b.p.statuses.poison === 0)
      push(b, "Яд вышел из крови.", "sys");

    if (b.p.statuses.oilRounds > 0) {
      b.p.statuses.oilRounds -= 1;
      if (b.p.statuses.oilRounds === 0) {
        b.p.statuses.oilType = null;
        push(b, "Масло на клинке высохло.", "sys");
      }
    }
    if (b.enemy.statuses.oilRounds > 0) {
      b.enemy.statuses.oilRounds -= 1;
      if (b.enemy.statuses.oilRounds === 0) {
        const name = b.enemy.statuses.oilType ? damageTypeName(b.enemy.statuses.oilType) : "";
        b.enemy.statuses.oilType = null;
        if (name) push(b, `${name} масла на ${b.enemy.def.name} угасло.`, "sys");
      }
    }
    b.enemy.statuses.chill = Math.max(0, b.enemy.statuses.chill - 1);
    b.enemy.statuses.bleed = Math.max(0, b.enemy.statuses.bleed - 1);
    b.enemy.statuses.poison = Math.max(0, b.enemy.statuses.poison - 1);
    b.enemy.statuses.blight = Math.max(0, b.enemy.statuses.blight - 1);
    b.enemy.statuses.wither = Math.max(0, b.enemy.statuses.wither - 1);
    b.enemy.statuses.burn = Math.max(0, b.enemy.statuses.burn - 1);
    b.enemy.statuses.sealMoves = Math.max(0, b.enemy.statuses.sealMoves - 1);
    b.enemy.statuses.curse = Math.max(0, b.enemy.statuses.curse - 1);
    if (b.enemy.depleted > 0) {
      b.enemy.depleted -= 1;
      if (b.enemy.depleted === 0) push(b, `Истощение спадает: ${b.enemy.def.name} снова чувствует свои эффекты.`, "e");
    }

    if (b.p.weaponCd > 0) b.p.weaponCd -= 1;
    for (const k of Object.keys(b.p.epicCds)) {
      if (b.p.epicCds[k] > 0) b.p.epicCds[k] -= 1;
    }
    for (const k of Object.keys(b.p.armorCds)) {
      if (b.p.armorCds[k] > 0) b.p.armorCds[k] -= 1;
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
    prepareRoundRules(b);

    if (b.enemy.hp <= 0 && !tryRevive(b)) {
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
/* ═══════════  СОЗДАННОЕ В БОЮ И КОНЦЕНТРАЦИЯ  ═══════════ */

/** Созданное в бою кладётся в боевой рюкзак и помечается, чтобы не перейти герою после боя. */
function addConjured(b: BattleState, id: string) {
  b.bag[id] = (b.bag[id] ?? 0) + 1;
  b.conjured[id] = (b.conjured[id] ?? 0) + 1;
}

/** Расход из рюкзака: сначала тратится созданное в бою, поэтому личный запас не меняется. */
function spendBagItem(b: BattleState, id: string) {
  b.bag[id] = (b.bag[id] ?? 0) - 1;
  if (b.bag[id] <= 0) delete b.bag[id];
  const c = b.conjured[id] ?? 0;
  if (c > 0) {
    if (c === 1) delete b.conjured[id];
    else b.conjured[id] = c - 1;
  }
}

/** Рюкзак героя после боя (победа, побег, сохранение): без созданного в бою. */
export function persistentBag(b: BattleState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(b.bag)) {
    const left = n - (b.conjured[id] ?? 0);
    if (left > 0) out[id] = left;
  }
  return out;
}

export const MAX_CONCENTRATION = 5;
/** Спец-приём архетипа открывается при полной концентрации и тратит её всю. */
const SPECIAL_CONCENTRATION = 5;
/** Пул расходников ниндзя: метательные, дымовая бомба исключена — она не наносит урона. */
const NINJA_CONJURE_POOL = ["serrated_knife", "poison_dart", "acid_vial", "blast_bomb"];
const NINJA_CONJURED = 5;
const NINJA_THROWS = 2;
const SAGE_CONJURED = 2;
const SAGE_VAMP_BONUS = 0.25;
const WARLOCK_HP_SHARE = 0.5;
/** Любой приём (оружия, эпический, брони) требует концентрации и тратит её на использование (−1). */
const TECHNIQUE_CONCENTRATION = 1;
function techniqueConcentrationMsg(b: BattleState): string {
  return `Приём требует ${TECHNIQUE_CONCENTRATION} концентрации (сейчас ${b.p.concentration}).`;
}

/** Концентрация за ход: атака +1, приём −1, расходник +1, защита +2. Только для хода героя, не для внутренних розыгрышей. */
function adjustConcentration(b: BattleState, type: PlayerAction["type"]) {
  const before = b.p.concentration;
  let delta = 0;
  if (type === "attack") delta = 1;
  else if (type === "weapon_skill" || type === "epic_skill" || type === "armor_skill") delta = -1;
  else if (type === "item") delta = 1;
  else if (type === "guard") delta = 2;
  if (delta === 0) return;
  b.p.concentration = Math.max(0, Math.min(MAX_CONCENTRATION, before + delta));
  if (before < MAX_CONCENTRATION && b.p.concentration === MAX_CONCENTRATION && b.p.archetype) {
    push(b, `Концентрация ${MAX_CONCENTRATION}/${MAX_CONCENTRATION}: спец-приём «${ARCHETYPES[b.p.archetype].special.name}» готов.`, "p");
  }
}

/** Причина, по которой спец-приём сейчас нельзя применить (или null). Концентрация не тратится при отказе. */
function archetypeSpecialBlock(b: BattleState): string | null {
  const arch = b.p.archetype;
  if (!arch) return "У тебя нет архетипа: спец-приём недоступен.";
  if (b.p.concentration < SPECIAL_CONCENTRATION) {
    return `Спец-приём открывается при концентрации ${SPECIAL_CONCENTRATION} (сейчас ${b.p.concentration}).`;
  }
  if (b.p.statuses.sealSkills > 0) return "Печать забвения запрещает приёмы в этот ход.";
  if (arch === "barbarian" && b.p.hp >= b.p.maxHp) return "Кровавый расчёт нужен недостающее здоровье: концентрация не потрачена.";
  if (arch === "ninja" && b.p.statuses.sealItems > 0) return "Печать немоты запрещает расходники в этот ход.";
  return null;
}

/** Спец-приём архетипа. Вызывается только после archetypeSpecialBlock. */
function runArchetypeSpecial(b: BattleState, arch: ArchetypeId) {
  const sp = ARCHETYPES[arch].special;
  push(b, `«${sp.name}»: концентрация потрачена.`, "p");
  if (arch === "barbarian") {
    const missing = b.p.maxHp - b.p.hp;
    hitEnemy(b, Math.max(1, missing), "phys", ` [${sp.name}: недостающее здоровье ${missing}]`);
  } else if (arch === "bulwark") {
    b.p.guard = true;
    const armorNow = Math.max(1, Math.round(playerArmorNow(b)));
    const heal = healPlayer(b, armorNow);
    if (heal > 0) flash(b, "p", "heal", heal);
    b.p.statuses.bulwarkStrike = armorNow;
    push(b, `Стойка-щит: +${heal} здоровья; следующая атака получит +${armorNow} урона от брони.`, "p");
  } else if (arch === "assassin") {
    const { d } = calcWeaponRoll(b, 1, 0, { forceCrit: true });
    const dealt = hitEnemy(b, d, "phys", ` [${sp.name}, КРИТ!]`);
    applyVamp(b, dealt, 0.2, "weapon");
    if (dealt > 0) oilOnHit(b, dealt);
    weaponHitEffects(b);
  } else if (arch === "ninja") {
    ninjaVolley(b);
  } else if (arch === "warlock") {
    b.p.hp = Math.max(1, Math.round(b.p.maxHp * WARLOCK_HP_SHARE));
    b.p.statuses.invulnerable = Math.max(b.p.statuses.invulnerable, 1);
    push(b, `Жертвенный пакт: здоровье ${b.p.hp}/${b.p.maxHp}, неуязвимость на 1 ход.`, "p");
  } else if (arch === "sage") {
    const created = createScrolls(b, SAGE_CONJURED);
    push(b, `Слово созидания создаёт свитки: ${created.join(", ")}.`, "p");
    if (created.length > 0) castCreatedScroll(b, created[0], SAGE_VAMP_BONUS);
  }
}

/** Град снарядов: 5 расходников в боевой рюкзак, 2 из них сразу бросаются во врага по обычным правилам. */
function ninjaVolley(b: BattleState) {
  const made: string[] = [];
  for (let i = 0; i < NINJA_CONJURED; i++) {
    const id = pick(NINJA_CONJURE_POOL);
    addConjured(b, id);
    made.push(id);
  }
  push(b, `Град снарядов: в рюкзак легли ${made.map((id) => ITEMS[id]?.name ?? id).join(", ")}.`, "p");
  const left = made.filter((id) => b.p.stats.int >= consumableIntReq(ITEMS[id], b.p.intDiscount));
  for (let i = 0; i < NINJA_THROWS && left.length > 0 && !b.over; i++) {
    const id = pick(left);
    left.splice(left.indexOf(id), 1);
    Object.assign(b, actInternal(b, { type: "item", id }, false));
  }
}

function createScrolls(b: BattleState, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = pick(CREATED_SCROLLS);
    addConjured(b, id);
    out.push(ITEMS[id]?.name ?? id);
  }
  return out;
}
function castCreatedScroll(b: BattleState, name: string, extraMagicVamp = 0) {
  const id = CREATED_SCROLLS.find((x) => ITEMS[x]?.name === name);
  if (!id || !b.bag[id]) return;
  const def = ITEMS[id];
  const power = consumablePower(def, b.p.stats);
  const mult = consumableDamageMult(b, def);
  if (def.use?.type === "heal") {
    const amt = healPlayer(b, Math.round(power * mult));
    push(b, `${def.name} сразу применяется: +${amt} здоровья.`, "p");
  } else if (def.use?.type === "chill") {
    const dealt = elementalHit(b, Math.round(power * mult), ` [${def.name}, сотворён]`, def.use?.element ?? "ice");
    applyEnemyStatus(b, "chill", 3, dotBaseTick("chill", b.p.level));
    applyVamp(b, dealt, extraMagicVamp, "scroll", "magic");
  } else if (def.use?.type === "terror") {
    b.enemy.forceGuard = Math.max(b.enemy.forceGuard, 2);
    push(b, `${def.name} сразу применяется: враг держит защиту.`, "p");
  } else {
    const dealt = elementalHit(b, Math.round(power * mult), ` [${def.name}, сотворён]`, def.use?.element);
    applyVamp(b, dealt, extraMagicVamp, "scroll", "magic");
  }
  spendBagItem(b, id);
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
    m *= 1 + (b.p.stats.agi * effectPower(b, "precision")) / 100 + effectPower(b, "consumable_damage") / 100 +
      (hasPassive(b, "arch_ninja_5") ? 0.1 * b.p.stats.agi : 0);
    if (hasPassive(b, "arch_ninja_5")) m *= 1.25;
  }
  const debuffs = enemyDebuffCount(b);
  m *= 1 + (effectPower(b, "debuff_damage") / 100) * Math.min(4, debuffs);
  if (hasPassive(b, "arch_ninja_10")) m *= 1 + Math.min(0.4, debuffs * 0.10);
  return m;
}
function consumablePowerWithGear(b: BattleState, def: ItemDef) {
  return consumablePower(def, b.p.stats);
}

/** Приём брони: урон и лечение от характеристики приёма, эффекты — из его данных. */
function applyArmorSkill(b: BattleState, sk: ArmorSkillView) {
  const st = b.p.stats[sk.scaleStat];
  if (sk.dmg && b.enemy.hp > 0) {
    const raw = sk.dmg.base + sk.dmg.stat * st + (sk.dmg.armor ?? 0) * b.p.armor;
    const kind = sk.dmg.magic ? "magic" : "phys";
    const dealt = hitEnemy(b, Math.max(1, Math.round(raw)), kind, ` [${sk.name}]`);
    applyVamp(b, dealt, 0, "skill", kind);
  }
  if (sk.heal) {
    const heal = healPlayer(b, Math.max(1, Math.round(sk.heal.base + sk.heal.stat * st)));
    flash(b, "p", "heal", heal);
    push(b, `${sk.name}: +${heal} здоровья.`, "p");
  }
  const e = sk.enemy ?? {};
  if (e.stun && b.enemy.hp > 0 && !bossResists(b)) {
    b.enemy.statuses.stunAp = Math.min(2, b.enemy.statuses.stunAp + e.stun);
    push(b, `${b.enemy.def.name} теряет ${e.stun} ход (${sk.name}).`, "p");
  }
  if (e.bleed && b.enemy.hp > 0) applyEnemyStatus(b, "bleed", e.bleed, skillDotTick("bleed", b.p.level, b.enemy.maxHp));
  if (e.poison && b.enemy.hp > 0) applyEnemyStatus(b, "poison", e.poison, skillDotTick("poison", b.p.level, b.enemy.maxHp));
  if (e.chill && b.enemy.hp > 0) applyEnemyStatus(b, "chill", e.chill, skillDotTick("chill", b.p.level, b.enemy.maxHp));

  const s = sk.self ?? {};
  if (s.guard) b.p.guard = true;
  if (s.cleanse) {
    b.p.statuses.wound = 0;
    b.p.statuses.woundStacks = 0;
    b.p.statuses.poison = 0;
    b.p.statuses.poisonStacks = 0;
  }
  if (s.fullGuard) b.p.statuses.fullGuard = Math.max(b.p.statuses.fullGuard, s.fullGuard);
  if (s.immune) {
    for (const k of IMMUNITY_EFFECTS) b.p.statuses.immune[k] = Math.max(b.p.statuses.immune[k] ?? 0, s.immune);
  }
  if (s.evadeTurn) b.p.statuses.evadeTurn = Math.max(b.p.statuses.evadeTurn, s.evadeTurn);
  if (s.counterTurn) b.p.statuses.counterTurn = Math.max(b.p.statuses.counterTurn, s.counterTurn);
  if (s.dodgeNext) b.p.statuses.dodgeNext += s.dodgeNext;
  if (s.shadowStep) b.p.statuses.shadowStep += s.shadowStep;
  if (s.smoke) b.p.statuses.smoke = Math.max(b.p.statuses.smoke, s.smoke);
  if (s.stone) b.p.statuses.stone = Math.max(b.p.statuses.stone, s.stone);
  if (s.rage) b.p.statuses.rage = Math.max(b.p.statuses.rage, s.rage);
  if (s.ironTonic) b.p.statuses.ironTonic = Math.max(b.p.statuses.ironTonic, s.ironTonic);
  push(b, `«${sk.name}»: ${armorSkillDesc(ARMOR_SKILLS[sk.id])}`, "p");
}

/**
 * Оглушение: ход героя пропускается целиком. Действие не тратится и не засчитывается,
 * очередь сразу уходит дальше. Экран вызывает это сам, без кнопки.
 */
export function skipStunnedTurn(b0: BattleState): BattleState {
  if (b0.over || b0.queue[b0.idx] !== "p" || b0.p.statuses.stunAp <= 0) return b0;
  const b = clone(b0);
  b.p.statuses.stunAp--;
  push(b, "Оглушение: ты пропускаешь этот ход.", "e");
  advance(b);
  return b;
}

export function playerAct(b0: BattleState, a: PlayerAction): BattleState {
  if (b0.over || b0.queue[b0.idx] !== "p") return b0;
  if (b0.p.statuses.stunAp > 0) return skipStunnedTurn(b0);
  return actInternal(b0, a, true);
}

/** takeTurn=false — внутренний розыгрыш (бросок расходника приёмом ниндзя): ход не тратится, концентрация не меняется. */
function actInternal(b0: BattleState, a: PlayerAction, takeTurn: boolean): BattleState {
  if (b0.over || b0.queue[b0.idx] !== "p") return b0;
  const b = clone(b0);
  /* Страх: защиту герой уже занял в начале хода (beginTurn). Пока страх держится,
     атаковать, применять приёмы и бежать нельзя; рюкзак и защита доступны. */
  const fearTurn = b.p.statuses.fear > 0;
  const previousGuard = b.p.guard;
  b.p.guard = false;

  const err = (msg: string) => {
    b.p.guard = previousGuard;
    push(b, msg, "sys");
    return b;
  };

  if (fearTurn && a.type !== "item" && a.type !== "guard" && a.type !== "flee") {
    return err("Страх: атаковать и применять приёмы нельзя. Доступны рюкзак, защита и побег.");
  }

  const spellPowerMult =
    (hasPassive(b, "resonance") ? 1.4 : 1) * (1 + legPower(b, "archmage_blood", "spellDamage") / 100);

  if (a.type === "attack" && b.p.statuses.sealAttack > 0) return err("Печать оков запрещает обычную атаку в этот ход.");
  if ((a.type === "weapon_skill" || a.type === "epic_skill" || a.type === "armor_skill") && b.p.statuses.sealSkills > 0) return err("Печать забвения запрещает приёмы в этот ход.");
  /* Пророк запоминает приём: повтор того же приёма подряд он предвидит. */
  if (takeTurn) {
    const skillKey =
      a.type === "weapon_skill" || a.type === "epic_skill" || a.type === "armor_skill" || a.type === "archetype_skill"
        ? `${a.type}:${(a as { id?: string }).id ?? ""}`
        : null;
    b.repeatSkill = skillKey !== null && skillKey === b.lastSkill;
    b.lastSkill = skillKey;
  }
  if (a.type === "item" && b.p.statuses.sealItems > 0) return err("Печать немоты запрещает расходники в этот ход.");

  /* Расходник, который не тратит ход: игрок остаётся на своём ходу (Ниндзя 10, Мудрец 10). */
  let freeAction = false;
  switch (a.type) {
    case "attack": {
      const firstStrike = !b.p.firstAttackDone && hasPassive(b, "arch_assassin_10");
      const { d, crit } = calcWeaponRoll(b);
      /* Бастион: после стойки следующая обычная атака получает броню стойки как прямой урон (один раз). */
      const strikeBonus = b.p.statuses.bulwarkStrike;
      b.p.statuses.bulwarkStrike = 0;
      const dealt = hitEnemy(
        b,
        d + strikeBonus,
        "phys",
        (crit ? " Критический удар!" : "") + (strikeBonus > 0 ? ` [Стойка: +${strikeBonus}]` : ""),
      );
      applyVamp(b, dealt, 0, "weapon");
      if (dealt > 0) oilOnHit(b, dealt);
      b.p.firstAttackDone = true;
      if (firstStrike) firstStrikeStun(b);
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
      if (b.p.concentration < TECHNIQUE_CONCENTRATION) return err(techniqueConcentrationMsg(b));
      if (b.p.weaponCd > 0) return err(`Приём «${ws.name}» перезаряжается ещё ${b.p.weaponCd} р.`);
      const req = Math.max(1, ws.intReq - b.p.intDiscount);
      if (b.p.stats.int < req) return err(`Для приёма «${ws.name}» требуется ИНТ ${req}.`);

      const bonus = techniqueBonusNow(b, ws);
      const eff = ws.effect;
      const trueDamage = eff === "pierce" || eff === "chill" || eff === "leech" || eff === "skill_leech";
      const magicSkill = !!ws.magic;
      const hits = eff === "double_attack" ? scaleIntegerByLevel(2, ws.level ?? 1) : 1;
      let dealtTotal = 0;
      const firstStrike = !b.p.firstAttackDone && hasPassive(b, "arch_assassin_10");
      for (let i = 0; i < hits; i++) {
        //.Multi-hit: каждый удар — отдельная обычная атака без бонуса приёма.
        const isMulti = eff === "double_attack";
        const { d, crit } = calcWeaponRoll(b, 1, isMulti ? 0 : bonus, { skill: !isMulti, multi: isMulti, forceCrit: !isMulti && eff === "guaranteed_crit" && b.round <= 2 });
        /* Пробивающие приёмы (пронзить, холод, высасывание) — магические удары, но вампиризм считают физическим. */
        const hitKind: "phys" | "magic" = trueDamage || magicSkill ? "magic" : "phys";
        const dealt = hitEnemy(b, d, hitKind, ` [Приём: ${ws.name}${crit ? ", КРИТ!" : ""}${hits > 1 ? ` ${i + 1}/${hits}` : ""}]`, true);
        dealtTotal += dealt;
        applyVamp(b, dealt, 0, "weapon", trueDamage ? "phys" : hitKind);
        if (dealt > 0) oilOnHit(b, dealt);
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
      if (firstStrike) firstStrikeStun(b);

      if (eff === "bleed") {
        applyEnemyStatus(b, "bleed", techValue(ws, 3), skillDotTick("bleed", b.p.level, b.enemy.maxHp));
        push(b, `${b.enemy.def.name} истекает кровью (${b.enemy.statuses.bleed} раундов).`, "p");
      } else if (eff === "poison") {
        applyEnemyStatus(b, "poison", techValue(ws, 3), skillDotTick("poison", b.p.level, b.enemy.maxHp));
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
        applyEnemyStatus(b, "chill", techValue(ws, 2), skillDotTick("chill", b.p.level, b.enemy.maxHp));
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
        applyEnemyStatus(b, "curse", techValue(ws, 3), skillDotTick("curse", b.p.level, b.enemy.maxHp));
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

      const noCd = hasPassive(b, "echo") && Math.random() < 0.35;
      if (noCd) {
        push(b, "Приём не ушёл на перезарядку!", "p");
      } else {
        let cd = skillCdAfterUse(b, ws.cooldown);
        if (eff === "skill_leech") cd = Math.max(1, cd - techValue(ws, ws.id === "soul_reprise" ? 2 : 1));
        b.p.weaponCd = cd;
      }
      break;
    }

    case "epic_skill": {
      const sk = b.p.epicSkills.find((s) => s.id === a.id);
      if (!sk) return err("Эта способность недоступна.");
      if (b.p.concentration < TECHNIQUE_CONCENTRATION) return err(techniqueConcentrationMsg(b));
      const cd = b.p.epicCds[sk.id] ?? 0;
      if (cd > 0) return err(`«${sk.name}» перезаряжается (${cd} р.).`);
      const req = Math.max(1, sk.intReq - b.p.intDiscount);
      if (b.p.stats.int < req) return err(`Для «${sk.name}» требуется ИНТ ${req}.`);

      const skLevel = b.p.epicSkillLevels[sk.id] ?? 1;
      if (sk.id === "fireball") {
        const dmg = Math.round(techniqueDamage(b.p.stats.int, epicMagnitude(sk.id, "scale", skLevel) / 2) * spellPowerMult * skillDamageMult(b));
        const dealt = elementalHit(b, dmg, " [Огненный шар]", "fire");
        applyVamp(b, dealt, 0, "skill", "magic");
        const burnRounds = epicMagnitude(sk.id, "rounds", skLevel);
        setEnemyTick(b, "burn", burnRounds, skillDotTick("burn", b.p.level, b.enemy.maxHp));
        push(b, `${b.enemy.def.name} объят пламенем (${burnRounds} раунда).`, "p");
      } else if (sk.id === "blood_lance") {
        const dmg = Math.round(techniqueDamage(b.p.stats.int, epicMagnitude(sk.id, "scale", skLevel) / 2) * spellPowerMult * skillDamageMult(b));
        const dealt = hitEnemy(b, dmg, "magic", " [Кровавое копьё]");
        const heal = healPlayer(b, Math.max(2, Math.round(dealt * (epicMagnitude(sk.id, "leech", skLevel) / 100))));
        flash(b, "p", "heal", heal);
        push(b, `Кровавое копьё возвращает тебе +${heal} здоровья.`, "p");
      } else if (sk.id === "ash_aegis") {
        const heal = healPlayer(b, Math.round((epicMagnitude(sk.id, "base", skLevel) + epicMagnitude(sk.id, "scale", skLevel) * b.p.stats.int) * spellPowerMult));
        b.p.statuses.wound = 0;
        b.p.statuses.woundStacks = 0;
        b.p.statuses.curse = 0;
        b.p.statuses.cursePower = 0;
        b.p.statuses.poison = 0;
        b.p.statuses.poisonStacks = 0;
        b.p.guard = true;
        flash(b, "p", "heal", heal);
        push(b, `Эгида пепла: +${heal} ОЗ, раны сняты, включена Защита.`, "p");
      } else if (sk.id === "shadow_volley") {
        const dmg = Math.round(techniqueDamage(b.p.stats.int, epicMagnitude(sk.id, "scale", skLevel) / 2) * spellPowerMult * skillDamageMult(b));
        const dealt = hitEnemy(b, dmg, "magic", " [Теневой росчерк]");
        setEnemyTick(b, "chill", epicMagnitude(sk.id, "rounds", skLevel), skillDotTick("chill", b.p.level, b.enemy.maxHp));
        applyVamp(b, dealt, 0, "skill", "magic");
      } else if (sk.id === "frost_nova") {
        const dmg = Math.round(techniqueDamage(b.p.stats.int, epicMagnitude(sk.id, "scale", skLevel) / 2) * spellPowerMult * skillDamageMult(b));
        const dealt = elementalHit(b, dmg, " [Дыхание склепа]", "ice");
        applyVamp(b, dealt, 0, "skill", "magic");
        setEnemyTick(b, "chill", epicMagnitude(sk.id, "rounds", skLevel), skillDotTick("chill", b.p.level, b.enemy.maxHp));
        b.enemy.statuses.stunAp = Math.min(4, b.enemy.statuses.stunAp + epicMagnitude(sk.id, "stun", skLevel));
        push(b, `${b.enemy.def.name} скован стужей и теряет 1 ход в следующем раунде.`, "p");
      }

      b.p.epicCds[sk.id] = skillCdAfterUse(b, sk.cooldown);
      break;
    }

    case "armor_skill": {
      const sk = b.p.armorSkills.find((s) => s.id === a.id);
      if (!sk) return err("Этот приём брони недоступен.");
      if (b.p.concentration < TECHNIQUE_CONCENTRATION) return err(techniqueConcentrationMsg(b));
      const cd = b.p.armorCds[sk.id] ?? 0;
      if (cd > 0) return err(`«${sk.name}» перезаряжается (${cd} р.).`);
      const req = sk.intReq <= 0 ? 0 : Math.max(1, sk.intReq - (sk.scaleStat === "int" ? b.p.intDiscount : 0));
      if (b.p.stats[sk.scaleStat] < req) return err(`Для «${sk.name}» требуется ${STAT_META[sk.scaleStat].short} ${req}.`);
      applyArmorSkill(b, sk);
      b.p.armorCds[sk.id] = skillCdAfterUse(b, sk.cooldown);
      break;
    }

    case "guard": {
      b.p.guard = true;
      flash(b, "p", "guard", 0);
      push(b, "Ты уходишь в глухую защиту: броня +25% до твоего следующего хода.", "p");
      break;
    }

    case "item": {
      const def = ITEMS[a.id];
      if (!def?.use) return err("Этим нельзя воспользоваться.");
      if ((def.kind === "special" && def.use.type !== "special_water") || def.kind === "reagent") {
        return err("Этот предмет используется только на карте.");
      }
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
          if (def.kind === "scroll") {
            b.p.statuses.wound = 0;
            b.p.statuses.woundStacks = 0;
          }
          flash(b, "p", "heal", healed);
          push(b, `${def.name}: +${healed} здоровья.`, "p");
          break;
        }
        case "damage": {
          let dmg = Math.round(itemPower * scrollMult);
          if (u.vs && b.enemy.def.race === u.vs) dmg = Math.round(dmg * 2);
          if (b.p.statuses.rage > 0) dmg = Math.round(dmg * (1 + 0.10 * Math.min(10, Math.floor(missingHpRatio(b) * 10))));
          if (b.p.statuses.curse > 0) dmg = Math.round(dmg * (1 - (b.p.statuses.cursePower ?? 30) / 100));
          const dealt = elementalHit(b, dmg, ` [${def.name}]${u.vs && b.enemy.def.race === u.vs ? " · вдвойне против такого рода!" : ""}`, u.element);
          applyVamp(b, dealt, 0, def.kind === "scroll" ? "scroll" : "consumable", def.kind === "scroll" ? "magic" : "phys");
          break;
        }
        case "vamp_potion": {
          b.p.statuses.vampHits = Math.max(b.p.statuses.vampHits, u.hits ?? 3);
          push(b, `${def.name}: следующие ${b.p.statuses.vampHits} удара возвращают 25% урона здоровьем.`, "p");
          break;
        }
        case "regen_potion": {
          b.p.statuses.regenPotion = statusRounds(b, u.rounds ?? 4);
          push(b, `${def.name}: +5 здоровья за раунд на ${b.p.statuses.regenPotion} раунда.`, "p");
          break;
        }
        case "resist_potion": {
          b.p.statuses.resistPotion = statusRounds(b, u.rounds ?? 3);
          push(b, `${def.name}: +25% стойкости к эффектам врага на ${b.p.statuses.resistPotion} раунда.`, "p");
          break;
        }
        case "weaken": {
          /* Порча без периодического урона: только −20% урона врага. */
          if (b.enemy.statuses.blight === 0) b.enemy.statuses.blightTick = 0;
          b.enemy.statuses.blight = Math.max(b.enemy.statuses.blight, u.rounds ?? 3);
          push(b, `${def.name}: ${b.enemy.def.name} наносит −20% урона на ${b.enemy.statuses.blight} раунда.`, "p");
          break;
        }
        case "seal_moves": {
          if (!bossResists(b)) {
            b.enemy.statuses.sealMoves = Math.max(b.enemy.statuses.sealMoves, u.rounds ?? 2);
            push(b, `${b.enemy.def.name} не применяет приёмы ${b.enemy.statuses.sealMoves} раунда.`, "p");
          }
          break;
        }
        case "burn_flask": {
          const dmg = Math.round(itemPower * scrollMult);
          const dealt = elementalHit(b, dmg, ` [${def.name}]`, u.element ?? "fire");
          applyVamp(b, dealt, 0, "consumable", "phys");
          if (b.enemy.hp > 0) applyEnemyStatus(b, "burn", u.rounds ?? 4, dotBaseTick("burn", b.p.level));
          break;
        }
        case "crystal_freeze": {
          const dmg = Math.round(itemPower * scrollMult);
          const dealt = elementalHit(b, dmg, ` [${def.name}]`, u.element ?? "ice");
          applyVamp(b, dealt, 0, "consumable", "phys");
          if (b.enemy.hp > 0) {
            applyEnemyStatus(b, "chill", u.rounds ?? 3, dotBaseTick("chill", b.p.level));
            if (!bossResists(b)) b.enemy.statuses.stunAp = Math.min(2, b.enemy.statuses.stunAp + 1);
          }
          break;
        }
        case "chill": {
          const dmg = Math.round(itemPower * scrollMult);
          const dealt = elementalHit(b, dmg, ` [${def.name}]`, u.element ?? "ice");
          applyVamp(b, dealt, 0, def.kind === "scroll" ? "scroll" : "consumable", def.kind === "scroll" ? "magic" : "phys");
          applyEnemyStatus(b, "chill", u.rounds ?? 3, dotBaseTick("chill", b.p.level));
          push(b, `${b.enemy.def.name} обморожен: лечение −50% и периодический урон.`, "p");
          break;
        }
        case "sunder_damage": {
          let dmg = Math.round(itemPower * scrollMult);
          const dealt = hitEnemy(b, dmg, "magic", ` [${def.name}]`);
          applyVamp(b, dealt, 0, def.kind === "scroll" ? "scroll" : "consumable", def.kind === "scroll" ? "magic" : "phys");
          b.enemy.armor = Math.max(0, b.enemy.armor - 2);
          push(b, `Молния раскалывает броню врага (−2 брони).`, "p");
          break;
        }
        case "cleanse": {
          b.p.statuses.wound = 0;
          b.p.statuses.woundStacks = 0;
          b.p.statuses.curse = 0;
        b.p.statuses.cursePower = 0;
          b.p.statuses.poison = 0;
          b.p.statuses.poisonStacks = 0;
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
            applyEnemyStatus(b, "poison", u.rounds ?? 3, dotBaseTick("poison", b.p.level));
            push(b, `${b.enemy.def.name} отравлен на ${b.enemy.statuses.poison} раунда.`, "p");
          }
          break;
        }
        case "special_water": {
          /* Бурдюк: снимает горение героя и слои Огненных недр, даёт +5 здоровья. */
          b.p.statuses.burn = 0;
          b.p.statuses.burning = 0;
          const healed = healPlayer(b, 5, false);
          flash(b, "p", "heal", healed);
          push(b, `${def.name}: горение снято, +${healed} здоровья.`, "p");
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
          const dealt = hitEnemy(b, dmg, "magic", ` [${def.name}, взрыв]`);
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
          b.p.statuses.woundStacks = 0;
          push(b, `${def.name}: +4 брони и +4 регенерации на ${b.p.statuses.ironTonic} раунда.`, "p");
          break;
        }
        case "blood_rage": {
          b.p.statuses.rage = statusRounds(b, u.rounds ?? 4);
          b.p.statuses.bloodRage = statusRounds(b, u.rounds ?? 4);
          push(b, `${def.name}: ярость и +15% вампиризма оружием на ${u.rounds} раунда.`, "p");
          break;
        }
        case "oil": {
          if (!u.oil) break;
          /* Счётчик уменьшается в конце каждого раунда: 2 = остаток текущего раунда
             и следующий, то есть масло действует на удары в ближайшем раунде. */
          b.p.statuses.oilType = u.oil;
          b.p.statuses.oilRounds = 2;
          const name = damageTypeName(u.oil);
          push(
            b,
            `${def.name}: клинок смазан на ближайший раунд. Удар оружием накладывает ${name} на 3 раунда.`,
            "p",
            isDamageElement(u.oil) ? u.oil : undefined,
          );
          break;
        }
        case "immunity": {
          if (!u.effect) break;
          b.p.statuses.immune[u.effect] = Math.max(b.p.statuses.immune[u.effect] ?? 0, IMMUNITY_ROUNDS);
          push(b, `${def.name}: ${IMMUNITY_NAMES[u.effect]} не накладывается ${IMMUNITY_ROUNDS} хода.`, "p");
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
          for (const k of Object.keys(b.p.armorCds)) b.p.armorCds[k] = 0;
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
          const dealt = elementalHit(b, dmg, ` [${def.name}]`, u.element ?? "acid");
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
          applyEnemyStatus(b, "bleed", u.rounds ?? 3, dotBaseTick("bleed", b.p.level));
          push(b, `${b.enemy.def.name} истекает кровью (${b.enemy.statuses.bleed} раундов).`, "p");
          break;
        }
        case "blight": {
          const dmg = Math.round(itemPower);
          const dealt = hitEnemy(b, dmg, "magic", ` [${def.name}]`);
          applyVamp(b, dealt, 0, "consumable", "phys");
          applyEnemyStatus(b, "blight", u.rounds ?? 3, dotBaseTick("blight", b.p.level));
          push(b, `Порча сковывает ${b.enemy.def.name}: урон −20% и потеря ОЗ за раунд.`, "p");
          break;
        }
        case "buff_break": {
          if (u.power || u.scale) {
            const dmg = Math.round(itemPower * scrollMult);
            const dealt = elementalHit(b, dmg, ` [${def.name}]`, u.element);
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
          const dealt = hitEnemy(b, dmg, "magic", ` [${def.name}]`);
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
          const dealt = hitEnemy(b, dmg, "magic", ` [Эхо: ${def.name}]`);
          applyVamp(b, dealt, 0, "scroll", "magic");
        }
      }

      const scrollSaveChance = (hasPassive(b, "echo") ? 0.35 : 0) + effectPower(b, "scroll_save") / 100 +
        (hasPassive(b, "arch_sage_5") ? 0.25 : 0) +
        (hasPassive(b, "arch_sage_10") ? 0.25 : 0) +
        passivePower(b, "sage_library", "save") / 100;
      const saveScroll = def.kind === "scroll" && scrollSaveChance > 0 && Math.random() < scrollSaveChance;
      if (!saveScroll) {
        spendBagItem(b, a.id);
      } else {
        push(b, "Эхо мысли сохраняет свиток — он не истлел!", "p");
      }
      /* Ниндзя 10: первый расходник за ход не тратит ход. Мудрец 10: первый свиток за ход не тратит ход.
         Сумка: первое зелье из слотов за ход не тратит ход. Сумка и ниндзя считаются независимо. */
      const isScroll = def.kind === "scroll";
      const pouchFree = def.kind === "potion" && b.pouch.includes(a.id) && b.p.turnPouch < 1;
      const ninjaFree = !isScroll && hasPassive(b, "arch_ninja_10") && b.p.turnConsumables < 1;
      const freeUse = isScroll ? hasPassive(b, "arch_sage_10") && b.p.turnScrolls < 1 : pouchFree || ninjaFree;
      if (pouchFree) b.p.turnPouch += 1;
      else b.p.turnConsumables += 1;
      if (isScroll) b.p.turnScrolls += 1;
      if (freeUse) {
        freeAction = true;
        push(
          b,
          isScroll
            ? "Свиток не тратит ход: можно применить ещё один."
            : pouchFree
              ? "Зелье из сумки не тратит ход."
              : "Первый расходник за ход не тратит ход.",
          "p",
        );
      }
      break;
    }

    case "archetype_skill": {
      const problem = archetypeSpecialBlock(b);
      if (problem) return err(problem);
      const arch = b.p.archetype!;
      b.p.concentration = 0;
      runArchetypeSpecial(b, arch);
      break;
    }

    case "flee": {
      b.over = "flee";
      b.fleeRate = a.rate ?? 0.4 + Math.random() * 0.3;
      push(b, "Ты бросаешь бой и отступаешь в коридор.", "p");
      break;
    }
  }

  if (takeTurn && !b.over) adjustConcentration(b, a.type);
  if (!b.over && b.enemy.hp <= 0 && !tryRevive(b)) {
    b.enemy.hp = 0;
    b.over = "win";
    gainLoot(b);
    push(b, `${b.enemy.def.name} повержен! (+${enemyXpFor(b)} опыта)`, "sys");
    return b;
  }
  if (b.over) return b;
  if (fearTurn) b.p.guard = true;
  if (takeTurn && !freeAction) advance(b);
  return b;
}

/* ═══════════  ИНТЕЛЛЕКТ МОНСТРОВ  ═══════════ */

/** Приёмы с негативными эффектами: порча, яд, кровотечение, печати, страх. */
const DEBUFF_MOVES: EnemyMove[] = ["wound", "poison", "curse", "sunder", "bell_stun", "terror", "seal_items", "seal_skills", "seal_attack", "intimidate", "darkness"];

/**
 * Перезарядка приёмов, которые вешают на героя негативный эффект: страх,
 * печати, порчу, яд, кровотечение, раскол, немоту лечения и горение.
 * Перезарядка общая: применив любой такой приём, тварь три раунда не может
 * пользоваться остальными — остаются обычные удары, двойной выпад, похищение
 * жизни и стойка.
 */
export const ENEMY_MOVE_COOLDOWN = 3;
export const ENEMY_COOLDOWN_MOVES: EnemyMove[] = [...DEBUFF_MOVES, "cold_touch", "hell_force"];

/** Сколько раундов ещё ждать до приёмов с негативными эффектами: 0 — можно применять. */
export function enemySpecialCooldownLeft(b: BattleState): number {
  return Math.max(0, (b.enemy.specialCooldown ?? 0) - b.round);
}

/** Сколько раундов ещё ждать до конкретного приёма: 0 — можно применять сейчас. */
export function enemyMoveCooldownLeft(b: BattleState, move: EnemyMove): number {
  if (!ENEMY_COOLDOWN_MOVES.includes(move)) return 0;
  return enemySpecialCooldownLeft(b);
}

/** Доступен ли приём в текущем раунде. */
export function enemyMoveReady(b: BattleState, move: EnemyMove): boolean {
  return enemyMoveCooldownLeft(b, move) === 0;
}

/** Отмечает применение приёма: следующие три раунда приёмы с дебаффами недоступны. */
function armEnemyCooldown(b: BattleState, move: EnemyMove): void {
  if (!ENEMY_COOLDOWN_MOVES.includes(move)) return;
  b.enemy.specialCooldown = b.round + ENEMY_MOVE_COOLDOWN;
}
/** Прямые удары оружием и когтями. */
const STRIKE_MOVES: EnemyMove[] = ["attack", "heavy", "multi"];
/** Физические приёмы врага: на них действует лёд и броня героя. */
const PHYS_ENEMY_MOVES: EnemyMove[] = ["attack", "heavy", "wound", "sunder", "poison", "multi"];

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
  /* Слабость вампира: каждое попадание его атаки копит наложение до конца боя. */
  if (raceWeakens(race)) {
    b.p.statuses.weakness = (b.p.statuses.weakness ?? 0) + 1;
    push(b, `${e.def.name} изматывает тебя: слабость ×${b.p.statuses.weakness}, твой урон от атак −${Math.round(b.p.statuses.weakness * WEAKNESS_STEP * 100)}%.`, "e");
  }
  const lands = () => Math.random() > resistChance;
  if (race === "vampire" && lands()) {
    const stacks = applyPlayerDot(b, "wound", 3, dotBaseTick("bleed", e.level));
    if (stacks > 0) push(b, `Клыки рвут плоть: кровотечение на 3 раунда, наложений ${stacks}.`, "e");
  } else if (race === "ghost" && lands()) {
    if (!immuneNote(b, "fear")) applyHeroFear(b, "Прикосновение призрака сеет страх на раунд.");
  } else if (race === "beast" && lands()) {
    if (Math.random() < 0.5) {
      const stacks = applyPlayerDot(b, "wound", 3, dotBaseTick("bleed", e.level));
      if (stacks > 0) push(b, `Зверь рвёт когтями: кровотечение на 3 раунда, наложений ${stacks}.`, "e");
    } else {
      const stacks = applyPlayerDot(b, "poison", 3, dotBaseTick("poison", e.level));
      if (stacks > 0) push(b, `Яд зверя в крови: 3 раунда отравления, наложений ${stacks}.`, "e");
    }
  } else if (race === "demon" && lands()) {
    if (Math.random() < 0.5) {
      if (!immuneNote(b, "burn")) {
        setPlayerTick(b, "burn", statusRounds(b, 3), dotBaseTick("burn", e.level));
        push(b, "Адское пламя липнет к коже: горение на 3 раунда.", "e");
      }
    } else {
      if (!immuneNote(b, "fear")) applyHeroFear(b, "Взгляд демона парализует волю: страх на раунд.");
    }
  }
}

/** Множитель урона героя от обычных атак при слабости вампира. */
export function weaknessMult(stacks: number): number {
  return Math.max(0, 1 - WEAKNESS_STEP * stacks);
}

/** Шипы героя: физический удар по нему ранит самого нападающего. */
function playerThorns(b: BattleState): number {
  return (
    rarePower(b, "thorns", "damage") +
    effectPower(b, "thorns") +
    passivePower(b, "bulwark_wall", "thorns") +
    (hasPassive(b, "arch_bulwark_10") ? 6 + Math.floor(playerArmorNow(b) / 5) : 0)
  );
}

/** Коэффициенты приёмов врага по урону: множитель к базовому удару, тип удара и число ударов. Приёмы без урона здесь не перечислены. */
const ENEMY_MOVE_SHAPE: Partial<Record<EnemyMove, { mult: number; kind: "phys" | "magic"; hits?: number; ignoreDefense?: boolean }>> = {
  attack: { mult: 1, kind: "phys" },
  heavy: { mult: 1.7, kind: "phys" },
  wound: { mult: 0.9, kind: "phys" },
  poison: { mult: 0.85, kind: "phys" },
  sunder: { mult: 1.15, kind: "phys" },
  multi: { mult: 0.65, kind: "phys", hits: 2 },
  curse: { mult: 0.7, kind: "magic" },
  drain: { mult: 0.95, kind: "magic" },
  bell_stun: { mult: 1.1, kind: "magic" },
  terror: { mult: 0.6, kind: "magic" },
  hell_force: { mult: 2, kind: "magic" },
  cold_touch: { mult: 1.1, kind: "magic", ignoreDefense: true },
};

/** Ослабление/усиление удара от состояния врага (ледяное проклятие, порча). */
function enemyChill(b: BattleState): number {
  return (b.enemy.statuses.blight > 0 ? 0.8 : 1) * (b.enemy.statuses.curse > 0 ? 1 - (b.enemy.statuses.cursePower ?? 30) / 100 : 1);
}

/** Усиления базового удара от эффектов врага, без критического броска. Истощение эффектов их отключает. */
function enemyEffectDamage(b: BattleState, base0: number): number {
  if (effectsDepleted(b)) return base0;
  const e = b.enemy;
  let base = base0;
  base = Math.round(base * (1 + (eEffect(b, "rage") / 100) * Math.min(10, Math.floor(enemyMissingRatio(b) * 10))));
  base = Math.round(base * (1 + (e.level * eEffect(b, "might")) / 100));
  base = Math.round(base * (1 + eEffect(b, "missing_hp_damage") / 100 * Math.min(10, Math.floor(enemyMissingRatio(b) * 10))));
  base = Math.round(base * (1 + eEffect(b, "enemy_missing_damage") / 100 * Math.min(10, Math.floor(missingHpRatio(b) * 10))));
  if (b.round <= 2) base = Math.round(base * (1 + eEffect(b, "first_strike") / 100));
  base += Math.round(e.armor * eEffect(b, "armor_damage") / 100);
  return base;
}

/** Множители хода: тип монстра, агрессия зверя, масло, ярость дракона. */
function enemyMoveDamage(b: BattleState, move: EnemyMove, isStrikeMove: boolean, base0: number): number {
  const e = b.enemy;
  let base = base0;
  /* Тип задаёт, на чём держится урон: у умных приёмы бьют в 1.45× сильнее. */
  const typeMeta = MONSTER_TYPE_META[e.mtype] ?? MONSTER_TYPE_META.strong;
  if (!isStrikeMove && move !== "guard") base = Math.round(base * typeMeta.movePower);
  /* Агрессия зверя: ниже половины здоровья бьёт вдвое. */
  if (e.def.race === "beast" && e.hp > 0 && e.hp <= e.maxHp * 0.5 && isStrikeMove) base = Math.round(base * 2);
  /* Лёд под маслом режет силу атаки и физических приёмов врага. */
  if (PHYS_ENEMY_MOVES.includes(move)) base = Math.round(base * enemyOilAttackMult(b));
  /* Ярость дракона: двойной урон, пока держится. */
  if (e.def.race === "dragon" && e.fury > 0 && !effectsDepleted(b)) base = Math.round(base * 2);
  /* Воскресшая нежить бьёт вполсилы. */
  if (e.revived) base = Math.round(base * (1 - REVIVE_DEBUFF));
  return base;
}

/**
 * Ожидаемый урон приёма врага по герою прямо сейчас: среднее от броска, ожидание крита,
 * шанс попасть и все защиты героя. Без бросков и побочных эффектов.
 */
export function enemyExpectedMoveDamage(b: BattleState, move: EnemyMove): number {
  const shape = ENEMY_MOVE_SHAPE[move];
  if (!shape) return 0;
  const e = b.enemy;
  const isStrikeMove = STRIKE_MOVES.includes(move);
  let base = enemyEffectDamage(b, Math.round((e.atk[0] + e.atk[1]) / 2));
  if (!effectsDepleted(b)) {
    const c = eChance(b, "crit_chance");
    if (c > 0) base = base * (1 - c) + base * (2 + eEffect(b, "crit_mult") / 100) * c;
  }
  base = enemyMoveDamage(b, move, isStrikeMove, base);
  const raw = Math.round(base * shape.mult * enemyChill(b));
  const strike = shape.kind === "phys";
  const ignore = !!shape.ignoreDefense;
  const p = playerHitChance(b, shape.kind, strike, ignore);
  if (p <= 0) return 0;
  const d = damageAfterPlayerDefense(b, raw, shape.kind, strike, ignore);
  /* Второй удар приходит, только если первый попал. */
  let total = 0;
  let reach = 1;
  for (let i = 0; i < (shape.hits ?? 1); i++) {
    reach *= p;
    total += reach * d;
  }
  return total;
}

/**
 * Выбор приёма: монстр берёт тот приём, который даст наибольший ожидаемый урон по герою сейчас.
 * Приёмы без урона (стойка, печати, мрак, запугивание) выбираются только если урона не даёт ни один приём.
 */
export function chooseEnemyMove(b: BattleState): EnemyMove {
  const e = b.enemy;
  let moves = (e.moves.length ? e.moves : e.def.moves).filter((m) => enemyMoveReady(b, m));
  /* Печать тишины: только базовые атака и стойка, без приёмов. */
  if (e.statuses.sealMoves > 0) moves = moves.filter((m) => m === "attack" || m === "guard");
  let best = 0;
  let top: EnemyMove[] = [];
  for (const m of moves) {
    const v = enemyExpectedMoveDamage(b, m);
    if (v > best + 1e-9) {
      best = v;
      top = [m];
    } else if (best > 0 && v >= best - 1e-9) {
      top.push(m);
    }
  }
  if (!top.length) return moves.includes("attack") ? "attack" : (moves[0] ?? "attack");
  return pick(top);
}

/** Эффект, который приём накладывает на героя. half — с шансом около половины (разные наложения рода). */
export type EnemyMoveEffectId =
  | "bleed" | "poison" | "burn" | "curse" | "fear" | "stun" | "sunder" | "darkness"
  | "noHeal" | "sealItems" | "sealSkills" | "sealAttack";
export interface EnemyMoveEffect {
  id: EnemyMoveEffectId;
  half: boolean;
}

/** Родовые наложения удара (как в applyRaceStrike): только у ударов оружием и когтями. */
function raceStrikeEffects(race: MonsterRace): EnemyMoveEffect[] {
  if (race === "vampire") return [{ id: "bleed", half: false }];
  if (race === "ghost") return [{ id: "fear", half: false }];
  if (race === "beast") return [{ id: "bleed", half: true }, { id: "poison", half: true }];
  if (race === "demon") return [{ id: "burn", half: true }, { id: "fear", half: true }];
  return [];
}

/** Какие эффекты приём накладывает на героя. Повторяет ветки хода врага, чтобы подсказка совпадала с боем. */
export function enemyMoveEffects(b: BattleState, move: EnemyMove): EnemyMoveEffect[] {
  const e = b.enemy;
  const strike = STRIKE_MOVES.includes(move) ? raceStrikeEffects(e.def.race) : [];
  const one = (id: EnemyMoveEffectId): EnemyMoveEffect[] => [{ id, half: false }];
  switch (move) {
    case "attack":
    case "multi":
      return strike;
    case "heavy":
      return [...strike, ...(e.def.id === "husk" ? one("sunder") : [])];
    case "wound": return one("bleed");
    case "poison": return one("poison");
    case "sunder": return one("sunder");
    case "curse": return one("curse");
    case "terror": return one("fear");
    case "bell_stun": return one("stun");
    case "intimidate": return [{ id: "sealAttack", half: false }, { id: "sealSkills", half: false }];
    case "darkness": return one("darkness");
    case "cold_touch": return one("noHeal");
    case "hell_force": return one("burn");
    case "seal_items": return one("sealItems");
    case "seal_skills": return one("sealSkills");
    case "seal_attack": return one("sealAttack");
    default: return [];
  }
}

export interface EnemyMoveView {
  move: EnemyMove;
  /** Ожидаемый урон приёма по герою сейчас; 0 — приём без урона. */
  damage: number;
  effects: EnemyMoveEffect[];
  /** Раунды до снятия перезарядки; 0 — приём доступен. */
  cooldown: number;
}

/** Параметры врага для сводки и списка приёмов: всё считается теми же функциями, что и бой. */
export interface EnemyReadout {
  /** Броня без защиты и с защитой врага. */
  armorBase: number;
  armor: number;
  guard: boolean;
  evade: number;
  /** Стойкость к негативным эффектам: род, босс, эффекты снаряжения. */
  resist: number;
  fortify: number;
  magicResist: number;
  ap: number;
  moves: EnemyMoveView[];
}

export function enemyReadout(b: BattleState): EnemyReadout {
  const e = b.enemy;
  const depleted = effectsDepleted(b);
  const effectResist = depleted ? 0 : eChance(b, "resist");
  const resist = 1 - (1 - raceEffectResist(e.def.race)) * (1 - (b.isBoss ? BOSS_EFFECT_RESIST : 0)) * (1 - effectResist);
  const effectFortify = depleted ? 0 : eChance(b, "fortify");
  const fortify = 1 - (1 - raceFortify(e.def.race)) * (1 - effectFortify);
  const magicResist = depleted ? 0 : eChance(b, "magic_resist");
  const list = [...new Set(e.moves.length ? e.moves : e.def.moves)];
  return {
    armorBase: enemyArmorNow({ ...e, guard: false }),
    armor: enemyArmorNow(e),
    guard: e.guard,
    evade: enemyEvade(b),
    resist,
    fortify,
    magicResist,
    ap: e.ap,
    moves: list.map((move) => ({
      move,
      damage: Math.round(enemyExpectedMoveDamage(b, move)),
      effects: enemyMoveEffects(b, move),
      cooldown: enemyMoveCooldownLeft(b, move),
    })),
  };
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

  /* Крыса зовёт стаю: при половине ОЗ лечится и делает лишний ход (раз за бой). */
  if (e.def.id === "vermin" && ratCallDue(e.hp, e.maxHp, !!e.ruleUsed)) {
    e.ruleUsed = true;
    const heal = healEnemy(b, Math.round(e.maxHp * RAT_CALL_HEAL_SHARE));
    push(b, `${e.def.name} зовёт стаю: +${heal} ОЗ и лишний ход.`, "e");
    b.queue.splice(b.idx + 1, 0, "e");
  }
  const chill = enemyChill(b);
  /* Пророк уже объявил ход в начале раунда; остальные выбирают ход сейчас. */
  const move = e.announced ?? chooseEnemyMove(b);
  e.announced = null;
  armEnemyCooldown(b, move);
  const isStrikeMove = STRIKE_MOVES.includes(move);
  /* Промах запоминается только на один ход: после решения флаг снимаем. */
  e.lastMiss = false;
  /* Базовый удар — обычный параметр; усиления от эффектов при истощении не работают. */
  let base = enemyEffectDamage(b, randInt(e.atk[0], e.atk[1]));
  if (!effectsDepleted(b)) {
    const eCritChance = eChance(b, "crit_chance");
    if (eCritChance > 0 && Math.random() < eCritChance) {
      base = Math.round(base * (2 + eEffect(b, "crit_mult") / 100));
      push(b, `${e.def.name} наносит критический удар!`, "e");
    }
  }
  base = enemyMoveDamage(b, move, isStrikeMove, base);
  /* Огр-мясник звереет, когда герой ранен. */
  if (e.def.id === "brute") base = Math.round(base * ogreRageMult(b.p.hp, b.p.maxHp));
  const resistChance = playerResistChance(b);
  const hpBeforeMove = b.p.hp;
  /* Плачущая тень: броня не держит больше половины её удара. */
  b.piercing = e.def.id === "wraith";

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
      const landed = incoming(b, Math.round(base * 1.7 * chill), "phys", `${e.def.name} пробивает с плеча`);
      if (!landed) e.lastMiss = true;
      /* Гнилой ходок: тяжёлый удар снимает слой брони на два раунда. */
      else if (e.def.id === "husk" && b.p.hp > 0) {
        const stacks = nextRotStacks(b.p.statuses.rot ?? 0);
        b.p.statuses.rot = stacks;
        b.p.statuses.rotRounds = ROT_ROUNDS;
        push(b, `Гниение: броня −${stacks} на ${ROT_ROUNDS} раунда.`, "e");
      }
      break;
    }
    case "wound": {
      const landed = incoming(b, Math.round(base * 0.9 * chill), "phys", `${e.def.name} рвёт плоть`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && !hasLeg(b, "titan_heart") && Math.random() > resistChance) {
        const stacks = applyPlayerDot(b, "wound", 3, dotSkillTick("bleed", e.level));
        if (stacks > 0) push(b, `Открылось кровотечение на 3 раунда, наложений ${stacks}.`, "e");
      } else if (landed && b.p.hp > 0) {
        push(b, "Твоя сила сдерживает рану — кровотечения нет.", "p");
      }
      break;
    }
    case "curse": {
      const landed = incoming(b, Math.round(base * 0.7 * chill), "magic", `${e.def.name} шепчет анафему`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && Math.random() > resistChance) {
        if (!immuneNote(b, "curse")) {
          setPlayerTick(b, "curse", 3, dotSkillTick("curse", e.level));
          b.p.statuses.cursePower = Math.max(b.p.statuses.cursePower ?? 0, 30);
          push(b, "Проклятие висит 3 раунда: твой урон снижен на 30%.", "e");
        }
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
        if (!immuneNote(b, "sunder")) {
          const breakAmount = enemySunderBreak(b.enemy.level);
          b.p.statuses.sundered = Math.min(8, b.p.statuses.sundered + breakAmount);
          push(b, `Твоя броня промята (−${breakAmount} к защите, всего −${b.p.statuses.sundered} до конца боя).`, "e");
        }
      }
      break;
    }
    case "bell_stun": {
      const landed = incoming(b, Math.round(base * 1.1 * chill), "magic", `${e.def.name} бьёт в погребальный колокол`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && Math.random() > resistChance) {
        if (!immuneNote(b, "stun")) {
          b.p.statuses.stunAp = 1;
          push(b, "Звон парализует волю: −1 ход в следующем раунде!", "e");
        }
      } else if (landed && b.p.hp > 0) {
        push(b, "Ты выдерживаешь удар колокола без потери хода.", "p");
      }
      break;
    }
    case "intimidate": {
      const blockAttack = immuneNote(b, "sealAttack");
      const blockSkills = immuneNote(b, "sealSkills");
      if (!blockAttack) b.p.statuses.sealAttack = 1;
      if (!blockSkills) b.p.statuses.sealSkills = 1;
      if (!blockAttack || !blockSkills) push(b, `${e.def.name} давит волей: в следующий ход нельзя ни атаковать, ни применять приёмы.`, "e");
      break;
    }
    case "darkness": {
      if (!immuneNote(b, "darkness")) {
        b.p.statuses.darkness = 1;
        push(b, `${e.def.name} сгущает мрак: до конца раунда половина твоих атак уходит в пустоту.`, "e");
      }
      break;
    }
    case "cold_touch": {
      const landed = incoming(b, Math.round(base * 1.1 * chill), "magic", `${e.def.name} касается холодом`, false, true);
      if (landed) {
        push(b, "Холодное касание проходит сквозь броню и любое сопротивление.", "e");
        if (!immuneNote(b, "noHeal")) {
          b.p.statuses.noHeal = Math.max(b.p.statuses.noHeal, 2);
          if (b.p.hp > 0) push(b, "Стужа в костях: два хода лечение не действует.", "e");
        }
      }
      break;
    }
    case "hell_force": {
      const landed = incoming(b, Math.round(base * 2 * chill), "magic", `${e.def.name} обрушивает силу ада`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && Math.random() > resistChance) {
        if (!immuneNote(b, "burn")) {
          setPlayerTick(b, "burn", statusRounds(b, 4), dotSkillTick("burn", e.level));
          push(b, "Сила ада поджигает: 4 раунда горения.", "e");
        }
      }
      break;
    }
    case "poison": {
      const landed = incoming(b, Math.round(base * 0.85 * chill), "phys", `${e.def.name} впивается зубами`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && !hasLeg(b, "titan_heart") && Math.random() > resistChance) {
        const stacks = applyPlayerDot(b, "poison", 3, dotSkillTick("poison", e.level));
        if (stacks > 0) push(b, `Яд разъедает кровь: отравление на 3 раунда, наложений ${stacks}.`, "e");
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
      if (!immuneNote(b, "sealItems")) {
        b.p.statuses.sealItems = 1;
        push(b, `${e.def.name} накладывает Печать немоты: расходники запрещены в твой следующий ход.`, "e");
      }
      break;
    }
    case "seal_skills": {
      if (!immuneNote(b, "sealSkills")) {
        b.p.statuses.sealSkills = 1;
        push(b, `${e.def.name} накладывает Печать забвения: приёмы запрещены в твой следующий ход.`, "e");
      }
      break;
    }
    case "seal_attack": {
      if (!immuneNote(b, "sealAttack")) {
        b.p.statuses.sealAttack = 1;
        push(b, `${e.def.name} накладывает Печать оков: обычная атака запрещена в твой следующий ход.`, "e");
      }
      break;
    }
    case "terror": {
      const landed = incoming(b, Math.round(base * 0.6 * chill), "magic", `${e.def.name} рычит тебе в лицо`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0 && Math.random() > resistChance) {
        if (!immuneNote(b, "fear")) applyHeroFear(b, "Страх на раунд: в свой ход ты сам встаёшь в защиту. Атаки и приёмы закрыты, рюкзак и побег доступны.");
        e.guard = true;
        flash(b, "e", "guard", 0);
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
    if (!immuneNote(b, "stun")) {
      b.p.statuses.stunAp = Math.max(b.p.statuses.stunAp, 1);
      push(b, `${e.def.name} оглушает тебя: −1 ход в следующем раунде.`, "e");
    }
  }
  /* «Без рода», сильный: регенерация в конце своего хода. */
  if (e.def.race === "none" && e.mtype === "strong" && e.hp > 0 && e.hp < e.maxHp && b.p.hp > 0) {
    const heal = healEnemy(b, noneStrongRegen(e.level));
    if (heal > 0) push(b, `${e.def.name} регенерирует ${heal} ОЗ в конце своего хода.`, "e");
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
  /** Урон текущего приёма по этому врагу сейчас (null, если приёма нет). */
  techMin: number | null;
  techMax: number | null;
  /** Что прилетит мне: диапазон после моей брони. */
  inMin: number;
  inMax: number;
  /** То же в глухой защите. */
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
  const strFlat = statDamage(st.str, b.p.passives);
  const baseMin = b.p.hit[0] + strFlat;
  const baseMax = b.p.hit[1] + strFlat;

  const dmgMods: Modifier[] = [];
  if (b.biome === "ice")
    dmgMods.push({ id: "biome_ice", label: "Ледяные просторы", mult: 0.75, good: false, detail: "Физические удары оружием слабее на 25%." });
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
  if (b.p.statuses.bulwarkStrike > 0) dmgMods.push({ id: "bulwark_strike", label: "Стойка бастиона", flat: b.p.statuses.bulwarkStrike, good: true, detail: "Следующая обычная атака получит этот урон от брони стойки." });
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
  if ((b.p.statuses.weakness ?? 0) > 0) {
    const wk = b.p.statuses.weakness ?? 0;
    dmgMods.push({
      id: "weakness",
      label: "Слабость",
      mult: weaknessMult(wk),
      good: false,
      detail: `Вампир изматывает: урон от обычных атак −${Math.round(WEAKNESS_STEP * wk * 100)}% (наложений ${wk}). Приёмы не затронуты.`,
    });
  }
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

  /* Что останется после брони и защит противника: тот же конвейер, что и при ударе. */
  const effMin = damageAfterEnemyDefense(b, rawMin, "phys");
  const effMax = damageAfterEnemyDefense(b, rawMax, "phys");

  /* Приём сейчас: тот же бросок с бонусом приёма и множителем навыков. Магия и пробивание — без брони. */
  const techSkill = b.p.weaponSkill;
  let techMin: number | null = null;
  let techMax: number | null = null;
  if (techSkill) {
    if (techSkill.effect === "double_attack") {
      /* Каждый из ударов — обычная атака: без бонуса приёма и без пассивного раскрытия техники. */
      const hits = scaleIntegerByLevel(2, techSkill.level ?? 1);
      const hitMin = damageAfterEnemyDefense(b, Math.max(1, Math.round((baseMin + totalFlat) * totalMult)), "phys");
      const hitMax = damageAfterEnemyDefense(b, Math.max(1, Math.round((baseMax + totalFlat) * totalMult)), "phys");
      techMin = hitMin * hits;
      techMax = hitMax * hits;
    } else {
      const magicHit = !!techSkill.magic || techSkill.effect === "pierce" || techSkill.effect === "chill" || techSkill.effect === "leech" || techSkill.effect === "skill_leech";
      const kind = magicHit ? "magic" : "phys";
      const tech = techniqueBonusNow(b, techSkill);
      const skillM = skillDamageMult(b);
      techMin = damageAfterEnemyDefense(b, Math.max(1, Math.round((baseMin + totalFlat + tech) * totalMult * skillM)), kind);
      techMax = damageAfterEnemyDefense(b, Math.max(1, Math.round((baseMax + totalFlat + tech) * totalMult * skillM)), kind);
    }
  }

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
      detail: `Броня снижена на ${b.p.statuses.sundered} до конца боя; каждое новое наложение складывается.`,
    });
  if ((b.p.statuses.rot ?? 0) > 0)
    defMods.push({
      id: "rot",
      label: "Гниение",
      flat: -(b.p.statuses.rot ?? 0),
      good: false,
      rounds: b.p.statuses.rotRounds,
      detail: `Броня снижена на ${b.p.statuses.rot} от гниения ходока; новый удар добавляет слой, не больше двух.`,
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
    defMods.push({ id: "guard", label: "Защита", good: true, detail: "Броня +25% до твоего следующего хода." });
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
      detail: `−${b.p.statuses.woundTick * Math.max(1, b.p.statuses.woundStacks ?? 1)} здоровья в конце каждого раунда${(b.p.statuses.woundStacks ?? 1) > 1 ? ` (${b.p.statuses.woundStacks} наложения)` : ""}.`,
    });
  if (b.p.statuses.poison > 0)
    defMods.push({
      id: "poison",
      label: "Отравление",
      good: false,
      rounds: b.p.statuses.poison,
      detail: `−${b.p.statuses.poisonTick * Math.max(1, b.p.statuses.poisonStacks ?? 1)} здоровья в конце каждого раунда${(b.p.statuses.poisonStacks ?? 1) > 1 ? ` (${b.p.statuses.poisonStacks} наложения)` : ""}.`,
    });
  if (b.p.statuses.burn > 0)
    defMods.push({ id: "burn", label: "Горение", good: false, rounds: b.p.statuses.burn, detail: `−${b.p.statuses.burnTick} ОЗ в конце раунда.` });
  if (b.p.statuses.chill > 0)
    defMods.push({ id: "chill", label: "Обморожение", good: false, rounds: b.p.statuses.chill, detail: `Лечение −50% и −${b.p.statuses.chillTick} ОЗ в конце раунда (до сопротивления магии).` });
  if (b.p.statuses.wither > 0)
    defMods.push({ id: "wither", label: "Увядание", good: false, rounds: b.p.statuses.wither, detail: "Любое лечение переходит в магический урон." });
  if (b.p.statuses.fear > 0)
    defMods.push({ id: "fear", label: "Страх", good: false, rounds: b.p.statuses.fear, detail: "В твой ход ты в защите сам. Атаки и приёмы закрыты, рюкзак доступен." });
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
  if (b.p.statuses.invulnerable > 0) defMods.push({ id: "invulnerable", label: "Неуязвимость", good: true, rounds: b.p.statuses.invulnerable, detail: "Не проходят удары, приёмы и периодический урон." });
  if (b.p.statuses.dodgeNext > 0) defMods.push({ id: "dodgeNext", label: "Пустой шаг", good: true, rounds: b.p.statuses.dodgeNext, detail: "Следующая атака врага полностью ускользнёт." });
  if (b.p.statuses.evadeTurn > 0) defMods.push({ id: "evadeTurn", label: "Неуловимость", good: true, rounds: b.p.statuses.evadeTurn, detail: "Физические атаки врага проходят мимо." });
  if (b.p.statuses.counterTurn > 0) defMods.push({ id: "counterTurn", label: "Ответный замах", good: true, rounds: b.p.statuses.counterTurn, detail: "Каждый физический удар врага, который прошёл, получает ответ." });
  const resistFlat = effectPower(b, "damage_resist");
  if (resistFlat > 0) defMods.push({ id: "damage_resist", label: "Сопротивление урону", flat: -resistFlat, good: true, detail: `−${resistFlat} урона за каждый входящий удар.` });
  const armorBase = b.p.armor + b.p.statuses.tempArmor + (b.p.statuses.ironTonic > 0 ? 4 : 0) + b.p.statuses.sundered;
  const armor = playerArmorNow(b);

  /* Урон врага по мне */
  const enemyMods: Modifier[] = [];
  if (b.biome === "ice")
    enemyMods.push({ id: "biome_ice_enemy", label: "Лёд: удары врага −25%", mult: 0.75, good: true, detail: "Физические атаки противника ослаблены холодом." });
  if (b.enemy.statuses.burning > 0)
    enemyMods.push({ id: "biome_burning_enemy", label: `Горение врага ×${b.enemy.statuses.burning}`, good: true, detail: `−${fireBurnDamage(b.enemy.statuses.burning)} ОЗ врагу в начале его хода; следующий слой −${fireBurnDamage(b.enemy.statuses.burning + 1)}.` });
  if (b.enemy.statuses.burn > 0)
    enemyMods.push({ id: "eburn", label: "Горение врага", good: true, rounds: b.enemy.statuses.burn, detail: `−${b.enemy.statuses.burnTick} ОЗ врагу в конце раунда.` });
  if (b.enemy.statuses.curse > 0)
    enemyMods.push({ id: "ecurse", label: "Проклятие врага", mult: 0.7, good: true, rounds: b.enemy.statuses.curse, detail: "Урон врага −30% и периодический магический урон." });
  if (b.enemy.statuses.sealMoves > 0)
    enemyMods.push({ id: "seal", label: "Печать тишины", mult: 1, good: true, rounds: b.enemy.statuses.sealMoves, detail: "Враг применяет только атаку и стойку." });
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
      detail: `Лечение врага −50% и −${b.enemy.statuses.chillTick} ОЗ в конце раунда (до сопротивления магии).`,
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
      detail: `−${b.enemy.statuses.bleedTick * Math.max(1, b.enemy.statuses.bleedStacks ?? 1)} ОЗ врагу в конце раунда${(b.enemy.statuses.bleedStacks ?? 1) > 1 ? ` (${b.enemy.statuses.bleedStacks} наложения)` : ""}.`,
    });
  if (b.enemy.statuses.poison > 0)
    enemyMods.push({
      id: "epoison",
      label: "Яд на враге",
      good: true,
      rounds: b.enemy.statuses.poison,
      detail: `−${b.enemy.statuses.poisonTick * Math.max(1, b.enemy.statuses.poisonStacks ?? 1)} ОЗ врагу в конце раунда${(b.enemy.statuses.poisonStacks ?? 1) > 1 ? ` (${b.enemy.statuses.poisonStacks} наложения)` : ""}.`,
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
    techMin,
    techMax,
    inMin: afterArmor(eMin),
    inMax: afterArmor(eMax),
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
