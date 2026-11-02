import { useEffect } from "react";
import { ambientSceneFor } from "../../audio/ambientScenes";
import { setAmbientScene } from "../../audio/ambientEngine";
import type { BiomeId } from "../../game/biomes";
import type { Screen } from "../../model/types";

/** Ведёт фоновый звук за экраном: лобби и биом текущего подземелья. */
export function useAmbient(screen: Screen, biome: BiomeId | null) {
  const scene = ambientSceneFor(screen, biome);
  useEffect(() => {
    setAmbientScene(scene);
  }, [scene]);
}
