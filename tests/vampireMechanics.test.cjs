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

/* ─── Летучая мышь-вампир «Двойной укус» ─── */

test("Летучая мышь-вампир: кусает дважды, второй укус идёт и после попадания первого", () => {
  const b = fight("bat_vampire");
  const after = enemyMove(b, "attack", 0.99);
  assert.ok(logHas(after, "кусает второй раз"), "второй укус есть");
  assert.ok(logHas(after, "Летучая мышь-вампир кусает —"), "первый укус есть");
});

test("Летучая мышь-вампир: если герой ушёл от первого укуса, второй всё равно проходит", () => {
  const b = fight("bat_vampire");
  b.p.hp = 300;
  const before = b.p.hp;
  const after = enemyMove(b, "attack", 0.01);
  assert.ok(logHas(after, "промах!"), "первый укус ушёл");
  assert.ok(logHas(after, "кусает второй раз"), "второй укус состоялся");
  assert.ok(after.p.hp < before, "второй укус ранит героя");
});

/* ─── Вампир-лорд «Кровяной барьер» ─── */

test("Вампир-лорд: каждый удар по герою даёт барьер 10% макс. ОЗ, накопление до 30%", () => {
  let b = fight("vampire_lord");
  const cap = Math.round(b.enemy.maxHp * 0.3);
  const gain = Math.round(b.enemy.maxHp * 0.1);
  b.p.hp = 300;
  const steps = [];
  for (let i = 0; i < 4; i++) {
    b = enemyMove(b, "attack", 0.99);
    steps.push(b.enemy.barrier);
  }
  assert.deepEqual(steps, [gain, 2 * gain, cap, cap]);
  assert.equal(b.enemy.barrierMax, cap);
});

test("Вампир-лорд: промах по герою барьера не даёт", () => {
  const b = fight("vampire_lord");
  b.p.hp = 300;
  const after = enemyMove(b, "attack", 0.01);
  assert.ok(logHas(after, "промах!"), "герой ушёл от удара");
  assert.ok(!after.enemy.barrier, "барьер не появился");
});

test("Вампир-лорд: барьер поглощает удар героя", () => {
  const b = fight("vampire_lord");
  b.enemy.barrier = 20;
  b.enemy.barrierMax = 30;
  const after = seeded(() => battle.playerAct(b, { type: "attack" }), 0.01);
  assert.ok(logHas(after, "поглощает"), "барьер поглотил часть удара");
  assert.ok(after.enemy.barrier < 20, "барьер уменьшился");
});
