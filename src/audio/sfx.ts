import { loadSample, sfxOutput } from "./ambientEngine";

/**
 * Звуки действий: открытие сундука, надевание и снятие снаряжения, покупка и продажа.
 * Файлы берутся из звукового пака TomMusic (public/music). Монеты синтезируются: в паке их нет.
 * Вызывается из контроллеров только при успешном действии; без Web Audio ничего не делает.
 */

const SFX_DIR = "music/Free Fantasy SFX Pack By TomMusic/OGG Files/SFX/";

export const SFX_SAMPLES = {
  chest: [`${SFX_DIR}Doors Gates and Chests/Chest Open 1.ogg`, `${SFX_DIR}Doors Gates and Chests/Chest Open 2.ogg`],
  equip: [`${SFX_DIR}Attacks/Sword Attacks Hits and Blocks/Sword Unsheath 1.ogg`, `${SFX_DIR}Attacks/Sword Attacks Hits and Blocks/Sword Unsheath 2.ogg`],
  unequip: [`${SFX_DIR}Attacks/Sword Attacks Hits and Blocks/Sword Sheath 1.ogg`, `${SFX_DIR}Attacks/Sword Attacks Hits and Blocks/Sword Sheath 2.ogg`],
} as const;

export type SfxName = "chest" | "equip" | "unequip" | "buy" | "sell";

const SAMPLE_LEVEL = 0.6;

/** Три монеты подряд: при покупке звенят вверх, при продаже — вниз. */
function coins(ctx: AudioContext, out: AudioNode, rising: boolean): void {
  const freqs = rising ? [2093, 2637, 3136] : [3136, 2637, 2093];
  const t0 = ctx.currentTime;
  freqs.forEach((f, i) => {
    const t = t0 + i * 0.07;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.22);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  });
}

export function playSfx(name: SfxName): void {
  const output = sfxOutput();
  if (!output) return;
  if (name === "buy" || name === "sell") {
    coins(output.ctx, output.out, name === "buy");
    return;
  }
  const files = SFX_SAMPLES[name];
  const url = files[Math.floor(Math.random() * files.length)];
  void loadSample(output.ctx, url).then((buf) => {
    if (!buf) return;
    const src = output.ctx.createBufferSource();
    src.buffer = buf;
    const g = output.ctx.createGain();
    g.gain.value = SAMPLE_LEVEL;
    src.connect(g);
    g.connect(output.out);
    src.start();
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  });
}
