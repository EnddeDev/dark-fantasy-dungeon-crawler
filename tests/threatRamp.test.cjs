const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-threat-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const content = load("src/game/content.ts", "content");
const { threatChances, threatForRoll, rollThreat } = content;

test("угрозы: до 10-го этажа базовые 80 / 15 / 5", () => {
  for (const floor of [1, 5, 10]) {
    assert.deepEqual(threatChances(floor), { normal: 80, horror: 15, catastrophe: 5 }, `этаж ${floor}`);
  }
});

test("угрозы: 11-й этаж — обычные 76, ужас 18, катастрофа 6", () => {
  assert.deepEqual(threatChances(11), { normal: 76, horror: 18, catastrophe: 6 });
});

test("угрозы: контрольные этажи по формуле", () => {
  assert.deepEqual(threatChances(15), { normal: 60, horror: 30, catastrophe: 10 });
  assert.deepEqual(threatChances(20), { normal: 40, horror: 45, catastrophe: 15 });
  assert.deepEqual(threatChances(30), { normal: 0, horror: 75, catastrophe: 25 }, "обычные исчезли");
  assert.deepEqual(threatChances(50), { normal: 0, horror: 55, catastrophe: 45 });
  assert.deepEqual(threatChances(105), { normal: 0, horror: 0, catastrophe: 100 }, "катастрофа 100%");
  assert.deepEqual(threatChances(200), { normal: 0, horror: 0, catastrophe: 100 }, "дальше не выходит за 100");
});

test("угрозы: на каждом этаже сумма 100, значения целые и неотрицательные", () => {
  for (let floor = 1; floor <= 300; floor++) {
    const c = threatChances(floor);
    assert.equal(c.normal + c.horror + c.catastrophe, 100, `этаж ${floor}`);
    for (const v of [c.normal, c.horror, c.catastrophe]) {
      assert.ok(Number.isInteger(v) && v >= 0, `этаж ${floor}: ${v}`);
    }
  }
});

test("угрозы: выбор по броску учитывает этаж", () => {
  assert.equal(threatForRoll(0.5, 1), "normal");
  assert.equal(threatForRoll(0.5, 30), "horror", "обычных уже нет");
  assert.equal(threatForRoll(0.7, 30), "horror");
  assert.equal(threatForRoll(0.76, 30), "catastrophe");
  assert.equal(threatForRoll(0.01, 105), "catastrophe");
  assert.equal(rollThreat(() => 0.5, 30), "horror");
});

test("угрозы: до 10-го этажа прежние пороги 0.8 и 0.95", () => {
  assert.equal(threatForRoll(0.799), "normal");
  assert.equal(threatForRoll(0.8), "horror");
  assert.equal(threatForRoll(0.949), "horror");
  assert.equal(threatForRoll(0.95), "catastrophe");
});
