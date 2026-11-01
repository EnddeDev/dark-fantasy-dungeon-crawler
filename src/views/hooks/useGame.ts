import { useState, useSyncExternalStore } from "react";
import { GameController } from "../../controllers/GameController";
import type { GameState } from "../../model/types";

/** Единая точка подписки View на Model. */
export function useGame(): { controller: GameController; state: GameState } {
  const [controller] = useState(() => GameController.fromBrowser());
  const state = useSyncExternalStore(controller.model.subscribe, controller.model.getSnapshot, controller.model.getSnapshot);
  return { controller, state };
}
