const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-gearhp-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
const outfile = path.join(temp, "progression.cjs");
buildSync({ entryPoints: ["src/game/progression.ts"], outfile, bundle: true, platform: "node", format: "cjs" });
const { hpAfterGearChange } = require(outfile);

test("смена снаряжения не лечит раненого героя", () => {
  // 6 из 10 ОЗ, надели бонус +5 к максимуму: ОЗ остаются 6.
  assert.equal(hpAfterGearChange(6, 10, 15), 6);
  // Сняли бонус: ОЗ не растут и подрезаются до нового максимума.
  assert.equal(hpAfterGearChange(12, 15, 10), 10);
  assert.equal(hpAfterGearChange(6, 15, 10), 6);
});

test("полностью здоровый герой остаётся полным на новом максимуме", () => {
  assert.equal(hpAfterGearChange(10, 10, 15), 15);
  assert.equal(hpAfterGearChange(15, 15, 10), 10);
});

test("повторная смена предмета с бонусом ОЗ не накапливает здоровье", () => {
  let hp = 4;
  let max = 10;
  for (let i = 0; i < 20; i++) {
    const next = max === 10 ? 15 : 10; // надели / сняли бонус
    hp = hpAfterGearChange(hp, max, next);
    max = next;
    assert.ok(hp <= 4, `ОЗ выросли до ${hp} на шаге ${i}`);
  }
  assert.equal(hp, 4);
});
