const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-magic-power-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const effects = load("gearEffects");
const scaling = load("gearScaling");
const battle = load("battle");

test("маг. усиление: есть в списке выпадающих свойств и описано", () => {
  assert.ok(effects.ACTIVE_GEAR_EFFECTS.includes("magic_power"));
  assert.equal(effects.GEAR_EFFECTS.magic_power.stat, "int");
  assert.match(effects.effectTotalDetail("magic_power", 5), /\+5% магического урона/);
});

test("маг. усиление: появляется у ИНТ-предметов и не появляется у СИЛ/ЛОВ", () => {
  assert.ok(effects.ACCESSORY_EFFECT_POOLS.int.includes("magic_power"), "аксессуар ИНТ");
  assert.ok(!effects.ACCESSORY_EFFECT_POOLS.str.includes("magic_power"), "аксессуар СИЛ");
  assert.ok(!effects.ACCESSORY_EFFECT_POOLS.agi.includes("magic_power"), "аксессуар ЛОВ");
  for (const cls of ["heavy", "medium", "light"]) {
    assert.ok(effects.ARMOR_EFFECT_POOLS[cls].int.includes("magic_power"), `броня ИНТ ${cls}`);
    assert.ok(!effects.ARMOR_EFFECT_POOLS[cls].str.includes("magic_power"), `броня СИЛ ${cls}`);
  }
  assert.ok(effects.WEAPON_EFFECT_POOLS.staff.includes("magic_power"), "посох");
  assert.ok(effects.WEAPON_EFFECT_POOLS.wand.includes("magic_power"), "палочка");
  assert.ok(!effects.WEAPON_EFFECT_POOLS.sword.includes("magic_power"), "меч не магический");
});

test("маг. усиление: +5% за базовое значение, множитель магического урона", () => {
  assert.equal(scaling.effectMagnitude("magic_power", 1), 5);
  assert.equal(battle.magicPowerMult({}), 1, "без свойства урон не меняется");
  assert.equal(battle.magicPowerMult({ magic_power: 5 }), 1.05);
  assert.equal(battle.magicPowerMult({ magic_power: 20 }), 1.2);
});
