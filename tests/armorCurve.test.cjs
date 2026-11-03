const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-armor-curve-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const content = load("content");
const scaling = load("gearScaling");
const { armorValue, ARMOR_CURVE } = scaling;

/* Полный диапазон слота: минимум — изношенное с качеством 0, максимум — новое с качеством 1. */
function fullRange(slot, gearClass, level) {
  return [armorValue(slot, gearClass, level, "battered", 0), armorValue(slot, gearClass, level, "new", 1)];
}

test("тяжёлая броня на 1 уровне: голова 4–8, щит 6–10, ноги 4–8, наручи 5–9, тело 10–16", () => {
  assert.deepEqual(fullRange("head", "heavy", 1), [4, 8]);
  assert.deepEqual(fullRange("offHand", "heavy", 1), [6, 10]);
  assert.deepEqual(fullRange("feet", "heavy", 1), [4, 8]);
  assert.deepEqual(fullRange("wrists", "heavy", 1), [5, 9]);
  assert.deepEqual(fullRange("body", "heavy", 1), [10, 16]);
});

test("тяжёлая броня на 10 уровне: голова 30–34, щит 40–50, ноги 26–28, наручи 24–30, тело 50–66", () => {
  assert.deepEqual(fullRange("head", "heavy", 10), [30, 34]);
  assert.deepEqual(fullRange("offHand", "heavy", 10), [40, 50]);
  assert.deepEqual(fullRange("feet", "heavy", 10), [26, 28]);
  assert.deepEqual(fullRange("wrists", "heavy", 10), [24, 30]);
  assert.deepEqual(fullRange("body", "heavy", 10), [50, 66]);
});

test("средняя броня даёт вдвое меньше тяжёлой на каждом уровне", () => {
  for (const slot of Object.keys(ARMOR_CURVE)) {
    for (let level = 1; level <= 10; level++) {
      for (const [wear, q] of [["battered", 0], ["worn", 0.5], ["new", 1]]) {
        const heavy = armorValue(slot, "heavy", level, wear, q);
        const medium = armorValue(slot, "medium", level, wear, q);
        assert.ok(Math.abs(medium - heavy / 2) <= 0.5, `${slot} L${level} ${wear}: средняя ${medium}, тяжёлая ${heavy}`);
      }
    }
  }
});

test("средняя тело на 1 уровне 4–8 и на 10 уровне 25–33", () => {
  assert.deepEqual(fullRange("body", "medium", 1), [5, 8]);
  assert.deepEqual(fullRange("body", "medium", 10), [25, 33]);
});

test("лёгкая броня защиты не даёт ни на одном слоте и уровне", () => {
  for (const slot of Object.keys(ARMOR_CURVE)) {
    for (let level = 1; level <= 10; level++) {
      assert.equal(armorValue(slot, "light", level, "new", 1), 0, `${slot} L${level}`);
    }
  }
});

test("диапазон растёт линейно по уровням: каждый уровень не меньше предыдущего", () => {
  for (const slot of Object.keys(ARMOR_CURVE)) {
    let prevLo = -1;
    let prevHi = -1;
    for (let level = 1; level <= 10; level++) {
      const [lo, hi] = fullRange(slot, "heavy", level);
      assert.ok(lo >= prevLo && hi >= prevHi, `${slot} L${level}: ${lo}-${hi}`);
      prevLo = lo;
      prevHi = hi;
    }
  }
});

test("износ сдвигает качество: изношенное — нижняя половина, новое — верхняя", () => {
  const battered = armorValue("body", "heavy", 10, "battered", 1);
  const newest = armorValue("body", "heavy", 10, "new", 0);
  assert.ok(battered <= 58, `изношенное не выше середины: ${battered}`);
  assert.ok(newest >= 58, `новое не ниже середины: ${newest}`);
});

test("качество предмета выбирается при создании и хранится в armorQuality", () => {
  const items = [];
  for (let i = 0; i < 20; i++) items.push(content.createGearItem({ baseId: "plate", wear: "worn", rarity: "common", identified: true, level: 1 }));
  for (const item of items) {
    assert.equal(typeof item.armorQuality, "number");
    assert.ok(item.armorQuality >= 0 && item.armorQuality <= 1, `качество ${item.armorQuality}`);
  }
  assert.ok(new Set(items.map((i) => i.armorQuality)).size > 1, "качество меняется между предметами");
});

test("scaledGearStats берёт броню по слоту, уровню и состоянию", () => {
  const item = content.createGearItem({ baseId: "plate", wear: "new", rarity: "common", identified: true, level: 10 });
  item.armorQuality = 1;
  assert.equal(content.scaledGearStats(item).armor, 66, "тело тяжёлой брони на 10 уровне, новое, максимум");
  item.armorQuality = 0;
  item.wear = "battered";
  assert.equal(content.scaledGearStats(item).armor, 50, "тело тяжёлой брони на 10 уровне, изношенное, минимум");
});

test("старый предмет без качества получает его при миграции и не теряет слот", () => {
  const item = content.createGearItem({ baseId: "plate", wear: "worn", rarity: "common", identified: true, level: 3 });
  const legacy = { ...item };
  delete legacy.armorQuality;
  const migrated = content.migrateGearItem(legacy);
  assert.equal(typeof migrated.armorQuality, "number");
  assert.ok(migrated.armorQuality >= 0 && migrated.armorQuality <= 1);
  assert.equal(migrated.slot, "body");
  const again = content.migrateGearItem(legacy);
  assert.equal(again.armorQuality, migrated.armorQuality, "миграция детерминирована");
});

test("ковка «Новое» поднимает защиту того же предмета до верхней части диапазона", () => {
  const item = content.createGearItem({ baseId: "plate", wear: "battered", rarity: "common", identified: true, level: 5 });
  item.armorQuality = 1;
  const before = content.scaledGearStats(item).armor;
  const forged = { ...item, wear: "new", wearMult: 1.325 };
  const after = content.scaledGearStats(forged).armor;
  assert.ok(after > before, `после ковки ${after}, до ${before}`);
});
