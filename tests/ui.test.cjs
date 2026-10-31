const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-ui-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const { Lobby } = load("src/components/Lobby.tsx", "lobby");
const { Rail } = load("src/components/Rail.tsx", "rail");
const { Dungeon } = load("src/components/Dungeon.tsx", "dungeon");
const { BattleView } = load("src/components/BattleView.tsx", "battle-view");
const battle = load("src/game/battle.ts", "battle");
const content = load("src/game/content.ts", "content");
const maze = load("src/game/maze.ts", "maze");

function makePlayer(extra = {}) {
  return {
    name: "Покоритель", level: 3, xp: 20, statPoints: 3,
    stats: { str: 3, agi: 3, int: 4 }, hp: 40, gold: 120,
    bag: { potion_s: 2, scroll_heal: 1 }, knownRecipes: [], armory: [], passives: [], kills: 2,
    shopLevel: 1, archetype: null, statMilestones: {},
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

const noop = () => {};

test("lobby removes the development-rules block and the requested floor copy", () => {
  const html = renderToStaticMarkup(React.createElement(Lobby, {
    player: makePlayer(), setPlayer: noop, shopStock: [],
    onRefreshShop: noop, onPurchaseGear: noop, onUpgradeShop: noop,
    onStart: noop, best: 1, unlockedFloor: 2, initialTab: "train",
  }));
  for (const text of [
    "Правила развития",
    "Здесь распределяют очки",
    "Победи Стража, чтобы открыть следующий этаж",
    "опыт без потолка этажа",
  ]) assert.ok(!html.includes(text), `should be removed: ${text}`);
  assert.ok(html.includes("Начать с этажа"));
  assert.ok(html.includes("+3 очка характеристик"));
});

test("left character panel hides the sheet label, health and free stat points", () => {
  const html = renderToStaticMarkup(React.createElement(Rail, {
    player: makePlayer(), run: null, battle: null, onLeaveRun: noop,
  }));
  for (const text of ["Лист персонажа", "Здоровье", "Максимум здоровья", "Свободных очков"]) {
    assert.ok(!html.includes(text), `should be removed: ${text}`);
  }
  assert.ok(html.includes("Кошель"));
  assert.ok(html.includes("Характеристики"));
});

test("dungeon header hides maze counts and corridor healing shows fixed/INT formulas", () => {
  const m = maze.genMaze(6, 1);
  const run = {
    floor: 1, maze: m, pos: m.start, prevPos: m.start, seen: {}, steps: 0,
    gold: 0, loot: [], gearLoot: [], keys: 0, log: [],
  };
  const html = renderToStaticMarkup(React.createElement(Dungeon, {
    run, player: makePlayer(), bag: { potion_s: 2, scroll_heal: 1 }, hp: 20, maxHp: 40,
    intStat: 4, intDiscount: 0, path: [], pathPaused: false,
    onMove: noop, onCellClick: noop, onUseItem: noop, onEquip: noop, onUnequip: noop,
    onCancelPath: noop, onResumePath: noop,
  }));
  assert.ok(!html.includes("Лабиринт"));
  assert.ok(!/Лабиринт \d+×\d+ · комнат/.test(html));
  assert.ok(html.includes("+28 здоровья"));
  assert.ok(html.includes("+48 здоровья")); // 32 + 4×ИНТ(4)
});

test("battle puts actions in the center and the log under the enemy on the right", () => {
  const weapon = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  const p = makePlayer({ armory: [weapon], equip: { ...makePlayer().equip, mainHand: weapon.uid } });
  const b = battle.newBattle(p, 1);
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  assert.ok(html.includes("xl:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1.05fr)_minmax(300px,0.9fr)]"));
  const actions = html.indexOf("Действия</h3>");
  const enemy = html.indexOf("Способности");
  const log = html.indexOf("Хроника боя");
  assert.ok(actions > 0 && enemy > actions && log > enemy);
  assert.ok(html.includes("xl:col-start-2"));
  assert.ok(html.includes("xl:col-start-3"));
  const effectsStart = html.indexOf("Эффекты в бою");
  const effectsEnd = html.indexOf("Действия</h3>", effectsStart);
  const effects = html.slice(effectsStart, effectsEnd);
  assert.ok(!/при[её]м/i.test(effects), "effects panel should not describe techniques");
});
