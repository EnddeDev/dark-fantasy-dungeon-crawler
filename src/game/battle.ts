import {
  SLOW_ROUNDS, SHATTER_ROUNDS, MUTE_ROUNDS, DEPLETE_ROUNDS, BEAT_ROUNDS, WEAKEN_ROUNDS, DRAIN_ROUNDS,
  SHATTER_MULT, drainTick, depleteRemove, slowedTurns, beatenDamage, weakenedMult,
} from "./newEffects";
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
  monsterGold,
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
  gearClassFor,
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
  ROT_MAX_STACKS,
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
  ATK_SPREAD,
  BASE_ATK,
  BASE_HP,
  raceArmorMult,
  rollRaceAtkMult,
  rollRaceAtkMultOpposite,
  raceHpIsHigh,
  rollRaceHpMult,
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
import { combatChance, combineChances, emptyChanceLayers, staticChance, type ChanceKey, type ChanceLayers } from "./chances";
import {
  NO_MONSTER_STATS,
  monsterActionsBonus,
  monsterCritChance,
  monsterCritDamageBonus,
  monsterDamageBonus,
  monsterEvasionBonus,
  monsterHealthBonus,
  monsterMagicResist,
  monsterTechniqueBonus,
  monsterTenacity,
  rollMonsterStats,
  type MonsterStats,
} from "./monsterStats";
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
  OIL_NAMES,
  OIL_ROUNDS,
  EXHAUST_ROUNDS,
  bossDotTick,
  dotBaseTick,
  dotSkillTick,
  dotTickSpan,
  type DotKind,
  skillDotTick,
  magicTickFrom,
  oilTickDamage,
  refreshedTick,
  type OilKind,
} from "./statusEffects";
import { ARCHETYPES, type ArchetypeId } from "./archetypes";
import type { GearEffectId, GearPassiveId } from "./gearEffects";
import { pouchIds } from "./pouch";
import {
  STAMINA_GUARD,
  STAMINA_MIN_PAID,
  STAMINA_TURN_RECOVERY,
  STAMINA_ROUND_RECOVERY,
  STAMINA_BACKPACK,
  STAMINA_TECHNIQUE_EXTRA,
  SECOND_WIND_COST,
  STAMINA_UNARMED,
  staminaMax,
  weaponStaminaCost,
  STAMINA_BY_WEIGHT,
} from "./stamina";
import { heroItemEffects, type TabEffect } from "./effectEntries";
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
  GearClass,
  GearItem,
  LegendaryPassiveId,
  Player,
  RareAffixId,
  Slot,
  StatKey,
  Threat,
} from "./types";
import { activeSkillEffects } from "./archetypeSkills";

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
    /** Характеристики СИЛ/ЛОВ/ИНТ: дают ОЗ, урон, выносливость или ходы, уклонение, крит и сопротивления. */
    stats: MonsterStats;
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
      breakExtra?: number;
      emberShred?: number;
      cursePower: number; sundered: number;
      /** Наложения кровотечения и яда: урон за тик складывается. */
      bleedStacks?: number;
      poisonStacks?: number;
      /** Урон масла с клинка: один слот, новое масло заменяет старое. */
      oilType: OilKind | null;
      oilRounds: number;
      /** Сила масла: тик огня и льда, разовый урон магии, −броня раскола, % остроты. */
      oilPower?: number;
      /** Доля снижения атак врага (масло льда). */
      oilCut?: number;
      /** Раскол врага: плоское снижение брони и доля брони, раунды. Приёмы первой партии. */
      breakFlat?: number;
      breakPct?: number;
      breakRounds?: number;
      /** Побои: прибавка к получаемому врагом урону (накапливается), раунды. */
      beatMult?: number;
      beatRounds?: number;
      /** Приёмы первой партии и второй: таймеры и флаги врага. */
      noGuard?: number; throwDown?: number; shatterRounds?: number; skipTurn?: number; feint?: number; noEvade?: number;
      swingDmg?: number; echoDue?: number; eruptRounds?: number; eruptTick?: number; eruptDown?: number; eruptWither?: number;
      drainRounds?: number; drainTick?: number;
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
    /** Эффекты надетых исследованных вещей для вкладки «Эффекты». Не меняются в бою. */
    itemEffects?: TabEffect[];
    /** Уровень героя: от него зависит множитель опыта за монстра. */
    level: number;
    armor: number;
    evade: number;
    ap: number;
    /** Выносливость: тратится действиями, восстанавливается в начале раунда. */
    stamina: number;
    staminaMax: number;
    /** Маг. барьер сейчас и максимум на бой: поглощает урон первым, кроме ядов и кровотечения. */
    barrier: number;
    barrierMax: number;
    /** Удары по рукам для атаки; пусто — кулаки. */
    hands: HandStrike[];
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
    /** Основное оружие лёгкое и с ЛОВ: ЛОВ идёт в плоский урон оружия. */
    weaponAgi: boolean;
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
    /** Зелье из сумки: не тратит выносливость. */
    turnPouch: number;
    /** Концентрация 0–7: мощная атака −1, обычная 0, безопасная +1, приём −1, расходник +1, защита +2; при 5 — спец-приём архетипа. */
    concentration: number;
    /** Регенерация за ход героя из снаряжения (срабатывает в начале каждого хода). */
    regenTurn?: number;
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
      /** Ветки навыков: щит Стены щитов и раунд, в котором он выдан. */
      wallShield?: number;
      wallShieldRound?: number;
      /** Тень 5: раунд, в котором уже был контрудар. Уклонение в раунде: dodgedRound. */
      shadowCounterRound?: number;
      dodgedRound?: number;
      /** Непреклонность 5: использован ли «Последний рубеж». */
      lastStandUsed?: number;
      /** Чтение вслух (Списки B): первый созданный свиток в бою уже применён дважды. */
      readAloudUsed?: number;
      /** Раунды действия зелья скорости: +1 ход в раунде. */
      haste: number;
      /** Приёмы героя: таймеры и флаги между ходами (живут в statuses, клонируются вместе с ним). */
      fencingTurns?: number; counterNext?: number; counterTurns?: number; shadowCharges?: number;
      /** Комбо Дуэлянта: стаки 0–5 и раунд, в котором герой последний раз бил. */
      comboStacks?: number; comboRound?: number;
      /** Раунд, в котором враг последний раз атаковал героя (приём «Встречный выпад»). */
      incomingRound?: number;
      wallRounds?: number; prepRounds?: number; prepared?: number; bubbleTurns?: number; bubbleAbsorbed?: number;
      rainRounds?: number; halfDmg?: number; noEvade?: number; nextPierce?: number; gripTurn?: number;
      throwPending?: number; turnActs?: number; turnDealt?: number; ignoreArmorNow?: number;
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
      /** Сопротивление эффекту: шанс (0–1), что эффект не наложится, и сколько раундов действует. */
      resistFx?: Partial<Record<ImmunityEffect, { chance: number; rounds: number }>>;
      /** Слот очереди (раунд × 1000 + индекс), в котором уже пили зелье выносливости. */
      staminaPotionSlot?: number;
      /** Эликсиры с таймером: вампиризм и точность. Значение и раунды. */
      buffs?: Partial<Record<"vamp" | "magic_vamp" | "sure_hit", { value: number; rounds: number }>>;
      /** Каменная кожа: доля снижения входящего урона (по умолчанию 0.3). */
      stonePct?: number;
      /** Ярость: прибавка за каждые 10% недостающего ОЗ, в процентах (по умолчанию 10). */
      rageStep?: number;
      /** Варвар: кровавая ярость (вампиризм оружием). */
      bloodRage: number;
      /** Ассасин: масло быстрого клинка. */
      quickblade: number;
      /** Смазанный клинок: вид урона масла и раунды, в которые оружие смазано (1). */
      oilType: OilKind | null;
      oilRounds: number;
      /** Сила масла: тик огня и льда, разовый урон магии, −броня раскола, % остроты. */
      oilPower?: number;
      /** Доля снижения атак врага (масло льда). */
      oilCut?: number;
      /** Колдун: эликсир пакта (урон приёмов). */
      pactElixir: number;
      /** Полная защита от урона (свитки/приёмы архимага). */
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
      /** Новые эффекты: замедление, побои, ослабление, разрушение, иссушение (раунды). */
      slow: number; beat: number; weaken: number; shatter: number; drain: number;
    };
    guard: boolean;
    firstAttackDone: boolean;
    /** Защита уже потрачена на первую атаку после неё (Таран 3 и 5). */
    guardStrikeUsed: boolean;
  };
  bag: Record<string, number>;
  /** Зелья из сумки (до трёх видов): не тратят выносливость. */
  pouch: string[];
  /** Созданное в бою (свитки архимага, расходники дуэлянт): лежит в bag, герою после боя не переходит. */
  conjured: Record<string, number>;
  queue: ("p" | "e")[];
  idx: number;
  round: number;
  /** Пророк: последний приём героя и повтор подряд. */
  lastSkill?: string | null;
  /** Повторение: последний приём героя или свиток. */
  lastRepeat?: { kind: "tech"; ws: WeaponSkillDef } | { kind: "item"; id: string } | null;
  /** Ветки навыков: удар не промахивается и не уклоняется (Тень 3, Зверь 5). Ставится на один ход атаки. */
  skillNoMiss?: boolean;
  /** Ветки навыков: доля брони врага, которую игнорирует атака (Таран 3). */
  armorIgnore?: number;
  /** Созданные в бою свитки (Пожар B: горение от свитков +1 за каждый, до 5). */
  scrollsMade?: number;
  repeatSkill?: boolean;
  /** Плачущая тень: броня поглощает не больше половины удара. */
  piercing?: boolean;
  log: LogLine[];
  over: null | "win" | "lose" | "flee";
  fleeRate: number;
  loot: { gold: number; items: string[]; gear: GearItem[]; xp: number };
  flash: { id: number; target: "p" | "e"; kind: "hit" | "guard" | "miss" | "heal"; amount: number } | null;
}

/** Вид атаки: рискованная — максимум урона и меткость −15, обычная — как раньше, безопасная — минимум и меткость +15. */
export type AttackKind = "risky" | "normal" | "safe";
export const ATTACK_KINDS: AttackKind[] = ["risky", "normal", "safe"];
export const ATTACK_KIND_META: Record<AttackKind, { name: string; short: string; desc: string; accuracy: number }> = {
  risky: { name: "Рискованная", short: "Мощный", desc: "Максимум урона оружия, меткость −15%.", accuracy: -15 },
  normal: { name: "Обычная", short: "Обычный", desc: "Обычный разброс урона, меткость не меняется.", accuracy: 0 },
  safe: { name: "Безопасная", short: "Точный", desc: "Минимум урона оружия, меткость +15%.", accuracy: 15 },
};

/** Базовая меткость по весу оружия; кулаки бьют как лёгкое оружие. */
export const WEAPON_ACCURACY: Record<GearClass, number> = { light: 80, medium: 75, heavy: 65 };
/** Меткость героя не выходит за эти пределы (в процентах). */
export const ACCURACY_MIN = 5;
export const ACCURACY_MAX = 95;

export type PlayerAction =
  | { type: "attack"; kind?: AttackKind }
  | { type: "weapon_skill" }
  | { type: "epic_skill"; id: EpicSkillId }
  | { type: "armor_skill"; id: string }
  | { type: "item"; id: string }
  | { type: "guard" }
  | { type: "archetype_skill" }
  | { type: "flee"; rate?: number }
  | { type: "end_turn" };

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

/** Один удар оружия в руке: отдельная атака со своим броском, стоимостью и эффектами. */
export interface HandStrike {
  lo: number;
  hi: number;
  /** ЛОВ идёт в плоский урон этого удара (лёгкое оружие с основной ЛОВ). */
  agi: boolean;
  /** Выносливость за удар. */
  cost: number;
  /** Средний урон: по нему выбирается сильнейшее оружие для приёмов. */
  power: number;
  name: string;
  /** Вес оружия: от него базовая меткость удара. */
  cls: GearClass;
}

export interface DerivedStats {
  maxHp: number;
  ap: number;
  /** Выносливость на раунд (максимум). */
  staminaMax: number;
  /** Удары по рукам; пусто — кулаки. */
  hands: HandStrike[];
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
  /** Маг. барьер: сумма брони на ИНТ; в бою восстанавливается до этого значения. */
  barrierBonus: number;
  /** Регенерация снаряжения за ход героя (сумма параметров брони и аксессуаров). */
  regenPerTurn: number;
  armorBonus: number;
  evadeBonus: number;
  strFlat: number;
  /** Основное оружие лёгкое и с ЛОВ: ЛОВ идёт в плоский урон оружия. */
  weaponAgi: boolean;
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
  let barrierBonus = 0;
  let regenPerTurn = 0;
  let armorBonus = 0;
  let evadeBonus = 0;
  let hitLo = 0;
  let hitHi = 0;
  let mainName = "Кулаки";
  let weaponSkill: WeaponSkillDef | null = null;
  /* Основное оружие лёгкое и требует ЛОВ: тогда его урон получает +1 за очко ЛОВ (как СИЛ). */
  let mainAgiWeapon = false;
  const hands: HandStrike[] = [];

  for (const slot of SLOT_ORDER) {
    const g = eq[slot];
    if (!g) continue;
    gearNames[slot] = (GEAR_BASES[g.baseId] ?? { name: "Предмет" }).name;
    const st = scaledGearStats(g);
    hpBonus += st.hp ?? 0;
    barrierBonus += st.barrier ?? 0;
    armorBonus += st.armor ?? 0;
    evadeBonus += st.evade ?? 0;
    regenPerTurn += st.regen ?? 0;

    /* Урон считают обе руки: двуручник один, в паре — правая + левая.
     * Оружие в левой руке наносит вдвое меньше: его вклад делится пополам. */
    const isHand = slot === "mainHand" || slot === "offHand";
    if (isHand && st.dmg) {
      const handMult = slot === "offHand" ? 0.5 : 1;
      const lo = Math.round(st.dmg[0] * handMult);
      const hi = Math.round(st.dmg[1] * handMult);
      hitLo += lo;
      hitHi += hi;
      const cls = gearClassFor(g);
      hands.push({
        lo,
        hi,
        agi: cls === "light" && gearAffinity(g) === "agi",
        cost: weaponStaminaCost(cls),
        power: (lo + hi) / 2,
        name: st.base.name,
        cls,
      });
      if (slot === "mainHand") {
        mainName = st.base.name;
        weaponSkill = st.skill;
        mainAgiWeapon = gearClassFor(g) === "light" && gearAffinity(g) === "agi";
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
      for (const key of ["damage", "ap", "spellDamage", "intDiscount", "hp", "armor"]) {
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
  /* Плоский бонус оружия: СИЛ всегда, ЛОВ — если основное оружие лёгкое и с ЛОВ. */
  const strFlat = statDamage(pl.stats.str, pl.passives) + (mainAgiWeapon ? pl.stats.agi : 0);
  /* Благословение священника на поход: здоровье, броня и шансы из blessingEffect. */
  const bless = blessingEffect(pl.blessing);
  const baseHp = statHealth(pl.stats.str, pl.passives) + hpBonus + (hasPassive("iron_will") ? 22 : 0) + mightHp + titanHp;
  /* Колдун 5 «Тёмный пакт»: живучесть +10% от базы здоровья. */
  const pactLife = hasPassive("arch_warlock_5") ? Math.round(baseHp * 0.1) : 0;
  const maxHp = baseHp + (bless.hpPct ? Math.round(baseHp * bless.hpPct) : 0) + pactLife;

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
  if (hasPassive("saboteur")) chanceLayers.crit.effects.push(0.2);
  if (rareAffixPower.crit?.chance) chanceLayers.crit.effects.push(rareAffixPower.crit.chance / 100);
  if (passivePower.precision?.crit) chanceLayers.crit.effects.push(passivePower.precision.crit / 100);
  if (hasPassive("arch_bulwark_5")) chanceLayers.tenacity.effects.push(0.15);
  if (hasPassive("arch_barbarian_5")) chanceLayers.tenacity.effects.push(0.10);
  if (passivePower.fortress?.resist) {
    chanceLayers.fortify.effects.push(passivePower.fortress.resist / 100);
    chanceLayers.magicResist.effects.push(passivePower.fortress.resist / 100);
  }

  /* Ходы героя за раунд: 1 + ЛОВ (блоков действий) + ускорение предметов. Действия внутри блока тратят выносливость. */
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
    staminaMax: staminaMax(pl.stats),
    hands,
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
    barrierBonus,
    regenPerTurn,
    armorBonus,
    evadeBonus,
    strFlat,
    weaponAgi: mainAgiWeapon,
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
  /** Характеристики СИЛ/ЛОВ/ИНТ. */
  stats: MonsterStats;
  /** Основа здоровья H до уровня и угрозы: 35 × T × R + 10 × СИЛ. */
  baseHp: number;
  /** Основа удара: 10 × T × R + 1 × СИЛ, до уровня и угрозы. */
  baseAtk: number;
}

const SPECIAL_MOVES: EnemyMove[] = ["wound", "curse", "drain", "sunder", "bell_stun"];

/** Печати (немота, забвение, оковы) — только у стражей лестниц и катастроф. */
export const SEAL_MOVES: EnemyMove[] = ["seal_items", "seal_skills", "seal_attack"];

/** Кому положены печати: боссу и катастрофе. У обычного монстра и «ужаса» их нет. */
export function mayHaveSeals(isBoss: boolean, threat: Threat): boolean {
  return isBoss || threat === "catastrophe";
}

/** Спавн монстра: уровень (этаж ±1, на первом этаже возможен 0), угроза (80/15/5). */

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
  /* Характеристики кидаются сразу после вида и уровня: угроза не меняет раскладку, у одной твари она одна. */
  const stats = rollMonsterStats(mtype, level, rng);
  /* Здоровье: H = 35 × T × R + 10 × СИЛ; дальше ОЗ = H × L × Ут. R — случайный множитель рода, T — типа. */
  const raceHp = rollRaceHpMult(def.race, rng);
  const baseHp = BASE_HP * typeMeta.hpMult * raceHp + monsterHealthBonus(stats.str);
  /* Удар: def.atk = 10 × T × R + 1 × СИЛ; дальше × L × Угр. R — свой случайный множитель рода для удара. */
  /* Обычные: ОЗ выше медианы рода → удар ниже медианы, и наоборот (ОЗ уже брошено выше). Боссы — как прежде. */
  const raceAtk = isBoss
    ? rollRaceAtkMult(def.race, rng)
    : rollRaceAtkMultOpposite(def.race, raceHpIsHigh(def.race, raceHp), rng);
  const baseAtk = BASE_ATK * typeMeta.hpMult * raceAtk + monsterDamageBonus(stats.str);

  // Шаг усиления падает на 0.05 за уровень, но не ниже ×1.05 (кроме ходов).
  const levelMult = enemyLevelMult(level);
  const scale = isBoss ? BOSS_META : meta;
  const atkMult = levelMult * scale.atkMult;
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

  /* Ходы: 1 всегда, у ловкого типа +1; ловкость добавляет ходы сверху. Видовые и родовые поправки сняты. */
  const apBase = 1 + typeMeta.apDelta + apBonus + (effects.includes("ap") ? effectMagnitude("ap", level) : 0);

  return {
    def,
    stats,
    level,
    threat,
    mtype,
    passive,
    moves,
    effects,
    effectPower: enemyEffectPower(effects, level),
    /* Обычные монстры держат минимум NORMAL_MIN_HP; боссы — как задано. */
    hp: isBoss ? Math.max(1, Math.round(baseHp * levelMult * scale.hpMult)) : Math.max(NORMAL_MIN_HP, Math.round(baseHp * levelMult * scale.hpMult)),
    baseHp,
    baseAtk,
    ap: Math.max(1, Math.min(10, apBase)) + monsterActionsBonus(stats.agi),
    /* Удар = def.atk × L × Угр с разбросом ±ATK_SPREAD. Минимума нет. */
    atk: [
      Math.max(1, Math.round(baseAtk * atkMult * (1 - ATK_SPREAD))),
      Math.max(1, Math.round(baseAtk * atkMult * (1 + ATK_SPREAD))),
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
    ["throwing_knife", 8],
    ["poison_dart", 7],
    ["smoke_bomb", 5],
    ["blast_bomb", floor >= 2 ? 5 : 2],
    ["fear_vial", 3],
    ["potion_l", floor >= 6 ? 7 : 0],
    ["potion_m", floor >= 3 ? 6 : 0],
    ["potion_xl", floor >= 9 ? 5 : 0],
    ["stamina_s", floor >= 2 ? 6 : 0],
    ["stamina_m", floor >= 4 ? 6 : 0],
    ["stamina_l", floor >= 9 ? 5 : 0],
    ["antidote_poison", floor >= 3 ? 4 : 0],
    ["antidote_fear", floor >= 3 ? 4 : 0],
    ["antidote_curse", floor >= 3 ? 4 : 0],
    ["antidote_full", floor >= 6 ? 4 : 0],
    ["elixir_antidote_weak", floor >= 1 ? 4 : 0],
    ["elixir_fire_weak", floor >= 1 ? 4 : 0],
    ["elixir_rage_weak", floor >= 3 ? 4 : 0],
    ["elixir_courage_weak", floor >= 3 ? 4 : 0],
    ["elixir_skin_weak", floor >= 3 ? 4 : 0],
    ["elixir_vamp", floor >= 4 ? 4 : 0],
    ["elixir_spirit", floor >= 4 ? 4 : 0],
    ["elixir_accuracy", floor >= 5 ? 4 : 0],
    ["elixir_antidote", floor >= 5 ? 4 : 0],
    ["elixir_fire", floor >= 5 ? 4 : 0],
    ["elixir_skin", floor >= 6 ? 4 : 0],
    ["elixir_cold", floor >= 6 ? 4 : 0],
    ["elixir_courage", floor >= 6 ? 4 : 0],
    ["elixir_antidote_great", floor >= 7 ? 4 : 0],
    ["elixir_fire_great", floor >= 7 ? 4 : 0],
    ["elixir_cold_great", floor >= 7 ? 4 : 0],
    ["elixir_courage_great", floor >= 7 ? 4 : 0],
    ["elixir_rage", floor >= 8 ? 4 : 0],
    ["elixir_vamp_great", floor >= 8 ? 4 : 0],
    ["elixir_spirit_great", floor >= 8 ? 4 : 0],
    ["elixir_goddess_tear", floor >= 9 ? 4 : 0],
    ["oil_fire_bad", floor >= 2 ? 4 : 0],
    ["oil_sunder_bad", floor >= 2 ? 4 : 0],
    ["oil_edge_bad", floor >= 2 ? 4 : 0],
    ["oil_ice", floor >= 4 ? 4 : 0],
    ["oil_fire", floor >= 4 ? 4 : 0],
    ["oil_weak", floor >= 4 ? 4 : 0],
    ["oil_fatigue", floor >= 4 ? 4 : 0],
    ["oil_magic", floor >= 6 ? 4 : 0],
    ["oil_drain", floor >= 6 ? 4 : 0],
    ["oil_ice_good", floor >= 8 ? 4 : 0],
    ["oil_fire_good", floor >= 8 ? 4 : 0],
    ["oil_edge_good", floor >= 8 ? 4 : 0],
    ["oil_exhaust", floor >= 10 ? 4 : 0],
    ["scroll_spark", 8],
    ["scroll_fire", 7],
    ["scroll_heal", 6],
    ["scroll_shadow", floor >= 2 ? 4 : 2],
    ["scroll_frost", floor >= 2 ? 5 : 2],
    ["scroll_bolt", floor >= 3 ? 5 : 1],
    /* новые припасы и реагенты */
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
      statuses: { ...b.p.statuses, immune: { ...b.p.statuses.immune }, resistFx: { ...(b.p.statuses.resistFx ?? {}) }, buffs: { ...(b.p.statuses.buffs ?? {}) } },
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
      stats: s.stats,
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
      stamina: carriedStamina(pl, d.staminaMax),
      staminaMax: d.staminaMax,
      barrier: d.barrierBonus,
      barrierMax: d.barrierBonus,
      hands: d.hands,
      firstRoundApBonus: d.firstRoundApBonus,
      stats: { ...pl.stats },
      /* Ветки навыков идут в пассивы боя как skill_<ветка>_<a|b>: ранг 3 и ранг 5. */
      passives: [...pl.passives, ...activeSkillEffects(pl).map((k) => `skill_${k}`)],
      itemEffects: heroItemEffects(equippedList(pl).filter((item) => item.identified)),
      hit: d.hit,
      weaponAgi: d.weaponAgi,
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
      regenTurn: d.regenPerTurn,
      turnConsumables: 0,
      turnScrolls: 0,
      turnPouch: 0,
      concentration: 0,
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
        slow: 0, beat: 0, weaken: 0, shatter: 0, drain: 0,
      },
      guard: false,
      firstAttackDone: false,
      guardStrikeUsed: false,
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
/** Горение без срока: держится до конца боя (число раундов больше любого боя). */
const BURN_UNTIL_END = 999;

/** Снимает один негативный эффект героя (для зелий от состояний). */
function clearHeroEffect(b: BattleState, key: ImmunityEffect) {
  const fields: Record<ImmunityEffect, string[]> = {
    bleed: ["wound", "woundStacks"], poison: ["poison", "poisonStacks"], burn: ["burn"],
    curse: ["curse", "cursePower"], fear: ["fear"], stun: ["stunAp"], sunder: ["sundered"], chill: ["chill"],
    noHeal: ["noHeal"], darkness: ["darkness"], sealItems: ["sealItems"],
    sealSkills: ["sealSkills"], sealAttack: ["sealAttack"],
  };
  const st = b.p.statuses as unknown as Record<string, number>;
  for (const f of fields[key]) st[f] = 0;
}

/** Зелье очищения: все негативные эффекты героя. */
function clearAllHeroNegatives(b: BattleState) {
  clearHeroNegatives(b, true);
  for (const k of IMMUNITY_EFFECTS) clearHeroEffect(b, k);
}

/**
 * Приёмы первой партии: эффекты, которые не ждут следующего хода.
 * М(X) в значениях эффектов — характеристика героя по этому приёму, но не больше 10.
 * Возвращает урон сверх удара (искра). Вызывается до устаревшей цепочки эффектов.
 */
/** Слабость не приговор: снимает негативные эффекты героя, возвращает их число. */
function clearHeroNegatives(b: BattleState, silent = false): number {
  const keys = ["wound", "curse", "poison", "sundered", "rot", "stunAp", "sealItems", "beat", "weaken", "shatter", "slow", "drain", "burn", "chill"] as const;
  const st = b.p.statuses as unknown as Record<string, number>;
  let n = 0;
  for (const k of keys) {
    if ((st[k] ?? 0) > 0) {
      st[k] = 0;
      n += 1;
    }
  }
  if (n > 0 && !silent) push(b, `Слабость не приговор: снято ${n} негативных эффектов, +${n * 25} урона.`, "p");
  return n;
}

/** Комбо Дуэлянта: до 5 стаков; каждый даёт +5% урона героя, сгорают в конце раунда без удара героя. */
export const DUELIST_COMBO_MAX = 5;
export const DUELIST_COMBO_STEP = 0.05;
/** Расколотый строй (рубеж 10): при полном комбо следующий удар ×1,5 и стаки тратятся. */
const DUELIST_COMBO_BURST = 1.5;

function isDuelist(b: BattleState): boolean {
  return b.p.archetype === "duelist";
}
function comboStacks(b: BattleState): number {
  return b.p.statuses.comboStacks ?? 0;
}
function addCombo(b: BattleState, n = 1) {
  if (!isDuelist(b) || b.p.hp <= 0) return;
  const before = comboStacks(b);
  const after = Math.min(DUELIST_COMBO_MAX, before + n);
  if (after === before) return;
  b.p.statuses.comboStacks = after;
  push(b, `Комбо: ${after}/${DUELIST_COMBO_MAX} стаков (+${Math.round(after * DUELIST_COMBO_STEP * 100)}% урона).`, "p");
}
/** Контратака Дуэлянта: ветка «Ответ» — A: 20% брони врага игнорируется, B: без промаха. */
function duelistCounterHit(b: BattleState, cd: number, note: string, accuracy?: number): number {
  const prevIgnore = b.armorIgnore;
  const prevNoMiss = b.skillNoMiss;
  if (isDuelist(b) && hasPassive(b, "skill_riposte_a")) b.armorIgnore = 0.2;
  if (isDuelist(b) && hasPassive(b, "skill_riposte_b")) b.skillNoMiss = true;
  const dealt = hitEnemy(b, cd, "phys", note, true, undefined, accuracy);
  b.armorIgnore = prevIgnore;
  b.skillNoMiss = prevNoMiss;
  return dealt;
}
/** Контратака Дуэлянта: удачная даёт стак; с рубежом 5 стак даёт каждая, даже промах. */
function comboOnCounter(b: BattleState, dealt: number) {
  if (!isDuelist(b)) return;
  if (dealt > 0 || hasPassive(b, "arch_duelist_5")) addCombo(b);
  /* Встречный клинок: после удачной контратаки шанс +1 стак. */
  if (dealt > 0 && hasGearPassive(b, "duelist_phantom") && Math.random() < passivePower(b, "duelist_phantom", "stack") / 100) addCombo(b);
}

/** Раскол брони врага: плоское снижение на раунды. Босс не поддаётся, как и прежний раскол. */
function applyEnemyBreak(b: BattleState, flat: number, pct: number, rounds: number, label: string) {
  if (bossResists(b) || b.enemy.hp <= 0) return;
  /* Расколотый строй (рубеж 10): каждый раскол героя снимает ещё 2 брони на 2 раунда. */
  if (isDuelist(b) && hasPassive(b, "arch_duelist_10")) {
    flat += 2;
    rounds = Math.max(rounds, 2);
  }
  /* Ветка «Раскол» A «Трещина»: каждый раскол героя снимает ещё 1 броню. */
  if (isDuelist(b) && hasPassive(b, "skill_split_a")) flat += 1;
  /* Встречный клинок: раскол снимает ещё броню до конца раунда. */
  if (isDuelist(b) && hasGearPassive(b, "duelist_phantom")) b.enemy.statuses.breakExtra = passivePower(b, "duelist_phantom", "shatter");
  addCombo(b);
  b.enemy.statuses.breakFlat = flat;
  b.enemy.statuses.breakPct = pct;
  b.enemy.statuses.breakRounds = rounds;
  push(b, `${label}: броня ${b.enemy.def.name} ${pct > 0 ? `−${Math.round(pct * 100)}%` : `−${flat}`} на ${rounds} раунда (сейчас ${enemyArmorNow(b.enemy)}).`, "p");
}

/** Приёмы, которые не атакуют сами: их нет в цикле ударов. */
const NO_ATTACK_EFFECTS = new Set<string>([
  "fencing_pierce", "prepare", "bubble", "healing_rain", "wall", "reverse_grip", "eruption", "life_draw", "spear_forward",
  "spark",
]);
/** Прямой урон без броска оружия: Искра, Выброс, Вытягивание жизни. */
const DIRECT_DAMAGE_EFFECTS = new Set<string>(["spark", "eruption", "life_draw"]);
/** Приёмы, которые заканчивают ход героя. */
const ENDING_TECH_EFFECTS = new Set<string>([
  "snake_bite", "double_cut", "lunge", "feint", "prepare", "echo", "execute", "spear_forward",
]);

/** Начало удара героя: Бросок, за которым продолжили атаки, даёт кровотечение; Стена снимается. */
function heroAttackStart(b: BattleState, eff: string | undefined) {
  if ((b.p.statuses.throwPending ?? 0) > 0 && b.enemy.hp > 0) {
    b.p.statuses.throwPending = 0;
    const tick = 5 + Math.min(TECHNIQUE_STAT_CAP, b.p.stats.agi);
    applyEnemyStatus(b, "bleed", 3, tick);
    push(b, `Бросок продолжен: ${b.enemy.def.name} истекает кровью — ${tick} за раунд на 3 раунда.`, "p");
  }
  if ((b.p.statuses.wallRounds ?? 0) > 0 && !NO_ATTACK_EFFECTS.has(eff ?? "")) {
    b.p.statuses.wallRounds = 0;
    push(b, "Стена опущена: удар героя снимает её.", "p");
  }
}

function techniqueDirectEffect(b: BattleState, ws: WeaponSkillDef, executeNow: boolean): number {
  const eff = ws.effect;
  const m = Math.min(TECHNIQUE_STAT_CAP, b.p.stats[ws.scaleStat]);
  if (eff === "breach") applyEnemyBreak(b, 10, 0, 3, "Пробитие");
  if (eff === "plank") applyEnemyBreak(b, 0, 0.25, 3, "Дробящая доска");
  if (eff === "hew") applyEnemyBreak(b, 5, 0, 3, "Крушение");
  if (eff === "guillotine") applyEnemyBreak(b, 0, 1, 3, "Гильотина");
  if (eff === "sweep" || eff === "snake_lunge") {
    /* Побои: каждый удар накладывает ещё +20% (Снос) или +10% (Змеиный выпад), до +60%. */
    const add = eff === "sweep" ? 0.2 : 0.1;
    const prev = (b.enemy.statuses.beatRounds ?? 0) > 0 ? (b.enemy.statuses.beatMult ?? 0) : 0;
    b.enemy.statuses.beatMult = Math.min(0.6, prev + add);
    b.enemy.statuses.beatRounds = 3;
    push(b, `Побои на ${b.enemy.def.name}: +${Math.round((b.enemy.statuses.beatMult ?? 0) * 100)}% урона на 3 раунда.`, "p");
  }
  if (eff === "second_wind") {
    const gain = Math.round(b.p.staminaMax * 0.25);
    b.p.stamina = Math.min(b.p.staminaMax, b.p.stamina + gain);
    push(b, `Второе дыхание: +${gain} выносливости.`, "p");
  }
  if (eff === "funnel" && b.enemy.hp > 0) {
    const cut = Math.round(b.p.staminaMax * 0.25);
    b.p.stamina = Math.max(0, b.p.stamina - cut);
    push(b, `Воронка: удар не убил врага, выносливость −${cut}.`, "p");
  }
  const bonus = techniqueBonusNow(b, ws);
  if (eff === "hew" && !bossResists(b)) b.enemy.statuses.noGuard = 1;
  if (eff === "snake_bite") {
    applyEnemyStatus(b, "poison", 3, 2 + bonus);
    push(b, `${b.enemy.def.name} отравлен укусом: 3 раунда, ${2 + bonus} за раунд.`, "p");
    return 0;
  }
  if (eff === "double_cut") {
    applyEnemyStatus(b, "bleed", 3, 3 + bonus);
    push(b, `${b.enemy.def.name} истекает кровью от двойного пореза: 3 раунда, ${3 + bonus} за раунд.`, "p");
    return 0;
  }
  if (eff === "lunge") {
    /* Выпад: первая атака врага в этом раунде контратакуется. */
    b.p.statuses.counterNext = 1;
    b.p.statuses.counterTurns = 1;
    push(b, "Выпад: первая атака врага в этом раунде получит ответ.", "p");
  }
  if (eff === "spear_forward") {
    /* Копьё вперёд: первые 2 атаки врага контратакуются, до тех пор пока не сработают. */
    b.p.statuses.counterNext = 2;
    b.p.statuses.counterTurns = 999;
    push(b, "Копьё вперёд: первые две атаки врага получат ответ.", "p");
  }
  if (eff === "fencing_pierce") {
    /* Фехтование: этот ход и следующий — удары героя сквозь защиту. */
    b.p.statuses.fencingTurns = 2;
    push(b, "Фехтование: удары сквозь защиту до конца следующего хода.", "p");
  }
  if (eff === "feint") {
    b.enemy.statuses.feint = 1;
    push(b, `Обманка: следующее действие ${b.enemy.def.name} может сорваться.`, "p");
  }
  if (eff === "prepare") {
    b.p.statuses.prepRounds = 2;
    b.p.statuses.prepared = 1;
    push(b, "Подготовка: +25 брони на 2 раунда; следующая атака получит +25% брони.", "p");
  }
  if (eff === "echo") {
    /* Эхо: в конце хода врага — 20% от урона героя за его ход (уже включая этот приём). */
    b.enemy.statuses.echoDue = Math.round((b.p.statuses.turnDealt ?? 0) * 0.2);
    push(b, `Эхо: в конце хода ${b.enemy.def.name} придёт ${b.enemy.statuses.echoDue}.`, "p");
  }
  if (eff === "bubble") {
    b.p.barrier = (b.p.barrier ?? 0) + 10 + bonus;
    b.p.statuses.bubbleTurns = 3;
    b.p.statuses.bubbleAbsorbed = 0;
    push(b, `Пузырь: барьер ${10 + bonus} на 3 хода; поглощённое вернётся врагу.`, "p");
  }
  if (eff === "swing") {
    if (!bossResists(b)) b.enemy.statuses.shatterRounds = 3;
    b.enemy.statuses.swingDmg = 3 * m;
    push(b, `Размах: разрушение ${b.enemy.def.name} на 3 раунда; в начале его хода — удар ${3 * m}.`, "p");
  }
  if (eff === "wall") {
    b.p.statuses.wallRounds = 3;
    push(b, "Стена: +25% брони и +15% стойкости на 3 раунда; снимается после следующей атаки.", "p");
  }
  if (eff === "reverse_grip") {
    b.p.statuses.halfDmg = 1;
    b.p.statuses.gripTurn = 1;
    push(b, "Обратный хват: в этом ходу урон ÷2, удары сквозь броню, шанс оглушить 25%.", "p");
  }
  if (eff === "healing_rain") {
    b.p.statuses.rainRounds = 3;
    b.enemy.statuses.skipTurn = 1;
    push(b, `Целебный дождь: лечение 5 + 2×ИНТ в начале хода, ${b.enemy.def.name} пропустит ход.`, "p");
  }
  if (eff === "eruption") {
    const dealt = hitEnemy(b, 40, "magic", " [Выброс]", false);
    if (b.enemy.hp > 0) {
      applyEnemyStatus(b, "burn", 3, m);
      b.enemy.statuses.eruptRounds = 3;
      b.enemy.statuses.eruptTick = Math.max(1, m - 3) + 1 + 3;
      b.enemy.statuses.eruptDown = 0.2;
      b.enemy.statuses.eruptWither = 1;
      push(b, `Выброс: горение ${m}, обморожение, проклятие и увядание на 3 раунда.`, "p");
    }
    return dealt;
  }
  if (eff === "life_draw") {
    /* Вытягивание жизни: удар 10 + бонус, затем кража: 5% макс. ОЗ врага за раунд на 3 раунда, герой получает столько же. */
    const dealt = hitEnemy(b, 10 + bonus, "magic", " [Вытягивание жизни]", false);
    if (b.enemy.hp > 0) {
      b.enemy.statuses.drainRounds = 3;
      b.enemy.statuses.drainTick = Math.max(1, Math.round(b.enemy.maxHp * 0.05));
      push(b, `Иссушение: ${b.enemy.def.name} теряет ${b.enemy.statuses.drainTick} ОЗ за раунд на 3 раунда, ты получаешь столько же.`, "p");
    }
    return dealt;
  }
  if (eff === "throw" && b.enemy.hp > 0) {
    /* Бросок: если ход закончится — враг не уходит в защиту; если продолжим атаки — кровотечение. */
    b.p.statuses.throwPending = 1;
  }
  if (eff === "snake_lunge") b.p.statuses.nextPierce = 1;
  if (eff === "execute" && executeNow && b.enemy.hp > 0) {
    applyEnemyStatus(b, "bleed", 3, Math.max(1, Math.round(b.enemy.maxHp * 0.05)));
    push(b, `Казнь: ${b.enemy.def.name} истекает кровью: 3 раунда, 5% макс. ОЗ за раунд.`, "p");
    return 0;
  }
  if (eff === "ring" || eff === "meteor") {
    if (!bossResists(b) && b.enemy.hp > 0) {
      b.enemy.statuses.stunAp = Math.min(4, b.enemy.statuses.stunAp + 1);
      push(b, `${b.enemy.def.name} оглушён и потеряет ход в следующем раунде!`, "p");
    }
    return 0;
  }
  if (eff === "spark") {
    /* Искра: магический удар без броска оружия, горение на себя и на врага. */
    const dealt = hitEnemy(b, 25 + bonus, "magic", ` [Приём: ${ws.name}]`, true);
    const tick = 3 + bonus;
    const enemyBurn = magicDot(b, "burn", BURN_UNTIL_END, tick, false);
    /* Горение без срока: держится до конца боя. */
    setPlayerTick(b, "burn", BURN_UNTIL_END, tick);
    push(b, `Искра жжёт тебя: ${tick} за раунд, до конца боя.`, "p");
    if (b.enemy.hp > 0) {
      applyEnemyStatus(b, "burn", enemyBurn.rounds, enemyBurn.tick);
      push(b, `${b.enemy.def.name} горит: ${enemyBurn.tick} за раунд, до конца боя.`, "p");
    }
    return dealt;
  }
  return 0;
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
  bonus = Math.round(bonus * weakenedMult(1, b.p.statuses.weaken));
  const eff = ws.effect;
  if (eff === "armor_damage") bonus += Math.round(b.p.armor * techValue(ws, ws.id === "bulwark_verdict" ? 0.75 : 0.5, 100));
  if (eff === "advance") bonus += Math.round(b.p.armor * 0.5);
  if (eff === "missing_hp") bonus = Math.round(bonus * (1 + Math.min(10, Math.floor(missingHpRatio(b) * 10)) * techValue(ws, 0.06, 100)));
  if (eff === "enemy_missing") bonus = Math.round(bonus * (1 + Math.min(10, Math.floor(enemyMissingRatio(b) * 10)) * techValue(ws, 0.06, 100)));
  if (eff === "debuff_damage") bonus = Math.round(bonus * (1 + Math.min(4, enemyDebuffCount(b)) * techValue(ws, 0.10, 100)));
  if (eff === "first_strike" && b.round <= 2) bonus = Math.round(bonus * techValue(ws, 2, 100));
  return bonus;
}
function skillDamageMult(b: BattleState) {
  const lordOfPact = hasPassive(b, "arch_warlock_10") && b.p.hp < b.p.maxHp * 0.5 ? 0.30 : 0;
  return 1 + effectPower(b, "skill_damage") / 100 + passivePower(b, "warlock_pact", "skillDamage") / 100 +
    (hasPassive(b, "arch_warlock_5") ? 0.20 : 0) + lordOfPact + (b.p.statuses.pactElixir > 0 ? 0.25 : 0) +
    ((b.p.stats.int * effectPower(b, "wisdom")) / 100) * weakMult(b);
}
/** База приёмов и свитков: 10 + 2×ИНТ. Коэффициент задаёт конкретный приём. */
export function techniqueDamage(int: number, coefficient = 1): number {
  return statTechniqueDamage(int) * coefficient;
}
/** Добавка «бонус навыков» к множителю приёма: свойство предметов. */
export function techniqueSkillScale(effectPower: Partial<Record<GearEffectId, number>>, _passives: readonly string[] = []): number {
  return effectPower.skill_scale ?? 0;
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
/** Враг ниже доли своего максимума ОЗ (0 < ОЗ < доля). */
function enemyBelowShare(b: BattleState, share: number): boolean {
  return b.enemy.hp > 0 && b.enemy.hp < b.enemy.maxHp * share;
}
/** Кровавая ярость: ниже 50% ОЗ героя; с ветвью 5 — и пока враг ниже 30%. */
function skillRageOn(b: BattleState): boolean {
  if (!b.p.passives?.includes("skill_rage_a")) return false;
  return missingHpRatio(b) > 0.5 || (b.p.passives.includes("skill_rage_b") && enemyBelowShare(b, 0.3));
}
function rageBonus(b: BattleState): number {
  const steps = Math.min(10, Math.floor(missingHpRatio(b) * 10));
  return (effectPower(b, "rage") / 100) * steps + (b.p.statuses.rage > 0 ? ((b.p.statuses.rageStep ?? 10) / 100) * steps : 0);
}
function statusRounds(b: BattleState, base: number) {
  return base + effectPower(b, "status_duration") + passivePower(b, "time_warp", "duration");
}
export function playerResistChance(b: BattleState) {
  const extra = [
    ...(hasPassive(b, "stone_skin") ? [0.15] : []),
    ...(b.p.statuses.resistPotion > 0 ? [0.25] : []),
    ...((b.p.statuses.wallRounds ?? 0) > 0 ? [0.15] : []),
  ];
  return heroChance(b, b.p.chanceLayers.tenacity, extra);
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

/** Ослабление: множитель для любого урона, который растёт от СИЛ, ЛОВ или ИНТ героя. */
function weakMult(b: BattleState): number {
  return weakenedMult(1, b.p.statuses.weaken);
}

/** Разрушение: шанс героя из слоя (укрепление, магическое сопротивление, стойкость) режется на 25%. */
function heroChance(b: BattleState, layer: Parameters<typeof combatChance>[0], extra: number[] = []): number {
  const base = combatChance(layer, extra);
  return b.p.statuses.shatter > 0 ? base * SHATTER_MULT : base;
}

/** Истощение врага: снимает случайных положительных (ярость, костяной щит); продление снимает все. */
function applyDepletion(b: BattleState, rounds = DEPLETE_ROUNDS): string[] {
  const e = b.enemy;
  const pool = [...(e.fury > 0 ? ["fury"] : []), ...(e.shield ? ["shield"] : [])];
  const { removed } = depleteRemove(pool, e.depleted > 0);
  for (const id of removed) {
    if (id === "fury") e.fury = 0;
    if (id === "shield") e.shield = false;
  }
  e.depleted = Math.max(e.depleted, rounds);
  const names: Record<string, string> = { fury: "ярость", shield: "костяной щит" };
  push(b, removed.length ? `Истощение: у ${e.def.name} снято ${removed.map((r) => names[r]).join(", ")}.` : `Истощение ${e.def.name}: положительных эффектов нет, но они гаснут на ${e.depleted} хода.`, "p");
  return removed;
}

/**
 * Колдун: иссушение врага. Тик — 5% макс. ОЗ врага (как «Вытягивание жизни»); герой получает столько же.
 * Рубеж 10 «Владыка пакта» даёт +2 раунда. Наложение не сокращает уже идущее иссушение.
 */
function applyPactDrain(b: BattleState, rounds: number) {
  if (b.enemy.hp <= 0) return;
  const total = rounds + (hasPassive(b, "arch_warlock_10") ? 2 : 0);
  b.enemy.statuses.drainRounds = Math.max(b.enemy.statuses.drainRounds ?? 0, total);
  b.enemy.statuses.drainTick = Math.max(1, Math.round(b.enemy.maxHp * PACT_DRAIN_SHARE));
  push(b, `Иссушение: ${b.enemy.def.name} теряет ${b.enemy.statuses.drainTick} ОЗ за раунд на ${total} раунда, ты получаешь столько же.`, "p");
}

/** Иссушение: в конце раунда герой теряет долю макс. ОЗ (мимо брони), враг лечится на половину. */
function drainRoundTick(b: BattleState) {
  if (b.over || b.p.statuses.drain <= 0 || b.p.hp <= 0 || b.enemy.hp <= 0) return;
  const t = drainTick(b.p.maxHp, b.p.statuses.drain);
  b.p.hp = Math.max(0, b.p.hp - t.damage);
  flash(b, "p", "hit", t.damage);
  const healed = Math.min(t.heal, Math.max(0, b.enemy.maxHp - b.enemy.hp));
  if (healed > 0) b.enemy.hp += healed;
  push(b, `Иссушение: −${t.damage} ОЗ; ${b.enemy.def.name} восстанавливает ${healed} ОЗ.`, "e");
  b.p.statuses.drain -= 1;
  heroDeathCheck(b);
}

/** Приёмы, которые запрещает Немота (свиток, магический приём, спец-приём архетипа). */
const MAGIC_TECH_EFFECTS: readonly string[] = ["pierce", "chill", "leech", "skill_leech"];

/** Уклонение твари: тип плюс род, всегда от текущего определения. */
function enemyEvade(b: BattleState): number {
  if ((b.p.statuses.noEvade ?? 0) > 0 || (b.enemy.statuses.noEvade ?? 0) > 0) return 0;
  return combineChances([monsterEvade(b.enemy.def.race, b.enemy.mtype), monsterEvasionBonus(enemyStats(b).agi)]);
}

/* Характеристики врага. Старый бой без раскладки считается нулевым. */
function enemyStats(b: BattleState): MonsterStats {
  return b.enemy.stats ?? NO_MONSTER_STATS;
}

/* Крит врага: ЛОВ плюс эффекты; эффекты при истощении не работают, характеристики — работают. */
function enemyCritChance(b: BattleState): number {
  return combineChances([monsterCritChance(enemyStats(b).agi), effectsDepleted(b) ? 0 : eChance(b, "crit_chance")]);
}

function enemyCritMult(b: BattleState): number {
  const effectPct = effectsDepleted(b) ? 0 : eEffect(b, "crit_mult");
  return 2 + effectPct / 100 + monsterCritDamageBonus(enemyStats(b).agi);
}

/* Магическое сопротивление врага: ИНТ плюс эффекты. gated — эффекты при истощении не работают. */
function enemyMagicResist(b: BattleState, gated = false): number {
  const effect = gated && effectsDepleted(b) ? 0 : eChance(b, "magic_resist");
  const r = combineChances([monsterMagicResist(enemyStats(b).int), effect]);
  return (b.enemy.statuses.shatterRounds ?? 0) > 0 ? r * 0.5 : r;
}

/* Ум врага: прибавка к урону приёмов за очко ИНТ (обычный удар — без прибавки). */
function enemyTechniqueBonus(b: BattleState, move: EnemyMove): number {
  return move === "attack" ? 0 : monsterTechniqueBonus(enemyStats(b).int);
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
  if (playerImmune(b, id)) {
    push(b, `Иммунитет: ${IMMUNITY_NAMES[id]} не накладывается.`, "p");
    return true;
  }
  const rf = b.p.statuses.resistFx?.[id];
  if (rf && rf.rounds > 0 && Math.random() < rf.chance) {
    push(b, `Сопротивление: ${IMMUNITY_NAMES[id]} не накладывается.`, "p");
    return true;
  }
  return false;
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
  const resist = combineChances([monsterTenacity(enemyStats(b).str), effectsDepleted(b) ? 0 : eChance(b, "resist")]) *
    ((b.enemy.statuses.shatterRounds ?? 0) > 0 ? 0.5 : 1);
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
  /* Тлеющие угли (Пожар A): горящий враг −2 брони, пока горит. */
  if (key === "burn" && hasPassive(b, "skill_ember_a")) b.enemy.statuses.emberShred = 2;
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

/** Лёд под маслом режет силу атаки врага на долю из предмета. */
function enemyOilAttackMult(b: BattleState): number {
  return enemyOil(b, "ice") ? 1 - (b.enemy.statuses.oilCut ?? 0) : 1;
}

/** Огонь или лёд на враге: тик за раунд, срок OIL_ROUNDS. Сильнейший тик держится. */
function applyOilTick(b: BattleState, kind: "fire" | "ice", power: number, cut: number, element: DamageElement) {
  if (raceElementMult(b.enemy.def.race, element) <= 0) {
    push(b, `${b.enemy.def.name} не поддаётся маслу: ${OIL_NAMES[kind]} не действует.`, "sys", element);
    return;
  }
  const renew = enemyOil(b, kind);
  b.enemy.statuses.oilTick = refreshedTick(renew && b.enemy.statuses.oilType === kind, b.enemy.statuses.oilTick, power);
  b.enemy.statuses.oilType = kind;
  b.enemy.statuses.oilRounds = OIL_ROUNDS;
  b.enemy.statuses.oilCut = kind === "ice" ? cut : 0;
  push(
    b,
    renew
      ? `Смазанный клинок обновляет ${OIL_NAMES[kind]} на ${b.enemy.def.name}: ${OIL_ROUNDS} раунда.`
      : `Смазанный клинок накладывает ${OIL_NAMES[kind]} на ${b.enemy.def.name}: ${OIL_ROUNDS} раунда.`,
    "p",
    element,
  );
}

/**
 * Удар смазанным оружием применяет вид масла. Острота работает на урон героя
 * (см. hitEnemy), остальные виды накладываются на врага.
 */
function oilOnHit(b: BattleState, _hitDamage: number) {
  const s = b.p.statuses;
  const kind = s.oilType;
  if (!kind || s.oilRounds <= 0 || b.enemy.hp <= 0) return;
  const power = s.oilPower ?? 0;
  switch (kind) {
    case "fire":
      applyOilTick(b, "fire", power, 0, "fire");
      return;
    case "ice":
      applyOilTick(b, "ice", power, s.oilCut ?? 0, "ice");
      return;
    case "sunder": {
      b.enemy.statuses.breakFlat = power;
      b.enemy.statuses.breakRounds = OIL_ROUNDS;
      push(b, `Раскол: броня ${b.enemy.def.name} −${power} на ${OIL_ROUNDS} раунда.`, "p");
      return;
    }
    case "weak": {
      b.enemy.statuses.breakPct = power;
      b.enemy.statuses.breakRounds = OIL_ROUNDS;
      push(b, `Разрушение: броня ${b.enemy.def.name} −${Math.round(power * 100)}% на ${OIL_ROUNDS} раунда.`, "p");
      return;
    }
    case "magic":
      elementalHit(b, power, " Масло: магия.", undefined);
      return;
    case "drain": {
      b.enemy.statuses.oilType = "drain";
      b.enemy.statuses.oilRounds = OIL_ROUNDS;
      push(b, `${b.enemy.def.name} не может восстанавливать здоровье: иссушение на ${OIL_ROUNDS} раунда.`, "p");
      return;
    }
    case "exhaust": {
      /* Один случайный положительный эффект врага снимается и не возвращается EXHAUST_ROUNDS раундов. */
      const e = b.enemy;
      const pool = [...(e.fury > 0 ? ["fury"] : []), ...(e.shield ? ["shield"] : [])];
      if (pool.length === 0) {
        push(b, `Масло истощения: у ${e.def.name} нечего снимать.`, "sys");
        return;
      }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick === "fury") e.fury = 0;
      if (pick === "shield") e.shield = false;
      e.depleted = Math.max(e.depleted, EXHAUST_ROUNDS);
      const names: Record<string, string> = { fury: "ярость", shield: "костяной щит" };
      push(b, `Масло истощения: у ${e.def.name} снято ${names[pick]}, возврат заблокирован на ${EXHAUST_ROUNDS} раунда.`, "p");
      return;
    }
    default:
      return; // острота и усталость: не на ударе врага
  }
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
  if (b.enemy.statuses.oilType === "drain" && b.enemy.statuses.oilRounds > 0) {
    push(b, `${b.enemy.def.name} не может восстанавливать здоровье: иссушение масла.`, "e");
    return 0;
  }
  if ((b.enemy.statuses.eruptWither ?? 0) > 0) amount = Math.round(amount * 0.8);
  if (effectsDepleted(b)) {
    push(b, `${b.enemy.def.name} не может лечиться: истощение (ещё ${b.enemy.depleted} ход.).`, "e");
    return 0;
  }
  if (raceCannotHeal(b.enemy.def.race)) {
    push(b, `${b.enemy.def.name} не восстанавливает здоровье: конструкт не поддаётся лечению.`, "e");
    return 0;
  }
  if (b.enemy.statuses.wither > 0) {
    const dmg = Math.max(1, Math.round(amount * (1 - enemyMagicResist(b))));
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

/**
 * Маг. барьер поглощает урон первым. Яды и кровотечение его обходят: их считают отдельно.
 * Возвращает остаток урона, который дошёл до здоровья.
 */
export function absorbBarrier(b: BattleState, dmg: number): number {
  const pool = b.p.barrier ?? 0;
  if (dmg <= 0 || pool <= 0) return dmg;
  const absorbed = Math.min(pool, dmg);
  b.p.barrier = pool - absorbed;
  if ((b.p.statuses.bubbleTurns ?? 0) > 0) b.p.statuses.bubbleAbsorbed = (b.p.statuses.bubbleAbsorbed ?? 0) + absorbed;
  push(b, `Маг. барьер поглощает ${absorbed} урона${b.p.barrier <= 0 ? ", барьер разрушен" : ""}.`, "p");
  return dmg - absorbed;
}

/** Единая точка лечения игрока: болото режет всё, кроме зелий. Возвращает реально восстановленные ОЗ. */
function healPlayer(b: BattleState, amount: number, isPotion = false): number {
  if (b.p.statuses.noHeal > 0) {
    push(b, `Холодное касание глушит жизнь: лечение не действует (ещё ${b.p.statuses.noHeal} ход.).`, "e");
    return 0;
  }
  if (b.p.statuses.wither > 0) {
    const dmg = Math.max(1, Math.round(amount * (1 - heroChance(b, b.p.chanceLayers.magicResist))));
    b.p.hp = Math.max(0, b.p.hp - absorbBarrier(b, dmg));
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
  const chance = Math.min(1, effectPower(b, "dodge_action") / 100);
  if (chance > 0 && Math.random() < chance) {
    b.p.statuses.shadowStep += 1;
    push(b, "Шаг в тень: в следующем раунде +1 ход.", "p");
  }
}

/** Класс оружия в главной руке: от него меткость, когда удар не задан явно. */
function mainHandClass(b: BattleState): GearClass {
  return b.p.hands[0]?.cls ?? "light";
}

/** Уклонение врага в долях: его собственное и от эффектов. Меткость героя сравнивается с ним. */
function heroEvasion(b: BattleState): number {
  if ((b.p.statuses.noEvade ?? 0) > 0 || (b.enemy.statuses.noEvade ?? 0) > 0) return 0;
  const effectEvade = effectsDepleted(b) ? 0 : eChance(b, "evade");
  return Math.min(0.95, effectEvade + enemyEvade(b));
}

/**
 * Меткость удара в долях: базовая по весу и вид атаки. Промахи от мрака и от статуса тьмы
 * не бросаются отдельно: они отнимают меткость в процентных пунктах.
 */
export function heroAccuracy(b: BattleState, cls: GearClass = mainHandClass(b), kind: AttackKind = "normal"): number {
  let pts = WEAPON_ACCURACY[cls] + ATTACK_KIND_META[kind].accuracy;
  const dark = (b.torchTurns ?? 0) > 0 ? 0 : biomeMissChance(b.biome);
  pts -= dark * 100;
  if (b.p.statuses.darkness > 0) pts -= 50;
  return Math.min(ACCURACY_MAX, Math.max(ACCURACY_MIN, pts)) / 100;
}

/** Сравнение меткости с уклонением: выше — преимущество (лучший из двух бросков), ниже — помеха (худший). */
export function heroHitState(accuracy: number, evasion: number): "advantage" | "disadvantage" | "normal" {
  if (accuracy > evasion) return "advantage";
  if (accuracy < evasion) return "disadvantage";
  return "normal";
}

/** Шанс попасть после преимущества, помехи или одного броска. */
export function heroHitChance(accuracy: number, evasion: number): number {
  const p = Math.min(1, Math.max(0, accuracy));
  const state = heroHitState(accuracy, evasion);
  if (state === "advantage") return 1 - (1 - p) * (1 - p);
  if (state === "disadvantage") return p * p;
  return p;
}

/** Бросок попадания: при преимуществе достаточно одного попадания из двух, при помехе нужны оба. */
function rollHeroHit(accuracy: number, evasion: number): boolean {
  const p = Math.min(1, Math.max(0, accuracy));
  const state = heroHitState(accuracy, evasion);
  if (state === "advantage") return Math.random() < p || Math.random() < p;
  if (state === "disadvantage") return Math.random() < p && Math.random() < p;
  return Math.random() < p;
}

/** Превью удара для кнопки вида атаки: меткость, уклонение врага и шанс попасть. */
export function heroAttackPreview(b: BattleState, kind: AttackKind): { accuracy: number; evasion: number; chance: number; state: "advantage" | "disadvantage" | "normal" } {
  const accuracy = heroAccuracy(b, mainHandClass(b), kind);
  const evasion = heroEvasion(b);
  return { accuracy, evasion, chance: heroHitChance(accuracy, evasion), state: heroHitState(accuracy, evasion) };
}

/** Выносливость на старте боя: переносится с карты; полный запас возвращается при выходе из похода. */
export function carriedStamina(pl: Player, max: number): number {
  const v = pl.stamina ?? max;
  return Math.min(max, Math.max(0, Math.round(v)));
}

function calcWeaponRoll(
  b: BattleState,
  mult = 1,
  bonusFlat = 0,
  opts: { skill?: boolean; forceCrit?: boolean; multi?: boolean; hand?: HandStrike; kind?: AttackKind } = {},
) {
  if (mult === 1 && (b.p.statuses.prepared ?? 0) > 0) {
    bonusFlat += Math.round(playerArmorNow(b) * 0.25);
    b.p.statuses.prepared = 0;
  }
  const hand = opts.hand ?? { lo: b.p.hit[0], hi: b.p.hit[1], agi: b.p.weaponAgi, cls: "light" as GearClass };
  /* Рискованная бьёт по максимуму оружия, безопасная — по минимуму, обычная — по разбросу. */
  const base = opts.kind === "risky" ? hand.hi : opts.kind === "safe" ? hand.lo : randInt(hand.lo, hand.hi);
  let d = base + Math.round(statDamage(b.p.stats.str, b.p.passives) * weakenedMult(1, b.p.statuses.weaken)) + (hand.agi ? b.p.stats.agi * weakMult(b) : 0) + bonusFlat;

  if (hasPassive(b, "heavy_hand")) d += 3;
  d += rarePower(b, "might", "damage");

  let damageMult = 1;
  const missing = missingHpRatio(b);
  const enemyMissing = enemyMissingRatio(b);
  damageMult += rageBonus(b);
  damageMult += ((b.p.stats.str * effectPower(b, "might")) / 100) * weakMult(b);
  damageMult += (effectPower(b, "missing_hp_damage") / 100) * Math.min(10, Math.floor(missing * 10));
  damageMult += (effectPower(b, "enemy_missing_damage") / 100) * Math.min(10, Math.floor(enemyMissing * 10));
  if (hasPassive(b, "arch_barbarian_5")) {
    damageMult += Math.floor(missing * 10) * 0.04;
    if (b.p.gearHands === 2) damageMult += 0.25;
  }
  if (hasPassive(b, "arch_barbarian_10") && enemyMissing >= 0.5) damageMult += 0.35;
  if (hasGearPassive(b, "barbarian_rage") && b.p.hp < b.p.maxHp * 0.5) damageMult += passivePower(b, "barbarian_rage", "damage") / 100;
  if (b.p.gearHands === 2) damageMult += effectPower(b, "two_hand_damage") / 100;
  /* Ветки навыков: Кровавая ярость 3 (+25%), Зверь 3 (первый удар +50%), Зверь 5 (добивание +100%). */
  if (skillRageOn(b)) damageMult += 0.25;
  if (hasPassive(b, "skill_beast_a") && !b.p.firstAttackDone) damageMult += 0.5;
  if (hasPassive(b, "skill_beast_b") && enemyBelowShare(b, 0.2)) damageMult += 1;
  const armorBonus = effectPower(b, "armor_damage") / 100 + (hasPassive(b, "arch_bulwark_10") ? 0.5 : 0);
  if (armorBonus > 0) d += Math.round(b.p.armor * armorBonus);
  if (b.round <= 2) {
    damageMult += effectPower(b, "first_strike") / 100;
    if (hasPassive(b, "arch_assassin_5")) damageMult += 0.0;
  }
  const debuffs = enemyDebuffCount(b);
  damageMult += (effectPower(b, "debuff_damage") / 100) * Math.min(4, debuffs);
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
  const elixirVamp = kind === "phys" ? b.p.statuses.buffs?.vamp : b.p.statuses.buffs?.magic_vamp;
  if (elixirVamp && (kind === "magic" || source === "weapon" || source === "skill")) ratio += elixirVamp.value;
  if (source === "weapon" || source === "skill" || source === "any") ratio += effectPower(b, "vamp_str") / 100;
  if (source === "weapon" || source === "skill") {
    if (b.p.statuses.bloodRage > 0) ratio += 0.15;
    if (hasPassive(b, "arch_barbarian_5")) ratio += 0.08;
    if (hasGearPassive(b, "barbarian_rage")) ratio += passivePower(b, "barbarian_rage", "vamp") / 100;
  }
  if (source === "skill") {
    ratio += effectPower(b, "skill_vamp") / 100;
    if (hasPassive(b, "arch_warlock_5")) ratio += 0.10;
  }
  if (source === "consumable") {
    ratio += effectPower(b, "consumable_vamp") / 100;
  }
  if (source === "scroll") {
    ratio += effectPower(b, "scroll_vamp") / 100;
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
export function enemyArmorNow(e: {
  armor: number;
  revived?: boolean;
  guard?: boolean;
  statuses?: { breakFlat?: number; breakPct?: number; breakRounds?: number; shatterRounds?: number; burn?: number; emberShred?: number; breakExtra?: number };
}): number {
  let base = e.revived ? Math.round(e.armor * (1 - REVIVE_DEBUFF)) : e.armor;
  const brk = e.statuses;
  if (brk && (brk.breakRounds ?? 0) > 0) {
    base = Math.round(Math.max(0, base - (brk.breakFlat ?? 0)) * (1 - (brk.breakPct ?? 0)));
  }
  /* Фантом (Встречный клинок): раскол снимает ещё броню до конца раунда. Тлеющие угли (Пожар A): горящий враг −2 брони. */
  if (brk) {
    base = Math.max(0, base - (brk.breakExtra ?? 0) - ((brk.burn ?? 0) > 0 ? (brk.emberShred ?? 0) : 0));
  }
  /* Разрушение: укрепление брони врага ×0,5. */
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
    /* Сквозь броню: приёмы Тень, Обратный хват, Змеиный выпад (следующий), Фехтование. */
    const ignoreNow = (b.p.statuses.ignoreArmorNow ?? 0) > 0 || (b.p.statuses.fencingTurns ?? 0) > 0 ||
      (b.p.statuses.gripTurn ?? 0) > 0 || (b.p.statuses.nextPierce ?? 0) > 0;
    const effArmor = Math.round(Math.max(0, enemyArmorNow(b.enemy) - pierce) * (1 - (ignoreNow ? 1 : (b.armorIgnore ?? 0))));
    if ((b.p.statuses.nextPierce ?? 0) > 0) b.p.statuses.nextPierce = 0;
    d -= effArmor;
    /* Каменная шкура и укрепление рода — врождённые свойства породы,
       а не эффекты: истощение их не снимает. */
    if (b.enemy.passive?.id === "stone_hide") d = Math.round(d * 0.75);
    const fortify = raceFortify(b.enemy.def.race) * ((b.enemy.statuses.shatterRounds ?? 0) > 0 ? 0.5 : 1);
    if (fortify > 0) d = Math.round(d * (1 - fortify));
    if (!effectsDepleted(b)) d = Math.round(d * (1 - eChance(b, "fortify") * ((b.enemy.statuses.shatterRounds ?? 0) > 0 ? 0.5 : 1)));
  } else {
    d = Math.round(d * (1 - enemyMagicResist(b, true)));
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

/** Множитель магического урона героя от свойства «Магическое усиление» (проценты предметов). */
export function magicPowerMult(effectPower: Partial<Record<GearEffectId, number>>): number {
  return 1 + (effectPower.magic_power ?? 0) / 100;
}
/**
 * Магический множитель героя: все магические добавки складываются в один:
 * магическое усиление предметов, Пылающий канон (+10%), Вечная стужа (+25%), Запретный канон (+12%).
 */
function magicMultNow(b: BattleState): number {
  return magicPowerMult(b.p.effectPower) + (hasPassive(b, "arch_archmage_5") ? 0.10 : 0) +
    (hasPassive(b, "arch_archmage_10") ? 0.25 : 0) + (hasGearPassive(b, "archmage_library") ? passivePower(b, "archmage_library", "magic") / 100 : 0);
}

function hitEnemy(
  b: BattleState,
  raw: number,
  kind: "phys" | "magic",
  note = "",
  strike = kind === "phys",
  element?: DamageElement,
  accuracy?: number,
): number {
  /* Любая попытка удара героя отмечает раунд: без ударов комбо Дуэлянта сгорает в конце раунда. */
  b.p.statuses.comboRound = b.round;
  /* Магическое усиление: любой магический удар героя, включая свитки и расходники. */
  if (kind === "magic") raw = Math.round(raw * magicMultNow(b));
  /* Комбо Дуэлянта: +5% за стак; при полном комбо и рубеже 10 удар ×1,5, стаки тратятся. */
  if (isDuelist(b) && comboStacks(b) > 0) {
    raw = Math.round(raw * (1 + DUELIST_COMBO_STEP * comboStacks(b)));
    if (hasPassive(b, "arch_duelist_10") && comboStacks(b) >= DUELIST_COMBO_MAX) {
      raw = Math.round(raw * DUELIST_COMBO_BURST);
      b.p.statuses.comboStacks = 0;
      push(b, "Расколотый строй: удар ×1,5, стаки комбо потрачены.", "p");
    }
  }
  /* Ветка «Серия» B «Ритм»: при 3+ стаках каждый удар с шансом 25% даёт +1 стак. */
  if (isDuelist(b) && hasPassive(b, "skill_combo_b") && comboStacks(b) >= 3 && strike && Math.random() < 0.25) {
    addCombo(b);
  }
  /* Побои: враг получает больше урона от героя, пока эффект действует. */
  if ((b.enemy.statuses.beatRounds ?? 0) > 0) raw = Math.round(raw * (1 + (b.enemy.statuses.beatMult ?? 0)));
  /* Острота на клинке: урон атак героя растёт, пока смазка держится. */
  if (kind === "phys" && b.p.statuses.oilType === "edge" && b.p.statuses.oilRounds > 0) {
    raw = Math.round(raw * (1 + (b.p.statuses.oilPower ?? 0) / 100));
  }
  /* Обратный хват: в этом ходу весь урон героя ÷2. */
  if ((b.p.statuses.halfDmg ?? 0) > 0) raw = Math.round(raw / 2);
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
  /* Физический удар героя промахивается по меткости: мрак и тьма уже снижают её (см. heroAccuracy). */
  const accurateStrike = strike && kind === "phys";
  const darkMiss = accurateStrike || (b.torchTurns ?? 0) > 0 ? 0 : biomeMissChance(b.biome);
  if (strike && darkMiss > 0 && !b.skillNoMiss && Math.random() < darkMiss) {
    flash(b, "e", "miss", 0);
    push(b, `Мрак скрывает цель: удар проходит мимо.${note}`, "sys");
    return 0;
  }
  /* «Мрак» вампира: до конца раунда половина ударов героя уходит в пустоту. */
  if (!accurateStrike && strike && b.p.statuses.darkness > 0 && Math.random() < 0.5) {
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
  if (accurateStrike) {
    if (!b.skillNoMiss) {
      const acc = accuracy ?? heroAccuracy(b, mainHandClass(b), "normal");
      if (!b.p.statuses.buffs?.sure_hit && !rollHeroHit(acc, heroEvasion(b))) {
        flash(b, "e", "miss", 0);
        push(b, `Удар мимо: ${b.enemy.def.name} уклоняется.${note}`, "e");
        return 0;
      }
    }
  } else {
    const effectEvade = effectsDepleted(b) ? 0 : eChance(b, "evade");
    const evade = kind === "phys" && !b.skillNoMiss ? effectEvade + enemyEvade(b) : 0;
    if (evade > 0 && Math.random() < evade) {
      flash(b, "e", "miss", 0);
      push(b, `${b.enemy.def.name} уклоняется от удара.${note}`, "e");
      return 0;
    }
  }
  const d = damageAfterEnemyDefense(b, raw, kind);
  b.enemy.hp -= d;
  flash(b, "e", "hit", d);
  push(b, `${b.enemy.def.name} получает ${d} урона.${note}`, "p", element);
  /* Урон героя за его ход (для Эхо) и оглушение Обратного хвата (шанс 25%). */
  if (b.queue[b.idx] === "p") b.p.statuses.turnDealt = (b.p.statuses.turnDealt ?? 0) + d;
  if ((b.p.statuses.gripTurn ?? 0) > 0 && strike && kind === "phys" && d > 0 && b.enemy.hp > 0 && !bossResists(b) && Math.random() < 0.25) {
    b.enemy.statuses.stunAp = Math.min(4, b.enemy.statuses.stunAp + 1);
    push(b, `Обратный хват: ${b.enemy.def.name} оглушён!`, "p");
  }
  /* Ветки навыков: Жажда крови — 10% урона возвращается; Трофей — убийство лечит 20% макс. ОЗ. */
  if (d > 0 && b.p.hp > 0 && hasPassive(b, "skill_thirst_a")) {
    const heal = healPlayer(b, Math.max(1, Math.round(d * 0.1)));
    if (heal > 0) push(b, `Кровопийца: +${heal} здоровья.`, "p");
  }
  if (b.enemy.hp <= 0 && hasPassive(b, "skill_thirst_b")) {
    const heal = healPlayer(b, Math.round(b.p.maxHp * 0.2));
    if (heal > 0) push(b, `Трофей: +${heal} здоровья за убийство.`, "p");
  }
  /* Шипы врага ранят только того, кто бьёт вплотную: обычная атака, второй
     удар, контратака и физические приёмы. Магический урон их не будит. */
  const thorns = !effectsDepleted(b) && kind === "phys" ? eEffect(b, "thorns") : 0;
  if (thorns > 0 && b.p.hp > 0) {
    const thornsRest = absorbBarrier(b, thorns);
    b.p.hp -= thornsRest;
    push(b, `Шипы противника ранят тебя: −${thornsRest} ОЗ.`, "e");
  }
  /* Шлаковая шкура: 10% физического урона по стражу возвращается герою. */
  if (b.enemy.def.id === "golem" && kind === "phys" && d > 0 && b.p.hp > 0) {
    const back = Math.round(d * GOLEM_REFLECT_SHARE);
    const backRest = absorbBarrier(b, back);
    if (backRest > 0) {
      b.p.hp -= backRest;
      push(b, `Шлаковая шкура возвращает тебе ${backRest} урона.`, "e");
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

/** Множитель брони врага в защите (глухая стойка монстра). */
export const GUARD_ARMOR_MULT = 1.25;
/** В защите (кнопка «Защита») броня героя растёт на 10 до его следующего хода. Урон не делится. */
export const GUARD_ARMOR_FLAT = 10;

/** Броня героя в бою сейчас: надетая, временная, тоник и раскол; в защите — +10. */
export function playerArmorNow(b: BattleState): number {
  const base = Math.max(0, b.p.armor + b.p.statuses.tempArmor + (b.p.statuses.ironTonic > 0 ? 4 : 0) - b.p.statuses.sundered - (b.p.statuses.rot ?? 0) - (skillRageOn(b) ? 5 : 0));
  const withPrep = base + ((b.p.statuses.prepRounds ?? 0) > 0 ? 25 : 0);
  const walled = (b.p.statuses.wallRounds ?? 0) > 0 ? Math.round(withPrep * 1.25) : withPrep;
  return b.p.guard ? walled + GUARD_ARMOR_FLAT : walled;
}

/** false означает, что враг промахнулся: побочные эффекты атаки тоже не срабатывают. */
/** Строка подсчёта урона: значение после шага. note — множитель или поправка, видны в подсказке. */
export interface DamageLine {
  label: string;
  value: number;
  note?: string;
}

/** Проценты для подсказок: 0.25 → «25%». */
export function pctText(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/**
 * Защиты героя по шагам: броня, укрепление, сопротивления, стойка.
 * Последняя строка — урон после всех защит. Без бросков и побочных эффектов.
 */
function playerDefenseLines(
  b: BattleState,
  raw: number,
  kind: "phys" | "magic",
  strike: boolean,
  ignoreDefense: boolean,
): DamageLine[] {
  const lines: DamageLine[] = [];
  let d = raw;
  if (strike) {
    const mult = biomeStrikeMult(b.biome);
    d = Math.round(d * mult);
    if (mult !== 1) lines.push({ label: "Ледяной биом", value: d, note: `×${mult}` });
  }
  const effArmor = playerArmorNow(b);
  if (kind === "phys") {
    if (!ignoreDefense) {
      const cut = b.piercing ? piercingArmorCap(d, effArmor) : effArmor;
      d -= cut;
      if (cut !== 0) {
        lines.push({
          label: b.piercing ? "Броня (пробита: не больше половины удара)" : "Броня героя",
          value: d,
          note: `−${cut}`,
        });
      }
      const fortify = heroChance(b, b.p.chanceLayers.fortify);
      d = Math.round(d * (1 - fortify));
      if (fortify > 0) lines.push({ label: "Укрепление героя", value: d, note: `−${pctText(fortify)}` });
    }
  } else if (!ignoreDefense) {
    const magic = heroChance(b, b.p.chanceLayers.magicResist);
    d = Math.round(d * (1 - magic));
    if (magic > 0) lines.push({ label: "Сопротивление магии", value: d, note: `−${pctText(magic)}` });
  }
  if (!ignoreDefense) {
    const flat = effectPower(b, "damage_resist");
    d -= flat;
    if (flat > 0) lines.push({ label: "Сопротивление урону", value: d, note: `−${flat}` });
  }
  if (b.p.statuses.stone > 0) {
    const stoneMult = 1 - (b.p.statuses.stonePct ?? 0.3);
    d = Math.round(d * stoneMult);
    lines.push({ label: "Каменная кожа", value: d, note: `×${stoneMult.toFixed(1)}` });
  }
  let guardMult = 1;
  if (b.p.guard) {
    guardMult -= effectPower(b, "guard_bonus") / 100;
    if (hasPassive(b, "arch_bulwark_5")) guardMult -= 0.15;
    if (hasPassive(b, "skill_fortitude_a") && b.p.hp < b.p.maxHp * 0.3) guardMult -= 0.2;
    if (hasGearPassive(b, "bulwark_wall")) guardMult -= passivePower(b, "bulwark_wall", "guard") / 100;
  }
  const guardFactor = Math.max(0.2, guardMult);
  d = Math.round(d * guardFactor);
  if (b.p.guard && guardFactor !== 1) lines.push({ label: "Защита героя", value: d, note: `×${guardFactor.toFixed(2)}` });
  if (hasGearPassive(b, "fortress")) {
    const resist = passivePower(b, "fortress", "resist");
    d = Math.round(d * (1 - resist / 100));
    lines.push({ label: "Крепость", value: d, note: `−${resist}%` });
  }
  d = Math.max(1, d);
  lines.push({ label: "Итог после защит", value: d });
  return lines;
}

/** Урон по герою после всех защит: броня, укрепление, сопротивления, стойка. Без бросков и побочных эффектов. */
function damageAfterPlayerDefense(
  b: BattleState,
  raw: number,
  kind: "phys" | "magic",
  strike: boolean,
  ignoreDefense: boolean,
): number {
  const lines = playerDefenseLines(b, raw, kind, strike, ignoreDefense);
  return lines[lines.length - 1].value;
}

/** Шанс попасть и причины промаха: мрак, ослепление светом, уклонение. blocked — блокировка, которая срабатывает всегда. */
export interface HitParts {
  chance: number;
  blocked: string | null;
  misses: { label: string; chance: number }[];
}

function playerHitParts(b: BattleState, kind: "phys" | "magic", strike: boolean, ignoreDefense: boolean): HitParts {
  if (b.p.statuses.fullGuard > 0 || b.p.statuses.invulnerable > 0 || b.p.statuses.dodgeNext > 0 || b.p.statuses.smoke > 0) {
    return { chance: 0, blocked: "защита героя поглощает удар", misses: [] };
  }
  if (!ignoreDefense && kind === "phys" && b.p.statuses.evadeTurn > 0) {
    return { chance: 0, blocked: "герой уклоняется в этом ходу", misses: [] };
  }
  let chance = 1;
  const misses: { label: string; chance: number }[] = [];
  const darkMiss = (b.torchTurns ?? 0) > 0 ? 0 : biomeMissChance(b.biome);
  if (!ignoreDefense && strike && darkMiss > 0) {
    chance *= 1 - darkMiss;
    misses.push({ label: "мрак", chance: darkMiss });
  }
  if (!ignoreDefense && kind === "phys") {
    const evade = combatChance(b.p.chanceLayers.evade);
    if (evade > 0) {
      chance *= 1 - evade;
      misses.push({ label: "уклонение героя", chance: evade });
    }
  }
  return { chance, blocked: null, misses };
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
  /* Раунд последней атаки врага по герою: нужен приёму «Встречный выпад». */
  b.p.statuses.incomingRound = b.round;
  /* Побои: урон по герою +20%, пока эффект держится. */
  raw = beatenDamage(raw, b.p.statuses.beat);
  const darkMiss = (b.torchTurns ?? 0) > 0 ? 0 : biomeMissChance(b.biome);
  if (!ignoreDefense && strike && darkMiss > 0 && Math.random() < darkMiss) {
    flash(b, "p", "miss", 0);
    push(b, `Мрак скрывает тебя: ${src} — промах.`, "sys");
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
    b.p.statuses.dodgedRound = b.round;
    /* Тень (ранг 5): раз за раунд, уклонившись, отвечаешь ударом из укрытия. */
    if (hasPassive(b, "skill_shadow_b") && (b.p.statuses.shadowCounterRound ?? 0) !== b.round && b.enemy.hp > 0) {
      b.p.statuses.shadowCounterRound = b.round;
      const { d: sd } = calcWeaponRoll(b, 0.6);
      const sdealt = hitEnemy(b, sd, "phys", " [Контрудар из тени]");
      applyVamp(b, sdealt, 0, "weapon");
    }
    return false;
  }
  let d = damageAfterPlayerDefense(b, raw, kind, strike, ignoreDefense);
  /* Маг. барьер первым принимает удар, до стены щитов. */
  d = absorbBarrier(b, d);
  /* Ветки навыков: Стена щитов — в защите щит 15% макс. ОЗ до конца раунда. */
  if (b.p.guard && hasPassive(b, "skill_wall_a")) {
    if ((b.p.statuses.wallShieldRound ?? 0) !== b.round) {
      b.p.statuses.wallShieldRound = b.round;
      b.p.statuses.wallShield = Math.round(b.p.maxHp * 0.15);
    }
    const absorbed = Math.min(b.p.statuses.wallShield ?? 0, d);
    if (absorbed > 0) {
      b.p.statuses.wallShield = (b.p.statuses.wallShield ?? 0) - absorbed;
      d -= absorbed;
      push(b, `Щит поглощает ${absorbed} урона.`, "p");
    }
  }
  b.p.hp -= d;
  flash(b, "p", "hit", d);
  push(b, `${src} — тебе ${d} урона.`, "e");
  /* Стена щитов (ранг 5): пока стоишь в защите, каждый удар врага получает ответ — броня ÷ 10. */
  if (b.p.guard && hasPassive(b, "skill_wall_b") && b.enemy.hp > 0 && b.p.hp > 0) {
    const reply = Math.floor(playerArmorNow(b) / 10);
    if (reply > 0) hitEnemy(b, reply, "phys", " [Ответный удар]");
  }
  /* Непреклонность (ранг 5): один раз за бой, упав ниже 10% ОЗ — лечение 25% и оглушение врага. */
  if (b.p.hp > 0 && b.p.hp < b.p.maxHp * 0.1 && hasPassive(b, "skill_fortitude_b") && !b.p.statuses.lastStandUsed) {
    b.p.statuses.lastStandUsed = 1;
    const heal = healPlayer(b, Math.round(b.p.maxHp * 0.25));
    flash(b, "p", "heal", heal);
    if (b.enemy.hp > 0) b.enemy.statuses.stunAp = Math.min(4, b.enemy.statuses.stunAp + 1);
    push(b, `Последний рубеж: +${heal} здоровья, ${b.enemy.def.name} оглушён на ход.`, "p");
  }
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
  const counterChance = Math.min(1, effectPower(b, "counter") / 100 + passivePower(b, "dance", "counter") / 100 + passivePower(b, "duelist_phantom", "counter") / 100 +
    (hasPassive(b, "arch_assassin_10") ? 0.10 : 0) + (isDuelist(b) && hasPassive(b, "arch_duelist_5") ? 0.10 : 0));
  if (b.p.hp > 0 && b.enemy.hp > 0 && counterChance > 0 && Math.random() < counterChance) {
    const { d: cd } = calcWeaponRoll(b, 0.6);
    const dealt = duelistCounterHit(b, cd, " [Контратака]");
    comboOnCounter(b, dealt);
    applyVamp(b, dealt, 0, "weapon");
  }
  /* Выпад и Копьё вперёд: ответ на первые физические удары врага. */
  if (kind === "phys" && (b.p.statuses.counterNext ?? 0) > 0 && (b.p.statuses.counterTurns ?? 0) > 0 && b.p.hp > 0 && b.enemy.hp > 0) {
    b.p.statuses.counterNext = (b.p.statuses.counterNext ?? 0) - 1;
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

  heroDeathCheck(b);
  return true;
}

/**
 * Смерть героя: ОЗ ≤ 0 — бой проигран сразу, после любого урона: удара монстра, шипов, ожога или
 * ответа. Два пассивных спасения (Непробиваемый и Печать бессмертия) действуют один раз за бой.
 */
function heroDeathCheck(b: BattleState) {
  if (b.p.hp > 0) return;
  if (hasPassive(b, "arch_bulwark_10") && !b.p.immortalUsed) {
    b.p.immortalUsed = true;
    b.p.hp = 0;
    const heal = healPlayer(b, 1);
    b.p.guard = true;
    flash(b, "p", "heal", heal);
    push(b, `Непробиваемый: смертельный удар оставил ${heal} ОЗ и включил Защиту!`, "p");
    return;
  }
  if (hasLeg(b, "immortal_pact") && !b.p.immortalUsed) {
    b.p.immortalUsed = true;
    b.p.hp = 0;
    const heal = healPlayer(b, 18);
    b.p.guard = true;
    flash(b, "p", "heal", heal);
    push(b, `Печать бессмертия вспыхивает! Ты остаёшься на ногах с ${heal} ОЗ и в Защите.`, "p");
    return;
  }
  b.p.hp = 0;
  b.over = "lose";
}

/** Опыт за монстра с поправкой на разницу уровней: сильнее враг — больше опыта. */
function enemyXpFor(b: BattleState): number {
  return scaledEnemyXp(b.enemy.xp, b.p.level, b.enemy.level);
}

function gainLoot(b: BattleState) {
  const e = b.enemy;
  if (b.isBoss) {
    // Боссы сохраняют прежний щедрый дроп: золото, припасы и гарантированный трофей.
    const gold = monsterGold(randInt(e.gold[0], e.gold[1]));
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
export const FEAR_IMMUNE_ROUNDS = 3;

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
  /* Защита героя держится до начала его следующего хода; внутри хода её не сбрасывают другие действия. */
  if (side === "p") {
    b.p.guard = false;
    b.p.guardStrikeUsed = false;
  }

  /* Страх: атаки и приёмы закрыты; защиту, рюкзак, побег или конец хода герой выбирает сам. */
  if (side === "p" && b.p.statuses.fear > 0) {
    push(b, "Страх сковывает волю: атаки и приёмы закрыты. Доступны рюкзак, защита, побег или конец хода.", "e");
  }

  /* Регенерация снаряжения: срабатывает в начале каждого хода героя, полным значением. */
  if (side === "p" && (b.p.regenTurn ?? 0) > 0 && b.p.hp > 0 && b.p.hp < b.p.maxHp) {
    const heal = healPlayer(b, b.p.regenTurn ?? 0);
    if (heal > 0) push(b, `Регенерация снаряжения: +${heal} здоровья.`, "p");
  }
  /* Выносливость: каждый ход героя восстанавливает STAMINA_TURN_RECOVERY, не больше максимума. */
  if (side === "p" && b.p.hp > 0 && b.p.stamina < b.p.staminaMax) {
    const gain = Math.min(STAMINA_TURN_RECOVERY, b.p.staminaMax - b.p.stamina);
    b.p.stamina += gain;
    push(b, `Передышка: +${gain} выносливости.`, "p");
  }
  /* Целебный дождь: в начале каждого хода героя лечит 5 + 2×ИНТ, пока держится. */
  if (side === "p" && (b.p.statuses.rainRounds ?? 0) > 0 && b.p.hp > 0) {
    const rainHeal = healPlayer(b, 5 + 2 * Math.min(TECHNIQUE_STAT_CAP, b.p.stats.int));
    if (rainHeal > 0) push(b, `Целебный дождь: +${rainHeal} здоровья.`, "p");
  }
  /* Жизнь пакта (Колдун, ветка «Обет» B): ниже 30% ОЗ — лечение 2% макс. ОЗ в начале хода героя. */
  if (side === "p" && hasPassive(b, "skill_vow_b") && b.p.hp > 0 && b.p.hp < b.p.maxHp * 0.3) {
    const heal = healPlayer(b, Math.round(b.p.maxHp * 0.02));
    if (heal > 0) push(b, `Жизнь пакта: +${heal} здоровья.`, "p");
  }
  /* Непреклонность (ранг 3): ниже 30% ОЗ — лечение 5% макс. ОЗ в начале хода героя. */
  if (side === "p" && hasPassive(b, "skill_fortitude_a") && b.p.hp > 0 && b.p.hp < b.p.maxHp * 0.3) {
    const heal = healPlayer(b, Math.round(b.p.maxHp * 0.05));
    if (heal > 0) push(b, `Упорство: +${heal} здоровья.`, "p");
  }
  if (b.biome === "ice" && side === "p") {
    b.p.hp = Math.max(0, b.p.hp - absorbBarrier(b, ICE_TURN_DAMAGE));
    flash(b, "p", "hit", ICE_TURN_DAMAGE);
    push(b, `Ледяные просторы: холод отнимает ${ICE_TURN_DAMAGE} здоровья в начале твоего хода.`, "sys");
  }

  /* Огненные недра жгут только в бою и только когда ходит герой:
     в свой ход монстр не получает урона от жара, а на карте горения нет вовсе. */
  if (b.biome === "fire" && side === "p") {
    b.p.statuses.burning += 1;
    const dmg = fireBurnDamage(b.p.statuses.burning);
    b.p.hp = Math.max(0, b.p.hp - absorbBarrier(b, dmg));
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

/** Пузырь заканчивается: поглощённый урон возвращается врагу магическим уроном. */
function endBubble(b: BattleState) {
  const absorbed = b.p.statuses.bubbleAbsorbed ?? 0;
  b.p.statuses.bubbleAbsorbed = 0;
  b.p.barrier = 0;
  push(b, "Пузырь лопается: барьер пропал.", "p");
  if (absorbed > 0 && b.enemy.hp > 0) hitEnemy(b, absorbed, "magic", " [Пузырь]", false);
}

/** Враг пал от приёма вне основного пути боя (эхо, пузырь, обманка). */
function finishIfEnemyDead(b: BattleState): boolean {
  if (b.over || b.enemy.hp > 0) return false;
  if (tryRevive(b)) return false;
  b.enemy.hp = 0;
  b.over = "win";
  gainLoot(b);
  push(b, `${b.enemy.def.name} повержен! (+${enemyXpFor(b)} опыта)`, "sys");
  return true;
}

/** Приёмы: что кончается вместе с ходом героя и ходом врага. */
function endTurnTechniques(b: BattleState) {
  if (b.queue[b.idx] === "p") {
    const st = b.p.statuses;
    if ((st.fencingTurns ?? 0) > 0) st.fencingTurns = (st.fencingTurns ?? 0) - 1;
    st.halfDmg = 0;
    st.gripTurn = 0;
    st.turnActs = 0;
    st.turnDealt = 0;
    if ((st.bubbleTurns ?? 0) > 0) {
      st.bubbleTurns = (st.bubbleTurns ?? 0) - 1;
      if (st.bubbleTurns === 0) endBubble(b);
    }
    if ((st.throwPending ?? 0) > 0) {
      st.throwPending = 0;
      b.enemy.statuses.throwDown = 1;
      push(b, `${b.enemy.def.name} не уходит в защиту до конца своего хода: его удары вдвое слабее.`, "p");
    }
  } else if (b.queue[b.idx] === "e") {
    const es = b.enemy.statuses;
    es.throwDown = 0;
    es.feint = 0;
    if ((es.echoDue ?? 0) > 0) {
      const amount = es.echoDue ?? 0;
      es.echoDue = 0;
      if (b.enemy.hp > 0) hitEnemy(b, amount, "phys", " [Эхо]", false);
      finishIfEnemyDead(b);
    }
  }
}

function advance(b: BattleState) {
  if (b.over) return;
  endTurnTechniques(b);
  if (b.over) return;
  /* Счётчики хода героя начинаются заново, когда очередь уходит дальше. */
  b.p.turnConsumables = 0;
  b.p.turnScrolls = 0;
  b.p.turnPouch = 0;
  //.Печати живут ровно один ход игрока: снимаются после его действия.
  if (b.queue[b.idx] === "p") {
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
      const d = absorbBarrier(b, b.p.statuses.burnTick);
      b.p.hp -= d;
      push(b, `Горение отнимает ${d} здоровья.`, "e");
    }
    if (!warded && b.p.statuses.chill > 0 && b.p.hp > 0) {
      const d = absorbBarrier(b, magicTickFrom(b.p.statuses.chillTick, heroChance(b, b.p.chanceLayers.magicResist)));
      b.p.hp -= d;
      push(b, `Обморожение отнимает ${d} здоровья и режет лечение вдвое.`, "e");
    }
    if (!warded && b.p.statuses.curse > 0 && b.p.hp > 0) {
      const d = absorbBarrier(b, magicTickFrom(b.p.statuses.curseTick, heroChance(b, b.p.chanceLayers.magicResist)));
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
      const d = magicTickFrom(b.enemy.statuses.chillTick, enemyMagicResist(b));
      b.enemy.hp -= d;
      push(b, `Обморожение отнимает ${d} ОЗ у ${b.enemy.def.name}.`, "p");
    }
    if (b.enemy.statuses.curse > 0 && b.enemy.hp > 0) {
      const d = magicTickFrom(b.enemy.statuses.curseTick, enemyMagicResist(b));
      b.enemy.hp -= d;
      push(b, `Проклятие выжигает ${d} ОЗ у ${b.enemy.def.name}.`, "p");
    }
    if (b.enemy.statuses.blight > 0 && b.enemy.hp > 0 && b.enemy.statuses.blightTick > 0) {
      const d = b.enemy.statuses.blightTick;
      b.enemy.hp -= d;
      push(b, `Порча разъедает ${b.enemy.def.name}: −${d} ОЗ.`, "p");
    }
    if (b.enemy.statuses.oilType && b.enemy.statuses.oilRounds > 0 && b.enemy.hp > 0 && b.enemy.statuses.oilType !== "drain") {
      const kind = b.enemy.statuses.oilType;
      const element = kind === "fire" || kind === "ice" ? kind : undefined;
      const mult = element ? enemyElementMult(b, element) : 1;
      const raw = oilTickDamage(kind, b.enemy.statuses.oilTick, enemyMagicResist(b));
      if (raw > 0 && mult > 0) {
        const d = Math.max(1, Math.round(raw * mult));
        b.enemy.hp -= d;
        const weak = mult > 1 ? ` Уязвимость ×${mult}.` : "";
        push(b, `${OIL_NAMES[kind]} масла отнимает ${d} ОЗ у ${b.enemy.def.name}.${weak}`, "p", element);
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
    b.p.statuses.sealItems = Math.max(0, b.p.statuses.sealItems - 1);
    b.p.statuses.beat = Math.max(0, b.p.statuses.beat - 1);
    b.p.statuses.weaken = Math.max(0, b.p.statuses.weaken - 1);
    b.p.statuses.shatter = Math.max(0, b.p.statuses.shatter - 1);
    drainRoundTick(b);
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
    for (const k of IMMUNITY_EFFECTS) {
      const rf = b.p.statuses.resistFx?.[k];
      if (!rf) continue;
      if (rf.rounds <= 1) delete b.p.statuses.resistFx![k];
      else b.p.statuses.resistFx![k] = { ...rf, rounds: rf.rounds - 1 };
    }
    for (const k of Object.keys(b.p.statuses.buffs ?? {}) as ("vamp" | "magic_vamp" | "sure_hit")[]) {
      const bf = b.p.statuses.buffs![k];
      if (!bf) continue;
      if (bf.rounds <= 1) delete b.p.statuses.buffs![k];
      else b.p.statuses.buffs![k] = { ...bf, rounds: bf.rounds - 1 };
    }

    if (prevCurse > 0 && b.p.statuses.curse === 0)
      push(b, "Проклятие рассеялось! Твой урон вернулся к норме.", "sys");
    if (b.p.statuses.rage === 0) b.p.statuses.rageStep = undefined;
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
        const name = b.enemy.statuses.oilType ? OIL_NAMES[b.enemy.statuses.oilType] : "";
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
    b.enemy.statuses.breakExtra = 0;
    if ((b.enemy.statuses.breakRounds ?? 0) > 0) {
      b.enemy.statuses.breakRounds = (b.enemy.statuses.breakRounds ?? 0) - 1;
      if (b.enemy.statuses.breakRounds === 0) {
        b.enemy.statuses.breakFlat = 0;
        b.enemy.statuses.breakPct = 0;
        push(b, `Раскол брони ${b.enemy.def.name} спадает.`, "e");
      }
    }
    if ((b.enemy.statuses.beatRounds ?? 0) > 0) {
      b.enemy.statuses.beatRounds = (b.enemy.statuses.beatRounds ?? 0) - 1;
      if (b.enemy.statuses.beatRounds === 0) b.enemy.statuses.beatMult = 0;
    }
    if (b.enemy.depleted > 0) {
      b.enemy.depleted -= 1;
      if (b.enemy.depleted === 0) push(b, `Истощение спадает: ${b.enemy.def.name} снова чувствует свои эффекты.`, "e");
    }

    /* Приёмы: таймеры раунда героя. */
    if ((b.p.statuses.wallRounds ?? 0) > 0) {
      b.p.statuses.wallRounds = (b.p.statuses.wallRounds ?? 0) - 1;
      if (b.p.statuses.wallRounds === 0) push(b, "Стена: броня и стойкость вернулись к обычным.", "sys");
    }
    if ((b.p.statuses.prepRounds ?? 0) > 0) b.p.statuses.prepRounds = (b.p.statuses.prepRounds ?? 0) - 1;
    if ((b.p.statuses.rainRounds ?? 0) > 0) b.p.statuses.rainRounds = (b.p.statuses.rainRounds ?? 0) - 1;
    if ((b.p.statuses.counterTurns ?? 0) > 0) {
      b.p.statuses.counterTurns = (b.p.statuses.counterTurns ?? 0) - 1;
      if (b.p.statuses.counterTurns === 0) b.p.statuses.counterNext = 0;
    }
    if ((b.p.statuses.noEvade ?? 0) > 0) b.p.statuses.noEvade = (b.p.statuses.noEvade ?? 0) - 1;
    /* Приёмы: таймеры раунда врага. */
    if ((b.enemy.statuses.noEvade ?? 0) > 0) b.enemy.statuses.noEvade = (b.enemy.statuses.noEvade ?? 0) - 1;
    if ((b.enemy.statuses.shatterRounds ?? 0) > 0) b.enemy.statuses.shatterRounds = (b.enemy.statuses.shatterRounds ?? 0) - 1;
    if ((b.enemy.statuses.noGuard ?? 0) > 0) b.enemy.statuses.noGuard = (b.enemy.statuses.noGuard ?? 0) - 1;
    /* Выброс: горение, обморожение, проклятие и увядание держатся 3 раунда; тики — в конце раунда. */
    if ((b.enemy.statuses.eruptRounds ?? 0) > 0) {
      const tick = b.enemy.statuses.eruptTick ?? 0;
      if (tick > 0 && b.enemy.hp > 0) {
        b.enemy.hp -= tick;
        push(b, `Выброс жжёт ${b.enemy.def.name}: −${tick} ОЗ.`, "p");
      }
      b.enemy.statuses.eruptRounds = (b.enemy.statuses.eruptRounds ?? 0) - 1;
      if (b.enemy.statuses.eruptRounds === 0) {
        b.enemy.statuses.eruptTick = 0;
        b.enemy.statuses.eruptDown = 0;
        b.enemy.statuses.eruptWither = 0;
        push(b, `Выброс иссяк: ${b.enemy.def.name} снова в силе.`, "p");
      }
    }
    /* Вытягивание жизни: кража ОЗ у врага в конце раунда; герой получает столько же. */
    if ((b.enemy.statuses.drainRounds ?? 0) > 0) {
      const stolen = b.enemy.statuses.drainTick ?? 0;
      if (stolen > 0 && b.enemy.hp > 0) {
        const taken = Math.min(stolen, b.enemy.hp);
        b.enemy.hp -= taken;
        const got = b.p.hp > 0 ? healPlayer(b, taken) : 0;
        push(b, `Иссушение: ${b.enemy.def.name} −${taken} ОЗ, ты +${got} здоровья.`, "p");
      }
      b.enemy.statuses.drainRounds = (b.enemy.statuses.drainRounds ?? 0) - 1;
      if (b.enemy.statuses.drainRounds === 0) b.enemy.statuses.drainTick = 0;
    }
    if (b.p.weaponCd > 0) {
      b.p.weaponCd -= 1;
      /* Тень за спиной: заряды возвращаются, когда кончается перезарядка. */
      if (b.p.weaponCd === 0 && b.p.weaponSkill?.effect === "shadow_behind") b.p.statuses.shadowCharges = 2;
    }
    for (const k of Object.keys(b.p.epicCds)) {
      if (b.p.epicCds[k] > 0) b.p.epicCds[k] -= 1;
    }
    for (const k of Object.keys(b.p.armorCds)) {
      if (b.p.armorCds[k] > 0) b.p.armorCds[k] -= 1;
    }

    /* Комбо Дуэлянта сгорает, если герой в этом раунде не ударил. Ветка «Серия» A — после 2 раундов без удара. */
    const comboIdle = b.round - (b.p.statuses.comboRound ?? 0);
    const comboGrace = hasPassive(b, "skill_combo_a") ? 2 : 1;
    if (isDuelist(b) && comboStacks(b) > 0 && comboIdle >= comboGrace) {
      b.p.statuses.comboStacks = 0;
      push(b, "Комбо сгорело: в раунде не было ни одного удара.", "p");
    }

    b.round += 1;
    b.idx = 0;
    /* Выносливость восстанавливается в начале раунда наполовину от максимума, не выше максимума. */
    b.p.stamina = Math.min(b.p.staminaMax, b.p.stamina + Math.floor(b.p.staminaMax * STAMINA_ROUND_RECOVERY));
    const hasteBonus = b.p.statuses.haste > 0 ? 1 : 0;
    const shadowAp = b.p.statuses.shadowStep;
    /* Дополнительных ходов не бывает больше трёх за раунд. */
    const extraAp = Math.min(MAX_EXTRA_AP, hasteBonus + shadowAp);
    const pAp = Math.max(1, b.p.ap + extraAp);
    const eAp = Math.max(1, b.enemy.ap);
    if (hasteBonus > 0) push(b, `Зелье скорости: в этом раунде у тебя +1 ход (осталось ${b.p.statuses.haste}).`, "p");
    if (shadowAp > 0) push(b, `Шаг в тень даёт +${shadowAp} ход в этом раунде.`, "p");
    b.p.statuses.shadowStep = 0;
    const prevHaste = b.p.statuses.haste;
    const prevStone = b.p.statuses.stone;
    b.p.statuses.haste = Math.max(0, b.p.statuses.haste - 1);
    b.p.statuses.stone = Math.max(0, b.p.statuses.stone - 1);
    if (prevHaste > 0 && b.p.statuses.haste === 0)
      push(b, "Действие зелья скорости закончилось: количество ходов вернулось к норме.", "sys");
    if (prevStone > 0 && b.p.statuses.stone === 0)
      push(b, "Каменная кожа осыпалась: входящий урон больше не снижен.", "sys");
    b.queue = buildQueue(slowedTurns(pAp, b.p.statuses.slow), eAp);
    b.p.statuses.slow = Math.max(0, b.p.statuses.slow - 1);
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

export const MAX_CONCENTRATION = 7;
/** Спец-приём архетипа открывается при этом порогу концентрации и тратит ровно столько же. */
export const SPECIAL_CONCENTRATION = 5;
/** Слово созидания создаёт 2 свитка. */
const SPECIAL_SCROLLS = 2;
const WARLOCK_HP_SHARE = 0.5;
/** Колдун: цена каждого приёма — доля макс. ОЗ героя. */
const PACT_HP_COST = 0.03;
/** Колдун: иссушение обычного приёма и спец-приёма (раунды); рубеж 10 добавляет +2. */
const PACT_DRAIN_ROUNDS = 2;
/** Колдун: тик иссушения — доля макс. ОЗ врага за раунд (как DRAIN_SHARE текущего иссушения). */
const PACT_DRAIN_SHARE = 0.06;
const PACT_SPECIAL_DRAIN_ROUNDS = 3;
/** Любой приём (оружия, эпический, брони) требует концентрации и тратит её на использование (−1). */
const TECHNIQUE_CONCENTRATION = 1;
/** Мощный удар тратит 1 концентрации и без неё недоступен: кнопка заблокирована, сервер отказывает. */
const RISKY_CONCENTRATION = 1;
/** Причина, по которой мощный удар сейчас недоступен (или null). */
export function riskyAttackBlock(b: BattleState): string | null {
  if (b.p.concentration >= RISKY_CONCENTRATION) return null;
  return `Мощный удар требует ${RISKY_CONCENTRATION} концентрации (сейчас ${b.p.concentration}).`;
}
function techniqueConcentrationMsg(b: BattleState): string {
  return `Приём требует ${TECHNIQUE_CONCENTRATION} концентрации (сейчас ${b.p.concentration}).`;
}

/** Концентрация за ход: мощная атака −1, обычная 0, безопасная +1, приём −1, расходник +1, защита +2. Только для хода героя, не для внутренних розыгрышей. */
/** Базовое изменение концентрации действием (без пассивов): то же, что применяет бой и что видит игрок в подсказке. */
export function concentrationDelta(type: PlayerAction["type"], kind: AttackKind = "normal"): number {
  if (type === "attack") return kind === "risky" ? -1 : kind === "safe" ? 1 : 0;
  if (type === "weapon_skill" || type === "epic_skill" || type === "armor_skill") return -1;
  if (type === "item") return 1;
  if (type === "guard") return 2;
  if (type === "archetype_skill") return -SPECIAL_CONCENTRATION;
  return 0;
}

function adjustConcentration(b: BattleState, type: PlayerAction["type"], kind: AttackKind = "normal") {
  /* Спец-приём тратит концентрацию сам, в своём case: здесь его не учитываем, иначе спишется дважды. */
  if (type === "archetype_skill") return;
  const before = b.p.concentration;
  const delta = concentrationDelta(type, kind);
  if (delta === 0) return;
  b.p.concentration = Math.max(0, Math.min(MAX_CONCENTRATION, before + delta));
  if (before < SPECIAL_CONCENTRATION && b.p.concentration >= SPECIAL_CONCENTRATION && b.p.archetype) {
    push(b, `Концентрация ${b.p.concentration}/${MAX_CONCENTRATION}: спец-приём «${ARCHETYPES[b.p.archetype].special.name}» готов.`, "p");
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
  if (b.p.statuses.sealItems > 0) return "Немота запрещает спец-приём в этот ход.";
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
  } else if (arch === "duelist") {
    duelistCounterVolley(b);
  } else if (arch === "warlock") {
    b.p.hp = Math.max(1, Math.round(b.p.maxHp * WARLOCK_HP_SHARE));
    b.p.statuses.invulnerable = Math.max(b.p.statuses.invulnerable, 1);
    push(b, `Жертвенный пакт: здоровье ${b.p.hp}/${b.p.maxHp}, неуязвимость на 1 ход.`, "p");
    applyPactDrain(b, PACT_SPECIAL_DRAIN_ROUNDS);
    /* Обряд (ветка A): пакт возвращает 2 концентрации. */
    if (hasPassive(b, "skill_rite_a")) {
      b.p.concentration = Math.min(MAX_CONCENTRATION, b.p.concentration + 2);
      push(b, "Ритуал: концентрация +2.", "p");
    }
    /* Кровь пакта (ветка B): пакт снимает все негативные эффекты героя. */
    if (hasPassive(b, "skill_rite_b")) {
      const cleared = clearHeroNegatives(b, true);
      if (cleared > 0) push(b, `Кровь пакта: снято негативных эффектов: ${cleared}.`, "p");
    }
  } else if (arch === "archmage") {
    const created = createScrolls(b, SPECIAL_SCROLLS);
    push(b, `Слово созидания создаёт свитки: ${created.join(", ")}.`, "p");
    if (created.length > 0) castCreatedScroll(b, created[0]);
    /* Слово созидания сразу накладывает на врага горение или обморожение на 3 раунда (случайно). */
    if (b.enemy.hp > 0) {
      const kind = Math.random() < 0.5 ? "burn" : "chill";
      const dot = magicDot(b, kind, 3, skillDotTick(kind, b.p.level, b.enemy.maxHp), true);
      applyEnemyStatus(b, kind, dot.rounds, dot.tick);
      push(b, `Слово созидания: ${b.enemy.def.name} ${kind === "burn" ? "горит" : "скован холодом"} на 3 раунда.`, "p");
    }
  }
}

/** Ответный залп: контратака по врагу, затем раскол брони −3 на 2 раунда. */
function duelistCounterVolley(b: BattleState) {
  const { d } = calcWeaponRoll(b, 0.6);
  const dealt = duelistCounterHit(b, d, " [Ответный залп]");
  comboOnCounter(b, dealt);
  applyEnemyBreak(b, 3, 0, 2, "Ответный залп");
}

/**
 * Архимаг: горение и обморожение от приёмов и свитков.
 * Пылающий канон (рубеж 5): тик +25% (с округлением вверх). Запретный канон: +1 раунд.
 * Вечная стужа (рубеж 10): горение держится до конца боя. Пожар B: горение от свитка +1 за каждый свиток в бою (до 5).
 */
function magicDot(b: BattleState, kind: "burn" | "chill", rounds: number, tick: number, fromScroll: boolean): { rounds: number; tick: number } {
  let r = rounds + (hasGearPassive(b, "archmage_library") ? passivePower(b, "archmage_library", "round") : 0);
  let t = hasPassive(b, "arch_archmage_5") ? Math.ceil(tick * 1.25) : tick;
  if (fromScroll && kind === "burn" && hasPassive(b, "skill_ember_b")) t += Math.min(5, b.scrollsMade ?? 0);
  if (kind === "burn" && hasPassive(b, "arch_archmage_10")) r = BURN_UNTIL_END;
  return { rounds: r, tick: t };
}
function createScrolls(b: BattleState, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = pick(CREATED_SCROLLS);
    /* Вторая строка (Списки A): созданный свиток с 20% шансом создаётся дважды. */
    const copies = hasPassive(b, "skill_scribe_a") && Math.random() < 0.2 ? 2 : 1;
    for (let c = 0; c < copies; c++) {
      addConjured(b, id);
      b.scrollsMade = (b.scrollsMade ?? 0) + 1;
      out.push(ITEMS[id]?.name ?? id);
    }
  }
  return out;
}
/** Применение созданного свитка. Чтение вслух (Списки B): первый в бою — дважды. Запретный канон: 15% без траты. */
function castCreatedScroll(b: BattleState, name: string) {
  const id = CREATED_SCROLLS.find((x) => ITEMS[x]?.name === name);
  if (!id || !b.bag[id]) return;
  const def = ITEMS[id];
  const readAloud = hasPassive(b, "skill_scribe_b") && !b.p.statuses.readAloudUsed;
  if (readAloud) b.p.statuses.readAloudUsed = 1;
  const reapply = hasGearPassive(b, "archmage_library") && Math.random() < passivePower(b, "archmage_library", "reapply") / 100;
  if (readAloud) push(b, `Чтение вслух: свиток «${def.name}» применяется дважды.`, "p");
  if (reapply) push(b, `Запретный канон: свиток «${def.name}» применяется ещё раз без траты.`, "p");
  const times = 1 + (readAloud ? 1 : 0) + (reapply ? 1 : 0);
  for (let i = 0; i < times; i++) resolveCreatedScroll(b, def);
  spendBagItem(b, id);
}
function resolveCreatedScroll(b: BattleState, def: ItemDef) {
  const power = consumablePower(def, b.p.stats);
  const mult = consumableDamageMult(b, def);
  if (def.use?.type === "heal") {
    const amt = healPlayer(b, Math.round(power * mult));
    push(b, `${def.name} сразу применяется: +${amt} здоровья.`, "p");
  } else if (def.use?.type === "chill") {
    const dealt = elementalHit(b, Math.round(power * mult), ` [${def.name}, сотворён]`, def.use?.element ?? "ice");
    const chill = magicDot(b, "chill", 3, dotBaseTick("chill", b.p.level), true);
    applyEnemyStatus(b, "chill", chill.rounds, chill.tick);
    applyVamp(b, dealt, 0, "scroll", "magic");
  } else if (def.use?.type === "terror") {
    b.enemy.forceGuard = Math.max(b.enemy.forceGuard, 2);
    push(b, `${def.name} сразу применяется: враг держит защиту.`, "p");
  } else {
    const dealt = elementalHit(b, Math.round(power * mult), ` [${def.name}, сотворён]`, def.use?.element);
    applyVamp(b, dealt, 0, "scroll", "magic");
  }
}
function consumableDamageMult(b: BattleState, def: { kind: string; use?: { type: string } }) {
  const isScroll = def.kind === "scroll";
  const spellPowerMult = (hasPassive(b, "resonance") ? 1.4 : 1) * (1 + legPower(b, "archmage_blood", "spellDamage") / 100);
  let m = isScroll ? spellPowerMult : 1;
  if (isScroll) {
    m *= 1 + ((b.p.stats.int * effectPower(b, "wisdom")) / 100) * weakMult(b) + effectPower(b, "scroll_damage") / 100;
  } else if (def.use?.type !== "heal" && def.use?.type !== "cleanse") {
    m *= 1 + ((b.p.stats.agi * effectPower(b, "precision")) / 100) * weakMult(b) + effectPower(b, "consumable_damage") / 100;
  }
  const debuffs = enemyDebuffCount(b);
  m *= 1 + (effectPower(b, "debuff_damage") / 100) * Math.min(4, debuffs);
  return m;
}
function consumablePowerWithGear(b: BattleState, def: ItemDef) {
  return consumablePower(def, b.p.stats);
}

/** Приём брони: урон и лечение от характеристики приёма, эффекты — из его данных. */
function applyArmorSkill(b: BattleState, sk: ArmorSkillView) {
  const st = b.p.stats[sk.scaleStat];
  if (sk.dmg && b.enemy.hp > 0) {
    const raw = sk.dmg.base + sk.dmg.stat * st * weakMult(b) + (sk.dmg.armor ?? 0) * b.p.armor;
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
  if (e.chill && b.enemy.hp > 0) {
    const chill = magicDot(b, "chill", e.chill, skillDotTick("chill", b.p.level, b.enemy.maxHp), false);
    applyEnemyStatus(b, "chill", chill.rounds, chill.tick);
  }

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

/** Выносливость за обычную атаку: сумма ударов по рукам; без оружия — как лёгкое. */
export function attackStaminaCost(b: BattleState): number {
  const hands = b.p.hands ?? [];
  if (!hands.length) return STAMINA_UNARMED;
  return hands.reduce((sum, h) => sum + h.cost, 0);
}

/** Приём: вес сильнейшего оружия (по среднему урону) + добавка. */
export function techniqueStaminaCost(b: BattleState): number {
  /* Второе дыхание стоит фиксированно, остальные приёмы — по весу оружия. */
  if (b.p.weaponSkill?.effect === "second_wind") return SECOND_WIND_COST;
  const hands = b.p.hands ?? [];
  const base = hands.length ? hands.reduce((best, h) => (h.power > best.power ? h : best)).cost : STAMINA_UNARMED;
  return base + STAMINA_TECHNIQUE_EXTRA;
}

/** Выносливость, которую тратит действие. Спец-приём архетипа, побег и конец хода — бесплатны. */
export function actionStaminaCost(b: BattleState, a: PlayerAction): number {
  switch (a.type) {
    case "attack":
      return attackStaminaCost(b);
    case "weapon_skill":
    case "epic_skill":
      return techniqueStaminaCost(b);
    case "armor_skill": {
      const sk = b.p.armorSkills.find((x) => x.id === a.id);
      return sk ? STAMINA_BY_WEIGHT[sk.gearClass] + STAMINA_TECHNIQUE_EXTRA : 0;
    }
    case "guard":
      return STAMINA_GUARD;
    case "item":
      return b.pouch.includes(a.id) ? 0 : STAMINA_BACKPACK;
    default:
      return 0;
  }
}

/** Ход продолжается, пока хватает выносливости хотя бы на одну платную трату или есть бесплатный предмет в сумке. */
function canKeepActing(b: BattleState): boolean {
  if (b.p.stamina >= STAMINA_MIN_PAID) return true;
  return b.pouch.some((id) => (b.bag[id] ?? 0) > 0);
}

export function playerAct(b0: BattleState, a: PlayerAction): BattleState {
  if (b0.over || b0.queue[b0.idx] !== "p") return b0;
  if (b0.p.statuses.stunAp > 0) return skipStunnedTurn(b0);
  return actInternal(b0, a, true);
}

/** takeTurn=false — внутренний розыгрыш (бросок расходника приёмом дуэлянт): ход не тратится, концентрация не меняется. */
function actInternal(b0: BattleState, a: PlayerAction, takeTurn: boolean): BattleState {
  if (b0.over || b0.queue[b0.idx] !== "p") return b0;
  const b = clone(b0);
  /* Страх: защиту герой уже занял в начале хода (beginTurn). Пока страх держится,
     атаковать, применять приёмы и бежать нельзя; рюкзак и защита доступны. */
  const fearTurn = b.p.statuses.fear > 0;

  const err = (msg: string) => {
    push(b, msg, "sys");
    return b;
  };

  if (fearTurn && a.type !== "item" && a.type !== "guard" && a.type !== "flee" && a.type !== "end_turn") {
    return err("Страх: атаковать и применять приёмы нельзя. Доступны рюкзак, защита, побег и конец хода.");
  }

  /* Выносливость: действие тратит её только в свой ход; списывается после успешного действия. */
  const cost = takeTurn ? actionStaminaCost(b, a) : 0;
  if (cost > b.p.stamina) return err(`Не хватает выносливости: нужно ${cost}, осталось ${b.p.stamina}.`);
  let spent = cost;

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
  if (a.type === "item" && b.p.statuses.sealItems > 0 && ITEMS[a.id]?.kind === "scroll") return err("Немота запрещает свитки в этот ход.");
  if (a.type === "attack" && a.kind === "risky") {
    const block = riskyAttackBlock(b);
    if (block) return err(block);
  }

  switch (a.type) {
    case "attack": {
      heroAttackStart(b, undefined);
      const firstStrike = !b.p.firstAttackDone && hasPassive(b, "arch_assassin_10");
      /* Каждое оружие в руках — отдельный удар: свой бросок, свой крит, свои эффекты. Кулаки — один удар. */
      /* Ветки навыков на один ход атаки: Тень 3 — первый удар не уклоняется; Зверь 5 — добивание не промахивается;
         Таран 3 — первая атака после защиты пробивает 20% брони; Таран 5 — оглушает с шансом 25%. */
      /* Первая атака после защиты: защита держится весь ход, поэтому считается одна атака на включение. */
      const afterGuardAttack = b.p.guard && !b.p.guardStrikeUsed;
      if (afterGuardAttack) b.p.guardStrikeUsed = true;
      b.skillNoMiss = (!b.p.firstAttackDone && hasPassive(b, "skill_shadow_a")) || (hasPassive(b, "skill_beast_b") && enemyBelowShare(b, 0.2));
      /* Таран A — 20% брони после защиты; Пролом B — 10% по врагу с расколом. Не складываются. */
      b.armorIgnore = Math.max(
        hasPassive(b, "skill_ram_a") && afterGuardAttack ? 0.2 : 0,
        hasPassive(b, "skill_split_b") && (b.enemy.statuses.breakRounds ?? 0) > 0 ? 0.1 : 0,
      );
      const ramStun = hasPassive(b, "skill_ram_b") && afterGuardAttack && Math.random() < 0.25;
      const strikes = (b.p.hands ?? []).length ? b.p.hands : [undefined];
      const kind: AttackKind = a.kind ?? "normal";
      for (let i = 0; i < strikes.length && b.enemy.hp > 0; i++) {
        const hand = strikes[i];
        const label =
          (strikes.length > 1 && hand ? ` [${hand.name}]` : "") +
          (kind === "normal" ? "" : ` [${ATTACK_KIND_META[kind].name}]`);
        const acc = heroAccuracy(b, hand?.cls ?? "light", kind);
        const { d, crit } = calcWeaponRoll(b, 1, 0, { hand, kind });
        /* Бастион: после стойки следующая обычная атака получает броню стойки как прямой урон (один раз). */
        const strikeBonus = b.p.statuses.bulwarkStrike;
        b.p.statuses.bulwarkStrike = 0;
        const dealt = hitEnemy(
          b,
          d + strikeBonus,
          "phys",
          label + (crit ? " Критический удар!" : "") + (strikeBonus > 0 ? ` [Стойка: +${strikeBonus}]` : ""),
          true,
          undefined,
          acc,
        );
        applyVamp(b, dealt, 0, "weapon");
        if (dealt > 0) oilOnHit(b, dealt);
        b.p.firstAttackDone = true;
        if (firstStrike && i === 0) firstStrikeStun(b);
        weaponHitEffects(b);
        /* Яд клинка: крит накладывает кровотечение (ранг 5 — дважды). */
        if (crit && dealt > 0 && b.enemy.hp > 0 && hasPassive(b, "skill_bladepoison_a")) {
          const times = hasPassive(b, "skill_bladepoison_b") ? 2 : 1;
          for (let t = 0; t < times && b.enemy.hp > 0; t++) applyEnemyStatus(b, "bleed", 3, dotBaseTick("bleed", b.p.level));
        }
        /* Серия: крит даёт дополнительный удар (ранг 5 — два, если враг ниже 50%). */
        if (crit && b.enemy.hp > 0 && hasPassive(b, "skill_flurry_a")) {
          const extra = hasPassive(b, "skill_flurry_b") && enemyBelowShare(b, 0.5) ? 2 : 1;
          for (let t = 0; t < extra && b.enemy.hp > 0; t++) {
            const { d: xd } = calcWeaponRoll(b, 1, 0, { hand, kind });
            const xdealt = hitEnemy(b, xd, "phys", `${label} [Серия]`, true, undefined, acc);
            applyVamp(b, xdealt, 0, "weapon");
          }
        }
        if (ramStun && i === 0 && b.enemy.hp > 0) {
          b.enemy.statuses.stunAp = Math.min(4, b.enemy.statuses.stunAp + 1);
          push(b, `Ошеломляющий удар: ${b.enemy.def.name} оглушён на ход.`, "p");
        }
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
        const counterChance = Math.min(1, effectPower(b, "counter") / 100 + passivePower(b, "dance", "counter") / 100 + passivePower(b, "duelist_phantom", "counter") / 100 + (isDuelist(b) && hasPassive(b, "arch_duelist_5") ? 0.10 : 0));
        if (b.enemy.hp > 0 && counterChance > 0 && Math.random() < counterChance) {
          const { d: cd } = calcWeaponRoll(b, 0.6, 0, { hand, kind });
          const dealt2 = duelistCounterHit(b, cd, " [Второй удар]", acc);
          comboOnCounter(b, dealt2);
          applyVamp(b, dealt2, 0, "weapon");
        }
      }
      b.skillNoMiss = false;
      b.armorIgnore = 0;
      break;
    }

    case "weapon_skill": {
      const ws = b.p.weaponSkill;
      if (!ws) return err("У этого оружия нет особого приёма.");
      if (b.p.concentration < TECHNIQUE_CONCENTRATION) return err(techniqueConcentrationMsg(b));
      if (b.p.weaponCd > 0) return err(`Приём «${ws.name}» перезаряжается ещё ${b.p.weaponCd} р.`);
      if (ws.effect === "shadow_behind") {
        if ((b.p.statuses.turnActs ?? 0) > 0) return err("Тень за спиной работает только первым действием хода.");
        if ((b.p.statuses.shadowCharges ?? 2) <= 0) return err("Тень за спиной: заряды ещё восстанавливаются.");
      }
      if (ws.effect === "repeat_last" && !b.lastRepeat) return err("Повторять пока нечего: ни приёма, ни свитка ещё не было.");
      const req = Math.max(1, ws.intReq - b.p.intDiscount);
      if (b.p.stats.int < req) return err(`Для приёма «${ws.name}» требуется ИНТ ${req}.`);

      /* Повторение: розыгрыш последнего приёма или свитка; своей стоимости у повтора нет, перезарядка повтора не мешает. */
      if (ws.effect === "repeat_last") {
        const last = b.lastRepeat;
        if (!last) return err("Повторять пока нечего.");
        const savedSkill = b.p.weaponSkill;
        b.p.weaponCd = 0;
        if (last.kind === "tech") b.p.weaponSkill = last.ws;
        const repeated = actInternal(b, last.kind === "tech" ? { type: "weapon_skill" } : { type: "item", id: last.id }, false);
        Object.assign(b, repeated);
        b.p.weaponSkill = savedSkill;
        push(b, `Повторение: ${last.kind === "tech" ? last.ws.name : (ITEMS[last.id]?.name ?? last.id)}.`, "p");
        b.p.weaponCd = ws.cooldown;
        break;
      }
      /* Слабость не приговор: снимает свои негативные эффекты, за каждый +25 урона в этом ударе. */
      const cleared = ws.effect === "no_verdict" ? clearHeroNegatives(b) : 0;
      /* Воронка: плюс СИЛ × М(СИЛ). */
      const funnelBonus = ws.effect === "funnel" ? b.p.stats.str * Math.min(TECHNIQUE_STAT_CAP, b.p.stats.str) : 0;
      const bonus = techniqueBonusNow(b, ws) + cleared * 25 + funnelBonus;
      const eff = ws.effect;
      if (b.p.statuses.sealItems > 0 && (ws.magic || MAGIC_TECH_EFFECTS.includes(eff ?? ""))) return err("Немота запрещает магические приёмы в этот ход.");
      const trueDamage = eff === "pierce" || eff === "chill" || eff === "leech" || eff === "skill_leech";
      const magicSkill = !!ws.magic;
      const hits = eff === "double_attack" ? scaleIntegerByLevel(2, ws.level ?? 1) : eff === "double_cut" ? 2 : NO_ATTACK_EFFECTS.has(eff ?? "") ? 0 : 1;
      /* Казнь: при ОЗ врага ниже половины удар сильнее. Проверка до удара. */
      const executeNow = eff === "execute" && b.enemy.hp < b.enemy.maxHp * 0.5;
      /* Колдун: каждый приём платит 3% макс. ОЗ (не меньше 1). Плата не убивает: ОЗ не ниже 1. */
      const hpBeforePact = b.p.hp;
      if (b.p.archetype === "warlock") {
        const cost = Math.max(1, Math.round(b.p.maxHp * PACT_HP_COST));
        b.p.hp = Math.max(1, b.p.hp - cost);
        if (b.p.hp < hpBeforePact) push(b, `Плата пакта: −${hpBeforePact - b.p.hp} ОЗ.`, "p");
      }
      heroAttackStart(b, eff);
      /* Последний приём, который можно повторить (не сам Повтор). */
      b.lastRepeat = { kind: "tech", ws: { ...ws } };
      /* Тень за спиной: удар сквозь броню; заряд тратится, перезарядка — когда заряды кончились. */
      if (eff === "shadow_behind") {
        b.p.statuses.shadowCharges = (b.p.statuses.shadowCharges ?? 2) - 1;
        b.p.statuses.ignoreArmorNow = 1;
        if ((b.p.statuses.shadowCharges ?? 0) <= 0) b.p.weaponCd = ws.cooldown;
      }
      /* Захват: без уклонения героя и врага на 2 раунда. */
      if (eff === "seize") {
        b.p.statuses.noEvade = 2;
        b.enemy.statuses.noEvade = 2;
      }
      /* Кувалда и Метеор: удар без промаха; у Кувалды промах всё равно даёт половину урона. */
      if (eff === "sledge" || eff === "meteor") b.skillNoMiss = true;
      let dealtTotal = 0;
      const firstStrike = !b.p.firstAttackDone && hasPassive(b, "arch_assassin_10");
      for (let i = 0; i < hits; i++) {
        //.Multi-hit: каждый удар — отдельная обычная атака без бонуса приёма.
        const isMulti = eff === "double_attack";
        const rolled = calcWeaponRoll(b, 1, isMulti ? 0 : bonus, { skill: !isMulti, multi: isMulti, forceCrit: !isMulti && eff === "guaranteed_crit" && b.round <= 2 });
        const crit = rolled.crit;
        const halfAttack = eff === "sweep" || eff === "snake_lunge" || eff === "seize";
        const sledgeMiss = eff === "sledge" && !rollHeroHit(heroAccuracy(b, mainHandClass(b), "normal"), heroEvasion(b));
        const d = Math.round(rolled.d * (executeNow ? 1.5 : 1) * (halfAttack || sledgeMiss ? 0.5 : 1));
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
          const counterChance = Math.min(1, effectPower(b, "counter") / 100 + passivePower(b, "dance", "counter") / 100 + passivePower(b, "duelist_phantom", "counter") / 100 + (isDuelist(b) && hasPassive(b, "arch_duelist_5") ? 0.10 : 0));
          if (b.enemy.hp > 0 && counterChance > 0 && Math.random() < counterChance) {
            const { d: cd } = calcWeaponRoll(b, 0.6);
            const dealt2 = duelistCounterHit(b, cd, ` [Второй удар ${i + 1}/${hits}]`);
            comboOnCounter(b, dealt2);
            applyVamp(b, dealt2, 0, "weapon");
          }
        }
        if (b.enemy.hp <= 0) break;
      }
      b.p.firstAttackDone = true;
      b.skillNoMiss = false;
      b.p.statuses.ignoreArmorNow = 0;
      if (firstStrike) firstStrikeStun(b);

      dealtTotal += techniqueDirectEffect(b, ws, executeNow);

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
        const chill = magicDot(b, "chill", techValue(ws, 2), skillDotTick("chill", b.p.level, b.enemy.maxHp), false);
        applyEnemyStatus(b, "chill", chill.rounds, chill.tick);
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
      } else if (eff === "counter_thrust") {
        /* Встречный выпад: если враг атаковал в прошлом раунде — контратака по нему. */
        if (b.p.statuses.incomingRound === b.round - 1 && b.enemy.hp > 0) {
          const { d: cd } = calcWeaponRoll(b, 0.6);
          const dealt = hitEnemy(b, cd, "phys", " [Встречный выпад]");
          comboOnCounter(b, dealt);
          push(b, "Встречный выпад: враг атаковал в прошлом раунде — ответный удар.", "p");
        }
      } else if (eff === "curse_brand") {
        applyEnemyStatus(b, "curse", techValue(ws, 3) + (hasPassive(b, "skill_curse_b") ? 2 : 0), skillDotTick("curse", b.p.level, b.enemy.maxHp));
        b.enemy.statuses.cursePower = 30;
        b.enemy.statuses.fear = Math.max(b.enemy.statuses.fear, statusRounds(b, techValue(ws, 1)));
        push(b, `${b.enemy.def.name} скован печатью проклятия: урон −30% и периодический магический урон.`, "p");
      } else if (eff === "full_guard") {
        const rounds = techValue(ws, 2);
        b.p.statuses.fullGuard = Math.max(b.p.statuses.fullGuard, rounds);
        push(b, `Слово защиты: полная защита от урона на ${rounds} хода.`, "p");
      } else if (eff === "buff_break") {
        /* Срок фиксирован: истощение держится ровно два хода, уровнем не растягивается. */
        const rounds = 2;
        if (!bossResists(b)) {
          applyDepletion(b);
          push(b, `Истощение ${b.enemy.def.name} на ${rounds} хода: его положительные эффекты гаснут.`, "p");
        }
      } else if (eff === "create_scroll") {
        const count = scaleIntegerByLevel(ws.id === "scroll_tempest" ? 2 : 1, ws.level ?? 1) + effectPower(b, "scroll_create");
        const created = createScrolls(b, count);
        push(b, `Слово творения создаёт свитки: ${created.join(", ")}.`, "p");
        if (created.length > 0) castCreatedScroll(b, created[0]);
      }

      let leech = eff === "leech" ? techValue(ws, 0.4, 100) : eff === "skill_leech" ? techValue(ws, ws.id === "soul_reprise" ? 0.35 : 0.25, 100) : 0;
      if (eff !== "double_attack") applyVamp(b, dealtTotal, leech, "skill", trueDamage ? "magic" : "phys");
      else if (leech > 0) applyVamp(b, dealtTotal, leech, "skill", "phys");

      /* Колдун: удачный приём накладывает иссушение на врага. Печать пакта лечит 12% урона таких приёмов. */
      if (b.p.archetype === "warlock" && dealtTotal > 0 && b.enemy.hp > 0) {
        applyPactDrain(b, PACT_DRAIN_ROUNDS);
        if (hasGearPassive(b, "warlock_pact")) {
          const heal = healPlayer(b, Math.round(dealtTotal * passivePower(b, "warlock_pact", "vamp") / 100));
          if (heal > 0) push(b, `Печать пакта: +${heal} здоровья.`, "p");
        }
      }
      /* Порча приёмом (Колдун, ветка «Порча» A): проклятие на 2 раунда, −10% урона врага. */
      if (hasPassive(b, "skill_curse_a") && b.enemy.hp > 0) {
        applyEnemyStatus(b, "curse", 2 + (hasPassive(b, "skill_curse_b") ? 2 : 0), skillDotTick("curse", b.p.level, b.enemy.maxHp));
        b.enemy.statuses.cursePower = 10;
        push(b, `Порча приёмом: ${b.enemy.def.name} проклят (урон −10%).`, "p");
      }
      /* Обет крови (ветка «Обет» A): приём, который довёл ОЗ героя ниже 30%, не тратит перезарядку. */
      const vowFree = hasPassive(b, "skill_vow_a") && hpBeforePact >= b.p.maxHp * 0.3 && b.p.hp < b.p.maxHp * 0.3;
      const noCd = vowFree || (hasPassive(b, "echo") && Math.random() < 0.35);
      if (noCd) {
        push(b, vowFree ? "Обет крови: ОЗ ниже 30%, перезарядки нет!" : "Приём не ушёл на перезарядку!", "p");
      } else {
        let cd = skillCdAfterUse(b, ws.cooldown);
        /* Тень за спиной с оставшимися зарядами перезарядки не получает. */
        if (eff === "shadow_behind" && (b.p.statuses.shadowCharges ?? 0) > 0) cd = 0;
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
      /* Урон эпика = база + коэффициент × свой стат (scaleStat), как в EPIC_SKILL_BASE. */
      const epicStat = b.p.stats[sk.scaleStat];
      const epicDmg = epicMagnitude(sk.id, "base", skLevel) + epicMagnitude(sk.id, "scale", skLevel) * epicStat;
      if (sk.id === "fireball") {
        const dmg = Math.round(epicDmg * weakMult(b) * spellPowerMult * skillDamageMult(b));
        const dealt = elementalHit(b, dmg, " [Огненный шар]", "fire");
        applyVamp(b, dealt, 0, "skill", "magic");
        const burnRounds = epicMagnitude(sk.id, "rounds", skLevel);
        setEnemyTick(b, "burn", burnRounds, skillDotTick("burn", b.p.level, b.enemy.maxHp));
        push(b, `${b.enemy.def.name} объят пламенем (${burnRounds} раунда).`, "p");
      } else if (sk.id === "blood_lance") {
        /* Физический навык: пробивает броню, но не считается ударом оружия (без крита и оглушения). */
        const dmg = Math.round(epicDmg * weakMult(b) * skillDamageMult(b));
        b.p.statuses.ignoreArmorNow = 1;
        b.skillNoMiss = true;
        const dealt = hitEnemy(b, dmg, "phys", " [Кровавое копьё]", false);
        b.skillNoMiss = false;
        b.p.statuses.ignoreArmorNow = 0;
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
        /* Физический навык: сквозь броню, без удара оружия; враг слабее атакует на время порчи. */
        const dmg = Math.round(epicDmg * weakMult(b) * skillDamageMult(b));
        b.p.statuses.ignoreArmorNow = 1;
        b.skillNoMiss = true;
        const dealt = hitEnemy(b, dmg, "phys", " [Теневой росчерк]", false);
        b.skillNoMiss = false;
        b.p.statuses.ignoreArmorNow = 0;
        applyEnemyStatus(b, "blight", epicMagnitude(sk.id, "rounds", skLevel));
        applyVamp(b, dealt, 0, "skill", "phys");
      } else if (sk.id === "frost_nova") {
        /* Холод без стихии: урон магией, без уязвимости и сопротивления стихии. */
        const dmg = Math.round(epicDmg * weakMult(b) * spellPowerMult * skillDamageMult(b));
        const dealt = hitEnemy(b, dmg, "magic", " [Дыхание склепа]", false);
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
      b.p.guardStrikeUsed = false;
      flash(b, "p", "guard", 0);
      push(b, "Ты уходишь в глухую защиту: броня +10 до твоего следующего хода.", "p");
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
          if (b.p.statuses.rage > 0) dmg = Math.round(dmg * (1 + ((b.p.statuses.rageStep ?? 10) / 100) * Math.min(10, Math.floor(missingHpRatio(b) * 10))));
          if (b.p.statuses.curse > 0) dmg = Math.round(dmg * (1 - (b.p.statuses.cursePower ?? 30) / 100));
          const dealt = elementalHit(b, dmg, ` [${def.name}]${u.vs && b.enemy.def.race === u.vs ? " · вдвойне против такого рода!" : ""}`, u.element);
          applyVamp(b, dealt, 0, def.kind === "scroll" ? "scroll" : "consumable", def.kind === "scroll" ? "magic" : "phys");
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
          const chill = def.kind === "scroll" ? magicDot(b, "chill", u.rounds ?? 3, dotBaseTick("chill", b.p.level), true) : { rounds: u.rounds ?? 3, tick: dotBaseTick("chill", b.p.level) };
          applyEnemyStatus(b, "chill", chill.rounds, chill.tick);
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
        case "stamina": {
          const slot = b.round * 1000 + b.idx;
          if (b.p.statuses.staminaPotionSlot === slot) return err("Зелье выносливости уже пили в этом ходу.");
          b.p.statuses.staminaPotionSlot = slot;
          const before = b.p.stamina;
          b.p.stamina = Math.min(b.p.staminaMax, b.p.stamina + itemPower);
          push(b, `${def.name}: +${b.p.stamina - before} выносливости.`, "p");
          break;
        }
        case "antidote": {
          const healed = itemPower > 0 ? healPlayer(b, itemPower, true) : 0;
          if (u.cleanseAll) clearAllHeroNegatives(b);
          for (const k of u.effects ?? []) clearHeroEffect(b, k);
          if (u.resist) {
            for (const k of u.effects ?? []) {
              b.p.statuses.resistFx = { ...(b.p.statuses.resistFx ?? {}), [k]: { chance: u.resist, rounds: u.rounds ?? 1 } };
            }
          }
          if (healed > 0) flash(b, "p", "heal", healed);
          const what = u.cleanseAll ? "все негативные эффекты сняты" : `снято: ${(u.effects ?? []).map((k) => IMMUNITY_NAMES[k]).join(", ")}`;
          const resistNote = u.resist ? ` На ${u.rounds ?? 1} раунд: ${Math.round(u.resist * 100)}% сопротивления.` : "";
          push(b, `${def.name}: ${what}${healed > 0 ? `, +${healed} здоровья` : ""}.${resistNote}`, "p");
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
          b.p.statuses.rageStep = u.rageStep ?? 10;
          push(b, `${def.name}: ярость на ${b.p.statuses.rage} раунда, +${b.p.statuses.rageStep}% урона за каждые 10% недостающего ОЗ.`, "p");
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
        case "stone": {
          b.p.statuses.stone = statusRounds(b, u.rounds ?? 3);
          b.p.statuses.stonePct = u.power ?? 0.3;
          push(b, `${def.name}: входящий урон −${Math.round((u.power ?? 0.3) * 100)}% на ${b.p.statuses.stone} раунда.`, "p");
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
        case "resist": {
          const fx = u.effects ?? [];
          const rounds = u.rounds ?? 1;
          for (const k of fx) {
            b.p.statuses.resistFx = { ...(b.p.statuses.resistFx ?? {}), [k]: { chance: u.resist ?? 0, rounds } };
          }
          push(b, `${def.name}: ${Math.round((u.resist ?? 0) * 100)}% сопротивления на ${rounds} раунд(а): ${fx.map((k) => IMMUNITY_NAMES[k]).join(", ")}.`, "p");
          break;
        }
        case "vamp": {
          const kind = u.vampKind === "magic" ? "magic_vamp" : "vamp";
          const rounds = statusRounds(b, u.rounds ?? 3);
          b.p.statuses.buffs = { ...(b.p.statuses.buffs ?? {}), [kind]: { value: (u.power ?? 0) / 100, rounds } };
          push(b, `${def.name}: ${u.power}% ${kind === "magic_vamp" ? "магического урона" : "урона оружием"} возвращается здоровьем на ${rounds} раунда.`, "p");
          break;
        }
        case "sure_hit": {
          const rounds = statusRounds(b, u.rounds ?? 1);
          b.p.statuses.buffs = { ...(b.p.statuses.buffs ?? {}), sure_hit: { value: 1, rounds } };
          push(b, `${def.name}: атака героя не промахивается на ход.`, "p");
          break;
        }
        case "oil": {
          if (!u.oil) break;
          /* +1: остаток текущего раунда, затем срок из предмета. */
          b.p.statuses.oilType = u.oil;
          b.p.statuses.oilRounds = (u.coat ?? 3) + 1;
          b.p.statuses.oilPower = u.power ?? 0;
          b.p.statuses.oilCut = u.cut ?? 0;
          push(b, `${def.name}: клинок смазан на ${u.coat ?? 3} раунда, вид: ${OIL_NAMES[u.oil]}.`, "p");
          break;
        }
        case "immunity": {
          if (!u.effect) break;
          b.p.statuses.immune[u.effect] = Math.max(b.p.statuses.immune[u.effect] ?? 0, IMMUNITY_ROUNDS);
          push(b, `${def.name}: ${IMMUNITY_NAMES[u.effect]} не накладывается ${IMMUNITY_ROUNDS} хода.`, "p");
          break;
        }
        case "scroll_creation": {
          const count = 2 + effectPower(b, "scroll_create");
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
          applyDepletion(b);
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
        (hasPassive(b, "arch_archmage_5") ? 0.25 : 0);
      const saveScroll = def.kind === "scroll" && scrollSaveChance > 0 && Math.random() < scrollSaveChance;
      if (!saveScroll) {
        spendBagItem(b, a.id);
      } else {
        push(b, "Эхо мысли сохраняет свиток — он не истлел!", "p");
      }
      /* Сумка: зелье из слотов бесплатно. */
      const isScroll = def.kind === "scroll";
      const pouchFree = def.kind === "potion" && b.pouch.includes(a.id);
      if (pouchFree) b.p.turnPouch += 1;
      else b.p.turnConsumables += 1;
      if (isScroll) b.p.turnScrolls += 1;
      if (pouchFree) {
        spent = 0;
        push(b, "Зелье из сумки не тратит выносливость.", "p");
      }
      break;
    }

    case "archetype_skill": {
      const problem = archetypeSpecialBlock(b);
      if (problem) return err(problem);
      const arch = b.p.archetype!;
      b.p.concentration -= SPECIAL_CONCENTRATION;
      runArchetypeSpecial(b, arch);
      break;
    }

    case "end_turn":
      break;

    case "flee": {
      b.over = "flee";
      b.fleeRate = a.rate ?? 0.4 + Math.random() * 0.3;
      push(b, "Ты бросаешь бой и отступаешь в коридор.", "p");
      break;
    }
  }

  if (takeTurn) b.p.statuses.turnActs = (b.p.statuses.turnActs ?? 0) + 1;
  if (takeTurn && a.type === "item" && ITEMS[a.id]?.kind === "scroll") b.lastRepeat = { kind: "item", id: a.id };
  if (takeTurn) b.p.stamina = Math.max(0, b.p.stamina - spent);
  if (takeTurn && !b.over && a.type !== "end_turn") adjustConcentration(b, a.type, a.type === "attack" ? a.kind ?? "normal" : undefined);
  if (!b.over && b.enemy.hp <= 0 && !tryRevive(b)) {
    b.enemy.hp = 0;
    b.over = "win";
    gainLoot(b);
    push(b, `${b.enemy.def.name} повержен! (+${enemyXpFor(b)} опыта)`, "sys");
    return b;
  }
  /* Герой мог пасть от собственного действия (шипы врага): смерть не ждёт конца хода и выносливости. */
  if (!b.over) heroDeathCheck(b);
  if (b.over) return b;
  /* Ход заканчивается кнопкой «Пропуск хода» либо когда выносливость иссякла. Защита ход не заканчивает. */
  const endsTurn = a.type === "end_turn" || (a.type === "weapon_skill" && ENDING_TECH_EFFECTS.has(b.p.weaponSkill?.effect ?? ""));
  if (takeTurn && (endsTurn || !canKeepActing(b))) advance(b);
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
  /* Холодный след (Стужа A): обморожённый враг −10% урона. Вечная стужа (рубеж 10): обморожение −20%. */
  const frostTrail = hasPassive(b, "skill_frost_a") && b.enemy.statuses.chill > 0 ? 0.9 : 1;
  const eternalFrost = hasPassive(b, "arch_archmage_10") && b.enemy.statuses.chill > 0 ? 0.8 : 1;
  return (b.enemy.statuses.blight > 0 ? 0.8 : 1) * (b.enemy.statuses.curse > 0 ? 1 - (b.enemy.statuses.cursePower ?? 30) / 100 : 1) *
    frostTrail * eternalFrost;
}

/** Усиления базового удара от эффектов врага, по шагам. Истощение эффектов их отключает. */
function enemyEffectSteps(b: BattleState, base0: number): { value: number; lines: DamageLine[] } {
  if (effectsDepleted(b)) return { value: base0, lines: [] };
  const e = b.enemy;
  const lines: DamageLine[] = [];
  let base = base0;
  const scale = (factor: number, label: string) => {
    base = Math.round(base * factor);
    if (factor !== 1) lines.push({ label, value: base, note: `×${factor.toFixed(2)}` });
  };
  scale(1 + (eEffect(b, "rage") / 100) * Math.min(10, Math.floor(enemyMissingRatio(b) * 10)), "Ярость врага");
  scale(1 + (e.level * eEffect(b, "might")) / 100, "Мощь врага");
  scale(1 + eEffect(b, "missing_hp_damage") / 100 * Math.min(10, Math.floor(enemyMissingRatio(b) * 10)), "Урон растёт от потерь ОЗ врага");
  scale(1 + eEffect(b, "enemy_missing_damage") / 100 * Math.min(10, Math.floor(missingHpRatio(b) * 10)), "Урон растёт от твоих потерь ОЗ");
  if (b.round <= 2) scale(1 + eEffect(b, "first_strike") / 100, "Первые раунды");
  const armorAdd = Math.round(e.armor * eEffect(b, "armor_damage") / 100);
  base += armorAdd;
  if (armorAdd !== 0) lines.push({ label: "Броня врага", value: base, note: `+${armorAdd}` });
  return { value: base, lines };
}

/** Усиления базового удара от эффектов врага, без критического броска. */
function enemyEffectDamage(b: BattleState, base0: number): number {
  return enemyEffectSteps(b, base0).value;
}

/** Множители хода: тип монстра, агрессия зверя, масло, ярость дракона, воскрешение. По шагам. */
function enemyMoveSteps(b: BattleState, move: EnemyMove, isStrikeMove: boolean, base0: number): { value: number; lines: DamageLine[] } {
  const e = b.enemy;
  let base = base0;
  const lines: DamageLine[] = [];
  /* Тип задаёт, на чём держится урон: у умных приёмы бьют в 1.45× сильнее. */
  const typeMeta = MONSTER_TYPE_META[e.mtype] ?? MONSTER_TYPE_META.strong;
  if (!isStrikeMove && move !== "guard") {
    base = Math.round(base * typeMeta.movePower);
    if (typeMeta.movePower !== 1) lines.push({ label: `Тип монстра: ${typeMeta.name}`, value: base, note: `×${typeMeta.movePower}` });
  }
  /* Агрессия зверя: ниже половины здоровья бьёт вдвое. */
  if (e.def.race === "beast" && e.hp > 0 && e.hp <= e.maxHp * 0.5 && isStrikeMove) {
    base = Math.round(base * 2);
    lines.push({ label: "Зверь ниже половины ОЗ", value: base, note: "×2" });
  }
  /* Лёд под маслом режет силу атаки и физических приёмов врага. */
  if (PHYS_ENEMY_MOVES.includes(move)) {
    const oil = enemyOilAttackMult(b);
    base = Math.round(base * oil);
    if (oil !== 1) lines.push({ label: "Лёд под маслом", value: base, note: `×${oil.toFixed(2)}` });
  }
  /* Ярость дракона: двойной урон, пока держится. */
  if (e.def.race === "dragon" && e.fury > 0 && !effectsDepleted(b)) {
    base = Math.round(base * 2);
    lines.push({ label: "Ярость дракона", value: base, note: "×2" });
  }
  /* Воскресшая нежить бьёт вполсилы. */
  if (e.revived) {
    base = Math.round(base * (1 - REVIVE_DEBUFF));
    lines.push({ label: "Воскресшая нежить", value: base, note: `×${1 - REVIVE_DEBUFF}` });
  }
  return { value: base, lines };
}

/** Множители хода: тип монстра, агрессия зверя, масло, ярость дракона, воскрешение. */
function enemyMoveDamage(b: BattleState, move: EnemyMove, isStrikeMove: boolean, base0: number): number {
  return enemyMoveSteps(b, move, isStrikeMove, base0).value;
}

/** Подсчёт ожидаемого урона приёма по шагам. Тот же расчёт, что выбирает приём и показывает список. */
export interface EnemyMoveBreakdown {
  /** Ударов в приёме: второй приходит, только если первый попал. */
  hits: number;
  /** Шанс, что один удар попадёт по герою. */
  hitChance: number;
  hitMisses: { label: string; chance: number }[];
  /** Почему удар не попадёт совсем (защита героя). null — блокировки нет. */
  blocked: string | null;
  /** Строки урона: от базового удара до итога после защит героя. */
  lines: DamageLine[];
  /** Ожидаемый урон приёма по герою сейчас. */
  expected: number;
}

/**
 * Ожидаемый урон приёма врага по герою прямо сейчас: среднее от броска, ожидание крита,
 * шанс попасть и все защиты героя. Без бросков и побочных эффектов.
 */
export function enemyMoveBreakdown(b: BattleState, move: EnemyMove): EnemyMoveBreakdown {
  const shape = ENEMY_MOVE_SHAPE[move];
  if (!shape) return { hits: 0, hitChance: 0, hitMisses: [], blocked: null, lines: [], expected: 0 };
  const e = b.enemy;
  const isStrike = STRIKE_MOVES.includes(move);
  const strike = shape.kind === "phys";
  const ignore = !!shape.ignoreDefense;
  const hits = shape.hits ?? 1;
  const avg = Math.round((e.atk[0] + e.atk[1]) / 2);
  const lines: DamageLine[] = [{ label: "Базовый удар врага", value: avg, note: `${e.atk[0]}–${e.atk[1]}` }];
  const effects = enemyEffectSteps(b, avg);
  lines.push(...effects.lines);
  let base = effects.value;
  const tech = enemyTechniqueBonus(b, move);
  if (tech > 0) {
    base += tech;
    lines.push({ label: "Ум врага", value: base, note: `+${tech}` });
  }
  const c = enemyCritChance(b);
  if (c > 0) {
    const critMult = enemyCritMult(b);
    base = base * (1 - c) + base * critMult * c;
    lines.push({ label: "Критический удар (среднее)", value: base, note: `${pctText(c)} ×${critMult.toFixed(2)}` });
  }
  const moveSteps = enemyMoveSteps(b, move, isStrike, base);
  lines.push(...moveSteps.lines);
  base = moveSteps.value;
  if (shape.mult !== 1) lines.push({ label: "Сила приёма", value: base * shape.mult, note: `×${shape.mult}` });
  const chill = enemyChill(b);
  const raw = Math.round(base * shape.mult * chill);
  if (chill !== 1) lines.push({ label: "Ослаблен врагом, удар до защит", value: raw, note: `×${chill.toFixed(2)}` });
  else lines.push({ label: "Удар до защит", value: raw });
  const hit = playerHitParts(b, shape.kind, strike, ignore);
  const defense = playerDefenseLines(b, raw, shape.kind, strike, ignore);
  lines.push(...defense);
  const d = defense[defense.length - 1].value;
  let expected = 0;
  if (hit.chance > 0) {
    /* Второй удар приходит, только если первый попал. */
    let reach = 1;
    for (let i = 0; i < hits; i++) {
      reach *= hit.chance;
      expected += reach * d;
    }
  }
  return { hits, hitChance: hit.chance, hitMisses: hit.misses, blocked: hit.blocked, lines, expected };
}

export function enemyExpectedMoveDamage(b: BattleState, move: EnemyMove): number {
  return enemyMoveBreakdown(b, move).expected;
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

/** Подробности наложения: шанс за приём и что именно делает, с числами. */
export interface EnemyMoveEffectDetail extends EnemyMoveEffect {
  /** Шанс за приём: попадание, стойкость героя и доля наложения. 0 — не накладывается. */
  chance: number;
  lines: string[];
}

/** Склонение слова «раунд» для числа. */
function roundsText(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  let word = "раундов";
  if (m10 === 1 && m100 !== 11) word = "раунд";
  else if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) word = "раунда";
  return `${n} ${word}`;
}

/** Какие эффекты приём накладывает на героя, с шансом и числами. Повторяет ветки хода врага, чтобы подсказка совпадала с боем. */
export function enemyMoveEffectDetails(b: BattleState, move: EnemyMove): EnemyMoveEffectDetail[] {
  const e = b.enemy;
  const out: EnemyMoveEffectDetail[] = [];
  const isStrike = STRIKE_MOVES.includes(move);
  const landP = enemyMoveLandChance(b, move);
  const resisted = landP * (1 - playerResistChance(b));
  const span = (kind: DotKind, skill: boolean) => dotTickSpan(kind, e.level, skill);
  const add = (id: EnemyMoveEffectId, half: boolean, chance: number, lines: string[], immune?: ImmunityEffect) => {
    if (immune && playerImmune(b, immune)) {
      out.push({ id, half, chance: 0, lines: [`Иммунитет: ${IMMUNITY_NAMES[immune]} не накладывается.`] });
      return;
    }
    out.push({ id, half, chance, lines });
  };
  const dotLine = (name: string, rounds: number, [lo, hi]: [number, number]) =>
    `${name}: ${roundsText(rounds)}; −${lo}–${hi} ОЗ в раунд за каждое наложение, до ${MAX_DOT_STACKS} наложений.`;
  const burnLine = (rounds: number, [lo, hi]: [number, number]) =>
    `Горение: ${roundsText(rounds)}; −${lo}–${hi} ОЗ в раунд, наложения не складываются.`;
  const fearLine =
    `Страх: ${roundsText(1)} (${roundsText(2)}, если твой ход в этом раунде уже прошёл). В свой ход ты в защите: атаки и приёмы закрыты. После приступа ${roundsText(FEAR_IMMUNE_ROUNDS)} без страха.`;

  /* Родовые наложения удара (как в applyRaceStrike): только при попадании обычным ударом. */
  if (isStrike) {
    const race = e.def.race;
    if (race === "vampire") {
      add("bleed", false, resisted, [dotLine("Кровотечение", 3, span("bleed", false))], "bleed");
    } else if (race === "ghost") {
      add("fear", false, resisted, [fearLine], "fear");
    } else if (race === "beast") {
      add("bleed", true, resisted * 0.5, [dotLine("Кровотечение", 3, span("bleed", false))], "bleed");
      add("poison", true, resisted * 0.5, [dotLine("Яд", 3, span("poison", false))], "poison");
    } else if (race === "demon") {
      add("burn", true, resisted * 0.5, [burnLine(statusRounds(b, 3), span("burn", false))], "burn");
      add("fear", true, resisted * 0.5, [fearLine], "fear");
    }
  }

  switch (move) {
    case "heavy":
      if (e.def.id === "husk") {
        const cur = b.p.statuses.rot ?? 0;
        add("sunder", false, landP, [
          `Гниение: броня −${nextRotStacks(cur)} на ${roundsText(ROT_ROUNDS)}; сейчас −${cur}; каждый удар добавляет слой, не больше ${ROT_MAX_STACKS}.`,
        ]);
      }
      break;
    case "wound":
      if (hasLeg(b, "titan_heart")) {
        out.push({ id: "bleed", half: false, chance: 0, lines: ["Не действует: «Сердце титана» не даёт кровотечению закрепиться."] });
      } else {
        add("bleed", false, resisted, [dotLine("Кровотечение", 3, span("bleed", true))], "bleed");
      }
      break;
    case "poison":
      if (hasLeg(b, "titan_heart")) {
        out.push({ id: "poison", half: false, chance: 0, lines: ["Не действует: «Сердце титана» выжигает яд на лету."] });
      } else {
        add("poison", false, resisted, [dotLine("Яд", 3, span("poison", true))], "poison");
      }
      break;
    case "sunder":
      add("sunder", false, landP, [`Раскол брони: броня −${enemySunderBreak(e.level)} до конца боя; всего не больше −8.`], "sunder");
      break;
    case "curse": {
      const magic = heroChance(b, b.p.chanceLayers.magicResist);
      const [lo, hi] = span("curse", true);
      const power = Math.max(b.p.statuses.cursePower ?? 0, 30);
      add("curse", false, resisted, [
        `Проклятие: ${roundsText(3)}; твой урон снижен на ${power}%; −${magicTickFrom(lo, magic)}–${magicTickFrom(hi, magic)} ОЗ в раунд с учётом сопротивления магии.`,
      ], "curse");
      break;
    }
    case "bell_stun":
      add("stun", false, resisted, ["Оглушение: −1 ход в следующем раунде."], "stun");
      break;
    case "terror":
      add("fear", false, resisted, [fearLine], "fear");
      break;
    case "hell_force":
      add("burn", false, resisted, [burnLine(statusRounds(b, 4), span("burn", true))], "burn");
      break;
    case "cold_touch":
      add("noHeal", false, landP, [`Запрет лечения: ${roundsText(2)}; зелья и приёмы лечения не работают. Пробивает броню и сопротивление.`], "noHeal");
      break;
    case "intimidate":
      add("sealAttack", false, 1, ["Печать оков: обычная атака запрещена в твой следующий ход."], "sealAttack");
      add("sealSkills", false, 1, ["Печать забвения: приёмы запрещены в твой следующий ход."], "sealSkills");
      break;
    case "darkness":
      add("darkness", false, 1, [`Мрак: ${roundsText(1)}; половина твоих атак уходит в пустоту.`], "darkness");
      break;
    case "seal_items":
      add("sealItems", false, 1, [`Немота: ${roundsText(MUTE_ROUNDS)}; свитки, магические приёмы и спец-приём запрещены.`], "sealItems");
      break;
    case "seal_skills":
      add("sealSkills", false, 1, ["Печать забвения: приёмы запрещены в твой следующий ход."], "sealSkills");
      break;
    case "seal_attack":
      add("sealAttack", false, 1, ["Печать оков: обычная атака запрещена в твой следующий ход."], "sealAttack");
      break;
    default:
      break;
  }
  return out;
}

/** Шанс, что приём вообще доходит до наложения: все удары приёма попали. Приёмы без удара — 1. */
function enemyMoveLandChance(b: BattleState, move: EnemyMove): number {
  const shape = ENEMY_MOVE_SHAPE[move];
  if (!shape) return 1;
  return playerHitParts(b, shape.kind, shape.kind === "phys", !!shape.ignoreDefense).chance ** (shape.hits ?? 1);
}

/** Наложения приёма врага без подробностей: id и половина шанса для значка. */
export function enemyMoveEffects(b: BattleState, move: EnemyMove): EnemyMoveEffect[] {
  return enemyMoveEffectDetails(b, move).map(({ id, half }) => ({ id, half }));
}

/** Особенности приёма, которые не являются значками: слабость, вампиризм, оглушение от свойств врага. */
export function enemyMoveNotes(b: BattleState, move: EnemyMove): string[] {
  const e = b.enemy;
  const notes: string[] = [];
  const landP = enemyMoveLandChance(b, move);
  const race = e.def.race;
  if (STRIKE_MOVES.includes(move) && raceWeakens(race)) {
    notes.push(`Слабость (${pctText(landP)}): +1 слой за попадание, твой урон от атак −${Math.round(WEAKNESS_STEP * 100)}% за слой до конца боя.`);
  }
  if (race === "vampire" && ENEMY_MOVE_SHAPE[move]) {
    notes.push(`Вампиризм (${pctText(landP)}): при попадании враг восстанавливает четверть своего удара.`);
  }
  const eStun = eChance(b, "stun_chance");
  if (eStun > 0) notes.push(`Оглушение от свойства врага (${pctText(eStun)}): −1 ход в следующем раунде.`);
  return notes;
}

export interface EnemyMoveView {
  move: EnemyMove;
  /** Ожидаемый урон приёма по герою сейчас; 0 — приём без урона. */
  damage: number;
  effects: EnemyMoveEffect[];
  /** Раунды до снятия перезарядки; 0 — приём доступен. */
  cooldown: number;
  /** Подсчёт урона по шагам. */
  breakdown: EnemyMoveBreakdown;
  /** Наложения с шансом и числами. */
  details: EnemyMoveEffectDetail[];
  /** Особенности приёма. */
  notes: string[];
}

/** Параметры врага для сводки и списка приёмов: всё считается теми же функциями, что и бой. */
export interface EnemyReadout {
  /** Характеристики СИЛ/ЛОВ/ИНТ врага. */
  stats: MonsterStats;
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
  const effectResist = combineChances([monsterTenacity(enemyStats(b).str), depleted ? 0 : eChance(b, "resist")]);
  const resist = 1 - (1 - raceEffectResist(e.def.race)) * (1 - (b.isBoss ? BOSS_EFFECT_RESIST : 0)) * (1 - effectResist);
  const effectFortify = depleted ? 0 : eChance(b, "fortify");
  const fortify = 1 - (1 - raceFortify(e.def.race)) * (1 - effectFortify);
  const magicResist = enemyMagicResist(b, true);
  const list = [...new Set(e.moves.length ? e.moves : e.def.moves)];
  return {
    armorBase: enemyArmorNow({ ...e, guard: false }),
    armor: enemyArmorNow(e),
    guard: e.guard,
    evade: enemyEvade(b),
    stats: enemyStats(b),
    resist,
    fortify,
    magicResist,
    ap: e.ap,
    moves: list.map((move) => {
      const breakdown = enemyMoveBreakdown(b, move);
      const details = enemyMoveEffectDetails(b, move);
      return {
        move,
        damage: Math.round(breakdown.expected),
        effects: details.map(({ id, half }) => ({ id, half })),
        cooldown: enemyMoveCooldownLeft(b, move),
        breakdown,
        details,
        notes: enemyMoveNotes(b, move),
      };
    }),
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
  /* Ледяная клеть (Стужа B): обморожение 3+ раунда — враг пропускает ход с шансом 20%. */
  if (e.statuses.chill >= 3 && hasPassive(b, "skill_frost_b") && Math.random() < 0.2) {
    push(b, `${e.def.name} скован ледяной клетью и пропускает ход.`, "p");
    advance(b);
    return b;
  }
  /* Целебный дождь: один ход врага пропущен. */
  if ((e.statuses.skipTurn ?? 0) > 0) {
    e.statuses.skipTurn = 0;
    push(b, `${e.def.name} не может действовать: Целебный дождь держит его.`, "p");
    advance(b);
    return b;
  }
  /* Обманка: на один ход — с шансом 20% удар героя вдвое слабее атаки и ход врага окончен. */
  if ((e.statuses.feint ?? 0) > 0) {
    e.statuses.feint = 0;
    if (Math.random() < 0.2) {
      const { d: fd } = calcWeaponRoll(b, 0.5);
      push(b, `Обманка: ${e.def.name} ловится на ложный замах.`, "p");
      hitEnemy(b, fd, "phys", " [Обманка]");
      if (!finishIfEnemyDead(b)) advance(b);
      return b;
    }
  }
  /* Размах: удар врага в начале его хода по герою, 3×М(СИЛ). */
  if ((e.statuses.swingDmg ?? 0) > 0) {
    const swing = e.statuses.swingDmg ?? 0;
    e.statuses.swingDmg = 0;
    push(b, `${e.def.name} отвечает ударом Размаха.`, "e");
    incoming(b, swing, "phys", `${e.def.name} бьёт Размахом`);
    if (b.over) return b;
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
  const move0 = e.announced ?? chooseEnemyMove(b);
  /* Крушение и Бросок: защиты нет — вместо неё обычный удар. */
  const move = move0 === "guard" && ((e.statuses.noGuard ?? 0) > 0 || (e.statuses.throwDown ?? 0) > 0) ? "attack" : move0;
  e.announced = null;
  armEnemyCooldown(b, move);
  const isStrikeMove = STRIKE_MOVES.includes(move);
  /* Промах запоминается только на один ход: после решения флаг снимаем. */
  e.lastMiss = false;
  /* Базовый удар — обычный параметр; усиления от эффектов при истощении не работают. */
  let base = enemyEffectDamage(b, randInt(e.atk[0], e.atk[1]));
  base += enemyTechniqueBonus(b, move);
  const eCritChance = enemyCritChance(b);
  if (eCritChance > 0 && Math.random() < eCritChance) {
    base = Math.round(base * enemyCritMult(b));
    push(b, `${e.def.name} наносит критический удар!`, "e");
  }
  base = enemyMoveDamage(b, move, isStrikeMove, base);
  /* Выброс: обморожение и проклятие −10% каждое. */
  if ((e.statuses.eruptDown ?? 0) > 0) base = Math.round(base * (1 - (e.statuses.eruptDown ?? 0)));
  /* Бросок: физические удары врага вдвое слабее до конца его хода. */
  if ((e.statuses.throwDown ?? 0) > 0 && isStrikeMove) base = Math.round(base / 2);
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
      if (landed && b.p.hp > 0) {
        b.p.statuses.beat = Math.max(b.p.statuses.beat, BEAT_ROUNDS);
        push(b, `Побои: урон по тебе +20% на ${BEAT_ROUNDS} раунда.`, "e");
      }
      /* Гнилой ходок: тяжёлый удар снимает слой брони на два раунда. */
      if (e.def.id === "husk" && b.p.hp > 0) {
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
        b.p.statuses.drain = Math.max(b.p.statuses.drain, DRAIN_ROUNDS);
        push(b, `Иссушение: ${DRAIN_ROUNDS} раунда, герой теряет долю ОЗ, враг лечится.`, "e");
      }
      break;
    }
    case "sunder": {
      const landed = incoming(b, Math.round(base * 1.15 * chill), "phys", `${e.def.name} бьёт по швам доспеха`);
      if (!landed) e.lastMiss = true;
      if (landed && b.p.hp > 0) {
        b.p.statuses.shatter = Math.max(b.p.statuses.shatter, SHATTER_ROUNDS);
        push(b, `Разрушение: укрепление, магическое сопротивление и стойкость −25% на ${SHATTER_ROUNDS} раунда.`, "e");
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
      b.p.statuses.weaken = Math.max(b.p.statuses.weaken, WEAKEN_ROUNDS);
      push(b, `Ослабление: урон от характеристик −25% на ${WEAKEN_ROUNDS} раунда.`, "e");
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
        b.p.statuses.slow = Math.max(b.p.statuses.slow, SLOW_ROUNDS);
        push(b, `Замедление: −1 ход в раунде на ${SLOW_ROUNDS} раунда.`, "e");
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
        b.p.statuses.sealItems = MUTE_ROUNDS;
        push(b, `${e.def.name} накладывает Немоту: свитки, магические приёмы и спец-приём запрещены на ${MUTE_ROUNDS} раунда.`, "e");
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
  /** Выносливость сейчас и на раунд. */
  stamina: number;
  staminaMax: number;
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
  const strFlat = Math.round(statDamage(st.str, b.p.passives) * weakMult(b)) + (b.p.weaponAgi ? st.agi * weakMult(b) : 0);
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
  const missingBonus = gearRageBonus + ((b.p.stats.str * effectPower(b, "might")) / 100) * weakMult(b) +
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
    0;
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
    } else if (NO_ATTACK_EFFECTS.has(techSkill.effect ?? "") && !DIRECT_DAMAGE_EFFECTS.has(techSkill.effect ?? "")) {
      /* Приём без удара (Подготовка, Пузырь, Целебный дождь и т. п.): урона в превью нет. */
      techMin = null;
      techMax = null;
    } else if (DIRECT_DAMAGE_EFFECTS.has(techSkill.effect ?? "")) {
      /* Прямой магический урон приёма, без броска оружия: как в бою — усиление магии, потом защита врага. */
      const tech = techniqueBonusNow(b, techSkill);
      const raw = techSkill.effect === "eruption" ? 40 : techSkill.effect === "life_draw" ? 10 + tech : 25 + tech;
      const boosted = Math.round(raw * magicMultNow(b));
      techMin = damageAfterEnemyDefense(b, boosted, "magic");
      techMax = techMin;
    } else {
      const magicHit = !!techSkill.magic || techSkill.effect === "pierce" || techSkill.effect === "chill" || techSkill.effect === "leech" || techSkill.effect === "skill_leech";
      const kind = magicHit ? "magic" : "phys";
      const tech = techniqueBonusNow(b, techSkill);
      const skillM = skillDamageMult(b);
      /* Тень за спиной бьёт сквозь броню: превью считает так же, как удар в бою. */
      const savedIgnore = b.p.statuses.ignoreArmorNow;
      if (techSkill.effect === "shadow_behind") b.p.statuses.ignoreArmorNow = 1;
      techMin = damageAfterEnemyDefense(b, Math.max(1, Math.round((baseMin + totalFlat + tech) * totalMult * skillM)), kind);
      techMax = damageAfterEnemyDefense(b, Math.max(1, Math.round((baseMax + totalFlat + tech) * totalMult * skillM)), kind);
      b.p.statuses.ignoreArmorNow = savedIgnore;
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
    defMods.push({ id: "guard", label: "Защита", good: true, detail: "Броня +10 до твоего следующего хода." });
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
    defMods.push({ id: "sealItems", label: "Немота", good: false, rounds: b.p.statuses.sealItems, detail: "Расходники запрещены в этот ход." });
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
  const stamina = b.p.stamina;
  const staminaMax = b.p.staminaMax;
  const ap = Math.max(1, apBase + (haste > 0 ? 1 : 0) + b.p.statuses.shadowStep);

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
    magicResist: heroChance(b, b.p.chanceLayers.magicResist),
    fortify: heroChance(b, b.p.chanceLayers.fortify),
    ap,
    apBase,
    stamina,
    staminaMax,
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
