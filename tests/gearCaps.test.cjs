const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-caps-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const content = loadGameModule("content");
const scaling = loadGameModule("gearScaling");
const effects = loadGameModule("gearEffects");

const WEARS = ["battered", "worn", "new"];
const ROUNDS = 300;

/** Все предметы базы, кроме оружия, с заданным классом и характеристикой. */
function armorBases(gearClass, stat) {
  return Object.values(content.GEAR_BASES).filter((b) => {
    if (content.gearKindOfBase(b) === "weapon") return false;
    const cls = b.gearClass ?? "medium";
    const st = b.stat ?? (cls === "heavy" ? "str" : cls === "light" ? "int" : "agi");
    return cls === gearClass && st === stat;
  });
}

function maxEvade(bases, wear, level) {
  let max = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const base = bases[i % bases.length];
    const item = content.createGearItem({ baseId: base.id, wear, level, identified: true });
    max = Math.max(max, content.scaledGearStats(item).evadePp);
  }
  return max;
}

test("средняя броня с ЛОВ: уклонение не выше 5% на 1 уровне при любом состоянии", () => {
  const bases = armorBases("medium", "agi");
  assert.ok(bases.length > 0, "нет баз средней брони с ЛОВ");
  for (const wear of WEARS) assert.ok(maxEvade(bases, wear, 1) <= 5, `wear ${wear}`);
});

test("лёгкая броня (ИНТ и прочая): уклонение не выше 7% на 1 уровне", () => {
  const light = [...armorBases("light", "int"), ...armorBases("light", "str")];
  assert.ok(light.length > 0, "нет баз лёгкой брони");
  for (const wear of WEARS) assert.ok(maxEvade(light, wear, 1) <= 7, `wear ${wear}`);
});

test("потолок уклонения растёт с уровнем тем же коэффициентом, что и статы", () => {
  const medium = armorBases("medium", "agi");
  const light = armorBases("light", "int");
  // Средняя ЛОВ: 5 × (1 + 0.5·L) / 1.5 — на 3 уровне 8, на 10 — 20.
  assert.ok(maxEvade(medium, "new", 3) <= 8);
  assert.ok(maxEvade(medium, "new", 10) <= 20);
  assert.ok(maxEvade(medium, "new", 10) > 5, "на 10 уровне потолок должен вырасти");
  // Лёгкая: 7 × (1 + 0.5·L) / 1.5 — на 10 уровне 28.
  assert.ok(maxEvade(light, "new", 10) <= 28);
});

test("ОЗ предмета на СИЛ: +10 на 1 уровне, дальше растёт с уровнем", () => {
  const bases = Object.values(content.GEAR_BASES).filter(
    (b) => content.gearKindOfBase(b) !== "weapon" && content.gearAffinity({ baseId: b.id, gearClass: b.gearClass ?? "medium" }) === "str",
  );
  assert.ok(bases.length > 0, "нет баз на СИЛ");
  for (const level of [1, 4, 10]) {
    const base = bases[0];
    const item = content.createGearItem({ baseId: base.id, wear: "worn", level, identified: true });
    const s = content.scaledGearStats(item);
    const rolled = scaling.scaleGearStatByLevel(Math.ceil(item.statRolls.hp * item.wearMult), level);
    const bonus = Math.floor(10 * scaling.statLevelRatio(level) + 1e-9);
    const flatPerLevel = { heavy: 3, medium: 1, light: 5 }[content.gearClassFor(item)];
    assert.equal(s.hp, rolled + bonus + flatPerLevel * level, `уровень ${level}`);
  }
  assert.equal(
    Math.floor(10 * scaling.statLevelRatio(1) + 1e-9),
    10,
    "на 1 уровне бонус равен 10",
  );
});

test("предмет на ИНТ получает одно дополнительное свойство (не оружие)", () => {
  const plain = effects.effectCountForGear({ kind: "armor", rarity: "common" });
  const intArmor = effects.effectCountForGear({ kind: "armor", rarity: "common", stat: "int" });
  assert.equal(intArmor, plain + 1);
  const intAcc = effects.effectCountForGear({ kind: "accessory", rarity: "rare", stat: "int" });
  assert.equal(intAcc, 1 + 1 + 1);
  const intWeapon = effects.effectCountForGear({ kind: "weapon", rarity: "common", stat: "int" });
  assert.equal(intWeapon, effects.effectCountForGear({ kind: "weapon", rarity: "common" }));
  const bases = armorBases("light", "int");
  for (let i = 0; i < 50; i++) {
    const item = content.createGearItem({ baseId: bases[i % bases.length].id, rarity: "common", level: 1 });
    /* Броня: 0 базовых + 1 за ИНТ; аксессуар: 1 базовое + 1 за ИНТ. */
    const expected = content.gearKindOfBase(bases[i % bases.length]) === "accessory" ? 2 : 1;
    assert.equal(item.effects.length, expected, `свойств у ${item.baseId}`);
    for (const id of item.effects) assert.ok(effects.effectPoolForGear({ kind: "armor", gearClass: "light", stat: "int" }).includes(id));
  }
});
