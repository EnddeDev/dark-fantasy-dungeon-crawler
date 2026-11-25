const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-intro-"));
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
const { MemoryStorage, SaveRepository } = load("src/model/SaveRepository.ts", "save-repository");
const { PlayerFactory } = load("src/model/PlayerFactory.ts", "player-factory");
const save = load("server/save.ts", "save");

test("окно входа в лабиринт: первый раз показывается, потом — нет", () => {
  const game = new GameController(new MemoryStorage());
  game.enterLobby("train");
  game.startRun(1);
  assert.equal(game.model.getSnapshot().modal?.kind, "intro", "первый вход показывает правила");
  assert.equal(game.model.getSnapshot().player.dungeonIntroSeen, true, "флаг записан в профиль");
  game.closeModal();
  game.leaveRun();
  game.enterLobby("train");
  game.startRun(1);
  assert.equal(game.model.getSnapshot().modal, null, "второй вход окна не открывает");
});

test("«Начать заново» не сбрасывает флаг: новый герой правила не увидит", () => {
  const game = new GameController(new MemoryStorage());
  game.enterLobby("train");
  game.startRun(1);
  game.closeModal();
  game.leaveRun();
  game.restart();
  assert.equal(game.model.getSnapshot().player.dungeonIntroSeen, true, "флаг пережил перезапуск");
  game.enterLobby("train");
  game.startRun(1);
  assert.equal(game.model.getSnapshot().modal, null, "после перезапуска окно не показывается");
});

test("без флага «Начать заново» не мешает: окно появляется при первом входе", () => {
  const game = new GameController(new MemoryStorage());
  game.restart();
  assert.equal(game.model.getSnapshot().player.dungeonIntroSeen, undefined, "у нового героя флага нет");
  game.enterLobby("train");
  game.startRun(1);
  assert.equal(game.model.getSnapshot().modal?.kind, "intro");
});

test("флаг сохраняется в профиле на выходе и переживает загрузку", () => {
  const storage = new MemoryStorage();
  const game = new GameController(storage);
  game.enterLobby("train");
  game.startRun(1);
  game.closeModal();
  game.leaveRun();
  const stored = JSON.parse(storage.getItem(SaveRepository.PLAYER_KEY));
  assert.equal(stored.dungeonIntroSeen, true, "в сохранении есть флаг");
  const restored = PlayerFactory.restore(stored);
  assert.equal(restored.dungeonIntroSeen, true, "загрузка сохраняет флаг");
});

test("серверный санитайзер сохраняет флаг только когда он true", () => {
  const hero = PlayerFactory.createInitial();
  assert.equal(save.sanitizePlayer({ ...hero, dungeonIntroSeen: true }).dungeonIntroSeen, true);
  assert.equal(save.sanitizePlayer({ ...hero, dungeonIntroSeen: "да" }).dungeonIntroSeen, undefined);
  assert.equal("dungeonIntroSeen" in save.sanitizePlayer(hero), false, "без флага поле не появляется");
});
