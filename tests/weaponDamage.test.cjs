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

/* База урона: 9 + ХАР + вес. ХАР: ИНТ −1, ЛОВ +1, СИЛ +2. Вес: лёгкое 1, среднее 4, тяжёлое 9. */
test("база урона оружия = 9 + ХАР + вес", () => {
  assert.equal(scaling.weaponBaseDamage("agi", "light"), 11);
  assert.equal(scaling.weaponBaseDamage("int", "light"), 9);
  assert.equal(scaling.weaponBaseDamage("str", "medium"), 15);
  assert.equal(scaling.weaponBaseDamage("int", "medium"), 12);
  assert.equal(scaling.weaponBaseDamage("str", "heavy"), 20);
  assert.equal(scaling.weaponBaseDamage("agi", "heavy"), 19);
});

test("каждое оружие получает базу по своей ХАР и весу", () => {
  const expectBase = { knife: 11, rapier: 11, wand_ash: 9, sword: 15, staff: 12, abyss: 12, greatsword: 20, spear: 19, start_mace: 15, start_wand: 9 };
  for (const [id, base] of Object.entries(expectBase)) {
    assert.deepEqual(content.GEAR_BASES[id].dmg, [base, base], id);
  }
});

test("множитель уровня: 1 + 0.5 × уровень, R ∈ [1; 1.5]", () => {
  for (let i = 0; i < 200; i++) {
    const item = content.createGearItem({ baseId: "sword", level: 3, wear: "worn", rarity: "common", identified: true });
    assert.ok(item.dmgMult >= 1 && item.dmgMult <= 1.5);
    const v = 15 * item.wearMult * (1 + 0.5 * 3) * item.dmgMult;
    const dmg = content.scaledGearStats(item).dmg;
    assert.equal(dmg[0], Math.max(1, Math.round(v * 0.9)));
    assert.equal(dmg[1], Math.max(2, Math.round(v * 1.1)));
  }
});

test("разброс ±10% считается последним: от итога, после R", () => {
  const item = content.createGearItem({ baseId: "knife", level: 1, wear: "worn", rarity: "common", identified: true });
  item.wearMult = 1;
  item.dmgMult = 1;
  /* 11 × 1 × 1.5 = 16.5 → ±10%: 14.85 и 18.15 → 15 и 18 */
  assert.deepEqual(content.scaledGearStats(item).dmg, [15, 18]);
  item.dmgMult = 1.5;
  /* 11 × 1.5 × 1.5 = 24.75 → 22.275 и 27.225 → 22 и 27 */
  assert.deepEqual(content.scaledGearStats(item).dmg, [22, 27]);
});

test("двуручное оружие и копьё: ×2 к итогу", () => {
  const item = content.createGearItem({ baseId: "spear", level: 1, wear: "worn", rarity: "common", identified: true });
  item.wearMult = 1;
  item.dmgMult = 1;
  /* 19 × 1.5 × 2 = 57 → 51.3 и 62.7 → 51 и 63 */
  assert.deepEqual(content.scaledGearStats(item).dmg, [51, 63]);
});

test("предмет без R (старое сохранение) считается с множителем 1", () => {
  const item = content.createGearItem({ baseId: "sword", level: 1, wear: "worn", rarity: "common", identified: true });
  item.wearMult = 1;
  delete item.dmgMult;
  /* 15 × 1.5 = 22.5 → 20.25 и 24.75 → 20 и 25 */
  assert.deepEqual(content.scaledGearStats(item).dmg, [20, 25]);
});

test("броня и аксессуары не получают R и урон", () => {
  const armor = content.createGearItem({ baseId: "shoes", level: 1, wear: "worn", rarity: "common", identified: true });
  assert.equal(armor.dmgMult, undefined);
  assert.equal(content.scaledGearStats(armor).dmg, undefined);
});
