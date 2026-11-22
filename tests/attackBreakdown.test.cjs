/* Разбор обычной атаки по типам урона (battle.ts: heroAttackBreakdown) и превью физического удара. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-attackbreakdown-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}
const battle = loadGameModule("battle");
const numbers = loadGameModule("damageNumbers");

function player(extra = {}) {
  return {
    name: "Покоритель", level: 1, xp: 0, statPoints: 2, stats: { str: 1, agi: 1, int: 1 }, hp: 30, gold: 0,
    bag: {}, knownRecipes: [], armory: [], equip: { weapon: null, armor: null, trinket: null }, passives: [],
    statuses: { wound: 0, curse: 0, poison: 0 }, kills: 0, ...extra,
  };
}
function fresh() {
  const b = battle.newBattle(player(), 1, false, "classic");
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong" };
  b.enemy.mtype = "strong";
  b.enemy.stats = { str: 0, agi: 0, int: 0 };
  b.enemy.hp = 999; b.enemy.maxHp = 999; b.enemy.armor = 0;
  b.queue = ["p", "e", "p"]; b.idx = 0;
  return b;
}

test("без масла и эффектов: один физический удар, диапазон как в heroAttackDamage", () => {
  const b = fresh();
  const { direct, procs } = battle.heroAttackBreakdown(b, "normal");
  const dmg = battle.heroAttackDamage(b, "normal");
  assert.equal(direct.length, 1);
  assert.equal(direct[0].type, "phys");
  assert.equal(direct[0].min, dmg.min);
  assert.equal(direct[0].max, dmg.max);
  assert.equal(direct[0].effect, false);
  assert.deepEqual(procs, []);
});

test("масло магии: отдельное магическое число при попадании, с учётом защиты от магии", () => {
  const b = fresh();
  b.p.statuses.oilType = "magic"; b.p.statuses.oilRounds = 3; b.p.statuses.oilPower = 10;
  const { direct } = battle.heroAttackBreakdown(b, "normal");
  assert.equal(direct.length, 2);
  assert.equal(direct[1].type, "magic");
  assert.equal(direct[1].min, battle.damageAfterEnemyDefense(b, 10, "magic"));
  assert.equal(direct[1].chance, undefined, "срабатывает при каждом попадании, шанса нет");
  assert.match(direct[1].source, /масло магии/i);
});

test("свойство клинка: яд с шансом и тиком из предмета", () => {
  const b = fresh();
  b.p.effectPower.poison_damage = 40;
  b.p.effectValue.poison_damage = 3;
  const { procs } = battle.heroAttackBreakdown(b, "normal");
  const poison = procs.find((p) => p.type === "poison");
  assert.ok(poison, "яд показан");
  assert.equal(poison.min, 3);
  assert.equal(poison.effect, true);
  assert.equal(poison.ticks, 3);
  assert.ok(poison.chance > 0 && poison.chance <= 0.4, `шанс не больше шанса предмета: ${poison.chance}`);
});

test("иммунитет породы: яд не показан, если враг не восприимчив", () => {
  const b = fresh();
  b.p.effectPower.poison_damage = 40;
  b.p.effectValue.poison_damage = 3;
  b.enemy.def = { ...b.enemy.def, race: "undead" };
  const { procs } = battle.heroAttackBreakdown(b, "normal");
  assert.equal(procs.some((p) => p.type === "poison"), false);
});

test("масло огня: тик за ход при каждом попадании, цвет огня", () => {
  const b = fresh();
  b.p.statuses.oilType = "fire"; b.p.statuses.oilRounds = 3; b.p.statuses.oilPower = 4;
  const { procs } = battle.heroAttackBreakdown(b, "normal");
  const fire = procs.find((p) => p.type === "fire");
  assert.ok(fire, "огонь показан");
  assert.ok(fire.min >= 1);
  assert.equal(fire.chance, undefined);
  assert.equal(fire.ticks, 3);
  assert.equal(numbers.DAMAGE_NUMBER_COLORS[fire.type], "#c0392b");
});

test("превью физического удара совпадает с ударом: урон врага в диапазоне превью", () => {
  const b = fresh();
  const dmg = battle.heroAttackDamage(b, "normal");
  const rnd = Math.random;
  Math.random = () => 0.45; // попадание без уклонения и крита
  let after;
  try { after = battle.playerAct(b, { type: "attack" }); } finally { Math.random = rnd; }
  const lost = 999 - after.enemy.hp;
  assert.ok(lost >= dmg.min && lost <= dmg.max, `урон ${lost} в диапазоне ${dmg.min}–${dmg.max}`);
});

test("названия типов урона заданы для всех цветов", () => {
  for (const key of Object.keys(numbers.DAMAGE_NUMBER_COLORS)) {
    assert.ok(numbers.DAMAGE_NUMBER_NAMES[key], `название для ${key}`);
  }
});
