/**
 * Сумка: постоянный элемент героя на пять слотов под зелья, свитки и расходники.
 * Снаряжается до входа в подземелье и меняется из рюкзака вне боя.
 * В бою предмет из сумки не тратит выносливость.
 */
import type { Player } from "./types";
import { ITEMS } from "./content";

export const POUCH_SLOTS = 5;

/** Виды, которые кладутся в сумку: зелья, свитки и метательные расходники. Реагенты — нет. */
export const POUCH_KINDS: readonly string[] = ["potion", "scroll", "throwable"];

/** Спец. предметы, которые можно положить в сумку: бурдюк и факел. Остальные спец. предметы — нет. */
export const POUCH_SPECIAL_IDS: readonly string[] = ["water_skin", "field_torch"];

/** Можно ли положить предмет в сумку. */
export function canPouch(id: string | null | undefined): boolean {
  const def = id ? ITEMS[id] : undefined;
  if (!def || !id) return false;
  return POUCH_KINDS.includes(def.kind) || POUCH_SPECIAL_IDS.includes(id);
}

/** Можно ли применить предмет из сумки в бою. Факел работает только на карте. */
export function usableFromPouchInBattle(id: string): boolean {
  const def = ITEMS[id];
  if (!def?.use) return false;
  if (def.kind === "special") return def.use.type === "special_water";
  return def.kind !== "reagent";
}

/** Фильтр выборки в слот: зелья, расходники, свитки или спец. предметы (бурдюк и факел). */
export type PouchCategory = "potion" | "throwable" | "scroll" | "special";

/** Категория предмета для фильтра выборки; null — в сумку не кладётся. */
export function pouchCategoryOf(id: string | null | undefined): PouchCategory | null {
  if (!id || !canPouch(id)) return null;
  if (POUCH_SPECIAL_IDS.includes(id)) return "special";
  const kind = ITEMS[id].kind;
  return kind === "potion" || kind === "throwable" || kind === "scroll" ? kind : null;
}

/** Предметы рюкзака нужной категории, которые можно положить в сумку: [id, количество]. */
export function pouchCandidates(player: Pick<Player, "bag">, cat: PouchCategory): [string, number][] {
  return Object.entries(player.bag).filter(([id, n]) => n > 0 && pouchCategoryOf(id) === cat);
}

export type PouchSlots = (string | null)[];

/** Слоты сумки; у старых сохранений поля нет — сумка пустая, у сохранений с тремя слотами остальные пустые. */
export function pouchOf(player: Pick<Player, "pouch">): PouchSlots {
  const raw = Array.isArray(player.pouch) ? player.pouch : [];
  return Array.from({ length: POUCH_SLOTS }, (_, i) => (typeof raw[i] === "string" ? raw[i] : null));
}

/** Виды зелий, которые лежат в сумке (без пустых слотов). */
export function pouchIds(player: Pick<Player, "pouch">): string[] {
  return pouchOf(player).filter((id): id is string => !!id);
}

export type PouchResult = { ok: true; pouch: PouchSlots } | { ok: false; error: string };

/**
 * Кладёт предмет в слот (или очищает слот, если id = null).
 * Только зелья, свитки и расходники из рюкзака, без дублей между слотами.
 */
export function setPouchSlot(player: Pick<Player, "pouch" | "bag">, index: number, id: string | null): PouchResult {
  if (!Number.isInteger(index) || index < 0 || index >= POUCH_SLOTS) return { ok: false, error: "Такого слота нет." };
  const pouch = pouchOf(player);
  if (id === null) {
    pouch[index] = null;
    return { ok: true, pouch };
  }
  const def = ITEMS[id];
  if (!def || !canPouch(id)) return { ok: false, error: "В сумку кладутся зелья, свитки, расходники, бурдюк и факел." };
  if ((player.bag[id] ?? 0) <= 0) return { ok: false, error: `«${def.name}» нет в рюкзаке.` };
  if (pouch.some((x, i) => x === id && i !== index)) return { ok: false, error: `«${def.name}» уже в сумке.` };
  pouch[index] = id;
  return { ok: true, pouch };
}
