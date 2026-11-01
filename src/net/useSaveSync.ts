import { useEffect, useRef } from "react";
import type { GameController } from "../controllers/GameController";
import type { OnlineSession } from "./online";
import type { OnlineProfile } from "./protocol";

/**
 * Синхронизация прогресса: сервер — источник правды для аккаунта,
 * поэтому сохранение уходит в БД, как только игрок снова оказывается в лобби.
 */
export function useSaveSync(controller: GameController, online: OnlineSession): void {
  const appliedProfile = useRef<OnlineProfile | null>(null);
  const lastPayload = useRef<string>("");

  useEffect(() => {
    const profile = online.profile;
    if (online.status !== "online" || !profile?.player) {
      appliedProfile.current = null;
      return;
    }
    if (appliedProfile.current === profile) return;
    appliedProfile.current = profile;
    const state = controller.model.getSnapshot();
    controller.model.update({
      player: profile.player,
      best: Math.max(profile.bestFloor, state.best),
      unlockedFloor: Math.max(profile.unlockedFloor, state.unlockedFloor),
    });
  }, [controller, online.status, online.profile]);

  useEffect(() => {
    if (online.status !== "online") return;
    let timer: number | undefined;

    const push = async () => {
      const state = controller.model.getSnapshot();
      if (state.screen === "dungeon" || state.screen === "battle" || state.run || state.battle) return;
      const payload = JSON.stringify({ p: state.player, b: state.best, u: state.unlockedFloor });
      if (payload === lastPayload.current) return;
      lastPayload.current = payload;
      try {
        await online.api.save(state.player, state.unlockedFloor, state.best);
      } catch {
        lastPayload.current = "";
      }
    };

    const unsubscribe = controller.model.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void push(), 800);
    });
    void push();
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [controller, online]);
}
