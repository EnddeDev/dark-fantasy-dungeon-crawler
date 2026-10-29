export type StepEvent = "quiet" | "trap" | "fight" | "find";

/** На известном пути ловушки реже, враги по-прежнему появляются в 20% случаев. */
export function rollStepEvent(known: boolean, roll = Math.random()): StepEvent {
  if (known) {
    if (roll < 0.75) return "quiet";
    if (roll < 0.8) return "trap";
    return "fight";
  }

  if (roll < 0.6) return "quiet";
  if (roll < 0.7) return "trap";
  if (roll < 0.9) return "fight";
  // Недостающие до 100% 10%: небольшая находка, а не дополнительная ловушка.
  return "find";
}