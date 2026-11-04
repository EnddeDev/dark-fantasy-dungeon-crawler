/**
 * Фильтры и сортировка лавки: припасы по уровню, реагенты по категории и порядку.
 * Чистые функции — их проверяют тесты, а экран только вызывает их.
 */
import { gearClassFor, type ArmorGearClass, type ItemDef, type ReagentCat } from "./content";
import type { GearItem, Slot } from "./types";

/** Фильтр припасов по уровню: 0 — все уровни. */
export type SupplyLevelFilter = 0 | number;
/** Фильтр реагентов по категории: all — все категории. */
export type ReagentFilter = "all" | ReagentCat;
/** Порядок реагентов: по умолчанию по уровню, затем по цене. */
export type ReagentSort = "level" | "price" | "name";

/** Категория реагента; без явной категории считаем растением, как и на экране. */
export function reagentCategoryOf(def: ItemDef): ReagentCat {
  return def.reagentCat ?? "plant";
}

/** Припасы выбранного уровня, по уровню, затем по цене и названию. */
export function shopSupplyList(items: ItemDef[], level: SupplyLevelFilter): ItemDef[] {
  return items
    .filter((i) => level === 0 || (i.level ?? 1) === level)
    .sort((a, b) => (a.level ?? 1) - (b.level ?? 1) || (a.price ?? 0) - (b.price ?? 0) || a.name.localeCompare(b.name));
}

/** Уровни, которые встречаются среди предметов — по ним строятся кнопки фильтра. */
export function supplyLevelOptions(items: ItemDef[]): number[] {
  return [...new Set(items.map((i) => i.level ?? 1))].sort((a, b) => a - b);
}

/** Реагенты выбранной категории в нужном порядке; по умолчанию — по уровню. */
export function shopReagentList(items: ItemDef[], category: ReagentFilter, sort: ReagentSort): ItemDef[] {
  const byLevel = (a: ItemDef, b: ItemDef) => (a.level ?? 1) - (b.level ?? 1);
  const byPrice = (a: ItemDef, b: ItemDef) => (a.price ?? 0) - (b.price ?? 0);
  const byName = (a: ItemDef, b: ItemDef) => a.name.localeCompare(b.name);
  const compare =
    sort === "price"
      ? (a: ItemDef, b: ItemDef) => byPrice(a, b) || byLevel(a, b) || byName(a, b)
      : sort === "name"
        ? byName
        : (a: ItemDef, b: ItemDef) => byLevel(a, b) || byPrice(a, b) || byName(a, b);
  return items
    .filter((i) => category === "all" || reagentCategoryOf(i) === category)
    .sort(compare);
}

/** Фильтр по слоту: каждый слот отдельно; оба кольца — одна кнопка «Кольца». */
export type SlotFilter = "all" | "mainHand" | "offHand" | "head" | "body" | "feet" | "wrists" | "rings" | "amulet";

export const SLOT_FILTERS: Record<Exclude<SlotFilter, "all">, Slot[]> = {
  mainHand: ["mainHand"],
  offHand: ["offHand"],
  head: ["head"],
  body: ["body"],
  feet: ["feet"],
  wrists: ["wrists"],
  rings: ["ring1", "ring2"],
  amulet: ["amulet"],
};

/** Фильтр по типу брони в магазине: лёгкая, средняя, тяжёлая; all — любой тип. */
export type GearClassFilter = "all" | ArmorGearClass;

/**
 * Снаряжение проходит фильтры магазина: слот и тип брони работают вместе.
 * Тип берётся у базы предмета (gearClassFor); без типа считается средним.
 */
export function shopGearMatches(item: GearItem, slot: SlotFilter, gearClass: GearClassFilter): boolean {
  if (slot !== "all" && !SLOT_FILTERS[slot].includes(item.slot)) return false;
  if (gearClass !== "all" && gearClassFor(item) !== gearClass) return false;
  return true;
}

/** Кнопка фильтра для слота, которую выбирают при «Выбрать предмет». */
export function slotFilterOf(slot: Slot): SlotFilter {
  if (slot === "ring1" || slot === "ring2") return "rings";
  return slot;
}
