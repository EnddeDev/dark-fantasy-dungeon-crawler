const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-pouch-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({
    entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  return require(outfile);
}

const pouch = load("src/game/pouch.ts", "pouch");
const battle = load("src/game/battle.ts", "battle");
const runExit = load("src/game/runExit.ts", "runExit");
const { GameController } = load("src/controllers/GameController.ts", "game-controller");
const { MemoryStorage } = load("src/model/SaveRepository.ts", "save-repository");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

function hero(extra = {}) {
  return { ...PlayerFactory.createInitial(), stats: { str: 4, agi: 3, int: 10 }, ...extra };
}

/* ---- сумка ---- */

test("сумка: три слота, только зелья из рюкзака, без дублей", () => {
  const p = hero({ bag: { potion_s: 2, potion_l: 1, field_torch: 1 }, pouch: undefined });
  assert.deepEqual(pouch.pouchOf(p), [null, null, null], "пустая сумка по умолчанию");
  const put = pouch.setPouchSlot(p, 0, "potion_s");
  assert.equal(put.ok, true);
  assert.deepEqual(put.pouch, ["potion_s", null, null]);
  const dup = pouch.setPouchSlot({ ...p, pouch: put.pouch }, 1, "potion_s");
  assert.equal(dup.ok, false, "то же зелье в два слота нельзя");
  const notPotion = pouch.setPouchSlot(p, 0, "field_torch");
  assert.equal(notPotion.ok, false, "факел — не зелье");
  const missing = pouch.setPouchSlot(hero({ bag: {} }), 0, "potion_s");
  assert.equal(missing.ok, false, "зелья нет в рюкзаке");
  const badSlot = pouch.setPouchSlot(p, 3, "potion_s");
  assert.equal(badSlot.ok, false);
});

test("сумка: очистка слота и сохранение поля при загрузке", () => {
  const p = hero({ bag: { potion_s: 1 }, pouch: ["potion_s", null, null] });
  const cleared = pouch.setPouchSlot(p, 0, null);
  assert.deepEqual(cleared.pouch, [null, null, null]);
  const restored = PlayerFactory.restore({ ...p, pouch: ["potion_s", null, null] });
  assert.deepEqual(pouch.pouchOf(restored), ["potion_s", null, null], "сумка переживает загрузку");
});

test("в бою первое зелье из сумки за ход не тратит ход, второе тратит", () => {
  const pl = hero({ bag: { potion_s: 2 }, pouch: ["potion_s", null, null] });
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.p.hp = b.p.maxHp - 40;
  const first = battle.playerAct(b, { type: "item", id: "potion_s" });
  assert.equal(first.idx, 0, "первое из сумки: ход героя остаётся");
  assert.equal(first.bag.potion_s, 1, "зелье потрачено");
  assert.ok(first.log.some((l) => l.text.includes("не тратит ход")));
  const second = battle.playerAct(first, { type: "item", id: "potion_s" });
  assert.equal(second.idx, 1, "второе за ход тратит ход");
  assert.equal(second.bag.potion_s, undefined, "зелья больше нет");
});

test("зелье не из сумки тратит ход", () => {
  const pl = hero({ bag: { potion_s: 1 }, pouch: [null, null, null] });
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.p.hp = b.p.maxHp - 40;
  const used = battle.playerAct(b, { type: "item", id: "potion_s" });
  assert.equal(used.idx, 1, "обычное зелье тратит ход");
});

test("сумка: в бою поменять слот нельзя, вне боя — можно", () => {
  const game = new GameController(new MemoryStorage());
  game.enterLobby("train");
  game.model.updatePlayer((p) => ({ ...p, bag: { ...p.bag, potion_s: 1 } }));
  assert.equal(game.setPouchSlot(0, "potion_s"), null, "в лобби можно");
  assert.deepEqual(game.model.getSnapshot().player.pouch, ["potion_s", null, null]);
  const fighting = PlayerFactory.createInitial();
  game.model.update({ battle: battle.newBattle(fighting, 1, false, "classic", 0, 0) });
  assert.ok(game.setPouchSlot(1, null), "в бою вернётся ошибка");
});

/* ---- выход из подземелья ---- */

test("выход: потери считаются по 20%, золото округляется, предметы вниз", () => {
  const run = { gold: 101, loot: ["a", "b", "c", "d", "e"], gearLoot: [] };
  assert.deepEqual(runExit.exitLossCounts(run, 0.2), { gold: 20, items: 1, gear: 0 });
  const plan = runExit.planExitLoss(run, 0.2, () => 0.5);
  assert.equal(plan.lostGold, 20);
  assert.equal(plan.droppedItems.length, 1);
});

test("выход: потерянное уходит из рюкзака и снаряжения героя", () => {
  const pl = hero({ bag: { potion_s: 2 } });
  const gear = pl.armory[0];
  const equipped = { ...pl, equip: { ...pl.equip, mainHand: gear.uid } };
  const plan = { lostGold: 0, droppedItems: ["potion_s"], droppedGear: [gear] };
  const after = runExit.applyExitLoss(equipped, plan);
  assert.equal(after.bag.potion_s, 1, "одно зелье ушло");
  assert.ok(!after.armory.some((g) => g.uid === gear.uid), "снаряжение ушло из арсенала");
  assert.equal(after.equip.mainHand, null, "слот освобождён");
});

test("выход без победы над стражем: сначала окно, потом 20% уходит; после стража — без потерь", () => {
  const game = new GameController(new MemoryStorage());
  game.enterLobby("train");
  game.startRun(1);
  game.model.updateRun((run) => ({ ...run, gold: 50 }));
  game.leaveRun();
  const asking = game.model.getSnapshot();
  assert.equal(asking.modal.kind, "leave");
  assert.equal(asking.modal.gold, 10);

  /* После победы над стражем яруса выход свободен и ничего не теряется. */
  const won = new GameController(new MemoryStorage());
  won.enterLobby("train");
  won.startRun(1);
  won.model.updateRun((run) => ({ ...run, gold: 50, maze: { ...run.maze, bossDefeated: true } }));
  won.leaveRun();
  const lobby = won.model.getSnapshot();
  assert.equal(lobby.screen, "lobby");
  assert.equal(lobby.modal.kind, "note", "без окна потерь");
  assert.equal(lobby.player.gold, PlayerFactory.createInitial().gold + 50, "всё золото на месте");
});
