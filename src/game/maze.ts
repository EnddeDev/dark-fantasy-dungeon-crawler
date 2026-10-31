import type { Cell, Maze } from "./types";

export const MIN_SIZE = 6;
export const MAX_SIZE = 10;
export const TORCH = 3;

export function mazeSizeForFloor(floor: number): number {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, MIN_SIZE + Math.floor(floor) - 1));
}

export const cellIdx = (x: number, y: number, size = MIN_SIZE) => y * size + x;
export const idxToCell = (i: number, size = MIN_SIZE): Cell => ({ x: i % size, y: Math.floor(i / size) });

/** стена между клеткой и соседом в направлении [dx,dy] */
export function wallBetween(m: Maze, x: number, y: number, dx: number, dy: number): boolean {
  if (dx === 1) return y < m.size && x + 1 <= m.size ? m.v[y][x + 1] : true;
  if (dx === -1) return x > 0 ? m.v[y][x] : true;
  if (dy === 1) return x < m.size && y + 1 <= m.size ? (m.h[y + 1]?.[x] ?? true) : true;
  if (dy === -1) return y > 0 ? m.h[y][x] : true;
  return true;
}

export function openDirs(m: Maze, x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as [number, number][]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= m.size || ny >= m.size) continue;
    if (!wallBetween(m, x, y, dx, dy)) out.push([dx, dy]);
  }
  return out;
}

function bfs(m: Maze, start: Cell, blocked: Set<number> = new Set()): number[][] {
  const s = m.size;
  const d: number[][] = Array.from({ length: s }, () => Array(s).fill(-1));
  if (blocked.has(cellIdx(start.x, start.y, s))) return d;
  d[start.y][start.x] = 0;
  const q: Cell[] = [start];
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    for (const [dx, dy] of openDirs(m, c.x, c.y)) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (d[ny][nx] !== -1) continue;
      if (blocked.has(cellIdx(nx, ny, s))) continue;
      d[ny][nx] = d[c.y][c.x] + 1;
      q.push({ x: nx, y: ny });
    }
  }
  return d;
}

/** Количество сундуков по этажу: 1–3 → один, 4–7 → два, 8–10 → три. */
export function chestCountForFloor(floor: number): number {
  if (floor <= 3) return 1;
  if (floor <= 7) return 2;
  return 3;
}

/** Сколько событий с выбором появляется на этаже: 1–2. */
export function eventCountForFloor(floor: number): number {
  return floor >= 5 ? 2 : Math.random() < 0.55 ? 1 : 2;
}

export const ROOM_KINDS = {
  hall: { name: "Зал пепла", w: 3, h: 3, pillars: [] as [number, number][] },
  crypt: { name: "Крипта", w: 3, h: 3, pillars: [[1, 1]] as [number, number][] },
  rotunda: { name: "Ротонда", w: 3, h: 3, pillars: [[0, 0], [2, 0], [0, 2], [2, 2]] as [number, number][] },
  gallery: { name: "Галерея", w: 4, h: 2, pillars: [[1, 0], [2, 1]] as [number, number][] },
  pantry: { name: "Кладовая", w: 2, h: 2, pillars: [] as [number, number][] },
  pillared: { name: "Пилоны", w: 3, h: 2, pillars: [[1, 0], [1, 1]] as [number, number][] },
  throne: { name: "Тронный чертог", w: 3, h: 3, pillars: [[0, 0], [2, 0]] as [number, number][] },
  sanctuary: { name: "Святилище", w: 3, h: 3, pillars: [[1, 1]] as [number, number][] },
  armory: { name: "Оружейная", w: 3, h: 2, pillars: [] as [number, number][] },
  treasury: { name: "Сокровищница", w: 2, h: 3, pillars: [] as [number, number][] },
} as const;

export type RoomKind = keyof typeof ROOM_KINDS;

/** Комната в лабиринте: открытый участок с формой и названием. */
export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: RoomKind;
  name: string;
  /** Клетки-колонны внутри комнаты (стены вокруг них закрыты). */
  pillars: [number, number][];
}

function closeWallsAround(h: boolean[][], v: boolean[][], x: number, y: number, size: number) {
  if (y >= 0 && y <= size) h[y][x] = true;
  if (y + 1 >= 0 && y + 1 <= size) h[y + 1][x] = true;
  if (x >= 0 && x <= size) v[y][x] = true;
  if (x + 1 >= 0 && x + 1 <= size) v[y][x + 1] = true;
}

/** Все клетки, кроме замурованных колонн, достижимы из входа? */
function connectedExcept(h: boolean[][], v: boolean[][], size: number, sealed: Set<number>): boolean {
  const probe = { size, h, v } as Maze;
  const seen = new Set<number>([0]);
  const queue: Cell[] = [{ x: 0, y: 0 }];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    for (const [dx, dy] of openDirs(probe, c.x, c.y)) {
      const id = (c.y + dy) * size + (c.x + dx);
      if (seen.has(id) || sealed.has(id)) continue;
      seen.add(id);
      queue.push({ x: c.x + dx, y: c.y + dy });
    }
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const id = y * size + x;
      if (!sealed.has(id) && !seen.has(id)) return false;
    }
  return true;
}

/**
 * Колонну запечатываем, только если она не была единственным проходом:
 * иначе комната отрезала бы часть лабиринта.
 */
function sealPillarIfSafe(
  h: boolean[][],
  v: boolean[][],
  size: number,
  x: number,
  y: number,
  sealed: Set<number>,
): boolean {
  const backup = { top: h[y][x], bottom: h[y + 1][x], left: v[y][x], right: v[y][x + 1] };
  closeWallsAround(h, v, x, y, size);
  if (connectedExcept(h, v, size, new Set(sealed).add(y * size + x))) {
    sealed.add(y * size + x);
    return true;
  }
  h[y][x] = backup.top;
  h[y + 1][x] = backup.bottom;
  v[y][x] = backup.left;
  v[y][x + 1] = backup.right;
  return false;
}

/**
 * Вырезаем комнаты: убираем внутренние стены прямоугольника,
 * оставляя колонны. Связность не нарушается — мы только добавляем проходы.
 */
function carveRooms(h: boolean[][], v: boolean[][], size: number): Room[] {
  const rooms: Room[] = [];
  const kinds = Object.keys(ROOM_KINDS) as RoomKind[];
  const target = size <= 6 ? (Math.random() < 0.6 ? 1 : 2) : size <= 8 ? 2 : Math.random() < 0.75 ? 3 : 2;
  const occupied: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  /* вход и его подступы оставляем коридором */
  occupied[0][0] = true;
  if (size > 1) { occupied[0][1] = true; occupied[1][0] = true; }

  for (let attempt = 0; attempt < 90 && rooms.length < target; attempt++) {
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const spec = ROOM_KINDS[kind];
    const w = spec.w;
    const hh = spec.h;
    if (w > size - 1 || hh > size - 1) continue;
    const x = 1 + Math.floor(Math.random() * (size - w - 1));
    const y = 1 + Math.floor(Math.random() * (size - hh - 1));
    if (x < 0 || y < 0 || x + w > size || y + hh > size) continue;

    let clash = false;
    for (let dy = -1; dy <= hh; dy++)
      for (let dx = -1; dx <= w; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue;
        if (occupied[cy][cx]) clash = true;
      }
    if (clash) continue;

    /* открываем внутренности */
    for (let dy = 0; dy < hh; dy++) {
      for (let dx = 0; dx < w; dx++) {
        occupied[y + dy][x + dx] = true;
        if (dx < w - 1) v[y + dy][x + dx + 1] = false;
        if (dy < hh - 1) h[y + dy + 1][x + dx] = false;
      }
    }
    /* колонны снова закрыты со всех сторон */
    const sealed = new Set<number>();
    rooms.forEach((r) => r.pillars.forEach(([rx, ry]) => sealed.add(ry * size + rx)));
    const pillars: [number, number][] = [];
    for (const [ox, oy] of spec.pillars) {
      const px = x + ox;
      const py = y + oy;
      if (sealPillarIfSafe(h, v, size, px, py, sealed)) pillars.push([px, py]);
    }

    rooms.push({ x, y, w, h: hh, kind, name: spec.name, pillars });
  }
  return rooms;
}

export function genMaze(size = MIN_SIZE, floor = Math.max(1, size - 5)): Maze {
  size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.floor(size)));
  floor = Math.max(1, Math.floor(floor));
  const h: boolean[][] = Array.from({ length: size + 1 }, () => Array(size).fill(true));
  const v: boolean[][] = Array.from({ length: size }, () => Array(size + 1).fill(true));

  /* лабиринт хребтом-бэктрекером по всем клеткам */
  const vis: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const stack: Cell[] = [{ x: 0, y: 0 }];
  vis[0][0] = true;
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const cand = dirs
      .map(([dx, dy]) => ({ x: cur.x + dx, y: cur.y + dy }))
      .filter((c) => c.x >= 0 && c.y >= 0 && c.x < size && c.y < size && !vis[c.y][c.x]);
    if (!cand.length) {
      stack.pop();
      continue;
    }
    const n = cand[Math.floor(Math.random() * cand.length)];
    if (n.x > cur.x) v[cur.y][cur.x + 1] = false;
    else if (n.x < cur.x) v[cur.y][cur.x] = false;
    else if (n.y > cur.y) h[cur.y + 1][cur.x] = false;
    else h[cur.y][cur.x] = false;
    vis[n.y][n.x] = true;
    stack.push(n);
  }

  /* немного петель во внутренних коридорах */
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < size - 1 && v[y][x + 1] && Math.random() < 0.06) v[y][x + 1] = false;
      if (y < size - 1 && h[y + 1][x] && Math.random() < 0.06) h[y + 1][x] = false;
    }
  }

  /* комнаты разбавляют коридоры: залы, крипты, галереи, пилоны */
  const rooms = carveRooms(h, v, size);

  const base: Maze = {
    size,
    h,
    v,
    start: { x: 0, y: 0 },
    stairs: { x: size - 1, y: size - 1 },
    boss: { x: size - 2, y: size - 1 },
    bossDefeated: false,
    doors: [],
    openedDoors: [],
    chests: [],
    openedChests: [],
    keys: [],
    takenKeys: [],
    events: [],
    usedEvents: [],
    rooms,
    dist: [],
  };

  const dist = bfs(base, base.start);
  base.dist = dist;

  /* Лестница — самый дальний тупик (1 вход), чтобы клетка перед ней была единственным подходом с Боссом */
  let bestDeadEnd = -1;
  let stairs: Cell | null = null;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x === 0 && y === 0) continue;
      if (openDirs(base, x, y).length === 1 && dist[y][x] > bestDeadEnd) {
        bestDeadEnd = dist[y][x];
        stairs = { x, y };
      }
    }
  }
  if (!stairs) {
    let best = -1;
    stairs = { x: size - 1, y: size - 1 };
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (dist[y][x] > best) {
          best = dist[y][x];
          stairs = { x, y };
        }
      }
  }
  base.stairs = stairs;

  /* Клетка прямо перед лестницей — здесь стоит Босс этажа */
  const stairDirs = openDirs(base, stairs.x, stairs.y);
  const bossDir = stairDirs[0] ?? [-1, 0];
  const boss: Cell = { x: stairs.x + bossDir[0], y: stairs.y + bossDir[1] };
  base.boss = boss;

  const stairsIdx = cellIdx(stairs.x, stairs.y, size);
  const bossIdx = cellIdx(boss.x, boss.y, size);

  /* сундуки — глубокие тупики (кроме лестницы и босса) */
  /* Колонны комнат наглухо закрыты — туда нельзя поставить ни сундук, ни событие. */
  const pillarIdx = new Set<number>();
  base.rooms.forEach((room) => room.pillars.forEach(([px, py]) => pillarIdx.add(cellIdx(px, py, size))));

  /* Кандидаты на сундук: чем уже место и чем дальше от входа, тем лучше.
     Комнаты съедают тупики, поэтому в список попадают и открытые клетки —
     для них замок ставится на сам сундук. */
  const scored: { cell: Cell; rank: number }[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const idx = cellIdx(x, y, size);
      if (x === 0 && y === 0) continue;
      if (idx === stairsIdx || idx === bossIdx || pillarIdx.has(idx)) continue;
      const exits = openDirs(base, x, y).length;
      if (exits === 0) continue;
      if (dist[y][x] < 2) continue;
      const shape = exits === 1 ? 3 : exits === 2 ? 2 : 1;
      scored.push({ cell: { x, y }, rank: shape * 100 + dist[y][x] });
    }
  scored.sort((a, b) => b.rank - a.rank);
  const chestSpots: Cell[] = scored.map((s) => s.cell);

  const chests: Cell[] = [];
  const doors: Cell[] = [];
  const maxChests = chestCountForFloor(floor);
  for (const c of chestSpots) {
    if (chests.length >= maxChests) break;
    const chestIdx = cellIdx(c.x, c.y, size);
    const nb = openDirs(base, c.x, c.y)[0];
    const approach = nb ? { x: c.x + nb[0], y: c.y + nb[1] } : c;

    // На маленькой карте замок не должен отрезать все ключи.
    // Дверь может стоять и на пути к Стражу: ключи размещаются до неё.
    for (const candidate of [approach, c]) {
      const doorIdx = cellIdx(candidate.x, candidate.y, size);
      if (doorIdx === 0 || doorIdx === stairsIdx || doorIdx === bossIdx) continue;
      if (doors.some((d) => d.x === candidate.x && d.y === candidate.y)) continue;
      if (chests.some((d) => d.x === candidate.x && d.y === candidate.y)) continue;

      const blocked = new Set<number>([
        ...doors.map((d) => cellIdx(d.x, d.y, size)),
        doorIdx,
        bossIdx,
        stairsIdx,
      ]);
      const reach = bfs(base, base.start, blocked);

      const reserved = new Set<number>([
        0, stairsIdx, bossIdx, chestIdx,
        ...chests.map((d) => cellIdx(d.x, d.y, size)),
        ...blocked,
      ]);
      let availableKeys = 0;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          if (reach[y][x] >= 0 && !reserved.has(cellIdx(x, y, size))) availableKeys++;
      if (availableKeys < doors.length + 1) continue;

      chests.push(c);
      doors.push(candidate);
      break;
    }
  }

  /* Если тупиков со свободной дверью не хватило, сундук ставится прямо в открытом зале */
  if (chests.length < maxChests) {
    const currentChestIds = new Set(chests.map((c) => cellIdx(c.x, c.y, size)));
    for (const c of chestSpots) {
      if (chests.length >= maxChests) break;
      const id = cellIdx(c.x, c.y, size);
      if (currentChestIds.has(id)) continue;
      if (doors.some((d) => d.x === c.x && d.y === c.y)) continue;
      chests.push(c);
      currentChestIds.add(id);
    }
  }

  base.chests = chests.map((c) => cellIdx(c.x, c.y, size));
  base.doors = doors.map((d) => cellIdx(d.x, d.y, size));

  /* ключи кладём только туда, куда можно дойти, не открывая дверей и не проходя сквозь босса */
  const blocked = new Set<number>([...base.doors, stairsIdx, bossIdx]);
  const reach = bfs(base, base.start, blocked);
  const taken = new Set<number>([...base.chests, ...base.doors, stairsIdx, bossIdx]);
  const cands: Cell[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = cellIdx(x, y, size);
      if (i === 0 || taken.has(i) || reach[y][x] < 0) continue;
      cands.push({ x, y });
    }
  cands.sort(() => Math.random() - 0.5);
  const want = doors.length;
  const keys: Cell[] = [];
  for (const c of cands) {
    if (keys.length >= want) break;
    keys.push(c);
    taken.add(cellIdx(c.x, c.y, size));
  }
  base.keys = keys.map((k) => cellIdx(k.x, k.y, size));

  /* События с выбором: значки на карте, стоят в видимых коридорах,
     дальше от служебных клеток, чтобы игрок заметил их заранее. */
  const eventTaken = new Set<number>([...base.chests, ...base.doors, ...base.keys, stairsIdx, bossIdx]);
  const evCands: Cell[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = cellIdx(x, y, size);
      if (i === 0 || eventTaken.has(i) || pillarIdx.has(i)) continue;
      if (reach[y][x] < 2) continue;
      if (openDirs(base, x, y).length < 1) continue;
      evCands.push({ x, y });
    }
  evCands.sort(() => Math.random() - 0.5);
  const wantEvents = Math.max(1, Math.min(2, eventCountForFloor(floor)));
  const events: number[] = [];
  for (const c of evCands) {
    if (events.length >= wantEvents) break;
    const i = cellIdx(c.x, c.y, size);
    if (eventTaken.has(i)) continue;
    events.push(i);
    eventTaken.add(i);
  }

  /* Гарантия 1–2 событий: если строгих кандидатов не хватило, берём любую клетку,
     достижимую после открытия дверей ключами. Служебные клетки и колонны исключаем. */
  if (events.length < 1) {
    const anyReach = bfs(base, base.start);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = cellIdx(x, y, size);
        if (i === 0 || eventTaken.has(i) || pillarIdx.has(i)) continue;
        if (anyReach[y][x] >= 0) {
          events.push(i);
          eventTaken.add(i);
          break;
        }
      }
      if (events.length >= 1) break;
    }
  }

  base.events = events;

  return base;
}

/**
 * Путь мышью: кратчайший маршрут по открытым коридорам из from в to.
 * Возвращает клетки маршрута без стартовой либо null, если пути нет.
 */
export function findPath(
  m: Maze,
  from: Cell,
  to: Cell,
  opts: { avoidClosedDoors?: boolean } = {},
): Cell[] | null {
  const s = m.size;
  const start = from.y * s + from.x;
  const goal = to.y * s + to.x;
  if (start === goal) return [];

  const prev = new Int32Array(s * s).fill(-1);
  const queue: number[] = [start];
  prev[start] = start;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === goal) break;
    const cx = cur % s;
    const cy = Math.floor(cur / s);
    for (const [dx, dy] of openDirs(m, cx, cy)) {
      const nx = cx + dx;
      const ny = cy + dy;
      const ni = ny * s + nx;
      if (prev[ni] !== -1) continue;
      /* Закрытая дверь останавливает маршрут, если ключа нет — его откроют по дороге. */
      if (opts.avoidClosedDoors && m.doors.includes(ni) && !m.openedDoors.includes(ni)) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goal] === -1) return null;

  const out: Cell[] = [];
  let cur = goal;
  while (cur !== start) {
    out.push({ x: cur % s, y: Math.floor(cur / s) });
    cur = prev[cur];
  }
  return out.reverse();
}

/**
 * Честная видимость без взгляда сквозь стены и углы.
 * Луч идёт из центра клетки в центр цели; каждое пересечение стены проверяется.
 * Если луч проходит точно через угол, обе стороны угла должны быть открыты.
 * Закрытая дверь видна сама, но свет за неё не проходит.
 */
export function hasLOS(m: Maze, from: Cell, to: Cell): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return true;
  if (to.x < 0 || to.y < 0 || to.x >= m.size || to.y >= m.size) return false;

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let tMaxX = dx === 0 ? Infinity : Math.abs(0.5 / dx);
  let tMaxY = dy === 0 ? Infinity : Math.abs(0.5 / dy);
  let x = from.x;
  let y = from.y;
  const closedDoor = (cx: number, cy: number) => {
    const idx = cellIdx(cx, cy, m.size);
    return m.doors.includes(idx) && !m.openedDoors.includes(idx);
  };

  while (x !== to.x || y !== to.y) {
    if (Math.abs(tMaxX - tMaxY) < 1e-9) {
      /* Угол: нельзя выглядывать из-за стены, даже если вторая сторона открыта. */
      if (wallBetween(m, x, y, stepX, 0) || wallBetween(m, x, y, 0, stepY)) return false;
      x += stepX;
      y += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      if (wallBetween(m, x, y, stepX, 0)) return false;
      x += stepX;
      tMaxX += tDeltaX;
    } else {
      if (wallBetween(m, x, y, 0, stepY)) return false;
      y += stepY;
      tMaxY += tDeltaY;
    }
    if ((x !== to.x || y !== to.y) && closedDoor(x, y)) return false;
  }
  return true;
}

export function computeVisibility(
  m: Maze,
  pos: Cell,
  seen: Record<string, boolean>,
): number[][] {
  const s = m.size;
  const out: number[][] = Array.from({ length: s }, (_, y) =>
    Array.from({ length: s }, (_, x) => (seen[`${x},${y}`] ? 2 : 0)),
  );

  if (pos.x >= 0 && pos.y >= 0 && pos.x < s && pos.y < s) {
    out[pos.y][pos.x] = 1;
  }

  // Круговая видимость: проверяем все клетки в радиусе TORCH
  for (let y = Math.max(0, pos.y - TORCH); y <= Math.min(s - 1, pos.y + TORCH); y++) {
    for (let x = Math.max(0, pos.x - TORCH); x <= Math.min(s - 1, pos.x + TORCH); x++) {
      const dist = Math.max(Math.abs(x - pos.x), Math.abs(y - pos.y));
      if (dist > TORCH) continue;
      if (dist === 0) continue;

      // Проверяем прямую видимость
      if (hasLOS(m, pos, { x, y })) {
        out[y][x] = 1;
      }
    }
  }

  return out;
}
