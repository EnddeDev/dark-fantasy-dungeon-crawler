/**
 * Рост характеристик врагов по уровням.
 *
 * Каждый переход к следующему уровню умножает ОЗ, урон и броню на свой шаг:
 * 1→2 = ×1.50, 2→3 = ×1.45, 3→4 = ×1.40 … Шаг уменьшается на 0.05,
 * но никогда не опускается ниже ×1.05. Число ходов (AP) не масштабируется.
 */
export const ENEMY_FIRST_STEP_MULT = 1.5;
export const ENEMY_STEP_DECAY = 0.05;
export const ENEMY_MIN_STEP_MULT = 1.05;

/** Множитель отдельного перехода (level−1)→level. Для level ≤ 1 равен 1. */
export function enemyLevelStepMult(level: number): number {
  const target = Math.max(1, Math.floor(level));
  if (target <= 1) return 1;
  const raw = ENEMY_FIRST_STEP_MULT - ENEMY_STEP_DECAY * (target - 2);
  return Math.max(ENEMY_MIN_STEP_MULT, Math.round(raw * 100) / 100);
}

/** Накопленный множитель характеристик относительно 1-го уровня. */
export function enemyLevelMult(level: number): number {
  const target = Math.floor(level);
  if (target <= 0) return 1 / ENEMY_FIRST_STEP_MULT;
  let mult = 1;
  for (let l = 2; l <= target; l++) mult *= enemyLevelStepMult(l);
  return mult;
}

export function enemyScalingLabel(level: number): string {
  return `×${enemyLevelStepMult(level).toFixed(2)}`;
}
