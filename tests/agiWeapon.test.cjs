const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-agi-weapon-"));
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
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

/* Лёгкое оружие с ЛОВ: ЛОВ идёт в плоский урон оружия (+1 за очко), как СИЛ. */
test("урон оружия получает ЛОВ, если основное оружие лёгкое и с ЛОВ", () => {
  const pl = PlayerFactory.createInitial();
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.p.stats = { str: 2, agi: 6, int: 1 };
  b.p.hit = [10, 10];
  b.p.passives = [];
  b.p.weaponAgi = false;
  const plain = battle.combatReadout(b);
  b.p.weaponAgi = true;
  const agi = battle.combatReadout(b);
  assert.equal(agi.dmgMin - plain.dmgMin, 6, "ЛОВ 6 добавляется к минимуму");
  assert.equal(agi.dmgMax - plain.dmgMax, 6, "ЛОВ 6 добавляется к максимуму");
});

test("без лёгкого оружия с ЛОВ урон не меняется от ЛОВ", () => {
  const pl = PlayerFactory.createInitial();
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.p.stats = { str: 2, agi: 6, int: 1 };
  b.p.hit = [10, 10];
  b.p.passives = [];
  b.p.weaponAgi = false;
  const a = battle.combatReadout(b);
  b.p.stats = { str: 2, agi: 0, int: 1 };
  const z = battle.combatReadout(b);
  assert.equal(a.dmgMin, z.dmgMin, "без флага ЛОВ не влияет на урон оружия");
});

test("под правило попадают лёгкое оружие с основной ЛОВ: стилет и кусаригама, но не СИЛ и не ИНТ", () => {
  const content = load("src/game/content.ts", "content");
  const item = (baseId) => ({ baseId, level: 1, rarity: "common", uid: baseId, identified: true });
  const qualifies = (baseId) => content.gearClassFor(item(baseId)) === "light" && content.gearAffinity(item(baseId)) === "agi";
  assert.equal(qualifies("assassin_stiletto"), true);
  assert.equal(qualifies("ninja_kusarigama"), true);
  assert.equal(qualifies("warlock_scepter"), false, "лёгкое, но с ИНТ");
  assert.equal(qualifies("barbarian_greataxe"), false, "тяжёлое с СИЛ");
});
