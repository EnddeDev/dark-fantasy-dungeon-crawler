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

function ghostDef(id) {
  return [...content.ENEMIES, ...world.EXTRA_ENEMIES].find((d) => d.id === id);
}

/* ─── Призрачный огонёк «Мерцание» ─── */

test("Призрачный огонёк: в начале своего хода с шансом 25% становится неосязаемым", () => {
  const b = fight("ghost_light");
  b.queue = ["p", "e"];
  b.idx = 0;
  const shimmered = seeded(() => battle.playerAct(b, { type: "end_turn" }), 0.01);
  assert.equal(shimmered.enemy.statuses.intangible, 1);
  assert.ok(logHas(shimmered, "мерцает и становится неосязаемым"));

  const steady = fight("ghost_light");
  steady.queue = ["p", "e"];
  steady.idx = 0;
  const calm = seeded(() => battle.playerAct(steady, { type: "end_turn" }), 0.99);
  assert.ok(!calm.enemy.statuses.intangible);
});

test("Призрачный огонёк: неосязаемость кончается с ходом героя", () => {
  const b = fight("ghost_light");
  b.enemy.statuses.intangible = 1;
  const after = seeded(() => battle.playerAct(b, { type: "end_turn" }), 0.99);
  assert.ok(!after.enemy.statuses.intangible);
});

test("Призрачный огонёк: обычный удар героя проходит сквозь него и бьёт сам герой", () => {
  const b = fight("ghost_light");
  b.enemy.statuses.intangible = 1;
  const hpBefore = b.enemy.hp;
  const heroBefore = b.p.hp;
  const after = seeded(() => battle.playerAct(b, { type: "attack" }), 0.99);
  assert.equal(after.enemy.hp, hpBefore, "призрак не получает урона");
  assert.ok(after.p.hp < heroBefore, "герой получает урон атаки огонька");
  assert.ok(logHas(after, "проходит сквозь"));
});

test("Призрачный огонёк: без мерцания удар героя попадает как обычно", () => {
  const b = fight("ghost_light");
  const hpBefore = b.enemy.hp;
  const after = seeded(() => battle.playerAct(b, { type: "attack" }), 0.01);
  assert.ok(after.enemy.hp < hpBefore);
});

test("Призрачный огонёк: набор приёмов — атака, похищение, атака, защита", () => {
  assert.deepEqual(ghostDef("ghost_light").moves, ["attack", "drain", "attack", "guard"]);
});

/* ─── Плачущая тень «Плач» ─── */

test("Плачущая тень: урон по ней снимает у героя 10 выносливости", () => {
  const b = fight("wraith");
  b.p.stamina = 60;
  const costNow = battle.actionStaminaCost(b, { type: "attack" });
  const after = seeded(() => battle.playerAct(b, { type: "attack" }), 0.01);
  assert.ok(after.enemy.hp < b.enemy.hp, "удар попал");
  assert.equal(after.p.stamina, 60 - costNow - 10);
  assert.ok(logHas(after, "плачет: −10 выносливости"));
});

test("Плачущая тень: промах не снимает выносливость", () => {
  const b = fight("wraith");
  b.p.stamina = 60;
  const costNow = battle.actionStaminaCost(b, { type: "attack" });
  const after = seeded(() => battle.playerAct(b, { type: "attack" }), 0.99);
  assert.equal(after.enemy.hp, b.enemy.hp);
  assert.equal(after.p.stamina, 60 - costNow);
  assert.ok(!logHas(after, "плачет"));
});

test("Плачущая тень: «Плач» не уводит выносливость ниже нуля", () => {
  const b = fight("wraith");
  const costNow = battle.actionStaminaCost(b, { type: "attack" });
  b.p.stamina = costNow + 4;
  const after = seeded(() => battle.playerAct(b, { type: "attack" }), 0.01);
  assert.equal(after.p.stamina, 0);
  assert.ok(after.p.stamina >= 0);
});

test("Плачущая тень: её попадание по герою снимает 10 выносливости", () => {
  const b = fight("wraith");
  b.p.stamina = 60;
  const after = seeded(() => enemyMove(b, "attack", 0.99), 0.99);
  assert.ok(logHas(after, "плачет: −10 выносливости"), "попадание запускает Плач");
});

test("Плачущая тень: промах по герою выносливость не снимает", () => {
  const b = fight("wraith");
  b.p.stamina = 60;
  const after = seeded(() => enemyMove(b, "attack", 0.01), 0.01);
  assert.ok(logHas(after, "промах!"), "герой ушёл от удара");
  assert.ok(!logHas(after, "плачет"), "промах не запускает Плач");
});

test("Плачущая тень: набор приёмов без изменений", () => {
  assert.deepEqual(ghostDef("wraith").moves, ["attack", "curse", "drain", "attack"]);
});
