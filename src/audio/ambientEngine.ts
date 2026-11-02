import { readAmbientMuted, writeAmbientMuted, type AmbientScene } from "./ambientScenes";

/**
 * Фоновый звук, синтезированный в браузере через Web Audio API.
 * Один мастер-гейн, кроссфейд между сценами, старт по первому жесту пользователя
 * (политика автовоспроизведения). Выключенный звук не создаёт AudioContext.
 */

const MASTER_LEVEL = 0.7;
const FADE_IN_S = 3;
const FADE_OUT_S = 2.5;
const GESTURE_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

interface AmbientEnv {
  ctx: AudioContext;
  /** Шина сцены: все голоса сцены подключаются сюда. */
  out: AudioNode;
  noise: AudioBuffer;
  /** Регистрирует функцию остановки голоса; вызывается при смене сцены. */
  track(stop: () => void): void;
}

type Recipe = (env: AmbientEnv) => void;

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/** Непрерывный тон (дрон), с необязательным медленным дрожанием громкости. */
function drone(
  env: AmbientEnv,
  freq: number,
  type: OscillatorType,
  gain: number,
  opts: { detune?: number; lfoHz?: number } = {},
): void {
  const { ctx, out } = env;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = opts.detune ?? 0;
  const g = ctx.createGain();
  g.gain.value = gain;
  osc.connect(g);
  g.connect(out);
  if (opts.lfoHz) modulate(env, opts.lfoHz, gain * 0.6, g.gain);
  osc.start();
  env.track(() => {
    osc.stop();
    osc.disconnect();
    g.disconnect();
  });
}

/** Плавное движение параметра: LFO с глубиной depth. */
function modulate(env: AmbientEnv, hz: number, depth: number, target: AudioParam): void {
  const { ctx } = env;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.value = depth;
  lfo.connect(g);
  g.connect(target);
  lfo.start();
  env.track(() => {
    lfo.stop();
    lfo.disconnect();
    g.disconnect();
  });
}

/** Непрерывный шум через фильтр (ветер, гул, шипение), с плавающей частотой фильтра. */
function noiseBed(
  env: AmbientEnv,
  o: { type: BiquadFilterType; freq: number; q?: number; gain: number; sweepHz?: number; sweepDepth?: number },
): void {
  const { ctx, out, noise } = env;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.frequency.value = o.freq;
  f.Q.value = o.q ?? 0.7;
  const g = ctx.createGain();
  g.gain.value = o.gain;
  src.connect(f);
  f.connect(g);
  g.connect(out);
  if (o.sweepHz) modulate(env, o.sweepHz, o.sweepDepth ?? o.freq * 0.4, f.frequency);
  src.start(0, Math.random() * Math.max(0, noise.duration - 1));
  env.track(() => {
    src.stop();
    src.disconnect();
    f.disconnect();
    g.disconnect();
  });
}

/** Короткий тон с огибающей: капель, бульканье, звон, рычание. */
function blip(
  env: AmbientEnv,
  o: { freq: number; endFreq?: number; dur: number; gain: number; type?: OscillatorType; at?: number; pan?: number; lowpass?: number },
): void {
  const { ctx, out } = env;
  const t = ctx.currentTime + (o.at ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(o.endFreq, t + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain, t + Math.min(0.02, o.dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  const pan = ctx.createStereoPanner();
  pan.pan.value = o.pan ?? 0;
  const nodes: AudioNode[] = [osc, g, pan];
  osc.connect(g);
  if (o.lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.lowpass;
    g.connect(f);
    f.connect(pan);
    nodes.push(f);
  } else {
    g.connect(pan);
  }
  pan.connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
  osc.onended = () => nodes.forEach((n) => n.disconnect());
}

/** Короткий всплеск шума через полосовой фильтр: шёпот, треск, шипение. */
function noiseShot(
  env: AmbientEnv,
  o: { type: BiquadFilterType; freq: number; q?: number; dur: number; gain: number; at?: number; pan?: number },
): void {
  const { ctx, out, noise } = env;
  const t = ctx.currentTime + (o.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.frequency.value = o.freq;
  f.Q.value = o.q ?? 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain, t + o.dur * 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  const pan = ctx.createStereoPanner();
  pan.pan.value = o.pan ?? 0;
  src.connect(f);
  f.connect(g);
  g.connect(pan);
  pan.connect(out);
  const offset = Math.random() * Math.max(0, noise.duration - o.dur - 0.1);
  src.start(t, offset, o.dur + 0.05);
  src.onended = () => [src, f, g, pan].forEach((n) => n.disconnect());
}

/** Повторять fire через случайные интервалы [minS, maxS] секунд, пока сцена жива. */
function every(env: AmbientEnv, minS: number, maxS: number, fire: () => void): void {
  let id: ReturnType<typeof setTimeout> | undefined;
  let alive = true;
  const next = () => {
    id = setTimeout(() => {
      if (!alive) return;
      fire();
      next();
    }, rnd(minS, maxS) * 1000);
  };
  next();
  env.track(() => {
    alive = false;
    if (id !== undefined) clearTimeout(id);
  });
}

const drip = (env: AmbientEnv) =>
  blip(env, { freq: rnd(1500, 2000), endFreq: rnd(800, 1000), dur: 0.2, gain: 0.05, pan: rnd(-0.6, 0.6) });

const bubble = (env: AmbientEnv) =>
  blip(env, { freq: rnd(260, 380), endFreq: rnd(480, 620), dur: 0.12, gain: 0.03, pan: rnd(-0.7, 0.7) });

const thump = (env: AmbientEnv, freq: number, gain: number, at = 0) =>
  blip(env, { freq: freq * 2, endFreq: freq * 0.6, dur: 0.3, gain, at });

/** Звон: основной тон и квинта-кварта повыше, затухает. */
function chime(env: AmbientEnv, freq: number, gain: number, dur: number, pan = 0): void {
  blip(env, { freq, dur, gain, pan });
  blip(env, { freq: freq * 2.76, dur: dur * 0.5, gain: gain * 0.35, pan });
}

/** Квакша: три низких хрипловатых выдоха. */
function croak(env: AmbientEnv): void {
  const base = rnd(120, 160);
  for (let i = 0; i < 3; i++) {
    blip(env, { freq: base, endFreq: base * 0.7, dur: 0.22, gain: 0.035, type: "square", at: i * 0.3, lowpass: 420, pan: rnd(-0.4, 0.4) });
  }
}

/** Треск костра: короткие разрывы шума, высокая полоса. */
const crackle = (env: AmbientEnv) =>
  noiseShot(env, { type: "highpass", freq: 2200, q: 0.8, dur: 0.05, gain: 0.04, pan: rnd(-0.8, 0.8) });

const ICE_CHIMES = [1319, 1567, 1760, 2093, 2637];

const RECIPES_TABLE: Record<AmbientScene, Recipe> = {
  /** Лагерь у входа: тёплый низкий дрон, ветер и редкий далёкий колокол. */
  lobby(env) {
    drone(env, 55, "sine", 0.05);
    drone(env, 82.4, "sine", 0.03, { detune: 4 });
    drone(env, 110, "triangle", 0.012, { lfoHz: 0.05 });
    noiseBed(env, { type: "bandpass", freq: 380, q: 0.6, gain: 0.05, sweepHz: 0.05, sweepDepth: 150 });
    every(env, 9, 18, () => chime(env, 330, 0.035, 3.5, rnd(-0.5, 0.5)));
  },

  /** Классический лабиринт: каменный дрон, рокот, редкая капель. */
  classic(env) {
    drone(env, 41.2, "sine", 0.09);
    drone(env, 61.7, "triangle", 0.03, { detune: -6, lfoHz: 0.07 });
    noiseBed(env, { type: "lowpass", freq: 140, q: 0.7, gain: 0.07, sweepHz: 0.03, sweepDepth: 40 });
    every(env, 2.5, 6, () => drip(env));
    every(env, 18, 32, () => thump(env, 55, 0.06));
  },

  /** Подземное болото: влажный шум, бульканье, квакши. */
  swamp(env) {
    drone(env, 65.4, "sine", 0.04);
    drone(env, 98, "triangle", 0.015, { lfoHz: 0.11 });
    noiseBed(env, { type: "lowpass", freq: 320, q: 0.9, gain: 0.09, sweepHz: 0.09, sweepDepth: 120 });
    every(env, 1.2, 3.5, () => bubble(env));
    every(env, 7, 14, () => croak(env));
  },

  /** Ледяные просторы: порывы ветра, высокие звоны, низкий тон. */
  ice(env) {
    drone(env, 55, "sine", 0.03);
    drone(env, 82.5, "sine", 0.02, { detune: 3 });
    noiseBed(env, { type: "highpass", freq: 1400, q: 0.5, gain: 0.05, sweepHz: 0.04, sweepDepth: 500 });
    noiseBed(env, { type: "bandpass", freq: 3000, q: 2, gain: 0.01, sweepHz: 0.07, sweepDepth: 900 });
    every(env, 3, 7, () => chime(env, pick(ICE_CHIMES), 0.03, 2.5, rnd(-0.7, 0.7)));
  },

  /** Тёмное подземелье: почти тихий саб-дрон, глухие удары сердца, шёпот. */
  dark(env) {
    drone(env, 36.7, "sine", 0.11, { lfoHz: 0.1 });
    drone(env, 55, "sine", 0.02, { detune: 5 });
    every(env, 6, 9, () => {
      thump(env, 50, 0.1);
      thump(env, 46, 0.08, 0.35);
    });
    every(env, 10, 20, () => noiseShot(env, { type: "bandpass", freq: 1100, q: 8, dur: 1.8, gain: 0.03, pan: rnd(-0.5, 0.5) }));
    every(env, 16, 28, () => thump(env, 80, 0.07));
  },

  /** Огненные недра: треск, низкий гул, редкие вспышки искр. */
  fire(env) {
    noiseBed(env, { type: "lowpass", freq: 420, q: 0.7, gain: 0.07, sweepHz: 0.13, sweepDepth: 150 });
    drone(env, 73.4, "triangle", 0.02);
    drone(env, 110, "triangle", 0.01, { lfoHz: 0.17 });
    every(env, 0.05, 0.3, () => crackle(env));
    every(env, 4, 9, () => noiseShot(env, { type: "highpass", freq: 900, q: 0.6, dur: 0.08, gain: 0.1 }));
  },
};

/** Рецепты по сценам (экспорт для тестов: все сцены должны иметь рецепт). */
export const AMBIENT_RECIPES: Readonly<Record<AmbientScene, Recipe>> = RECIPES_TABLE;

// ---------------------------------------------------------------------------
// Движок: контекст, мастер-гейн, кроссфейд, выключатель, старт по жесту.
// ---------------------------------------------------------------------------

interface Playing {
  scene: AmbientScene;
  bus: GainNode;
  stop: () => void;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let current: Playing | null = null;
let wanted: AmbientScene | null = null;
let muted: boolean | null = null;
let listening = false;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function isAmbientMuted(): boolean {
  if (muted === null) muted = readAmbientMuted(storage());
  return muted;
}

function makeNoise(c: AudioContext): AudioBuffer {
  const length = c.sampleRate * 4;
  const buf = c.createBuffer(1, length, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Создаёт AudioContext только тогда, когда звук включён и API доступен. */
function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = isAmbientMuted() ? 0 : MASTER_LEVEL;
  master.connect(ctx.destination);
  noiseBuf = makeNoise(ctx);
  return ctx;
}

/** Контекст создаётся вне жеста и остаётся приостановленным: снимаем блокировку первым нажатием. */
function unlock(): void {
  if (!ctx) return;
  const c = ctx;
  void c
    .resume()
    .then(() => {
      if (c.state === "running") detachGestures();
    })
    .catch(() => undefined);
}

function attachGestures(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  for (const ev of GESTURE_EVENTS) window.addEventListener(ev, unlock, { passive: true });
}

function detachGestures(): void {
  if (!listening || typeof window === "undefined") return;
  listening = false;
  for (const ev of GESTURE_EVENTS) window.removeEventListener(ev, unlock);
}

/** Кроссфейд: старую сцену гасим за FADE_OUT_S, новую поднимаем за FADE_IN_S. */
function crossfade(scene: AmbientScene | null): void {
  if (!ctx || !master || !noiseBuf) return;
  if ((current?.scene ?? null) === scene) return;
  const c = ctx;
  const now = c.currentTime;
  if (current) {
    const old = current;
    current = null;
    old.bus.gain.cancelScheduledValues(now);
    old.bus.gain.setValueAtTime(old.bus.gain.value, now);
    old.bus.gain.linearRampToValueAtTime(0, now + FADE_OUT_S);
    window.setTimeout(() => {
      old.stop();
      old.bus.disconnect();
    }, (FADE_OUT_S + 0.2) * 1000);
  }
  if (scene) {
    const bus = c.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(1, now + FADE_IN_S);
    bus.connect(master);
    const stops: Array<() => void> = [];
    AMBIENT_RECIPES[scene]({
      ctx: c,
      out: bus,
      noise: noiseBuf,
      track: (stop) => stops.push(stop),
    });
    current = { scene, bus, stop: () => stops.forEach((s) => s()) };
  }
}

/** Вызывается из View при смене экрана или биома. null — тишина. */
export function setAmbientScene(scene: AmbientScene | null): void {
  wanted = scene;
  if (isAmbientMuted()) return;
  // Тишина без текущей сцены не требует контекста: не создаём его до жеста пользователя.
  if (!scene && !current) return;
  if (!ensureContext()) return;
  crossfade(scene);
  if (ctx && ctx.state !== "running") attachGestures();
}

/** Переключатель звука. Включение — это жест пользователя, поэтому контекст можно запускать сразу. */
export function setAmbientMuted(value: boolean): void {
  muted = value;
  writeAmbientMuted(storage(), value);
  if (value) {
    if (ctx && master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    return;
  }
  if (!ensureContext() || !ctx || !master) return;
  master.gain.setTargetAtTime(MASTER_LEVEL, ctx.currentTime, 0.2);
  crossfade(wanted);
  if (ctx.state !== "running") {
    void ctx.resume().catch(() => undefined);
    attachGestures();
  }
}
