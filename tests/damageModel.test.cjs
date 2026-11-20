const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-model-"));

function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const model = loadGameModule("damageModel");
const monsters = loadGameModule("monsters");

test("множитель стихии: сопротивление снижает, уязвимость усиливает, иммунитет обнуляет", () => {
  assert.equal(monsters.elementMult(0), 1, "без сопротивления");
  assert.equal(monsters.elementMult(0.25), 0.75, "сопротивление 25%");
  assert.equal(monsters.elementMult(-0.5), 1.5, "уязвимость ×1,5");
  assert.equal(monsters.elementMult(1), 0, "иммунитет");
  assert.equal(monsters.elementMult(2), 0, "сопротивление выше 100% не даёт отрицательного урона");
});

test("сопротивление рода совпадает с прежним множителем стихии", () => {
  assert.equal(monsters.raceElementRes("construct", "fire"), -0.5);
  assert.equal(monsters.raceElementMult("construct", "fire"), 1.5);
  assert.equal(monsters.raceElementRes("beast", "light"), 1);
  assert.equal(monsters.raceElementMult("beast", "light"), 0);
  assert.equal(monsters.raceElementRes("undead", "fire"), 0);
  assert.equal(monsters.raceElementRes("undead", undefined), 0, "без стихии сопротивления нет");
  assert.equal(monsters.raceElementMult("undead", undefined), 1);
});

test("слои сопротивлений: физический — броня и укрепление, магический — сопротивление магии, стихия — плюс сопротивление стихии", () => {
  assert.deepEqual(model.resistLayersOf("phys"), ["armor", "fortify"]);
  assert.deepEqual(model.resistLayersOf("magic"), ["magicResist"]);
  for (const e of ["fire", "ice", "acid", "light"]) {
    assert.deepEqual(model.resistLayersOf(e), ["magicResist", "elementRes"], e);
  }
  assert.deepEqual(model.resistLayersOf("pure"), [], "чистый без слоёв");
  assert.deepEqual(model.resistLayersOf("poison"), [], "яд без слоёв удара");
  assert.deepEqual(model.resistLayersOf("bleed"), [], "кровотечение без слоёв удара");
});

test("вид урона приёма: СИЛ и ЛОВ — физический, ИНТ — магический, стихия важнее школы", () => {
  assert.equal(model.techniqueDamageType({ scaleStat: "str" }), "phys");
  assert.equal(model.techniqueDamageType({ scaleStat: "agi" }), "phys");
  assert.equal(model.techniqueDamageType({ scaleStat: "int" }), "magic");
  assert.equal(model.techniqueDamageType({ scaleStat: "str", magic: true }), "magic", "явно магический от СИЛ");
  assert.equal(model.techniqueDamageType({ scaleStat: "int", element: "fire" }), "fire", "ИНТ с выбранной стихией");
  assert.equal(model.techniqueDamageType({ scaleStat: "str", element: "ice" }), "ice", "стихия задаёт вид и от СИЛ");
  assert.equal(model.techniqueDamageType({ scaleStat: "int", pure: true }), "pure", "чистый важнее всего");
});

test("класс приёма: защитный приём — защитный, без поля — атакующий", () => {
  assert.equal(model.techniqueClassOf("defense"), "defense");
  assert.equal(model.techniqueClassOf("attack"), "attack");
  assert.equal(model.techniqueClassOf(undefined), "attack");
});
