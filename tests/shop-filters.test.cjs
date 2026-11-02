const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(process.cwd(), "node_modules", ".sumrak-shop-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  return require(outfile);
}

const content = load("src/game/content.ts", "content");
const shop = load("src/game/shopFilters.ts", "shop-filters");

const priced = Object.values(content.ITEMS).filter((i) => (i.price ?? 0) > 0);
const supplies = priced.filter((i) => i.kind !== "reagent");
const reagents = priced.filter((i) => i.kind === "reagent");

test("слоты снаряжения: каждый слот отдельной кнопкой, кольца — вместе", () => {
  assert.deepEqual(shop.SLOT_FILTERS.head, ["head"]);
  assert.deepEqual(shop.SLOT_FILTERS.body, ["body"]);
  assert.deepEqual(shop.SLOT_FILTERS.feet, ["feet"]);
  assert.deepEqual(shop.SLOT_FILTERS.wrists, ["wrists"]);
  assert.deepEqual(shop.SLOT_FILTERS.rings, ["ring1", "ring2"]);
  assert.deepEqual(shop.SLOT_FILTERS.mainHand, ["mainHand"]);
  assert.deepEqual(shop.SLOT_FILTERS.offHand, ["offHand"]);
  assert.deepEqual(shop.SLOT_FILTERS.amulet, ["amulet"]);
  /* Выбор слота в арсенале сразу ставит нужную кнопку фильтра. */
  assert.equal(shop.slotFilterOf("head"), "head");
  assert.equal(shop.slotFilterOf("ring2"), "rings");
  assert.equal(shop.slotFilterOf("mainHand"), "mainHand");
});

test("припасы по уровню: фильтр оставляет только выбранный уровень, порядок по уровню", () => {
  const levels = shop.supplyLevelOptions(supplies);
  assert.ok(levels.length >= 3, "уровни припасов перечислены");
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));

  const all = shop.shopSupplyList(supplies, 0);
  assert.equal(all.length, supplies.length, "«Все уровни» не режет список");
  for (let i = 1; i < all.length; i++) {
    assert.ok((all[i - 1].level ?? 1) <= (all[i].level ?? 1), "по уровню возрастают");
  }

  for (const lvl of levels) {
    const only = shop.shopSupplyList(supplies, lvl);
    assert.ok(only.length > 0, `на уровне ${lvl} есть припасы`);
    assert.ok(only.every((i) => (i.level ?? 1) === lvl), `на уровне ${lvl} только он`);
  }
});

test("реагенты изначально сортируются по уровню, потом по цене", () => {
  const sorted = shop.shopReagentList(reagents, "all", "level");
  assert.equal(sorted.length, reagents.length);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    assert.ok((prev.level ?? 1) <= (cur.level ?? 1), `${prev.id} → ${cur.id}: уровень не убывает`);
    if ((prev.level ?? 1) === (cur.level ?? 1)) {
      assert.ok((prev.price ?? 0) <= (cur.price ?? 0), `${prev.id} → ${cur.id}: при равном уровне по цене`);
    }
  }
  assert.equal(sorted[0].level ?? 1, 1, "первым идёт самый младший");
});

test("фильтр реагентов по категории: растения, части тварей, минералы, ткани", () => {
  for (const cat of ["plant", "monster", "mineral", "cloth"]) {
    const list = shop.shopReagentList(reagents, cat, "level");
    assert.ok(list.length > 0, `категория ${cat} не пуста`);
    assert.ok(list.every((i) => shop.reagentCategoryOf(i) === cat), `в ${cat} только свои`);
  }
  const total = ["plant", "monster", "mineral", "cloth"]
    .reduce((acc, cat) => acc + shop.shopReagentList(reagents, cat, "level").length, 0);
  assert.equal(total, reagents.length, "категории покрывают все реагенты без пропусков");
});

test("камни — минералы, их видно в фильтре минералов и по уровню", () => {
  const stones = reagents.filter((i) => i.id.startsWith("stone_"));
  assert.equal(stones.length, 10);
  const minerals = shop.shopReagentList(reagents, "mineral", "level");
  assert.ok(stones.every((s) => minerals.includes(s)), "камни в минералах");
  const levelsOfStones = stones.map((s) => s.level).sort((a, b) => a - b);
  assert.deepEqual(levelsOfStones, [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test("сортировка реагентов по цене и по названию", () => {
  const byPrice = shop.shopReagentList(reagents, "all", "price");
  for (let i = 1; i < byPrice.length; i++) {
    assert.ok((byPrice[i - 1].price ?? 0) <= (byPrice[i].price ?? 0));
  }
  const byName = shop.shopReagentList(reagents, "all", "name");
  for (let i = 1; i < byName.length; i++) {
    assert.ok(byName[i - 1].name.localeCompare(byName[i].name) <= 0);
  }
});
