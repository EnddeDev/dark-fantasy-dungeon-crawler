const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

/**
 * Цена снаряжения по очкам полезности: уровень, редкость и состав предмета
 * поднимают очки, цена покупки и продажи считается от них, базовой цены у баз нет.
 */
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-gear-points-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const content = load("content");
const { GEAR_BASES, createGearItem, gearBuyPrice, gearSellPrice, gearUtilityPoints, gearPointParts, GEAR_POINT_GOLD } = content;

/* Фиксированный бросок: предметы одинаковые, отличаются только уровень и редкость. */
const fixed = (baseId, level, rarity) =>
  createGearItem({ baseId, wear: "worn", rarity, level, identified: true, rng: () => 0.5 });

test("у баз оружия и брони больше нет базовой цены", () => {
  for (const base of Object.values(GEAR_BASES)) {
    assert.equal("price" in base, false, `${base.id}: поле price должно быть убрано`);
  }
});

test("очки полезности складываются из частей и совпадают с ценой", () => {
  const item = fixed("sword", 1, "epic");
  const parts = gearPointParts(item);
  const sum = Object.values(parts).reduce((a, b) => a + b, 0);
  assert.equal(gearUtilityPoints(item), sum);
  assert.equal(gearBuyPrice(item), Math.max(20, Math.round((sum * GEAR_POINT_GOLD) / 5) * 5));
  assert.equal(gearSellPrice(item), Math.max(10, Math.round((sum * GEAR_POINT_GOLD * 0.45) / 5) * 5));
});

test("цена растёт с уровнем предмета", () => {
  for (const baseId of ["sword", "plate", "amulet"]) {
    const prices = [1, 5, 10].map((lvl) => gearBuyPrice(fixed(baseId, lvl, "common")));
    assert.ok(prices[0] < prices[1] && prices[1] < prices[2], `${baseId}: ${prices.join(" < ")}`);
  }
});

test("цена растёт с редкостью: обычное < редкое < эпическое < легендарное", () => {
  for (const baseId of ["sword", "plate", "amulet"]) {
    const prices = ["common", "rare", "epic", "legendary"].map((r) => gearBuyPrice(fixed(baseId, 5, r)));
    for (let i = 1; i < prices.length; i++) {
      assert.ok(prices[i - 1] < prices[i], `${baseId}: ${prices.join(" < ")}`);
    }
  }
});

test("эпический и легендарный бонусы идут в очки отдельными частями", () => {
  const epicItem = fixed("sword", 1, "epic");
  const epic = gearPointParts(epicItem);
  /* У эпического приём может не выпасть — очки следуют за самим предметом. */
  assert.equal(epic.epicSkill, epicItem.epicSkill ? 20 : 0);
  assert.equal(epic.legendaryPassive, 0);
  const legend = gearPointParts(fixed("sword", 1, "legendary"));
  assert.equal(legend.epicSkill, 20);
  assert.equal(legend.passive, 15);
  assert.equal(legend.legendaryPassive, 25);
});

test("броня не получает очков оружия, оружие — очков брони", () => {
  const armor = gearPointParts(fixed("plate", 3, "common"));
  assert.equal(armor.damage, 0);
  assert.ok(armor.armor > 0);
  const weapon = gearPointParts(fixed("sword", 3, "common"));
  assert.equal(weapon.armor, 0);
  assert.ok(weapon.damage > 0);
  assert.ok(weapon.technique > 0);
});

test("минимальные цены: покупка не ниже 20, продажа не ниже 10", () => {
  for (const base of Object.values(GEAR_BASES)) {
    const item = fixed(base.id, 1, "common");
    assert.ok(gearBuyPrice(item) >= 20, `${base.id}: покупка ${gearBuyPrice(item)}`);
    assert.ok(gearSellPrice(item) >= 10, `${base.id}: продажа ${gearSellPrice(item)}`);
  }
});

test("продажа — примерно 45% от покупки", () => {
  const item = fixed("plate", 5, "rare");
  const ratio = gearSellPrice(item) / gearBuyPrice(item);
  assert.ok(Math.abs(ratio - 0.45) < 0.05, `доля ${ratio}`);
});

test("цены не зависят от того, исследован ли предмет", () => {
  const item = fixed("sword", 5, "legendary");
  const hidden = { ...item, identified: false };
  assert.equal(gearBuyPrice(hidden), gearBuyPrice(item));
});
