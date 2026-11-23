import type { Cell, Maze, Threat } from "./types";
import { cellIdx, hasLOS, openDirs, TORCH } from "./maze";
import { biomeVision, mazeBiome } from "./biomes";

/**
 * Ход монстров по карте. После каждого шага героя каждый живой обычный монстр (не босс):
 * - видит героя (та же видимость, что у героя без факела) — идёт на него, на шаг за шаг;
 * - потерял из виду — проходит 2 шага туда, где видел героя последний раз, и дальше ходит случайно;
 * - без цели — ходит случайно по свободным клеткам.
 * Если монстр шагает на клетку героя — начинается бой.
 */

export const MONSTER_LOST_STEPS = 2;

export interface MonsterKind {
  cell: number;
  id: string;
  threat?: Threat;
  hunt?: { x: number; y: number; left: number };
}

export interface MonsterTurn {
  maze: Maze;
  /** Монстр, который дошёл до героя и начал бой (его клетка уже совпадает с клеткой героя). */
  contact?: MonsterKind;
  /** Сколько монстров только что заметили героя. */
  noticed: number;
}

/** Клетки, куда монстр не заходит: ловушки, двери, события, сундуки, ключи, лестница, босс, метки, другие монстры. */
export function blockedCells(m: Maze): Set<number> {
  const s = m.size;
  const out = new Set<number>([
    ...m.monsters,
    ...m.traps,
    ...m.doors,
    ...m.events,
    ...m.chests,
    ...m.keys,
    ...(m.questMarks ?? []).map((q) => q.cell),
    cellIdx(m.stairs.x, m.stairs.y, s),
    cellIdx(m.boss.x, m.boss.y, s),
  ]);
  return out;
}

/** Видит ли монстр героя: в радиусе обычной видимости этажа и по прямой. */
export function monsterSees(m: Maze, mon: Cell, player: Cell): boolean {
  const radius = biomeVision(mazeBiome(m), TORCH);
  const dist = Math.max(Math.abs(mon.x - player.x), Math.abs(mon.y - player.y));
  if (dist === 0 || dist > radius) return false;
  return hasLOS(m, mon, player);
}

/** Первый шаг кратчайшего пути от `from` к `goal`. Клетка цели разрешена даже если она в blocked. */
export function nextStepToward(m: Maze, from: Cell, goal: Cell, blocked: Set<number>): Cell | null {
  const s = m.size;
  const goalIdx = cellIdx(goal.x, goal.y, s);
  const startIdx = cellIdx(from.x, from.y, s);
  if (startIdx === goalIdx) return null;
  const prev = new Map<number, number>();
  prev.set(startIdx, -1);
  const queue: number[] = [startIdx];
  let found = false;
  for (let qi = 0; qi < queue.length && !found; qi++) {
    const cur = queue[qi];
    const cx = cur % s;
    const cy = Math.floor(cur / s);
    for (const [dx, dy] of openDirs(m, cx, cy)) {
      const nx = cx + dx;
      const ny = cy + dy;
      const ni = cellIdx(nx, ny, s);
      if (prev.has(ni)) continue;
      if (ni !== goalIdx && blocked.has(ni)) continue;
      prev.set(ni, cur);
      if (ni === goalIdx) {
        found = true;
        break;
      }
      queue.push(ni);
    }
  }
  if (!found) return null;
  let step = goalIdx;
  while (prev.get(step) !== startIdx) {
    const p = prev.get(step);
    if (p === undefined || p === -1) return null;
    step = p;
  }
  return { x: step % s, y: Math.floor(step / s) };
}

/**
 * Один ход всех живых обычных монстров. Возвращает новую карту (исходная не меняется).
 * playerCell — клетка героя; клетки монстров, которые уже побеждены (cleared), не трогаем.
 */
export function moveMonsters(
  m: Maze,
  player: Cell,
  cleared: number[] = [],
  rng: () => number = Math.random,
): MonsterTurn {
  const s = m.size;
  const playerIdx = cellIdx(player.x, player.y, s);
  const blocked = blockedCells(m);
  const monsters = [...m.monsters];
  const questMarks = m.questMarks ? m.questMarks.map((q) => ({ ...q })) : undefined;
  const kinds: MonsterKind[] = (m.monsterKinds ?? []).map((k) => ({ ...k }));
  const clearedSet = new Set(cleared);
  let noticed = 0;
  let contact: MonsterKind | undefined;

  for (const kind of kinds) {
    if (clearedSet.has(kind.cell) || !monsters.includes(kind.cell)) continue;
    const from: Cell = { x: kind.cell % s, y: Math.floor(kind.cell / s) };
    let next: Cell | null = null;

    if (monsterSees(m, from, player)) {
      if (!kind.hunt) noticed++;
      kind.hunt = { x: player.x, y: player.y, left: MONSTER_LOST_STEPS };
      next = nextStepToward(m, from, player, blocked);
    } else if (kind.hunt && kind.hunt.left > 0) {
      const goal: Cell = { x: kind.hunt.x, y: kind.hunt.y };
      if (goal.x === from.x && goal.y === from.y) {
        kind.hunt = undefined;
      } else {
        next = nextStepToward(m, from, goal, blocked);
        kind.hunt = next ? { ...kind.hunt, left: kind.hunt.left - 1 } : undefined;
        if (kind.hunt && kind.hunt.left <= 0) kind.hunt = undefined;
      }
    } else {
      kind.hunt = undefined;
      const options = openDirs(m, from.x, from.y)
        .map(([dx, dy]) => ({ x: from.x + dx, y: from.y + dy }))
        .filter((c) => {
          const ci = cellIdx(c.x, c.y, s);
          return ci === playerIdx || !blocked.has(ci);
        });
      if (options.length) next = options[Math.floor(rng() * options.length)];
    }

    if (!next) continue;
    const ni = cellIdx(next.x, next.y, s);
    if (ni === playerIdx) {
      /* Монстр дошёл до героя: клетка монстра становится клеткой героя, начинается бой. */
      const i = monsters.indexOf(kind.cell);
      if (i >= 0) monsters[i] = playerIdx;
      kind.cell = playerIdx;
      contact = kind;
      break;
    }
    const i = monsters.indexOf(kind.cell);
    if (i >= 0) monsters[i] = ni;
    blocked.delete(kind.cell);
    blocked.add(ni);
    if (questMarks) {
      for (const q of questMarks) {
        if ((q.kind === "kill" || q.kind === "drop") && q.cell === kind.cell && q.enemyId === kind.id) q.cell = ni;
      }
    }
    kind.cell = ni;
  }

  const maze: Maze = {
    ...m,
    monsters,
    monsterKinds: kinds,
    ...(questMarks ? { questMarks } : {}),
  };
  return { maze, contact, noticed };
}
