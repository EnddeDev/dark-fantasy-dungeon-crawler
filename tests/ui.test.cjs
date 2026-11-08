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
const { BattleView, SummaryTabs, EffectsTab, chipEntries, ENEMY_EFFECT_DESC, ENEMY_EFFECT_TITLE } = load("src/components/BattleView.tsx", "battle-view");
const { playerEffectChips } = load("src/game/effects.ts", "effects-chips");
const { heroItemEffects, learnedEffects, enemyEffects } = load("src/game/effectEntries.ts", "effect-entries");
const battle = load("src/game/battle.ts", "battle");
const monsters = load("src/game/monsters.ts", "monsters");

/** Бой с нейтральным врагом: род «никакой» и тип «сильный» не дают ни уклонения, ни иммунитетов. */
function freshBattle(pl, floor, isBoss, biome, torchTurns, burning) {
  const b = battle.newBattle(pl, floor, isBoss, biome, torchTurns, burning);
  b.enemy.def = { ...b.enemy.def, id: "fixture", race: "none", type: "strong" };
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

test("dungeon draws only revealed traps on the map", () => {
  const m = maze.genMaze(8, 1);
  const run = {
    floor: 1, maze: m, pos: m.start, prevPos: m.start, seen: {}, steps: 0,
    gold: 0, loot: [], gearLoot: [], keys: 0, log: [],
    torchTurns: 0, mapRevealed: false, revealedTraps: [],
  };
  const render = (r) => renderToStaticMarkup(React.createElement(Dungeon, {
    run: r, player: makePlayer(), bag: {},
    intStat: 1, intDiscount: 0, path: [], pathPaused: false,
    onMove: noop, onCellClick: noop, onUseItem: noop, onEquip: noop, onUnequip: noop,
    onCancelPath: noop, onResumePath: noop,
  }));
  const marks = (html) => (html.match(/stroke-dasharray="3 3"/g) ?? []).length;
  assert.equal(marks(render(run)), 0, "скрытые ловушки не отрисованы");
  assert.equal(marks(render({ ...run, revealedTraps: m.traps })), m.traps.length, "раскрытые отрисованы");
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

test("battle summary: two tabs for hero and monster — stats and effects", () => {
  const b = freshBattle(makePlayer(), 3, false);
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  assert.equal((html.match(/role="tablist"/g) || []).length, 2, "по одной паре табов у героя и монстра");
  assert.equal((html.match(/role="tab"/g) || []).length, 4, "четыре таба: два у героя, два у монстра");
  assert.ok(html.includes("Характеристики") && html.includes("Эффекты"), "подписи табов");
  assert.ok(html.includes("Урон по тебе"), "по умолчанию у монстра видны характеристики");
  assert.ok(html.includes('aria-selected="true"'), "активный таб помечен");
});

test("battle summary: effects tab lists effects with duration, empty state when none", () => {
  const empty = renderToStaticMarkup(React.createElement(EffectsTab, { chips: [], entries: [], label: "x" }));
  assert.ok(empty.includes("Эффектов нет."), "пустая вкладка эффектов");
  const b = freshBattle(makePlayer(), 3, false);
  b.p.statuses.burn = 3;
  const chips = playerEffectChips(b);
  const html = renderToStaticMarkup(React.createElement(EffectsTab, { chips, entries: chipEntries(chips), label: "эффекты героя" }));
  assert.ok(html.includes("Горение"), "эффект виден по названию");
  assert.ok(html.includes("<ul"), "список эффектов");
  const tabs = renderToStaticMarkup(React.createElement(SummaryTabs, { value: "effects", onChange: noop, effectsCount: 2 }));
  assert.match(tabs, /aria-selected="true"[^>]*>Эффекты/, "активен таб эффектов");
  assert.ok(tabs.includes(">2<") || tabs.includes(">2</span>"), "счётчик эффектов в табе");
});

test("battle: every enemy move effect has a title and a description for the hover tip", () => {
  const ids = ["bleed", "poison", "burn", "curse", "fear", "stun", "sunder", "darkness", "noHeal", "sealItems", "sealSkills", "sealAttack"];
  for (const id of ids) {
    assert.ok(ENEMY_EFFECT_TITLE[id], `название у «${id}»`);
    assert.ok(ENEMY_EFFECT_DESC[id] && ENEMY_EFFECT_DESC[id].length > 10, `описание у «${id}»`);
  }
  const b = freshBattle(makePlayer(), 3, false);
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  assert.ok(!html.includes(' title="Кровотечение'), "нативная подсказка с одним названием убрана");
});

test("battle effects: thorns, rage and other gear effects reach the list", () => {
  const item = content.createGearItem({ baseId: "sword", level: 3, wear: "worn", rarity: "common", identified: true });
  item.effects = ["thorns", "rage"];
  item.effectRolls = {};
  const entries = heroItemEffects([item]);
  const names = entries.map((en) => en.name);
  assert.ok(names.includes("Шипы"), "шипы от снаряжения попадают в список");
  assert.ok(names.includes("Ярость"), "ярость от снаряжения попадает в список");
  assert.ok(entries.every((en) => en.meta === "снаряжение" || en.meta), "у каждой строки есть пометка");
  const html = renderToStaticMarkup(React.createElement(EffectsTab, { chips: [], entries, label: "эффекты героя" }));
  assert.ok(html.includes("Шипы") && html.includes("Ярость"), "вкладка показывает эффекты снаряжения");
});

test("battle effects: enemy list has its own effects and passive, not regen/thorns twice", () => {
  const list = enemyEffects({
    effects: ["vamp", "thorns", "regen"],
    effectPower: { vamp: 25, thorns: 4, regen: 4 },
    passive: { id: "stone_hide", name: "Каменная шкура", desc: "Физический урон по нему снижен на 25%." },
  });
  const names = list.map((en) => en.name);
  assert.ok(names.includes("Вампиризм"), "врождённый эффект монстра виден");
  assert.ok(names.includes("Каменная шкура"), "пассив монстра виден");
  assert.ok(!names.includes("Шипы") && !names.includes("Регенерация"), "шипы и регенерация уже в иконках статусов");
  const vamp = list.find((en) => en.name === "Вампиризм");
  assert.equal(vamp.detail, "+25% лечения от физического урона");
});

test("battle effects: learned abilities from the hero's passives are listed", () => {
  const list = learnedEffects(["arch_bulwark_10"]);
  assert.equal(list.length, 1, "изученная способность попадает в список");
  assert.ok(list[0].name && list[0].detail, "у способности есть название и описание");
});

test("battle: bag pouch shows its three potion slots inside the actions column", () => {
  const b = freshBattle(makePlayer(), 3, false);
  b.pouch = ["potion_s"];
  b.bag = { ...b.bag, potion_s: 2 };
  b.p.turnPouch = 0;
  b.queue = ["p", "e"]; b.idx = 0;
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  assert.ok(html.includes("Сумка"), "блок сумки в действиях");
  assert.ok(html.includes("Малое зелье лечения"), "зелье из сумки видно в действиях");
  assert.ok(html.includes("×2"), "количество в рюкзаке");
  assert.ok(html.includes("без хода"), "первое зелье помечено как без хода");
  assert.equal((html.match(/Слот \d пуст/g) || []).length, 2, "два пустых слота показаны");
  const at = (x) => html.indexOf(x);
  assert.ok(at("Сумка") > at("Сбежать"), "сумка под основными кнопками");
  assert.ok(at("Сумка") < at("Сводка врага"), "сумка в центральной колонке, до монстра");
});

test("battle: three columns — hero info, actions, monster; no sidebar", () => {
  const weapon = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  const p = makePlayer({ armory: [weapon], equip: { ...makePlayer().equip, mainHand: weapon.uid } });
  const b = freshBattle(p, 1);
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  assert.ok(html.includes("xl:grid-cols-3"), "три равные колонки на всю ширину");
  assert.ok(html.includes("xl:col-start-1"), "герой стоит в первой (левой) колонке");
  assert.ok(html.includes("xl:col-start-2"), "действия стоят во второй (центральной) колонке");
  assert.ok(html.includes("xl:col-start-3"), "монстр справа, в своей колонке");
  assert.ok(!html.includes("xl:w-[22rem]"), "монстр не сжат в узкую полоску");
  assert.ok(!html.includes("Эффекты в бою"), "список эффектов героя убран");
  assert.ok(!html.includes("полный разбор"), "полный разбор героя убран");
  const at = (s) => html.indexOf(s);
  assert.ok(at("Покоритель") > 0 && at("Действия</h3>") > at("Покоритель"), "герой над действиями");
  assert.ok(at("Сводка врага") > at("Действия</h3>"), "сводка врага справа");
  assert.ok(at("Приёмы врага") > at("Сводка врага"), "приёмы врага под сводкой");
  assert.ok(at("Хроника боя") > at("Приёмы врага"), "хроника под приёмами");
  assert.ok(html.includes("Способности"), "кнопка кодекса на месте");
});

test("battle: enemy summary keeps only the key parameters, no strength/agility/intellect", () => {
  const b = freshBattle(makePlayer(), 3, false);
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  const start = html.indexOf("Сводка врага");
  const sum = html.slice(start, html.indexOf("Приёмы врага", start));
  for (const label of ["Урон по тебе", "Защита", "Уклонение", "Броня", "Стойкость", "Укрепление", "Маг. сопротивление", "Ходов в раунде"]) {
    assert.ok(sum.includes(`aria-label="${label}: `), `строка «${label}» есть`);
  }
  assert.ok(!sum.includes('aria-label="Характеристики: '), "у монстра нет строки характеристик героя (таб «Характеристики» — его собственный)");
  assert.ok(!sum.includes("role=\"tooltip\""), "подсказки открываются только по наведению");
});

test("battle: race and type sit above the monster name as hover tags", () => {
  const b = freshBattle(makePlayer(), 3, false);
  b.enemy.def = { ...b.enemy.def, name: "Тестовый зверь", race: "beast" };
  b.enemy.mtype = "agile";
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  const raceAt = html.indexOf(`>${monsters.MONSTER_RACE_META.beast.name}</span>`);
  const typeAt = html.indexOf(`>${monsters.MONSTER_TYPE_META.agile.name}</span>`);
  const nameAt = html.indexOf("Тестовый зверь</h3>");
  assert.ok(raceAt > 0 && typeAt > 0, "род и тип выведены тегами");
  assert.ok(raceAt < nameAt && typeAt < nameAt, "теги над именем");
  assert.ok(html.indexOf("Тестовый зверь</h3>") > html.indexOf(`>${monsters.MONSTER_TYPE_META.agile.name}</span>`));
  assert.ok(html.includes('tabindex="0"'), "теги открывают подсказку с фокусом и наведением");
});

test("battle: enemy moves list damage and effect icons from the turn rules", () => {
  const b = freshBattle(makePlayer(), 3, false);
  b.enemy.def = { ...b.enemy.def, race: "beast" };
  b.enemy.moves = ["attack", "wound", "darkness"];
  b.enemy.atk = [5, 8];
  const er = battle.enemyReadout(b);
  const byMove = Object.fromEntries(er.moves.map((m) => [m.move, m]));
  assert.ok(byMove.attack.damage > 0, "обычный удар наносит урон");
  assert.deepEqual(byMove.attack.effects.map((x) => x.id).sort(), ["bleed", "poison"]);
  assert.ok(byMove.attack.effects.every((x) => x.half), "зверь накладывает кровь или яд примерно в половине ударов");
  assert.deepEqual(byMove.wound.effects, [{ id: "bleed", half: false }]);
  assert.equal(byMove.darkness.damage, 0, "мрак урона не наносит");
  assert.deepEqual(byMove.darkness.effects, [{ id: "darkness", half: false }]);
  const html = renderToStaticMarkup(React.createElement(BattleView, {
    battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
  }));
  const start = html.indexOf("Приёмы врага");
  const list = html.slice(start, html.indexOf("Хроника боя", start));
  assert.ok(list.includes("≈"), "урон приёма показан приблизительно");
  assert.ok(list.includes("Кровотечение"), "иконка кровотечения с подписью");
});

test("battle: enemy guard raises its armor, the summary shows both values", () => {
  const b = freshBattle(makePlayer(), 3, false);
  /* Броня фиксируется: у случайного монстра она может быть 0, и защита ничего не меняет. */
  b.enemy.armor = 10;
  b.enemy.guard = false;
  const base = battle.enemyReadout(b).armor;
  b.enemy.guard = true;
  const er = battle.enemyReadout(b);
  assert.ok(er.armor > base, "в защите броня выше");
  assert.equal(er.armorBase, base, "базовая броня без защиты та же");
});

test("battle: backpack is a full-height panel", () => {
  const view = fs.readFileSync("src/components/BattleView.tsx", "utf8");
  assert.match(view, /menu === "item" && \(\s*<div className="fixed inset-0 z-40 flex justify-start">/, "рюкзак открывается слева поверх экрана");
  assert.match(view, /<aside className="rise relative flex h-full w-\[min\(30rem,100vw\)\]/, "панель на всю высоту экрана");
});


test("battle shows the concentration meter and the archetype special, enabled only at 5", () => {
  const p = makePlayer({ archetype: "barbarian" });
  const render = (conc) => {
    const b = freshBattle(p, 1);
    b.queue = ["p", "e"];
    b.idx = 0;
    b.p.concentration = conc;
    return renderToStaticMarkup(React.createElement(BattleView, {
      battle: b, onAct: noop, onEnemyTurn: noop, onContinue: noop,
    }));
  };
  const buttonAt = (html) => {
    const at = html.indexOf("Спец-приём: Кровавый расчёт");
    assert.ok(at > 0, "кнопка спец-приёма есть у варвара");
    const start = html.lastIndexOf("<button", at);
    return html.slice(start, at);
  };
  const low = render(3);
  assert.ok(low.includes("Концентрация"), "шкала концентрации видна");
  assert.ok(low.includes("3/5"));
  assert.ok(/ disabled=""/.test(buttonAt(low)), "при 3 кнопка закрыта");
  const full = render(5);
  assert.ok(full.includes("5/5"));
  assert.ok(!/ disabled=""/.test(buttonAt(full)), "при 5 кнопка открыта");
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
  assert.ok(!html.includes("Горение ×2"), "эффекты героя по умолчанию во вкладке, не в сводке");
  const fireChips = playerEffectChips(fire);
  const heroTab = renderToStaticMarkup(React.createElement(EffectsTab, { chips: fireChips, entries: chipEntries(fireChips), label: "эффекты героя" }));
  assert.ok(heroTab.includes("Горение ×2"), "горение героя видно во вкладке «Эффекты»");
  assert.ok(html.includes("Горение ×3"), "горение врага видно иконкой с множителем");

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

test("сумка с зельями лежит в арсенале под «Надето на персонаже», а не в выборе яруса", () => {
  const player = makePlayer({ bag: { potion_s: 1 } });
  const common = { player, controller: {}, shopStock: [], onStart: noop, best: 1, unlockedFloor: 2, onSetPouch: () => null };
  const armory = renderToStaticMarkup(React.createElement(Lobby, { ...common, initialTab: "armory" }));
  const at = armory.indexOf('aria-label="Сумка с зельями"');
  assert.ok(at > 0, "в арсенале есть сумка");
  assert.ok(at > armory.indexOf("Надето на персонаже"), "сумка под экипировкой");
  assert.ok(at < armory.indexOf('id="armory-inventory"'), "сумка до инвентаря");
  const floor = renderToStaticMarkup(React.createElement(Lobby, { ...common }));
  assert.ok(floor.includes("Выбор яруса"), "панель выбора яруса видна");
  assert.ok(!floor.includes('aria-label="Сумка с зельями"'), "в выборе яруса сумки нет");
});
