/**
 * Потери добычи вылазки (доля найденного: золото, расходники, трофейное снаряжение).
 *
 * Этажи 1–2: побег с карты без потерь, смерть −30%, побег из боя −10%.
 * Этажи 3+: побег с карты зависит от зачистки. В начале этажа −90%, после зачистки
 * (кроме босса) −0%; с каждым убитым монстром линейно. Смерть = побег + 20%, но не выше 100%.
 * Побег из боя −10% на любом этаже. Победа над боссом снимает потери при побеге с карты.
 */
import type { Run } from "./types";

/** Последний этаж с простыми правилами. */
export const SIMPLE_LOSS_MAX_FLOOR = 2;
/** Смерть на этажах 1–2. */
export const SIMPLE_DEATH_LOSS_RATE = 0.3;
/** Побег из боя: одинаковый на всех этажах. */
export const FLEE_BATTLE_LOSS_RATE = 0.1;
/** Побег с карты в начале этажа 3+. */
const ESCAPE_START_RATE = 0.9;
/** Смерть сверх побега с карты. */
const DEATH_OVER_ESCAPE = 0.2;

/** Доля зачистки этажа от 0 до 1: убитые монстры (без босса) к их общему числу. */
export function clearProgress(run: Pick<Run, "clearedMonsters" | "maze">): number {
  const monsters = run.maze.monsters;
  if (monsters.length <= 0) return 1;
  const killed = (run.clearedMonsters ?? []).filter((cell) => monsters.includes(cell)).length;
  return Math.min(1, killed / monsters.length);
}

/** Доля добычи, которая уходит при побеге с карты. */
export function escapeLossRate(run: Pick<Run, "clearedMonsters" | "maze" | "floor" | "bossSlain">): number {
  if (run.floor <= SIMPLE_LOSS_MAX_FLOOR) return 0;
  if (run.bossSlain || run.maze.bossDefeated) return 0;
  return ESCAPE_START_RATE * (1 - clearProgress(run));
}

/** Доля добычи, которая уходит при смерти в подземелье. */
export function deathLossRate(run: Pick<Run, "clearedMonsters" | "maze" | "floor" | "bossSlain">): number {
  if (run.floor <= SIMPLE_LOSS_MAX_FLOOR) return SIMPLE_DEATH_LOSS_RATE;
  return Math.min(1, escapeLossRate(run) + DEATH_OVER_ESCAPE);
}
