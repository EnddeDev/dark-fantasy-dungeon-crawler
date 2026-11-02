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

/** Заглушка Web Audio: любой метод и свойство существуют, вызовы ничего не делают. */
function fakeNode(overrides = {}) {
  const store = { ...overrides };
  const target = function () {};
  return new Proxy(target, {
    get(_t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === "then") return undefined;
      if (!(p in store)) store[p] = fakeNode();
      return store[p];
    },
    set(_t, p, v) {
      store[p] = v;
      return true;
    },
    apply() {
      return fakeNode();
    },
  });
}

test("все звуки действий лежат в паке и не пустые", () => {
  for (const [name, files] of Object.entries(sfx.SFX_SAMPLES)) {
    assert.ok(files.length >= 1, name);
    for (const rel of files) {
      const file = path.join("public", rel);
      assert.ok(fs.existsSync(file), `${name}: нет файла ${file}`);
      assert.ok(fs.statSync(file).size > 1000, `${name}: файл подозрительно мал ${file}`);
    }
  }
  assert.deepEqual(Object.keys(sfx.SFX_SAMPLES).sort(), ["chest", "equip", "unequip"]);
});

test("без Web Audio звуки действий молча ничего не делают", () => {
  assert.equal(typeof window, "undefined");
  for (const name of ["chest", "equip", "unequip", "buy", "sell"]) {
    assert.doesNotThrow(() => sfx.playSfx(name), name);
  }
});

test("покупка и продажа синтезируют монеты через общий выход", () => {
  const calls = { oscillators: 0 };
  const ctxObj = fakeNode({ sampleRate: 8000, currentTime: 0, state: "running" });
  const makeOsc = ctxObj.createOscillator;
  ctxObj.createOscillator = () => {
    calls.oscillators++;
    return makeOsc();
  };
  class FakeAudioContext {
    constructor() {
      return ctxObj;
    }
  }
  const prevWindow = globalThis.window;
  globalThis.window = { AudioContext: FakeAudioContext, setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} };
  try {
    engine.setSoundVolume(100);
    calls.oscillators = 0;
    sfx.playSfx("buy");
    assert.equal(calls.oscillators, 3, "покупка: три монеты");
    calls.oscillators = 0;
    sfx.playSfx("sell");
    assert.equal(calls.oscillators, 3, "продажа: три монеты");

    // Выключатель звука глушит и эффекты: ничего не создаётся.
    engine.setSoundVolume(0);
    calls.oscillators = 0;
    sfx.playSfx("buy");
    assert.equal(calls.oscillators, 0, "при выключенном звуке монеты не играют");
  } finally {
    globalThis.window = prevWindow;
  }
});
