/**
 * Учёт добычи вылазки.
 *
 * `run.loot` — список того, что герой нашёл за вылазку. Предметы попадают в
 * сумку сразу, а список нужен для отчёта и для штрафа при поражении/побеге.
 * Если герой потратил найденное (выпил зелье, сломал отмычку), запись из
 * списка нужно убрать — иначе штраф спишет уже потраченное из личного запаса.
 */

/** Убирает из списка найденного столько позиций, сколько герой израсходовал. */
export function pruneRunLoot(loot: string[], used: Record<string, number>): string[] {
  const left = { ...used };
  if (!Object.values(left).some((count) => count > 0)) return loot;
  return loot.filter((id) => {
    if ((left[id] ?? 0) > 0) {
      left[id] -= 1;
      return false;
    }
    return true;
  });
}

/** Что убыло из сумки между двумя состояниями: использовано, потрачено, выброшено. */
export function usedFromBags(
  before: Record<string, number> = {},
  after: Record<string, number> = {},
): Record<string, number> {
  const used: Record<string, number> = {};
  for (const id of Object.keys(before)) {
    const diff = (before[id] ?? 0) - (after[id] ?? 0);
    if (diff > 0) used[id] = diff;
  }
  return used;
}
