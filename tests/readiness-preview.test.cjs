const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-readiness-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = load("battle");
const readiness = load("skillReadiness");
const preview = load("consumablePreview");

function withRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

function player(extra = {}) {
  return {
    name: "Герой", level: 3, xp: 0, statPoints: 0,
    stats: { str: 3, agi: 3, int: 6 }, hp: 30, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

function fightFor(extra = {}) {
  const b = battle.newBattle(player(extra), 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.p.hp = b.p.maxHp;
  b.enemy.hp = b.enemy.maxHp = 500;
  b.enemy.armor = 0;
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none" };
  b.enemy.mtype = "strong";
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.atk = [10, 10];
  b.torchTurns = 5;
  return b;
}

test("спец-приём светится только при полной концентрации и в свой ход", () => {
  const b = fightFor({ archetype: "sage" });
  b.p.concentration = 4;
  assert.equal(readiness.skillReadiness(b, true, false).special, false, "не хватает концентрации");
  b.p.concentration = 5;
  assert.equal(readiness.skillReadiness(b, true, false).special, true);
  assert.equal(readiness.skillReadiness(b, false, false).special, false, "чужой ход");
  assert.equal(readiness.skillReadiness(b, true, true).special, false, "страх");
  b.p.statuses.sealSkills = 1;
  assert.equal(readiness.skillReadiness(b, true, false).special, false, "печать забвения");
});

test("приёмы снаряжения не светятся на перезарядке и без концентрации", () => {
  const b = fightFor();
  b.p.epicSkills = [{ id: "fixture_epic", name: "Тест", intReq: 1, desc: "", kind: "attack", scaleStat: "int" }];
  b.p.epicCds = { fixture_epic: 2 };
  b.p.concentration = 3;
  assert.equal(readiness.skillReadiness(b, true, false).skills, false, "на перезарядке");
  b.p.epicCds = { fixture_epic: 0 };
  assert.equal(readiness.skillReadiness(b, true, false).skills, true, "готов и есть концентрация");
  b.p.concentration = 0;
  assert.equal(readiness.skillReadiness(b, true, false).skills, false, "нет концентрации");
});

test("обычная атака закрыта страхом и печатью атаки", () => {
  const b = fightFor();
  assert.equal(readiness.skillReadiness(b, true, false).attack, true);
  assert.equal(readiness.skillReadiness(b, true, true).attack, false);
  b.p.statuses.sealAttack = 1;
  assert.equal(readiness.skillReadiness(b, true, false).attack, false);
});

test("предпросмотр свитка искры совпадает с уроном реального хода", () => {
  const b = fightFor();
  b.bag = { scroll_spark: 1 };
  const pv = preview.consumablePreview(b, "scroll_spark");
  assert.equal(pv.blocked, null);
  assert.ok(pv.damage > 0);
  const real = withRandom(0.999, () => battle.playerAct(b, { type: "item", id: "scroll_spark" }));
  assert.equal(pv.damage, b.enemy.hp - real.enemy.hp);
});

test("предпросмотр зелья лечения даёт число исцеления без урона", () => {
  const b = fightFor();
  b.p.hp = 10;
  b.bag = { potion_s: 1 };
  const pv = preview.consumablePreview(b, "potion_s");
  assert.equal(pv.damage, null);
  assert.ok(pv.heal > 0);
  const real = withRandom(0.999, () => battle.playerAct(b, { type: "item", id: "potion_s" }));
  assert.equal(pv.heal, real.p.hp - b.p.hp);
});

test("предпросмотр ядовитого дротика показывает яд в раундах", () => {
  const b = fightFor();
  b.bag = { poison_dart: 1 };
  const pv = preview.consumablePreview(b, "poison_dart");
  assert.ok(pv.damage > 0);
  assert.ok(pv.effects.some((line) => line.startsWith("Враг:") && /3 раунда/.test(line)), pv.effects.join(" | "));
});

test("предпросмотр расходника, которого нет в сумке, объясняет причину", () => {
  const b = fightFor();
  b.bag = {};
  const pv = preview.consumablePreview(b, "scroll_spark");
  assert.equal(pv.damage, null);
  assert.ok(pv.blocked);
});
