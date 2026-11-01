/**
 * Рост характеристик врагов по уровням.
 *
 * Каждый переход к следующему уровню умножает ОЗ, урон и броню на свой шаг:
 * шаг = 1.25 − 0.02 × уровень монстра, но не ниже ×1.05.
 * Уровень 1 → ×1.23, уровень 2 → ×1.21, … уровень 10 → ×1.05.
 * Число ходов (AP) не масштабируется.
 */
export const ENEMY_STEP_BASE = 1.25;
export const ENEMY_STEP_PER_LEVEL = 0.02;
export const ENEMY_MIN_STEP_MULT = 1.05;

/** Множитель отдельного перехода (level−1)→level. Для level ≤ 1 равен 1. */
export function enemyLevelStepMult(level: number): number {
  const target = Math.max(1, Math.floor(level));
  if (target <= 1) return 1;
  const raw = ENEMY_STEP_BASE - ENEMY_STEP_PER_LEVEL * target;
  return Math.max(ENEMY_MIN_STEP_MULT, Math.round(raw * 100) / 100);
}

/** Накопленный множитель характеристик относительно 1-го уровня. */
export function enemyLevelMult(level: number): number {
  const target = Math.floor(level);
  if (target <= 0) return 1 / Math.max(ENEMY_MIN_STEP_MULT, ENEMY_STEP_BASE - ENEMY_STEP_PER_LEVEL);
  let mult = 1;
  for (let l = 2; l <= target; l++) mult *= enemyLevelStepMult(l);
  return mult;
}

export function enemyScalingLabel(level: number): string {
  return `×${enemyLevelStepMult(level).toFixed(2)}`;
}

/**
 * Множитель опыта за уровень: чем выше герой относительно монстра,
 * тем меньше опыта (и наоборот). Равные уровни — ×1.
 * Пример: герой 2 уровня за монстра 1 уровня получает вдвое меньше.
 */
export function xpLevelMult(playerLevel: number, monsterLevel: number): number {
  const p = Math.max(1, Math.floor(playerLevel));
  const m = Math.max(1, Math.floor(monsterLevel));
  return m / p;
}

/** Опыт за монстра с учётом разницы уровней. Никогда не меньше 1. */
export function scaledEnemyXp(baseXp: number, playerLevel: number, monsterLevel: number): number {
  return Math.max(1, Math.round(baseXp * xpLevelMult(playerLevel, monsterLevel)));
}
