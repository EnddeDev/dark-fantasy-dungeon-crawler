/* Ход монстров по карте: случайные шаги, погоня за видимым героем, два шага по последней точке, контакт. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-monstermove-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(name, entry = `src/game/${name}.ts`) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}
const maze = load("maze");
const mm = load("monsterMove");

const cellOf = (m, c) => ({ x: c % m.size, y: Math.floor(c / m.size) });

/** Достижима ли цель для монстра: путь не проходит через ловушки, двери, события и т.п. */
function reachable(m, from, goal) {
  return mm.nextStepToward(m, from, goal, mm.blockedCells(m)) !== null;
}
const idxOf = (m, p) => p.y * m.size + p.x;

/** Кратчайшее расстояние по открытым клеткам (без учёта монстров). */
function dist(m, a, b) {
  const seen = new Map([[idxOf(m, a), 0]]);
  const q = [a];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    if (cur.x === b.x && cur.y === b.y) return seen.get(idxOf(m, cur));
    for (const [dx, dy] of maze.openDirs(m, cur.x, cur.y)) {
      const n = { x: cur.x + dx, y: cur.y + dy };
      if (seen.has(idxOf(m, n))) continue;
      seen.set(idxOf(m, n), seen.get(idxOf(m, cur)) + 1);
      q.push(n);
    }
  }
  return Infinity;
}

/** Та же карта, но монстр один: другие твари не мешают проверке шага. */
function solo(m, c, kind) {
  return { ...m, monsters: [c], monsterKinds: [kind], questMarks: undefined };
}

/** Карта с одним обычным монстром, который стоит на клетке c (без лишних объектов рядом с ним). */
function oneMonsterMaze(seed = 0) {
  let m = maze.genMaze(12, 9);
  for (let i = 0; i < 60 && !m.monsters.length; i++) m = maze.genMaze(12, 9);
  const c = m.monsters[seed % m.monsters.length];
  return { m, c, kind: m.monsterKinds.find((k) => k.cell === c) };
}

test("случайный ход: монстр шагает на одну соседнюю свободную клетку, не в стену и не на ловушку", () => {
  for (let i = 0; i < 40; i++) {
    const { m } = oneMonsterMaze(i);
    const far = { x: 0, y: 0 };
    const t = mm.moveMonsters(m, far, [], () => 0.5);
    m.monsters.forEach((c, k) => {
      const a = cellOf(m, c);
      const b = cellOf(t.maze, t.maze.monsters[k]);
      if (a.x === b.x && a.y === b.y) return;
      assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1, "за ход не больше одного шага");
      assert.ok(maze.openDirs(m, a.x, a.y).some(([dx, dy]) => a.x + dx === b.x && a.y + dy === b.y), "шаг через стену");
      assert.ok(!m.traps.includes(t.maze.monsters[k]), "монстр не должен наступать на ловушку");
    });
  }
});

test("видит героя — идёт к нему и запоминает, где он был", () => {
  let found = null;
  for (let i = 0; i < 80 && !found; i++) {
    const { m, c } = oneMonsterMaze(i);
    const from = cellOf(m, c);
    for (let y = 0; y < m.size && !found; y++)
      for (let x = 0; x < m.size && !found; x++) {
        const p = { x, y };
        if (dist(m, from, p) >= 3 && dist(m, from, p) <= 4 && mm.monsterSees(m, from, p) && reachable(m, from, p)) found = { m, c, p, from };
      }
  }
  assert.ok(found, "нет карты, где монстр видит героя в двух-трёх шагах");
  const { c, p, from } = found;
  const m = solo(found.m, c, found.m.monsterKinds.find((k) => k.cell === c));
  const expected = mm.nextStepToward(m, from, p, mm.blockedCells(m));
  const t = mm.moveMonsters(m, p, [], () => 0.5);
  assert.ok(expected, "путь к герою есть");
  assert.deepEqual(cellOf(t.maze, t.maze.monsters[0]), expected, "шаг по кратчайшему пути к герою");
  const kk = t.maze.monsterKinds[0];
  assert.deepEqual(kk.hunt, { x: p.x, y: p.y, left: mm.MONSTER_LOST_STEPS }, "запомнил, где видел героя");
});

test("потерял из виду — два шага к последней точке, потом ходит случайно", () => {
  let found = null;
  for (let i = 0; i < 80 && !found; i++) {
    const { m, c, kind } = oneMonsterMaze(i);
    const from = cellOf(m, c);
    const target = [];
    for (let y = 0; y < m.size; y++)
      for (let x = 0; x < m.size; x++) {
        const p = { x, y };
        const d = dist(m, from, p);
        if (d >= 4 && d <= 6 && !mm.monsterSees(m, from, p) && reachable(m, from, p)) target.push(p);
      }
    if (target.length) found = { m, c, kind, target: target[0], from };
  }
  assert.ok(found, "нет подходящей карты");
  const { c, kind, target, from } = found;
  const m0 = solo(found.m, c, found.m.monsterKinds.find((k) => k.cell === c));
  const m = m0;
  const withHunt = { ...m0, monsterKinds: [{ ...m0.monsterKinds[0], hunt: { x: target.x, y: target.y, left: 2 } }] };
  /* Герой вне обзора монстра: монстр идёт по последней точке. */
  let player = null;
  for (let y = 0; y < m.size && !player; y++)
    for (let x = 0; x < m.size && !player; x++)
      if (!mm.monsterSees(m, from, { x, y }) && !(x === from.x && y === from.y)) player = { x, y };
  const blocked = mm.blockedCells(m);
  const step1 = mm.nextStepToward(m, from, target, blocked);
  const t1 = mm.moveMonsters(withHunt, player, [], () => 0.5);
  const p1 = cellOf(t1.maze, t1.maze.monsters[0]);
  assert.deepEqual(p1, step1, "первый шаг по пути к последней точке");
  assert.equal(t1.maze.monsterKinds[0].hunt?.left, 1, "после первого шага остался один шаг");
  const step2 = mm.nextStepToward(t1.maze, p1, target, mm.blockedCells(t1.maze));
  const t2 = mm.moveMonsters(t1.maze, player, [], () => 0.5);
  const p2 = cellOf(t2.maze, t2.maze.monsters[0]);
  assert.deepEqual(p2, step2, "второй шаг по пути к последней точке");
  assert.equal(t2.maze.monsterKinds[0].hunt, undefined, "после двух шагов погоня окончена, дальше случайно");
});

test("дошёл до героя — контакт: клетка монстра становится клеткой героя", () => {
  let found = null;
  for (let i = 0; i < 80 && !found; i++) {
    const { m, c, kind } = oneMonsterMaze(i);
    const from = cellOf(m, c);
    const nb = maze.openDirs(m, from.x, from.y);
    if (nb.length) found = { m, c, kind, p: { x: from.x + nb[0][0], y: from.y + nb[0][1] } };
  }
  assert.ok(found, "нет монстра с соседней клеткой");
  const { m, c, kind, p } = found;
  const t = mm.moveMonsters(m, p, [], () => 0.5);
  assert.ok(t.contact, "монстр рядом с героем должен начать бой");
  assert.equal(t.contact.id, kind.id);
  assert.equal(t.contact.cell, idxOf(m, p));
  assert.equal(t.maze.monsters[m.monsters.indexOf(c)], idxOf(m, p));
});

test("побеждённые монстры не ходят", () => {
  const { m, c } = oneMonsterMaze(0);
  const t = mm.moveMonsters(m, { x: 0, y: 0 }, [c], () => 0.5);
  assert.equal(t.maze.monsters[m.monsters.indexOf(c)], c, "побеждённый монстр остаётся на месте");
});

test("квестовый монстр тащит за собой свою метку", () => {
  const { m, c, kind } = oneMonsterMaze(0);
  const withMark = {
    ...m,
    questMarks: [{ cell: c, questId: "q1", kind: "kill", enemyId: kind.id, label: "Охота" }],
  };
  const t = mm.moveMonsters(withMark, { x: 0, y: 0 }, [], () => 0.5);
  const now = t.maze.monsterKinds.find((x) => x.id === kind.id).cell;
  if (now !== c) assert.equal(t.maze.questMarks[0].cell, now, "метка переехала вместе с монстром");
  else assert.equal(t.maze.questMarks[0].cell, c);
});

test("ходы многих шагов: монстры не встают на клетки объектов, босса и друг друга", () => {
  let m = maze.genMaze(14, 12);
  for (let turn = 0; turn < 60; turn++) {
    const t = mm.moveMonsters(m, { x: m.start.x, y: m.start.y }, [], Math.random);
    m = t.maze;
    const cells = m.monsters;
    assert.equal(new Set(cells).size, cells.length, "две твари на одной клетке");
    const bossIdx = idxOf(m, m.boss);
    const stairsIdx = idxOf(m, m.stairs);
    assert.ok(!cells.includes(bossIdx), "монстр на клетке босса");
    assert.ok(!cells.includes(stairsIdx), "монстр на лестнице");
    if (t.contact) break;
  }
});

test("старая карта без видов: монстры стоят на месте", () => {
  const m0 = maze.genMaze(10, 6);
  const old = { ...m0, monsterKinds: undefined };
  const t = mm.moveMonsters(old, { x: 0, y: 0 }, [], () => 0.5);
  assert.deepEqual(t.maze.monsters, old.monsters);
});
