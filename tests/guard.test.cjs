const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-guard-tests-"));
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

function fightFor(extra = {}) {
  const b = battle.newBattle(player(extra), 1, false, "classic", 0, 0);
  b.queue = ["p", "e", "p", "e"];
  b.idx = 0;
  b.p.hp = b.p.maxHp;
  b.enemy.hp = b.enemy.maxHp = 500;
  b.enemy.armor = 0;
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none" };
  b.enemy.mtype = "strong";
  b.enemy.passive = null;
  b.enemy.effects = [];
  return b;
}

test("защита даёт броню +10, а не +25%", () => {
  const b = fightFor();
  b.p.armor = 20;
  assert.equal(battle.playerArmorNow(b), 20);
  b.p.guard = true;
  assert.equal(battle.playerArmorNow(b), 30);
});

test("защита не заканчивает ход: очередь остаётся у героя, защита держится", () => {
  const b = fightFor();
  const after = withRandom(0.45, () => battle.playerAct(b, { type: "guard" }));
  assert.equal(after.idx, 0, "ход героя не закончился");
  assert.equal(after.queue[after.idx], "p");
  assert.equal(after.p.guard, true, "защита включена");
  assert.equal(after.p.guard === true && after.p.stamina < b.p.stamina, true, "выносливость тратится");
});

test("защита сохраняется после других действий в ходе и сбрасывается в начале следующего хода героя", () => {
  const b = fightFor();
  const guarded = withRandom(0.45, () => battle.playerAct(b, { type: "guard" }));
  const attacked = withRandom(0.45, () => battle.playerAct(guarded, { type: "attack", kind: "normal" }));
  assert.equal(attacked.p.guard, true, "атака в том же ходе не снимает защиту");
  /* Конец хода героя: враг ходит, затем снова очередь героя. */
  const ended = withRandom(0.45, () => battle.playerAct(attacked, { type: "end_turn" }));
  assert.notEqual(ended.queue[ended.idx], "p", "конец хода отдаёт очередь врагу");
  assert.equal(ended.p.guard, true, "защита переживает ход врага");
  const enemyDone = battle.enemyStep(ended);
  assert.equal(enemyDone.queue[enemyDone.idx], "p", "снова ход героя");
  assert.equal(enemyDone.p.guard, false, "защита снята, когда начинается следующий ход героя");
});

test("защиту можно повторять в один ход: каждый раз тратится выносливость и даётся +2 концентрации", () => {
  const b = fightFor();
  b.p.concentration = 0;
  const once = withRandom(0.45, () => battle.playerAct(b, { type: "guard" }));
  const twice = withRandom(0.45, () => battle.playerAct(once, { type: "guard" }));
  assert.equal(twice.p.guard, true);
  assert.ok(twice.p.stamina < once.p.stamina, "вторая защита тратит выносливость");
  assert.equal(twice.p.concentration, 4, "каждая защита даёт +2 концентрации");
  assert.equal(twice.idx, 0, "ход всё ещё у героя");
});

test("защита не применяется, если выносливости не хватает на её стоимость", () => {
  const b = fightFor();
  b.p.stamina = 0;
  const after = withRandom(0.45, () => battle.playerAct(b, { type: "guard" }));
  assert.equal(after.p.guard, false, "без выносливости защита не включается");
});

test("Таран 3: пробивает 20% брони только первой атакой после защиты, а не каждой в ходе", () => {
  /* Один и тот же бой для всех сценариев: playerAct копирует состояние и не меняет исходное. */
  const base = fightFor({ passives: ["skill_ram_a"] });
  base.enemy.armor = 5;
  base.enemy.hp = base.enemy.maxHp = 5000;
  const drop = (b, action) => {
    const after = withRandom(0.45, () => battle.playerAct(b, action));
    return { after, dealt: b.enemy.hp - after.enemy.hp };
  };
  const plainBase = { ...base, p: { ...base.p, passives: [] } };
  const plain = drop(plainBase, { type: "attack", kind: "normal" }).dealt;
  const guarded = drop(base, { type: "guard" }).after;
  const first = drop(guarded, { type: "attack", kind: "normal" });
  assert.ok(first.dealt > plain, `первая атака после защиты: ${first.dealt} > ${plain}`);
  assert.equal(first.after.p.guardStrikeUsed, true, "защита потрачена на первую атаку");
  const second = drop(first.after, { type: "attack", kind: "normal" });
  assert.equal(second.dealt, plain, `вторая атака в том же ходе — без пробоя (${second.dealt} = ${plain})`);
});
