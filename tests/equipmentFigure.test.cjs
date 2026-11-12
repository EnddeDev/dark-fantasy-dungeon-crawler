const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-figure-tests-"));
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
const { EquipmentFigure, FIGURE_SLOT_POS, GearTile } = load("src/components/EquipmentFigure.tsx", "equipment-figure");
const content = load("src/game/content.ts", "content");
const { SLOT_ORDER } = load("src/game/types.ts", "types");

const noop = () => {};

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

test("силуэт: картина в стиле игры лежит в public, без внешних ресурсов", () => {
  assert.ok(fs.existsSync(path.join("public", "images", "armory", "vitruvian.jpg")), "картина есть в репозитории");
  const src = fs.readFileSync("src/components/EquipmentFigure.tsx", "utf8");
  assert.ok(src.includes('src="images/armory/vitruvian.jpg"'), "картина подключена относительным путём");
  assert.ok(!/https?:\/\//.test(src), "внешних адресов нет");
});

test("силуэт: у каждого слота есть гнездо, все гнёзда внутри картины", () => {
  for (const slot of SLOT_ORDER) {
    const p = FIGURE_SLOT_POS[slot];
    assert.ok(p, `гнездо ${slot}`);
    assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100, `${slot} внутри картины`);
  }
  assert.equal(Object.keys(FIGURE_SLOT_POS).length, SLOT_ORDER.length);
});

test("силуэт: пустое гнездо подписано, надетая вещь — только картинка без подписи", () => {
  const knife = content.createGearItem({ baseId: "knife", wear: "worn", rarity: "common", identified: true });
  const player = makePlayer({ armory: [knife], equip: { ...makePlayer().equip, mainHand: knife.uid } });
  const html = renderToStaticMarkup(React.createElement(EquipmentFigure, {
    player, chosenSlot: null, blockedSlot: null,
    onInspect: noop, onUnequip: noop, onChooseSlot: noop, onDropItem: noop,
  }));
  const name = content.scaledGearStats(knife).base.name;
  assert.ok(html.includes(`Правая рука: ${name}. Клик — подробности`), "надетая вещь доступна по подсказке");
  assert.ok(!html.includes(">Правая рука<"), "у занятого гнезда нет видимой подписи");
  assert.ok(html.includes(">Шлем<"), "у пустого гнезда видна подпись");
  assert.ok(html.includes('draggable="true"'), "надетую вещь можно перетащить в сундук");
});

test("сундук: вкладки снаряжения, припасов и реагентов; заголовок «Сундук»", () => {
  const html = renderToStaticMarkup(React.createElement(Lobby, {
    player: makePlayer({ bag: { potion_s: 1, moss: 2 } }), controller: {}, shopStock: [],
    onStart: noop, onRestart: noop, best: 1, unlockedFloor: 2, initialTab: "armory",
  }));
  assert.ok(html.includes('aria-label="Сундук"'));
  assert.ok(html.includes(">Сундук<"));
  assert.ok(html.includes("Снаряжение · "), "вкладка снаряжения");
  assert.ok(html.includes("Припасы · 1"), "вкладка припасов");
  assert.ok(html.includes("Реагенты · 1"), "вкладка реагентов");
  assert.ok(!html.includes("Свободные вещи"), "подписи «Свободные вещи» нет");
  assert.ok(!html.includes("Надето на персонаже"), "подписи «Надето на персонаже» нет");
  assert.ok(!html.includes("Инвентарь снаряжения"), "инвентарь переименован");
});

test("сундук: плитка вещи перетаскивается и показывает требования", () => {
  const sword = content.createGearItem({ baseId: "knife", wear: "worn", rarity: "common", identified: true });
  const html = renderToStaticMarkup(React.createElement(GearTile, {
    item: sword, player: makePlayer(), onInspect: noop, onEquip: noop,
  }));
  assert.ok(html.includes('draggable="true"'));
  assert.ok(html.includes("без требований"));
});
