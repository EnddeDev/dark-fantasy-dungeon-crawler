import { BIOME_ORDER, type BiomeId } from "../game/biomes";
import type { Screen } from "../model/types";

/**
 * Таблица фоновых сцен. Чистая логика без DOM: её проверяют тесты в Node.
 * Звук синтезируется в браузере (ambientEngine.ts), файлов нет.
 */
export type AmbientScene = "lobby" | BiomeId;

/** Все сцены: лобби и по одной на каждый биом подземелья. */
export const AMBIENT_SCENES: readonly AmbientScene[] = ["lobby", ...BIOME_ORDER];

/** Ключ localStorage: значение "off" — звук выключен, иначе включен. */
export const AMBIENT_STORAGE_KEY = "dungeon-ambient";

/**
 * Какая сцена звучит на экране.
 * Титул — тишина; лобби — своя сцена; подземелье и бой — сцена биома текущего подземелья.
 */
export function ambientSceneFor(screen: Screen, biome: BiomeId | null | undefined): AmbientScene | null {
  if (screen === "lobby") return "lobby";
  if ((screen === "dungeon" || screen === "battle") && biome && BIOME_ORDER.includes(biome)) return biome;
  return null;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function readAmbientMuted(storage: StorageLike | null | undefined): boolean {
  try {
    return storage?.getItem(AMBIENT_STORAGE_KEY) === "off";
  } catch {
    return false;
  }
}

export function writeAmbientMuted(storage: StorageLike | null | undefined, muted: boolean): void {
  try {
    storage?.setItem(AMBIENT_STORAGE_KEY, muted ? "off" : "on");
  } catch {
    /* хранилище недоступно: звук работает до перезагрузки */
  }
}
