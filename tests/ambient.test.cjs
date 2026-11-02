const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sumrak-ambient-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

function load(name) {
  const outfile = path.join(temp, `${name}.cjs`);
  buildSync({ entryPoints: [`src/audio/${name}.ts`], outfile, bundle: true, platform: "node", format: "cjs", external: ["react", "react-dom"] });
  return require(outfile);
}

const scenes = load("ambientScenes");
const engine = load("ambientEngine");
const biomes = (() => {
  const outfile = path.join(temp, "biomes.cjs");
  buildSync({ entryPoints: ["src/game/biomes.ts"], outfile, bundle: true, platform: "node", format: "cjs" });
  return require(outfile);
})();

test("сцены покрывают лобби, исследование и бой в каждом биоме", () => {
  const battle = biomes.BIOME_ORDER.map((b) => `battle-${b}`);
  assert.deepEqual([...scenes.AMBIENT_SCENES], ["lobby", ...biomes.BIOME_ORDER, ...battle]);
  assert.equal(scenes.AMBIENT_SCENES.length, 11);
});

test("рецепт звука есть для каждой сцены и нет лишних", () => {
  assert.deepEqual(Object.keys(engine.AMBIENT_RECIPES).sort(), [...scenes.AMBIENT_SCENES].sort());
  for (const scene of scenes.AMBIENT_SCENES) {
    assert.equal(typeof engine.AMBIENT_RECIPES[scene], "function", scene);
  }
});

test("выбор сцены по экрану и биому", () => {
  assert.equal(scenes.ambientSceneFor("lobby", null), "lobby");
  assert.equal(scenes.ambientSceneFor("lobby", "fire"), "lobby");
  assert.equal(scenes.ambientSceneFor("title", "fire"), null);
  for (const biome of biomes.BIOME_ORDER) {
    assert.equal(scenes.ambientSceneFor("dungeon", biome), biome);
    // В бою звучит своя, более динамичная сцена того же биома.
    assert.equal(scenes.ambientSceneFor("battle", biome), `battle-${biome}`);
  }
  assert.equal(scenes.ambientSceneFor("dungeon", null), null);
  assert.equal(scenes.ambientSceneFor("battle", undefined), null);
  assert.equal(scenes.ambientSceneFor("battle", "unknown"), null);
  assert.equal(scenes.ambientSceneFor("dungeon", "unknown"), null);
});

test("выключатель сохраняется в хранилище", () => {
  const data = new Map();
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
  assert.equal(scenes.readAmbientMuted(storage), false);
  scenes.writeAmbientMuted(storage, true);
  assert.equal(data.get(scenes.AMBIENT_STORAGE_KEY), "off");
  assert.equal(scenes.readAmbientMuted(storage), true);
  scenes.writeAmbientMuted(storage, false);
  assert.equal(scenes.readAmbientMuted(storage), false);
});

test("недоступное хранилище не ломает звук", () => {
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(scenes.readAmbientMuted(broken), false);
  assert.doesNotThrow(() => scenes.writeAmbientMuted(broken, true));
  assert.equal(scenes.readAmbientMuted(null), false);
});

test("без Web Audio движок безопасно молчит (Node без window)", () => {
  assert.equal(typeof window, "undefined");
  assert.doesNotThrow(() => engine.setAmbientScene("lobby"));
  assert.doesNotThrow(() => engine.setAmbientScene(null));
  assert.doesNotThrow(() => engine.setAmbientMuted(true));
  assert.equal(engine.isAmbientMuted(), true);
  assert.doesNotThrow(() => engine.setAmbientScene("fire"));
});

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

test("все сцены запускаются и гаснут в заглушке Web Audio", async () => {
  const ctxObj = fakeNode({ sampleRate: 8000, currentTime: 0, state: "running" });
  const calls = { oscillators: 0, sources: 0 };
  const makeOsc = ctxObj.createOscillator;
  const makeSrc = ctxObj.createBufferSource;
  ctxObj.createOscillator = () => {
    calls.oscillators++;
    return makeOsc();
  };
  ctxObj.createBufferSource = () => {
    calls.sources++;
    return makeSrc();
  };
  class FakeAudioContext {
    constructor() {
      return ctxObj;
    }
  }
  const prevWindow = globalThis.window;
  globalThis.window = { AudioContext: FakeAudioContext, setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} };
  try {
    engine.setAmbientMuted(false);
    for (const scene of scenes.AMBIENT_SCENES) {
      assert.doesNotThrow(() => engine.setAmbientScene(scene), scene);
    }
    // Кроссфейд: старая сцена гаснет, новая поднимается; без сцены — тишина.
    await new Promise((resolve) => setTimeout(resolve, 2900));
    assert.doesNotThrow(() => engine.setAmbientScene(null));
    await new Promise((resolve) => setTimeout(resolve, 2900));
    assert.doesNotThrow(() => engine.setAmbientMuted(true));
    assert.doesNotThrow(() => engine.setAmbientMuted(false));
    // Каждая сцена создаёт хотя бы один тон и один шумовой источник.
    assert.ok(calls.oscillators >= scenes.AMBIENT_SCENES.length * 2, `oscillators=${calls.oscillators}`);
    assert.ok(calls.sources >= scenes.AMBIENT_SCENES.length, `sources=${calls.sources}`);
  } finally {
    globalThis.window = prevWindow;
  }
});
