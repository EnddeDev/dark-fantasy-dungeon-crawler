const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-biome-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const biomes = load("biomes");
const maze = load("maze");
const battle = load("battle");

function player(extra = {}) {
  return {
    name: "Покоритель", level: 3, xp: 0, statPoints: 0,
    stats: { str: 1, agi: 1, int: 4 }, hp: 100, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

function withRandom(value, fn) {
  const old = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = old; }
}

function combat(biome, extra = {}) {
  const b = battle.newBattle(player(extra), 3, false, biome);
  b.enemy.hp = 5000; b.enemy.maxHp = 5000; b.enemy.armor = 0;
  b.enemy.def = { ...b.enemy.def, type: "beast", moves: ["attack"] };
  b.enemy.moves = ["attack"]; b.enemy.passive = null;
  b.enemy.effects = []; b.enemy.effectPower = {};
  b.p.hp = 500; b.p.maxHp = 500; b.p.armor = 0; b.p.evade = 0;
  b.p.statuses.wound = 0; b.p.statuses.curse = 0; b.p.statuses.poison = 0;
  return b;
}

test("biome chances are 30/17.5/17.5/17.5/17.5 and floors 1-2 are always classic", () => {
  assert.equal(Object.values(biomes.BIOMES).reduce((s, b) => s + b.chance, 0), 1);
  for (const roll of [0, 0.2, 0.5, 0.999]) {
    assert.equal(biomes.rollBiome(1, () => roll), "classic");
    assert.equal(biomes.rollBiome(2, () => roll), "classic");
  }
  const cases = [
    [0, "classic"], [0.299999, "classic"],
    [0.3, "swamp"], [0.474999, "swamp"],
    [0.475, "ice"], [0.649999, "ice"],
    [0.65, "dark"], [0.824999, "dark"],
    [0.825, "fire"], [0.999999, "fire"],
  ];
  for (const [roll, expected] of cases) assert.equal(biomes.rollBiome(3, () => roll), expected);
  assert.equal(biomes.normalizeBiome("bogus"), "classic");
  assert.equal(biomes.mazeBiome(undefined), "classic");
});

test("generated mazes carry their biome and early floors cannot be overridden", () => {
  assert.equal(maze.genMaze(8, 1, "fire").biome, "classic");
  assert.equal(maze.genMaze(8, 2, "swamp").biome, "classic");
  for (const id of biomes.BIOME_ORDER) assert.equal(maze.genMaze(8, 3, id).biome, id);
});

test("dark dungeons limit sight to 2 cells while walls still block light", () => {
  const m = maze.genMaze(8, 3, "classic");
  m.h = Array.from({ length: 9 }, () => Array(8).fill(false));
  m.v = Array.from({ length: 8 }, () => Array(9).fill(false));
  m.doors = []; m.openedDoors = []; m.rooms = [];
  const pos = { x: 3, y: 3 };
  const classic = maze.computeVisibility(m, pos, {});
  const dark = maze.computeVisibility({ ...m, biome: "dark" }, pos, {});
  assert.equal(classic[3][5], 1);
  assert.equal(classic[3][6], 1);
  assert.equal(dark[3][5], 1);
  assert.equal(dark[3][6], 0);
  m.v[3][4] = true;
  const blocked = maze.computeVisibility({ ...m, biome: "dark" }, pos, {});
  assert.equal(blocked[3][4], 0);
});

test("swamp halves non-potion healing for both sides but leaves potions intact", () => {
  assert.equal(biomes.biomeHealingAmount("swamp", 40), 20);
  assert.equal(biomes.biomeHealingAmount("swamp", 40, true), 40);

  const potion = combat("swamp", { bag: { potion_s: 1 } });
  potion.queue = ["p", "e"]; potion.idx = 0; potion.p.hp = 1;
  const afterPotion = battle.playerAct(potion, { type: "item", id: "potion_s" });
  assert.equal(afterPotion.p.hp, 29);

  const scroll = combat("swamp", { bag: { scroll_heal: 1 } });
  scroll.queue = ["p", "e"]; scroll.idx = 0; scroll.p.hp = 1;
  const afterScroll = battle.playerAct(scroll, { type: "item", id: "scroll_heal" });
  assert.equal(afterScroll.p.hp, 17); // 32 / 2

  const regen = combat("swamp");
  regen.queue = ["p", "e"]; regen.idx = 0;
  regen.enemy.hp = 10; regen.enemy.maxHp = 100;
  regen.enemy.passive = { id: "regen", name: "Регенерация", desc: "" };
  let b = battle.playerAct(regen, { type: "guard" });
  b = battle.enemyStep(b);
  assert.equal(b.enemy.hp, 12);

  const classic = combat("classic");
  classic.queue = ["p", "e"]; classic.idx = 0;
  classic.enemy.hp = 10; classic.enemy.maxHp = 100;
  classic.enemy.passive = { id: "regen", name: "Регенерация", desc: "" };
  let c = battle.playerAct(classic, { type: "guard" });
  c = battle.enemyStep(c);
  assert.equal(c.enemy.hp, 14);
});

test("ice costs the player 3 HP per own turn and weakens physical strikes by 25%", () => {
  const b = combat("ice");
  b.queue = ["p", "e", "p", "e"]; b.idx = 0; b.p.hp = 100;
  b.enemy.moves = ["guard"]; b.enemy.def = { ...b.enemy.def, moves: ["guard"] };
  let next = battle.playerAct(b, { type: "guard" });
  assert.equal(next.p.hp, 100); // ход врага не морозит игрока
  next = battle.enemyStep(next);
  assert.equal(next.p.hp, 97); // начался следующий ход игрока
  assert.equal(next.enemy.hp, 5000);

  const strike = (biome) => {
    const s = combat(biome);
    s.queue = ["p", "e"]; s.idx = 0;
    s.p.hit = [100, 100]; s.p.stats.str = 1; s.p.critChance = 0;
    return withRandom(0.99, () => battle.playerAct(s, { type: "attack" }));
  };
  assert.equal(5000 - strike("classic").enemy.hp, 103); // 100 + (2 + СИЛ)
  assert.equal(5000 - strike("ice").enemy.hp, 77);

  const enemyStrike = (biome) => {
    const s = combat(biome);
    s.queue = ["e", "e"]; s.idx = 0;
    s.enemy.atk = [100, 100];
    return withRandom(0.99, () => battle.enemyStep(s));
  };
  assert.equal(500 - enemyStrike("classic").p.hp, 100);
  assert.equal(500 - enemyStrike("ice").p.hp, 75);
});

test("darkness adds a separate 25% miss check to physical attacks", () => {
  const playerAttack = (roll) => {
    const b = combat("dark");
    b.queue = ["p", "e"]; b.idx = 0;
    b.p.hit = [100, 100]; b.p.critChance = 0;
    return withRandom(roll, () => battle.playerAct(b, { type: "attack" }));
  };
  assert.equal(playerAttack(0.24).enemy.hp, 5000);
  assert.ok(playerAttack(0.25).enemy.hp < 5000);

  const enemyAttack = (roll) => {
    const b = combat("dark");
    b.queue = ["e"]; b.idx = 0;
    b.enemy.atk = [100, 100];
    return withRandom(roll, () => battle.enemyStep(b));
  };
  assert.equal(enemyAttack(0.24).p.hp, 500);
  assert.ok(enemyAttack(0.25).p.hp < 500);
  assert.equal(battle.combatReadout(combat("dark")).missChance, 0.25);
});

test("fire stacks burning separately on each combatant at the start of their own turn", () => {
  const b = battle.newBattle(player({ hp: 100, stats: { str: 1, agi: 10, int: 1 } }), 3, false, "fire");
  assert.equal(b.p.statuses.burning, 1); // первый ход игрока уже начался
  b.p.hp = 100; b.p.armor = 999;
  b.enemy.hp = 1000; b.enemy.maxHp = 1000; b.enemy.statuses.burning = 0;
  b.enemy.effects = []; b.enemy.effectPower = {}; b.enemy.passive = null;
  b.enemy.moves = ["guard"]; b.enemy.def = { ...b.enemy.def, moves: ["guard"] };
  b.queue = ["p", "e", "p", "e", "p", "e"]; b.idx = 0;

  let next = battle.playerAct(b, { type: "guard" });
  assert.equal(next.enemy.statuses.burning, 1);
  assert.equal(next.enemy.hp, 998);
  next = battle.enemyStep(next);
  assert.equal(next.p.statuses.burning, 2);
  assert.equal(next.p.hp, 96);
  next = battle.playerAct(next, { type: "guard" });
  assert.equal(next.enemy.statuses.burning, 2);
  assert.equal(next.enemy.hp, 994);
  next = battle.enemyStep(next);
  assert.equal(next.p.statuses.burning, 3);
  assert.equal(next.p.hp, 90);

  next.bag.antidote = 1;
  next.queue = ["p", "e"]; next.idx = 0;
  const cleansed = battle.playerAct(next, { type: "item", id: "antidote" });
  assert.equal(cleansed.p.statuses.burning, 3);
});

test("combat readout exposes biome damage modifiers and fire stacks", () => {
  const ice = battle.combatReadout(combat("ice"));
  assert.ok(ice.dmgMods.some((m) => m.id === "biome_ice" && m.mult === 0.75));
  assert.ok(ice.enemyMods.some((m) => m.id === "biome_ice_enemy" && m.mult === 0.75));
  const fire = combat("fire");
  fire.p.statuses.burning = 2; fire.enemy.statuses.burning = 3;
  const readout = battle.combatReadout(fire);
  assert.ok(readout.defMods.some((m) => m.id === "biome_burning" && m.label.includes("×2")));
  assert.ok(readout.enemyMods.some((m) => m.id === "biome_burning_enemy" && m.label.includes("×3")));
});
