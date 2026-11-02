const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-sfx-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

// Движок собирается отдельно, а sfx ссылается на него: тест и звуки используют один экземпляр.
buildSync({ entryPoints: ["src/audio/ambientEngine.ts"], outfile: path.join(temp, "ambientEngine.js"), bundle: true, platform: "node", format: "cjs" });
buildSync({
  entryPoints: ["src/audio/sfx.ts"],
  outfile: path.join(temp, "sfx.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["./ambientEngine"],
});
const sfx = require(path.join(temp, "sfx.js"));
const engine = require(path.join(temp, "ambientEngine.js"));

test("все звуки действий лежат в паке и не пустые", () => {
  for (const [name, files] of Object.entries(sfx.SFX_SAMPLES)) {
    assert.ok(files.length >= 1, name);
    for (const rel of files) {
      const file = path.join("public", rel);
      assert.ok(fs.existsSync(file), `${name}: нет файла ${file}`);
      assert.ok(fs.statSync(file).size > 1000, `${name}: файл подозрительно мал ${file}`);
    }
  }
  assert.deepEqual(Object.keys(sfx.SFX_SAMPLES).sort(), ["buy", "chest", "door", "equip", "forgeFail", "forgeSuccess", "sell", "unequip"]);
});

test("без Web Audio звуки действий молча ничего не делают", () => {
  assert.equal(typeof window, "undefined");
  for (const name of Object.keys(sfx.SFX_SAMPLES)) {
    assert.doesNotThrow(() => sfx.playSfx(name), name);
  }
});

test("покупка, продажа, дверь и кузница играют назначенные файлы пака", () => {
  const want = {
    buy: "Gate Open.ogg",
    sell: "Gate Close.ogg",
    door: "Door Open 2.ogg",
    forgeFail: "mine 4.ogg",
    forgeSuccess: "Sword Blocked 3.ogg",
  };
  for (const [name, file] of Object.entries(want)) {
    const files = sfx.SFX_SAMPLES[name];
    assert.equal(files.length, 1, name);
    assert.ok(files[0].endsWith(`/${file}`), `${name}: ${files[0]}`);
  }
});

test("звуки подключены к действиям: дверь, покупка, продажа, кузница", () => {
  const lobby = fs.readFileSync(path.join("src", "controllers", "LobbyController.ts"), "utf8");
  const dungeon = fs.readFileSync(path.join("src", "controllers", "DungeonController.ts"), "utf8");
  // Кузница: звук только у реальной попытки (cost > 0); отказы «нет золота» и «недостижимо» молчат.
  assert.match(lobby, /if \(res\.cost > 0\) playSfx\(res\.success \? "forgeSuccess" : "forgeFail"\);/);
  // Дверь: и ключ, и отмычка; неудачная отмычка дверь не открывает и молчит.
  assert.equal((dungeon.match(/playSfx\("door"\)/g) ?? []).length, 2);
});
