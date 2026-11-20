const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-train-section-"));
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
const { SkillsPanel } = load("src/components/SkillsPanel.tsx", "skills-panel");
const { STAT_META } = load("src/game/content.ts", "content");
const { ARCHETYPES } = load("src/game/archetypes.ts", "archetypes");
const { skillPointsAvailable } = load("src/game/archetypeSkills.ts", "archetype-skills");

function makePlayer(extra = {}) {
  return {
    name: "Покоритель", level: 7, xp: 20, statPoints: 0,
    stats: { str: 3, agi: 3, int: 4 }, hp: 40, gold: 120,
    bag: {}, knownRecipes: [], armory: [], passives: [], kills: 2,
    shopLevel: 1, archetype: null, statMilestones: {}, skillRanks: {},
    statuses: { wound: 0, curse: 0, poison: 0 },
    equip: { mainHand: null, offHand: null, head: null, body: null, feet: null, wrists: null, ring1: null, ring2: null, amulet: null },
    ...extra,
  };
}

const noop = () => {};
const renderLobby = (player) =>
  renderToStaticMarkup(React.createElement(Lobby, {
    player, controller: {}, shopStock: [], onStart: noop, onRestart: noop, best: 4, unlockedFloor: 3,
  }));

const NOTICE = "Есть свободное очко навыка";

test("характеристики: описание в окне, в карточке его нет, кнопка описания есть", () => {
  const html = renderLobby(makePlayer());
  const [stat] = Object.values(STAT_META);
  assert.ok(!html.includes(stat.blurb), "описание характеристики не выведено в карточку");
  assert.ok(!html.includes(stat.gain), "прирост характеристики не выведен в карточку");
  assert.ok(html.includes(`aria-label="Описание: ${stat.name}"`), "кнопка описания есть");
});

test("архетип: абзац про 5 уровень и рубежи убран", () => {
  const html = renderLobby(makePlayer({ level: 3 }));
  assert.ok(!html.includes("выбери основной архетип"), "текста про выбор архетипа нет");
  assert.ok(!html.includes("Усиления архетипов открываются"), "текста про рубежи нет");
  assert.ok(!html.includes("Можно усилить свой путь"), "текста про соседний архетип нет");
});

test("навыки: точка на вкладке «Развитие» и подвкладке, если есть свободное очко", () => {
  const archetype = Object.keys(ARCHETYPES)[0];
  const player = makePlayer({ archetype });
  assert.ok(skillPointsAvailable(player) > 0, "в фикстуре есть свободное очко");
  const html = renderLobby(player);
  const count = html.split(`aria-label="${NOTICE}"`).length - 1;
  assert.equal(count, 2, "точка на вкладке и на подвкладке");
});

test("навыки: без архетипа или без свободных очков точки нет", () => {
  assert.ok(!renderLobby(makePlayer()).includes(NOTICE), "без архетипа точки нет");
  const archetype = Object.keys(ARCHETYPES)[0];
  const spent = makePlayer({ archetype, level: 5 });
  assert.equal(skillPointsAvailable(spent), 0, "на 5 уровне очков нет");
  assert.ok(!renderLobby(spent).includes(NOTICE), "без свободных очков точки нет");
});

test("панель навыков: строка о свободных очках только когда очки есть", () => {
  const archetype = Object.keys(ARCHETYPES)[0];
  const free = makePlayer({ archetype });
  const withLine = renderToStaticMarkup(React.createElement(SkillsPanel, { player: free, onRank: noop }));
  assert.ok(withLine.includes("Свободно очков навыков"), "строка есть при свободных очках");
  const none = makePlayer({ archetype, level: 5 });
  const withoutLine = renderToStaticMarkup(React.createElement(SkillsPanel, { player: none, onRank: noop }));
  assert.ok(!withoutLine.includes("Свободно очков навыков"), "строки нет без очков");
});
