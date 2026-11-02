const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Keep bundles under node_modules so external react/react-dom resolve from the repo.
const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-damage-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name, extra = {}) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    logLevel: "silent",
    ...extra,
  });
  return require(outfile);
}

const types = load("src/game/damageTypes.ts", "damage-types");
const ui = load("src/components/DamageTypeIcon.tsx", "damage-icon", { external: ["react", "react-dom", "react/jsx-runtime"] });
const content = load("src/game/content.ts", "damage-content");

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
    logLevel: "silent",
  });
  const { Guide } = require(outfile);
  return renderToStaticMarkup(React.createElement(Guide, { onOpenShop: () => {}, onOpenArmory: () => {}, onOpenBestiary: () => {} }));
}

test("виды урона: физический, магический, четыре стихии и три периодических", () => {
  assert.deepEqual(
    types.DAMAGE_TYPES.map((t) => t.name),
    ["Физический", "Магический", "Огонь", "Лёд", "Кислота", "Свет", "Яд", "Горение", "Кровотечение"],
  );
  const direct = types.DAMAGE_TYPES.filter((t) => t.group === "direct");
  const periodic = types.DAMAGE_TYPES.filter((t) => t.group === "periodic");
  assert.deepEqual(direct.map((t) => t.id), ["phys", "magic", "fire", "ice", "acid", "light"]);
  assert.deepEqual(periodic.map((t) => t.id), ["poison", "burn", "bleed"]);
});

test("школы: физический режется бронёй, все стихии и магический — магическим сопротивлением", () => {
  const school = Object.fromEntries(types.DAMAGE_TYPES.map((t) => [t.id, t.school]));
  assert.equal(school.phys, "phys");
  for (const id of ["magic", "fire", "ice", "acid", "light"]) assert.equal(school[id], "magic", id);
  for (const id of ["poison", "burn", "bleed"]) assert.equal(school[id], undefined, `${id} — периодический, школы нет`);
});

test("тексты стихий называют родов, которые к ним уязвимы или иммунны", () => {
  const text = (id) => types.DAMAGE_TYPES.find((t) => t.id === id).text;
  assert.ok(text("fire").includes("конструкт"), "огонь: конструкт уязвим");
  assert.ok(text("ice").includes("конструкт"), "лёд: конструкт уязвим");
  assert.ok(text("acid").includes("конструкт"), "кислота: конструкт уязвим");
  assert.ok(text("light").includes("вампир"), "свет: вампир уязвим");
  assert.ok(text("light").includes("зверь"), "свет: зверь иммунен");
  assert.ok(text("light").includes("Иммунитет"), "свет: иммунитет назван");
});

test("периодический урон: проценты совпадают с таблицей статусов, сопротивления описаны верно", () => {
  const text = (id) => types.DAMAGE_TYPES.find((t) => t.id === id).text;
  assert.ok(text("poison").startsWith("4% макс. ОЗ"));
  assert.ok(text("bleed").startsWith("5% макс. ОЗ"));
  assert.ok(text("burn").startsWith("5% макс. ОЗ"));
  assert.ok(text("poison").includes("Не режется сопротивлениями"));
  assert.ok(text("bleed").includes("Не режется сопротивлениями"));
  assert.ok(text("burn").includes("Не режется магическим сопротивлением"));
});

test("руководство выводит виды урона и не упоминает «чистый» урон", () => {
  const html = renderGuide();
  assert.ok(html.includes("Виды урона"), "заголовок раздела есть");
  for (const t of types.DAMAGE_TYPES) assert.ok(html.includes(`${t.name}.`), `вид «${t.name}» выведен`);
  assert.ok(html.includes("Магический урон."), "правило про магический урон");
  assert.ok(!/чисты/i.test(html), "слова «чистый/чистого» в руководстве нет");
});

test("все стихии — магический урон", () => {
  assert.deepEqual(types.DAMAGE_ELEMENTS, ["fire", "ice", "acid", "light"]);
  const school = Object.fromEntries(types.DAMAGE_TYPES.map((t) => [t.id, t.school]));
  for (const id of types.DAMAGE_ELEMENTS) assert.equal(school[id], "magic", `${id} — магический`);
  for (const id of types.DAMAGE_ELEMENTS) assert.equal(types.isDamageElement(id), true, id);
  assert.equal(types.isDamageElement("phys"), false);
  assert.equal(types.isDamageElement("poison"), false);
});

test("вид урона предмета: стихия, яд и кровотечение", () => {
  const items = content.ITEMS;
  assert.equal(types.itemDamageType(items.scroll_fire.use), "fire");
  assert.equal(types.itemDamageType(items.scroll_frost.use), "ice");
  assert.equal(types.itemDamageType(items.poison_dart.use), "poison");
  assert.equal(types.itemDamageType(items.holy_water.use), "light");
  assert.equal(types.itemDamageType(items.scroll_bolt.use), undefined, "молния — без стихии");
  assert.equal(types.itemDamageType(undefined), undefined);
});

test("уязвимости и иммунитеты родов выводятся из таблицы рода", () => {
  assert.deepEqual(types.raceElementRows("construct"), { weak: ["fire", "ice", "acid"], immune: [] });
  assert.deepEqual(types.raceElementRows("vampire"), { weak: ["light"], immune: [] });
  assert.deepEqual(types.raceElementRows("beast"), { weak: [], immune: ["light"] });
  assert.deepEqual(types.raceElementRows("none"), { weak: [], immune: [] });
});

test("значок вида урона открывает подсказку с названием, школой и текстом", () => {
  const { renderToStaticMarkup: render } = require("react-dom/server");
  const fire = render(React.createElement(ui.DamageTypeTag, { id: "fire" }));
  assert.ok(fire.includes('aria-label="Огонь: подробнее"'), "кнопка с подписью");
  assert.ok(fire.includes("<svg"), "иконка нарисована");
  const bleed = render(React.createElement(ui.DamageTypeTag, { id: "bleed" }));
  assert.ok(bleed.includes('aria-label="Кровотечение: подробнее"'));
  const row = render(React.createElement(ui.ElementRow, { label: "уязвим к:", elements: ["fire", "ice"] }));
  assert.ok(row.includes("Огонь") && row.includes("Лёд") && row.includes("уязвим к:"), "строка стихий рода");
  assert.equal(render(React.createElement(ui.ElementRow, { label: "x", elements: [] })), "", "пустая строка не выводится");
  assert.equal(ui.damageKindLabel(types.DAMAGE_TYPES[2]), "магический · стихия");
  assert.equal(ui.damageKindLabel(types.DAMAGE_TYPES[0]), "физический");
  assert.equal(ui.damageKindLabel(types.DAMAGE_TYPES[6]), "периодический");
});

