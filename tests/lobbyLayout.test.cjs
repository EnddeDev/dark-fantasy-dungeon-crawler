const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-lobby-layout-"));
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
const { UPDATES } = load("src/components/Updates.tsx", "updates");

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
const render = (extra = {}, lobbyProps = {}) =>
  renderToStaticMarkup(React.createElement(Lobby, {
    player: makePlayer(), controller: {}, shopStock: [], onStart: noop, onRestart: noop,
    best: 4, unlockedFloor: 3, ...lobbyProps,
  }, extra.children));

test("верхняя панель: название, задания, звук и вход", () => {
  const html = render({}, { account: { label: "Войти", title: "Войти в аккаунт", onClick: noop } });
  const top = html.slice(0, html.indexOf('aria-label="Разделы лобби"'));
  assert.ok(top.includes("Сумрак"), "название игры наверху");
  assert.ok(top.includes("Задания"), "кнопка заданий");
  assert.ok(top.includes('aria-label="Настройки звука"'), "звук наверху");
  assert.ok(top.includes(">Войти</button>"), "вход наверху");
});

test("верхняя панель без аккаунта не показывает кнопку входа", () => {
  const html = render();
  assert.ok(!html.includes(">Войти</button>"), "без onOpenAuth кнопки входа нет");
  assert.ok(!html.includes(">Сообщество</button>"), "и сообщества нет");
});

test("правая панель: шесть разделов в нужном порядке, «Начать заново» внизу", () => {
  const html = render();
  const nav = html.slice(html.indexOf('aria-label="Разделы лобби"'));
  const labels = ["Развитие", "Арсенал", "Подземелья", "Магазин", "Жители", "О игре"];
  let at = -1;
  for (const label of labels) {
    const next = nav.indexOf(`>${label}</span>`);
    assert.ok(next > at, `«${label}» идёт после предыдущего раздела`);
    at = next;
  }
  assert.ok(nav.indexOf("Начать заново") > at, "«Начать заново» после разделов");
  assert.ok(!nav.includes(">Бестиарий</span>") && !nav.includes(">Как играть</span>"), "бестиарий и справка не отдельными пунктами");
});

test("«Подземелья» показывает только выбор яруса и старт", () => {
  const html = render({}, { initialTab: "dungeon" });
  assert.ok(html.includes("Выбор яруса") && html.includes("Начать с этажа 3"), "выбор этажа и старт (по умолчанию — последний открытый)");
  assert.ok(html.includes('aria-label="Выбор этажа подземелья"'), "группа этажей");
  assert.ok(!html.includes("За каждый новый уровень"), "развития на этой странице нет");
  assert.ok(!html.includes("Сумка с зельями"), "сумки нет");
});

test("«О игре» по умолчанию открывает «Как играть»; три подраздела на месте", () => {
  const html = render({}, { initialTab: "guide" });
  const at = html.indexOf('aria-label="О игре"');
  assert.ok(at > 0, "есть вкладки О игре");
  const tabs = html.slice(at, html.indexOf("</div>", at));
  for (const label of ["Бестиарий", "Как играть", "Обновления"]) assert.ok(tabs.includes(label), `подраздел «${label}»`);
  assert.ok(tabs.indexOf("Бестиарий") < tabs.indexOf("Как играть") && tabs.indexOf("Как играть") < tabs.indexOf("Обновления"), "порядок подразделов");
  assert.ok(html.includes("Полевой справочник"), "открыт раздел «Как играть»");
  assert.ok(!html.includes("Бестиарий и угрозы"), "бестиарий не открыт одновременно");
});

test("«О игре» → «Обновления» показывает журнал изменений", () => {
  const html = render({}, { initialTab: "guide" });
  assert.ok(!html.includes("Журнал изменений"), "по умолчанию журнала нет");
  assert.ok(UPDATES.length >= 3, "есть записи");
  const updates = renderToStaticMarkup(require("react").createElement(load("src/components/Updates.tsx", "updates-view").Updates));
  assert.ok(updates.includes("Журнал изменений"), "страница обновлений");
  for (const entry of UPDATES) assert.ok(updates.includes(entry.title), `запись «${entry.title}»`);
});

test("«Жители» и «Магазин» остаются на своих местах; ярусы не на них", () => {
  const shop = render({}, { initialTab: "shop" });
  assert.ok(!shop.includes("Выбор яруса"), "магазин без выбора яруса");
  const residents = render({}, { initialTab: "quests" });
  assert.ok(residents.includes("Взято заданий:"), "жители показывают задания и NPC");
  assert.ok(!residents.includes("Выбор яруса"), "жители без выбора яруса");
});

test("«Развитие»: без уровня и опыта; вкладки и сброс в шапке; блока перераспределения нет", () => {
  const html = render({}, { initialTab: "train" });
  const head = html.slice(html.indexOf('aria-label="Развитие"'), html.indexOf('aria-label="Развитие"') + 2000);
  assert.ok(head.includes("Характеристики") && head.includes("Навыки"), "две вкладки развития");
  assert.ok(head.includes("свободных очков"), "счётчик очков в шапке");
  assert.ok(head.includes("Сбросить характеристики"), "сброс справа в шапке");
  for (const text of ["Уровень 3 из", "XP", "За каждый новый уровень", "+3 очка характеристик", "Перераспределение"]) {
    assert.ok(!html.includes(text), `убрано из развития: ${text}`);
  }
  for (const stat of ["Сила", "Ловкость", "Интеллект"]) assert.ok(html.includes(stat), `характеристика «${stat}»`);
});

test("навыки: каждая ветка — отдельная строка", () => {
  const { SkillsPanel } = load("src/components/SkillsPanel.tsx", "skills-panel");
  const html = renderToStaticMarkup(React.createElement(SkillsPanel, {
    player: makePlayer({ archetype: "barbarian", level: 8, skillRanks: {} }), onRank: noop,
  }));
  assert.ok(html.includes('class="mt-3 flex flex-col gap-3"'), "ветки идут строками одна под другой");
  assert.ok(!html.includes("overflow-x-auto"), "нет горизонтальной прокрутки с карточками");
  assert.ok(!html.includes("min-w-[16rem]"), "ветки не карточками в ряд");
  assert.ok(!html.includes("md:grid-cols-3"), "не столбцами по сетке");
  assert.ok((html.match(/lg:grid-cols-\[/g) || []).length === 3, "каждая ветка — строка из пяти колонок на широком экране");
});
