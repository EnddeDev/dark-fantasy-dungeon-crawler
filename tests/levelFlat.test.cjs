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
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}
const content = loadGameModule("content");

const scaling = loadGameModule("gearScaling");

/** Предмет с фиксированными роллами: ролл 0.5 даёт середину диапазона. */
const make = (baseId, level) => content.createGearItem({ baseId, level, wear: "worn", rarity: "common", identified: true, rng: () => 0.5 });

test("плоский бонус ОЗ за каждый уровень, начиная с первого: тяжёлая +3, средняя +1, лёгкая +5, аксессуар +3", () => {
  const cases = [
    ["plate", 3],
    ["mail", 1],
    ["start_hood", 5],
    ["ring_stone", 3],
  ];
  for (const [baseId, perLevel] of cases) {
    const item = make(baseId, 1);
    const cls = content.gearClassFor(item);
    for (const level of [1, 2, 5, 10]) {
      const leveled = { ...item, level };
      /* Точная формула: ceil(ceil(ролл × м) × (1 + 0,5 × L)) + бонус СИЛ + perLevel × (L − 1). */
      const scaled = scaling.scaleGearStatByLevel(Math.ceil(item.statRolls.hp * item.wearMult), level);
      const strHp = content.gearAffinity(item) === "str" ? Math.floor(10 * scaling.statLevelRatio(level) + 1e-9) : 0;
      const expected = scaled + strHp + (baseId === "ring_stone" ? 3 : perLevel) * level;
      assert.equal(content.scaledGearStats(leveled).hp, expected, `${baseId} (${cls}) L${level}`);
    }
  }
});

test("плоский бонус не даёт ОЗ предмету без здоровья (аксессуар ЛОВ, оружие)", () => {
  const agiRing = make("ring_band", 1);
  assert.equal(content.scaledGearStats({ ...agiRing, level: 10 }).hp, 0, "аксессуар ЛОВ без ОЗ остаётся без ОЗ");
  const sword = make("sword", 1);
  assert.equal(content.scaledGearStats({ ...sword, level: 10 }).hp, 0, "оружие без ОЗ");
});

test("плоский бонус брони: тяжёлая +2, средняя +1, аксессуар +1; лёгкая без брони", () => {
  const heavy1 = content.scaledGearStats(make("plate", 1)).armor;
  const heavy5 = content.scaledGearStats(make("plate", 5)).armor;
  const heavyScaled5 = content.scaledGearStats({ ...make("plate", 5), level: 5 }).armor;
  assert.equal(heavyScaled5, heavy5);
  assert.ok(heavy5 - heavy1 >= 2 * 4, "тяжёлая броня растёт минимум на 2 за каждый уровень");

  const mediumItem = content.createGearItem({ baseId: "start_leather", level: 1, wear: "worn", rarity: "common", identified: true, rng: () => 0.5 });
  const armorMedium = content.scaledGearStats({ ...mediumItem, level: 1 }).armor;
  const armorMedium5 = content.scaledGearStats({ ...mediumItem, level: 5 }).armor;
  assert.ok(armorMedium > 0, "средняя броня даёт броню");
  assert.ok(armorMedium5 - armorMedium >= 4, "средняя броня +1 за каждый уровень");

  const str = make("ring_stone", 1);
  const str1 = content.scaledGearStats(str).armor;
  const str5 = content.scaledGearStats({ ...str, level: 5 }).armor;
  assert.ok(str5 - str1 >= 4, "аксессуар с бронёй +1 за уровень");

  const light = content.scaledGearStats({ ...make("start_hood", 1), level: 10 }).armor;
  assert.equal(light, 0, "лёгкая броня без брони не получает плоский бонус");
});

test("плоский бонус барьера: средняя +1, лёгкая +3; только у брони на ИНТ", () => {
  const robe1 = content.scaledGearStats({ ...make("start_robe", 1), level: 1 }).barrier;
  const robe5 = content.scaledGearStats({ ...make("start_robe", 5), level: 5 }).barrier;
  assert.ok(robe5 - robe1 >= 3 * 4, `лёгкая броня на ИНТ: +3 за каждый уровень (${robe1} → ${robe5})`);

  const hood = content.scaledGearStats({ ...make("start_hood", 10), level: 10 }).barrier;
  assert.equal(hood, 0, "броня на ЛОВ барьера не имеет");
  const ring = content.scaledGearStats({ ...make("amulet", 10), level: 10 }).barrier;
  assert.equal(ring, 0, "аксессуары барьера не имеют");
});

test("тяжёлая броня: множитель ролла 1,5 вместо 2", () => {
  const rolls = content.rollItemStatRolls(content.GEAR_BASES.plate, "heavy", () => 0.99);
  /* roll(4,3) при rng 0.99 → 7; ×1,5 → 10,5 → round 11 при k = 1 (корпус). */
  assert.equal(rolls.armor, Math.round(7 * 1.5));
});
