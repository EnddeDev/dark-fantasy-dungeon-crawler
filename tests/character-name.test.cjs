const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-name-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function bundle(entry, name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [entry], outfile, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  return require(outfile);
}

const names = bundle("src/game/characterName.ts", "characterName");
const { GameController } = bundle("src/controllers/GameController.ts", "GameController");

function memoryStorage() {
  const data = new Map();
  return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

test("имя принимается, края и лишние пробелы убираются", () => {
  assert.deepEqual(names.checkCharacterName("  Ирма  "), { ok: true, name: "Ирма" });
  assert.deepEqual(names.checkCharacterName("Ser   Kay"), { ok: true, name: "Ser Kay" });
  assert.deepEqual(names.checkCharacterName("Лис-Ворон'д."), { ok: true, name: "Лис-Ворон'д." });
  assert.deepEqual(names.checkCharacterName("Ab1"), { ok: true, name: "Ab1" });
});

test("пустое и слишком короткое имя отклоняются", () => {
  assert.equal(names.checkCharacterName("").ok, false);
  assert.equal(names.checkCharacterName("   ").ok, false);
  const short = names.checkCharacterName("A");
  assert.equal(short.ok, false);
  assert.match(short.error, /минимум 2/);
});

test("имя длиной ровно 24 символа проходит, 25 — нет", () => {
  const max = "а".repeat(names.CHARACTER_NAME_MAX);
  assert.equal(names.checkCharacterName(max).ok, true);
  const tooLong = names.checkCharacterName(max + "а");
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /не длиннее 24/);
});

test("символы вне букв, цифр, пробела, дефиса, точки и апострофа отклоняются", () => {
  for (const bad of ["<script>", "Имя;drop", "a/b", "Ок_лаг", "🙂🙂🙂", "-Дефис", "Имя!"]) {
    assert.equal(names.checkCharacterName(bad).ok, false, bad);
  }
});

test("сохранение: renameHero меняет только имя и сохраняет его локально", () => {
  const storage = memoryStorage();
  const game = new GameController(storage);
  // Сохранение пишется только в лобби, как и в игре: остальные экраны не трогают файл.
  game.model.update({ screen: "lobby" });
  const before = game.model.getSnapshot().player;
  const level = before.level;
  const gold = before.gold;

  assert.equal(game.renameHero("Тень"), null);
  const after = game.model.getSnapshot().player;
  assert.equal(after.name, "Тень");
  assert.equal(after.level, level);
  assert.equal(after.gold, gold);

  const err = game.renameHero("Х");
  assert.match(err, /минимум 2/);
  assert.equal(game.model.getSnapshot().player.name, "Тень", "при ошибке имя не меняется");

  const reloaded = new GameController(storage);
  assert.equal(reloaded.model.getSnapshot().player.name, "Тень", "имя переживает перезагрузку");
  game.dispose();
  reloaded.dispose();
});

test("панель и экран подключают смену имени", () => {
  const rail = fs.readFileSync(path.join("src", "components", "Rail.tsx"), "utf8");
  const view = fs.readFileSync(path.join("src", "views", "GameView.tsx"), "utf8");
  assert.match(rail, /Сменить имя персонажа/);
  assert.match(rail, /CHARACTER_NAME_MAX/);
  assert.match(view, /onRename=\{\(name\) => game\.renameHero\(name\)\}/);
});

test("сервер сохраняет имя через общие правила, пустое — на значение по умолчанию", () => {
  const save = bundle("server/save.ts", "save");
  const { PlayerFactory } = bundle("src/model/PlayerFactory.ts", "PlayerFactory");
  const hero = PlayerFactory.createInitial();
  assert.equal(save.sanitizePlayer({ ...hero, name: "  Ирма  " }).name, "Ирма");
  assert.equal(save.sanitizePlayer({ ...hero, name: "а".repeat(40) }).name, "а".repeat(names.CHARACTER_NAME_MAX));
  assert.equal(save.sanitizePlayer({ ...hero, name: "   " }).name, names.DEFAULT_CHARACTER_NAME);
});
