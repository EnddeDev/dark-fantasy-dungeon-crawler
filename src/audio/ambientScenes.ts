import { BIOME_ORDER, type BiomeId } from "../game/biomes";
import type { Screen } from "../model/types";

/**
 * Таблица фоновых сцен и настроек громкости. Чистая логика без DOM: её проверяют тесты в Node.
 * Звук синтезируется в браузере (ambientEngine.ts) или играет из звукового пака, файлы — в public/music.
 */

/** Боевая сцена биома: динамичнее исследования, с ритмом и тем же характером места. */
export type BattleScene = `battle-${BiomeId}`;
/**
 * Фон исследования подземелья. Классический лабиринт без фона: там звучит только музыка «Forest»,
 * поэтому его сцены нет.
 */
export type DungeonScene = Exclude<BiomeId, "classic">;
export type AmbientScene = "lobby" | DungeonScene | BattleScene;

const DUNGEON_SCENES = BIOME_ORDER.filter((b): b is DungeonScene => b !== "classic");

/** Все сцены: лобби, исследование биомов (кроме классики) и бой в каждом биоме. */
export const AMBIENT_SCENES: readonly AmbientScene[] = [
  "lobby",
  ...DUNGEON_SCENES,
  ...BIOME_ORDER.map((b): BattleScene => `battle-${b}`),
];

/** Музыкальные дорожки (отдельный слой, не привязан к сценам фона). */
export type MusicTrackId = "lobby" | "forest";

/**
 * Какая сцена звучит на экране.
 * Титул — тишина; лобби — своя сцена; подземелье — сцена биома (классика — тишина); бой — боевая сцена биома.
 */
export function ambientSceneFor(screen: Screen, biome: BiomeId | null | undefined): AmbientScene | null {
  if (screen === "lobby") return "lobby";
  if (!biome || !BIOME_ORDER.includes(biome)) return null;
  if (screen === "dungeon") return biome === "classic" ? null : biome;
  if (screen === "battle") return `battle-${biome}`;
  return null;
}

/**
 * Музыкальная дорожка экрана: отдельный слой, звучит поверх фона и эффектов.
 * Лобби — «Witchcraft»; классическое подземелье — «Forest». В бою и в других биомах музыки нет.
 */
export function musicTrackFor(screen: Screen, biome?: BiomeId | null): MusicTrackId | null {
  if (screen === "lobby") return "lobby";
  if (screen === "dungeon" && biome === "classic") return "forest";
  return null;
}

/* ─────────────  ГРОМКОСТЬ  ───────────── */

/** Проценты 0–100. Ключи localStorage: звуки (фон и эффекты) и музыка. */
export const SOUND_VOLUME_KEY = "dungeon-volume-sound";
export const MUSIC_VOLUME_KEY = "dungeon-volume-music";
/** Прежний выключатель звука: значение "off" переносится в громкость звуков 0. */
export const AMBIENT_STORAGE_KEY = "dungeon-ambient";
export const DEFAULT_SOUND_VOLUME = 100;
export const DEFAULT_MUSIC_VOLUME = 60;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function readVolume(storage: StorageLike | null | undefined, key: string, fallback: number): number {
  try {
    const raw = storage?.getItem(key);
    if (raw === null || raw === undefined || raw.trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? clampVolume(n) : fallback;
  } catch {
    return fallback;
  }
}

export function readSoundVolume(storage: StorageLike | null | undefined): number {
  let legacyOff = false;
  try {
    legacyOff = storage?.getItem(AMBIENT_STORAGE_KEY) === "off";
  } catch {
    legacyOff = false;
  }
  const stored = readVolume(storage, SOUND_VOLUME_KEY, -1);
  if (stored >= 0) return stored;
  return legacyOff ? 0 : DEFAULT_SOUND_VOLUME;
}

export function readMusicVolume(storage: StorageLike | null | undefined): number {
  return readVolume(storage, MUSIC_VOLUME_KEY, DEFAULT_MUSIC_VOLUME);
}

export function writeVolume(storage: StorageLike | null | undefined, key: string, value: number): void {
  try {
    storage?.setItem(key, String(clampVolume(value)));
  } catch {
    /* хранилище недоступно: громкость действует до перезагрузки */
  }
}
