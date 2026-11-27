const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-none-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: ["react", "react-dom", "react/jsx-runtime"] });
  return require(outfile);
}

const battle = load("src/game/battle.ts", "battle");
const content = load("src/game/content.ts", "content");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

function hero() {
  return { ...PlayerFactory.createInitial(), pouch: [null, null, null, null, null], hp: 300 };
}

/** Фиксирует генератор: 0.99 — попадание героя; 0.01 — промах (уклонение героя). */
function seeded(fn, value = 0.99) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** Бой с врагом нужного вида; герой ходит первым. */
function fight(id, floor = 3) {
  const b = seeded(() => battle.newBattle(hero(), floor, false, "classic", 0, 0, "normal", id), 0.5);
  b.torchTurns = 99;
  b.queue = ["p", "e"];
  b.idx = 0;
  return b;
}

/** Ход врага с заранее объявленным приёмом. */
function enemyMove(b, move, value = 0.99) {
  b.enemy.announced = move;
  b.queue = ["e", "p"];
  b.idx = 0;
  return seeded(() => battle.enemyStep(b), value);
}

function logHas(b, text) {
  return b.log.some((l) => l.text.includes(text));
}

/* ─── Гоблин-разведчик: отход и крит после промаха героя ─── */

const world = load("src/game/world.ts", "world");

function dragonDef(id) {
  return [...content.ENEMIES, ...world.EXTRA_ENEMIES].find((d) => d.id === id && d.race === "dragon");
}

/* ─── Дракон-подросток «Первый ожог» (id wyrmling_ember) ─── */

test("Огненное дыхание: выдох приходит в начале следующего хода дракона", () => {
  let b = fight("wyrmling_ember", 7);
  b.p.hp = 300;
  const heroBefore = b.p.hp;
  b = enemyMove(b, "fire_breath", 0.99);
  assert.equal(b.enemy.statuses.breathWindup, 1, "дыхание готовится");
  assert.equal(b.p.hp, heroBefore, "в ход подготовки урона нет");
  b.queue = ["p", "e"];
  b.idx = 0;
  const after = seeded(() => battle.playerAct(b, { type: "end_turn" }), 0.99);
  assert.ok(logHas(after, "выдыхает пламя"), "выдох сработал в начале хода дракона");
  assert.ok(after.p.hp < heroBefore, "выдох ранит героя");
  assert.ok(after.p.statuses.burn > 0, "горение наложено");
});

test("Рёв: немота на героя и физический урон героя вдвое", () => {
  const plain = fight("wyrmling_ember", 7);
  const enemyBefore = plain.enemy.hp;
  const plainHit = seeded(() => battle.playerAct(plain, { type: "attack" }), 0.01);
  const plainLoss = enemyBefore - plainHit.enemy.hp;

  let b = fight("wyrmling_ember", 7);
  b = enemyMove(b, "roar", 0.99);
  assert.ok(b.p.statuses.sealItems > 0, "немота на героя");
  assert.equal(b.p.statuses.roarRounds, 2, "рёв держит два раунда");
  b.queue = ["p", "e"];
  b.idx = 0;
  const hpBefore = b.enemy.hp;
  const roarHit = seeded(() => battle.playerAct(b, { type: "attack" }), 0.01);
  const roarLoss = hpBefore - roarHit.enemy.hp;
  assert.ok(roarLoss > 0, "удар всё ещё проходит");
  assert.ok(roarLoss < plainLoss, `физический урон снижен: ${roarLoss} < ${plainLoss}`);
});

test("Дракон-подросток: набор приёмов — прежние четыре плюс «Рёв» и «Огненное дыхание»", () => {
  assert.deepEqual(dragonDef("wyrmling_ember").moves, ["heavy", "attack", "multi", "sunder", "roar", "fire_breath"]);
});

test("Дракон в мире: один дракон, id wyrmling_ember", () => {
  const ids = world.EXTRA_ENEMIES.filter((d) => d.race === "dragon").map((d) => d.id);
  assert.deepEqual(ids, ["wyrmling_ember"]);
});
