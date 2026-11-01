import { derived } from "./battle";
import type { Player } from "./types";

/**
 * Дуэль один на один по правилам боя, но без монстров и этажа.
 * Оба бойца считаются по тем же формулам, что и в подземелье:
 * здоровье, урон оружия, уклонение, крит, броня и приём из оружия.
 */
export interface DuelSkill {
  name: string;
  intReq: number;
  cooldown: number;
  scaleMult: number;
  scaleStat: "str" | "agi" | "int";
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
  skill: DuelSkill | null;
  potions: number;
  guard: boolean;
  cooldown: number;
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
  | { type: "attack" }
  | { type: "technique" }
  | { type: "guard" }
  | { type: "potion" }
  | { type: "pass" };

export const DUEL_TURN_MS = 20_000;
export const DUEL_POTION_HEAL = 28;

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
  return {
    userId,
    name: player.name,
    level: player.level,
    maxHp: d.maxHp,
    hp: d.maxHp,
    ap: Math.max(1, Math.min(4, d.ap)),
    armor: d.armor,
    hit: d.hit,
    strFlat: d.strFlat,
    evade: d.evade,
    crit: d.critChance,
    critDamage: d.critDamage,
    weaponName: d.weaponName,
    intStat: player.stats.int,
    skill,
    potions: player.bag.potion_s ?? 0,
    guard: false,
    cooldown: 0,
  };
}

export function createDuel(
  id: string,
  a: { userId: string; player: Player },
  b: { userId: string; player: Player },
  now = Date.now(),
): DuelState {
  return {
    id,
    a: fighterFromPlayer(a.userId, a.player),
    b: fighterFromPlayer(b.userId, b.player),
    turn: "a",
    round: 1,
    apLeft: Math.max(1, Math.min(4, derived(a.player).ap)),
    winner: null,
    log: [`${a.player.name} вызывает ${b.player.name} на дуэль. Ход первый, у каждого 20 секунд.`],
    deadline: now + DUEL_TURN_MS,
    seq: 0,
  };
}

const other = (side: DuelSide): DuelSide => (side === "a" ? "b" : "a");
const rollDie = (min: number, max: number) => min + Math.floor(Math.random() * Math.max(1, max - min + 1));

/** Итоговые данные бойца: урон, учёт брони и защиты, проверка уклонения. */
function strike(attacker: DuelFighter, defender: DuelFighter, bonus: number, label: string): { dmg: number; text: string } {
  if (Math.random() < defender.evade) {
    return { dmg: 0, text: `${attacker.name} — ${label}: ${defender.name} уходит с линии удара.` };
  }
  const crit = Math.random() < attacker.crit;
  let raw = rollDie(attacker.hit[0], attacker.hit[1]) + attacker.strFlat + Math.max(0, Math.round(bonus));
  if (crit) raw = Math.round(raw * attacker.critDamage);
  let dmg = Math.max(1, raw - Math.max(0, defender.armor));
  if (defender.guard) dmg = Math.max(1, Math.round(dmg * 0.5));
  return {
    dmg,
    text: `${attacker.name} — ${label}: ${dmg} урона${crit ? " — критический удар!" : ""}${defender.guard ? " (защита срезала половину)" : ""}.`,
  };
}

function finishTurn(state: DuelState, now: number): void {
  state.seq += 1;
  const next = other(state.turn);
  state.turn = next;
  if (next === "a") state.round += 1;
  const fighter = state[next];
  fighter.guard = false;
  fighter.cooldown = Math.max(0, fighter.cooldown - 1);
  state.apLeft = fighter.ap;
  state.deadline = now + DUEL_TURN_MS;
}

function checkWinner(state: DuelState): boolean {
  if (state.a.hp <= 0 && state.b.hp <= 0) {
    state.winner = state.a.hp <= 0 ? "b" : "a";
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

/**
 * Ход игрока. Возвращает новое состояние; при ошибке команда отклоняется
 * (сервер проверяет то же самое через assertDuelActionable).
 */
export function duelAction(state0: DuelState, side: DuelSide, action: DuelAction, now = Date.now()): DuelState {
  const state: DuelState = structuredClone(state0);
  if (state.winner) return state;
  const actor = state[state.turn];
  const target = state[other(state.turn)];
  if (state.turn !== side) return state;

  switch (action.type) {
    case "attack": {
      const { dmg, text } = strike(actor, target, 0, `удар (${actor.weaponName})`);
      target.hp -= dmg;
      state.log.push(text);
      break;
    }
    case "technique": {
      if (!actor.skill || actor.intStat < actor.skill.intReq || actor.cooldown > 0) {
        state.log.push(`${actor.name} пытается применить приём, но не хватает условий.`);
        break;
      }
      const stat = actor.skill.scaleStat;
      const statValue = stat === "int" ? actor.intStat : stat === "str" ? actor.strFlat : actor.ap;
      const bonus = Math.round(actor.skill.scaleMult * (stat === "str" ? statValue : Math.max(1, statValue)));
      const { dmg, text } = strike(actor, target, bonus, `приём «${actor.skill.name}»`);
      target.hp -= dmg;
      actor.cooldown = actor.skill.cooldown;
      state.log.push(text);
      break;
    }
    case "guard": {
      actor.guard = true;
      state.log.push(`${actor.name} закрывается и готовится к удару.`);
      break;
    }
    case "potion": {
      if (actor.potions <= 0) {
        state.log.push(`${actor.name} шарит по поясу, но зелий не осталось.`);
        break;
      }
      actor.potions -= 1;
      const healed = Math.min(actor.maxHp, actor.hp + DUEL_POTION_HEAL);
      const diff = healed - actor.hp;
      actor.hp = healed;
      state.log.push(`${actor.name} выпивает зелье: +${diff} здоровья (${actor.hp}/${actor.maxHp}).`);
      break;
    }
    case "pass":
      state.log.push(`${actor.name} пропускает действие.`);
      break;
  }

  state.apLeft -= 1;
  if (checkWinner(state)) {
    state.seq += 1;
    state.deadline = 0;
    return state;
  }
  if (state.apLeft <= 0) finishTurn(state, now);
  state.seq += 1;
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
  if (action.type === "technique") {
    if (!actor.skill) return "У оружия нет приёма";
    if (actor.intStat < actor.skill.intReq) return `Нужен Интеллект ${actor.skill.intReq}`;
    if (actor.cooldown > 0) return `Приём перезаряжается ещё ${actor.cooldown}`;
  }
  if (action.type === "potion" && actor.potions <= 0) return "Зелий не осталось";
  return null;
}
