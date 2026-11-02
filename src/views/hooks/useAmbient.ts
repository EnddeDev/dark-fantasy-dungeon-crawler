import { useEffect } from "react";
import { ambientSceneFor, musicTrackFor } from "../../audio/ambientScenes";
import { setAmbientScene, setMusicTrack } from "../../audio/ambientEngine";
import type { BiomeId } from "../../game/biomes";
import type { Screen } from "../../model/types";

/** Ведёт звук за экраном: фон лобби и биома текущего подземелья, а также музыкальную дорожку экрана. */
export function useAmbient(screen: Screen, biome: BiomeId | null) {
  const scene = ambientSceneFor(screen, biome);
  const track = musicTrackFor(screen, biome);
  useEffect(() => {
    setAmbientScene(scene);
  }, [scene]);
  useEffect(() => {
    setMusicTrack(track);
  }, [track]);
}
