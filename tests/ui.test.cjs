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
const { Rail, EffectTip, EffectList, summedEffectEntries } = load("src/components/Rail.tsx", "rail");
const { gearEffectTotals } = load("src/game/gearEffectTotals.ts", "gear-effect-totals");
const { Dungeon } = load("src/components/Dungeon.tsx", "dungeon");
const { BattleView } = load("src/components/BattleView.tsx", "battle-view");
const battle = load("src/game/battle.ts", "battle");

/** Бой с нейтральным врагом: род «никакой» и тип «сильный» не дают ни уклонения, ни иммунитетов. */
function freshBattle(pl, floor, isBoss, biome, torchTurns, burning) {
  const b = battle.newBattle(pl, floor, isBoss, biome, torchTurns, burning);
  b.enemy.def = { ...b.enemy.def, race: "none", type: "strong" };
  b.enemy.mtype = "strong";
  return b;
}
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

test("left panel shows battle parameters as icon badges; the multiplier value is on the badge, details only on hover", () => {
  const knife = content.createGearItem({ baseId: "knife", wear: "worn", rarity: "common", identified: true, level: 10 });
  const player = makePlayer({
    level: 11, stats: { str: 2, agi: 18, int: 4 }, armory: [knife],
    equip: { ...makePlayer().equip, mainHand: knife.uid },
  });
  const ws = content.weaponSkillFor(knife);
  const html = renderToStaticMarkup(React.createElement(Rail, {
    player, run: null, battle: null, onLeaveRun: noop,
  }));
  assert.ok(html.includes("Боевые параметры"), "блок боевых параметров есть");
  assert.ok(html.includes(`aria-label="Множитель приёма: ${ws.scaleMult.toFixed(2)}"`), html);
  assert.ok(html.includes('aria-label="Броня: '), "броня показана иконкой и значением");
  assert.ok(html.includes('aria-label="Критический удар: '), "критический удар показан иконкой и значением");
  assert.ok(!html.includes('role="tooltip"'), "подсказка открывается только по наведению");
  assert.ok(!html.includes("Архетип") && !html.includes("не выбран"), "строка «Архетип» удалена");
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

test("armory: кнопка «Исследовать все» показывает цену и не даёт платить без золота", () => {
  const soul = content.createGearItem({ baseId: "soulstone", level: 6, wear: "worn", rarity: "common", identified: false });
  const render = (gold) => renderToStaticMarkup(React.createElement(Lobby, {
    player: makePlayer({ level: 3, gold, stats: { str: 1, agi: 1, int: 3 }, armory: [soul], passives: [] }),
    controller: {}, shopStock: [], onStart: noop, onRestart: noop, best: 1, unlockedFloor: 2, initialTab: "armory",
  }));
  const poor = render(100);
  assert.ok(poor.includes("Исследовать все · 1 · 120 зол."), "цена за неизученную вещь уровня 6");
  assert.ok(poor.includes("не хватает 20 зол."), "подсказка о нехватке");
  const rich = render(500);
  assert.ok(rich.includes("Исследовать все · 1 · 120 зол."));
  assert.ok(!rich.includes("не хватает"), "при достаточном золоте подсказки нет");
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
  const b = freshBattle(p, 1);
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
  const fire = freshBattle(makePlayer(), 3, false, "fire");
  fire.p.statuses.burning = 2;
  fire.enemy.statuses.burning = 3;
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: fire, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  assert.ok(html.includes('data-biome="fire"'));
  assert.ok(html.includes("Огненные недра"));
  assert.ok(html.includes("Горение ×2"));
  assert.ok(html.includes("Горение врага ×3"));

  const dark = freshBattle(makePlayer(), 3, false, "dark");
  const darkHtml = renderToStaticMarkup(React.createElement(BattleView, {
    battle: dark, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  assert.ok(darkHtml.includes("Промах в мраке"));
  assert.ok(darkHtml.includes("25%"));
});

test("battle summary rows are icons with values; names and hints live in the popup", () => {
  const b = freshBattle(makePlayer(), 3, false, "dark");
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  const start = html.indexOf("Сводка боя");
  const summary = html.slice(start, html.indexOf("Действия</h3>", start) > 0 ? html.indexOf("Действия</h3>", start) : undefined);
  assert.ok(summary.includes('aria-label="Урон оружием: '), "урон оружием — иконка и значение");
  assert.ok(summary.includes('aria-label="Броня: '), "броня — иконка и значение");
  assert.ok(summary.includes('aria-label="Промах в мраке: 25%"'), "промах в мраке показан иконкой");
  assert.ok(summary.includes('aria-label="Характеристики: '), "характеристики — иконка и значение");
  assert.ok(!summary.includes(">Ходов в раунде<") && !summary.includes(">Урон оружием<"), "названия строк не выводятся текстом");
  assert.ok(!summary.includes("после брони"), "подсказка строки не выводится в карточке");
  assert.ok(!summary.includes('role="tooltip"'), "подсказка открывается только по наведению");
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
  const b = { ...freshBattle(p, 1), bag: { potion_s: 1, field_torch: 1, moss: 1 } };
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  // The main menu does not render the item list until opened, so assert via the battle module guard instead.
  const after = battle.playerAct({ ...b, queue: ["p", "e"], idx: 0 }, { type: "item", id: "field_torch" });
  assert.equal(after.bag.field_torch, 1);
  assert.ok(html.includes("Действия"));
});

test("gear filter has one button per equipment slot, rings grouped", () => {
  const player = makePlayer({ armory: [content.createGearItem({ baseId: "sword", wear: "worn", rarity: "common", identified: true })] });
  const html = renderToStaticMarkup(React.createElement(Lobby, {
    player, controller: {}, shopStock: [], onStart: noop, best: 1, unlockedFloor: 2, initialTab: "armory",
  }));
  const group = html.slice(html.indexOf('aria-label="Слот снаряжения"'));
  assert.ok(group.length > 0, "группа фильтра слотов есть");
  const buttonFor = (label) => new RegExp(`<button[^>]*>(?:<svg[\\s\\S]*?<\\/svg>)?\\s*${label}\\s*<\\/button>`).test(group);
  for (const label of ["Все", "Правая рука", "Левая рука", "Шлем", "Тело", "Наручи", "Ботинки", "Кольца", "Оберег"]) {
    assert.ok(buttonFor(label), `кнопка «${label}» есть`);
  }
  assert.ok(!buttonFor("Броня"), "общей кнопки «Броня» больше нет");
  assert.ok(!buttonFor("Руки"), "общей кнопки «Руки» больше нет");
});

test("shop supplies filter by level and reagents open sorted by level with category filters", () => {
  const player = makePlayer({ gold: 5000, shopLevel: 5, bag: {} });
  const supplies = renderToStaticMarkup(React.createElement(Lobby, {
    player, controller: {}, shopStock: [], onStart: noop, best: 1, unlockedFloor: 2, initialTab: "shop", initialShopSection: "supplies",
  }));
  assert.ok(supplies.includes('aria-label="Уровень припаса"'), "фильтр припасов по уровню есть");
  assert.ok(/ур\. 1</.test(supplies) && /ур\. 5</.test(supplies), "кнопки уровней есть");
  assert.ok(supplies.includes("Показано: "), "счётчик показанных припасов есть");

  const reagents = renderToStaticMarkup(React.createElement(Lobby, {
    player, controller: {}, shopStock: [], onStart: noop, best: 1, unlockedFloor: 2, initialTab: "shop", initialShopSection: "reagents",
  }));
  for (const label of ["Растения", "Части тварей", "Минералы и камни", "Ткани"]) {
    assert.ok(reagents.includes(label), `категория «${label}» есть`);
  }
  assert.ok(!reagents.includes('aria-label="Сортировка реагентов"'), "сортировки реагентов в магазине нет");
  /* По умолчанию — по уровню: самый младший камень (уровень 1) идёт раньше самого старшего (уровень 5). */
  const firstStone = reagents.indexOf(content.ITEMS.stone_river.name);
  const lastStone = reagents.indexOf(content.ITEMS.stone_diamond.name);
  assert.ok(firstStone > 0 && lastStone > firstStone, "камни уровня 1 идут раньше камней уровня 5");
  const firstPlant = reagents.indexOf(content.ITEMS.herb.name);
  assert.ok(firstPlant > 0 && firstPlant < lastStone, "растения уровня 1 стоят в начале списка, до камней уровня 5");
});

test("shop gear: type filter light/medium/heavy next to slots, no sort control; armory keeps sort", () => {
  const player = makePlayer({ gold: 5000, shopLevel: 5, armory: [] });
  const shop = renderToStaticMarkup(React.createElement(Lobby, {
    player, controller: {}, shopStock: [], onStart: noop, best: 1, unlockedFloor: 2, initialTab: "shop", initialShopSection: "equipment",
  }));
  assert.ok(shop.includes('aria-label="Тип брони"'), "группа фильтра типа брони есть в магазине");
  const typeGroup = shop.slice(shop.indexOf('aria-label="Тип брони"'));
  for (const label of ["Любой тип", "Лёгкий", "Средний", "Тяжёлый"]) {
    assert.ok(typeGroup.includes(`>${label}</button>`), `кнопка «${label}» есть`);
  }
  assert.ok(!shop.includes('aria-label="Сортировка"'), "в магазине сортировки снаряжения нет");

  const armory = renderToStaticMarkup(React.createElement(Lobby, {
    player, controller: {}, shopStock: [], onStart: noop, best: 1, unlockedFloor: 2, initialTab: "armory",
  }));
  assert.ok(armory.includes('aria-label="Сортировка"'), "в арсенале сортировка осталась");
  assert.ok(!armory.includes('aria-label="Тип брони"'), "тип брони фильтрует только магазин");
});

test("left panel shows main stats as icons with values; name and description appear only on hover", () => {
  const player = makePlayer({ stats: { str: 7, agi: 3, int: 5 } });
  const html = renderToStaticMarkup(React.createElement(Rail, {
    player, run: null, battle: null, onLeaveRun: noop,
  }));
  assert.ok(html.includes("Основные характеристики"));
  assert.ok(html.includes('aria-label="Сила: 7"'), "СИЛ: иконка и значение");
  assert.ok(html.includes('aria-label="Ловкость: 3"'), "ЛОВ: иконка и значение");
  assert.ok(html.includes('aria-label="Интеллект: 5"'), "ИНТ: иконка и значение");
  /* В закрытом состоянии подсказки нет, имя характеристики не выводится текстом. */
  assert.ok(!html.includes('role="tooltip"'), "подсказка открывается только по наведению");
  assert.ok(!html.includes(">Сила<") && !html.includes(">Ловкость<") && !html.includes(">Интеллект<"));
  assert.ok(!html.includes("+10 ОЗ, +1 урона"), "описание прироста не выводится в карточке");
  assert.ok(!html.includes("Ходы в раунде"), "описание характеристики не выводится в карточке");
});

test("left panel sums the same gear effect over worn items; the hover tip lists each item's share", () => {
  const wornWisdom = (baseId, roll) => ({
    ...content.createGearItem({ baseId, wear: "worn", rarity: "common", identified: true, level: 1, rng: () => 0.5 }),
    effects: ["wisdom"], effectRolls: { wisdom: roll },
  });
  const knife = wornWisdom("knife", 6);
  const amulet = wornWisdom("amulet", 6);
  const ring = wornWisdom("ring_band", 4);
  const player = makePlayer({
    armory: [knife, amulet, ring],
    equip: { ...makePlayer().equip, mainHand: knife.uid, amulet: amulet.uid, ring1: ring.uid },
  });
  const entries = summedEffectEntries([knife, amulet, ring]);
  assert.equal(entries.length, 1, "одна запись на эффект");
  const list = renderToStaticMarkup(React.createElement(EffectList, { entries, empty: "пусто" }));
  assert.ok(list.includes("Предметов: 3"), "три предмета дают одну запись с числом предметов");
  assert.ok(list.includes("+16% к множителю от Интеллекта"), "значение складывается: 6 + 6 + 4");
  assert.ok(!list.includes("+6% к множителю от Интеллекта"), "одиночное значение первого предмета не выводится");

  const [wisdom] = gearEffectTotals([knife, amulet, ring]);
  const tip = renderToStaticMarkup(React.createElement(EffectTip, {
    id: "tip-test",
    entry: {
      id: "effect-wisdom", title: "Мудрость", detail: wisdom.detail,
      breakdown: wisdom.sources.map((s) => ({ name: s.name, level: s.level, detail: s.detail })),
    },
  }));
  assert.ok(tip.includes('role="tooltip"'), "подсказка открывается по наведению");
  assert.ok(tip.includes("От предметов"), "в подсказке есть список предметов");
  for (const base of [knife, amulet, ring]) {
    assert.ok(tip.includes(content.GEAR_BASES[base.baseId].name), `в подсказке назван ${base.baseId}`);
  }
  assert.ok(tip.includes("+6% к множителю от Интеллекта") && tip.includes("+4% к множителю от Интеллекта"), "у каждого предмета своё значение");
});
