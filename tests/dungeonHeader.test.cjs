const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-dungeon-header-"));
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

const { Dungeon } = load("src/components/Dungeon.tsx", "dungeon");
const maze = load("src/game/maze.ts", "maze");
const biomes = load("src/game/biomes.ts", "biomes");
const quests = load("src/game/quests.ts", "quests");
const { ActiveQuestList } = load("src/components/Quests.tsx", "quests-ui");

const noop = () => {};

function makePlayer(extra = {}) {
  return {
    name: "Покоритель", level: 3, xp: 20, statPoints: 3,
    stats: { str: 3, agi: 3, int: 4 }, hp: 40, gold: 120,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 2,
    shopLevel: 1, archetype: null, statMilestones: {},
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

function render(biome) {
  const m = maze.genMaze(8, 1);
  m.biome = biome;
  const run = {
    floor: 4, maze: m, pos: m.start, prevPos: m.start, seen: {}, steps: 0,
    gold: 0, loot: [], gearLoot: [], keys: 0, log: [],
    torchTurns: 0, mapRevealed: false, revealedTraps: [],
  };
  return renderToStaticMarkup(React.createElement(Dungeon, {
    run, player: makePlayer(), bag: {},
    intStat: 1, intDiscount: 0, path: [], pathPaused: false,
    onMove: noop, onCellClick: noop, onUseItem: noop,
    onCancelPath: noop, onResumePath: noop,
  }));
}

test("шапка карты как в лобби: бренд, задания, рюкзак и звук; тип подземелья в шапке не выводится", () => {
  const html = render("swamp");
  const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  assert.ok(header.includes("Сумрак"), "название игры");
  assert.ok(header.includes("подземелье · этаж"), "подзаголовок с этажом");
  assert.ok(!header.includes(biomes.BIOMES.swamp.name), "тип подземелья убран из шапки");
  assert.ok(header.includes("Задания"), "кнопка заданий");
  assert.ok(header.includes("Рюкзак"), "кнопка рюкзака");
  assert.ok(header.includes("sticky"), "шапка закреплена, как в лобби");
  assert.ok(header.indexOf("Задания") < header.indexOf("Рюкзак"), "задания левее рюкзака");
});

test("задания на карте: взятые задания видны, сдачи здесь нет", () => {
  const q = quests.rollQuest("priest", 2, () => 0.3);
  const player = makePlayer({ questLog: { ...quests.emptyQuestLog(), active: [q] } });
  const html = renderToStaticMarkup(React.createElement(ActiveQuestList, { player }));
  assert.ok(html.includes(q.title), "название взятого задания");
  assert.ok(!html.includes(">Сдать<"), "кнопки сдачи на карте нет");
  const empty = renderToStaticMarkup(React.createElement(ActiveQuestList, { player: makePlayer() }));
  assert.ok(empty.includes("Взятых заданий нет"), "пустой список");
});

test("карта: блоки «Снаряжение · смена в походе» и «Разведка и опасности» убраны", () => {
  const html = render("classic");
  assert.ok(!html.includes("Снаряжение · смена в походе"));
  assert.ok(!html.includes("Разведка и опасности"));
  assert.ok(html.includes("Журнал этажа"), "журнал остался");
  assert.ok(html.includes("шагов:"), "статистика осталась над картой");
});
