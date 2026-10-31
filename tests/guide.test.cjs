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
  assert.match(html, /2 свободных очка/);
  assert.match(html, /3 очка/);
  assert.match(html, /×1\.25/);
  assert.match(html, /×1\.00/);
  assert.match(html, /×0\.75/);
  assert.match(html, /Одно действие — один ход/);
});

test("guide does not repeat the stale agility-evasion claim", () => {
  assert.doesNotMatch(html, /Ловкость — ходы в раунде, уклонение/);
  assert.doesNotMatch(html, /Ловкость.*уклонение.*урон быстрых/);
  assert.match(html, /Уклонение даёт не Ловкость, а снаряжение, эффекты и пассивы/);
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
  assert.ok(html.includes("Метательные — от Ловкости"));
  assert.ok(html.includes("Обычные зелья лечения и поддержки работают без множителя"));
  assert.match(html, /25% сопротивления эффектам/);
  assert.match(html, /только в первом раунде/);
  assert.match(html, /250 × текущий уровень/);
  assert.match(html, /качество 25\/50\/75%/);
  assert.match(html, /изношенность 30\/60%/);
  assert.match(html, /шанс успеха 80%/);
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
