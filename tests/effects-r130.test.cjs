const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-effects-r130-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = load("battle");

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

/** Бой с очередью «герой, затем враг»; по умолчанию ход врага, враг без рас и свойств. */
function fightFor(extra = {}, enemyTurn = true) {
  const b = battle.newBattle(player(extra), 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = enemyTurn ? 1 : 0;
  b.p.hp = b.p.maxHp;
  b.enemy.hp = b.enemy.maxHp = 500;
  b.enemy.armor = 0;
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none" };
  b.enemy.mtype = "strong";
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.atk = [10, 10];
  b.torchTurns = 5; /* мрак не вмешивается в промахи */
  return b;
}

test("укрепление врага режет урон после брони и округляет дробь вниз", () => {
  const b = fightFor({}, false);
  b.enemy.armor = 25;
  b.enemy.level = 2;
  b.enemy.effects = ["fortify"];
  /* Укрепление уровня 2 даёт 6%: (100 − 25) × 0,94 = 70,5 → 70 (обычное округление дало бы 71). */
  assert.equal(battle.damageAfterEnemyDefense(b, 100, "phys"), 70);
});

test("контратака отменяет удар врага: герой не теряет здоровья, враг получает ответ", () => {
  const b = fightFor({ passives: ["arch_assassin_10"] });
  /* Уклонение героя обнуляем: оно проверяется раньше контратаки. 0,05 ниже шанса контратаки (10%). */
  b.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
  b.enemy.announced = "attack";
  const next = withRandom(0.05, () => battle.enemyStep(b));
  assert.equal(next.p.hp, b.p.hp);
  assert.ok(next.enemy.hp < b.enemy.hp);
});

test("без контратки удар врага проходит и наносит урон", () => {
  const b = fightFor();
  b.enemy.announced = "attack";
  const next = withRandom(0.99, () => battle.enemyStep(b));
  assert.ok(next.p.hp < b.p.hp);
});

test("обморожение врага режет его урон на 20%", () => {
  const plain = fightFor();
  plain.enemy.announced = "attack";
  const plainHit = plain.p.hp - withRandom(0.99, () => battle.enemyStep(plain)).p.hp;

  const frozen = fightFor();
  frozen.enemy.announced = "attack";
  frozen.enemy.statuses.chill = 3;
  frozen.enemy.statuses.chillTick = 1;
  const frozenHit = frozen.p.hp - withRandom(0.99, () => battle.enemyStep(frozen)).p.hp;

  assert.ok(plainHit > 0);
  assert.equal(frozenHit, Math.round(plainHit * 0.8));
});

test("стойкость героя режет тик негативного эффекта: горение при 50% стойкости даёт половину урона за раунд", () => {
  /* Угольный бес поджигает героя при каждом попадании: сравниваем тик без стойкости и со стойкостью 50%. */
  const plain = fightFor();
  plain.enemy.def = { ...plain.enemy.def, id: "imp" };
  plain.enemy.level = 2; /* тик горения зависит от уровня врага: фиксируем */
  plain.enemy.announced = "attack";
  const plainBurn = withRandom(0.99, () => battle.enemyStep(plain)).p.statuses.burnTick;

  const armored = fightFor();
  armored.enemy.def = { ...armored.enemy.def, id: "imp" };
  armored.enemy.level = 2; /* тик горения зависит от уровня врага: фиксируем */
  armored.p.chanceLayers.tenacity.effects.push(0.5);
  armored.enemy.announced = "attack";
  const armoredBurn = withRandom(0.99, () => battle.enemyStep(armored)).p.statuses.burnTick;

  assert.ok(plainBurn > 1);
  assert.equal(armoredBurn, Math.max(1, Math.round(plainBurn * 0.5)));
});
