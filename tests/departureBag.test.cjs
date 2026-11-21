/* Окно «Снаряжение в поход»: в поход идут слоты сумки и спец. предметы, остальное из рюкзака остаётся в лобби. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-departure-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", logLevel: "error" });
  return require(outfile);
}
const { GameController } = load("src/controllers/GameController.ts", "game-controller");

function setup(bag) {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const game = new GameController(storage);
  game.enterLobby("train");
  game.model.updatePlayer((p) => ({ ...p, bag, pouch: [null, null, null, null, null] }));
  return game;
}

test("в сумку положили зелье — оно уходит в поход, реагент из рюкзака остаётся в лобби", () => {
  const game = setup({ potion_s: 2, moss: 3 });
  assert.equal(game.setPouchSlot(0, "potion_s"), null);
  game.startRun(1);
  const { player, run } = game.model.getSnapshot();
  assert.equal(player.bag.potion_s, 2, "зелье из сумки идёт с героем");
  assert.equal(player.bag.moss, undefined, "реагент не идёт в поход");
  assert.equal(run.lobbyBag.moss, 3, "реагент остаётся в лобби");
});

test("без слотов сумки в поход не уходит ни одно расходуемое из рюкзака", () => {
  const game = setup({ potion_s: 2, moss: 1 });
  game.startRun(1);
  const { player, run } = game.model.getSnapshot();
  assert.equal(player.bag.potion_s, undefined, "зелье не в слоте — остаётся в лобби");
  assert.equal(run.lobbyBag.potion_s, 2);
});

test("ошибка слота возвращается текстом и не меняет сумку", () => {
  const game = setup({ moss: 1 });
  const err = game.setPouchSlot(0, "moss");
  assert.ok(typeof err === "string" && err.length > 0, "реагент в сумку не кладётся");
  assert.equal(game.model.getSnapshot().player.pouch[0], null);
});
