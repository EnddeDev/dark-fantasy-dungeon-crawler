const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-newfx-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const battle = load("src/game/battle.ts", "battle");
const content = load("src/game/content.ts", "content");
const rules = load("src/game/monsterRules.ts", "monster-rules");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

function withRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

function fight(id, { hp = 200, atk = [5, 8] } = {}) {
  const pl = PlayerFactory.createInitial();
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.p.regenTurn = 0;
  const def = content.ENEMIES.find((e) => e.id === id);
  b.enemy.def = { ...def };
  b.enemy.moves = [...def.moves];
  b.enemy.mtype = "strong";
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.level = 1;
  b.enemy.hp = hp;
  b.enemy.maxHp = hp;
  b.enemy.atk = atk;
  b.enemy.statuses = { ...b.enemy.statuses, burn: 0, burnTick: 0, curse: 0, cursePower: 0, bleed: 0, poison: 0, chill: 0, fear: 0, stunAp: 0 };
  b.p.stamina = b.p.staminaMax;
  return b;
}

test("Побои: урон по герою вырастает на 20% при активном эффекте", () => {
  const plain = fight("husk", { atk: [40, 40] });
  plain.enemy.moves = ["attack"];
  plain.queue = ["e", "p"]; plain.idx = 0;
  const beaten = fight("husk", { atk: [40, 40] });
  beaten.enemy.moves = ["attack"];
  beaten.queue = ["e", "p"]; beaten.idx = 0;
  beaten.p.statuses.beat = 2;
  const hpA = plain.p.hp;
  const hpB = beaten.p.hp;
  const a = withRandom(0.99, () => battle.enemyStep(plain));
  const c = withRandom(0.99, () => battle.enemyStep(beaten));
  const lossA = hpA - a.p.hp;
  const lossB = hpB - c.p.hp;
  assert.ok(lossA > 0, "обычный удар проходит");
  assert.ok(lossA >= 5, `обычный удар заметен: ${lossA}`);
  assert.ok(lossB >= lossA * 1.1 && lossB <= lossA * 1.3 + 1, `побои: ожидается ~+20%, получено ${lossB} против ${lossA}`);
});

test("Разрушение: тяжёлый раскол врага выставляет эффект на три раунда", () => {
  const b = fight("husk");
  b.enemy.moves = ["sunder"];
  b.queue = ["e", "p"]; b.idx = 0;
  const r = withRandom(0.99, () => battle.enemyStep(b));
  assert.equal(r.p.statuses.shatter, 3);
});

test("Иссушение: приём выставляет эффект на три раунда, враг восстанавливает ОЗ", () => {
  const b = fight("husk", { hp: 100 });
  b.enemy.moves = ["drain"];
  b.enemy.hp = 50;
  b.queue = ["e", "p"]; b.idx = 0;
  const r = withRandom(0.99, () => battle.enemyStep(b));
  assert.equal(r.p.statuses.drain, 3);
  assert.ok(r.enemy.hp > 50, "враг лечится");
});

test("Замедление: холодное касание выставляет эффект, ход игрока урезается с первого раунда", () => {
  const b = fight("husk");
  b.enemy.moves = ["cold_touch"];
  b.queue = ["e", "p"]; b.idx = 0;
  const r = withRandom(0.99, () => battle.enemyStep(b));
  assert.equal(r.p.statuses.slow, 2);
});

test("Ослабление: приём врага «запугивание» выставляет эффект на два раунда", () => {
  const b = fight("husk");
  b.enemy.moves = ["intimidate"];
  b.queue = ["e", "p"]; b.idx = 0;
  const r = withRandom(0.99, () => battle.enemyStep(b));
  assert.equal(r.p.statuses.weaken, 2);
});

test("Ослабление: урон от СИЛ и ЛОВ в сводке боя падает на 25%", () => {
  const plain = fight("husk");
  plain.p.stats = { str: 20, agi: 20, int: 20 };
  plain.p.weaponAgi = true;
  plain.p.statuses.weaken = 0;
  const weak = fight("husk");
  weak.p.stats = { str: 20, agi: 20, int: 20 };
  weak.p.weaponAgi = true;
  weak.p.statuses.weaken = 2;
  const a = battle.combatReadout(plain);
  const b = battle.combatReadout(weak);
  assert.ok(b.baseMin < a.baseMin, `СИЛ+ЛОВ: ${b.baseMin} < ${a.baseMin}`);
  assert.ok(Math.abs(b.baseMin - a.baseMin * 0.75) <= a.baseMin * 0.25 + 1, "около −25% от СИЛ и ЛОВ вместе");
});

test("Ослабление: бонус приёма от ИНТ падает на 25%", () => {
  const ws = content.WEAPON_TECHNIQUES.repeat_last;
  const plain = fight("husk");
  plain.p.stats = { str: 5, agi: 5, int: 30 };
  plain.p.statuses.weaken = 0;
  const weak = fight("husk");
  weak.p.stats = { str: 5, agi: 5, int: 30 };
  weak.p.statuses.weaken = 2;
  const a = battle.techniqueBonusNow(plain, ws);
  const b = battle.techniqueBonusNow(weak, ws);
  assert.ok(a > 0, "у приёма есть бонус от ИНТ");
  assert.equal(b, Math.round(a * 0.75));
});
