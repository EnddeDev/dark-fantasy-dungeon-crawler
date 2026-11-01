const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Keep the bundle under node_modules so external react/react-dom resolve from the repo.
const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-guide-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function renderGuide() {
  const outfile = path.join(temp, "guide.cjs");
  buildSync({
    entryPoints: ["src/components/Guide.tsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  const { Guide } = require(outfile);
  return renderToStaticMarkup(
    React.createElement(Guide, {
      onOpenShop: () => {},
      onOpenArmory: () => {},
      onOpenBestiary: () => {},
    }),
  );
}

const html = renderGuide();

test("guide opens with a short game intro before the reference sections", () => {
  const about = html.indexOf('id="guide-about"');
  const stats = html.indexOf('id="guide-stats"');
  const gear = html.indexOf('id="guide-gear"');
  const combat = html.indexOf('id="guide-combat"');
  const reference = html.indexOf('id="guide-reference"');
  assert.ok(about >= 0 && stats > about && gear > stats && combat > gear && reference > combat);
  assert.match(html, /СУМРАК<\/b> — тёмное фэнтези/);
  assert.match(html, /Только вынесенная добыча становится твоей/);
});

test("guide core sections are characteristics, gear quality/wear, then combat rules", () => {
  assert.match(html, /id="guide-stats-title"[^>]*>Характеристики</);
  assert.match(html, /id="guide-gear-title"[^>]*>Снаряжение: качество и износ</);
  assert.match(html, /id="guide-combat-title"[^>]*>Правила боя</);
  assert.match(html, /3 свободных очка/);
  assert.match(html, /3 очка/);
  assert.match(html, /×1\.25/);
  assert.match(html, /×1\.00/);
  assert.match(html, /×0\.75/);
  assert.match(html, /Одно действие — один ход/);
});

test("guide codifies the new stat formulas and probability rule", () => {
  assert.doesNotMatch(html, /Уклонение даёт не Ловкость/);
  assert.ok(html.includes("Здоровье: 10 базовых + 10 × СИЛ"));
  assert.ok(html.includes("Урон оружием: 2 + 1 × СИЛ"));
  assert.ok(html.includes("Стойкость: 5% за каждое очко"));
  assert.ok(html.includes("Ход: 1 за каждое очко ЛОВ"));
  assert.ok(html.includes("Уклонение: 5% за каждое очко"));
  assert.ok(html.includes("Урон расходников: 7 + 1.5 × ЛОВ"));
  assert.ok(html.includes("Крит-шанс: 2% + 1% × ЛОВ"));
  assert.ok(html.includes("Магическое сопротивление: 5% за каждое очко"));
  assert.ok(html.includes("Урон приёмов и свитков: 10 + 2 × ИНТ"));
  assert.ok(html.includes("Правило вероятностей"));
  assert.ok(html.includes("x + y × (100 − x) / 100"));
  assert.ok(html.includes("20% + 10% = 28%"));
  assert.ok(html.includes("70% + 70% = 91%"));
  assert.ok(html.includes("99%"));
});

test("guide navigation anchors point to existing sections", () => {
  for (const id of ["guide-stats", "guide-gear", "guide-combat", "guide-biomes", "guide-reference"]) {
    assert.ok(html.includes(`href="#${id}"`), `missing nav link ${id}`);
    assert.ok(html.includes(`id="${id}"`), `missing section ${id}`);
  }
});

test("extra reference material is collapsed by default", () => {
  const referenceStart = html.indexOf('id="guide-reference"');
  const reference = html.slice(referenceStart);
  assert.ok(reference.includes("<details"));
  assert.doesNotMatch(reference, /<details[^>]*\sopen/);
  for (const id of ["guide-map", "guide-gear-details", "guide-levels", "guide-archetypes", "guide-craft", "guide-bestiary", "guide-events", "guide-return"]) {
    assert.ok(reference.includes(`id="${id}"`), `missing reference ${id}`);
  }
});

test("guide keeps the current combat and crafting numbers", () => {
  assert.ok(html.includes("Урон расходников — 7 + 1.5 × ЛОВ"));
  assert.ok(html.includes("Обычные зелья лечения и поддержки работают без множителя"));
  assert.match(html, /25% сопротивления эффектам/);
  assert.ok(html.includes("Ускорение от снаряжения"));
  assert.ok(html.includes("каждый раунд"));
  assert.ok(html.includes("+1 с уровня 3"));
  assert.ok(html.includes("+2 с уровня 7"));
  assert.ok(html.includes("+3 на уровне 10"));
  assert.match(html, /250 × текущий уровень/);
  assert.match(html, /качество 25\/50\/75%/);
  assert.match(html, /изношенность 30\/60%/);
  assert.match(html, /шанс успеха 80%/);
});

test("guide lists gear types, item stat rules, all positive effects and all negative effects", () => {
  assert.ok(html.includes("Оружие"), "гид объясняет тип «оружие»");
  assert.ok(html.includes("ни здоровья, ни защиты"), "оружие не даёт защитных характеристик");
  assert.ok(html.includes("Тяжёлая требует СИЛ"), "тяжёлая броня требует СИЛ");
  assert.ok(html.includes("СИЛ даёт защиту и немного здоровья"), "аксессуары дают бонус по характеристике");
  assert.ok(html.includes("Свойство у аксессуара есть"), "у аксессуара всегда есть свойство");
  assert.ok(html.includes("только в правую"), "меч, молот и посох — только правая рука");
  assert.ok(html.includes("магическими"), "приёмы посоха и палочки магические");
  for (const name of ["Вампиризм", "Магический вампиризм", "Шанс крита", "Критический урон", "Регенерация", "Укрепление", "Магическое сопротивление", "Наступление", "Ярость", "Ускорение", "Мудрость", "Мощь", "Точность", "Шипы"]) {
    assert.ok(html.includes(name), name);
  }
  for (const name of ["Проклятие", "Яд", "Горение", "Кровотечение", "Обморожение", "Увядание", "Оглушение", "Страх", "Раскол"]) {
    assert.ok(html.includes(name), name);
  }
});


test("guide explains the five labyrinth biomes and their exact spawn chances", () => {
  const section = html.indexOf('id="guide-biomes"');
  const reference = html.indexOf('id="guide-reference"');
  assert.ok(section > 0 && reference > section);
  for (const name of ["Классический лабиринт", "Подземное болото", "Ледяные просторы", "Тёмное подземелье", "Огненные недра"]) {
    assert.ok(html.includes(name), name);
  }
  assert.ok(html.includes("1–2 этажах"));
  assert.ok(html.includes("30%"));
  assert.ok(html.includes("17,5%"));
  assert.ok(html.includes("Лечение обоих участников −50%"));
  assert.ok(html.includes("−3 ОЗ в начале своего хода"));
  assert.ok(html.includes("Видимость 2 клетки"));
  assert.ok(html.includes("горение усиливается на 2 ОЗ"));
});

test("guide documents reset, declining enemy scaling, traps, specials and new reagents", () => {
  assert.ok(html.includes("100 × текущий уровень героя"));
  assert.ok(html.includes("1/1/1"));
  assert.ok(html.includes("1.50"));
  assert.ok(html.includes("1.45"));
  assert.ok(html.includes("1.05"));
  assert.ok(html.includes("Подготовиться и принять"));
  assert.ok(html.includes("Обойти"));
  assert.ok(html.includes("Обезвредить"));
  assert.ok(html.includes("снаряжения сапёра"));
  assert.ok(html.includes("Отмычки"));
  assert.ok(html.includes("Потрёпанная карта"));
  assert.ok(html.includes("Бурдюк с водой"));
  assert.ok(html.includes("Факел"));
  assert.ok(html.includes("пергамент"));
  assert.ok(html.includes("магические чернила"));
  assert.ok(html.includes("металлолом"));
  assert.ok(html.includes("фляга"));
  assert.ok(html.includes("10% + 5% × (текущий уровень предмета − 1)"));
  assert.ok(html.includes("Отдельного шанса успеха нет"));
  assert.ok(html.includes("Риск уничтожения"));
  assert.ok(html.includes("5%"));
  assert.ok(html.includes("1–3 реагента"));
  assert.ok(html.includes("6 вариантов"));
});
