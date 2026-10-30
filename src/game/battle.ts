import {
  BOSSES,
  ENEMIES,
  ENEMY_PASSIVES,
  EPIC_SKILLS,
  GEAR_BASES,
  ITEMS,
  REAGENTS,
  THREAT_META,
  consumableIntReq,
  consumablePower,
  createGearItem,
  isImmuneTo,
  pick,
  randInt,
  rollEnemyLoot,
  rollMonsterLevel,
  rollThreat,
  scaledGearStats,

  type EnemyDef,
  type EnemyMove,
  type EpicSkillDef,
  type WeaponSkillDef,
} from "./content";
import { SLOT_ORDER } from "./types";
import type { ArchetypeId } from "./archetypes";
import type { GearEffectId, GearPassiveId } from "./gearEffects";
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
  isBoss: boolean;
  enemy: {
    def: EnemyDef;
    /** Уровень монстра: этаж −1 … этаж +1 */
    level: number;
    /** Угроза: обычный, ужас, катастрофа */
    threat: Threat;
    /** Пассивный эффект врага (у катастроф и боссов) */
    passive: EnemyPassive | null;
    /** Набор приёмов с учётом угрозы */
    moves: EnemyMove[];
    hp: number;
    maxHp: number;
    ap: number;
    atk: [number, number];
    armor: number;
    gold: [number, number];
    xp: number;
    statuses: { chill: number; bleed: number; poison: number; fear: number; stunAp: number };
    guard: boolean;
    /** Раунды, в которые враг вынужден держать защиту (свиток ужаса, бомба). */
    forceGuard: number;
  };
  p: {
    hp: number;
    maxHp: number;
    armor: number;
    evade: number;
    ap: number;
    stats: Record<StatKey, number>;
    passives: string[];
    hit: [number, number];
    /** Базовый шанс крита до бонусов от редких вещей (для ведомости). */
    critChance: number;
    weaponName: string;
    weaponSkill: WeaponSkillDef | null;
    weaponCd: number;
    epicSkills: EpicSkillDef[];
    epicCds: Record<string, number>;
    rareAffixes: RareAffixId[];
    legendaryPassives: LegendaryPassiveId[];
    gearEffects: GearEffectId[];
    gearPassives: GearPassiveId[];
    archetype: ArchetypeId | null;
    gearHands: 1 | 2;
    gearArchetype: ArchetypeId | null;
    intDiscount: number;
    immortalUsed: boolean;
    statuses: {
      wound: number;
      curse: number;
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
  archetype: ArchetypeId | null;
  gearHands: 1 | 2;
  gearArchetype: ArchetypeId | null;
  intDiscount: number;
  critChance: number;
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
      gearHands = (GEAR_BASES[g.baseId]?.hands ?? 1) === 2 ? 2 : 1;
      gearArchetype = GEAR_BASES[g.baseId]?.archetype ?? null;
    }
    if (!g.identified) continue;
    if (g.effects) gearEffects.push(...g.effects);
    if (g.passive) gearPassives.push(g.passive);
    if (g.rareAffix) rareAffixes.push(g.rareAffix);
    if (g.epicSkill && !epicSkills.some((e) => e.id === g.epicSkill)) {
      epicSkills.push(EPIC_SKILLS[g.epicSkill]);
    }
    if (g.legendaryPassive) legendaryPassives.push(g.legendaryPassive);
  }

  const hasPassive = (id: string) => pl.passives.includes(id);
  const mightCount = rareAffixes.filter((x) => x === "might").length;
  const swiftCount = rareAffixes.filter((x) => x === "swift").length;
  const titanCount = legendaryPassives.filter((x) => x === "titan_heart").length;
  const timeCount = legendaryPassives.filter((x) => x === "time_weaver").length;

  const strFlat = Math.floor(pl.stats.str * 0.8);
  const maxHp =
    24 + pl.stats.str * 6 + hpBonus + (hasPassive("iron_will") ? 22 : 0) + mightCount * 10 + titanCount * 24;

  const ap = 2 + Math.floor(pl.stats.agi / 2) + timeCount + gearEffects.filter((x) => x === "ap").length;
  const armor = Math.max(0, armorBonus) + titanCount * 2;
  const evade = Math.min(
    0.65,
    Math.max(0, evadeBonus) +
      (hasPassive("shadow_dance") ? 0.15 : 0) +
      swiftCount * 0.08 +
      gearEffects.filter((x) => x === "evade").length * 0.03 +
      (gearPassives.includes("ninja_phantom") ? 0.10 : 0) +
      (pl.passives.includes("arch_ninja_10") ? 0.15 : 0),
  );
  const hit: [number, number] = hitLo > 0 ? [hitLo, hitHi] : [2, 4];
  const critChance = (hasPassive("saboteur") ? 0.2 : 0) + rareAffixes.filter((x) => x === "crit").length * 0.15 +
    gearEffects.filter((x) => x === "crit_chance").length * 0.05 +
    (gearPassives.includes("precision") ? 0.25 : 0);
  const intDiscount = (hasPassive("scribe") ? 1 : 0) + (legendaryPassives.includes("archmage_blood") ? 1 : 0);

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
    archetype: pl.archetype ?? null,
    gearHands,
    gearArchetype,
    intDiscount,
    critChance,
    hpBonus,
    armorBonus,
    evadeBonus,
    strFlat,
  };
}

/* ─────────── очередь ходов: у кого больше — тот всегда раньше ─────────── */
export function buildQueue(apP: number, apE: number): ("p" | "e")[] {
  let a = Math.max(1, apP);
  let c = Math.max(1, apE);
  const out: ("p" | "e")[] = [];
  let last: "p" | "e" | null = null;
  while (a > 0 || c > 0) {
    let s: "p" | "e";
    if (a === 0) s = "e";
    else if (c === 0) s = "p";
    else if (a > c) s = "p";
    else if (c > a) s = "e";
    else s = last === "p" ? "e" : "p";
    if (s === "p") a--;
    else c--;
    out.push(s);
    last = s;
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
  passive: EnemyPassive | null;
  moves: EnemyMove[];
  hp: number;
  ap: number;
  atk: [number, number];
  armor: number;
  gold: [number, number];
  xp: number;
}

const SPECIAL_MOVES: EnemyMove[] = ["wound", "curse", "drain", "sunder", "bell_stun"];

/** Спавн монстра: уровень (этаж ±1, на первом этаже возможен 0), угроза (80/15/5). */
export function spawnEnemy(floor: number, isBoss = false, rng: () => number = Math.random): SpawnedEnemy {
  const def = isBoss ? rollBoss(floor) : rollEnemy(floor, rng);
  const threat: Threat = isBoss ? "catastrophe" : rollThreat(rng);
  const level = isBoss ? floor : rollMonsterLevel(floor, rng);
  const meta = THREAT_META[threat];

  // Сила зависит от абсолютного уровня, а не от «этажа появления» вида.
  // Уровень 0 заметно слабее первого, но не превращается в нулевую угрозу.
  const levelFactor = level - 1;
  const hpMult = Math.max(0.7, 1 + 0.18 * levelFactor) * (isBoss ? 1.1 : meta.hpMult);
  const atkMult = Math.max(0.75, 1 + 0.14 * levelFactor) * (isBoss ? 1 : meta.atkMult);

  const moves: EnemyMove[] = [...def.moves];
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

  return {
    def,
    level,
    threat,
    passive,
    moves,
    hp: Math.max(1, Math.round(def.hp * hpMult)),
    ap: Math.min(7, def.ap + Math.floor(level / 4) + apBonus),
    atk: [
      Math.max(1, Math.round(def.atk[0] * atkMult)),
      Math.max(2, Math.round(def.atk[1] * atkMult)),
    ],
    armor: def.armor + Math.floor(level / 4),
    gold: [
      Math.round(def.gold[0] * (1 + (floor - 1) * 0.5)),
      Math.round(def.gold[1] * (1 + (floor - 1) * 0.5)),
    ],
    xp: Math.max(1, Math.round(def.xp * Math.max(0.8, 1 + 0.12 * levelFactor) * threatXp)),
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
    ["powder", 9],
    ["cloth", 8],
    ["root", 9],
    ["herb", 9],
    ["silk", floor >= 2 ? 6 : 3],
    ["fang", floor >= 2 ? 6 : 3],
    ["gland", 4],
    ["ember", floor >= 3 ? 5 : 2],
  ];
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

export function rollGearDrop(floor: number, guaranteedRarePlus = false): GearItem {
  const pool = Object.values(GEAR_BASES).filter((g) => g.minFloor <= floor + 1);
  const base = pick(pool.length ? pool : Object.values(GEAR_BASES));
  let rarity: GearItem["rarity"] | undefined;
  if (guaranteedRarePlus) {
    const r = Math.random();
    if (r < 0.22 + floor * 0.04) rarity = "legendary";
    else if (r < 0.62) rarity = "epic";
    else rarity = "rare";
  }
  return createGearItem({
    baseId: base.id,
    floor,
    rarity,
    identified: false,
  });
}

function clone(b: BattleState): BattleState {
  return {
    ...b,
    enemy: { ...b.enemy, statuses: { ...b.enemy.statuses }, moves: [...b.enemy.moves] },
    p: {
      ...b.p,
      epicCds: { ...b.p.epicCds },
      gearEffects: [...b.p.gearEffects],
      gearPassives: [...b.p.gearPassives],
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

export function newBattle(pl: Player, floor: number, isBoss = false): BattleState {
  const d = derived(pl);
  const s = spawnEnemy(floor, isBoss);
  const def = s.def;
  const firstRoundAp = d.ap +
    (pl.passives.includes("first_blood") ? 1 : 0) +
    (pl.passives.includes("arch_assassin_5") ? 1 : 0) +
    (d.gearPassives.includes("assassin_shadow") ? 1 : 0);

  const b: BattleState = {
    floor,
    isBoss,
    enemy: {
      def,
      level: s.level,
      threat: s.threat,
      passive: s.passive,
      moves: s.moves,
      hp: s.hp,
      maxHp: s.hp,
      ap: s.ap,
      atk: s.atk,
      armor: s.armor,
      gold: s.gold,
      xp: s.xp,
      statuses: { chill: 0, bleed: 0, poison: 0, fear: 0, stunAp: 0 },
      guard: false,
      forceGuard: 0,
    },
    p: {
      hp: Math.max(1, pl.hp),
      maxHp: d.maxHp,
      armor: d.armor,
      evade: d.evade,
      ap: d.ap,
      stats: { ...pl.stats },
      passives: [...pl.passives],
      hit: d.hit,
      critChance: d.critChance,
      weaponName: d.weaponName,
      weaponSkill: d.weaponSkill,
      weaponCd: 0,
      epicSkills: d.epicSkills,
      epicCds: {},
      rareAffixes: d.rareAffixes,
      legendaryPassives: d.legendaryPassives,
      gearEffects: d.gearEffects,
      gearPassives: d.gearPassives,
      archetype: d.archetype,
      gearHands: d.gearHands,
      gearArchetype: d.gearArchetype,
      intDiscount: d.intDiscount,
      immortalUsed: false,
      statuses: {
        wound: pl.statuses.wound,
        curse: pl.statuses.curse,
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

  const threatName = THREAT_META[s.threat].name;
  if (isBoss) {
    push(b, `СТРАЖ ЛЕСТНИЦЫ: ${def.name} преграждает спуск! Ходов у него: ${s.ap}.`, "sys");
  } else {
    push(b, `${def.name} выходит из темноты. Уровень ${s.level}, угроза: ${threatName}. Ходов: ${s.ap}.`, "sys");
  }
  if (s.passive) {
    push(b, `Пассивный эффект: ${s.passive.name} — ${s.passive.desc}`, "sys");
  }
  return b;
}

const hasPassive = (b: BattleState, id: string) => b.p.passives.includes(id);
const countRare = (b: BattleState, id: RareAffixId) => b.p.rareAffixes.filter((x) => x === id).length;
const hasLeg = (b: BattleState, id: LegendaryPassiveId) => b.p.legendaryPassives.includes(id);
const countEffect = (b: BattleState, id: GearEffectId) => b.p.gearEffects.filter((x) => x === id).length;
const hasGearPassive = (b: BattleState, id: GearPassiveId) => b.p.gearPassives.includes(id);

function missingHpRatio(b: BattleState) {
  return Math.max(0, 1 - b.p.hp / Math.max(1, b.p.maxHp));
}
function enemyMissingRatio(b: BattleState) {
  return Math.max(0, 1 - b.enemy.hp / Math.max(1, b.enemy.maxHp));
}
function enemyDebuffCount(b: BattleState) {
  const s = b.enemy.statuses;
  return (s.chill > 0 ? 1 : 0) + (s.bleed > 0 ? 1 : 0) + (s.poison > 0 ? 1 : 0) + (s.fear > 0 ? 1 : 0) + (s.stunAp > 0 ? 1 : 0);
}
function skillCd(b: BattleState, base: number) {
  const reduction = countEffect(b, "skill_cd") + (hasPassive(b, "arch_warlock_5") ? 1 : 0) + (hasGearPassive(b, "warlock_pact") ? 1 : 0);
  return Math.max(1, base - reduction);
}
function skillScaleBonus(b: BattleState) {
  return countEffect(b, "skill_scale") * 0.3 + (hasPassive(b, "arch_warlock_10") ? 0.8 : 0);
}
function skillDamageMult(b: BattleState) {
  return 1 + countEffect(b, "skill_damage") * 0.12 + (hasGearPassive(b, "warlock_pact") ? 0.25 : 0) +
    (hasPassive(b, "arch_warlock_5") ? 0.20 : 0) + (b.p.statuses.pactElixir > 0 ? 0.25 : 0);
}
function statusRounds(b: BattleState, base: number) {
  return base + countEffect(b, "status_duration") + (hasGearPassive(b, "time_warp") ? 2 : 0) +
    (hasPassive(b, "arch_warlock_10") ? 2 : 0);
}
function playerResistChance(b: BattleState) {
  return Math.min(0.85, b.p.stats.str * 0.06 + countEffect(b, "resist") * 0.10 +
    (hasPassive(b, "arch_bulwark_5") ? 0.15 : 0) +
    (hasPassive(b, "arch_barbarian_5") ? 0.10 : 0));
}
function tryResist(b: BattleState, label: string) {
  if (Math.random() < playerResistChance(b)) {
    push(b, `Стойкость отражает ${label}.`, "p");
    return true;
  }
  return false;
}
function applyEnemyStatus(b: BattleState, key: "chill" | "bleed" | "poison" | "fear", rounds: number) {
  if ((key === "poison" || key === "fear") && isImmuneTo(b.enemy.def.type, key)) {
    push(b, `${b.enemy.def.name} невосприимчив к этому эффекту.`, "sys");
    return;
  }
  b.enemy.statuses[key] = Math.max(b.enemy.statuses[key], statusRounds(b, rounds));
}
function grantDodgeAction(b: BattleState) {
  const chance = countEffect(b, "dodge_action") * 0.10 + (hasGearPassive(b, "ninja_phantom") ? 0.25 : 0);
  if (hasPassive(b, "arch_ninja_10")) {
    b.p.statuses.shadowStep += 1;
    push(b, "Пустое тело: уклонение открывает +1 ход в следующем раунде.", "p");
  } else if (chance > 0 && Math.random() < chance) {
    b.p.statuses.shadowStep += 1;
    push(b, "Шаг в тень: в следующем раунде +1 ход.", "p");
  }
}

function calcWeaponRoll(b: BattleState, mult = 1, bonusFlat = 0, opts: { skill?: boolean; forceCrit?: boolean } = {}) {
  const [lo, hi] = b.p.hit;
  let d = randInt(lo, hi) + Math.floor(b.p.stats.str * 0.8) + bonusFlat;

  /* Пассивное раскрытие техники оружия при достаточном Интеллекте */
  const ws = b.p.weaponSkill;
  if (ws && b.p.stats.int >= Math.max(1, ws.intReq - b.p.intDiscount)) {
    const statVal = b.p.stats[ws.scaleStat];
    d += Math.floor(statVal * (ws.scaleMult * 0.35));
  }

  if (hasPassive(b, "heavy_hand")) d += 3;
  d += countRare(b, "might") * 3;

  let damageMult = 1;
  const missing = missingHpRatio(b);
  const enemyMissing = enemyMissingRatio(b);
  damageMult += countEffect(b, "missing_hp_damage") * Math.min(0.6, Math.floor(missing * 10) * 0.06);
  damageMult += countEffect(b, "enemy_missing_damage") * Math.min(0.6, Math.floor(enemyMissing * 10) * 0.06);
  if (hasPassive(b, "arch_barbarian_5")) {
    damageMult += Math.floor(missing * 10) * 0.04;
    if (b.p.gearHands === 2) damageMult += 0.25;
  }
  if (hasPassive(b, "arch_barbarian_10") && enemyMissing >= 0.5) damageMult += 0.35;
  if (hasGearPassive(b, "barbarian_rage") && b.p.hp < b.p.maxHp * 0.5) damageMult += 0.20;
  if (b.p.gearHands === 2) damageMult += countEffect(b, "two_hand_damage") * 0.15;
  const armorBonus = countEffect(b, "armor_damage") * 0.25 + (hasPassive(b, "arch_bulwark_10") ? 0.5 : 0);
  if (armorBonus > 0) d += Math.round(b.p.armor * armorBonus);
  if (b.round <= 2) {
    damageMult += countEffect(b, "first_strike") * 0.20;
    if (hasPassive(b, "arch_assassin_5")) damageMult += 0.0;
  }
  const debuffs = enemyDebuffCount(b);
  damageMult += countEffect(b, "debuff_damage") * Math.min(0.32, debuffs * 0.08);
  if (hasPassive(b, "arch_ninja_10")) damageMult += Math.min(0.4, debuffs * 0.10);
  if (opts.skill) damageMult *= skillDamageMult(b);

  d *= damageMult;
  if (b.p.statuses.rage > 0) d = Math.round(d * 1.5);
  if (b.p.statuses.curse > 0) d = Math.round(d * 0.7);
  if (hasPassive(b, "relentless") && b.p.hp < b.p.maxHp * 0.35) d = Math.round(d * 1.5);
  if (hasLeg(b, "executioner") && b.enemy.hp <= b.enemy.maxHp * 0.5) d = Math.round(d * 1.35);

  let critChance = b.p.critChance;
  if (b.round <= 2 && hasPassive(b, "arch_assassin_5")) critChance += 0.25;
  if (b.round <= 2 && hasGearPassive(b, "assassin_shadow")) critChance += 0.25;
  if (b.p.statuses.quickblade > 0) critChance += 0.25;
  let critMult = 2 + countEffect(b, "crit_mult") * 0.3;
  if (b.round <= 2 && hasPassive(b, "arch_assassin_5")) critMult += 0.5;
  if (b.round <= 2 && hasGearPassive(b, "assassin_shadow")) critMult += 0.5;
  if (b.p.statuses.quickblade > 0) critMult += 0.5;
  let crit = false;
  const forceCrit = opts.forceCrit || (!b.p.firstAttackDone && hasPassive(b, "arch_assassin_10"));
  if (forceCrit || (critChance > 0 && Math.random() < critChance)) {
    d *= critMult;
    crit = true;
  }
  return { d: Math.max(1, Math.round(d * mult)), crit };
}

function applyVamp(b: BattleState, dealt: number, extraRatio = 0, source: "weapon" | "skill" | "consumable" | "scroll" | "any" = "any") {
  let ratio = countRare(b, "vamp") * 0.2 + extraRatio;
  if (source === "weapon" || source === "skill" || source === "any") ratio += countEffect(b, "vamp") * 0.08;
  if (source === "weapon" || source === "skill") {
    ratio += countEffect(b, "vamp_str") * 0.08;
    if (b.p.statuses.bloodRage > 0) ratio += 0.15;
    if (hasPassive(b, "arch_barbarian_5")) ratio += 0.08;
    if (hasGearPassive(b, "barbarian_rage")) ratio += 0.12;
  }
  if (source === "skill") {
    ratio += countEffect(b, "skill_vamp") * 0.10;
    if (hasPassive(b, "arch_warlock_5")) ratio += 0.10;
    if (hasGearPassive(b, "warlock_pact")) ratio += 0.12;
  }
  if (source === "consumable") {
    ratio += countEffect(b, "consumable_vamp") * 0.08;
    if (hasPassive(b, "arch_ninja_5")) ratio += 0.08;
    if (hasGearPassive(b, "ninja_phantom")) ratio += 0.12;
  }
  if (source === "scroll") {
    ratio += countEffect(b, "scroll_vamp") * 0.10;
    if (hasPassive(b, "arch_sage_5")) ratio += 0.08;
  }
  if (ratio <= 0 || dealt <= 0) return;
  const heal = Math.max(1, Math.round(dealt * ratio));
  b.p.hp = Math.min(b.p.maxHp, b.p.hp + heal);
  push(b, `Похищение жизни: +${heal} здоровья.`, "p");
}

function hitEnemy(
  b: BattleState,
  raw: number,
  kind: "phys" | "magic" | "true",
  note = "",
): number {
  let d = raw;
  if (hasLeg(b, "executioner") && kind !== "phys" && b.enemy.hp <= b.enemy.maxHp * 0.5) {
    d = Math.round(d * 1.35);
  }
  if (kind === "phys") {
    const pierce = countRare(b, "pierce") * 2;
    const effArmor = Math.max(0, b.enemy.armor - pierce);
    d -= effArmor;
    if (b.enemy.passive?.id === "stone_hide") d = Math.round(d * 0.75);
  }
  if (b.enemy.guard) d = Math.floor(d / 2);
  d = Math.max(1, d);
  b.enemy.hp -= d;
  flash(b, "e", "hit", d);
  push(b, `${b.enemy.def.name} получает ${d} урона.${note}`, "p");
  return d;
}

/** false означает, что враг промахнулся: побочные эффекты атаки тоже не срабатывают. */
function incoming(b: BattleState, raw: number, kind: "phys" | "magic", src: string): boolean {
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
  if (Math.random() < b.p.evade) {
    flash(b, "p", "miss", 0);
    push(b, `Ты уходишь с линии удара — промах!`, "e");
    grantDodgeAction(b);
    return false;
  }
  let d = raw;
  const effArmor = Math.max(0, b.p.armor + b.p.statuses.tempArmor + (b.p.statuses.ironTonic > 0 ? 4 : 0) - b.p.statuses.sundered);
  if (kind === "phys") d -= effArmor;
  d -= countEffect(b, "damage_resist") * 2;
  if (b.p.statuses.stone > 0) d = Math.round(d * 0.7);
  if (b.p.guard) d = Math.floor(d / 2);
  let guardMult = 1;
  if (b.p.guard) {
    guardMult -= countEffect(b, "guard_bonus") * 0.15;
    if (hasPassive(b, "arch_bulwark_5")) guardMult -= 0.15;
    if (hasGearPassive(b, "bulwark_wall")) guardMult -= 0.20;
  }
  d = Math.round(d * Math.max(0.2, guardMult));
  if (hasGearPassive(b, "fortress")) d = Math.round(d * 0.8);
  d = Math.max(1, d);
  b.p.hp -= d;
  flash(b, "p", b.p.guard ? "guard" : "hit", d);
  push(b, `${src} — тебе ${d} урона.`, "e");

  // Ядовитый враг отравляет игрока физическим уроном.
  if (b.enemy.passive?.id === "venom" && kind === "phys" && b.p.hp > 0 && !tryResist(b, "яд")) {
    b.p.statuses.poison = Math.max(b.p.statuses.poison, 2);
    push(b, "Яд врага попал в кровь: отравление на 2 раунда.", "e");
  }

  /* Шипы */
  const thorns = countRare(b, "thorns") * 5 + countEffect(b, "thorns") * 4 +
    (hasGearPassive(b, "bulwark_wall") ? 6 : 0) +
    (hasPassive(b, "arch_bulwark_10") ? 6 : 0);
  if (thorns > 0 && b.enemy.hp > 0) {
    b.enemy.hp = Math.max(1, b.enemy.hp - thorns);
    push(b, `Шипы возвращают ${b.enemy.def.name} ${thorns} урона.`, "p");
  }

  /* Контратака / ответный выпад */
  const counterChance = countEffect(b, "counter") * 0.12 + (hasGearPassive(b, "dance") ? 0.25 : 0) +
    (hasPassive(b, "arch_assassin_10") ? 0.10 : 0);
  if (b.p.hp > 0 && b.enemy.hp > 0 && counterChance > 0 && Math.random() < counterChance) {
    const { d: cd } = calcWeaponRoll(b, 0.6);
    const dealt = hitEnemy(b, cd, "phys", " [Контратака]");
    applyVamp(b, dealt, 0, "weapon");
  }

  if (b.p.hp <= 0) {
    if (hasPassive(b, "arch_bulwark_10") && !b.p.immortalUsed) {
      b.p.immortalUsed = true;
      b.p.hp = 1;
      b.p.guard = true;
      flash(b, "p", "heal", 1);
      push(b, "Непробиваемый: смертельный удар оставил 1 ОЗ и включил Защиту!", "p");
      return true;
    }
    if (hasLeg(b, "immortal_pact") && !b.p.immortalUsed) {
      b.p.immortalUsed = true;
      b.p.hp = 18;
      b.p.guard = true;
      flash(b, "p", "heal", 18);
      push(b, "Печать бессмертия вспыхивает! Ты остаёшься на ногах с 18 ОЗ и в Защите.", "p");
      return true;
    }
    b.p.hp = 0;
    b.over = "lose";
  }
  return true;
}

function gainLoot(b: BattleState) {
  const e = b.enemy;
  if (b.isBoss) {
    // Боссы сохраняют прежний щедрый дроп: золото, припасы и гарантированный трофей.
    const gold = randInt(e.gold[0], e.gold[1]);
    const items = rollConsumableLoot(b.floor, 2);
    // Как и раньше: босс оставляет гарантированный трофей не ниже редкого качества.
    const gear: GearItem[] = [rollGearDrop(b.floor, true)];
    b.loot = { gold, items, gear, xp: e.xp };
    return;
  }

  // Обычный монстр: 30% ничего, 30% золото, 20% реагенты, 15% припасы, 5% снаряжение.
  const drop = rollEnemyLoot(e.level, b.floor, e.threat);
  b.loot = { gold: drop.gold, items: drop.items, gear: drop.gear, xp: e.xp };
}

function advance(b: BattleState) {
  if (b.over) return;
  const idx = b.idx + 1;
  if (idx >= b.queue.length) {
    /* конец раунда */
    if (b.p.statuses.wound > 0 && !hasLeg(b, "titan_heart")) {
      const d = 2 + b.floor;
      b.p.hp -= d;
      push(b, `Кровотечение отнимает ${d} здоровья.`, "sys");
    }
    if (b.enemy.statuses.bleed > 0 && b.enemy.hp > 0) {
      const ed = 4 + b.floor;
      b.enemy.hp -= ed;
      push(b, `${b.enemy.def.name} истекает кровью и пламенем: −${ed} ОЗ.`, "p");
    }
    if (b.enemy.statuses.poison > 0 && b.enemy.hp > 0) {
      const poisonDmg = 5 + b.floor;
      b.enemy.hp -= poisonDmg;
      push(b, `Яд разъедает ${b.enemy.def.name}: −${poisonDmg} ОЗ.`, "p");
    }
    if (b.p.statuses.poison > 0 && b.p.hp > 0) {
      const poisonDmg = 4 + b.floor;
      b.p.hp -= poisonDmg;
      push(b, `Яд в твоей крови отнимает ${poisonDmg} здоровья.`, "e");
    }
    if (b.enemy.passive?.id === "regen" && b.enemy.hp > 0 && b.enemy.hp < b.enemy.maxHp) {
      b.enemy.hp = Math.min(b.enemy.maxHp, b.enemy.hp + 4);
      push(b, `${b.enemy.def.name} затягивает раны (+4 ОЗ).`, "e");
    }

    const regen = (hasPassive(b, "iron_will") ? 3 : 0) + countRare(b, "regen") * 4 +
      countEffect(b, "regen") * 3 +
      (hasPassive(b, "arch_bulwark_5") ? 3 : 0) +
      (hasGearPassive(b, "bulwark_wall") ? 4 : 0) +
      (b.p.statuses.ironTonic > 0 ? 4 : 0);
    if (regen > 0 && b.p.hp > 0) {
      b.p.hp = Math.min(b.p.maxHp, b.p.hp + regen);
    }

    const prevCurse = b.p.statuses.curse;
    const prevRage = b.p.statuses.rage;
    const prevWound = b.p.statuses.wound;
    const prevPoison = b.p.statuses.poison;

    b.p.statuses.wound = Math.max(0, b.p.statuses.wound - 1);
    b.p.statuses.curse = Math.max(0, b.p.statuses.curse - 1);
    b.p.statuses.poison = Math.max(0, b.p.statuses.poison - 1);
    b.p.statuses.rage = Math.max(0, b.p.statuses.rage - 1);
    b.p.statuses.ironTonic = Math.max(0, b.p.statuses.ironTonic - 1);
    b.p.statuses.bloodRage = Math.max(0, b.p.statuses.bloodRage - 1);
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

    if (b.p.weaponCd > 0) b.p.weaponCd -= 1;
    for (const k of Object.keys(b.p.epicCds)) {
      if (b.p.epicCds[k] > 0) b.p.epicCds[k] -= 1;
    }

    b.round += 1;
    b.idx = 0;
    const hasteBonus = b.p.statuses.haste > 0 ? 1 : 0;
    const sageAp = hasPassive(b, "arch_sage_10") ? 1 : 0;
    const shadowAp = b.p.statuses.shadowStep;
    const pAp = Math.max(1, b.p.ap + hasteBonus + sageAp + shadowAp - b.p.statuses.stunAp);
    const eAp = Math.max(1, b.enemy.ap - b.enemy.statuses.stunAp);
    if (hasteBonus > 0) push(b, `Зелье скорости: в этом раунде у тебя +1 ход (осталось ${b.p.statuses.haste}).`, "p");
    if (shadowAp > 0) push(b, `Шаг в тень даёт +${shadowAp} ход в этом раунде.`, "p");
    if (sageAp > 0) push(b, "Библиотека душ: +1 ход в этом раунде.", "p");
    b.p.statuses.shadowStep = 0;
    b.p.statuses.stunAp = 0;
    b.enemy.statuses.stunAp = 0;
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
    return;
  }
  b.idx = idx;
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
    const amt = Math.round(power * mult);
    b.p.hp = Math.min(b.p.maxHp, b.p.hp + amt);
    push(b, `${def.name} сразу применяется: +${amt} здоровья.`, "p");
  } else if (def.use?.type === "chill") {
    const dealt = hitEnemy(b, Math.round(power * mult), "magic", ` [${def.name}, сотворён]`);
    applyEnemyStatus(b, "chill", 3);
    applyVamp(b, dealt, 0, "scroll");
  } else if (def.use?.type === "terror") {
    b.enemy.forceGuard = Math.max(b.enemy.forceGuard, 2);
    push(b, `${def.name} сразу применяется: враг держит защиту.`, "p");
  } else {
    const dealt = hitEnemy(b, Math.round(power * mult), "true", ` [${def.name}, сотворён]`);
    applyVamp(b, dealt, 0, "scroll");
  }
  b.bag[id]--;
  if (b.bag[id] <= 0) delete b.bag[id];
}
function consumableDamageMult(b: BattleState, def: { kind: string; use?: { type: string } }) {
  const isScroll = def.kind === "scroll";
  const spellPowerMult = (hasPassive(b, "resonance") ? 1.4 : 1) * (hasLeg(b, "archmage_blood") ? 1.3 : 1);
  let m = isScroll ? spellPowerMult : 1;
  if (isScroll) {
    m *= 1 + countEffect(b, "scroll_damage") * 0.15 + (hasGearPassive(b, "sage_library") ? 0.25 : 0);
    if (hasPassive(b, "arch_sage_5")) m *= 1.25;
  } else if (def.use?.type !== "heal" && def.use?.type !== "cleanse") {
    m *= 1 + countEffect(b, "consumable_damage") * 0.15;
    if (hasPassive(b, "arch_ninja_5")) m *= 1.2;
  }
  const debuffs = enemyDebuffCount(b);
  m *= 1 + countEffect(b, "debuff_damage") * Math.min(0.32, debuffs * 0.08);
  if (hasPassive(b, "arch_ninja_10")) m *= 1 + Math.min(0.4, debuffs * 0.10);
  return m;
}
function consumablePowerWithGear(b: BattleState, def: { kind: string; use?: { type: string; scale?: number; scaleStat?: StatKey; power?: number } }) {
  let power = consumablePower(def as never, b.p.stats);
  const u = def.use;
  if (!u || u.type === "cleanse") return power;
  if (u.type === "heal" && def.kind !== "scroll") return power;
  const stat = u.scaleStat ?? (def.kind === "scroll" ? "int" : "agi");
  const bonus = def.kind === "scroll"
    ? countEffect(b, "scroll_scale") * 0.3 + (hasPassive(b, "arch_sage_5") ? 0.5 : 0)
    : countEffect(b, "consumable_scale") * 0.25 + (hasPassive(b, "arch_ninja_5") ? 0.5 : 0);
  if (bonus > 0) power += Math.round(b.p.stats[stat] * bonus);
  return power;
}

export function playerAct(b0: BattleState, a: PlayerAction): BattleState {
  if (b0.over || b0.queue[b0.idx] !== "p") return b0;
  const b = clone(b0);
  const previousGuard = b.p.guard;
  b.p.guard = false;

  const err = (msg: string) => {
    b.p.guard = previousGuard;
    push(b, msg, "sys");
    return b;
  };

  const spellPowerMult =
    (hasPassive(b, "resonance") ? 1.4 : 1) * (hasLeg(b, "archmage_blood") ? 1.3 : 1);

  switch (a.type) {
    case "attack": {
      const { d, crit } = calcWeaponRoll(b);
      const dealt = hitEnemy(b, d, "phys", crit ? " Критический удар!" : "");
      applyVamp(b, dealt, 0, "weapon");
      b.p.firstAttackDone = true;
      if (crit && hasPassive(b, "arch_assassin_10")) {
        const heal = Math.max(1, Math.round(dealt * 0.15));
        b.p.hp = Math.min(b.p.maxHp, b.p.hp + heal);
        push(b, `Тень смерти: крит возвращает +${heal} здоровья.`, "p");
      }
      const stunChance = countEffect(b, "stun_chance") * 0.08 +
        (hasGearPassive(b, "heavy_blow") ? 0.20 : 0) +
        (hasGearPassive(b, "barbarian_rage") ? 0.15 : 0) +
        (hasPassive(b, "arch_barbarian_10") ? 0.15 : 0);
      if (b.enemy.hp > 0 && stunChance > 0 && Math.random() < stunChance) {
        b.enemy.statuses.stunAp = Math.min(2, b.enemy.statuses.stunAp + 1);
        push(b, `${b.enemy.def.name} оглушён и потеряет 1 ход в следующем раунде!`, "p");
      }
      const counterChance = countEffect(b, "counter") * 0.12 + (hasGearPassive(b, "dance") ? 0.25 : 0);
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
      let bonus = Math.round(b.p.stats[ws.scaleStat] * scale * spellPowerMult);
      const eff = ws.effect;
      if (eff === "armor_damage") bonus += Math.round(b.p.armor * (ws.id === "bulwark_verdict" ? 0.75 : 0.5));
      if (eff === "missing_hp") bonus = Math.round(bonus * (1 + Math.min(0.6, Math.floor(missingHpRatio(b) * 10) * 0.06)));
      if (eff === "enemy_missing") bonus = Math.round(bonus * (1 + Math.min(0.6, Math.floor(enemyMissingRatio(b) * 10) * 0.06)));
      if (eff === "debuff_damage") bonus = Math.round(bonus * (1 + Math.min(0.4, enemyDebuffCount(b) * 0.10)));
      if (eff === "first_strike" && b.round <= 2) bonus *= 2;
      const trueDamage = eff === "pierce" || eff === "chill" || eff === "leech" || eff === "skill_leech";
      const hits = eff === "double_attack" ? 2 : 1;
      let dealtTotal = 0;
      for (let i = 0; i < hits; i++) {
        const { d, crit } = calcWeaponRoll(b, 1, bonus, { skill: true, forceCrit: eff === "guaranteed_crit" && b.round <= 2 });
        const dealt = hitEnemy(b, d, trueDamage ? "true" : "phys", ` [Приём: ${ws.name}${crit ? ", КРИТ!" : ""}${hits > 1 ? ` ${i + 1}/${hits}` : ""}]`);
        dealtTotal += dealt;
        if (crit && hasPassive(b, "arch_assassin_10")) {
          const heal = Math.max(1, Math.round(dealt * 0.15));
          b.p.hp = Math.min(b.p.maxHp, b.p.hp + heal);
        }
        if (b.enemy.hp <= 0) break;
      }
      b.p.firstAttackDone = true;

      if (eff === "bleed") {
        applyEnemyStatus(b, "bleed", 3);
        push(b, `${b.enemy.def.name} истекает кровью (${b.enemy.statuses.bleed} раундов).`, "p");
      } else if (eff === "poison") {
        applyEnemyStatus(b, "poison", 3);
        push(b, `${b.enemy.def.name} отравлен на ${b.enemy.statuses.poison} раунда.`, "p");
      } else if (eff === "guard") {
        b.p.guard = true;
        push(b, "Ответная стойка: ты в Защите до следующего хода.", "p");
      } else if (eff === "guard_wall") {
        b.p.guard = true;
        b.p.statuses.tempArmor += 4;
        push(b, "Стена щитов: Защита и +4 брони до конца боя.", "p");
      } else if (eff === "chill") {
        applyEnemyStatus(b, "chill", 2);
        push(b, `${b.enemy.def.name} ошеломлён: его урон снижен на 30% (${b.enemy.statuses.chill} раунда).`, "p");
      } else if (eff === "sunder") {
        const breakAmount = ws.id === "crushing_blow" ? 3 : 2;
        b.enemy.armor = Math.max(0, b.enemy.armor - breakAmount);
        push(b, `Броня противника расколота (−${breakAmount} брони, осталось ${b.enemy.armor}).`, "p");
      } else if (eff === "stun") {
        b.enemy.statuses.stunAp = Math.min(2, b.enemy.statuses.stunAp + 1);
        push(b, `${b.enemy.def.name} оглушён и потеряет 1 ход в следующем раунде!`, "p");
      } else if (eff === "dodge_action") {
        b.p.statuses.dodgeNext += 1;
        b.p.statuses.shadowStep += 1;
        push(b, "Пустой шаг: следующая атака ускользнёт, в следующем раунде +1 ход.", "p");
      } else if (eff === "curse_brand") {
        applyEnemyStatus(b, "chill", 3);
        b.enemy.statuses.fear = Math.max(b.enemy.statuses.fear, statusRounds(b, 1));
        push(b, `${b.enemy.def.name} скован печатью проклятия.`, "p");
      } else if (eff === "full_guard") {
        const rounds = 2 + (hasPassive(b, "arch_sage_10") ? 1 : 0);
        b.p.statuses.fullGuard = Math.max(b.p.statuses.fullGuard, rounds);
        push(b, `Слово защиты: полная защита от урона на ${rounds} хода.`, "p");
      } else if (eff === "create_scroll") {
        const count = (ws.id === "scroll_tempest" ? 2 : 1) + countEffect(b, "scroll_create") +
          (hasGearPassive(b, "sage_library") ? 1 : 0) +
          (hasPassive(b, "arch_sage_10") ? 1 : 0);
        const created = createScrolls(b, count);
        push(b, `Слово творения создаёт свитки: ${created.join(", ")}.`, "p");
        if (created.length > 0) castCreatedScroll(b, created[0]);
      }

      let leech = eff === "leech" ? 0.4 : eff === "skill_leech" ? (ws.id === "soul_reprise" ? 0.35 : 0.25) : 0;
      applyVamp(b, dealtTotal, leech, "skill");

      const noCd = (hasPassive(b, "echo") && Math.random() < 0.35) ||
        (hasPassive(b, "arch_warlock_10") && Math.random() < 0.25);
      if (noCd) {
        push(b, "Приём не ушёл на перезарядку!", "p");
      } else {
        let cd = skillCd(b, ws.cooldown);
        if (eff === "skill_leech") cd = Math.max(1, cd - (ws.id === "soul_reprise" ? 2 : 1));
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

      if (sk.id === "fireball") {
        const dmg = Math.round((20 + 3.5 * b.p.stats.int) * spellPowerMult * skillDamageMult(b));
        const dealt = hitEnemy(b, dmg, "true", " [Огненный шар]");
        applyVamp(b, dealt, 0, "skill");
        b.enemy.statuses.bleed = Math.max(b.enemy.statuses.bleed, 3);
        push(b, `${b.enemy.def.name} объят пламенем (3 раунда).`, "p");
      } else if (sk.id === "blood_lance") {
        const dmg = Math.round((16 + 2.5 * b.p.stats.str) * spellPowerMult * skillDamageMult(b));
        const dealt = hitEnemy(b, dmg, "true", " [Кровавое копьё]");
        const heal = Math.max(2, Math.round(dealt * 0.5));
        b.p.hp = Math.min(b.p.maxHp, b.p.hp + heal);
        flash(b, "p", "heal", heal);
        push(b, `Кровавое копьё возвращает тебе +${heal} здоровья.`, "p");
      } else if (sk.id === "ash_aegis") {
        const heal = Math.round((16 + 2.5 * b.p.stats.int) * spellPowerMult);
        b.p.hp = Math.min(b.p.maxHp, b.p.hp + heal);
        b.p.statuses.wound = 0;
        b.p.statuses.curse = 0;
        b.p.statuses.poison = 0;
        b.p.guard = true;
        flash(b, "p", "heal", heal);
        push(b, `Эгида пепла: +${heal} ОЗ, раны сняты, включена Защита.`, "p");
      } else if (sk.id === "shadow_volley") {
        const dmg = Math.round((16 + 3 * b.p.stats.agi) * spellPowerMult * skillDamageMult(b));
        const dealt = hitEnemy(b, dmg, "true", " [Теневой росчерк]");
        b.enemy.statuses.chill = Math.max(b.enemy.statuses.chill, 2);
        applyVamp(b, dealt, 0, "skill");
      } else if (sk.id === "frost_nova") {
        const dmg = Math.round((16 + 3 * b.p.stats.int) * spellPowerMult * skillDamageMult(b));
        const dealt = hitEnemy(b, dmg, "true", " [Дыхание склепа]");
        applyVamp(b, dealt, 0, "skill");
        b.enemy.statuses.chill = Math.max(b.enemy.statuses.chill, 3);
        b.enemy.statuses.stunAp = Math.min(2, b.enemy.statuses.stunAp + 1);
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
      if (!b.bag[a.id]) return err(`«${def.name}» закончился.`);
      const u = def.use;
      const req = consumableIntReq(def, b.p.intDiscount);
      if (b.p.stats.int < req) return err(`Для «${def.name}» нужен Интеллект ${req}.`);
      const itemPower = consumablePowerWithGear(b, def);
      const scrollMult = consumableDamageMult(b, def);
      if (u.type === "fear" && isImmuneTo(b.enemy.def.type, "fear")) {
        return err(`${b.enemy.def.name} не знает страха: флакон здесь бесполезен.`);
      }

      switch (u.type) {
        case "heal": {
          let amt = itemPower;
          if (def.kind === "scroll") amt = Math.round(amt * scrollMult);
          b.p.hp = Math.min(b.p.maxHp, b.p.hp + amt);
          if (def.kind === "scroll") b.p.statuses.wound = 0;
          flash(b, "p", "heal", amt);
          push(b, `${def.name}: +${amt} здоровья.`, "p");
          break;
        }
        case "damage": {
          let dmg = Math.round(itemPower * scrollMult);
          if (u.vs && b.enemy.def.type === u.vs) dmg = Math.round(dmg * 2);
          if (b.p.statuses.rage > 0) dmg = Math.round(dmg * 1.5);
          if (b.p.statuses.curse > 0) dmg = Math.round(dmg * 0.7);
          const dealt = hitEnemy(b, dmg, u.vs ? "true" : "magic", ` [${def.name}]${u.vs && b.enemy.def.type === u.vs ? " · вдвойне против такого рода!" : ""}`);
          applyVamp(b, dealt, 0, def.kind === "scroll" ? "scroll" : "consumable");
          break;
        }
        case "chill": {
          let dmg = Math.round(itemPower * scrollMult);
          const dealt = hitEnemy(b, dmg, "magic", ` [${def.name}]`);
          applyVamp(b, dealt, 0, def.kind === "scroll" ? "scroll" : "consumable");
          applyEnemyStatus(b, "chill", u.rounds ?? 3);
          push(b, `${b.enemy.def.name} скован холодом: его урон −30%.`, "p");
          break;
        }
        case "sunder_damage": {
          let dmg = Math.round(itemPower * scrollMult);
          const dealt = hitEnemy(b, dmg, "true", ` [${def.name}]`);
          applyVamp(b, dealt, 0, def.kind === "scroll" ? "scroll" : "consumable");
          b.enemy.armor = Math.max(0, b.enemy.armor - 2);
          push(b, `Молния раскалывает броню врага (−2 брони).`, "p");
          break;
        }
        case "cleanse": {
          b.p.statuses.wound = 0;
          b.p.statuses.curse = 0;
          b.p.statuses.poison = 0;
          b.p.hp = Math.min(b.p.maxHp, b.p.hp + 8);
          push(b, `${def.name}: раны, проклятие и яд сняты (+8 ОЗ).`, "p");
          break;
        }
        case "rage": {
          b.p.statuses.rage = statusRounds(b, u.rounds ?? 5);
          push(b, `${def.name}: ярость на ${u.rounds} раундов, урон +50%.`, "p");
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
          applyVamp(b, dealt, 0, "consumable");
          break;
        }
        case "poison": {
          const dmg = Math.round(itemPower);
          const dealt = hitEnemy(b, dmg, "phys", ` [${def.name}]`);
          applyVamp(b, dealt, 0, "consumable");
          if (isImmuneTo(b.enemy.def.type, "poison")) {
            push(b, `${b.enemy.def.name} (${b.enemy.def.type === "undead" ? "нежить" : "конструкт"}) невосприимчив к яду!`, "sys");
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
          applyVamp(b, dealt, 0, "consumable");
          break;
        }
        case "fear": {
          applyEnemyStatus(b, "fear", u.rounds ?? 2);
          push(b, `${b.enemy.def.name} в ужасе: пропустит ${b.enemy.statuses.fear} хода.`, "p");
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
          b.enemy.statuses.stunAp = Math.min(4, b.enemy.statuses.stunAp + (u.rounds ?? 1));
          push(b, `${b.enemy.def.name} теряет ${u.rounds ?? 1} ход в следующем раунде.`, "p");
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
        case "shadow_dust": {
          b.p.statuses.smoke = Math.max(b.p.statuses.smoke, u.rounds ?? 2);
          b.p.statuses.shadowStep += 1;
          push(b, `${def.name}: дымовая завеса и +1 ход в следующем раунде.`, "p");
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
          const count = 2 + countEffect(b, "scroll_create") + (hasGearPassive(b, "sage_library") ? 1 : 0) +
            (hasPassive(b, "arch_sage_10") ? 1 : 0);
          const created = createScrolls(b, count);
          push(b, `${def.name}: созданы свитки (${created.join(", ")}).`, "p");
          if (created.length > 0) castCreatedScroll(b, created[0]);
          break;
        }
        case "acid": {
          const dmg = Math.round(itemPower);
          const dealt = hitEnemy(b, dmg, "true", ` [${def.name}]`);
          applyVamp(b, dealt, 0, "consumable");
          b.enemy.armor = Math.max(0, b.enemy.armor - 3);
          push(b, `Кислота разъедает броню: −3 (осталось ${b.enemy.armor}).`, "p");
          break;
        }
      }

      const scrollSaveChance = (hasPassive(b, "echo") ? 0.35 : 0) + countEffect(b, "scroll_save") * 0.12 +
        (hasPassive(b, "arch_sage_5") ? 0.15 : 0) +
        (hasPassive(b, "arch_sage_10") ? 0.20 : 0) +
        (hasGearPassive(b, "sage_library") ? 0.20 : 0);
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
    push(b, `${b.enemy.def.name} повержен! (+${b.enemy.xp} опыта)`, "sys");
    return b;
  }
  if (b.over) return b;
  advance(b);
  return b;
}

export function enemyStep(b0: BattleState): BattleState {
  if (b0.over || b0.queue[b0.idx] !== "e") return b0;
  const b = clone(b0);
  b.enemy.guard = false;
  const e = b.enemy;
  if (e.statuses.fear > 0) {
    e.statuses.fear--;
    flash(b, "e", "miss", 0);
    push(b, `${e.def.name} отступает в страхе и пропускает ход.`, "p");
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

  const chill = e.statuses.chill > 0 ? 0.7 : 1;
  const move = pick(b.enemy.moves.length ? b.enemy.moves : e.def.moves);
  const base = randInt(e.atk[0], e.atk[1]);
  const resistChance = Math.min(0.85, playerResistChance(b) + (hasPassive(b, "stone_skin") ? 0.15 : 0));

  switch (move) {
    case "guard": {
      e.guard = true;
      flash(b, "e", "guard", 0);
      push(b, `${e.def.name} уходит в глухую защиту.`, "e");
      break;
    }
    case "heavy": {
      push(b, `${e.def.name} обрушивает сокрушительный удар!`, "e");
      incoming(b, Math.round(base * 1.7 * chill), "phys", `${e.def.name} пробивает с плеча`);
      break;
    }
    case "wound": {
      const landed = incoming(b, Math.round(base * 0.9 * chill), "phys", `${e.def.name} рвёт плоть`);
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
      if (landed && b.p.hp > 0 && Math.random() > resistChance) {
        b.p.statuses.curse = Math.max(b.p.statuses.curse, 3);
        push(b, "Проклятие висит 3 раунда: твой урон снижен на 30%.", "e");
      } else if (landed && b.p.hp > 0) {
        push(b, "Стойкость отбрасывает проклятие.", "p");
      }
      break;
    }
    case "drain": {
      const d = Math.round(base * 0.95 * chill);
      if (incoming(b, d, "magic", `${e.def.name} вытягивает жизненную силу`)) {
        const heal = Math.max(2, Math.round(d * 0.5));
        e.hp = Math.min(e.maxHp, e.hp + heal);
        push(b, `${e.def.name} восстанавливает себе ${heal} ОЗ.`, "e");
      }
      break;
    }
    case "sunder": {
      const landed = incoming(b, Math.round(base * 1.15 * chill), "phys", `${e.def.name} бьёт по швам доспеха`);
      if (landed && b.p.hp > 0) {
        b.p.statuses.sundered = Math.min(4, b.p.statuses.sundered + 1);
        push(b, "Твоя броня промята (−1 к защите до конца боя).", "e");
      }
      break;
    }
    case "bell_stun": {
      const landed = incoming(b, Math.round(base * 1.1 * chill), "magic", `${e.def.name} бьёт в погребальный колокол`);
      if (landed && b.p.hp > 0 && Math.random() > resistChance) {
        b.p.statuses.stunAp = 1;
        push(b, "Звон парализует волю: −1 ход в следующем раунде!", "e");
      } else if (landed && b.p.hp > 0) {
        push(b, "Ты выдерживаешь удар колокола без потери хода.", "p");
      }
      break;
    }
    case "poison": {
      const landed = incoming(b, Math.round(base * 0.85 * chill), "phys", `${e.def.name} впивается зубами`);
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
        incoming(b, Math.round(base * 0.65 * chill), "phys", `${e.def.name} добивает вторым`);
      }
      break;
    }
    case "terror": {
      const landed = incoming(b, Math.round(base * 0.6 * chill), "magic", `${e.def.name} рычит тебе в лицо`);
      if (landed && b.p.hp > 0 && Math.random() > resistChance) {
        b.p.statuses.curse = Math.max(b.p.statuses.curse, 2);
        e.guard = true;
        flash(b, "e", "guard", 0);
        push(b, "Проклятие на 2 раунда, а враг успевает закрыться: он в Защите.", "e");
      }
      break;
    }
    default: {
      incoming(b, Math.round(base * chill), "phys", `${e.def.name} атакует`);
    }
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
  const strFlat = Math.floor(st.str * 0.8);
  const baseMin = b.p.hit[0] + strFlat;
  const baseMax = b.p.hit[1] + strFlat;

  const dmgMods: Modifier[] = [];
  const ws = b.p.weaponSkill;
  const wsReq = ws ? Math.max(1, ws.intReq - b.p.intDiscount) : 0;
  if (ws && st.int >= wsReq) {
    const bonus = Math.floor(st[ws.scaleStat] * (ws.scaleMult * 0.35));
    if (bonus > 0)
      dmgMods.push({
        id: "weapon_passive",
        label: `Приём: ${ws.name}`,
        flat: bonus,
        good: true,
        detail: `Открыт Интеллектом ${st.int} ≥ ${wsReq}: +${bonus} к каждому удару.`,
      });
  }
  if (b.p.passives.includes("heavy_hand"))
    dmgMods.push({ id: "heavy_hand", label: "Тяжёлая рука", flat: 3, good: true, detail: "+3 к урону каждым ударом." });
  const might = b.p.rareAffixes.filter((x) => x === "might").length;
  const effectDamage = countEffect(b, "armor_damage") * 0.25 + (hasPassive(b, "arch_bulwark_10") ? 0.5 : 0);
  if (effectDamage > 0 && b.p.armor > 0)
    dmgMods.push({ id: "armor_damage", label: "Тяжесть лат", flat: Math.round(b.p.armor * effectDamage), good: true, detail: `+${Math.round(effectDamage * 100)}% брони к урону.` });
  const missingBonus = countEffect(b, "missing_hp_damage") * Math.min(0.6, Math.floor(missingHpRatio(b) * 10) * 0.06) +
    (hasPassive(b, "arch_barbarian_5") ? Math.floor(missingHpRatio(b) * 10) * 0.04 : 0);
  if (missingBonus > 0) dmgMods.push({ id: "missing_hp", label: "Боль берсерка", mult: 1 + missingBonus, good: true, detail: "Недостающее здоровье усиливает удар." });
  const enemyMissingBonus = countEffect(b, "enemy_missing_damage") * Math.min(0.6, Math.floor(enemyMissingRatio(b) * 10) * 0.06) +
    (hasPassive(b, "arch_barbarian_10") && enemyMissingRatio(b) >= 0.5 ? 0.35 : 0);
  if (enemyMissingBonus > 0) dmgMods.push({ id: "enemy_missing", label: "Добивание", mult: 1 + enemyMissingBonus, good: true, detail: "Раненый враг получает больше урона." });
  if (b.p.gearHands === 2) {
    const two = countEffect(b, "two_hand_damage") * 0.15 + (hasPassive(b, "arch_barbarian_5") ? 0.25 : 0);
    if (two > 0) dmgMods.push({ id: "two_hand", label: "Двуручный хват", mult: 1 + two, good: true, detail: "Двуручное оружие бьёт сильнее." });
  }
  if (b.round <= 2 && countEffect(b, "first_strike") > 0)
    dmgMods.push({ id: "first_strike", label: "Первый удар", mult: 1 + countEffect(b, "first_strike") * 0.2, good: true, detail: "+20% урона в первые 2 раунда." });
  const debuffBonus = countEffect(b, "debuff_damage") * Math.min(0.32, enemyDebuffCount(b) * 0.08) +
    (hasPassive(b, "arch_ninja_10") ? Math.min(0.4, enemyDebuffCount(b) * 0.10) : 0);
  if (debuffBonus > 0) dmgMods.push({ id: "debuff_damage", label: "Удар по слабому", mult: 1 + debuffBonus, good: true, detail: "Негативные эффекты врага усиливают твой урон." });
  if (might)
    dmgMods.push({ id: "might", label: "Тяжесть стали", flat: 3 * might, good: true, detail: `+3 к урону за каждое свойство (×${might}).` });

  if (b.p.statuses.rage > 0)
    dmgMods.push({
      id: "rage",
      label: "Ярость",
      mult: 1.5,
      good: true,
      rounds: b.p.statuses.rage,
      detail: "Урон +50%, пока ярость не выгорит.",
    });
  if (b.p.statuses.curse > 0)
    dmgMods.push({
      id: "curse",
      label: "Проклятие",
      mult: 0.7,
      good: false,
      rounds: b.p.statuses.curse,
      detail: "Снижает ваш урон на 30%: анафема висит на тебе.",
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
      detail: `−${2 + b.floor} здоровья в конце каждого раунда.`,
    });
  if (b.p.statuses.poison > 0)
    defMods.push({
      id: "poison",
      label: "Отравление",
      good: false,
      rounds: b.p.statuses.poison,
      detail: `−${4 + b.floor} здоровья в конце каждого раунда.`,
    });
  if (b.p.statuses.stunAp > 0)
    defMods.push({
      id: "stun",
      label: "Оглушение",
      good: false,
      rounds: b.p.statuses.stunAp,
      detail: `−${b.p.statuses.stunAp} ход в следующем раунде.`,
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
  const resistFlat = countEffect(b, "damage_resist") * 2;
  if (resistFlat > 0) defMods.push({ id: "damage_resist", label: "Сопротивление урону", flat: -resistFlat, good: true, detail: `−${resistFlat} урона за каждый входящий удар.` });
  const armorBase = b.p.armor + b.p.statuses.tempArmor + (b.p.statuses.ironTonic > 0 ? 4 : 0) + b.p.statuses.sundered;
  const armor = Math.max(0, b.p.armor + b.p.statuses.tempArmor + (b.p.statuses.ironTonic > 0 ? 4 : 0) - b.p.statuses.sundered);

  /* Урон врага по мне */
  const enemyMods: Modifier[] = [];
  const chill = b.enemy.statuses.chill > 0;
  if (chill)
    enemyMods.push({
      id: "chill",
      label: "Ослабление врага",
      mult: 0.7,
      good: true,
      rounds: b.enemy.statuses.chill,
      detail: "Его урон −30%, пока холод не спадёт.",
    });
  if (b.enemy.statuses.fear > 0)
    enemyMods.push({
      id: "fear",
      label: "Страх врага",
      good: true,
      rounds: b.enemy.statuses.fear,
      detail: "Пропускает ходы в ужасе.",
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
      detail: `−${4 + b.floor} ОЗ врагу в конце раунда.`,
    });
  if (b.enemy.statuses.poison > 0)
    enemyMods.push({
      id: "epoison",
      label: "Яд на враге",
      good: true,
      rounds: b.enemy.statuses.poison,
      detail: `−${5 + b.floor} ОЗ врагу в конце раунда.`,
    });
  if (b.enemy.passive?.id === "stone_hide")
    enemyMods.push({ id: "estone", label: "Каменная шкура врага", mult: 1, good: false, detail: "Твой физический урон по нему −25%." });
  if (b.enemy.passive?.id === "regen")
    enemyMods.push({ id: "eregen", label: "Регенерация врага", mult: 1, good: false, detail: "Враг восстанавливает 4 ОЗ каждый раунд." });
  if (b.enemy.passive?.id === "venom")
    enemyMods.push({ id: "evenom", label: "Ядовитый враг", mult: 1, good: false, detail: "Его удары отравляют тебя на 2 раунда." });

  const enemyMult = chill ? 0.7 : 1;
  const defMult = multOf(defMods.filter((m) => m.mult !== undefined));
  const eMin = Math.round(b.enemy.atk[0] * enemyMult);
  const eMax = Math.round(b.enemy.atk[1] * enemyMult);
  const afterArmor = (v: number) => Math.max(1, Math.round((v - armor - resistFlat) * defMult));

  const haste = b.p.statuses.haste;
  const apBase = b.p.ap;
  const sageAp = hasPassive(b, "arch_sage_10") ? 1 : 0;
  const ap = Math.max(1, apBase + (haste > 0 ? 1 : 0) + sageAp + b.p.statuses.shadowStep - b.p.statuses.stunAp);

  return {
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
    evade: b.p.evade,
    crit: b.p.critChance,
    ap,
    apBase,
    resist: Math.min(0.85, playerResistChance(b) + (b.p.passives.includes("stone_skin") ? 0.15 : 0)),
    dmgMods,
    defMods,
    enemyMods,
  };
}

export function queuePreview(b: BattleState, n = 8): ("p" | "e")[] {
  return b.queue.slice(b.idx, b.idx + n);
}

export const REAGENT_SET = new Set(REAGENTS);
