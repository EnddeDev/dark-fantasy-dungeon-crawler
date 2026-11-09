const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-weapon-dmg-tests-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const content = load("content");
const scaling = load("gearScaling");

/* База урона: 5 + ХАР + вес. ХАР: ИНТ −1, ЛОВ +1, СИЛ +2. Вес: лёгкое 1, среднее 5, тяжёлое 9. */
test("база урона оружия = 5 + ХАР + вес", () => {
  assert.equal(scaling.weaponBaseDamage("agi", "light"), 7);
  assert.equal(scaling.weaponBaseDamage("int", "light"), 5);
  assert.equal(scaling.weaponBaseDamage("str", "medium"), 12);
  assert.equal(scaling.weaponBaseDamage("int", "medium"), 9);
  assert.equal(scaling.weaponBaseDamage("str", "heavy"), 16);
  assert.equal(scaling.weaponBaseDamage("agi", "heavy"), 15);
});

test("каждое оружие получает базу по своей ХАР и весу", () => {
  const expectBase = { knife: 7, rapier: 7, wand_ash: 5, sword: 12, staff: 9, abyss: 9, greatsword: 16, spear: 15, start_mace: 12, start_wand: 5 };
  for (const [id, base] of Object.entries(expectBase)) {
    assert.deepEqual(content.GEAR_BASES[id].dmg, [base, base], id);
  }
});

test("множитель уровня: 1 + 0.5 × уровень, R ∈ [1; 1.5]", () => {
  for (let i = 0; i < 200; i++) {
    const item = content.createGearItem({ baseId: "sword", level: 3, wear: "worn", rarity: "common", identified: true });
    assert.ok(item.dmgMult >= 1 && item.dmgMult <= 1.5);
    const v = 12 * item.wearMult * (1 + 0.5 * 3) * item.dmgMult;
    const dmg = content.scaledGearStats(item).dmg;
    assert.equal(dmg[0], Math.max(1, Math.round(v * 0.9)));
    assert.equal(dmg[1], Math.max(2, Math.round(v * 1.1)));
  }
});

test("разброс ±10% считается последним: от итога, после R", () => {
  const item = content.createGearItem({ baseId: "knife", level: 1, wear: "worn", rarity: "common", identified: true });
  item.wearMult = 1;
  item.dmgMult = 1;
  /* 7 × 1 × 1.5 = 10.5 → ±10%: 9.45 и 11.55 → 9 и 12 */
  assert.deepEqual(content.scaledGearStats(item).dmg, [9, 12]);
  item.dmgMult = 1.5;
  /* 7 × 1.5 × 1.5 = 15.75 → 14.175 и 17.325 → 14 и 17 */
  assert.deepEqual(content.scaledGearStats(item).dmg, [14, 17]);
});

test("двуручное оружие и копьё: ×2 к итогу", () => {
  const item = content.createGearItem({ baseId: "spear", level: 1, wear: "worn", rarity: "common", identified: true });
  item.wearMult = 1;
  item.dmgMult = 1;
  /* 15 × 1.5 × 2 = 45 → 40.5 и 49.5 → 41 и 50 */
  assert.deepEqual(content.scaledGearStats(item).dmg, [41, 50]);
});

test("предмет без R (старое сохранение) считается с множителем 1", () => {
  const item = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  item.wearMult = 1;
  delete item.dmgMult;
  /* 12 × 1.5 = 18 → 16.2 и 19.8 → 16 и 20 */
  assert.deepEqual(content.scaledGearStats(item).dmg, [16, 20]);
});

test("броня и аксессуары не получают R и урон", () => {
  const armor = content.createGearItem({ baseId: "shoes", level: 1, wear: "worn", rarity: "common", identified: true });
  assert.equal(armor.dmgMult, undefined);
  assert.equal(content.scaledGearStats(armor).dmg, undefined);
});
