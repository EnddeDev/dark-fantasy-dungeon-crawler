export type StepEvent = "quiet" | "trap" | "fight" | "find";

/** На известной клетке 10% бой, остальные 90% — ничего. Новая клетка сохраняет прежнюю таблицу. */
export function rollStepEvent(known: boolean, roll = Math.random()): StepEvent {
  if (known) {
    return roll < 0.9 ? "quiet" : "fight";
  }

  if (roll < 0.6) return "quiet";
  if (roll < 0.7) return "trap";
  if (roll < 0.9) return "fight";
  // Недостающие до 100% 10%: небольшая находка, а не дополнительная ловушка.
  return "find";
}