const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

/**
 * Панель персонажа: эффекты предметов суммируются так же, как в бою.
 * Учитываются только надетые исследованные вещи; дополнительные ходы не складываются.
 */
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-effect-totals-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const content = load("content");
const scaling = load("gearScaling");
const effects = load("gearEffects");
const totals = load("gearEffectTotals");
const { createGearItem } = content;
const { gearEffectTotals } = totals;

/** Вещь с заданными свойствами: остальное берётся из обычного броска. */
function item(baseId, { level = 1, rarity = "common", identified = true, list = [], rolls = {} } = {}) {
  const g = createGearItem({ baseId, wear: "worn", rarity, level, identified, rng: () => 0.5 });
  return { ...g, effects: list, effectRolls: rolls };
}

test("одинаковые эффекты складываются по всем предметам", () => {
  const gear = [
    item("knife", { list: ["wisdom"], rolls: { wisdom: 6 } }),
    item("sword", { list: ["wisdom"], rolls: { wisdom: 6 } }),
    item("amulet", { list: ["wisdom"], rolls: { wisdom: 4 } }),
  ];
  const [wisdom] = gearEffectTotals(gear);
  assert.equal(wisdom.id, "wisdom");
  assert.equal(wisdom.total, 16);
  assert.equal(wisdom.stacking, "sum");
  assert.equal(wisdom.sources.length, 3);
  assert.equal(wisdom.detail, "+16% к множителю от Интеллекта");
});

test("сумма совпадает с суммой значений каждого предмета на его уровне", () => {
  const gear = [
    item("knife", { level: 5, list: ["crit_chance"], rolls: { crit_chance: 5 } }),
    item("sword", { level: 3, list: ["crit_chance"], rolls: { crit_chance: 7 } }),
  ];
  const [crit] = gearEffectTotals(gear);
  const expected =
    scaling.effectMagnitude("crit_chance", 5, 5) + scaling.effectMagnitude("crit_chance", 3, 7);
  assert.equal(crit.total, expected);
  assert.deepEqual(crit.sources.map((s) => s.level), [5, 3]);
});

test("неисследованные и ненадетые вещи не попадают в сумму", () => {
  const gear = [
    item("knife", { list: ["wisdom"], rolls: { wisdom: 6 } }),
    item("sword", { identified: false, list: ["wisdom"], rolls: { wisdom: 9 } }),
  ];
  const [wisdom] = gearEffectTotals(gear);
  assert.equal(wisdom.sources.length, 1);
  assert.equal(wisdom.total, 6);
});

test("без эффектов список пустой", () => {
  assert.deepEqual(gearEffectTotals([item("knife")]), []);
  assert.deepEqual(gearEffectTotals([]), []);
});

test("разные эффекты дают отдельные записи", () => {
  const gear = [
    item("knife", { list: ["wisdom", "crit_chance"], rolls: { wisdom: 6, crit_chance: 5 } }),
    item("sword", { list: ["wisdom"], rolls: { wisdom: 4 } }),
  ];
  const result = gearEffectTotals(gear);
  assert.deepEqual(result.map((r) => r.id).sort(), ["crit_chance", "wisdom"]);
  assert.equal(result.find((r) => r.id === "wisdom").total, 10);
  assert.equal(result.find((r) => r.id === "crit_chance").sources.length, 1);
});

test("дополнительные ходы: берётся наибольшее значение, не сумма", () => {
  const gear = [
    item("knife", { level: 9, rarity: "epic", list: ["ap"] }),
    item("sword", { level: 9, rarity: "epic", list: ["ap"] }),
  ];
  const [ap] = gearEffectTotals(gear);
  assert.equal(ap.stacking, "max");
  assert.equal(ap.total, scaling.effectMagnitude("ap", 9));
  assert.equal(ap.sources.length, 2);
});

test("дополнительные ходы не превышают трёх", () => {
  const gear = [1, 2, 3].map(() => item("sword", { level: 10, rarity: "legendary", list: ["ap"] }));
  const [ap] = gearEffectTotals(gear);
  assert.ok(ap.total <= scaling.MAX_EXTRA_AP, `ап ${ap.total}`);
});

test("ход из предмета, который не может его дать, не учитывается", () => {
  const result = gearEffectTotals([item("knife", { level: 9, rarity: "common", list: ["ap"] })]);
  assert.equal(result.length, 0);
});

test("текст итога для одного предмета совпадает с описанием предмета", () => {
  const g = item("knife", { level: 4, list: ["vamp"], rolls: { vamp: 5 } });
  const [vamp] = gearEffectTotals([g]);
  assert.equal(vamp.detail, effects.effectDetail("vamp", 4, 5));
});
