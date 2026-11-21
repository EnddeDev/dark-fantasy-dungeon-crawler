/* Рюкзак перед походом: сумка и спец. предметы идут сами, выбранное берётся из окна,
   остальное остаётся в лобби; при гибели теряется всё взятое в вылазку, при выходе живым — возвращается. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-run-stash-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
function load(entry, name, externals = []) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", external: externals });
  return require(outfile);
}
const stash = load("src/game/runStash.ts", "run-stash");
const { GameController } = load("src/controllers/GameController.ts", "game-controller", ["react", "react-dom", "react/jsx-runtime"]);
const { MemoryStorage } = load("src/model/SaveRepository.ts", "save-repository");

/* Поход с известным рюкзаком: в сумке два зелья, спец. предметы и два свитка. */
function setup(extra = {}) {
  const game = new GameController(new MemoryStorage());
  const base = game.model.getSnapshot().player;
  game.model.setPlayer({
    ...base,
    bag: { potion_s: 2, scroll_terror: 1, water_skin: 1, lockpicks: 1, moss: 3, ...extra.bag },
    pouch: ["potion_s", null, null, null, null],
    ...extra.player,
  });
  return game;
}

test("сумка и спец. предметы идут сами; выбранное берётся; остальное остаётся в лобби", () => {
  const player = { bag: { potion_s: 2, scroll_terror: 1, water_skin: 1, lockpicks: 1, moss: 3 }, pouch: ["potion_s", null, null, null, null] };
  const split = stash.departureSplit(player, { scroll_terror: 1, moss: 2, potion_s: 5 });
  /* Зелье из сумки уходит всё, но выбор на него не влияет: оно уже в автоматической части. */
  assert.deepEqual(split.kept, { potion_s: 2, water_skin: 1, lockpicks: 1 });
  assert.deepEqual(split.carried, { potion_s: 2, water_skin: 1, lockpicks: 1, scroll_terror: 1, moss: 2 });
  assert.deepEqual(split.lobby, { moss: 1 });
});

test("выбор не превышает запас и не берёт ничего, если предмета нет", () => {
  const player = { bag: { moss: 2 }, pouch: [null, null, null, null, null] };
  assert.deepEqual(stash.departureSplit(player, { moss: 99, ghost: 4 }).carried, { moss: 2 });
  assert.deepEqual(stash.departureSplit(player, { moss: -3 }).carried, {});
});

test("openDeparture открывает окно выбора, не ломая лобби на неверном этаже", () => {
  const game = setup();
  game.openDeparture(1);
  assert.deepEqual(game.model.getSnapshot().modal, { kind: "departure", floor: 1 });
  game.openDeparture(99);
  assert.deepEqual(game.model.getSnapshot().modal, { kind: "departure", floor: 1 }, "этажа выше открытого нет");
});

test("старт этажа: в поход идёт сумка, спец. предметы и выбранное; остальное — в lobbyBag", () => {
  const game = setup();
  game.startRun(1, { scroll_terror: 1, moss: 2 });
  const { player, run } = game.model.getSnapshot();
  assert.deepEqual(player.bag, { potion_s: 2, water_skin: 1, lockpicks: 1, scroll_terror: 1, moss: 2 });
  assert.deepEqual(run.lobbyBag, { moss: 1 });
  assert.deepEqual(run.keptBag, { potion_s: 2, water_skin: 1, lockpicks: 1 });
  assert.equal(game.model.getSnapshot().screen, "dungeon");
});

test("гибель: лобби-рюкзак цел, из сумки и спец. предметов остаётся то, что не потрачено; трофеи пропадают", () => {
  const game = setup();
  /* Этаж 3 в начале: смерть = побег + 20%, ограничено 100% — вся добыча уходит. */
  game.model.update({ unlockedFloor: 3 });
  game.startRun(3, { moss: 1 });
  /* В вылазке найдено: два зелья (не из сумки) и одна травинка; зелье из сумки израсходовано. */
  game.model.updatePlayer((p) => ({ ...p, bag: { ...p.bag, potion_s: 1, moss: p.bag.moss + 2 } }));
  game.model.updateRun((r) => ({ ...r, loot: ["potion_s", "moss", "moss"] }));
  game.die("проверка");
  const { player } = game.model.getSnapshot();
  assert.equal(player.bag.moss, 2, "травинки из лобби остаются, найденные — нет");
  assert.equal(player.bag.potion_s, 1, "сумочное зелье осталось в рюкзаке после расхода");
  assert.equal(player.bag.water_skin, 1, "спец. предмет сохранён");
  assert.equal(player.bag.scroll_terror, 1, "не взятый в поход свиток остался в рюкзаке лобби");
  assert.equal(player.bag.moss, 2, "взятая на вылазку травинка пропала вместе с трофеями");
});

test("выход живым: лобби-рюкзак возвращается целиком", () => {
  const game = setup();
  game.startRun(1, { scroll_terror: 1 });
  game.model.updateRun((r) => ({ ...r, bossSlain: true }));
  game.leaveRun();
  const { player, run } = game.model.getSnapshot();
  assert.equal(run, null);
  assert.equal(player.bag.moss, 3, "вся травинка вернулась в рюкзак");
  assert.equal(player.bag.scroll_terror, 1, "свиток, взятый в поход, тоже вернулся");
  assert.equal(player.bag.potion_s, 2);
});

test("старые походы без поля keptBag: при гибели остаётся всё, кроме найденного", () => {
  const working = { potion_s: 3, moss: 2 };
  const survived = stash.bagAfterDeath(working, { loot: ["moss", "potion_s"] });
  assert.deepEqual(survived, { potion_s: 2, moss: 1 });
  assert.deepEqual(stash.bagAfterReturn({ moss: 1 }, { lobbyBag: { moss: 4 } }), { moss: 5 });
  assert.deepEqual(stash.bagAfterReturn({ moss: 1 }, {}), { moss: 1 });
});
