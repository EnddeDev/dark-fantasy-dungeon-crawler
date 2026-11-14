const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-new-effects-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
const outfile = path.join(temp, "newEffects.cjs");
buildSync({ entryPoints: ["src/game/newEffects.ts"], outfile, bundle: true, platform: "node", format: "cjs" });
const fx = require(outfile);

test("замедление: −1 ход, но не меньше одного", () => {
  assert.equal(fx.slowedTurns(3, 2), 2);
  assert.equal(fx.slowedTurns(1, 2), 1, "не падает ниже одного хода");
  assert.equal(fx.slowedTurns(3, 0), 3, "без эффекта ходы не меняются");
});

test("разрушение: Укрепление, маг. сопротивление и стойкость −25%", () => {
  assert.equal(fx.shatteredStat(20, 3), 15);
  assert.equal(fx.shatteredStat(14, 3), 10);
  assert.equal(fx.shatteredStat(20, 0), 20);
});

test("немота: блокирует, пока есть раунды", () => {
  assert.equal(fx.muteBlocks(2), true);
  assert.equal(fx.muteBlocks(0), false);
});

test("истощение: первое наложение снимает 2 случайных, продление снимает все", () => {
  const seq = [0.0, 0.0];
  const rng = () => seq.shift() ?? 0;
  const first = fx.depleteRemove(["fortify", "might", "wisdom"], false, rng);
  assert.equal(first.removed.length, 2);
  assert.equal(first.remaining.length, 1);
  const extended = fx.depleteRemove(["fortify", "might", "wisdom"], true);
  assert.deepEqual(extended.removed.sort(), ["fortify", "might", "wisdom"]);
  assert.deepEqual(extended.remaining, []);
});

test("истощение: при одном положительном эффекте снимает его и не падает", () => {
  const r = fx.depleteRemove(["might"], false, () => 0.5);
  assert.deepEqual(r.removed, ["might"]);
  assert.deepEqual(r.remaining, []);
});

test("побои: +20% урона", () => {
  assert.equal(fx.beatenDamage(50, 2), 60);
  assert.equal(fx.beatenDamage(50, 0), 50);
});

test("ослабление: множитель ×0,75", () => {
  assert.ok(Math.abs(fx.weakenedMult(1.2, 2) - 0.9) < 1e-9, "1,2 × 0,75 = 0,9");
  assert.equal(fx.weakenedMult(1.2, 0), 1.2);
});

test("иссушение: 6% макс. ОЗ, не меньше 1; лечит применившего на половину", () => {
  assert.deepEqual(fx.drainTick(200, 3), { damage: 12, heal: 6 });
  assert.deepEqual(fx.drainTick(5, 3), { damage: 1, heal: 1 }, "минимум 1 урона");
  assert.deepEqual(fx.drainTick(200, 0), { damage: 0, heal: 0 });
});
