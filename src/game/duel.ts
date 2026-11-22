import {
  ACCURACY_MAX,
  ACCURACY_MIN,
  ATTACK_KIND_META,
  ATTACK_KINDS,
  MAX_CONCENTRATION,
  SPECIAL_CONCENTRATION,
  WEAPON_ACCURACY,
  derived,
  heroHitChance,
  sunderBreakAmount,
  techniqueDamage,
  weaponTechniqueBonus,
  type AttackDamagePart,
  type AttackKind,
} from "./battle";
import { ARCHETYPES, type ArchetypeId } from "./archetypes";
import { ITEMS } from "./content";
import { STAMINA_BACKPACK, STAMINA_GUARD, STAMINA_TECHNIQUE_EXTRA, STAMINA_TURN_RECOVERY, STAMINA_UNARMED, staminaMax } from "./stamina";
import { EXHAUST_ROUNDS, OIL_NAMES, OIL_ROUNDS, dotBaseTick, dotTickSpan, type OilKind } from "./statusEffects";
import type { DamageNumberType } from "./damageNumbers";
import type { GearClass, Player } from "./types";

/**
 * Дуэль один на один по правилам боя, но без монстров и этажа.
 * Выносливость, концентрация, виды удара, меткость, защита, приём, спец-приём архетипа,
 * проки клинка, масла, Единение стихий и периодический урон (тики v2) считаются так же, как в подземелье.
 */
export interface DuelSkill {
  name: string;
  intReq: number;
  cooldown: number;
  scaleMult: number;
  scaleStat: "str" | "agi" | "int";
}

/** Удар одним оружием: диапазон урона, стоимость выносливости, вес для меткости. */
export interface DuelHand {
  lo: number;
  hi: number;
  cost: number;
  power: number;
  cls: GearClass;
  name: string;
}

/** Проки клинка: шанс при попадании и величина тика (кровотечение, яд, жар, обморожение) или сила раскола. */
export type DuelProcKey = "bleed" | "poison" | "sunder" | "scorch" | "frost";
export interface DuelProc {
  chance: number;
  value: number;
}

/** Масло из сумки: снимок на начало дуэли. Расходуется в дуэли, в сумке игрока не списывается (как зелья). */
export interface DuelOil {
  id: string;
  name: string;
  oil: OilKind;
  power: number;
  cut: number;
  /** Сколько раундов держится смазка. */
  coat: number;
  count: number;
}

/** Смазка клинка: накладывает эффект масла на каждое попадание героя, пока не выйдет срок. */
export interface DuelCoat {
  oil: OilKind;
  power: number;
  cut: number;
  rounds: number;
}

/**
 * Эффект на персонаже.
 * DoT (burn, bleed, poison, ice, drain) — тик в начале хода носителя; первый тик — сразу при наложении.
 * chill — −% урона (value); ice — тик и −% урона (pct); break — −брони (value); weak — −% брони (value);
 * noheal — лечение запрещено.
 */
export type DuelEffectKind = "burn" | "bleed" | "poison" | "ice" | "chill" | "drain" | "break" | "weak" | "noheal";

export interface DuelEffect {
  kind: DuelEffectKind;
  name: string;
  /** Осталось тиков (DoT) или раундов (остальные эффекты). */
  rounds: number;
  value: number;
  /** Кто наложил эффект (нужно для иссушения: лечение достаётся ему). */
  source: DuelSide;
  /** Снижение урона носителя в процентах (ice). */
  pct?: number;
  /** Добавка к каждому тику (Единение стихий). */
  bonus?: number;
}

export interface DuelFighter {
  userId: string;
  name: string;
  level: number;
  maxHp: number;
  hp: number;
  /** Действий за ход: по одному за очко Ловкости, но не больше четырёх. */
  ap: number;
  armor: number;
  hit: [number, number];
  strFlat: number;
  evade: number;
  crit: number;
  critDamage: number;
  weaponName: string;
  intStat: number;
  /** Значение характеристики, которую требует приём оружия (ХАР в формуле урона). */
  skillStat: number;
  skill: DuelSkill | null;
  potions: number;
  /** Масла в сумке (снимок на начало дуэли). */
  oils: DuelOil[];
  /** Смазка клинка, которую наложило масло. */
  coat: DuelCoat | null;
  /** Проки клинка по свойствам предметов. */
  procs: Partial<Record<DuelProcKey, DuelProc>>;
  /** Единение стихий: 0, 5 или 10 (уровень пассива архимага). */
  archmage: number;
  /** Магический множитель: усиление предметов и Единение стихий. */
  magicMult: number;
  /** Защита: +10 брони до начала своего следующего хода. */
  guard: boolean;
  cooldown: number;
  stamina: number;
  staminaMax: number;
  concentration: number;
  /** Каждое оружие бьёт отдельным ударом; без оружия — кулаки. */
  hands: DuelHand[];
  archetype: ArchetypeId | null;
  /** Неуязвимость (Жертвенный пакт): до начала своего следующего хода. */
  invulnerable: boolean;
  /** Щит: броня, которая добавится к следующему удару (Стойка-щит). */
  bulwarkBonus: number;
  effects: DuelEffect[];
}

export type DuelSide = "a" | "b";

/**
 * Событие последнего действия: урон, лечение или промах. По нему рисуются числа над персонажами
 * тем же стилем, что в бою. Тип урона задаёт цвет; лечение и промах — без типа.
 */
export interface DuelHit {
  /** Чья карточка: получатель урона, лечения или промаха. */
  target: DuelSide;
  kind: "dmg" | "heal" | "miss";
  amount: number;
  type?: DamageNumberType;
}

export interface DuelState {
  id: string;
  a: DuelFighter;
  b: DuelFighter;
  turn: DuelSide;
  round: number;
  apLeft: number;
  winner: DuelSide | null;
  log: string[];
  /** Тип урона строки журнала (цвет, как в бою); null — обычная строка. Идёт параллельно log. */
  logTypes: (DamageNumberType | null)[];
  deadline: number;
  seq: number;
  /** Итог боя записан в профиль победителя/проигравшего ровно один раз. */
  settled?: boolean;
  /** События последнего действия или тика (сбрасываются перед каждым действием). */
  hits: DuelHit[];
}

export type DuelAction =
  | { type: "attack"; kind?: AttackKind }
  | { type: "technique" }
  | { type: "archetype_skill" }
  | { type: "guard" }
  | { type: "potion" }
  | { type: "oil"; id: string }
  | { type: "pass" }
  | { type: "flee" };

export const DUEL_TURN_MS = 20_000;
export const DUEL_POTION_HEAL = 28;
/** Защита: +10 брони (вместо урона × 0,5). */
export const DUEL_GUARD_ARMOR = 10;
/** Старт дуэли: половина максимума выносливости. */
export const DUEL_START_STAMINA_SHARE = 0.5;
/** Иссушение: тик за ход носителя — доля макс. ОЗ цели (как DRAIN_SHARE в бою). */
export const DUEL_DRAIN_SHARE = 0.06;
const DUEL_MAX_AP = 4;
const TECHNIQUE_CONCENTRATION = 1;
const RISKY_CONCENTRATION = 1;
const GUARD_CONCENTRATION = 2;
const POTION_CONCENTRATION = 1;
/** Слово созидания/пакта и проки клинка: сколько ходов держатся эффекты (тики). */
const SPECIAL_EFFECT_ROUNDS = 3;
const PROC_ROUNDS = 3;
/** Бесконечный срок (Абсолютное знание): до конца дуэли. */
const UNTIL_END = 999;
const DUEL_BREAK_VALUE = 3;
const DUEL_BREAK_ROUNDS = 2;
const DUEL_CHILL_PCT = 10;
/** Контратака Дуэлянта: доля урона оружия. */
const DUEL_VOLLEY_MULT = 0.6;
const WARLOCK_HP_SHARE = 0.5;
/** Единение стихий: шанс после приёма, бонус тика за уровень, магический бонус. */
const UNITY_CHANCE = 0.25;
const UNITY_BURN_PER_LEVEL = 5;
const UNITY_CHILL_PER_LEVEL = 3;
const UNITY_MAGIC_BONUS = 0.15;
/** Смазка и масло: эффекты, которые действуют на врага при попадании. */
const DUEL_HEAL_BLOCK_ROUNDS = OIL_ROUNDS;

const DOT_KINDS: DuelEffectKind[] = ["burn", "bleed", "poison", "ice", "drain"];
const isDot = (kind: DuelEffectKind) => DOT_KINDS.includes(kind);
const DOT_TYPE: Record<"burn" | "bleed" | "poison" | "ice" | "drain", DamageNumberType> = {
  burn: "fire",
  bleed: "bleed",
  poison: "poison",
  ice: "ice",
  drain: "pure",
};

export function fighterFromPlayer(userId: string, player: Player): DuelFighter {
  const d = derived(player);
  const skill = d.weaponSkill
    ? {
        name: d.weaponSkill.name,
        intReq: d.weaponSkill.intReq,
        cooldown: d.weaponSkill.cooldown,
        scaleMult: d.weaponSkill.scaleMult,
        scaleStat: d.weaponSkill.scaleStat as "str" | "agi" | "int",
      }
    : null;
  const hands: DuelHand[] = d.hands.length
    ? d.hands.map((h) => ({ lo: h.lo, hi: h.hi, cost: h.cost, power: h.power, cls: h.cls, name: h.name }))
    : [{ lo: d.hit[0], hi: d.hit[1], cost: STAMINA_UNARMED, power: (d.hit[0] + d.hit[1]) / 2, cls: "light", name: "кулаки" }];
  const max = staminaMax(player.stats);

  /* Проки клинка: шанс и тик — те же формулы, что в бою (weaponHitEffects). */
  const procs: Partial<Record<DuelProcKey, DuelProc>> = {};
  const addProc = (key: DuelProcKey, id: "bleed" | "poison_damage" | "sunder" | "scorch" | "frost_bite") => {
    const chance = Math.min(0.95, (d.effectPower[id] ?? 0) / 100);
    if (chance > 0) procs[key] = { chance, value: Math.max(1, Math.round(d.effectValue[id] ?? 0)) };
  };
  addProc("bleed", "bleed");
  addProc("poison", "poison_damage");
  addProc("sunder", "sunder");
  addProc("scorch", "scorch");
  addProc("frost", "frost_bite");

  const archmage = player.passives.includes("arch_archmage_10") ? 10 : player.passives.includes("arch_archmage_5") ? 5 : 0;
  const magicMult = 1 + (d.effectPower.magic_power ?? 0) / 100 + (archmage >= 5 ? UNITY_MAGIC_BONUS : 0);

  /* Масла в сумке: снимок, как у зелий. */
  const oils: DuelOil[] = [];
  for (const [id, count] of Object.entries(player.bag)) {
    const def = ITEMS[id];
    const use = def?.use;
    if (!def || !use || use.type !== "oil" || !use.oil || count <= 0) continue;
    oils.push({ id, name: def.name, oil: use.oil, power: use.power ?? 0, cut: use.cut ?? 0, coat: use.coat ?? 3, count });
  }

  return {
    userId,
    name: player.name,
    level: player.level,
    maxHp: d.maxHp,
    hp: d.maxHp,
    ap: Math.max(1, Math.min(DUEL_MAX_AP, d.ap)),
    armor: d.armor,
    hit: d.hit,
    strFlat: d.strFlat,
    evade: d.evade,
    crit: d.critChance,
    critDamage: d.critDamage,
    weaponName: d.weaponName,
    intStat: player.stats.int,
    skillStat: d.weaponSkill ? player.stats[d.weaponSkill.scaleStat] : 0,
    skill,
    potions: player.bag.potion_s ?? 0,
    oils,
    coat: null,
    procs,
    archmage,
    magicMult,
    guard: false,
    cooldown: 0,
    stamina: Math.floor(max * DUEL_START_STAMINA_SHARE),
    staminaMax: max,
    concentration: 0,
    hands,
    archetype: d.archetype,
    invulnerable: false,
    bulwarkBonus: 0,
    effects: [],
  };
}

/**
 * Дополняет состояние, сохранённое до появления новых полей (старые дуэли в базе).
 * Значения по умолчанию — грубые, но дуэль продолжается без поломки.
 */
export function normalizeDuel(state: DuelState): DuelState {
  const fix = (f: DuelFighter): DuelFighter => {
    const hands: DuelHand[] = f.hands ?? [
      { lo: f.hit[0], hi: f.hit[1], cost: STAMINA_UNARMED, power: (f.hit[0] + f.hit[1]) / 2, cls: "light", name: f.weaponName },
    ];
    return {
      ...f,
      staminaMax: f.staminaMax ?? 100,
      stamina: f.stamina ?? 50,
      concentration: f.concentration ?? 0,
      hands,
      archetype: f.archetype ?? null,
      invulnerable: f.invulnerable ?? false,
      bulwarkBonus: f.bulwarkBonus ?? 0,
      effects: f.effects ?? [],
      oils: f.oils ?? [],
      coat: f.coat ?? null,
      procs: f.procs ?? {},
      archmage: f.archmage ?? 0,
      magicMult: f.magicMult ?? 1,
    } as DuelFighter;
  };
  const logTypes = [...(state.logTypes ?? [])];
  while (logTypes.length < state.log.length) logTypes.push(null);
  return { ...state, a: fix(state.a), b: fix(state.b), hits: state.hits ?? [], logTypes };
}

export function createDuel(
  id: string,
  a: { userId: string; player: Player },
  b: { userId: string; player: Player },
  now = Date.now(),
): DuelState {
  const fa = fighterFromPlayer(a.userId, a.player);
  const fb = fighterFromPlayer(b.userId, b.player);
  /* Начало хода первого игрока тоже даёт восстановление. */
  fa.stamina = Math.min(fa.staminaMax, fa.stamina + STAMINA_TURN_RECOVERY);
  const first = `${a.player.name} вызывает ${b.player.name} на дуэль. Ход первый, у каждого 20 секунд.`;
  return {
    id,
    a: fa,
    b: fb,
    turn: "a",
    round: 1,
    apLeft: fa.ap,
    winner: null,
    log: [first],
    logTypes: [null],
    deadline: now + DUEL_TURN_MS,
    seq: 0,
    hits: [],
  };
}

const other = (side: DuelSide): DuelSide => (side === "a" ? "b" : "a");
const rollDie = (min: number, max: number) => min + Math.floor(Math.random() * Math.max(1, max - min + 1));
const clampConcentration = (v: number) => Math.max(0, Math.min(MAX_CONCENTRATION, v));

/** Строка журнала с типом урона (цвет, как в бою). Журнал и типы всегда одной длины. */
function say(state: DuelState, text: string, type: DamageNumberType | null = null) {
  alignLog(state);
  state.log.push(text);
  state.logTypes.push(type);
}

/** Выравнивает типы строк журнала с самим журналом (старые дуэли и тестовые состояния). */
function alignLog(state: DuelState) {
  if (!state.logTypes) state.logTypes = [];
  while (state.logTypes.length < state.log.length) state.logTypes.push(null);
}

/** Записывает событие урона, лечения или промаха в последнее действие. */
function recordHit(state: DuelState, target: DuelSide, kind: DuelHit["kind"], amount: number, type?: DamageNumberType) {
  if (kind !== "miss" && amount <= 0) return;
  state.hits.push(type ? { target, kind, amount, type } : { target, kind, amount });
}

/** Удар оружием в событиях: попадание — урон своего типа, промах или неуязвимость — «мимо». */
function recordStrike(state: DuelState, target: DuelSide, r: { dmg: number; outcome: StrikeOutcome }, type: DamageNumberType) {
  if (r.outcome === "hit") recordHit(state, target, "dmg", r.dmg, type);
  else recordHit(state, target, "miss", 0);
}

/** Концентрация за действие (как в бою): мощный −1, точный +1, приём −1, защита +2, зелье +1, масло +1. */
export function duelConcentrationDelta(action: DuelAction): number {
  if (action.type === "attack") return action.kind === "risky" ? -1 : action.kind === "safe" ? 1 : 0;
  if (action.type === "technique") return -TECHNIQUE_CONCENTRATION;
  if (action.type === "archetype_skill") return -SPECIAL_CONCENTRATION;
  if (action.type === "guard") return GUARD_CONCENTRATION;
  if (action.type === "potion" || action.type === "oil") return POTION_CONCENTRATION;
  return 0;
}

/** Самое сильное оружие (по среднему урону): его удар используют приём и спец-приём. */
function strongestHand(f: DuelFighter): DuelHand {
  return f.hands.reduce((best, h) => (h.power > best.power ? h : best));
}

export function duelAttackCost(f: DuelFighter): number {
  return f.hands.reduce((sum, h) => sum + h.cost, 0);
}

export function duelTechniqueCost(f: DuelFighter): number {
  return strongestHand(f).cost + STAMINA_TECHNIQUE_EXTRA;
}

/** Броня защищающегося сейчас: защита, минус раскол, минус ослабление (в процентах). */
function armorNow(f: DuelFighter): number {
  const breaks = f.effects.filter((e) => e.kind === "break").reduce((s, e) => s + e.value, 0);
  const weak = Math.min(0.9, f.effects.filter((e) => e.kind === "weak").reduce((s, e) => s + e.value, 0) / 100);
  const base = Math.max(0, f.armor + (f.guard ? DUEL_GUARD_ARMOR : 0) - breaks);
  return Math.max(0, Math.round(base * (1 - weak)));
}

/** Снижение урона атакующего: холод (chill) и лёд с маслом (ice), каждый в своих процентах. */
function chillMult(f: DuelFighter): number {
  return f.effects.reduce((m, e) => {
    const pct = e.kind === "chill" ? e.value : e.kind === "ice" ? (e.pct ?? 0) : 0;
    return m * (1 - pct / 100);
  }, 1);
}

/** Смазка «Острота»: урон удара героя растёт на процент масла, пока держится смазка. */
function edgeMult(f: DuelFighter): number {
  return f.coat && f.coat.rounds > 0 && f.coat.oil === "edge" ? 1 + f.coat.power / 100 : 1;
}

interface StrikeOpts {
  label: string;
  kind?: AttackKind;
  hand?: DuelHand;
  /** Плоская добавка (приём, щит). */
  bonus?: number;
  /** Множитель урона (контратака). */
  mult?: number;
  forceCrit?: boolean;
  /** Точный урон без броска и силы (Варвар: недостающее здоровье). */
  fixed?: number;
  /** Магический удар (Единение стихий): без силы и без брони, множитель магии. */
  magic?: boolean;
}

/** Шанс попасть: меткость оружия и вида удара против уклонения (как в бою). */
export function duelHitChance(attacker: DuelFighter, defender: DuelFighter, kind: AttackKind = "normal", cls?: GearClass): number {
  const weapon = cls ?? strongestHand(attacker).cls;
  const accuracy = Math.min(ACCURACY_MAX, Math.max(ACCURACY_MIN, WEAPON_ACCURACY[weapon] + ATTACK_KIND_META[kind].accuracy)) / 100;
  return heroHitChance(accuracy, defender.evade);
}

type StrikeOutcome = "hit" | "miss" | "immune";

/** Один удар: меткость против уклонения, урон, крит, защита, неуязвимость. */
function strike(attacker: DuelFighter, defender: DuelFighter, o: StrikeOpts): { dmg: number; text: string; outcome: StrikeOutcome } {
  const kind = o.kind ?? "normal";
  const hand: DuelHand = o.hand ?? { lo: attacker.hit[0], hi: attacker.hit[1], cost: 0, power: 0, cls: strongestHand(attacker).cls, name: attacker.weaponName };
  const chance = duelHitChance(attacker, defender, kind, hand.cls);
  if (Math.random() >= chance) {
    return { dmg: 0, text: `${attacker.name} — ${o.label}: промах.`, outcome: "miss" };
  }
  const base = kind === "risky" ? hand.hi : kind === "safe" ? hand.lo : rollDie(hand.lo, hand.hi);
  const bonus = Math.max(0, Math.round(o.bonus ?? 0));
  let raw: number;
  if (o.magic) {
    raw = Math.round((base + bonus) * attacker.magicMult * (o.mult ?? 1) * chillMult(attacker));
  } else {
    raw = o.fixed !== undefined ? o.fixed : base + attacker.strFlat + bonus;
    raw = Math.round(raw * (o.mult ?? 1) * chillMult(attacker) * (o.fixed === undefined ? edgeMult(attacker) : 1));
  }
  const crit = !!o.forceCrit || Math.random() < attacker.crit;
  if (crit) raw = Math.round(raw * attacker.critDamage);
  if (defender.invulnerable) {
    return { dmg: 0, text: `${attacker.name} — ${o.label}: ${defender.name} неуязвим.`, outcome: "immune" };
  }
  /* Магия не режется броней: в дуэли у соперника нет магического сопротивления. */
  const dmg = o.magic ? Math.max(1, raw) : Math.max(1, raw - armorNow(defender));
  return {
    dmg,
    text: `${attacker.name} — ${o.label}: ${dmg} урона${crit ? " — критический удар!" : ""}${defender.guard && !o.magic ? " (броня защиты +10)" : ""}.`,
    outcome: "hit",
  };
}

/** Урон периодического эффекта за один тик. Иссушение берёт долю макс. ОЗ цели. */
function dotDamage(f: DuelFighter, e: DuelEffect): number {
  if (e.kind === "drain") return Math.max(1, Math.ceil(f.maxHp * DUEL_DRAIN_SHARE));
  return Math.max(1, e.value + (e.bonus ?? 0));
}

/**
 * Лечение: запрещено эффектом «Иссушение» масла или «Истощение» (noheal).
 * Возвращает реально восстановленные ОЗ.
 */
function healFighter(state: DuelState, side: DuelSide, amount: number): number {
  const f = state[side];
  if (f.effects.some((e) => e.kind === "noheal")) {
    say(state, `${f.name} не может восстанавливать здоровье: эффект запрещает лечение.`, null);
    return 0;
  }
  const before = f.hp;
  f.hp = Math.min(f.maxHp, f.hp + Math.max(0, Math.round(amount)));
  const healed = f.hp - before;
  recordHit(state, side, "heal", healed);
  return healed;
}

/** Один тик периодического эффекта: урон цели, для иссушения — лечение источника. */
function tickDot(state: DuelState, side: DuelSide, e: DuelEffect) {
  const f = state[side];
  const dmg = dotDamage(f, e);
  const type = DOT_TYPE[e.kind as "burn" | "bleed" | "poison" | "ice" | "drain"];
  f.hp -= dmg;
  recordHit(state, side, "dmg", dmg, type);
  if (e.kind === "drain") {
    const src = state[e.source];
    const healed = src.hp > 0 ? healFighter(state, e.source, dmg) : 0;
    say(state, `${src.name} иссушает ${f.name}: −${dmg} здоровья, ${src.name} лечится на ${healed}.`, type);
  } else {
    say(state, `${f.name}: ${e.name.toLowerCase()} — −${dmg} здоровья.`, type);
  }
}

/**
 * Накладывает периодический эффект: первый тик сразу, затем по одному в начале каждого хода носителя.
 * N ходов = N тиков. Сильнейший тик держится (как в бою); срок продлевается.
 */
function applyDot(
  state: DuelState,
  side: DuelSide,
  o: { kind: "burn" | "bleed" | "poison" | "ice" | "drain"; name: string; source: DuelSide; value: number; rounds: number; pct?: number; bonus?: number },
) {
  const target = state[side];
  if (target.hp <= 0) return;
  const prev = target.effects.find((e) => e.kind === o.kind);
  const remaining = Math.max(0, o.rounds - 1);
  const value = prev && prev.rounds > 0 ? Math.max(prev.value, o.value) : o.value;
  const effect: DuelEffect = {
    kind: o.kind,
    name: o.name,
    rounds: Math.max(remaining, prev?.rounds ?? 0),
    value,
    source: o.source,
    ...(o.pct !== undefined ? { pct: o.pct } : {}),
    ...(o.bonus ? { bonus: o.bonus } : {}),
  };
  tickDot(state, side, effect);
  if (remaining > 0) {
    target.effects = [...target.effects.filter((e) => e.kind !== o.kind), effect];
  }
}

/** Ход носителя начинается: тики его периодических эффектов; у каждого тика срок в ходах. */
function tickSide(state: DuelState, side: DuelSide) {
  const f = state[side];
  const next: DuelEffect[] = [];
  for (const e of f.effects) {
    if (!isDot(e.kind)) {
      next.push(e);
      continue;
    }
    if (f.hp > 0) tickDot(state, side, e);
    const rounds = e.rounds - 1;
    if (rounds > 0) next.push({ ...e, rounds });
    else say(state, `${f.name}: эффект «${e.name}» закончился.`, null);
  }
  f.effects = next;
}

/** Смена раунда: сроки эффектов без тиков и срок смазки клинка. */
function expireRound(state: DuelState) {
  for (const side of ["a", "b"] as const) {
    const f = state[side];
    f.effects = f.effects.flatMap((e) => {
      if (isDot(e.kind)) return [e];
      const rounds = e.rounds - 1;
      if (rounds > 0) return [{ ...e, rounds }];
      say(state, `${f.name}: эффект «${e.name}» закончился.`, null);
      return [];
    });
    if (f.coat) {
      const rounds = f.coat.rounds - 1;
      if (rounds > 0) f.coat = { ...f.coat, rounds };
      else {
        f.coat = null;
        say(state, `${f.name}: смазка клинка сошла.`, null);
      }
    }
  }
}

function finishTurn(state: DuelState, now: number): void {
  state.seq += 1;
  const next = other(state.turn);
  state.turn = next;
  if (next === "a") {
    state.round += 1;
    expireRound(state);
  }
  const fighter = state[next];
  /* Защита и неуязвимость действуют до начала собственного хода. */
  fighter.guard = false;
  fighter.invulnerable = false;
  fighter.stamina = Math.min(fighter.staminaMax, fighter.stamina + STAMINA_TURN_RECOVERY);
  fighter.cooldown = Math.max(0, fighter.cooldown - 1);
  /* Тики v2: периодика срабатывает в начале хода носителя. */
  tickSide(state, next);
  state.apLeft = fighter.ap;
  state.deadline = now + DUEL_TURN_MS;
  checkWinner(state);
  if (state.winner) state.deadline = 0;
}

function checkWinner(state: DuelState): boolean {
  if (state.winner) return true;
  if (state.a.hp <= 0 && state.b.hp <= 0) {
    /* Обоюдная смерть: победа остаётся тому, у кого больше здоровья,
       при полном равенстве — защищавшейся стороне "b". */
    state.winner = state.a.hp > state.b.hp ? "a" : "b";
  } else if (state.a.hp <= 0) state.winner = "b";
  else if (state.b.hp <= 0) state.winner = "a";
  if (state.winner) {
    const winner = state[state.winner];
    const loser = state[other(state.winner)];
    loser.hp = Math.max(0, loser.hp);
    say(state, `${winner.name} побеждает в дуэли. ${loser.name} остаётся на ${loser.hp} ОЗ.`);
  }
  return state.winner !== null;
}

/** Проки клинка при попадании: кровотечение, яд, жар, обморожение и раскол — по шансу каждый. */
function applyProcs(state: DuelState, side: DuelSide) {
  const actor = state[side];
  const target = state[other(side)];
  const roll = (k: DuelProcKey): DuelProc | null => {
    const p = actor.procs[k];
    return p && Math.random() < p.chance ? p : null;
  };
  const bleed = roll("bleed");
  if (bleed && target.hp > 0) applyDot(state, other(side), { kind: "bleed", name: "Кровотечение", source: side, value: bleed.value, rounds: PROC_ROUNDS });
  const poison = roll("poison");
  if (poison && target.hp > 0) applyDot(state, other(side), { kind: "poison", name: "Яд", source: side, value: poison.value, rounds: PROC_ROUNDS });
  const sunder = roll("sunder");
  if (sunder && target.hp > 0 && target.armor > 0) {
    const amount = sunderBreakAmount(sunder.value);
    target.armor = Math.max(0, target.armor - amount);
    say(state, `Раскол клинка: броня ${target.name} −${amount} (осталось ${target.armor}).`, null);
  }
  const scorch = roll("scorch");
  if (scorch && target.hp > 0) applyDot(state, other(side), { kind: "burn", name: "Жар", source: side, value: scorch.value, rounds: PROC_ROUNDS });
  const frost = roll("frost");
  if (frost && target.hp > 0) applyDot(state, other(side), { kind: "ice", name: "Обморожение", source: side, value: frost.value, rounds: PROC_ROUNDS });
}

/** Смазка клинка при попадании: эффект масла на цель (острота — урон, см. strike). */
function applyCoatHit(state: DuelState, side: DuelSide) {
  const actor = state[side];
  const coat = actor.coat;
  const target = state[other(side)];
  if (!coat || coat.rounds <= 0 || target.hp <= 0) return;
  const to = other(side);
  switch (coat.oil) {
    case "fire":
      applyDot(state, to, { kind: "burn", name: "Горение", source: side, value: coat.power, rounds: OIL_ROUNDS });
      return;
    case "ice":
      applyDot(state, to, { kind: "ice", name: "Лёд", source: side, value: coat.power, rounds: OIL_ROUNDS, pct: coat.cut * 100 });
      return;
    case "sunder":
      target.effects = [
        ...target.effects.filter((e) => e.kind !== "break"),
        { kind: "break", name: "Раскол", rounds: OIL_ROUNDS, value: coat.power, source: side },
      ];
      say(state, `Раскол: броня ${target.name} −${coat.power} на ${OIL_ROUNDS} раунда.`, null);
      return;
    case "weak":
      target.effects = [
        ...target.effects.filter((e) => e.kind !== "weak"),
        { kind: "weak", name: "Разрушение", rounds: OIL_ROUNDS, value: Math.round(coat.power * 100), source: side },
      ];
      say(state, `Разрушение: броня ${target.name} −${Math.round(coat.power * 100)}% на ${OIL_ROUNDS} раунда.`, null);
      return;
    case "magic": {
      const dmg = Math.max(1, Math.round(coat.power * actor.magicMult));
      target.hp -= dmg;
      recordHit(state, to, "dmg", dmg, "magic");
      say(state, `Масло магии: ${dmg} магического урона.`, "magic");
      return;
    }
    case "drain":
      target.effects = [
        ...target.effects.filter((e) => e.kind !== "noheal"),
        { kind: "noheal", name: "Иссушение", rounds: DUEL_HEAL_BLOCK_ROUNDS, value: 0, source: side },
      ];
      say(state, `${target.name} не может восстанавливать здоровье: иссушение масла на ${DUEL_HEAL_BLOCK_ROUNDS} раунда.`, null);
      return;
    case "exhaust":
      /* Снимает щит и запрещает лечение: в дуэли у соперника нет призывов и ярости. */
      if (target.bulwarkBonus > 0) target.bulwarkBonus = 0;
      target.effects = [
        ...target.effects.filter((e) => e.kind !== "noheal"),
        { kind: "noheal", name: "Истощение", rounds: EXHAUST_ROUNDS, value: 0, source: side },
      ];
      say(state, `Масло истощения: щит ${target.name} снят, лечение заблокировано на ${EXHAUST_ROUNDS} раунда.`, null);
      return;
    case "fatigue": {
      const before = target.stamina;
      target.stamina = Math.max(0, target.stamina - coat.power);
      say(state, `Масло усталости: у ${target.name} −${before - target.stamina} выносливости.`, null);
      return;
    }
    default:
      return;
  }
}

/** Единение стихий: приём с шансом 25% накладывает горение (50%) или обморожение (50%). Бонус тика за уровень. */
function unityProc(state: DuelState, side: DuelSide) {
  const actor = state[side];
  const to = other(side);
  if (actor.archmage < 5 || state[to].hp <= 0 || Math.random() >= UNITY_CHANCE) return;
  const lvl = Math.max(1, Math.floor(actor.level));
  const rounds = actor.archmage >= 10 ? UNTIL_END : PROC_ROUNDS;
  if (Math.random() < 0.5) {
    applyDot(state, to, { kind: "burn", name: "Горение", source: side, value: 0, rounds, bonus: lvl * UNITY_BURN_PER_LEVEL });
    say(state, `Единение стихий: горение на ${state[to].name} (бонус ×${UNITY_BURN_PER_LEVEL} уровня).`, "fire");
  } else {
    applyDot(state, to, { kind: "ice", name: "Обморожение", source: side, value: 0, rounds, pct: DUEL_CHILL_PCT, bonus: lvl * UNITY_CHILL_PER_LEVEL });
    say(state, `Единение стихий: обморожение на ${state[to].name} (бонус ×${UNITY_CHILL_PER_LEVEL} уровня).`, "ice");
  }
}

/** После попадания героя: проки клинка, смазка и (для приёма) Единение стихий. */
function applyOnHit(state: DuelState, side: DuelSide, technique: boolean) {
  if (state[other(side)].hp <= 0) return;
  applyProcs(state, side);
  applyCoatHit(state, side);
  if (technique) unityProc(state, side);
}

/** Спец-приём архетипа, по смыслу как в бою, на полях дуэли. Вызывать только после проверки ошибок. */
function runArchetypeSpecial(state: DuelState, side: DuelSide) {
  const actor = state[side];
  const target = state[other(side)];
  const arch = actor.archetype;
  if (!arch) return;
  const sp = ARCHETYPES[arch].special;
  say(state, `«${sp.name}»: концентрация потрачена.`);
  if (arch === "barbarian") {
    const missing = Math.max(1, actor.maxHp - actor.hp);
    const r = strike(actor, target, { label: `[${sp.name}: недостающее здоровье ${missing}]`, fixed: missing });
    target.hp -= r.dmg;
    recordStrike(state, other(side), r, "phys");
    say(state, r.text);
  } else if (arch === "bulwark") {
    actor.guard = true;
    const shield = Math.max(1, armorNow(actor));
    const heal = Math.min(actor.maxHp - actor.hp, shield);
    healFighter(state, side, Math.max(0, heal));
    actor.bulwarkBonus += shield;
    say(state, `Стойка-щит: +${Math.max(0, heal)} здоровья; следующий удар получит +${shield} урона от брони.`);
  } else if (arch === "assassin") {
    const r = strike(actor, target, { label: `[${sp.name}, КРИТ!]`, forceCrit: true });
    target.hp -= r.dmg;
    recordStrike(state, other(side), r, "phys");
    healFighter(state, side, Math.round(r.dmg * 0.2));
    say(state, r.text);
  } else if (arch === "duelist") {
    const r = strike(actor, target, { label: `[Ответный залп]`, mult: DUEL_VOLLEY_MULT });
    target.hp -= r.dmg;
    recordStrike(state, other(side), r, "phys");
    say(state, r.text);
    if (target.hp > 0) {
      target.effects = [
        ...target.effects.filter((e) => e.kind !== "break"),
        { kind: "break", name: "Раскол", rounds: DUEL_BREAK_ROUNDS, value: DUEL_BREAK_VALUE, source: side },
      ];
      say(state, `${target.name}: броня −${DUEL_BREAK_VALUE} на ${DUEL_BREAK_ROUNDS} раунда.`);
    }
  } else if (arch === "warlock") {
    actor.hp = Math.max(1, Math.round(actor.maxHp * WARLOCK_HP_SHARE));
    actor.invulnerable = true;
    say(state, `Жертвенный пакт: здоровье ${actor.hp}/${actor.maxHp}, неуязвимость до своего хода.`);
    applyDot(state, other(side), { kind: "drain", name: "Иссушение", source: side, value: 0, rounds: SPECIAL_EFFECT_ROUNDS });
  } else if (arch === "archmage") {
    const dmg = Math.max(1, Math.round(techniqueDamage(actor.intStat, 1)));
    target.hp -= dmg;
    recordHit(state, other(side), "dmg", dmg, "magic");
    say(state, `Слово созидания: магический удар ${dmg} урона.`, "magic");
    if (Math.random() < 0.5) {
      const tick = Math.max(1, dotBaseTick("burn", actor.level));
      applyDot(state, other(side), { kind: "burn", name: "Горение", source: side, value: tick, rounds: SPECIAL_EFFECT_ROUNDS });
    } else {
      target.effects = [
        ...target.effects.filter((e) => e.kind !== "chill"),
        { kind: "chill", name: "Обморожение", rounds: SPECIAL_EFFECT_ROUNDS, value: DUEL_CHILL_PCT, source: side },
      ];
      say(state, `${target.name} скован холодом: урон −${DUEL_CHILL_PCT}% на ${SPECIAL_EFFECT_ROUNDS} раунда.`);
    }
  }
}

/**
 * Ход игрока. Возвращает новое состояние; при ошибке команда отклоняется
 * (сервер проверяет то же самое через duelActionError).
 */
export function duelAction(state0: DuelState, side: DuelSide, action: DuelAction, now = Date.now()): DuelState {
  const state: DuelState = structuredClone(state0);
  alignLog(state);
  state.hits = [];
  if (state.winner) return state;
  if (state.turn !== side) return state;
  if (duelActionError(state, side, action)) return state;
  const actor = state[side];
  const target = state[other(side)];

  /* Бонус щита уходит в первый удар, который будет нанесён. */
  const takeShield = () => {
    const b = actor.bulwarkBonus;
    actor.bulwarkBonus = 0;
    return b;
  };

  let costsAction = true;
  switch (action.type) {
    case "attack": {
      const kind = action.kind ?? "normal";
      actor.stamina -= duelAttackCost(actor);
      actor.concentration = clampConcentration(actor.concentration + duelConcentrationDelta(action));
      /* Единение стихий: приём на перезарядке — обычная атака магическая. */
      const magic = actor.archmage >= 5 && actor.cooldown > 0;
      let shield = takeShield();
      for (const hand of actor.hands) {
        const r = strike(actor, target, { label: `удар (${hand.name})`, kind, hand, bonus: shield, magic });
        shield = 0;
        target.hp -= r.dmg;
        recordStrike(state, other(side), r, magic ? "magic" : "phys");
        say(state, r.text);
        if (r.outcome === "hit") applyOnHit(state, side, false);
      }
      break;
    }
    case "technique": {
      const skill = actor.skill!;
      const bonus = Math.round(weaponTechniqueBonus(actor.skillStat, skill.scaleMult));
      actor.stamina -= duelTechniqueCost(actor);
      actor.concentration = clampConcentration(actor.concentration - TECHNIQUE_CONCENTRATION);
      const r = strike(actor, target, {
        label: `приём «${skill.name}»`,
        hand: { lo: actor.hit[0], hi: actor.hit[1], cost: 0, power: 0, cls: strongestHand(actor).cls, name: actor.weaponName },
        bonus: bonus + takeShield(),
      });
      target.hp -= r.dmg;
      recordStrike(state, other(side), r, "phys");
      actor.cooldown = skill.cooldown;
      say(state, r.text);
      if (r.outcome === "hit") applyOnHit(state, side, true);
      break;
    }
    case "archetype_skill": {
      actor.concentration = clampConcentration(actor.concentration - SPECIAL_CONCENTRATION);
      runArchetypeSpecial(state, side);
      break;
    }
    case "guard": {
      /* Защита не тратит действие хода: повторять можно, пока хватает выносливости. */
      costsAction = false;
      actor.stamina -= STAMINA_GUARD;
      actor.concentration = clampConcentration(actor.concentration + GUARD_CONCENTRATION);
      actor.guard = true;
      say(state, `${actor.name} закрывается и готовится к удару: броня +${DUEL_GUARD_ARMOR}.`);
      break;
    }
    case "potion": {
      actor.stamina -= STAMINA_BACKPACK;
      actor.concentration = clampConcentration(actor.concentration + POTION_CONCENTRATION);
      actor.potions -= 1;
      const healed = healFighter(state, side, DUEL_POTION_HEAL);
      say(state, `${actor.name} выпивает зелье: +${healed} здоровья (${actor.hp}/${actor.maxHp}).`);
      break;
    }
    case "oil": {
      /* Масло из сумки: смазывает клинок на срок масла; эффект — на каждом попадании. */
      const item = actor.oils.find((o) => o.id === action.id)!;
      actor.stamina -= STAMINA_BACKPACK;
      actor.concentration = clampConcentration(actor.concentration + POTION_CONCENTRATION);
      actor.oils = actor.oils.flatMap((o) => (o.id !== item.id ? [o] : o.count > 1 ? [{ ...o, count: o.count - 1 }] : []));
      actor.coat = { oil: item.oil, power: item.power, cut: item.cut, rounds: item.coat };
      say(state, `${actor.name} смазывает клинок: ${OIL_NAMES[item.oil]}, ${item.coat} раунда.`);
      break;
    }
    case "pass": {
      say(state, `${actor.name} заканчивает ход.`);
      state.apLeft = 0;
      costsAction = false;
      break;
    }
    case "flee": {
      /* Побег в дуэли — сдача: соперник побеждает, предметы не теряются. */
      say(state, `${actor.name} сдаётся.`);
      state.winner = other(side);
      say(state, `${target.name} побеждает в дуэли. ${actor.name} остаётся на ${actor.hp} ОЗ.`);
      state.seq += 1;
      state.deadline = 0;
      return state;
    }
  }

  if (costsAction) state.apLeft -= 1;
  state.seq += 1;
  if (checkWinner(state)) {
    state.deadline = 0;
    return state;
  }
  if (state.apLeft <= 0) finishTurn(state, now);
  return state;
}

/** Время на ход вышло — ход переходит сопернику, потраченные действия сгорают. */
export function duelTimeout(state0: DuelState, now = Date.now()): DuelState {
  const state: DuelState = structuredClone(state0);
  alignLog(state);
  state.hits = [];
  if (state.winner || now < state.deadline) return state;
  say(state, `${state[state.turn].name} не успевает за 20 секунд — ход пропущен.`);
  finishTurn(state, now);
  state.seq += 1;
  return state;
}

/** Урон, который удар принесёт на текущем здоровье защитника: как strike, без броска и без крита. */
function strikeDamageOf(attacker: DuelFighter, defender: DuelFighter, base: number, bonus = 0, mult = 1, magic = false): number {
  if (defender.invulnerable) return 0;
  if (magic) return Math.max(1, Math.round((base + Math.max(0, Math.round(bonus))) * attacker.magicMult * mult * chillMult(attacker)));
  const raw = Math.round((base + attacker.strFlat + Math.max(0, Math.round(bonus))) * mult * chillMult(attacker) * edgeMult(attacker));
  return Math.max(1, raw - armorNow(defender));
}

/** Эффекты проков клинка для подсказки: урон и тики с шансом. Раскол — в тексте (это броня, не урон). */
function weaponProcParts(a: DuelFighter): AttackDamagePart[] {
  const parts: AttackDamagePart[] = [];
  const dot = (key: "bleed" | "poison" | "scorch" | "frost", type: DamageNumberType, label: string) => {
    const p = a.procs[key];
    if (!p) return;
    parts.push({ type, min: p.value, max: p.value, effect: true, chance: p.chance, ticks: PROC_ROUNDS, source: `${label}: тик за ход носителя, ${PROC_ROUNDS} хода.` });
  };
  dot("bleed", "bleed", "Кровотечение от клинка");
  dot("poison", "poison", "Яд с клинка");
  dot("scorch", "fire", "Жар клинка (горение)");
  dot("frost", "ice", "Обморожение клинка");
  return parts;
}

function procNote(a: DuelFighter): string {
  const s = a.procs.sunder;
  return s ? `Раскол клинка: шанс ${Math.round(s.chance * 100)}%, броня защищающегося −${sunderBreakAmount(s.value)} навсегда.` : "";
}

/** Смазка клинка для подсказки: урон и тики — частями, остальные эффекты — текстом. */
function coatParts(a: DuelFighter): { parts: AttackDamagePart[]; note: string } {
  const c = a.coat;
  if (!c || c.rounds <= 0) return { parts: [], note: "" };
  const name = OIL_NAMES[c.oil];
  switch (c.oil) {
    case "fire":
      return { parts: [{ type: "fire", min: c.power, max: c.power, effect: true, ticks: OIL_ROUNDS, source: `${name}: горение на попадании, тик за ход.` }], note: "" };
    case "ice":
      return { parts: [{ type: "ice", min: c.power, max: c.power, effect: true, ticks: OIL_ROUNDS, source: `${name}: лёд на попадании; атаки цели −${Math.round(c.cut * 100)}%.` }], note: "" };
    case "magic": {
      const dmg = Math.max(1, Math.round(c.power * a.magicMult));
      return { parts: [{ type: "magic", min: dmg, max: dmg, effect: false, source: `${name}: магический удар на каждом попадании.` }], note: "" };
    }
    case "sunder":
      return { parts: [], note: `${name}: броня цели −${c.power} на ${OIL_ROUNDS} раунда.` };
    case "weak":
      return { parts: [], note: `${name}: броня цели −${Math.round(c.power * 100)}% на ${OIL_ROUNDS} раунда.` };
    case "edge":
      return { parts: [], note: `${name}: урон атак +${c.power}%.` };
    case "drain":
      return { parts: [], note: `${name}: цель не лечится ${OIL_ROUNDS} раунда.` };
    case "exhaust":
      return { parts: [], note: `${name}: щит цели снимается, лечение заблокировано.` };
    case "fatigue":
      return { parts: [], note: `${name}: цель теряет ${c.power} выносливости на попадании.` };
    default:
      return { parts: [], note: "" };
  }
}

/** Единение стихий для подсказки приёма: 25% после попадания, горение или обморожение. */
function unityParts(a: DuelFighter): AttackDamagePart[] {
  if (a.archmage < 5) return [];
  const lvl = Math.max(1, Math.floor(a.level));
  const rounds = a.archmage >= 10 ? undefined : PROC_ROUNDS;
  const until = a.archmage >= 10 ? " До конца дуэли." : "";
  return [
    {
      type: "fire",
      min: lvl * UNITY_BURN_PER_LEVEL,
      max: lvl * UNITY_BURN_PER_LEVEL,
      effect: true,
      chance: UNITY_CHANCE / 2,
      ticks: rounds,
      source: `Единение стихий: горение на цели, бонус тика ×${UNITY_BURN_PER_LEVEL} уровня.${until}`,
    },
    {
      type: "ice",
      min: lvl * UNITY_CHILL_PER_LEVEL,
      max: lvl * UNITY_CHILL_PER_LEVEL,
      effect: true,
      chance: UNITY_CHANCE / 2,
      ticks: rounds,
      source: `Единение стихий: обморожение на цели (урон −${DUEL_CHILL_PCT}%), бонус тика ×${UNITY_CHILL_PER_LEVEL} уровня.${until}`,
    },
  ];
}

/**
 * Разбор обычной атаки по типам для подсказки кнопки. Прямой урон: оружие по видам удара
 * (физический; магический на перезарядке приёма), без крита. Проки клинка и смазка — эффектами.
 */
export function duelAttackBreakdown(
  attacker: DuelFighter,
  defender: DuelFighter,
  kind: AttackKind,
): { direct: AttackDamagePart[]; procs: AttackDamagePart[] } {
  const magic = attacker.archmage >= 5 && attacker.cooldown > 0;
  let min = 0;
  let max = 0;
  attacker.hands.forEach((hand, i) => {
    const bonus = i === 0 ? attacker.bulwarkBonus : 0;
    const lo = kind === "risky" ? hand.hi : hand.lo;
    const hi = kind === "safe" ? hand.lo : hand.hi;
    min += strikeDamageOf(attacker, defender, lo, bonus, 1, magic);
    max += strikeDamageOf(attacker, defender, hi, bonus, 1, magic);
  });
  const hands = attacker.hands.length;
  const coat = coatParts(attacker);
  const notes = [
    hands > 1 ? `За ${hands} удара.` : "",
    magic ? "Приём на перезарядке: удар магический, без брони." : "",
    attacker.bulwarkBonus > 0 ? `Щит: +${attacker.bulwarkBonus} к первому удару.` : "",
    defender.invulnerable ? `${defender.name} неуязвим: урона нет.` : "",
    procNote(attacker),
    coat.note,
  ].filter(Boolean);
  return {
    direct: [
      {
        type: magic ? "magic" : "phys",
        min,
        max,
        effect: false,
        source: [magic ? "Магический удар по типу оружия." : "Оружие: удар, СИЛ добавлена; броня защищающегося вычитается.", ...notes].join(" "),
      },
    ],
    procs: [...weaponProcParts(attacker), ...coat.parts],
  };
}

/** Разбор приёма оружия по типам: удар оружием с бонусом приёма (ХАР), без крита, и эффекты при попадании. */
export function duelTechniqueBreakdown(
  attacker: DuelFighter,
  defender: DuelFighter,
): { direct: AttackDamagePart[]; procs: AttackDamagePart[] } {
  const skill = attacker.skill;
  const bonus = skill ? Math.round(weaponTechniqueBonus(attacker.skillStat, skill.scaleMult)) : 0;
  const shield = attacker.bulwarkBonus;
  const coat = coatParts(attacker);
  const notes = [procNote(attacker), coat.note].filter(Boolean).join(" ");
  return {
    direct: [
      {
        type: "phys",
        min: strikeDamageOf(attacker, defender, attacker.hit[0], bonus + shield),
        max: strikeDamageOf(attacker, defender, attacker.hit[1], bonus + shield),
        effect: false,
        source: [`Приём «${skill?.name ?? "оружия"}»: бонус приёма от ${skill ? (skill.scaleStat === "int" ? "интеллекта" : "характеристики") : "—"} и удар оружием, без крита.`, notes].filter(Boolean).join(" "),
      },
    ],
    procs: [...weaponProcParts(attacker), ...coat.parts, ...unityParts(attacker)],
  };
}

/**
 * Разбор спец-приёма архетипа по типам: прямой урон и эффекты, которые приём накладывает.
 * Щит, защита и концентрация урона не наносят — для них разбора нет.
 */
export function duelSpecialBreakdown(
  actor: DuelFighter,
  target: DuelFighter,
): { direct: AttackDamagePart[]; procs: AttackDamagePart[] } {
  const none = { direct: [] as AttackDamagePart[], procs: [] as AttackDamagePart[] };
  if (!actor.archetype) return none;
  const level = Math.max(1, Math.floor(actor.level));
  switch (actor.archetype) {
    case "barbarian": {
      const missing = Math.max(1, actor.maxHp - actor.hp);
      const dmg = target.invulnerable ? 0 : Math.max(1, Math.round(missing * chillMult(actor)) - armorNow(target));
      return {
        direct: [{ type: "phys", min: dmg, max: dmg, effect: false, source: `Варвар: урон равен недостающему здоровью (${missing}); броня режет, без броска.` }],
        procs: [],
      };
    }
    case "assassin": {
      const crit = actor.critDamage;
      return {
        direct: [
          {
            type: "phys",
            min: strikeDamageOf(actor, target, actor.hit[0], 0, crit),
            max: strikeDamageOf(actor, target, actor.hit[1], 0, crit),
            effect: false,
            source: `Ассасин: гарантированный крит ×${crit.toFixed(1)}; 20% урона лечит героя.`,
          },
        ],
        procs: [],
      };
    }
    case "duelist": {
      const vol = (base: number) => strikeDamageOf(actor, target, base, 0, DUEL_VOLLEY_MULT);
      return {
        direct: [
          {
            type: "phys",
            min: vol(actor.hit[0]),
            max: vol(actor.hit[1]),
            effect: false,
            source: `Ответный залп: ${Math.round(DUEL_VOLLEY_MULT * 100)}% удара. Если соперник жив, броня −${DUEL_BREAK_VALUE} на ${DUEL_BREAK_ROUNDS} раунда.`,
          },
        ],
        procs: [],
      };
    }
    case "warlock":
      return {
        direct: [],
        procs: [
          {
            type: "pure",
            min: Math.max(1, Math.ceil(target.maxHp * DUEL_DRAIN_SHARE)),
            max: Math.max(1, Math.ceil(target.maxHp * DUEL_DRAIN_SHARE)),
            effect: true,
            ticks: SPECIAL_EFFECT_ROUNDS,
            trigger: "Срабатывает сразу, без броска",
            source: `Жертвенный пакт: иссушение цели ${Math.round(DUEL_DRAIN_SHARE * 100)}% макс. ОЗ в ход; иссушающий получает столько же. Чистый урон, без брони.`,
          },
        ],
      };
    case "archmage": {
      const [lo, hi] = dotTickSpan("burn", level, false);
      const magic = Math.max(1, Math.round(techniqueDamage(actor.intStat, 1)));
      return {
        direct: [
          {
            type: "magic",
            min: magic,
            max: magic,
            effect: false,
            trigger: "Срабатывает сразу, без броска",
            source: "Слово созидания: магический удар по интеллекту, без брони.",
          },
        ],
        procs: [
          {
            type: "fire",
            min: lo,
            max: hi,
            effect: true,
            chance: 0.5,
            ticks: SPECIAL_EFFECT_ROUNDS,
            source: "Слово созидания: горение на 3 хода с шансом 50%; иначе обморожение (урон −10%, без урона).",
          },
        ],
      };
    }
    default:
      return none;
  }
}

export function duelActionError(state: DuelState, side: DuelSide, action: DuelAction): string | null {
  if (state.winner) return "Дуэль уже закончена";
  if (state.turn !== side) return "Сейчас ход соперника";
  const actor = state[side];
  switch (action.type) {
    case "attack": {
      const kind = action.kind ?? "normal";
      if (!ATTACK_KINDS.includes(kind)) return "Неизвестный вид удара";
      const cost = duelAttackCost(actor);
      if (actor.stamina < cost) return `Не хватает выносливости: нужно ${cost}, есть ${actor.stamina}`;
      if (kind === "risky" && actor.concentration < RISKY_CONCENTRATION) {
        return `Мощный удар требует ${RISKY_CONCENTRATION} концентрации (сейчас ${actor.concentration}).`;
      }
      return null;
    }
    case "technique": {
      if (!actor.skill) return "У оружия нет приёма";
      if (actor.intStat < actor.skill.intReq) return `Нужен Интеллект ${actor.skill.intReq}`;
      if (actor.cooldown > 0) return `Приём перезаряжается ещё ${actor.cooldown}`;
      const cost = duelTechniqueCost(actor);
      if (actor.stamina < cost) return `Не хватает выносливости: нужно ${cost}, есть ${actor.stamina}`;
      if (actor.concentration < TECHNIQUE_CONCENTRATION) {
        return `Приём требует ${TECHNIQUE_CONCENTRATION} концентрации (сейчас ${actor.concentration}).`;
      }
      return null;
    }
    case "archetype_skill": {
      if (!actor.archetype) return "У тебя нет архетипа: спец-приём недоступен.";
      if (actor.concentration < SPECIAL_CONCENTRATION) {
        return `Спец-приём открывается при концентрации ${SPECIAL_CONCENTRATION} (сейчас ${actor.concentration}).`;
      }
      return null;
    }
    case "guard":
      if (actor.stamina < STAMINA_GUARD) return `Не хватает выносливости для защиты: нужно ${STAMINA_GUARD}`;
      return null;
    case "potion":
      if (actor.potions <= 0) return "Зелий не осталось";
      if (actor.stamina < STAMINA_BACKPACK) return `Не хватает выносливости для зелья: нужно ${STAMINA_BACKPACK}`;
      return null;
    case "oil": {
      if (!actor.oils.some((o) => o.id === action.id)) return "Этого масла нет в сумке";
      if (actor.stamina < STAMINA_BACKPACK) return `Не хватает выносливости для смазки: нужно ${STAMINA_BACKPACK}`;
      return null;
    }
    case "pass":
    case "flee":
      return null;
    default:
      return "Неизвестное действие";
  }
}
