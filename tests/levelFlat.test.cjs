const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-levelflat-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  return require(outfile);
}
const content = loadGameModule("content");
const gp = loadGameModule("gearParams");

/** Предмет с нулевыми бросками: ролл 0.5 даёт 0. Износ берётся у самого предмета. */
const make = (baseId, level) => content.createGearItem({ baseId, level, wear: "worn", rarity: "common", identified: true, rng: () => 0.5 });

/** Значение таблицы с износом предмета, как его считает движок (целое, если параметр целый). */
const tableValue = (key, item, level) => {
  const cls = content.gearClassFor(item);
  return Math.round(gp.gearParamBase(key, cls, content.GEAR_BASES[item.baseId].slot, level) * item.wearMult);
};

test("плоский бонус ОЗ за каждый уровень складывается поверх таблицы: тяжёлая +3, средняя +1, лёгкая +5, аксессуар +3", () => {
  const cases = [
    ["plate", 3],
    ["mail", 1],
    ["start_hood", 5],
    ["ring_stone", 3],
  ];
  for (const [baseId, perLevel] of cases) {
    const item = make(baseId, 1);
    for (const level of [1, 2, 5, 10]) {
      const leveled = { ...item, level };
      const expected = tableValue("hp", item, level) + perLevel * level;
      assert.equal(content.scaledGearStats(leveled).hp, expected, `${baseId} L${level}`);
    }
  }
});

test("у оружия и у щита нет ОЗ; плоский бонус не появляется без ОЗ", () => {
  const sword = make("sword", 1);
  assert.equal(content.scaledGearStats({ ...sword, level: 10 }).hp, 0, "оружие без ОЗ");
});

test("плоский бонус брони: тяжёлая +2, средняя +1, аксессуар +1; лёгкая без брони", () => {
  const plate = make("plate", 1);
  for (const level of [1, 5]) {
    const expected = tableValue("armor", plate, level) + 2 * level;
    assert.equal(content.scaledGearStats({ ...plate, level }).armor, expected, `тяжёлая L${level}`);
  }

  const mail = make("mail", 1);
  assert.equal(content.scaledGearStats({ ...mail, level: 5 }).armor, tableValue("armor", mail, 5) + 1 * 5, "средняя +1 за уровень");

  const hood = make("start_hood", 1);
  assert.equal(content.scaledGearStats({ ...hood, level: 10 }).armor, 0, "лёгкая броня без брони не получает плоский бонус");
});

test("плоский бонус барьера: средняя +1, лёгкая +3; только у брони на ИНТ", () => {
  const robe = make("start_robe", 1);
  assert.equal(content.scaledGearStats({ ...robe, level: 5 }).barrier, tableValue("barrier", robe, 5) + 3 * 5, "лёгкая броня на ИНТ: +3 за уровень");

  const hood = make("start_hood", 10);
  assert.equal(content.scaledGearStats({ ...hood, level: 10 }).barrier, 0, "броня на ЛОВ барьера не имеет");
  const ring = make("amulet", 10);
  assert.equal(content.scaledGearStats({ ...ring, level: 10 }).barrier, 0, "аксессуары барьера не имеют");
});

test("бросок ±1 у тяжёлой брони: предметы получают −1, 0 или +1 к броне", () => {
  const low = content.rollItemStatRolls(content.GEAR_BASES.plate, "heavy", () => 0);
  const mid = content.rollItemStatRolls(content.GEAR_BASES.plate, "heavy", () => 0.5);
  const high = content.rollItemStatRolls(content.GEAR_BASES.plate, "heavy", () => 0.99);
  assert.equal(low.armor, -1);
  assert.equal(mid.armor, 0);
  assert.equal(high.armor, 1);
});
