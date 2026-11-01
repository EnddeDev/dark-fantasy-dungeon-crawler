const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-stats-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const chances = load("chances");
const formulas = load("statFormulas");
const statuses = load("statusEffects");
const scaling = load("gearScaling");
const content = load("content");
const gearEffects = load("gearEffects");
const battle = load("battle");

function mkP(extra = {}) {
  return {
    name: "П", level: 5, xp: 0, statPoints: 0, stats: { str: 5, agi: 5, int: 5 }, hp: 50, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0, chill: 0, fear: 0, wither: 0, burn: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

test("chances multiply in layer order and never reach 100%", () => {
  assert.ok(Math.abs(chances.combineChances([0.2, 0.1]) - 0.28) < 1e-9);
  assert.ok(Math.abs(chances.combineChances([0.7, 0.7]) - 0.91) < 1e-9);
  assert.equal(chances.combineChances([1, 1]), chances.CHANCE_CAP);
  assert.equal(chances.clampChance(-1), 0);
  assert.equal(chances.clampChance(2), 0.99);
  const layers = { stats: [0.2], items: [0.1], effects: [0.5] };
  assert.ok(Math.abs(chances.combatChance(layers, [0.1]) - (1 - 0.8 * 0.9 * 0.5 * 0.9)) < 1e-9);
  assert.deepEqual(Object.keys(chances.emptyChanceLayers()).sort(), ["crit", "evade", "fortify", "magicResist", "stun", "tenacity"]);
});

test("stat formulas count the full characteristic value including the starting point", () => {
  assert.equal(formulas.statHealth(1), 10);
  assert.equal(formulas.statHealth(10), 100);
  assert.equal(formulas.statDamage(1), 3);
  assert.equal(formulas.statDamage(10), 12);
  assert.equal(formulas.statTenacity(5), 0.25);
  assert.equal(formulas.statActions(1), 1);
  assert.equal(formulas.statActions(10), 10);
  assert.equal(formulas.statEvasion(5), 0.25);
  assert.equal(formulas.statConsumableDamage(1), 8.5);
  assert.equal(formulas.statConsumableDamage(10), 22);
  assert.ok(Math.abs(formulas.statCritChance(1) - 0.03) < 1e-9);
  assert.ok(Math.abs(formulas.statCritChance(10) - 0.12) < 1e-9);
  assert.equal(formulas.statCritDamage(10), 1);
  assert.equal(formulas.statMagicResist(5), 0.25);
  assert.equal(formulas.statTechniqueDamage(1), 12);
  assert.equal(formulas.statTechniqueDamage(10), 30);

  const d = battle.derived(mkP());
  assert.equal(d.maxHp, 50);
  assert.equal(d.ap, 5);
  assert.equal(d.strFlat, 7);
  assert.equal(d.evade, 0.25);
  assert.ok(Math.abs(d.critChance - 0.07) < 1e-9);
  assert.ok(Math.abs(d.critDamage - 2.5) < 1e-9);
  assert.equal(d.tenacity, 0.25);
  assert.equal(d.magicResist, 0.25);
});

test("negative effects tick from max HP and codify all nine effects", () => {
  assert.equal(statuses.statusTickDamage(100, "bleed"), 5);
  assert.equal(statuses.statusTickDamage(100, "poison"), 4);
  assert.equal(statuses.statusTickDamage(100, "burn"), 5);
  assert.equal(statuses.statusTickDamage(100, "chill"), 3);
  assert.equal(statuses.statusTickDamage(100, "curse"), 3);
  assert.equal(statuses.statusTickDamage(100, "blight"), 3);
  assert.equal(statuses.statusTickDamage(1, "poison"), 1);
  assert.equal(statuses.magicTickDamage(100, "curse", 0), 3);
  assert.equal(statuses.magicTickDamage(100, "curse", 0.5), 2);
  assert.equal(statuses.CHILL_HEAL_MULT, 0.5);
  assert.deepEqual(statuses.NEGATIVE_EFFECTS.map((e) => e.id), ["curse", "poison", "burn", "bleed", "chill", "wither", "stun", "fear", "sunder"]);
});

test("new gear effects roll base spread and grow compound with ceil each level", () => {
  assert.equal(scaling.rollEffectBase("vamp", () => 0), 3);
  assert.equal(scaling.rollEffectBase("vamp", () => 0.999), 7);
  assert.equal(scaling.rollEffectBase("crit_chance", () => 0), 2);
  assert.equal(scaling.rollEffectBase("crit_chance", () => 0.999), 8);
  assert.equal(scaling.effectMagnitude("vamp", 1, 5), 5);
  assert.equal(scaling.effectMagnitude("vamp", 2, 5), 8);
  assert.equal(scaling.effectMagnitude("vamp", 3, 5), 12);
  assert.equal(scaling.effectMagnitude("crit_chance", 2, 5), 7);
  assert.equal(scaling.effectMagnitude("crit_chance", 3, 5), 9);
  for (const [level, expected] of [[1, 0], [2, 0], [3, 1], [6, 1], [7, 2], [9, 2], [10, 3]]) {
    assert.equal(scaling.effectMagnitude("ap", level), expected);
  }
});

test("created and migrated items carry the new stat/effect rolls", () => {
  const item = content.createGearItem({ baseId: "plate", level: 3, rarity: "epic", wear: "worn", identified: true, rng: () => 0.4 });
  assert.ok(item.statRolls.hp >= 10 && item.statRolls.hp <= 25);
  assert.ok(item.statRolls.armor >= 4 && item.statRolls.armor <= 10);
  for (const id of item.effects) assert.ok(item.effectRolls[id] != null);

  const legacy = {
    ...item,
    uid: "legacy-uid",
    effects: ["counter", "scroll_save"],
    rareAffix: "vamp",
    statRolls: undefined,
    effectRolls: undefined,
  };
  const migrated = content.migrateGearItem(legacy);
  assert.ok(migrated.statRolls);
  assert.equal(migrated.rareAffix, undefined);
  assert.ok(migrated.effects.length > 0);
  for (const id of migrated.effects) {
    assert.ok(gearEffects.ACTIVE_GEAR_EFFECTS.includes(id));
    assert.ok(migrated.effectRolls[id] != null);
  }
  assert.deepEqual(content.migrateGearItem(legacy), migrated);
});

test("consumables use AGI, damage scrolls use INT, healing/support stays flat", () => {
  const stats = { str: 1, agi: 5, int: 5 };
  assert.equal(content.consumablePower(content.ITEMS.acid_vial, stats), 14.5);
  assert.equal(content.consumablePower(content.ITEMS.throwing_knife, stats), 14.5);
  assert.equal(content.consumablePower(content.ITEMS.scroll_spark, stats), 20);
  assert.equal(content.consumablePower(content.ITEMS.potion_s, stats), 28);
  assert.equal(content.consumablePower(content.ITEMS.scroll_heal, stats), 32);
  assert.equal(content.consumableScaleStat(content.ITEMS.potion_s), null);
  assert.equal(content.consumableScaleStat(content.ITEMS.scroll_heal), null);
});

test("stun skips a turn, fear auto-guards, wither turns healing into damage, chill halves healing", () => {
  const mk = (bag = {}) => {
    const b = battle.newBattle(mkP({ bag }), 1);
    b.queue = ["p", "e", "p", "e"];
    b.idx = 0;
    b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0;
    b.enemy.def = { ...b.enemy.def, type: "beast", moves: ["attack"] };
    b.enemy.moves = ["attack"];
    b.enemy.passive = null;
    b.enemy.effects = []; b.enemy.effectPower = {};
    b.p.hp = 50; b.p.maxHp = 50; b.p.armor = 0;
    b.p.chanceLayers.evade = { stats: [], items: [], effects: [] };
    return b;
  };

  const stunned = mk();
  stunned.p.statuses.stunAp = 1;
  const afterStun = battle.playerAct(stunned, { type: "attack" });
  assert.equal(afterStun.enemy.hp, 5000);
  assert.equal(afterStun.p.statuses.stunAp, 0);
  assert.equal(afterStun.idx, 1);

  const feared = mk();
  feared.p.statuses.fear = 1;
  const afterFear = battle.playerAct(feared, { type: "attack" });
  assert.equal(afterFear.p.guard, true);
  assert.equal(afterFear.enemy.hp, 5000);
  assert.equal(afterFear.p.statuses.fear, 0);

  const withered = mk({ potion_s: 1 });
  withered.p.statuses.wither = 1;
  withered.p.hp = 40;
  const afterWither = battle.playerAct(withered, { type: "item", id: "potion_s" });
  assert.ok(afterWither.p.hp < 40);

  const chilled = mk({ potion_s: 1 });
  chilled.p.statuses.chill = 1;
  chilled.p.hp = 10;
  const afterChill = battle.playerAct(chilled, { type: "item", id: "potion_s" });
  assert.equal(afterChill.p.hp, 24); // 10 + 28/2
});
