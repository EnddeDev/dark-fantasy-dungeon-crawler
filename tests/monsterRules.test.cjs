const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-monsters-"));
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
const { MONSTER_RULES } = rules;

function withRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

/** Бой с заданным видом монстра. Герой крепкий, враг не получает случайных эффектов. */
function fight(id, { hp = 200, atk, armor = 0, heroHp } = {}) {
  const pl = PlayerFactory.createInitial();
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  const def = content.ENEMIES.find((e) => e.id === id);
  b.enemy.def = { ...def };
  b.enemy.moves = [...def.moves];
  b.enemy.mtype = "strong";
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.enemy.revived = false;
  b.enemy.level = 1;
  b.enemy.statuses = { ...b.enemy.statuses, burn: 0, burnTick: 0, curse: 0, cursePower: 0, bleed: 0, poison: 0, chill: 0, fear: 0, stunAp: 0, oilType: null, oilRounds: 0, oilTick: 0 };
  b.enemy.maxHp = hp;
  b.enemy.hp = hp;
  if (atk) b.enemy.atk = atk;
  b.p.maxHp = 1000;
  b.p.hp = heroHp ?? 1000;
  b.p.stats = { ...b.p.stats, int: 10, str: 10, agi: 10 };
  b.p.armor = armor;
  b.p.statuses.sundered = 0;
  b.over = null;
  return b;
}

test("правила: у всех восьми обычных видов есть название и текст, боссов нет", () => {
  const ids = ["vermin", "husk", "bone", "wraith", "brute", "seer", "golem", "imp"];
  for (const id of ids) {
    assert.ok(MONSTER_RULES[id].title, id);
    assert.ok(MONSTER_RULES[id].text.length > 10, id);
  }
  assert.equal(Object.keys(MONSTER_RULES).length, 8);
  for (const boss of ["boss_warden", "boss_prelate", "boss_inquisitor"]) {
    assert.equal(MONSTER_RULES[boss], undefined, boss);
  }
});

test("Крыса: при половине ОЗ лечится на 15% и делает лишний ход, один раз", () => {
  const b = fight("vermin", { hp: 200 });
  b.enemy.hp = 100;
  b.queue = ["e", "p"];
  b.idx = 0;
  const next = withRandom(0.99, () => battle.enemyStep(b));
  assert.equal(next.enemy.hp, 130, "+15% от 200");
  assert.equal(next.enemy.ruleUsed, true);
  assert.deepEqual(next.queue.slice(0, 3), ["e", "e", "p"], "лишний ход вставлен сразу после");
  const again = withRandom(0.99, () => battle.enemyStep(next));
  assert.equal(again.enemy.hp, 130, "второй раз не лечится");
});

test("Крыса: выше половины ОЗ ничего не делает", () => {
  const b = fight("vermin", { hp: 200 });
  b.enemy.hp = 150;
  b.queue = ["e", "p"];
  b.idx = 0;
  const next = withRandom(0.99, () => battle.enemyStep(b));
  assert.equal(next.enemy.hp, 150);
  assert.equal(next.enemy.ruleUsed, undefined);
  assert.deepEqual(next.queue, ["e", "p"]);
});

test("Гнилой ходок: тяжёлый удар снимает броню, слоёв не больше двух", () => {
  const b = fight("husk", { armor: 30 });
  b.enemy.moves = ["heavy"];
  b.queue = ["e", "p"];
  b.idx = 0;
  const one = withRandom(0.99, () => battle.enemyStep(b));
  assert.equal(one.p.statuses.rot, 1, "первый слой");
  assert.equal(one.p.statuses.rotRounds, 2);
  assert.equal(battle.playerArmorNow(one), 29, "броня 30 − 1");
  one.idx = 0;
  one.queue = ["e", "p"];
  const two = withRandom(0.99, () => battle.enemyStep(one));
  const three = withRandom(0.99, () => { two.idx = 0; two.queue = ["e", "p"]; return battle.enemyStep(two); });
  assert.equal(three.p.statuses.rot, 2, "потолок два слоя");
  assert.equal(battle.playerArmorNow(three), 28);
});

test("Гнилой ходок: слой уходит через два раунда", () => {
  const b = fight("husk", { armor: 30 });
  b.p.statuses.rot = 2;
  b.p.statuses.rotRounds = 2;
  b.queue = ["e"];
  b.idx = 0;
  const r1 = withRandom(0.99, () => battle.enemyStep(b));
  assert.equal(r1.p.statuses.rotRounds, 1, "первый конец раунда");
  assert.equal(r1.p.statuses.rot, 2);
  r1.queue = ["e"];
  r1.idx = 0;
  const r2 = withRandom(0.99, () => battle.enemyStep(r1));
  assert.equal(r2.p.statuses.rot, 0, "второй конец раунда снимает слои");
  assert.equal(battle.playerArmorNow(r2), 30);
});

test("Костяной воин: щит принимает первую физическую атаку героя", () => {
  const b = fight("bone", { hp: 200 });
  b.enemy.shield = true;
  b.queue = ["p", "e"];
  b.idx = 0;
  const next = withRandom(0.99, () => battle.playerAct(b, { type: "attack" }));
  assert.equal(next.enemy.shield, false, "щит снят");
  assert.equal(next.enemy.hp, 200, "удар не прошёл");
  assert.ok(next.log.some((l) => l.text.includes("Костяной щит")));
});

test("Костяной воин: щит поднимается только в третьем раунде", () => {
  assert.equal(rules.boneShieldUp(1), false);
  assert.equal(rules.boneShieldUp(2), false);
  assert.equal(rules.boneShieldUp(3), true);
  assert.equal(rules.boneShieldUp(4), false);
  assert.equal(rules.boneShieldUp(6), true);
});

test("Плачущая тень: броня поглощает не больше половины удара", () => {
  assert.equal(rules.piercingArmorCap(30, 40), 15);
  assert.equal(rules.piercingArmorCap(30, 10), 10);
  const wraith = fight("wraith", { atk: [30, 30], armor: 40 });
  wraith.enemy.moves = ["attack"];
  wraith.queue = ["e"];
  wraith.idx = 0;
  const hit = withRandom(0.99, () => battle.enemyStep(wraith));
  assert.equal(1000 - hit.p.hp, 15, "30 − половина брони-пределом 15");
  const plain = fight("bone", { atk: [30, 30], armor: 40 });
  plain.enemy.moves = ["attack"];
  plain.queue = ["e"];
  plain.idx = 0;
  const safe = withRandom(0.99, () => battle.enemyStep(plain));
  assert.equal(1000 - safe.p.hp, 1, "обычная броня гасит удар до минимума в 1");
});

test("Огр-мясник: при ОЗ героя ниже половины удар ×1.25", () => {
  const healthy = fight("brute", { atk: [40, 40] });
  healthy.enemy.moves = ["attack"];
  healthy.queue = ["e"];
  healthy.idx = 0;
  const h = withRandom(0.99, () => battle.enemyStep(healthy));
  assert.equal(1000 - h.p.hp, 40);
  const hurt = fight("brute", { atk: [40, 40], heroHp: 400 });
  hurt.enemy.moves = ["attack"];
  hurt.queue = ["e"];
  hurt.idx = 0;
  const x = withRandom(0.99, () => battle.enemyStep(hurt));
  assert.equal(400 - x.p.hp, 50);
});

test("Угольный бес: каждое попадание поджигает героя на раунд", () => {
  const b = fight("imp", { atk: [5, 5] });
  b.enemy.moves = ["attack"];
  b.queue = ["e", "p"];
  b.idx = 0;
  const next = withRandom(0.99, () => battle.enemyStep(b));
  assert.ok(next.p.hp < 1000, "удар прошёл");
  assert.equal(next.p.statuses.burn, 1);
  assert.ok(next.p.statuses.burnTick > 0);
});

test("Страж из шлака: огонь наносит вдвое меньше, 10% физического урона возвращается", () => {
  const b = fight("golem", { hp: 200 });
  const { raceElementMult } = load("src/game/monsters.ts", "monsters");
  const baseFire = raceElementMult("construct", "fire");
  assert.ok(baseFire > 0, "конструкт не иммунен к огню");
  assert.equal(battle.enemyElementMult(b, "fire"), baseFire * 0.5, "огонь по стражу вдвое слабее");
  assert.equal(battle.enemyElementMult(b, "ice"), raceElementMult("construct", "ice"), "лёд не меняется");

  const hit = fight("golem", { hp: 200 });
  hit.queue = ["p", "e"];
  hit.idx = 0;
  const after = withRandom(0.99, () => battle.playerAct(hit, { type: "attack" }));
  const dealt = 200 - after.enemy.hp;
  assert.ok(dealt > 0, "удар прошёл");
  assert.equal(1000 - after.p.hp, Math.round(dealt * 0.1), "10% возвращается герою");
});

test("Пророк: объявляет ход в начале раунда и запоминает повтор приёма", () => {
  const b = fight("seer", { hp: 200 });
  b.queue = ["p"];
  b.idx = 0;
  const next = withRandom(0.99, () => battle.playerAct(b, { type: "guard" }));
  assert.ok(next.enemy.announced, "ход объявлен");
  assert.ok(next.log.some((l) => l.text.includes("объявляет:")));

  const fresh = fight("seer");
  fresh.p.concentration = 5;
  fresh.queue = ["p", "e"];
  fresh.idx = 0;
  const first = battle.playerAct(fresh, { type: "weapon_skill" });
  assert.equal(first.repeatSkill, false, "первый приём — не повтор");
  first.queue = ["p", "e"];
  first.idx = 0;
  first.p.concentration = 5;
  const repeat = battle.playerAct(first, { type: "weapon_skill" });
  assert.equal(repeat.repeatSkill, true, "тот же приём подряд — повтор");
  repeat.queue = ["p", "e"];
  repeat.idx = 0;
  const other = battle.playerAct(repeat, { type: "attack" });
  assert.equal(other.repeatSkill, false, "обычная атака сбрасывает повтор");
  assert.equal(other.lastSkill, null);
});

test("Пророк: повтор приёма уклоняется с шансом 50%", () => {
  const b = fight("seer", { hp: 200 });
  b.queue = ["p", "e"];
  b.idx = 0;
  b.p.concentration = 5;
  b.lastSkill = "weapon_skill:";
  const dodged = withRandom(0.1, () => battle.playerAct(b, { type: "weapon_skill" }));
  assert.equal(dodged.enemy.hp, 200, "при броске 0.1 < 0.5 уклоняется");
  assert.ok(dodged.log.some((l) => l.text.includes("предвидел повтор")));
  const again = fight("seer", { hp: 200 });
  again.p.concentration = 5;
  again.lastSkill = "weapon_skill:";
  again.queue = ["p", "e"];
  again.idx = 0;
  const landed = withRandom(0.9, () => battle.playerAct(again, { type: "weapon_skill" }));
  assert.ok(landed.enemy.hp < 200, "при броске 0.9 удар проходит");
});
