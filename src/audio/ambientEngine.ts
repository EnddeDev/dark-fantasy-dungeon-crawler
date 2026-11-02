import { readAmbientMuted, writeAmbientMuted, type AmbientScene } from "./ambientScenes";
import type { BiomeId } from "../game/biomes";

/**
 * Фоновый звук, синтезированный в браузере через Web Audio API.
 * Один мастер-гейн, кроссфейд между сценами, старт по первому жесту пользователя
 * (политика автовоспроизведения). Выключенный звук не создаёт AudioContext.
 *
 * Характер: минорные тональности (D-минор, фригийский лад), медленно нарастающие пэды,
 * далёкие гонги и колокола — для загадочного и грандиозного настроения.
 * В бою добавляется метроном: барабан, перкуссия и остинато — звук напряжённее и быстрее.
 */

/** Общая громкость. Низкое значение: звук лежит под интерфейсом, а не поверх него. */
const MASTER_LEVEL = 0.35;
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

/** Непрерывный тон (дрон или пэд), с необязательным нарастанием и дрожанием громкости. */
function drone(
  env: AmbientEnv,
  freq: number,
  type: OscillatorType,
  gain: number,
  opts: { detune?: number; lfoHz?: number; swell?: number } = {},
): void {
  const { ctx, out } = env;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = opts.detune ?? 0;
  const g = ctx.createGain();
  if (opts.swell) {
    // Медленное нарастание: звук «всплывает» из тишины, как далёкий орган.
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + opts.swell);
  } else {
    g.gain.value = gain;
  }
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

/** Аккорд-пэд: несколько тонов с лёгкой расстройкой, медленное дыхание громкости. */
function pad(env: AmbientEnv, freqs: readonly number[], gain: number, opts: { swell?: number; lfoHz?: number } = {}): void {
  freqs.forEach((f, i) => {
    drone(env, f, "sine", gain, { detune: i % 2 ? 6 : -6, lfoHz: opts.lfoHz, swell: opts.swell });
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

/** Непрерывный шум через фильтр (ветер, гул, рокот), с плавающей частотой фильтра. */
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

/** Короткий тон с огибающей: капель, бульканье, звон, удар. */
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

/** Короткий всплеск шума через фильтр: шёпот, треск, перкуссия. */
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

/**
 * Тактовый генератор для боя: шаги планируются по часам аудиоконтекста,
 * поэтому ритм не плывёт, как при setTimeout-цепочке.
 */
function clock(env: AmbientEnv, stepSec: number, onStep: (step: number, at: number) => void): void {
  const { ctx } = env;
  let next = ctx.currentTime + 0.05;
  let step = 0;
  let id: ReturnType<typeof setTimeout> | undefined;
  let alive = true;
  const tick = () => {
    if (!alive) return;
    const horizon = ctx.currentTime + 0.2;
    while (next < horizon) {
      onStep(step++, Math.max(0, next - ctx.currentTime));
      next += stepSec;
    }
    id = setTimeout(tick, 50);
  };
  tick();
  env.track(() => {
    alive = false;
    if (id !== undefined) clearTimeout(id);
  });
}

const drip = (env: AmbientEnv, gain = 0.025) =>
  blip(env, { freq: rnd(1500, 2000), endFreq: rnd(800, 1000), dur: 0.2, gain, pan: rnd(-0.6, 0.6) });

const bubble = (env: AmbientEnv, gain = 0.012) =>
  blip(env, { freq: rnd(260, 380), endFreq: rnd(480, 620), dur: 0.12, gain, pan: rnd(-0.7, 0.7) });

const thump = (env: AmbientEnv, freq: number, gain: number, at = 0) =>
  blip(env, { freq: freq * 2, endFreq: freq * 0.6, dur: 0.3, gain, at });

/** Звон: основной тон и обертон повыше, долго затухает. */
function chime(env: AmbientEnv, freq: number, gain: number, dur: number, pan = 0): void {
  blip(env, { freq, dur, gain, pan });
  blip(env, { freq: freq * 2.76, dur: dur * 0.5, gain: gain * 0.35, pan });
}

/**
 * Гонг: инхармонические обертоны и долгое затухание.
 * Даёт ощущение огромного пространства, далеко за пределами видимого.
 */
function gong(env: AmbientEnv, freq: number, gain: number, pan = 0): void {
  const partials: Array<[number, number]> = [
    [1, 1],
    [2.0, 0.5],
    [2.76, 0.35],
    [5.4, 0.18],
  ];
  for (const [ratio, weight] of partials) {
    blip(env, { freq: freq * ratio, dur: 7 / ratio, gain: gain * weight, pan });
  }
}

/** Квакша: три низких хрипловатых выдоха. */
function croak(env: AmbientEnv, gain: number): void {
  const base = rnd(120, 160);
  for (let i = 0; i < 3; i++) {
    blip(env, { freq: base, endFreq: base * 0.7, dur: 0.22, gain, type: "square", at: i * 0.3, lowpass: 420, pan: rnd(-0.4, 0.4) });
  }
}

/** Треск костра: короткие разрывы шума, высокая полоса. */
const crackle = (env: AmbientEnv, gain: number) =>
  noiseShot(env, { type: "highpass", freq: 2200, q: 0.8, dur: 0.05, gain, pan: rnd(-0.8, 0.8) });

const ICE_BELLS = [1174.7, 1396.9, 880, 1046.5];

/**
 * Файлы из звукового пака TomMusic (public/music). Пути относительные: сборка идёт с base "./".
 * Проверяются тестом: каждый файл должен существовать.
 */
const PACK = "music/Free Fantasy SFX Pack By TomMusic/OGG Files/";
export const AMBIENT_SAMPLES = {
  forestRain: `${PACK}BGS Loops/Forest Night/Forest Night Rain.ogg`,
  cave: `${PACK}BGS Loops/Cave/Cave.ogg`,
  torch: `${PACK}SFX/Torch/Torch Loop.ogg`,
} as const;

const sampleCache = new Map<string, Promise<AudioBuffer | null>>();

/** Загружает и декодирует файл один раз. Ошибка сети или формата даёт null: сцена играет без него. */
function loadSample(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  let pending = sampleCache.get(url);
  if (!pending) {
    pending = fetch(encodeURI(url))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null);
    sampleCache.set(url, pending);
  }
  return pending;
}

/** Зацикленный файл из пака. Стартует, когда файл декодирован; если сцену уже сменили — не стартует. */
function loopSample(env: AmbientEnv, url: string, gain: number): void {
  const { ctx, out } = env;
  const g = ctx.createGain();
  g.gain.value = gain;
  g.connect(out);
  let stopped = false;
  let src: AudioBufferSourceNode | null = null;
  env.track(() => {
    stopped = true;
    if (src) {
      try {
        src.stop();
      } catch {
        /* уже остановлен */
      }
      src.disconnect();
    }
    g.disconnect();
  });
  void loadSample(ctx, url).then((buf) => {
    if (stopped || !buf) return;
    src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(g);
    // Случайная точка старта: два одинаковых файла не звучат синхронно.
    src.start(0, Math.random() * Math.max(0, buf.duration - 1));
  });
}

/**
 * Эхо каменного зала: сухой звук идёт как есть, а часть уходит в линию задержки
 * с затуханием в фильтре. Возвращает окружение, где out — вход эха.
 */
function withEcho(env: AmbientEnv, delayS: number, feedback: number, wet: number): AmbientEnv {
  const { ctx, out } = env;
  const input = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = delayS;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2200;
  const fb = ctx.createGain();
  fb.gain.value = feedback;
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet;
  input.connect(out);
  input.connect(delay);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(out);
  env.track(() => {
    [input, delay, damp, fb, wetGain].forEach((n) => n.disconnect());
  });
  return { ...env, out: input };
}

/** Уханье совы: две ноты, вторая ниже и длиннее. */
function owl(env: AmbientEnv): void {
  const f = rnd(380, 430);
  blip(env, { freq: f, endFreq: f * 0.93, dur: 0.45, gain: 0.02 });
  blip(env, { freq: f, endFreq: f * 0.9, dur: 0.7, gain: 0.018, at: 0.7 });
}

/**
 * Лапки мышей по каменным кирпичам: серия коротких сухих цоканий с затуханием,
 * иногда писк.
 */
function scurry(env: AmbientEnv): void {
  const steps = 4 + Math.floor(Math.random() * 5);
  let at = 0;
  for (let i = 0; i < steps; i++) {
    const gain = 0.024 * (1 - (i / steps) * 0.6);
    noiseShot(env, { type: "bandpass", freq: rnd(2600, 4200), q: 3, dur: 0.012, gain, at, pan: i % 2 ? 0.5 : -0.5 });
    at += rnd(0.09, 0.15);
  }
  if (Math.random() < 0.4) {
    const f = rnd(2800, 3600);
    blip(env, { freq: f, endFreq: f * 1.15, dur: 0.08, gain: 0.006, at: rnd(0, at), pan: rnd(-0.6, 0.6) });
  }
}

/**
 * Камушки осыпаются: сначала короткий шорох, затем каскад мелких «тиков»,
 * которые реже и тише с каждым ударом, пока камни не улягутся.
 */
function pebbles(env: AmbientEnv): void {
  const count = 2 + Math.floor(Math.random() * 3);
  noiseShot(env, { type: "bandpass", freq: rnd(1800, 3000), q: 2, dur: 0.05, gain: 0.02, pan: rnd(-0.5, 0.5) });
  let at = 0.05;
  let spacing = rnd(0.12, 0.2);
  for (let i = 0; i < count; i++) {
    at += spacing;
    spacing *= 0.7;
    const f = rnd(1000, 2600);
    blip(env, { freq: f, endFreq: f * 0.8, dur: 0.06, gain: 0.012 * (1 - i / count / 2), at, pan: rnd(-0.8, 0.8) });
  }
}

/** Параметры боевой сцены: тональность, темп и ритм барабана. */
interface BattleConfig {
  root: number;
  bpm: number;
  kick: number;
  notes: readonly number[];
  noteType: OscillatorType;
  noteGain: number;
  lowpass?: number;
  hats?: boolean;
  /** Характерные добавки биома поверх ритма. */
  extra?: (env: AmbientEnv) => void;
}

/**
 * Боевая сцена: пульсирующий дрон, барабан на каждую долю, перкуссия на 2 и 4,
 * остинато восьмыми. Характер меняется параметрами биома.
 */
function battleCore(env: AmbientEnv, cfg: BattleConfig): void {
  drone(env, cfg.root, "sine", 0.012, { swell: 1.5 });
  drone(env, cfg.root * 1.5, "triangle", 0.005, { lfoHz: 0.5 });
  clock(env, 60 / cfg.bpm / 2, (i, at) => {
    if (i % 4 === 0) thump(env, cfg.kick, 0.035, at);
    if (i % 4 === 2) noiseShot(env, { type: "bandpass", freq: 1800, q: 1.2, dur: 0.12, gain: 0.008, at });
    if (cfg.hats && i % 2 === 1) noiseShot(env, { type: "highpass", freq: 7000, dur: 0.03, gain: 0.003, at });
    blip(env, {
      freq: cfg.notes[i % cfg.notes.length],
      dur: 0.18,
      gain: cfg.noteGain,
      type: cfg.noteType,
      lowpass: cfg.lowpass,
      at,
    });
  });
  cfg.extra?.(env);
}

const BATTLE: Record<BiomeId, BattleConfig> = {
  // Классика: D-минор, маршевый ритм.
  classic: {
    root: 73.4,
    bpm: 112,
    kick: 55,
    notes: [146.8, 146.8, 174.6, 146.8, 220, 146.8, 130.8, 146.8],
    noteType: "sawtooth",
    noteGain: 0.006,
    lowpass: 700,
    extra: (env) => every(env, 22, 36, () => gong(env, 55, 0.02)),
  },
  // Болото: тяжёлый, вязкий ритм, пузыри и квакши.
  swamp: {
    root: 65.4,
    bpm: 92,
    kick: 46,
    notes: [116.5, 116.5, 138.6, 116.5, 174.6, 116.5, 103.8, 116.5],
    noteType: "sawtooth",
    noteGain: 0.005,
    lowpass: 420,
    extra: (env) => {
      every(env, 0.8, 2.5, () => bubble(env, 0.008));
      every(env, 9, 16, () => croak(env, 0.012));
    },
  },
  // Лёд: быстрые тарелки и высокие звоны-арпеджио.
  ice: {
    root: 55,
    bpm: 132,
    kick: 62,
    notes: [587.3, 880, 698.5, 880, 1174.7, 880, 698.5, 880],
    noteType: "sine",
    noteGain: 0.005,
    hats: true,
    extra: (env) => every(env, 4, 8, () => chime(env, pick(ICE_BELLS), 0.006, 2.5, rnd(-0.7, 0.7))),
  },
  // Тьма: медленный, злой пульс, глухое ворчание и шёпот.
  dark: {
    root: 36.7,
    bpm: 76,
    kick: 40,
    notes: [73.4, 73.4, 77.8, 73.4, 69.3, 73.4, 77.8, 73.4],
    noteType: "sawtooth",
    noteGain: 0.005,
    lowpass: 260,
    extra: (env) => every(env, 6, 10, () => noiseShot(env, { type: "bandpass", freq: 1100, q: 8, dur: 1.6, gain: 0.007, pan: rnd(-0.5, 0.5) })),
  },
  // Огонь: самый быстрый бой, треск и трескучие ударные.
  fire: {
    root: 73.4,
    bpm: 150,
    kick: 60,
    notes: [293.7, 293.7, 349.2, 293.7, 440, 293.7, 349.2, 523.3],
    noteType: "square",
    noteGain: 0.004,
    lowpass: 1200,
    hats: true,
    extra: (env) => every(env, 0.1, 0.5, () => crackle(env, 0.008)),
  },
};

/** Рецепты по сценам (экспорт для тестов: все сцены должны иметь рецепт). */
export const AMBIENT_RECIPES: Readonly<Record<AmbientScene, Recipe>> = {
  /**
   * Лагерь в лесу под дождём у костра: ночной лес с дождём из пака, треск костра
   * из пака и редкое уханье совы (синтез).
   */
  lobby(env) {
    loopSample(env, AMBIENT_SAMPLES.forestRain, 0.5);
    loopSample(env, AMBIENT_SAMPLES.torch, 0.3);
    every(env, 25, 45, () => owl(env));
  },

  /** Классический лабиринт: воздух пещеры из пака, капли с эхом, лапки мышей и камушки (синтез). */
  classic(env) {
    loopSample(env, AMBIENT_SAMPLES.cave, 0.35);
    const cave = withEcho(env, 0.37, 0.4, 0.5);
    every(cave, 1.5, 5, () => drip(cave, 0.03));
    every(env, 6, 14, () => scurry(env));
    every(env, 15, 30, () => pebbles(env));
  },

  /** Подземное болото: влажный шум, бульканье, квакши и глухой колокол. */
  swamp(env) {
    drone(env, 65.4, "sine", 0.016, { swell: 6 });
    drone(env, 98, "triangle", 0.006, { lfoHz: 0.11 });
    noiseBed(env, { type: "lowpass", freq: 320, q: 0.9, gain: 0.03, sweepHz: 0.09, sweepDepth: 100 });
    every(env, 1.2, 3.5, () => bubble(env, 0.01));
    every(env, 7, 14, () => croak(env, 0.014));
    every(env, 25, 40, () => chime(env, 116.5, 0.009, 6));
  },

  /** Ледяные просторы: порывы ветра, стеклянные звоны и холодный пэд. */
  ice(env) {
    drone(env, 55, "sine", 0.012, { swell: 8 });
    pad(env, [220, 293.7, 349.2], 0.002, { swell: 10, lfoHz: 0.03 });
    noiseBed(env, { type: "highpass", freq: 1400, q: 0.5, gain: 0.016, sweepHz: 0.04, sweepDepth: 500 });
    noiseBed(env, { type: "bandpass", freq: 3000, q: 2, gain: 0.003, sweepHz: 0.07, sweepDepth: 800 });
    every(env, 3, 7, () => chime(env, pick(ICE_BELLS), 0.007, 3, rnd(-0.7, 0.7)));
  },

  /** Тёмное подземелье: почти тихий саб-дрон, глухие удары сердца, шёпот и редкий гонг. */
  dark(env) {
    drone(env, 36.7, "sine", 0.04, { lfoHz: 0.1 });
    drone(env, 55, "sine", 0.008, { detune: 5, swell: 10 });
    every(env, 7, 10, () => {
      thump(env, 50, 0.03);
      thump(env, 46, 0.024, 0.35);
    });
    every(env, 10, 20, () => noiseShot(env, { type: "bandpass", freq: 1100, q: 8, dur: 1.8, gain: 0.009, pan: rnd(-0.5, 0.5) }));
    every(env, 16, 28, () => thump(env, 80, 0.02));
    every(env, 35, 50, () => gong(env, 73.4, 0.016));
  },

  /** Огненные недра: треск факела из пака, низкий гул, редкие вспышки искр и далёкий гонг. */
  fire(env) {
    loopSample(env, AMBIENT_SAMPLES.torch, 0.4);
    drone(env, 73.4, "triangle", 0.008, { swell: 5 });
    drone(env, 110, "triangle", 0.004, { lfoHz: 0.17 });
    every(env, 5, 10, () => noiseShot(env, { type: "highpass", freq: 900, q: 0.6, dur: 0.08, gain: 0.025 }));
    every(env, 40, 60, () => gong(env, 98, 0.014));
  },

  "battle-classic": (env) => battleCore(env, BATTLE.classic),
  "battle-swamp": (env) => battleCore(env, BATTLE.swamp),
  "battle-ice": (env) => battleCore(env, BATTLE.ice),
  "battle-dark": (env) => battleCore(env, BATTLE.dark),
  "battle-fire": (env) => battleCore(env, BATTLE.fire),
};

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
