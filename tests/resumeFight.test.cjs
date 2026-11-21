const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-resume-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  return require(outfile);
}

const { DungeonController } = load("src/controllers/DungeonController.ts", "dungeon");
const { genMaze } = load("src/game/maze.ts", "maze");

/** Минимальная модель: контроллер подземелья читает состояние и пишет экран, карту и бой. */
function fakeModel(snapshot) {
  const model = {
    getSnapshot: () => snapshot,
    setRun: (run) => { snapshot.run = run; },
    setBattle: (battle) => { snapshot.battle = battle; },
    setScreen: (screen) => { snapshot.screen = screen; },
  };
  return model;
}

const hero = {
  name: "Покоритель",
  level: 3,
  xp: 0,
  statPoints: 0,
  stats: { str: 2, agi: 2, int: 2 },
  hp: 9,
  stamina: 33,
  gold: 0,
  bag: { potion_s: 1 },
  knownRecipes: [],
  armory: [],
  equip: { weapon: null, armor: null, trinket: null },
  passives: [],
  statuses: { wound: 2, curse: 0, poison: 0, woundTick: 1 },
  kills: 0,
};

function mazeRun() {
  const maze = genMaze(10, 3);
  return {
    floor: 3,
    maze,
    pos: { x: 2, y: 2 },
    prevPos: { x: 1, y: 2 },
    seen: {},
    gold: 0,
    loot: [],
    gearLoot: [],
    keys: 0,
    steps: 0,
    log: [],
    battleCell: 22,
  };
}

test("вход с открытым боем начинает бой заново с сохранённым здоровьем и эффектами", () => {
  const snap = { screen: "dungeon", player: hero, run: { ...mazeRun(), pendingFight: { foe: "vermin", boss: false } }, battle: null };
  const dungeon = new DungeonController(fakeModel(snap), {});
  dungeon.resumeFight();
  assert.equal(snap.screen, "battle");
  assert.ok(snap.battle, "бой создан");
  assert.equal(snap.battle.enemy.def.id, "vermin", "тот же вид существа");
  assert.equal(snap.battle.isBoss, false);
  assert.equal(snap.battle.p.hp, 9, "здоровье из точки");
  assert.equal(snap.battle.p.stamina, 33, "выносливость из точки");
  assert.equal(snap.battle.p.statuses.wound, 2, "эффект из точки");
  assert.equal(snap.run.battleCell, 22, "клетка боя та же");
  assert.equal("pendingFight" in snap.run, false, "признак открытого боя снят с модели похода");
});

test("страж яруса возвращается как босс", () => {
  const snap = { screen: "dungeon", player: hero, run: { ...mazeRun(), battleCell: null, pendingFight: { foe: "boss", boss: true } }, battle: null };
  const dungeon = new DungeonController(fakeModel(snap), {});
  dungeon.resumeFight();
  assert.equal(snap.battle.isBoss, true);
  assert.equal(snap.battle.floor, 3, "страж этажа точки");
});

test("без открытого боя вход ничего не запускает", () => {
  const snap = { screen: "dungeon", player: hero, run: mazeRun(), battle: null };
  new DungeonController(fakeModel(snap), {}).resumeFight();
  assert.equal(snap.battle, null);
  assert.equal(snap.screen, "dungeon");
});
