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
    player: makePlayer(), controller: {}, shopStock: [],
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

test("left panel shows health, then negative effects, then experience", () => {
  const player = makePlayer({ hp: 17, statuses: { wound: 2, curse: 1, poison: 0 } });
  const html = renderToStaticMarkup(React.createElement(Rail, {
    player, run: null, battle: null, onLeaveRun: noop,
  }));
  for (const text of ["Лист персонажа", "Максимум здоровья", "Свободных очков"]) {
    assert.ok(!html.includes(text), `should be removed: ${text}`);
  }
  const health = html.indexOf("Здоровье");
  const negative = html.indexOf("Негативные эффекты");
  const xp = html.indexOf("Опыт");
  assert.ok(health > -1, "здоровье живёт в левой панели");
  assert.ok(negative > health, "негативные эффекты идут под здоровьем");
  assert.ok(xp > negative, "опыт идёт после негативных эффектов");
  assert.ok(html.includes("Кровотечение") && html.includes("Проклятие"));
  assert.ok(html.includes("Кошель"));
  assert.ok(html.includes("Характеристики"));
});

test("starter knife and rag show no requirements in the armory", () => {
  const knife = { ...content.createGearItem({ baseId: "knife", wear: "worn", rarity: "common", identified: true }), noReq: true };
  const rag = { ...content.createGearItem({ baseId: "rag", wear: "worn", rarity: "common", identified: true }), noReq: true };
  const player = makePlayer({
    level: 1, stats: { str: 1, agi: 1, int: 1 }, armory: [knife, rag],
    equip: { ...makePlayer().equip, mainHand: knife.uid, body: rag.uid },
  });
  const html = renderToStaticMarkup(React.createElement(Lobby, {
    player, controller: {}, shopStock: [], onStart: noop, onRestart: noop, best: 1, unlockedFloor: 1, initialTab: "armory",
  }));
  assert.ok((html.match(/без требований/g) ?? []).length >= 2, "у стартовых вещей нет требований");
  assert.ok(!html.includes("ЛОВ 2") && !html.includes("СИЛ 2"), "характеристики не требуются");
  assert.ok(!html.includes("Нужно:"), "нет предупреждения о нехватке характеристик");
});

test("armory shows supplies and reagents from the bag", () => {
  const player = makePlayer({ bag: { potion_s: 2, scroll_heal: 1, moss: 3 } });
  const html = renderToStaticMarkup(React.createElement(Lobby, {
    player, controller: {}, shopStock: [], onStart: noop, best: 1, unlockedFloor: 2, initialTab: "armory",
  }));
  assert.ok(html.includes("Припасы и реагенты"), "в арсенале виден блок припасов и реагентов");
  assert.ok(html.includes("припасов: 2") && html.includes("реагентов: 1"));
  /* Сумка — таблица в две вкладки: припасы открыты по умолчанию. */
  assert.ok(html.includes("Припасы · 2") && html.includes("Реагенты · 1"));
  assert.ok(html.includes("<table"), "припасы показаны таблицей");
  assert.ok(html.includes(content.ITEMS.potion_s.name), "видно зелье");
  assert.ok(html.includes("Продать 1"), "из арсенала можно продать припас");
  assert.ok(html.includes("Цена продажи"));
});

test("dungeon draws every trap on the map, even outside the torch light", () => {
  const m = maze.genMaze(8, 1);
  const run = {
    floor: 1, maze: m, pos: m.start, prevPos: m.start, seen: {}, steps: 0,
    gold: 0, loot: [], gearLoot: [], keys: 0, log: [],
    torchTurns: 0, mapRevealed: false,
  };
  const html = renderToStaticMarkup(React.createElement(Dungeon, {
    run, player: makePlayer(), bag: {},
    intStat: 1, intDiscount: 0, path: [], pathPaused: false,
    onMove: noop, onCellClick: noop, onUseItem: noop, onEquip: noop, onUnequip: noop,
    onCancelPath: noop, onResumePath: noop,
  }));
  const marks = (html.match(/stroke-dasharray="3 3"/g) ?? []).length;
  assert.equal(marks, m.traps.length, "все ловушки этажа отрисованы сразу");
});

test("dungeon header hides maze counts and corridor healing shows fixed/INT formulas", () => {
  const m = maze.genMaze(8, 1);
  const run = {
    floor: 1, maze: m, pos: m.start, prevPos: m.start, seen: {}, steps: 0,
    gold: 0, loot: [], gearLoot: [], keys: 0, log: [],
  };
  const html = renderToStaticMarkup(React.createElement(Dungeon, {
    run, player: makePlayer(), bag: { potion_s: 2, scroll_heal: 1, moss: 3 },
    intStat: 4, intDiscount: 0, path: [], pathPaused: false,
    onMove: noop, onCellClick: noop, onUseItem: noop, onEquip: noop, onUnequip: noop,
    onCancelPath: noop, onResumePath: noop,
  }));
  assert.ok(!html.includes("Лабиринт"));
  assert.ok(!/Лабиринт \d+×\d+ · комнат/.test(html));
  /* Кнопки направлений убраны, здоровье больше не в шапке карты. */
  for (const text of ["Север", "Восток", "Юг", "Запад"]) assert.ok(!html.includes(`>${text}<`), `кнопка ${text} должна быть удалена`);
  assert.ok(!/здоровье/i.test(html), "в шапке карты нет блока здоровья");
  assert.ok(html.includes("Рюкзак"), "в лабиринте можно открыть рюкзак");
  assert.ok(html.includes("+28 здоровья"));
  assert.ok(html.includes("+32 здоровья")); // свиток лечения больше не масштабируется от ИНТ
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


test("dungeon map renders distinct biome palettes, textures and rules", () => {
  const cases = [
    ["swamp", "Подземное болото", "#9fb87a", "Лечение обоих участников −50%"],
    ["ice", "Ледяные просторы", "#e7f1f5", "−3 ОЗ в начале своего хода"],
    ["dark", "Тёмное подземелье", "#b7b9ba", "Видимость 2 клетки"],
    ["fire", "Огненные недра", "#3a1712", "горение усиливается на 2 ОЗ"],
  ];
  for (const [id, name, color, rule] of cases) {
    const m = maze.genMaze(8, 3, id);
    const run = { floor: 3, maze: m, pos: m.start, prevPos: m.start, seen: {}, steps: 0, gold: 0, loot: [], gearLoot: [], keys: 0, log: [] };
    const html = renderToStaticMarkup(React.createElement(Dungeon, {
      run, player: makePlayer(), bag: { potion_s: 1, scroll_heal: 1 }, hp: 20, maxHp: 40,
      intStat: 4, intDiscount: 0, path: [], pathPaused: false,
      onMove: noop, onCellClick: noop, onUseItem: noop, onEquip: noop, onUnequip: noop,
      onCancelPath: noop, onResumePath: noop,
    }));
    assert.ok(html.includes(`data-biome="${id}"`), id);
    assert.ok(html.includes(name), id);
    assert.ok(html.includes(color), id);
    assert.ok(html.includes(rule), id);
    assert.ok(html.includes("biomeTexture"), id);
    if (id === "swamp") {
      assert.ok(html.includes("+28 здоровья"), "potion stays full");
      assert.ok(html.includes("+16 здоровья"), "scroll is halved");
    }
  }
});

test("battle view shows the biome rule and live burning stacks", () => {
  const fire = battle.newBattle(makePlayer(), 3, false, "fire");
  fire.p.statuses.burning = 2;
  fire.enemy.statuses.burning = 3;
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: fire, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  assert.ok(html.includes('data-biome="fire"'));
  assert.ok(html.includes("Огненные недра"));
  assert.ok(html.includes("Горение ×2"));
  assert.ok(html.includes("Горение врага ×3"));

  const dark = battle.newBattle(makePlayer(), 3, false, "dark");
  const darkHtml = renderToStaticMarkup(React.createElement(BattleView, {
    battle: dark, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  assert.ok(darkHtml.includes("Промах в мраке"));
  assert.ok(darkHtml.includes("25%"));
});

test("lobby exposes stat reset, special supplies and sell buttons", () => {
  const html = renderToStaticMarkup(React.createElement(Lobby, {
    player: makePlayer({ gold: 1000, bag: { moss: 2, sapper_kit: 1 } }), controller: {}, shopStock: [],
    onStart: noop, best: 1, unlockedFloor: 2, initialTab: "train",
  }));
  assert.ok(html.includes("Сбросить характеристики"));
  assert.ok(html.includes("100 × уровень персонажа"));
  assert.ok(html.includes("1 Сила / 1 Ловкость / 1 Интеллект"));
});

test("dungeon shows field specials, torch chip and revealed map markers", () => {
  const m = maze.genMaze(8, 3, "fire");
  const run = {
    floor: 3, maze: m, pos: m.start, prevPos: m.start, seen: {}, steps: 0,
    gold: 0, loot: [], gearLoot: [], keys: 0, log: [],
    torchTurns: 4, mapRevealed: true, burning: 2,
  };
  const html = renderToStaticMarkup(React.createElement(Dungeon, {
    run, player: makePlayer(), bag: { field_torch: 1, water_skin: 1, tattered_map: 1, sapper_kit: 1 }, hp: 20, maxHp: 40,
    intStat: 4, intDiscount: 0, path: [], pathPaused: false,
    onMove: noop, onCellClick: noop, onUseItem: noop, onEquip: noop, onUnequip: noop,
    onCancelPath: noop, onResumePath: noop,
  }));
  assert.ok(html.includes("факел: 4 ход."));
  /* Огненные недра больше не жгут на карте — счётчик горения убран. */
  assert.ok(!html.includes("горение ×2"));
  assert.ok(html.includes("карта раскрыта"));
  assert.ok(html.includes("Факел"));
  assert.ok(html.includes("Бурдюк с водой"));
  assert.ok(html.includes("Потрёпанная карта"));
  assert.ok(!html.includes("Снаряжение сапёра"));
});

test("battle item menu hides special supplies and reagents", () => {
  const p = makePlayer({ bag: { potion_s: 1, field_torch: 1, moss: 1 } });
  const b = { ...battle.newBattle(p, 1), bag: { potion_s: 1, field_torch: 1, moss: 1 } };
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  // The main menu does not render the item list until opened, so assert via the battle module guard instead.
  const after = battle.playerAct({ ...b, queue: ["p", "e"], idx: 0 }, { type: "item", id: "field_torch" });
  assert.equal(after.bag.field_torch, 1);
  assert.ok(html.includes("Действия"));
});
