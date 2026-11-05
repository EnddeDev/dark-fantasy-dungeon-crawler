/**
 * Сумка с зельями: постоянный элемент героя на три слота под разные виды зелий.
 * Снаряжается до входа в подземелье и меняется из рюкзака вне боя.
 * В бою первое зелье из сумки за ход не тратит ход.
 */
import type { Player } from "./types";
import { ITEMS } from "./content";

export const POUCH_SLOTS = 3;

export type PouchSlots = (string | null)[];

/** Слоты сумки; у старых сохранений поля нет — сумка пустая. */
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
 * Кладёт зелье в слот (или очищает слот, если id = null).
 * Только зелья из рюкзака, без дублей между слотами.
 */
export function setPouchSlot(player: Pick<Player, "pouch" | "bag">, index: number, id: string | null): PouchResult {
  if (!Number.isInteger(index) || index < 0 || index >= POUCH_SLOTS) return { ok: false, error: "Такого слота нет." };
  const pouch = pouchOf(player);
  if (id === null) {
    pouch[index] = null;
    return { ok: true, pouch };
  }
  const def = ITEMS[id];
  if (!def || def.kind !== "potion") return { ok: false, error: "В сумку кладутся только зелья." };
  if ((player.bag[id] ?? 0) <= 0) return { ok: false, error: `«${def.name}» нет в рюкзаке.` };
  if (pouch.some((x, i) => x === id && i !== index)) return { ok: false, error: `«${def.name}» уже в сумке.` };
  pouch[index] = id;
  return { ok: true, pouch };
}
