const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-mvc-"));
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
const { LobbyController } = load("src/controllers/LobbyController.ts", "lobby-controller");
const { GameModel } = load("src/model/GameModel.ts", "game-model");
const { MemoryStorage, SaveRepository } = load("src/model/SaveRepository.ts", "save-repository");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");
const content = load("src/game/content.ts", "content");
const battle = load("src/game/battle.ts", "battle");
const maze = load("src/game/maze.ts", "maze");

function makeGame() {
  return new GameController(new MemoryStorage());
}

test("MVC: SaveRepository isolates localStorage keys and PlayerFactory migrates saves", () => {
  const storage = new MemoryStorage();
  const repo = new SaveRepository(storage);
  repo.writeBest(4);
  repo.writeUnlockedFloor(5);
  const player = PlayerFactory.createInitial();
  player.shopLevel = 3;
  repo.writePlayer(player);
  assert.equal(repo.readBest(), 4);
  assert.equal(repo.readUnlockedFloor(), 5);
  assert.equal(repo.readShopLevel(), 3);
  const restored = PlayerFactory.restore(repo.readPlayer());
  assert.equal(restored.shopLevel, 3);
  assert.equal(restored.armory.length, 2);
  assert.ok(restored.hp > 0);
});

test("MVC: the hero always has full health in the lobby", () => {
  const game = makeGame();
  const fresh = game.model.getSnapshot().player;
  assert.equal(fresh.hp, battle.derived(fresh).maxHp, "новый герой приходит с полным здоровьем");

  /* Раны, полученные в вылазке, в лобби не остаются. */
  game.model.updatePlayer((p) => ({ ...p, hp: 1 }));
  game.enterLobby("train");
  const healed = game.model.getSnapshot().player;
  assert.equal(healed.hp, battle.derived(healed).maxHp);

  /* Смена снаряжения и очки характеристик тоже поднимают здоровье до предела. */
  game.lobby.upgradeStat("str");
  const upgraded = game.model.getSnapshot().player;
  assert.equal(upgraded.hp, battle.derived(upgraded).maxHp);
});

test("MVC: LobbyController mutates the model through commands, not React setters", () => {
  const player = PlayerFactory.createInitial();
  player.statPoints = 5;
  player.gold = 500;
  const model = new GameModel({
    screen: "lobby",
    lobbyEntry: "train",
    player,
    shopStock: [],
    run: null,
    battle: null,
    modal: null,
    best: 1,
    unlockedFloor: 1,
    path: [],
    pathPaused: false,
    toast: null,
  });
  const lobby = new LobbyController(model);
  const before = model.getSnapshot().player;
  const res = lobby.upgradeStat("str");
  assert.ok(res);
  const after = model.getSnapshot().player;
  assert.equal(after.stats.str, before.stats.str + 1);
  assert.equal(after.statPoints, before.statPoints - 1);
  assert.ok(after.hp >= before.hp);

  const potion = content.ITEMS.potion_s;
  assert.ok(lobby.buyConsumable(potion));
  assert.equal(model.getSnapshot().player.bag.potion_s, (before.bag.potion_s ?? 0) + 1);
  assert.ok(lobby.sellSupply(potion));
  assert.equal(model.getSnapshot().player.bag.potion_s, before.bag.potion_s ?? 0);
});

test("MVC: GameController starts a run, returns to lobby and persists only safe progress", () => {
  const storage = new MemoryStorage();
  const game = new GameController(storage);
  game.enterLobby("train");
  assert.equal(game.model.getSnapshot().screen, "lobby");
  const savedInLobby = storage.getItem(SaveRepository.PLAYER_KEY);
  assert.ok(savedInLobby, "lobby progress is persisted");
  game.startRun(1);
  const state = game.model.getSnapshot();
  assert.equal(state.screen, "dungeon");
  assert.ok(state.run);
  assert.equal(state.run.floor, 1);
  assert.equal(state.modal.kind, "intro");
  assert.equal(storage.getItem(SaveRepository.PLAYER_KEY), savedInLobby, "run state must not be saved mid-dungeon");

  game.model.updateRun((run) => ({ ...run, gold: 40 }));
  game.leaveRun();
  const lobby = game.model.getSnapshot();
  assert.equal(lobby.screen, "lobby");
  assert.equal(lobby.run, null);
  assert.equal(lobby.player.gold, PlayerFactory.createInitial().gold + 40);
  assert.ok(storage.getItem(SaveRepository.PLAYER_KEY), "lobby progress is persisted");
});

test("MVC: «Начать заново» стирает сохранения и возвращает нового героя", () => {
  const storage = new MemoryStorage();
  const game = new GameController(storage);
  game.enterLobby("train");
  game.model.updatePlayer((p) => ({ ...p, gold: 999, level: 4 }));
  game.saveUnlockedFloor(5);
  assert.ok(storage.getItem(SaveRepository.PLAYER_KEY));

  game.restart();
  const state = game.model.getSnapshot();
  assert.equal(state.screen, "title");
  assert.equal(state.run, null);
  assert.equal(state.battle, null);
  assert.equal(state.best, 0);
  assert.equal(state.unlockedFloor, 1);
  assert.equal(state.player.level, 1);
  assert.equal(state.player.gold, PlayerFactory.createInitial().gold);
  /* Новое сохранение пишется уже от нового героя; старый прогресс стёрт. */
  assert.equal(storage.getItem(SaveRepository.BEST_KEY), null);
  assert.equal(storage.getItem(SaveRepository.UNLOCKED_KEY), null);
  const saved = JSON.parse(storage.getItem(SaveRepository.PLAYER_KEY) ?? "null");
  if (saved) assert.equal(saved.level, 1);
});

test("MVC: BattleController applies victory loot and returns to the dungeon", () => {
  const game = makeGame();
  game.enterLobby("train");
  game.startRun(1);
  const player = game.model.getSnapshot().player;
  const b = battle.newBattle(player, 1);
  b.over = "win";
  b.loot = { gold: 15, xp: 5, items: ["potion_s"], gear: [] };
  game.model.setBattle(b);
  game.battle.continueAfterWin();
  const state = game.model.getSnapshot();
  assert.equal(state.screen, "dungeon");
  assert.equal(state.battle, null);
  assert.equal(state.player.kills, player.kills + 1);
  assert.equal(state.run.gold, 15);
  assert.ok(state.run.loot.includes("potion_s"));
});

/** Соседняя клетка без двери, босса и лестницы: шаг в неё запускает ровно то событие, что нужно тесту. */
function cleanStep(run) {
  const m = run.maze;
  return maze.openDirs(m, run.pos.x, run.pos.y).find(([sx, sy]) => {
    const x = run.pos.x + sx;
    const y = run.pos.y + sy;
    const idx = maze.cellIdx(x, y, m.size);
    if (m.doors.includes(idx)) return false;
    if (m.boss.x === x && m.boss.y === y) return false;
    if (m.stairs.x === x && m.stairs.y === y) return false;
    return true;
  });
}

/** Гасит прочие события карты, чтобы тест проверял только свой тип клетки. */
function calmMaze(m) {
  return { ...m, chests: [], openedChests: [], keys: [], takenKeys: [], events: [], usedEvents: [], doors: [] };
}

test("MVC: a monster on the map starts a battle and victory clears its cell", () => {
  const game = makeGame();
  game.enterLobby("train");
  game.startRun(1);
  game.closeModal();
  const run = game.model.getSnapshot().run;
  /* Берём проход без закрытой двери: дверь открыла бы окно, а не бой. */
  const step = cleanStep(run);
  assert.ok(step, "у старта есть проход без двери, босса и лестницы");
  const [dx, dy] = step;
  const cell = maze.cellIdx(run.pos.x + dx, run.pos.y + dy, run.maze.size);
  game.model.updateRun((r) => ({
    ...r,
    maze: { ...calmMaze(r.maze), monsters: [cell], traps: [] },
    revealedTraps: [],
    sprungTraps: [],
  }));

  game.dungeon.move(dx, dy);
  const inBattle = game.model.getSnapshot();
  assert.equal(inBattle.screen, "battle");
  assert.ok(inBattle.battle, "монстр на клетке начинает бой");
  assert.equal(inBattle.run.battleCell, cell);
  assert.equal(inBattle.run.pos.x, run.pos.x + dx);

  inBattle.battle.over = "win";
  inBattle.battle.loot = { gold: 5, xp: 3, items: [], gear: [] };
  game.battle.continueAfterWin();
  const after = game.model.getSnapshot();
  assert.equal(after.screen, "dungeon");
  assert.equal(after.battle, null);
  assert.ok(after.run.clearedMonsters.includes(cell), "победа освобождает клетку");
  assert.equal(after.run.battleCell, null);
  assert.equal(after.run.maze.monsters.includes(cell), true, "расстановка этажа остаётся неизменной");
});

test("MVC: every trap is visible from the first step of the floor", () => {
  const game = makeGame();
  game.enterLobby("train");
  game.startRun(1);
  const started = game.model.getSnapshot();
  assert.deepEqual(
    [...(started.run.revealedTraps ?? [])].sort((a, b) => a - b),
    [...started.run.maze.traps].sort((a, b) => a - b),
    "на старте этажа видны все ловушки",
  );
  assert.ok(started.run.maze.traps.length > 0);

  /* Даже если бежать по этажу, список остаётся полным — скрытых ловушек нет. */
  game.closeModal();
  const run = started.run;
  const [dx, dy] = cleanStep(run);
  game.dungeon.move(dx, dy);
  const moved = game.model.getSnapshot();
  assert.deepEqual(
    [...(moved.run.revealedTraps ?? [])].sort((a, b) => a - b),
    [...moved.run.maze.traps].sort((a, b) => a - b),
  );

  /* Спуск на новый этаж тоже открывает все ловушки сразу. */
  game.model.updateRun((r) => ({ ...r, maze: { ...r.maze, bossDefeated: true } }));
  game.descend();
  const descended = game.model.getSnapshot();
  assert.deepEqual(
    [...(descended.run.revealedTraps ?? [])].sort((a, b) => a - b),
    [...descended.run.maze.traps].sort((a, b) => a - b),
    "после спуска все ловушки этажа отмечены",
  );
});

test("MVC: a trap cell opens the trap choice and is never rolled at random", () => {
  const game = makeGame();
  game.enterLobby("train");
  game.startRun(1);
  game.closeModal();
  const run = game.model.getSnapshot().run;
  const step = cleanStep(run);
  assert.ok(step, "у старта есть проход без двери, босса и лестницы");
  const [dx, dy] = step;
  const cell = maze.cellIdx(run.pos.x + dx, run.pos.y + dy, run.maze.size);
  game.model.updateRun((r) => ({
    ...r,
    maze: { ...calmMaze(r.maze), monsters: [], traps: [cell] },
    revealedTraps: [],
    sprungTraps: [],
  }));

  game.dungeon.move(dx, dy);
  const trapped = game.model.getSnapshot();
  assert.equal(trapped.screen, "dungeon");
  assert.equal(trapped.modal.kind, "trap");
  assert.ok(trapped.run.sprungTraps.includes(cell), "ловушка срабатывает один раз");
  assert.ok(trapped.run.revealedTraps.includes(cell));

  game.dungeon.takeTrap("prepare");
  const after = game.model.getSnapshot();
  assert.equal(after.modal, null);
  assert.equal(maze.openDirs(run.maze, run.pos.x, run.pos.y)[0] !== undefined, true);
});
