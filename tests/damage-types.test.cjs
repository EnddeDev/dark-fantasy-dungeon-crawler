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

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  return require(outfile);
}

const types = load("src/game/damageTypes.ts", "damage-types");

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
