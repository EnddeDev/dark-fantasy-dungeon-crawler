/* Потери добычи вылазки: этажи 1–2 и 3+ (побег с карты по зачистке, смерть = побег + 20%, побег из боя 10%). */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-runloss-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}
const { GameController } = load("src/controllers/GameController.ts", "game-controller");
const { MemoryStorage } = load("src/model/SaveRepository.ts", "save-repository");
const runLoss = load("src/game/runLoss.ts", "run-loss");

function game(floor) {
  const g = new GameController(new MemoryStorage());
  g.enterLobby("train");
  if (floor > 1) g.model.update({ unlockedFloor: floor });
  g.startRun(floor);
  return g;
}

/** Убиваем первые k монстров этажа (без босса). */
function killMonsters(g, k) {
  g.model.updateRun((run) => ({ ...run, clearedMonsters: run.maze.monsters.slice(0, k) }));
}

test("побег с карты: этажи 1–2 без потерь, 3+ — 90% в начале и 0% после зачистки", () => {
  const g1 = game(1);
  assert.equal(runLoss.escapeLossRate(g1.model.getSnapshot().run), 0);
  const g3 = game(3);
  const run3 = g3.model.getSnapshot().run;
  assert.equal(runLoss.escapeLossRate(run3), 0.9);
  killMonsters(g3, Math.floor(run3.maze.monsters.length / 2));
  const half = g3.model.getSnapshot().run;
  const n = run3.maze.monsters.length;
  assert.ok(Math.abs(runLoss.escapeLossRate(half) - 0.9 * (1 - Math.floor(n / 2) / n)) < 1e-9, "линейно по убитым");
  killMonsters(g3, run3.maze.monsters.length);
  assert.equal(runLoss.escapeLossRate(g3.model.getSnapshot().run), 0);
});

test("прогресс зачистки: с каждым убитым монстром шанс побега падает", () => {
  const g = game(4);
  const run = g.model.getSnapshot().run;
  const n = run.maze.monsters.length;
  let prev = Infinity;
  for (let k = 0; k <= n; k++) {
    killMonsters(g, k);
    const rate = runLoss.escapeLossRate(g.model.getSnapshot().run);
    assert.ok(rate <= prev, `после ${k} убитых побег не растёт`);
    prev = rate;
  }
});

test("смерть: этажи 1–2 — 30%, этаж 3 в начале — 100% (побег 90% + 20%, не выше 100%), после зачистки — 20%", () => {
  assert.equal(runLoss.deathLossRate(game(1).model.getSnapshot().run), 0.3);
  assert.equal(runLoss.deathLossRate(game(2).model.getSnapshot().run), 0.3);
  const g3 = game(3);
  assert.equal(runLoss.deathLossRate(g3.model.getSnapshot().run), 1);
  killMonsters(g3, g3.model.getSnapshot().run.maze.monsters.length);
  assert.equal(runLoss.deathLossRate(g3.model.getSnapshot().run), 0.2);
});

test("побег из боя — 10% на любом этаже", () => {
  assert.equal(runLoss.FLEE_BATTLE_LOSS_RATE, 0.1);
});

test("смерть на этаже 1 теряет 30% найденного: золото, предметы и снаряжение округляются вниз", () => {
  const g = game(1);
  g.model.updateRun((run) => ({ ...run, gold: 100, loot: Array(10).fill("moss") }));
  const before = g.model.getSnapshot().player.gold;
  g.die("проверка");
  const after = g.model.getSnapshot();
  assert.equal(after.modal.kind, "death");
  assert.equal(after.modal.rate, 0.3);
  assert.equal(after.modal.lost, 30, "30% от 100 золота");
  assert.equal(after.modal.lostItems, 3, "3 из 10 найденных");
  assert.equal(after.player.gold, before + 70, "остальное золото возвращается в кошелёк");
});

test("смерть на этаже 3 в начале теряет всё найденное", () => {
  const g = game(3);
  g.model.updateRun((run) => ({ ...run, gold: 100, loot: Array(4).fill("moss") }));
  const before = g.model.getSnapshot().player.gold;
  g.die("проверка");
  const after = g.model.getSnapshot();
  assert.equal(after.modal.rate, 1);
  assert.equal(after.modal.lost, 100);
  assert.equal(after.modal.lostItems, 4);
  assert.equal(after.player.gold, before);
});
