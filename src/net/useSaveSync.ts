import { useEffect, useRef } from "react";
import type { GameController } from "../controllers/GameController";
import { checkpointOf, type Checkpoint } from "../game/runCheckpoint";
import { withoutRemovedShopLines } from "../game/quests";
import type { OnlineSession } from "./online";
import type { OnlineProfile } from "./protocol";

/** Задержка сохранения после последнего изменения: не чаще одного запроса на серию действий. */
const SAVE_DELAY_MS = 800;
/** Строк журнала похода в сохранении: хватает для просмотра, а запрос при уходе со страницы остаётся небольшим. */
const SAVED_LOG_LINES = 200;

/** Карта для отправки: журнал обрезан до последних строк (сервер принимает больше). */
function wireRun(run: Checkpoint["run"]): Checkpoint["run"] {
  return run ? { ...run, log: run.log.slice(-SAVED_LOG_LINES) } : null;
}

/**
 * Синхронизация прогресса: сервер — источник правды для аккаунта.
 * Сохраняется герой и карта похода (если герой на карте). Во время боя точка — состояние героя
 * из боя и открытый бой: вход возвращает на ту же карту, к той же клетке, и бой начинается заново.
 */
export function useSaveSync(controller: GameController, online: OnlineSession): void {
  const appliedProfile = useRef<OnlineProfile | null>(null);
  const lastPayload = useRef<string>("");
  /** Последняя точка (лобби, карта или открытый бой): её и отправляем. */
  const latest = useRef<Checkpoint | null>(null);

  useEffect(() => {
    const profile = online.profile;
    if (online.status !== "online" || !profile?.player) {
      appliedProfile.current = null;
      return;
    }
    if (appliedProfile.current === profile) return;
    appliedProfile.current = profile;
    /* Старое сохранение могло хранить снятые с игры товары витрин: в модель их не берём. */
    const player = profile.player.questLog
      ? { ...profile.player, questLog: withoutRemovedShopLines(profile.player.questLog) }
      : profile.player;
    const state = controller.model.getSnapshot();
    const progress = {
      best: Math.max(profile.bestFloor, state.best),
      unlockedFloor: Math.max(profile.unlockedFloor, state.unlockedFloor),
    };
    if (profile.run) {
      /* Герой вышел на карте: возвращаем на ту же карту, с тем же героем и в ту же клетку. */
      controller.model.update({
        ...progress,
        player,
        run: profile.run,
        screen: "dungeon",
        battle: null,
        modal: null,
        path: [],
        pathPaused: false,
      });
      /* Бой был открыт при выходе: начинается заново с сохранённым здоровьем и эффектами. */
      controller.dungeon.resumeFight();
    } else {
      controller.model.update({ ...progress, player });
    }
  }, [controller, online.status, online.profile]);

  useEffect(() => {
    if (online.status !== "online") return;
    let timer: number | undefined;

    const track = () => {
      const cp = checkpointOf(controller.model.getSnapshot());
      if (cp) latest.current = cp;
    };
    const payloadOf = (cp: Checkpoint) => {
      const state = controller.model.getSnapshot();
      return JSON.stringify({ p: cp.player, r: cp.run, b: state.best, u: state.unlockedFloor });
    };

    const push = async () => {
      const cp = latest.current;
      if (!cp) return;
      const payload = payloadOf(cp);
      if (payload === lastPayload.current) return;
      lastPayload.current = payload;
      const state = controller.model.getSnapshot();
      try {
        await online.api.save(cp.player, state.unlockedFloor, state.best, wireRun(cp.run));
      } catch {
        lastPayload.current = "";
      }
    };

    /* Уход со страницы: отправляем последнюю точку, запрос переживает закрытие вкладки. */
    const onLeave = () => {
      const cp = latest.current;
      if (!cp) return;
      const payload = payloadOf(cp);
      if (payload === lastPayload.current) return;
      lastPayload.current = payload;
      const state = controller.model.getSnapshot();
      online.api.save(cp.player, state.unlockedFloor, state.best, wireRun(cp.run), true).catch(() => {
        lastPayload.current = "";
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onLeave();
    };

    const unsubscribe = controller.model.subscribe(() => {
      /* Микрозадача: бой и смена экрана, сделанные в одном действии, уже видны при выборе точки. */
      queueMicrotask(track);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void push(), SAVE_DELAY_MS);
    });
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    track();
    void push();
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [controller, online]);
}
