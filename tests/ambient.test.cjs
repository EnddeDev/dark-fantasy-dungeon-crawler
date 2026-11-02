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

test("сцены покрывают лобби, исследование биомов без классики и бой в каждом биоме", () => {
  const dungeon = biomes.BIOME_ORDER.filter((b) => b !== "classic");
  const battle = biomes.BIOME_ORDER.map((b) => `battle-${b}`);
  assert.deepEqual([...scenes.AMBIENT_SCENES], ["lobby", ...dungeon, ...battle]);
  assert.equal(scenes.AMBIENT_SCENES.length, 10);
});

test("классическое подземелье без фона: только музыка, бой сохраняет свою сцену", () => {
  assert.equal(scenes.ambientSceneFor("dungeon", "classic"), null);
  assert.equal(scenes.ambientSceneFor("dungeon", "swamp"), "swamp");
  assert.equal(scenes.ambientSceneFor("battle", "classic"), "battle-classic");
  assert.equal(scenes.musicTrackFor("dungeon", "classic"), "forest");
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
    // Классика на экране подземелья без фона (там только музыка); в остальных биомах фон биома.
    assert.equal(scenes.ambientSceneFor("dungeon", biome), biome === "classic" ? null : biome);
    // В бою звучит своя, более динамичная сцена того же биома.
    assert.equal(scenes.ambientSceneFor("battle", biome), `battle-${biome}`);
  }
  assert.equal(scenes.ambientSceneFor("dungeon", null), null);
  assert.equal(scenes.ambientSceneFor("battle", undefined), null);
  assert.equal(scenes.ambientSceneFor("battle", "unknown"), null);
  assert.equal(scenes.ambientSceneFor("dungeon", "unknown"), null);
});

test("громкости звуков и музыки сохраняются и читаются", () => {
  const data = new Map();
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
  assert.equal(scenes.readSoundVolume(storage), scenes.DEFAULT_SOUND_VOLUME);
  assert.equal(scenes.readMusicVolume(storage), scenes.DEFAULT_MUSIC_VOLUME);
  scenes.writeVolume(storage, scenes.SOUND_VOLUME_KEY, 35);
  assert.equal(data.get(scenes.SOUND_VOLUME_KEY), "35");
  assert.equal(scenes.readSoundVolume(storage), 35);
  scenes.writeVolume(storage, scenes.MUSIC_VOLUME_KEY, 250);
  assert.equal(scenes.readMusicVolume(storage), 100, "сверху ограничено 100");
  scenes.writeVolume(storage, scenes.MUSIC_VOLUME_KEY, -5);
  assert.equal(scenes.readMusicVolume(storage), 0, "снизу ограничено 0");
  scenes.writeVolume(storage, scenes.MUSIC_VOLUME_KEY, 42.4);
  assert.equal(scenes.readMusicVolume(storage), 42, "дробные округляются");
  data.set(scenes.MUSIC_VOLUME_KEY, "мусор");
  assert.equal(scenes.readMusicVolume(storage), scenes.DEFAULT_MUSIC_VOLUME, "мусор заменяется значением по умолчанию");
});

test("прежний выключатель переносится в громкость звуков 0", () => {
  const data = new Map([[scenes.AMBIENT_STORAGE_KEY, "off"]]);
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
  assert.equal(scenes.readSoundVolume(storage), 0);
  data.set(scenes.SOUND_VOLUME_KEY, "70");
  assert.equal(scenes.readSoundVolume(storage), 70, "новый ключ важнее прежнего выключателя");
  data.delete(scenes.SOUND_VOLUME_KEY);
  data.set(scenes.AMBIENT_STORAGE_KEY, "on");
  assert.equal(scenes.readSoundVolume(storage), scenes.DEFAULT_SOUND_VOLUME);
});

test("недоступное хранилище не ломает громкость", () => {
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(scenes.readSoundVolume(broken), scenes.DEFAULT_SOUND_VOLUME);
  assert.equal(scenes.readMusicVolume(broken), scenes.DEFAULT_MUSIC_VOLUME);
  assert.doesNotThrow(() => scenes.writeVolume(broken, scenes.SOUND_VOLUME_KEY, 0));
  assert.equal(scenes.readSoundVolume(null), scenes.DEFAULT_SOUND_VOLUME);
});

test("музыка: лобби и классическое подземелье, в остальных местах тишина", () => {
  assert.equal(scenes.musicTrackFor("lobby", null), "lobby");
  assert.equal(scenes.musicTrackFor("lobby", "fire"), "lobby");
  assert.equal(scenes.musicTrackFor("dungeon", "classic"), "forest");
  for (const biome of ["swamp", "ice", "dark", "fire", null]) {
    assert.equal(scenes.musicTrackFor("dungeon", biome), null, `dungeon/${biome}`);
  }
  assert.equal(scenes.musicTrackFor("battle", "classic"), null, "в бою музыки нет");
  assert.equal(scenes.musicTrackFor("title", null), null);
});

test("все музыкальные дорожки лежат в паке и не пустые", () => {
  for (const [id, rel] of Object.entries(engine.MUSIC_TRACKS)) {
    const file = path.join("public", rel);
    assert.ok(fs.existsSync(file), `${id}: нет файла ${file}`);
    assert.ok(fs.statSync(file).size > 100000, `${id}: файл подозрительно мал`);
  }
});

test("атрибуция автора музыки указана в настройках звука", () => {
  const src = fs.readFileSync(path.join("src", "components", "AudioSettings.tsx"), "utf8");
  assert.match(src, /Makoto Hiramatsu/);
  assert.match(src, /CC BY 4\.0/);
  assert.match(src, /makotohiramatsu\.itch\.io/);
});

test("без Web Audio движок безопасно молчит (Node без window)", () => {
  assert.equal(typeof window, "undefined");
  assert.doesNotThrow(() => engine.setAmbientScene("lobby"));
  assert.doesNotThrow(() => engine.setAmbientScene(null));
  assert.doesNotThrow(() => engine.setSoundVolume(0));
  assert.equal(engine.getSoundVolume(), 0);
  assert.doesNotThrow(() => engine.setAmbientScene("fire"));
  assert.doesNotThrow(() => engine.setMusicVolume(50));
  assert.doesNotThrow(() => engine.setMusicTrack("lobby"));
  assert.doesNotThrow(() => engine.setMusicTrack(null));
  assert.equal(engine.getMusicVolume(), 50);
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
    engine.setSoundVolume(100);
    for (const scene of scenes.AMBIENT_SCENES) {
      assert.doesNotThrow(() => engine.setAmbientScene(scene), scene);
    }
    // Кроссфейд: старая сцена гаснет, новая поднимается; без сцены — тишина.
    await new Promise((resolve) => setTimeout(resolve, 2900));
    assert.doesNotThrow(() => engine.setAmbientScene(null));
    await new Promise((resolve) => setTimeout(resolve, 2900));
    assert.doesNotThrow(() => engine.setSoundVolume(0));
    assert.doesNotThrow(() => engine.setSoundVolume(100));
    assert.doesNotThrow(() => engine.setMusicTrack("lobby"));
    // Каждая сцена создаёт хотя бы один тон и один шумовой источник.
    assert.ok(calls.oscillators >= scenes.AMBIENT_SCENES.length * 2, `oscillators=${calls.oscillators}`);
    assert.ok(calls.sources >= scenes.AMBIENT_SCENES.length, `sources=${calls.sources}`);
  } finally {
    globalThis.window = prevWindow;
  }
});

test("файлы из звукового пака существуют и лежат в public/", () => {
  const fs2 = require("node:fs");
  const samples = require(path.join(temp, "ambientEngine.cjs")).AMBIENT_SAMPLES;
  assert.ok(samples && Object.keys(samples).length >= 3, "AMBIENT_SAMPLES экспортирован");
  for (const [name, rel] of Object.entries(samples)) {
    const file = path.join("public", rel);
    assert.ok(fs2.existsSync(file), `${name}: нет файла ${file}`);
    assert.ok(fs2.statSync(file).size > 10000, `${name}: файл подозрительно мал`);
  }
});

test("погода лобби: сухо чаще дождя, шторм редок", () => {
  const { rollWeather } = engine;
  assert.equal(rollWeather(0), "clear");
  assert.equal(rollWeather(0.59), "clear");
  assert.equal(rollWeather(0.6), "rain");
  assert.equal(rollWeather(0.92), "rain");
  assert.equal(rollWeather(0.93), "storm");
  assert.equal(rollWeather(0.999), "storm");
  // Выборка на равномерном генераторе совпадает с заданными долями (60 / 33 / 7 %).
  const counts = { clear: 0, rain: 0, storm: 0 };
  const n = 10000;
  for (let i = 0; i < n; i++) counts[rollWeather((i + 0.5) / n)]++;
  assert.ok(Math.abs(counts.clear / n - 0.6) < 0.01, JSON.stringify(counts));
  assert.ok(Math.abs(counts.rain / n - 0.33) < 0.01, JSON.stringify(counts));
  assert.ok(Math.abs(counts.storm / n - 0.07) < 0.01, JSON.stringify(counts));
});

test("лобби использует записи Interior Night, а не лесную", () => {
  const samples = engine.AMBIENT_SAMPLES;
  assert.match(samples.interior, /Interior Night\/Inside Night\.ogg$/);
  assert.match(samples.interiorRain, /Interior Night\/Inside Night Rain\.ogg$/);
  assert.match(samples.interiorStorm, /Interior Night\/Inside Night Storm\.ogg$/);
});
