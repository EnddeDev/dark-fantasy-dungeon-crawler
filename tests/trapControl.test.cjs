const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-traps-"));
function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/game/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
}
const traps = load("traps");
const maze = load("maze");

const stats = { str: 2, agi: 5, int: 4 };

test("урон ловушки — 8% максимального здоровья, не меньше 4", () => {
  assert.equal(traps.trapDamage(100), 8);
  assert.equal(traps.trapDamage(400), 32, "поздно тоже чувствуется");
  assert.equal(traps.trapDamage(10), 4, "минимум 4");
});

test("каменная кожа снижает урон на 25%, но не ниже 4", () => {
  assert.equal(traps.trapDamage(100, true), 6);
  assert.equal(traps.trapDamage(10, true), 4);
});

test("факел даёт обходу и обезвреживанию бросок с преимуществом", () => {
  const plain = traps.makeTrap({ kind: "normal", floor: 1, stats, maxHp: 100 });
  const lit = traps.makeTrap({ kind: "normal", floor: 1, stats, maxHp: 100, advantage: true });
  assert.equal(plain.advantage, false);
  assert.equal(lit.advantage, true);
  /* ЛОВ 5 → шанс обхода 0.47. Без факела бросок 0.6 провален; с факелом берётся лучший из 0.6 и 0.3. */
  assert.ok(Math.abs(plain.bypassChance - 0.47) < 1e-9);
  assert.ok(Math.abs(traps.trapChance(lit, "bypass") - (1 - 0.53 * 0.53)) < 1e-9, "показываемый шанс с преимуществом");
  const noAdv = traps.resolveTrap(plain, "bypass", stats, false, 1, rollsOf([0.6, 0.3]));
  assert.equal(noAdv.success, false);
  const withAdv = traps.resolveTrap(lit, "bypass", stats, false, 1, rollsOf([0.6, 0.3]));
  assert.equal(withAdv.success, true);
});

function rollsOf(values) {
  const copy = values.slice();
  return () => copy.shift();
}

test("без факела бросок один: второй не вызывается", () => {
  let calls = 0;
  const count = () => { calls += 1; return 0.99; };
  const plain = traps.makeTrap({ kind: "normal", floor: 1, stats, maxHp: 100 });
  traps.resolveTrap(plain, "bypass", stats, false, 1, count);
  assert.equal(calls, 1);
  const lit = traps.makeTrap({ kind: "normal", floor: 1, stats, maxHp: 100, advantage: true });
  calls = 0;
  traps.resolveTrap(lit, "bypass", stats, false, 1, count);
  assert.equal(calls, 2);
});

test("trapsWithin раскрывает ловушки в пределах двух шагов", () => {
  const m = maze.genMaze(8, 1);
  const from = m.start;
  const startIdx = maze.cellIdx(from.x, from.y, m.size);
  const farIdx = maze.cellIdx(m.size - 1, m.size - 1, m.size);
  assert.deepEqual(maze.trapsWithin({ ...m, traps: [] }, from, 2), [], "без ловушек ничего");
  const found = maze.trapsWithin({ ...m, traps: [startIdx, farIdx] }, from, 2);
  assert.ok(found.includes(startIdx), "ловушка в клетке героя видна");
  assert.ok(!found.includes(farIdx), "далёкая не видна");
});
