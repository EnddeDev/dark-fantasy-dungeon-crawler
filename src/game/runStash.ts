/**
 * Рюкзак перед походом и во время него.
 *
 * Перед выходом в подземелье рюкзак лобби делится на три части:
 * - сумка и спец. предметы (бурдюк, факел, отмычки, карта, сапёрный набор) идут сами;
 * - выбранное в окне «Отправиться» тоже идёт с героем;
 * - остальное остаётся в рюкзаке лобби (`run.lobbyBag`) и вернётся при выходе.
 *
 * Найденное за вылазку попадает в рюкзак героя (это и есть временный рюкзак вылазки).
 * При поражении теряется всё взятое в вылазку, кроме сумки и спец. предметов.
 */
import { ITEMS } from "./content";
import { pouchIds } from "./pouch";
import type { Player, Run } from "./types";

export type BagCounts = Record<string, number>;

/** Счётчики предметов по списку ids. */
export function countsOf(ids: string[]): BagCounts {
  const out: BagCounts = {};
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** Складывает два набора предметов; пустые позиции не остаются. */
export function bagMerge(a: BagCounts = {}, b: BagCounts = {}): BagCounts {
  const out: BagCounts = { ...a };
  for (const [id, n] of Object.entries(b)) {
    if (n > 0) out[id] = (out[id] ?? 0) + n;
  }
  return out;
}

/** Идёт с героем без выбора: всё из сумки и спец. предметы из рюкзака. */
export function autoCarriedBag(player: Pick<Player, "bag" | "pouch">): BagCounts {
  const out: BagCounts = {};
  const pouched = new Set(pouchIds(player));
  for (const [id, n] of Object.entries(player.bag)) {
    if (n <= 0) continue;
    const special = ITEMS[id]?.kind === "special";
    if (pouched.has(id) || special) out[id] = n;
  }
  return out;
}

/**
 * Делит рюкзак на то, что уходит в поход (`carried`), то, что остаётся в лобби (`lobby`),
 * и то, что идёт без выбора (`kept`). Выбранное не может превышать запас и не дублирует автоматическое.
 */
export function departureSplit(
  player: Pick<Player, "bag" | "pouch">,
  picked: BagCounts = {},
): { carried: BagCounts; lobby: BagCounts; kept: BagCounts } {
  const kept = autoCarriedBag(player);
  const carried: BagCounts = { ...kept };
  for (const [id, want] of Object.entries(picked)) {
    const have = player.bag[id] ?? 0;
    if (kept[id] !== undefined || have <= 0) continue;
    const take = Math.min(Math.floor(want), have);
    if (take > 0) carried[id] = take;
  }
  const lobby: BagCounts = {};
  for (const [id, n] of Object.entries(player.bag)) {
    const left = n - (carried[id] ?? 0);
    if (left > 0) lobby[id] = left;
  }
  return { carried, lobby, kept };
}

/** Сумка и спец. предметы, которые были с героем на старте похода (для поражения). */
export function keptBagOf(run: Pick<Run, "keptBag" | "loot">, working: BagCounts): BagCounts {
  if (run.keptBag) return run.keptBag;
  /* Походы без поля: всё, кроме найденного за вылазку, пришло с героем. */
  const found = countsOf(run.loot);
  const out: BagCounts = {};
  for (const [id, n] of Object.entries(working)) {
    const left = n - (found[id] ?? 0);
    if (left > 0) out[id] = left;
  }
  return out;
}

/** Рюкзак после поражения: рюкзак лобби плюс то, что осталось из сумки и спец. предметов. */
export function bagAfterDeath(working: BagCounts, run: Pick<Run, "keptBag" | "lobbyBag" | "loot">): BagCounts {
  const kept = keptBagOf(run, working);
  const survived: BagCounts = {};
  for (const [id, n] of Object.entries(kept)) {
    const left = Math.min(working[id] ?? 0, n);
    if (left > 0) survived[id] = left;
  }
  return bagMerge(run.lobbyBag ?? {}, survived);
}

/** Рюкзак после выхода живым: рабочий рюкзак плюс оставленное в лобби. */
export function bagAfterReturn(working: BagCounts, run: Pick<Run, "lobbyBag">): BagCounts {
  return bagMerge(working, run.lobbyBag ?? {});
}
