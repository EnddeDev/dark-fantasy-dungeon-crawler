/* Параметры брони и аксессуаров: таблица по типу и слоту (src/game/gearParams.ts). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-gearparams-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  return require(outfile);
}
const gp = load("src/game/gearParams.ts", "gearParams");

test("база типа на 1 уровне и прирост за уровень — по таблице", () => {
  assert.deepEqual(gp.GEAR_PARAM_TYPE.evade, { light: [3, 1], medium: [2, 0.75], heavy: [0, 0] });
  assert.deepEqual(gp.GEAR_PARAM_TYPE.armor, { light: [0, 0], medium: [3, 3], heavy: [7, 5] });
  assert.deepEqual(gp.GEAR_PARAM_TYPE.hp, { light: [25, 10], medium: [13, 5], heavy: [17, 7] });
  assert.deepEqual(gp.GEAR_PARAM_TYPE.regen, { light: [3, 2], medium: [1, 0.5], heavy: [2, 1] });
  assert.deepEqual(gp.GEAR_PARAM_TYPE.barrier, { light: [15, 7], medium: [8, 4], heavy: [0, 0] });
});

test("тело (без модификатора слота) — только база типа, растёт линейно", () => {
  assert.equal(gp.gearParamBase("armor", "heavy", "body", 1), 7);
  assert.equal(gp.gearParamBase("armor", "heavy", "body", 10), 7 + 5 * 9);
  assert.equal(gp.gearParamBase("hp", "light", "body", 1), 25);
  assert.equal(gp.gearParamBase("hp", "light", "body", 4), 25 + 10 * 3);
  assert.equal(gp.gearParamBase("evade", "medium", "body", 2), 2 + 0.75);
  assert.equal(gp.gearParamBase("regen", "medium", "body", 3), 1 + 0.5 * 2);
});

test("шлем: модификаторы слота складываются с базой на 1 и с приростом", () => {
  assert.equal(gp.gearParamBase("armor", "heavy", "head", 1), 7 - 1);
  assert.equal(gp.gearParamBase("armor", "heavy", "head", 4), 7 + 5 * 3 - 1 - 3);
  assert.equal(gp.gearParamBase("hp", "medium", "head", 1), 13 - 5);
  assert.equal(gp.gearParamBase("hp", "medium", "head", 5), 13 + 5 * 4 - 5 - 2 * 4);
  assert.equal(gp.gearParamBase("regen", "heavy", "head", 1), 2 - 1);
  assert.equal(gp.gearParamBase("barrier", "light", "head", 1), 15 - 2);
  assert.equal(gp.gearParamBase("evade", "light", "head", 1), 3 - 1);
  assert.equal(gp.gearParamBase("evade", "light", "head", 5), 3 + 4 - 1 - 0.25 * 4);
});

test("наручи и ботинки: уклонение, броня, ОЗ, регенерация и барьер по таблице", () => {
  assert.equal(gp.gearParamBase("evade", "light", "wrists", 1), 3 + 1, "+1% без прироста слота");
  assert.equal(gp.gearParamBase("evade", "light", "wrists", 10), 3 + 9 + 1);
  assert.equal(gp.gearParamBase("armor", "medium", "wrists", 1), 3 - 2);
  assert.equal(gp.gearParamBase("hp", "heavy", "wrists", 1), 17 - 5);
  assert.equal(gp.gearParamBase("regen", "heavy", "wrists", 1), 2 - 1);
  assert.equal(gp.gearParamBase("barrier", "medium", "wrists", 1), 8 - 2);
  assert.equal(gp.gearParamBase("evade", "medium", "feet", 1), 2 - 0.5);
  assert.equal(gp.gearParamBase("evade", "medium", "feet", 3), 2 + 0.75 * 2 - 0.5 - 0.25 * 2);
  assert.equal(gp.gearParamBase("armor", "heavy", "feet", 1), 7 - 2);
  assert.equal(gp.gearParamBase("hp", "heavy", "feet", 1), 17 - 3);
  assert.equal(gp.gearParamBase("barrier", "light", "feet", 1), 15 - 1);
});

test("щит (левая рука): броня по таблице, ОЗ не получает", () => {
  assert.equal(gp.gearParamBase("armor", "heavy", "offHand", 1), 7 + 2);
  assert.equal(gp.gearParamBase("armor", "heavy", "offHand", 3), 7 + 5 * 2 + 2 + 2);
  assert.equal(gp.gearParamBase("hp", "heavy", "offHand", 5), null, "ОЗ щита не даётся");
});

test("кольца и оберег: уклонение и броня не даются, остальное — база типа", () => {
  for (const slot of ["ring1", "ring2", "amulet"]) {
    assert.equal(gp.gearParamBase("evade", "light", slot, 3), null, `${slot}: уклонения нет`);
    assert.equal(gp.gearParamBase("armor", "heavy", slot, 3), null, `${slot}: брони нет`);
    assert.equal(gp.gearParamBase("hp", "medium", slot, 2), 13 + 5, `${slot}: ОЗ по общему правилу`);
    assert.equal(gp.gearParamBase("regen", "light", slot, 1), 3, `${slot}: регенерация по общему правилу`);
  }
});

test("ботинки не дают регенерации", () => {
  assert.equal(gp.gearParamBase("regen", "heavy", "feet", 5), null);
});

test("значения не уходят ниже нуля", () => {
  assert.equal(gp.gearParamBase("armor", "light", "head", 1), 0, "−1 у лёгкого шлема → 0");
  assert.equal(gp.gearParamBase("evade", "heavy", "head", 1), 0);
  assert.equal(gp.gearParamBase("regen", "medium", "head", 10), 0, "регенерация шлема средней брони не падает ниже 0");
});

test("бросок ±1 применяется только к положительной базе", () => {
  assert.equal(gp.gearParamValue("armor", "heavy", "body", 1, 1, 1), 8);
  assert.equal(gp.gearParamValue("armor", "heavy", "body", 1, -1, 1), 6);
  assert.equal(gp.gearParamValue("barrier", "heavy", "body", 1, 1, 1), 0, "у тяжёлой брони барьера нет — бросок не создаёт его");
  assert.equal(gp.gearParamValue("armor", "light", "body", 1, 1, 1), 0, "у лёгкой брони нулевая броня — бросок не создаёт её");
  assert.equal(gp.gearParamValue("armor", "heavy", "body", 1, undefined, 1), 7, "без броска — база");
});

test("старые большие броски не трактуются как разброс", () => {
  assert.equal(gp.gearParamOffset(9), 0);
  assert.equal(gp.gearParamOffset(-40), 0);
  assert.equal(gp.gearParamOffset(1), 1);
  assert.equal(gp.gearParamOffset(-1), -1);
  assert.equal(gp.gearParamOffset(undefined), 0);
  assert.equal(gp.gearParamValue("armor", "heavy", "body", 1, 33, 1), 7, "старый бросок 33 не меняет броню");
});

test("износ — обычный множитель; целые параметры округляются, уклонение и регенерация — до сотых", () => {
  assert.equal(gp.gearParamValue("armor", "heavy", "body", 1, 0, 0.75), Math.round(7 * 0.75));
  assert.equal(gp.gearParamValue("hp", "medium", "body", 1, 0, 1.25), Math.round(13 * 1.25));
  assert.equal(gp.gearParamValue("evade", "medium", "body", 1, 0, 1.25), 2.5);
  assert.equal(gp.gearParamValue("regen", "medium", "body", 2, 0, 0.75), Math.round((1 + 0.5) * 0.75 * 100) / 100);
});
