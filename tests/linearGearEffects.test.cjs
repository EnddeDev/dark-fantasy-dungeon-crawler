const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-linear-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const scaling = load("gearScaling");
const gearEffects = load("gearEffects");
const content = load("content");
const battle = load("battle");

function mkP(extra = {}) {
  return {
    name: "П", level: 1, xp: 0, statPoints: 0, stats: { str: 1, agi: 1, int: 1 }, hp: 30, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

/** Удар оружием с заданным свойством; враг без защит, крит героя отключён — срабатывает только свойство. */
function hitWith(effect, level = 1) {
  const weapon = content.createGearItem({ baseId: "knife", level, wear: "worn", rarity: "rare", identified: true });
  weapon.effects = [effect];
  weapon.effectRolls = {};
  const p = { ...mkP({ level: 10, stats: { str: 3, agi: 3, int: 3 }, hp: 300 }), armory: [weapon], equip: { ...mkP().equip, mainHand: weapon.uid } };
  const b = battle.newBattle({ ...p, pouch: [null, null, null, null, null] }, 1, false, "classic", 0, 0);
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "agile" };
  b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 10;
  b.enemy.effects = []; b.enemy.effectPower = {};
  b.enemy.moves = ["attack"];
  b.enemy.chanceLayers = { evade: { stats: [], items: [], effects: [] }, resist: { stats: [], items: [], effects: [] } };
  b.p.chanceLayers.crit = { stats: [], items: [], effects: [] };
  b.enemy.stats = { str: 0, agi: 0, int: 0 };
  b.queue = ["p", "e"];
  b.idx = 0;
  b.biome = "classic";
  b.torchTurns = 0;
  return b;
}

test("база линейных свойств в таблице совпадает со справочной базой", () => {
  for (const [id, def] of Object.entries(scaling.GEAR_EFFECT_LINEAR)) {
    assert.equal(scaling.GEAR_EFFECT_BASE[id].value, def.base, `${id}: база на 1 уровне`);
  }
});

test("каждое линейное свойство — активное и имеет подпись роста без ×1.17", () => {
  for (const id of Object.keys(scaling.GEAR_EFFECT_LINEAR)) {
    assert.ok(gearEffects.ACTIVE_GEAR_EFFECTS.includes(id), `${id} выпадает`);
    assert.doesNotMatch(scaling.effectGrowthLabel(id), /×1\.17/, id);
  }
  assert.equal(scaling.effectGrowthLabel("crit_chance"), "+2 за уровень");
  assert.equal(scaling.effectGrowthLabel("poison_damage"), "+4 шанс, +5 за тик за уровень");
});

test("шанс выпадает на 1 уровне точно по таблице, разброс ±1", () => {
  assert.equal(scaling.effectMagnitude("crit_mult", 1), 5);
  assert.equal(scaling.effectMagnitude("armor_damage", 1), 10);
  assert.equal(scaling.effectMagnitude("counter", 1), 3);
  assert.equal(scaling.effectMagnitude("counter", 5), 3 + 1.25 * 4);
  assert.equal(scaling.effectMagnitude("thorns", 1), 5);
  assert.equal(scaling.effectMagnitude("thorns", 3), 15);
  assert.equal(scaling.effectMagnitude("magic_power", 10), 5 + 27);
  assert.equal(scaling.rollEffectBase("sunder", () => 0), 9);
  assert.equal(scaling.rollEffectBase("sunder", () => 0.999), 11);
});

test("яд, кровотечение и раскол: тик из таблицы, а не от уровня героя", () => {
  assert.equal(scaling.effectTickMagnitude("poison_damage", 1), 5);
  assert.equal(scaling.effectTickMagnitude("bleed", 1), 7);
  assert.equal(scaling.effectTickMagnitude("sunder", 1), 1);
  assert.equal(scaling.effectTickMagnitude("sunder", 2), 1.5);
  assert.equal(battle.sunderBreakAmount(scaling.effectTickMagnitude("sunder", 2)), 2, "броня целая");
});

test("удар ядом ставит тик из свойства: 5 за ход на 1 уровне", () => {
  const old = Math.random;
  Math.random = () => 0.05;
  const after = battle.playerAct(hitWith("poison_damage"), { type: "attack" });
  Math.random = old;
  assert.ok(after.enemy.statuses.poison > 0, "яд наложен");
  assert.equal(after.enemy.statuses.poisonTick, 5);
});

test("удар кровотечением ставит тик 7 за ход на 1 уровне", () => {
  const old = Math.random;
  Math.random = () => 0.05;
  const after = battle.playerAct(hitWith("bleed"), { type: "attack" });
  Math.random = old;
  assert.ok(after.enemy.statuses.bleed > 0, "кровотечение наложено");
  assert.equal(after.enemy.statuses.bleedTick, 7);
});

test("раскол снимает одну единицу брони на 1 уровне", () => {
  const old = Math.random;
  Math.random = () => 0.05;
  const after = battle.playerAct(hitWith("sunder"), { type: "attack" });
  Math.random = old;
  assert.equal(after.enemy.armor, 9);
});

test("жар поджигает врага с тиком 5, обморожение — с тиком 2", () => {
  const old = Math.random;
  Math.random = () => 0.001;
  const burn = battle.playerAct(hitWith("scorch"), { type: "attack" });
  const frost = battle.playerAct(hitWith("frost_bite"), { type: "attack" });
  Math.random = old;
  assert.ok(burn.enemy.statuses.burn > 0, "горение наложено");
  assert.equal(burn.enemy.statuses.burnTick, 5);
  assert.ok(frost.enemy.statuses.chill > 0, "обморожение наложено");
  assert.equal(frost.enemy.statuses.chillTick, 2);
});

test("описания яда, раскола, жара и обморожения показывают величину срабатывания", () => {
  assert.equal(gearEffects.effectDetail("poison_damage", 1), "+10% шанс отравить врага на 3 раунда, −5 здоровья за ход");
  assert.equal(gearEffects.effectDetail("sunder", 1), "+10% шанс расколоть броню врага, −1 брони за удар");
  assert.equal(gearEffects.effectDetail("scorch", 1), "+5% шанс поджечь врага на 3 раунда, −5 здоровья за ход");
  assert.equal(gearEffects.effectDetail("frost_bite", 1), "+3% шанс заморозить врага на 3 раунда, −2 здоровья за ход");
});

test("жар и обморожение выпадают на магическое оружие и на ИНТ-броню и аксессуары", () => {
  for (const pool of [gearEffects.WEAPON_EFFECT_POOLS.staff, gearEffects.WEAPON_EFFECT_POOLS.wand]) {
    assert.ok(pool.includes("scorch") && pool.includes("frost_bite"));
  }
  assert.ok(gearEffects.ACCESSORY_EFFECT_POOLS.int.includes("scorch"));
  assert.ok(gearEffects.ARMOR_EFFECT_POOLS.light.int.includes("frost_bite"));
  assert.ok(gearEffects.ARMOR_EFFECT_POOLS.medium.int.includes("scorch"));
});
