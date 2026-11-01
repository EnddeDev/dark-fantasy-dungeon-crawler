import { useEffect } from "react";
import type { GameController } from "../../controllers/GameController";
import { cellIdx } from "../../game/maze";
import type { GameState } from "../../model/types";

const KEY_DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  ц: [0, -1],
  ы: [0, 1],
  ф: [-1, 0],
  в: [1, 0],
};

/** Клавиатура и автопоход остаются адаптерами ввода во View. */
export function useDungeonInput(controller: GameController, state: GameState): void {
  const { screen, modal, run, battle, path, pathPaused } = state;

  useEffect(() => {
    if (screen !== "dungeon") return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const dir = KEY_DIRS[k];
      if (!dir) return;
      e.preventDefault();
      controller.dungeon.move(dir[0], dir[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller, screen, modal, run]);

  useEffect(() => {
    if (path.length === 0) {
      if (pathPaused) controller.model.update({ pathPaused: false });
      return;
    }
    if (screen !== "dungeon" || !run) {
      controller.model.setPath([], false);
      return;
    }
    if (modal || battle) {
      if (!pathPaused) controller.model.update({ pathPaused: true });
      return;
    }
    if (pathPaused) return;
    const target = path[0];
    const dx = target.x - run.pos.x;
    const dy = target.y - run.pos.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) {
      controller.model.setPath([], false);
      return;
    }
    const id = cellIdx(target.x, target.y, run.maze.size);
    const closedDoor = run.maze.doors.includes(id) && !run.maze.openedDoors.includes(id);
    if (closedDoor) {
      controller.model.update({ pathPaused: true });
      controller.dungeon.move(dx, dy, true);
      return;
    }
    /* Ловушки видны заранее: маршрут останавливается перед ними, а не наступает. */
    const trapAhead = run.maze.traps.includes(id) && !(run.sprungTraps ?? []).includes(id);
    if (trapAhead) {
      controller.model.update({ pathPaused: true });
      controller.model.logRun("Впереди ловушка — маршрут остановлен. Реши, как поступить с механизмом.");
      return;
    }
    const t = window.setTimeout(() => {
      controller.dungeon.move(dx, dy, true);
      controller.model.setPath(path.slice(1), false);
    }, 110);
    return () => window.clearTimeout(t);
  }, [controller, path, pathPaused, screen, modal, battle, run]);
}
