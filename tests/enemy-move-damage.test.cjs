const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-enemy-dmg-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const battle = load("src/game/battle.ts", "battle");

function makePlayer(extra = {}) {
  return {
    name: "Покоритель", level: 3, xp: 20, statPoints: 3,
    stats: { str: 3, agi: 3, int: 4 }, hp: 40, gold: 120,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 2,
    shopLevel: 1, archetype: null, statMilestones: {},
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

/** Враг заданного рода и id; удар 20–30, чтобы разброс был заметен. Без эффектов от снаряжения. */
function fixtureBattle(id = "fixture", race = "none") {
  const b = battle.newBattle(makePlayer(), 3, false, "plain", 0, false);
  b.enemy.def = { ...b.enemy.def, id, race, type: "strong", passive: null };
  b.enemy.passive = null;
  b.enemy.mtype = "strong";
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.atk = [20, 30];
  b.enemy.armor = 0;
  b.enemy.guard = false;
  b.enemy.specialCooldown = 0;
  b.enemy.revived = false;
  b.enemy.hp = b.enemy.maxHp;
  b.p.guard = false;
  b.p.armor = 12;
  b.p.maxHp = 300;
  b.p.hp = 300;
  b.p.statuses.stone = 0;
  b.p.statuses.evadeTurn = 0;
  b.p.statuses.dodgeNext = 0;
  b.p.statuses.fullGuard = 0;
  b.p.statuses.invulnerable = 0;
  b.p.statuses.smoke = 0;
  b.p.statuses.beat = 0;
  b.p.statuses.immune = {};
  /* Очередь фиксирована: один ход врага и один ход героя. Случайный монстр с другой скоростью менял число тиков. */
  b.p.ap = 1;
  b.enemy.ap = 1;
  b.queue = ["e", "p"];
  b.idx = 0;
  return b;
}

/**
 * Один удар врага: урон героя за ход. Первый Math.random — бросок урона; второй — проверка крита
 * (только если крит возможен); остальные — 0.999: без промаха и без срабатывания эффектов.
 */
function realHit(b0, move, which) {
  const b = JSON.parse(JSON.stringify(b0));
  /* Ход врага и начало хода героя: тик кровотечения и яда на ходе героя входит в урон за ход. */
  b.queue = ["e", "p"];
  b.idx = 0;
  b.over = false;
  b.enemy.announced = move;
  const critPossible = battle.enemyMoveBreakdown(b0, move).lines.some((l) => l.label.startsWith("Критический"));
  const roll = which === "min" ? 0 : 0.999;
  const crit = which === "max" && critPossible ? 0 : 0.999;
  let calls = 0;
  const orig = Math.random;
  Math.random = () => {
    calls++;
    if (calls === 1) return roll;
    if (calls === 2) return crit;
    return 0.999;
  };
  try {
    const after = battle.enemyStep(b);
    return b.p.hp - after.p.hp;
  } finally {
    Math.random = orig;
  }
}

function hint(b, move) {
  return battle.enemyMoveBreakdown(b, move);
}

test("hint range: the weakest roll without a crit is the real minimum of a hit", () => {
  const b = fixtureBattle();
  for (const move of ["attack", "heavy", "sunder"]) {
    const bd = hint(b, move);
    assert.equal(realHit(b, move, "min"), bd.dmgMin, `${move}: минимум`);
  }
});

test("hint range: the strongest roll with a crit is the real maximum of a hit", () => {
  const b = fixtureBattle();
  for (const move of ["attack", "heavy", "sunder"]) {
    const bd = hint(b, move);
    assert.equal(realHit(b, move, "max"), bd.dmgMax, `${move}: максимум`);
  }
});

test("hint range: magic moves follow the same path", () => {
  const b = fixtureBattle();
  for (const move of ["cold_touch", "bell_stun", "terror"]) {
    const bd = hint(b, move);
    assert.equal(realHit(b, move, "min"), bd.dmgMin, `${move}: минимум`);
    assert.equal(realHit(b, move, "max"), bd.dmgMax, `${move}: максимум`);
  }
});

test("wraith: the hint counts the broken armour, the real hit too", () => {
  const b = fixtureBattle("wraith", "none");
  const bd = hint(b, "attack");
  assert.ok(bd.lines.some((l) => l.label.startsWith("Броня (пробита")), "строка пробитой брони в подсказке");
  assert.equal(realHit(b, "attack", "min"), bd.dmgMin, "минимум у призрака");
  assert.equal(realHit(b, "attack", "max"), bd.dmgMax, "максимум у призрака");
});

test("brute: rage below half hp is in the hint and in the hit", () => {
  const b = fixtureBattle("brute");
  b.p.hp = 100;
  const bd = hint(b, "attack");
  assert.ok(bd.lines.some((l) => l.label.startsWith("Ярость огра")), "строка ярости в подсказке");
  assert.equal(realHit(b, "attack", "min"), bd.dmgMin, "минимум при ярости");
  assert.equal(realHit(b, "attack", "max"), bd.dmgMax, "максимум при ярости");
});

test("beat: the hero's «Побои» raise the hint as they raise the hit", () => {
  const b = fixtureBattle();
  b.p.statuses.beat = 2;
  const bd = hint(b, "attack");
  assert.ok(bd.lines.some((l) => l.label.startsWith("Побои")), "строка побоев в подсказке");
  assert.equal(realHit(b, "attack", "min"), bd.dmgMin, "минимум под побоями");
  assert.equal(realHit(b, "attack", "max"), bd.dmgMax, "максимум под побоями");
});

test("no damage move: no range", () => {
  const b = fixtureBattle();
  const bd = hint(b, "guard");
  assert.equal(bd.dmgMin, 0);
  assert.equal(bd.dmgMax, 0);
});

test("round total: a bleed already on the hero ticks at the end of the round, with the hit", () => {
  const b = fixtureBattle();
  b.p.statuses.wound = 2;
  b.p.statuses.woundTick = 5;
  const bd = hint(b, "attack");
  assert.equal(bd.dotNow, 5, "тик висящего кровотечения");
  assert.equal(bd.roundMin, bd.dmgMin + 5, "минимум за ход");
  assert.equal(bd.roundMax, bd.dmgMax + 5, "максимум за ход");
  assert.equal(realHit(b, "attack", "min"), bd.roundMin, "реальный минимум за ход");
  assert.equal(realHit(b, "attack", "max"), bd.roundMax, "реальный максимум за ход");
});

test("round total: a wound move's new bleed is in the top of the round total", () => {
  const b = fixtureBattle();
  const bd = hint(b, "wound");
  assert.ok(bd.dotNewMax > 0, "новое кровотечение учтено");
  assert.equal(realHit(b, "wound", "max"), bd.roundMax, "реальный максимум за ход у «Раны»");
});

test("passive venom: a poisoning enemy's physical hit adds its poison tick to the round total", () => {
  const b = fixtureBattle();
  b.enemy.passive = { id: "venom" };
  const bd = hint(b, "attack");
  assert.ok(bd.dotNewMax > 0, "яд пассива учтён");
  assert.equal(realHit(b, "attack", "max"), bd.roundMax, "реальный максимум за ход с ядом");
});
