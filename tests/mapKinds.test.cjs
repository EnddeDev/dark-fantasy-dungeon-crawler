/* Вид монстра и ловушки на клетке задаётся картой; бой и ловушка берут его оттуда. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-mapkinds-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(name, entry = `src/game/${name}.ts`) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}
const maze = load("maze");
const pool = load("enemyPool");
const content = load("content");
const traps = load("traps");
const quests = load("quests");
const art = load("artManifest");

test("genMaze: каждый монстр и каждая ловушка получают вид на клетке", () => {
  for (let i = 0; i < 20; i++) {
    const m = maze.genMaze(10, 6);
    assert.equal(m.monsterKinds.length, m.monsters.length);
    assert.equal(m.trapKinds.length, m.traps.length);
    for (const c of m.monsters) assert.ok(maze.monsterKindAt(m, c), `клетка монстра ${c}`);
    for (const c of m.traps) assert.ok(maze.trapKindAt(m, c), `клетка ловушки ${c}`);
  }
});

test("вид монстра на карте — существующий вид, подходящий по этажу", () => {
  const m = maze.genMaze(12, 9);
  for (const k of m.monsterKinds) {
    const def = content.ENEMIES.find((e) => e.id === k.id);
    assert.ok(def, `нет вида ${k.id}`);
    assert.ok(def.minFloor <= 9, `${k.id} появляется с этажа ${def.minFloor}`);
  }
});

test("вид ловушки на карте — один из типов ловушек", () => {
  const m = maze.genMaze(12, 9);
  for (const k of m.trapKinds) assert.ok(traps.TRAP_KINDS.includes(k.kind), k.kind);
});

test("у каждого вида монстра есть портрет", () => {
  for (const e of content.ENEMIES) {
    assert.ok(art.foeArtSrc(e.id), `нет картины для ${e.id}`);
  }
});

test("старая карта без видов: поиск возвращает undefined, бой берёт случайный вид", () => {
  const m = maze.genMaze(10, 6);
  const old = { ...m, monsterKinds: undefined, trapKinds: undefined };
  assert.equal(maze.monsterKindAt(old, m.monsters[0]), undefined);
  assert.equal(maze.trapKindAt(old, m.traps[0]), undefined);
});

test("rollEnemy: вид берётся из пула этажа и совпадает с выбором при том же броске", () => {
  const def = pool.rollEnemy(4, () => 0.0001);
  assert.ok(def.minFloor <= 4);
  assert.equal(pool.rollEnemy(4, () => 0.0001).id, def.id, "один и тот же бросок — один и тот же вид");
});

test("квестовый монстр получает вид задания на своей клетке", () => {
  const base = maze.genMaze(10, 6);
  const q = { id: "q1", kind: "kill", enemyId: "vermin", enemyName: "Крыса", title: "Охота" };
  const placed = quests.placeQuestMarks(base, [q], () => 0.5);
  const mark = placed.questMarks.find((x) => x.questId === "q1");
  assert.ok(mark, "метка задания поставлена");
  assert.equal(maze.monsterKindAt(placed, mark.cell), "vermin");
  assert.ok(placed.monsters.includes(mark.cell));
});

test("сервер: виды монстров и ловушек сохраняются вместе с картой похода", () => {
  const save = load("server-save-kinds", "server/save.ts");
  const m = maze.genMaze(10, 6);
  const raw = JSON.parse(JSON.stringify({ floor: 6, maze: m, pos: m.start, prevPos: m.start, seen: {}, steps: 0, gold: 0, loot: [], gearLoot: [], keys: 0, log: [], torchTurns: 0, mapRevealed: false, revealedTraps: [] }));
  const clean = save.sanitizeRun(raw);
  assert.deepEqual(clean.maze.monsterKinds, m.monsterKinds, "виды монстров не теряются");
  assert.deepEqual(clean.maze.trapKinds, m.trapKinds, "виды ловушек не теряются");
  const bad = JSON.parse(JSON.stringify(raw));
  bad.maze.monsterKinds[0].id = "no-such-monster";
  assert.throws(() => save.sanitizeRun(bad), "неизвестный вид монстра отклоняется");
});
