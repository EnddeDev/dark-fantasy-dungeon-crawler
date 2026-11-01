export type StepEvent = "quiet" | "find";

/**
 * Пустая клетка больше не бросает кубик на бой или ловушку: монстры и ловушки
 * стоят на карте с самого начала. Здесь остаётся только мелкая находка —
 * 10% на ещё не пройденной клетке и никогда на знакомом пути.
 */
export function rollStepEvent(known: boolean, roll = Math.random()): StepEvent {
  if (known) return "quiet";
  return roll < 0.9 ? "quiet" : "find";
}
