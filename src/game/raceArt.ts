import { ENEMIES } from "./content";
import type { Threat } from "./types";

/**
 * Картины по расам: одна картина на расу и на тип угрозы (обычный, ужас, катастрофа).
 * Все обычные монстры расы и типа показываются одной картиной; боссы — свои портреты.
 * Файлы: public/images/races/<раса>-<угроза>.jpg.
 */
export const RACE_ART_THREATS: readonly Threat[] = ["normal", "horror", "catastrophe"];

export function raceArtSrc(race: string, threat: Threat): string {
  return `images/races/${race}-${threat}.jpg`;
}

/** Картина монстра по его виду и угрозе; для боссов и неизвестных видов — null. */
export function monsterRaceArtSrc(enemyId: string, threat: Threat): string | null {
  const def = ENEMIES.find((e) => e.id === enemyId);
  return def ? raceArtSrc(def.race, threat) : null;
}
