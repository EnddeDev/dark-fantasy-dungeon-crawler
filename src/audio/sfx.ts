import { loadSample, sfxOutput } from "./ambientEngine";

/**
 * Звуки действий. Все файлы берутся из звукового пака TomMusic (public/music).
 * Вызывается из контроллеров только при успешном действии; без Web Audio ничего не делает.
 */

const SFX_DIR = "music/Free Fantasy SFX Pack By TomMusic/OGG Files/SFX/";

export const SFX_SAMPLES = {
  chest: [`${SFX_DIR}Doors Gates and Chests/Chest Open 1.ogg`, `${SFX_DIR}Doors Gates and Chests/Chest Open 2.ogg`],
  equip: [`${SFX_DIR}Attacks/Sword Attacks Hits and Blocks/Sword Unsheath 1.ogg`, `${SFX_DIR}Attacks/Sword Attacks Hits and Blocks/Sword Unsheath 2.ogg`],
  unequip: [`${SFX_DIR}Attacks/Sword Attacks Hits and Blocks/Sword Sheath 1.ogg`, `${SFX_DIR}Attacks/Sword Attacks Hits and Blocks/Sword Sheath 2.ogg`],
  /** Покупка и продажа — ворота: открылись и закрылись. */
  buy: [`${SFX_DIR}Doors Gates and Chests/Gate Open.ogg`],
  sell: [`${SFX_DIR}Doors Gates and Chests/Gate Close.ogg`],
  /** Дверь открыта ключом или отмычкой. */
  door: [`${SFX_DIR}Doors Gates and Chests/Door Open 2.ogg`],
  /** Кузница: улучшение не удалось и удалось. */
  forgeFail: [`${SFX_DIR}Chopping and Mining/mine 4.ogg`],
  forgeSuccess: [`${SFX_DIR}Attacks/Sword Attacks Hits and Blocks/Sword Blocked 3.ogg`],
} as const;

export type SfxName = keyof typeof SFX_SAMPLES;

const SAMPLE_LEVEL = 0.6;

export function playSfx(name: SfxName): void {
  const output = sfxOutput();
  if (!output) return;
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
