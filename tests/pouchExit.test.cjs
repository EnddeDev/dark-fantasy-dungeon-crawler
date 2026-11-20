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
const { MemoryStorage, SaveRepository } = load("src/model/SaveRepository.ts", "save-repository");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");

function hero(extra = {}) {
  return { ...PlayerFactory.createInitial(), stats: { str: 4, agi: 3, int: 10 }, ...extra };
}

/* ---- сумка ---- */

test("сумка: пять слотов, зелья, свитки и расходники из рюкзака, без дублей", () => {
  const p = hero({ bag: { potion_s: 2, potion_l: 1, field_torch: 1, scroll_fire: 1, throwing_knife: 1 }, pouch: undefined });
  assert.equal(pouch.POUCH_SLOTS, 5, "пять слотов");
  assert.deepEqual(pouch.pouchOf(p), [null, null, null, null, null], "пустая сумка по умолчанию");
  const put = pouch.setPouchSlot(p, 0, "potion_s");
  assert.equal(put.ok, true);
  assert.deepEqual(put.pouch, ["potion_s", null, null, null, null]);
  const dup = pouch.setPouchSlot({ ...p, pouch: put.pouch }, 1, "potion_s");
  assert.equal(dup.ok, false, "то же зелье в два слота нельзя");
  const scroll = pouch.setPouchSlot(p, 1, "scroll_fire");
  assert.equal(scroll.ok, true, "свиток в сумку");
  const throwable = pouch.setPouchSlot(p, 2, "throwing_knife");
  assert.equal(throwable.ok, true, "расходник в сумку");
  const torch = pouch.setPouchSlot(p, 3, "field_torch");
  assert.equal(torch.ok, true, "факел в сумку");
  const notPouchable = pouch.setPouchSlot(p, 0, "lockpicks");
  assert.equal(notPouchable.ok, false, "отмычки в сумку нельзя");
  const missing = pouch.setPouchSlot(hero({ bag: {} }), 0, "potion_s");
  assert.equal(missing.ok, false, "зелья нет в рюкзаке");
  const badSlot = pouch.setPouchSlot(p, 5, "potion_s");
  assert.equal(badSlot.ok, false, "слота 6 нет");
});

test("сумка: очистка слота и сохранение поля при загрузке", () => {
  const p = hero({ bag: { potion_s: 1 }, pouch: ["potion_s", null, null, null, null] });
  const cleared = pouch.setPouchSlot(p, 0, null);
  assert.deepEqual(cleared.pouch, [null, null, null, null, null]);
  const restored = PlayerFactory.restore({ ...p, pouch: ["potion_s", null, null, null, null] });
  assert.deepEqual(pouch.pouchOf(restored), ["potion_s", null, null, null, null], "сумка переживает загрузку");
  const old = PlayerFactory.restore({ ...p, pouch: ["potion_s", null, null] });
  assert.equal(pouch.pouchOf(old).length, 5, "старое сохранение с тремя слотами получает пять");
});

test("в бою зелья из сумки не тратят выносливость, из рюкзака — 5", () => {
  const pl = hero({ bag: { potion_s: 2 }, pouch: ["potion_s", null, null] });
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.p.hp = b.p.maxHp - 40;
  const first = battle.playerAct(b, { type: "item", id: "potion_s" });
  assert.equal(first.idx, 0, "из сумки: ход героя остаётся");
  assert.equal(first.bag.potion_s, 1, "зелье потрачено");
  assert.equal(first.p.stamina, b.p.stamina, "из сумки бесплатно");
  assert.ok(first.log.some((l) => l.text.includes("не тратит выносливость")));
  const second = battle.playerAct(first, { type: "item", id: "potion_s" });
  assert.equal(second.p.stamina, first.p.stamina, "и второе из сумки бесплатно");
  assert.equal(second.bag.potion_s, undefined, "зелья больше нет");
});

test("зелье не из сумки в бою не применяется: ни урона, ни выносливости", () => {
  const pl = hero({ bag: { potion_s: 1 }, pouch: [null, null, null, null, null] });
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.p.hp = b.p.maxHp - 40;
  const after = battle.playerAct(b, { type: "item", id: "potion_s" });
  assert.equal(after.bag.potion_s, 1, "зелье осталось в рюкзаке");
  assert.equal(after.p.stamina, b.p.stamina, "выносливость не списана");
  assert.equal(after.p.hp, b.p.hp, "лечения нет");
});

test("сумка: в бою поменять слот нельзя, вне боя — можно", () => {
  const game = new GameController(new MemoryStorage());
  game.enterLobby("train");
  game.model.updatePlayer((p) => ({ ...p, bag: { ...p.bag, potion_s: 1 } }));
  assert.equal(game.setPouchSlot(0, "potion_s"), null, "в лобби можно");
  assert.deepEqual(game.model.getSnapshot().player.pouch, ["potion_s", null, null, null, null]);
  const fighting = PlayerFactory.createInitial();
  game.model.update({ battle: battle.newBattle(fighting, 1, false, "classic", 0, 0) });
  assert.ok(game.setPouchSlot(1, null), "в бою вернётся ошибка");
});

test("сумка: фильтр выборки — зелья, расходники, свитки и спец. (бурдюк, факел); прочее мимо", () => {
  const p = hero({ bag: { potion_s: 1, elixir_fire: 2, throwing_knife: 1, scroll_fire: 1, field_torch: 1, water_skin: 1, powder: 3, lockpicks: 1 } });
  assert.equal(pouch.pouchCategoryOf("potion_s"), "potion");
  assert.equal(pouch.pouchCategoryOf("throwing_knife"), "throwable");
  assert.equal(pouch.pouchCategoryOf("scroll_fire"), "scroll");
  assert.equal(pouch.pouchCategoryOf("field_torch"), "special");
  assert.equal(pouch.pouchCategoryOf("water_skin"), "special");
  assert.equal(pouch.pouchCategoryOf("lockpicks"), null, "отмычки не категория сумки");
  assert.equal(pouch.pouchCategoryOf("powder"), null, "реагент не категория сумки");
  const ids = (cat) => pouch.pouchCandidates(p, cat).map(([id]) => id).sort();
  assert.deepEqual(ids("potion"), ["elixir_fire", "potion_s"]);
  assert.deepEqual(ids("throwable"), ["throwing_knife"]);
  assert.deepEqual(ids("scroll"), ["scroll_fire"]);
  assert.deepEqual(ids("special"), ["field_torch", "water_skin"]);
  assert.deepEqual(pouch.pouchCandidates(hero({ bag: {} }), "scroll"), [], "пустой рюкзак — пустой список");
});

test("в бою свиток и расходник из слота сумки не тратят выносливость; из рюкзака не применяются", () => {
  const pl = hero({ bag: { scroll_fire: 1, throwing_knife: 1 }, pouch: ["scroll_fire", "throwing_knife", null, null, null] });
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  const scroll = battle.playerAct(b, { type: "item", id: "scroll_fire" });
  assert.equal(scroll.p.stamina, b.p.stamina, "свиток из сумки бесплатен");
  assert.equal(scroll.bag.scroll_fire, undefined, "свиток потрачен");
  const knife = battle.playerAct(scroll, { type: "item", id: "throwing_knife" });
  assert.equal(knife.p.stamina, scroll.p.stamina, "расходник из сумки бесплатен");
  const loose = hero({ bag: { scroll_fire: 1 }, pouch: [null, null, null, null, null] });
  const lb = battle.newBattle(loose, 1, false, "classic", 0, 0);
  lb.queue = ["p", "e"];
  lb.idx = 0;
  const notInBattle = battle.playerAct(lb, { type: "item", id: "scroll_fire" });
  assert.equal(notInBattle.bag.scroll_fire, 1, "свиток вне сумки в бою не потрачен");
  assert.equal(notInBattle.p.stamina, lb.p.stamina, "и выносливость не списана");
});

test("в бою факел из сумки не применяется и не держит ход; бурдюк из сумки держит", () => {
  const withTorch = hero({ stats: { str: 4, agi: 3, int: 10 }, bag: { field_torch: 1 }, pouch: ["field_torch", null, null, null, null] });
  const b = battle.newBattle(withTorch, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.p.stamina = 5;
  const after = battle.playerAct(b, { type: "item", id: "field_torch" });
  assert.equal(after.bag.field_torch, 1, "факел в бою не расходуется");
  assert.equal(after.p.stamina, b.p.stamina, "и выносливость не списана");

  const withSkin = hero({ bag: { water_skin: 1 }, pouch: ["water_skin", null, null, null, null] });
  const c = battle.newBattle(withSkin, 1, false, "classic", 0, 0);
  c.queue = ["p", "e"];
  c.idx = 0;
  c.p.stamina = 5;
  const kept = battle.playerAct(c, { type: "item", id: "potion_s" });
  assert.equal(kept.idx, 0, "бурдюк из сумки продолжает ход героя");
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

test("выход: страж, побеждённый раньше в этом походе, снимает потери и на следующем ярусе", () => {
  const game = new GameController(new MemoryStorage());
  game.enterLobby("train");
  game.startRun(1);
  /* Страж 1 яруса побеждён, герой спустился на 2 ярус, страж 2 яруса ещё жив. */
  game.model.updateRun((run) => ({ ...run, gold: 50, floor: 2, bossSlain: true, maze: { ...run.maze, bossDefeated: false } }));
  game.leaveRun();
  const snap = game.model.getSnapshot();
  assert.equal(snap.modal.kind, "note", "окна потерь нет");
  assert.equal(snap.player.gold, PlayerFactory.createInitial().gold + 50, "всё золото на месте");
});

test("лестница: выход без потерь открывает следующий ярус и возвращает в лобби", () => {
  const storage = new MemoryStorage();
  const game = new GameController(storage);
  game.enterLobby("train");
  game.startRun(1);
  game.model.updateRun((run) => ({ ...run, gold: 50, maze: { ...run.maze, bossDefeated: true } }));
  game.model.update({ unlockedFloor: 1 });
  game.leaveFromStairs();
  const snap = game.model.getSnapshot();
  assert.equal(snap.screen, "lobby");
  assert.equal(snap.run, null);
  assert.equal(snap.unlockedFloor, 2, "ярус 2 открыт");
  assert.equal(new SaveRepository(storage).readUnlockedFloor(), 2, "открытие сохранено");
  assert.equal(snap.player.gold, PlayerFactory.createInitial().gold + 50, "потерь нет");
  assert.match(snap.modal.body, /Открыт ярус 2/);
});

test("лестница: без повержённого стража выход не делается", () => {
  const game = new GameController(new MemoryStorage());
  game.enterLobby("train");
  game.startRun(1);
  game.leaveFromStairs();
  assert.notEqual(game.model.getSnapshot().screen, "lobby", "экран не сменился");
  assert.ok(game.model.getSnapshot().run, "поход продолжается");
});

/* ---- бой: только сумка; созданное в бою; рюкзак после боя ---- */

test("после боя рюкзак героя цел: из него в бою тратится только предмет из сумки", () => {
  const pl = hero({ bag: { potion_s: 2, elixir_fire: 1 }, pouch: ["potion_s", null, null, null, null] });
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.p.hp = b.p.maxHp - 40;
  const after = battle.playerAct(b, { type: "item", id: "potion_s" });
  assert.deepEqual(battle.persistentBag(after), { potion_s: 1, elixir_fire: 1 }, "в рюкзаке осталось всё, кроме одного зелья из сумки");
});

test("созданное в бою доступно в бою, тратит выносливость и после боя не переходит герою", () => {
  const pl = hero({ bag: {}, pouch: [null, null, null, null, null] });
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.bag.scroll_fire = 1;
  b.conjured.scroll_fire = 1;
  assert.equal(battle.battleItemAvailable(b, "scroll_fire"), true, "созданное доступно");
  const after = battle.playerAct(b, { type: "item", id: "scroll_fire" });
  assert.equal(after.p.stamina, b.p.stamina - 5, "созданное тратит 5 выносливости");
  assert.equal(after.bag.scroll_fire, undefined, "созданное израсходовано");
  assert.equal(battle.persistentBag(after).scroll_fire, undefined, "после боя созданное герою не достаётся");
});

test("копия из сумки бесплатна, пока есть личная; созданная поверх неё личную не отнимает", () => {
  const pl = hero({ bag: { potion_s: 1 }, pouch: ["potion_s", null, null, null, null] });
  const b = battle.newBattle(pl, 1, false, "classic", 0, 0);
  b.queue = ["p", "e"];
  b.idx = 0;
  b.p.hp = b.p.maxHp - 40;
  b.bag.potion_s = 2;
  b.conjured.potion_s = 1;
  assert.equal(battle.isFreePouchUse(b, "potion_s"), true, "личная копия в сумке — бесплатно");
  const used = battle.playerAct(b, { type: "item", id: "potion_s" });
  assert.equal(used.p.stamina, b.p.stamina, "бесплатно");
  assert.deepEqual(battle.persistentBag(used), { potion_s: 1 }, "личная копия осталась у героя");
});
