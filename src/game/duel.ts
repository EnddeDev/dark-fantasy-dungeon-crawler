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
  techniqueDamage,
  weaponTechniqueBonus,
  type AttackKind,
} from "./battle";
import { ARCHETYPES, type ArchetypeId } from "./archetypes";
import { STAMINA_BACKPACK, STAMINA_GUARD, STAMINA_TECHNIQUE_EXTRA, STAMINA_TURN_RECOVERY, STAMINA_UNARMED, staminaMax } from "./stamina";
import { dotBaseTick } from "./statusEffects";
import type { GearClass, Player } from "./types";

/**
 * Дуэль один на один по правилам боя, но без монстров и этажа.
 * Выносливость, концентрация, виды удара, меткость, защита, приём, спец-приём архетипа
 * и побег-сдача считаются так же, как в подземелье (см. docs/online.md, «Дуэль»).
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

/** Эффект с таймером в раундах. burn/drain — тик за раунд; chill — −% урона; break — −брони. */
export interface DuelEffect {
  kind: "burn" | "chill" | "drain" | "break";
  name: string;
  rounds: number;
  /** burn — тик урона; chill — процент снижения урона; break — броня; drain — не используется. */
  value: number;
  /** Кто наложил эффект (нужно для иссушения: лечение достаётся ему). */
  source: DuelSide;
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

export interface DuelState {
  id: string;
  a: DuelFighter;
  b: DuelFighter;
  turn: DuelSide;
  round: number;
  apLeft: number;
  winner: DuelSide | null;
  log: string[];
  deadline: number;
  seq: number;
  /** Итог боя записан в профиль победителя/проигравшего ровно один раз. */
  settled?: boolean;
}

export type DuelAction =
  | { type: "attack"; kind?: AttackKind }
  | { type: "technique" }
  | { type: "archetype_skill" }
  | { type: "guard" }
  | { type: "potion" }
  | { type: "pass" }
  | { type: "flee" };

export const DUEL_TURN_MS = 20_000;
export const DUEL_POTION_HEAL = 28;
/** Защита: +10 брони (вместо урона × 0,5). */
export const DUEL_GUARD_ARMOR = 10;
/** Старт дуэли: половина максимума выносливости. */
export const DUEL_START_STAMINA_SHARE = 0.5;
/** Иссушение: тик за раунд — доля макс. ОЗ цели (как DRAIN_SHARE в бою). */
export const DUEL_DRAIN_SHARE = 0.06;
const DUEL_MAX_AP = 4;
const TECHNIQUE_CONCENTRATION = 1;
const RISKY_CONCENTRATION = 1;
const GUARD_CONCENTRATION = 2;
const POTION_CONCENTRATION = 1;
/** Слово созидания/пакта: сколько раундов держатся эффекты спец-приёма. */
const SPECIAL_EFFECT_ROUNDS = 3;
const DUEL_BREAK_VALUE = 3;
const DUEL_BREAK_ROUNDS = 2;
const DUEL_CHILL_PCT = 10;
/** Контратака Дуэлянта: доля урона оружия. */
const DUEL_VOLLEY_MULT = 0.6;
const WARLOCK_HP_SHARE = 0.5;

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
    } as DuelFighter;
  };
  return { ...state, a: fix(state.a), b: fix(state.b) };
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
  return {
    id,
    a: fa,
    b: fb,
    turn: "a",
    round: 1,
    apLeft: fa.ap,
    winner: null,
    log: [`${a.player.name} вызывает ${b.player.name} на дуэль. Ход первый, у каждого 20 секунд.`],
    deadline: now + DUEL_TURN_MS,
    seq: 0,
  };
}

const other = (side: DuelSide): DuelSide => (side === "a" ? "b" : "a");
const rollDie = (min: number, max: number) => min + Math.floor(Math.random() * Math.max(1, max - min + 1));
const clampConcentration = (v: number) => Math.max(0, Math.min(MAX_CONCENTRATION, v));

/** Концентрация за действие (как в бою): мощный −1, точный +1, приём −1, защита +2, зелье +1. */
export function duelConcentrationDelta(action: DuelAction): number {
  if (action.type === "attack") return action.kind === "risky" ? -1 : action.kind === "safe" ? 1 : 0;
  if (action.type === "technique") return -TECHNIQUE_CONCENTRATION;
  if (action.type === "archetype_skill") return -SPECIAL_CONCENTRATION;
  if (action.type === "guard") return GUARD_CONCENTRATION;
  if (action.type === "potion") return POTION_CONCENTRATION;
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

function armorNow(f: DuelFighter): number {
  const breaks = f.effects.filter((e) => e.kind === "break").reduce((s, e) => s + e.value, 0);
  return Math.max(0, f.armor + (f.guard ? DUEL_GUARD_ARMOR : 0) - breaks);
}

function chillMult(f: DuelFighter): number {
  const chill = f.effects.find((e) => e.kind === "chill");
  return chill ? 1 - chill.value / 100 : 1;
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
}

/** Шанс попасть: меткость оружия и вида удара против уклонения (как в бою). */
export function duelHitChance(attacker: DuelFighter, defender: DuelFighter, kind: AttackKind = "normal", cls?: GearClass): number {
  const weapon = cls ?? strongestHand(attacker).cls;
  const accuracy = Math.min(ACCURACY_MAX, Math.max(ACCURACY_MIN, WEAPON_ACCURACY[weapon] + ATTACK_KIND_META[kind].accuracy)) / 100;
  return heroHitChance(accuracy, defender.evade);
}

/** Один удар: меткость против уклонения, урон, крит, защита, неуязвимость. */
function strike(attacker: DuelFighter, defender: DuelFighter, o: StrikeOpts): { dmg: number; text: string } {
  const kind = o.kind ?? "normal";
  const hand: DuelHand = o.hand ?? { lo: attacker.hit[0], hi: attacker.hit[1], cost: 0, power: 0, cls: strongestHand(attacker).cls, name: attacker.weaponName };
  const chance = duelHitChance(attacker, defender, kind, hand.cls);
  if (Math.random() >= chance) {
    return { dmg: 0, text: `${attacker.name} — ${o.label}: промах.` };
  }
  const base = kind === "risky" ? hand.hi : kind === "safe" ? hand.lo : rollDie(hand.lo, hand.hi);
  let raw = o.fixed !== undefined ? o.fixed : base + attacker.strFlat + Math.max(0, Math.round(o.bonus ?? 0));
  raw = Math.round(raw * (o.mult ?? 1) * chillMult(attacker));
  const crit = !!o.forceCrit || Math.random() < attacker.crit;
  if (crit) raw = Math.round(raw * attacker.critDamage);
  if (defender.invulnerable) {
    return { dmg: 0, text: `${attacker.name} — ${o.label}: ${defender.name} неуязвим.` };
  }
  const dmg = Math.max(1, raw - armorNow(defender));
  return {
    dmg,
    text: `${attacker.name} — ${o.label}: ${dmg} урона${crit ? " — критический удар!" : ""}${defender.guard ? " (броня защиты +10)" : ""}.`,
  };
}

/** Тики раунда: горение, иссушение и срок эффектов. Вызывается при переходе на новый раунд. */
function tickRound(state: DuelState) {
  for (const side of ["a", "b"] as const) {
    const f = state[side];
    for (const e of [...f.effects]) {
      if (e.kind === "burn") {
        f.hp -= e.value;
        state.log.push(`${f.name} горит: −${e.value} здоровья.`);
      } else if (e.kind === "drain") {
        const dmg = Math.max(1, Math.ceil(f.maxHp * DUEL_DRAIN_SHARE));
        f.hp -= dmg;
        const src = state[e.source];
        if (src.hp > 0) src.hp = Math.min(src.maxHp, src.hp + dmg);
        state.log.push(`${src.name} иссушает ${f.name}: −${dmg} здоровья, ${src.name} лечится на ${dmg}.`);
      }
    }
    f.effects = f.effects
      .map((e) => ({ ...e, rounds: e.rounds - 1 }))
      .filter((e) => {
        if (e.rounds > 0) return true;
        state.log.push(`${f.name}: эффект «${e.name}» закончился.`);
        return false;
      });
  }
}

function finishTurn(state: DuelState, now: number): void {
  state.seq += 1;
  const next = other(state.turn);
  state.turn = next;
  if (next === "a") {
    state.round += 1;
    tickRound(state);
  }
  const fighter = state[next];
  /* Защита и неуязвимость действуют до начала собственного хода. */
  fighter.guard = false;
  fighter.invulnerable = false;
  fighter.stamina = Math.min(fighter.staminaMax, fighter.stamina + STAMINA_TURN_RECOVERY);
  fighter.cooldown = Math.max(0, fighter.cooldown - 1);
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
    state.log.push(`${winner.name} побеждает в дуэли. ${loser.name} остаётся на ${loser.hp} ОЗ.`);
  }
  return state.winner !== null;
}

/** Спец-приём архетипа, по смыслу как в бою, на полях дуэли. Вызывать только после проверки ошибок. */
function runArchetypeSpecial(state: DuelState, side: DuelSide) {
  const actor = state[side];
  const target = state[other(side)];
  const arch = actor.archetype;
  if (!arch) return;
  const sp = ARCHETYPES[arch].special;
  state.log.push(`«${sp.name}»: концентрация потрачена.`);
  if (arch === "barbarian") {
    const missing = Math.max(1, actor.maxHp - actor.hp);
    const { dmg, text } = strike(actor, target, { label: `[${sp.name}: недостающее здоровье ${missing}]`, fixed: missing });
    target.hp -= dmg;
    state.log.push(text);
  } else if (arch === "bulwark") {
    actor.guard = true;
    const shield = Math.max(1, armorNow(actor));
    const heal = Math.min(actor.maxHp - actor.hp, shield);
    actor.hp += Math.max(0, heal);
    actor.bulwarkBonus += shield;
    state.log.push(`Стойка-щит: +${Math.max(0, heal)} здоровья; следующий удар получит +${shield} урона от брони.`);
  } else if (arch === "assassin") {
    const { dmg, text } = strike(actor, target, { label: `[${sp.name}, КРИТ!]`, forceCrit: true });
    target.hp -= dmg;
    actor.hp = Math.min(actor.maxHp, actor.hp + Math.round(dmg * 0.2));
    state.log.push(text);
  } else if (arch === "duelist") {
    const { dmg, text } = strike(actor, target, { label: `[Ответный залп]`, mult: DUEL_VOLLEY_MULT });
    target.hp -= dmg;
    state.log.push(text);
    if (target.hp > 0) {
      target.effects = [
        ...target.effects.filter((e) => e.kind !== "break"),
        { kind: "break", name: "Раскол", rounds: DUEL_BREAK_ROUNDS, value: DUEL_BREAK_VALUE, source: side },
      ];
      state.log.push(`${target.name}: броня −${DUEL_BREAK_VALUE} на ${DUEL_BREAK_ROUNDS} раунда.`);
    }
  } else if (arch === "warlock") {
    actor.hp = Math.max(1, Math.round(actor.maxHp * WARLOCK_HP_SHARE));
    actor.invulnerable = true;
    state.log.push(`Жертвенный пакт: здоровье ${actor.hp}/${actor.maxHp}, неуязвимость до своего хода.`);
    target.effects = [
      ...target.effects.filter((e) => e.kind !== "drain"),
      { kind: "drain", name: "Иссушение", rounds: SPECIAL_EFFECT_ROUNDS, value: 0, source: side },
    ];
  } else if (arch === "archmage") {
    const dmg = Math.max(1, Math.round(techniqueDamage(actor.intStat, 1)));
    target.hp -= dmg;
    state.log.push(`Слово созидания: магический удар ${dmg} урона.`);
    if (Math.random() < 0.5) {
      const tick = Math.max(1, dotBaseTick("burn", actor.level));
      target.effects = [...target.effects.filter((e) => e.kind !== "burn"), { kind: "burn", name: "Горение", rounds: SPECIAL_EFFECT_ROUNDS, value: tick, source: side }];
      state.log.push(`${target.name} горит на ${SPECIAL_EFFECT_ROUNDS} раунда.`);
    } else {
      target.effects = [...target.effects.filter((e) => e.kind !== "chill"), { kind: "chill", name: "Обморожение", rounds: SPECIAL_EFFECT_ROUNDS, value: DUEL_CHILL_PCT, source: side }];
      state.log.push(`${target.name} скован холодом: урон −${DUEL_CHILL_PCT}% на ${SPECIAL_EFFECT_ROUNDS} раунда.`);
    }
  }
}

/**
 * Ход игрока. Возвращает новое состояние; при ошибке команда отклоняется
 * (сервер проверяет то же самое через duelActionError).
 */
export function duelAction(state0: DuelState, side: DuelSide, action: DuelAction, now = Date.now()): DuelState {
  const state: DuelState = structuredClone(state0);
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
      let shield = takeShield();
      for (const hand of actor.hands) {
        const { dmg, text } = strike(actor, target, { label: `удар (${hand.name})`, kind, hand, bonus: shield });
        shield = 0;
        target.hp -= dmg;
        state.log.push(text);
      }
      break;
    }
    case "technique": {
      const skill = actor.skill!;
      const bonus = Math.round(weaponTechniqueBonus(actor.skillStat, skill.scaleMult));
      actor.stamina -= duelTechniqueCost(actor);
      actor.concentration = clampConcentration(actor.concentration - TECHNIQUE_CONCENTRATION);
      const { dmg, text } = strike(actor, target, {
        label: `приём «${skill.name}»`,
        hand: { lo: actor.hit[0], hi: actor.hit[1], cost: 0, power: 0, cls: strongestHand(actor).cls, name: actor.weaponName },
        bonus: bonus + takeShield(),
      });
      target.hp -= dmg;
      actor.cooldown = skill.cooldown;
      state.log.push(text);
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
      state.log.push(`${actor.name} закрывается и готовится к удару: броня +${DUEL_GUARD_ARMOR}.`);
      break;
    }
    case "potion": {
      actor.stamina -= STAMINA_BACKPACK;
      actor.concentration = clampConcentration(actor.concentration + POTION_CONCENTRATION);
      actor.potions -= 1;
      const healed = Math.min(actor.maxHp, actor.hp + DUEL_POTION_HEAL);
      const diff = healed - actor.hp;
      actor.hp = healed;
      state.log.push(`${actor.name} выпивает зелье: +${diff} здоровья (${actor.hp}/${actor.maxHp}).`);
      break;
    }
    case "pass": {
      state.log.push(`${actor.name} заканчивает ход.`);
      state.apLeft = 0;
      costsAction = false;
      break;
    }
    case "flee": {
      /* Побег в дуэли — сдача: соперник побеждает, предметы не теряются. */
      state.log.push(`${actor.name} сдаётся.`);
      state.winner = other(side);
      state.log.push(`${target.name} побеждает в дуэли. ${actor.name} остаётся на ${actor.hp} ОЗ.`);
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
  if (state.winner || now < state.deadline) return state;
  state.log.push(`${state[state.turn].name} не успевает за 20 секунд — ход пропущен.`);
  finishTurn(state, now);
  state.seq += 1;
  return state;
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
    case "pass":
    case "flee":
      return null;
    default:
      return "Неизвестное действие";
  }
}
