const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-accessory-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function loadGameModule(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}

const content = loadGameModule("content");
const effects = loadGameModule("gearEffects");

/** Детерминированный генератор mulberry32. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACCESSORIES = ["amulet", "ring_stone", "seal", "focus_rune"];
const ZERO_STATS = { str: 0, agi: 0, int: 0 };
const lowPlayer = (level) => ({ level, stats: { ...ZERO_STATS } });

test("аксессуар: требования характеристики нет, надевается по уровню", () => {
  for (const baseId of ACCESSORIES) {
    const item = content.createGearItem({ baseId, rarity: "common", identified: true, level: 3, rng: seeded(7) });
    assert.equal(content.gearKindFor(item), "accessory", `${baseId}: вид`);
    assert.equal(content.gearRequirement(item).stat, null, `${baseId}: характеристика скрыта`);
    assert.equal(content.gearStatReqLabel(item), "без требований", `${baseId}: подпись`);
    assert.equal(content.canWear(item, lowPlayer(3)), true, `${baseId}: надевается с нулевыми характеристиками`);
    assert.equal(content.canWear(item, lowPlayer(2)), false, `${baseId}: уровень предмета всё ещё важен`);
  }
});

test("броня и оружие сохраняют требование характеристики", () => {
  const knife = content.createGearItem({ baseId: "knife", rarity: "common", identified: true, level: 2, rng: seeded(3) });
  assert.notEqual(content.gearRequirement(knife).stat, null, "оружие с требованием");
  assert.equal(content.canWear(knife, lowPlayer(2)), false, "без характеристики оружие не надевается");
});

test("аксессуар: эффекты берутся из пула скрытой ХАР", () => {
  for (const baseId of ACCESSORIES) {
    for (let seed = 1; seed <= 25; seed++) {
      const item = content.createGearItem({ baseId, rarity: "epic", identified: true, level: 4, rng: seeded(seed) });
      const stat = content.gearAffinity(item);
      const pool = effects.ACCESSORY_EFFECT_POOLS[stat];
      for (const id of item.effects) {
        assert.ok(pool.includes(id), `${baseId} seed ${seed}: ${id} не из пула ${stat}`);
      }
    }
  }
});

test("неисследованный аксессуар: первый эффект — первый в списке предмета", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const item = content.createGearItem({ baseId: "amulet", rarity: "rare", identified: false, level: 5, rng: seeded(seed) });
    const expected = effects.effectCountForGear({ kind: "accessory", rarity: "rare", stat: content.gearAffinity(item) });
    assert.equal(item.effects.length, expected, "число свойств по редкости и скрытой ХАР");
    const peek = item.effects[0];
    assert.ok(peek, "первое свойство есть у неисследованного предмета");
    assert.equal(typeof effects.effectDetail(peek, item.level, item.effectRolls?.[peek]), "string");
  }
});
