const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-expansion-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const content = load("content");
const battle = load("battle");
const maze = load("maze");
const forge = load("forge");
const progression = load("progression");
const traps = load("traps");
const scaling = load("enemyScaling");

function mkP(extra = {}) {
  return {
    name: "П", level: 1, xp: 0, statPoints: 2, stats: { str: 1, agi: 1, int: 1 }, hp: 30, gold: 0,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0, shopLevel: 1,
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

test("enemy transition multipliers decay from 1.21 to 1.05 and accumulate", () => {
  assert.equal(scaling.enemyLevelStepMult(1), 1);
  assert.equal(scaling.enemyLevelStepMult(2), 1.21);
  assert.equal(scaling.enemyLevelStepMult(3), 1.19);
  assert.equal(scaling.enemyLevelStepMult(4), 1.17);
  assert.equal(scaling.enemyLevelStepMult(10), 1.05);
  assert.equal(scaling.enemyLevelStepMult(11), 1.05);
  assert.equal(scaling.enemyLevelStepMult(30), 1.05);
  assert.equal(scaling.enemyLevelMult(1), 1);
  assert.ok(Math.abs(scaling.enemyLevelMult(2) - 1.21) < 1e-9);
  assert.ok(Math.abs(scaling.enemyLevelMult(3) - 1.21 * 1.19) < 1e-9);
  assert.ok(scaling.enemyLevelMult(0) < 1);
  /* Опыт: герой 2 уровня за монстра 1 уровня получает вдвое меньше, и наоборот. */
  assert.equal(scaling.xpLevelMult(2, 1), 0.5);
  assert.equal(scaling.xpLevelMult(1, 2), 2);
  assert.equal(scaling.xpLevelMult(3, 3), 1);
  assert.equal(scaling.scaledEnemyXp(10, 2, 1), 5);
});

test("stat reset costs 100 per level, returns 1/1/1 and refunds level points", () => {
  assert.equal(progression.statResetCost(1), 100);
  assert.equal(progression.statResetCost(7), 700);
  assert.equal(progression.totalStatPoints(1), 2);
  assert.equal(progression.totalStatPoints(4), 11);
  const weapon = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  const p = mkP({
    level: 4, gold: 500, statPoints: 1, stats: { str: 5, agi: 3, int: 4 },
    armory: [weapon], equip: { ...mkP().equip, mainHand: weapon.uid },
    statMilestones: { str: { 5: "arch_guardian_5" } },
  });
  assert.equal(progression.resetStats(mkP({ gold: 99 })), null);
  const res = progression.resetStats(p);
  assert.equal(res.cost, 400);
  assert.equal(res.player.gold, 100);
  assert.deepEqual(res.player.stats, { str: 1, agi: 1, int: 1 });
  assert.equal(res.player.statPoints, 11);
  assert.deepEqual(res.player.statMilestones, {});
  assert.equal(res.player.equip.mainHand, null);
  assert.ok(res.removedSlots.includes("mainHand"));
});

test("trap preparation caps at 90%, failures keep base effects, kit is spent only on success", () => {
  assert.equal(traps.prepareMultiplier(1), 0.9);
  assert.equal(traps.prepareMultiplier(9), 0.1);
  assert.equal(traps.prepareMultiplier(20), 0.1);
  const stats = { str: 2, agi: 5, int: 4 };
  const poison = traps.makeTrap({ kind: "poison", floor: 3, stats });
  const prepared = traps.resolveTrap(poison, "prepare", stats, false, 3, () => 0.99);
  assert.equal(prepared.damage, Math.ceil(poison.damage * 0.8));
  assert.equal(prepared.rounds, Math.ceil(poison.rounds * 0.8));
  const failed = traps.resolveTrap(poison, "bypass", stats, false, 3, () => 0.99);
  /* Провал больше не удваивает урон: срабатывает обычная сила механизма. */
  assert.equal(failed.damage, poison.damage);
  assert.equal(failed.rounds, poison.rounds);
  assert.equal(failed.usedKit, false);
  const failedDisarm = traps.resolveTrap(poison, "disarm", stats, true, 3, () => 0.99);
  assert.equal(failedDisarm.success, false);
  /* Неудачное обезвреживание не тратит набор сапёра. */
  assert.equal(failedDisarm.usedKit, false);
  const disarmed = traps.resolveTrap(poison, "disarm", stats, true, 3, () => 0);
  assert.equal(disarmed.success, true);
  assert.equal(disarmed.usedKit, true);
  const noKit = traps.resolveTrap(poison, "disarm", stats, false, 3, () => 0);
  assert.equal(noKit.success, false);
  assert.equal(noKit.usedKit, false);
  const curse = traps.makeTrap({ kind: "curse", floor: 2, stats });
  const cursed = traps.resolveTrap(curse, "prepare", stats, false, 2, () => 0.99);
  const statuses = traps.applyTrapOutcome({ wound: 0, curse: 0, poison: 0 }, curse, cursed);
  assert.equal(statuses.curse, traps.BATTLE_CURSE);
  assert.ok(statuses.cursePower > 0);
  assert.ok(traps.lockpickChance(1) < traps.lockpickChance(10));
  assert.ok(traps.lockpickChance(100) <= 0.9);
});

test("shop offers six variants per slot, gates supplies by level and sells them", () => {
  const slots = ["mainHand", "offHand", "head", "body", "feet", "wrists", "ring1", "amulet"];
  for (const slot of slots) {
    const bases = Object.values(content.GEAR_BASES).filter((g) => g.slot === slot && (g.level ?? 1) <= 1);
    assert.ok(bases.length >= 6, `${slot} has only ${bases.length} level-1 bases`);
  }
  const stock = content.rollShopStock(1, 1, () => 0.42);
  assert.equal(stock.length, slots.length * content.SHOP_OFFERS_PER_SLOT);
  for (const slot of slots) assert.equal(stock.filter((g) => g.slot === slot).length, 6);
  assert.equal(content.canBuySupply("moss", 1), true);
  assert.equal(content.canBuySupply("sapper_kit", 1), false);
  assert.equal(content.canBuySupply("sapper_kit", 2), true);
  assert.ok(content.supplySellPrice(content.ITEMS.moss) > 0);
  for (const id of ["sapper_kit", "lockpicks", "tattered_map", "water_skin", "field_torch"]) {
    assert.equal(content.ITEMS[id].kind, "special");
  }
});

test("new reagents are required by scrolls, potions and throwables", () => {
  for (const r of content.RECIPES) {
    const kind = content.ITEMS[r.out].kind;
    if (kind === "scroll") assert.ok(r.need.includes("parchment") && r.need.includes("magic_ink"), r.id);
    if (kind === "potion") assert.ok(r.need.includes("vial"), r.id);
    if (kind === "throwable") assert.ok(r.need.includes("scrap_metal"), r.id);
  }
});

test("forge level upgrade has only a destruction risk of 10% + 5% per current level above one", () => {
  assert.equal(forge.levelUpgradeDestroyChance(1), 0.1);
  assert.equal(forge.levelUpgradeDestroyChance(2), 0.15);
  assert.equal(forge.levelUpgradeDestroyChance(5), 0.3);
  const g = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  assert.equal(forge.forgeOptions(g).find((o) => o.kind === "level").destroyChance, 0.1);
  assert.equal(forge.forgeOptions(g).find((o) => o.kind === "level").successChance, undefined);
  const p = mkP({ gold: 1000, armory: [g] });
  const destroyed = forge.forgeUpgrade(p, g.uid, "level", () => 0.05);
  assert.equal(destroyed.success, false);
  assert.equal(destroyed.destroyed, true);
  const ok = forge.forgeUpgrade(p, g.uid, "level", () => 0.2);
  assert.equal(ok.success, true);
  assert.equal(ok.destroyed, false);
  assert.equal(ok.item.level, 2);
});

test("torch expands visibility and cancels dark penalty; battle curse waits for combat end", () => {
  const m = maze.genMaze(9, 3, "classic");
  m.h = Array.from({ length: 10 }, () => Array(9).fill(false));
  m.v = Array.from({ length: 9 }, () => Array(10).fill(false));
  m.doors = []; m.openedDoors = []; m.rooms = [];
  const pos = { x: 4, y: 4 };
  const dark = maze.computeVisibility({ ...m, biome: "dark" }, pos, {});
  const torch = maze.computeVisibility({ ...m, biome: "dark" }, pos, {}, 3);
  assert.equal(dark[4][6], 1);
  assert.equal(dark[4][7], 0);
  assert.equal(torch[4][7], 1);
  assert.equal(torch[4][8], 1);

  const p = mkP({ hp: 200, stats: { str: 5, agi: 5, int: 5 }, statuses: { wound: 0, curse: traps.BATTLE_CURSE, poison: 0, cursePower: 30 } });
  const b = battle.newBattle(p, 3, false, "dark", 2);
  assert.equal(b.torchTurns, 2);
  assert.equal(b.p.statuses.curse, traps.BATTLE_CURSE);
  const readout = battle.combatReadout(b);
  assert.ok(readout.dmgMods.some((x) => x.id === "curse"));
  assert.equal(readout.missChance, 0);
  const special = battle.playerAct({ ...b, queue: ["p", "e"], idx: 0, bag: { field_torch: 1 } }, { type: "item", id: "field_torch" });
  assert.equal(special.bag.field_torch, 1);
});
