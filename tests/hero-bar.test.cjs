const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-hero-bar-tests-"));
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

const { HeroBar } = load("src/components/HeroBar.tsx", "hero-bar");
const battle = load("src/game/battle.ts", "battle");
const noop = () => {};

function makePlayer(extra = {}) {
  return {
    name: "Покоритель", level: 3, xp: 20, statPoints: 0,
    stats: { str: 3, agi: 3, int: 4 }, hp: 26, gold: 220,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 0,
    shopLevel: 1, archetype: null, statMilestones: {},
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

test("верхняя полоса: имя, кошелёк, здоровье и кнопка листа вне боя", () => {
  const html = renderToStaticMarkup(React.createElement(HeroBar, {
    player: makePlayer(), run: null, battle: null, onOpenSheet: noop,
  }));
  assert.ok(html.includes("Покоритель"));
  assert.ok(html.includes("220"), "кошелёк виден");
  assert.ok(html.includes("Здоровье"), "здоровье видно вне боя");
  assert.ok(html.includes("Персонаж"), "кнопка листа есть");
  assert.ok(!html.includes("в вылазке"), "вне вылазки нет строки про добычу");
});

test("верхняя полоса в вылазке показывает этаж и добычу под риском", () => {
  const run = { floor: 2, gold: 35, keys: 0, loot: [], gearLoot: [] };
  const html = renderToStaticMarkup(React.createElement(HeroBar, {
    player: makePlayer(), run, battle: null, onOpenSheet: noop,
  }));
  assert.ok(html.includes("в вылазке +35"));
  assert.ok(html.includes("Этаж"));
});

test("в бою здоровье в полосе не дублируется", () => {
  const b = battle.newBattle(makePlayer(), 1, false);
  const html = renderToStaticMarkup(React.createElement(HeroBar, {
    player: makePlayer(), run: null, battle: b, onOpenSheet: noop,
  }));
  assert.ok(!html.includes(">Здоровье<"), "в бою строки здоровья нет");
});

test("левая колонка убрана: лист открывается поверх экрана, Rail один", () => {
  const view = fs.readFileSync("src/views/GameView.tsx", "utf8");
  assert.ok(!view.includes("lg:flex-row"), "экран не делится на колонки");
  assert.equal((view.match(/<Rail\b/g) || []).length, 1, "лист персонажа — единственный вызов Rail");
  assert.match(view, /aria-modal="true"[^>]*aria-label="Лист персонажа"|role="dialog" aria-modal="true"/);
  assert.match(view, /Escape/, "лист закрывается клавишей Esc");
  const rail = fs.readFileSync("src/components/Rail.tsx", "utf8");
  assert.ok(!rail.includes("lg:w-[350px]"), "старой боковой ширины нет");
  assert.match(rail, /onClose/, "у листа есть кнопка закрытия");
});
