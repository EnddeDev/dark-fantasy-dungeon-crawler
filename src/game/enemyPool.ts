import { ENEMIES, type EnemyDef } from "./content";

/**
 * Случайный вид обычного монстра этажа: вес падает с ростом разницы между этажом и минимальным этажом вида.
 * Вынесено из battle.ts, чтобы карта могла заранее задать вид монстра на клетке.
 */
export function rollEnemy(floor: number, rng: () => number = Math.random): EnemyDef {
  const pool = ENEMIES.filter((e) => e.minFloor <= floor);
  const weights = pool.map((e) => 1 / (1 + (floor - e.minFloor) * 0.55));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1] ?? ENEMIES[0];
}
