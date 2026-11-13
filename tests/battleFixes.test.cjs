const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-battle-fixes-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const battle = load("src/game/battle.ts", "battle");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

/** Случайность фиксирована: 0.45 даёт попадание, а не промах и не крит. */
function withRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** Ход героя, враг-заглушка без щита и без защиты. */
function fight(extra = {}) {
  const pl = PlayerFactory.createInitial();
  const b = withRandom(0.45, () => battle.newBattle(pl, 1, false, "classic", 0, 0));
  b.queue = ["p", "e", "p", "e"];
  b.idx = 0;
  b.enemy.hp = 99999;
  b.enemy.maxHp = 99999;
  b.enemy.armor = 0;
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong", moves: ["attack"] };
  b.enemy.mtype = "strong";
  b.enemy.moves = ["attack"];
  b.enemy.passive = null;
  b.enemy.effects = [];
  b.enemy.effectPower = {};
  b.p.hit = [4, 6];
  b.p.stamina = b.p.staminaMax;
  Object.assign(b, extra);
  return b;
}

test("шипы врага, ранив героя до 0 в его ход, убивают его — даже при остатке выносливости", () => {
  const b = fight();
  b.enemy.effects = ["thorns"];
  b.enemy.effectPower = { thorns: 500 };
  b.p.hp = 3;
  assert.ok(b.p.stamina > 0, "выносливость есть");
  const after = withRandom(0.45, () => battle.playerAct(b, { type: "attack", kind: "normal" }));
  assert.equal(after.over, "lose", "герой с 0 ОЗ проигрывает бой");
  assert.equal(after.p.hp, 0, "ОЗ не уходит в минус");
  assert.ok(after.p.stamina > 0, "смерть не ждёт, пока кончится выносливость");
});

test("мощный удар без концентрации недоступен: удара нет, концентрация и выносливость не тратятся", () => {
  const b = fight();
  b.p.concentration = 0;
  const hpBefore = b.enemy.hp;
  const staminaBefore = b.p.stamina;
  const after = withRandom(0.45, () => battle.playerAct(b, { type: "attack", kind: "risky" }));
  assert.equal(after.enemy.hp, hpBefore, "врагу урона нет");
  assert.equal(after.p.concentration, 0);
  assert.equal(after.p.stamina, staminaBefore);
  assert.ok(after.log.slice(-1)[0].text.includes("Мощный удар требует 1 концентрации"), "причина в журнале");
});

test("мощный удар при 1 концентрации проходит и тратит 1", () => {
  const b = fight();
  b.p.concentration = 1;
  const hpBefore = b.enemy.hp;
  const after = withRandom(0.45, () => battle.playerAct(b, { type: "attack", kind: "risky" }));
  assert.ok(after.enemy.hp < hpBefore, "удар прошёл");
  assert.equal(after.p.concentration, 0, "потрачена 1 концентрация");
});

test("обычный и безопасный удары не требуют концентрации", () => {
  for (const kind of ["normal", "safe"]) {
    const b = fight();
    b.p.concentration = 0;
    const hpBefore = b.enemy.hp;
    const after = withRandom(0.45, () => battle.playerAct(b, { type: "attack", kind }));
    assert.ok(after.enemy.hp < hpBefore, `${kind} бьёт при 0 концентрации`);
  }
});

test("спец-приём при 5 тратит ровно 5, остаток сохраняется", () => {
  const b = fight();
  b.p.archetype = "bulwark";
  b.p.concentration = 7;
  const after = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(after.p.concentration, 2, "из 7 остаётся 2");
});

test("спец-приём при 5 тратит 5 и доводит концентрацию до 0", () => {
  const b = fight();
  b.p.archetype = "bulwark";
  b.p.concentration = 5;
  const after = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(after.p.concentration, 0);
});

test("спец-приём при 4 не срабатывает и концентрацию не тратит", () => {
  const b = fight();
  b.p.archetype = "bulwark";
  b.p.concentration = 4;
  const after = withRandom(0.45, () => battle.playerAct(b, { type: "archetype_skill" }));
  assert.equal(after.p.concentration, 4);
  assert.ok(after.log.slice(-1)[0].text.includes("открывается при концентрации 5"));
});
