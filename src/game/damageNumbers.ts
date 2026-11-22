/**
 * Цвета чисел урона над персонажами в бою.
 *
 * Тип урона задаёт цвет: прямой — по школе или стихии, периодический — по источнику.
 * Палитра иконок в DamageTypeIcon.tsx не меняется: это отдельные цвета для чисел.
 */

/** Тип, по которому выбирается цвет числа урона. */
export type DamageNumberType = "phys" | "magic" | "pure" | "fire" | "ice" | "acid" | "light" | "poison" | "bleed";

export const DAMAGE_NUMBER_COLORS: Record<DamageNumberType, string> = {
  phys: "#f6d48a",
  magic: "#5b8dd6",
  fire: "#c0392b",
  ice: "#8dbbc6",
  acid: "#c4e04a",
  light: "#fbe7a1",
  poison: "#408132",
  bleed: "#408132",
  pure: "#ffffff",
};

/** Название типа урона для подсказок: что за число и откуда. */
export const DAMAGE_NUMBER_NAMES: Record<DamageNumberType, string> = {
  phys: "Физический",
  magic: "Магический",
  fire: "Огонь",
  ice: "Лёд",
  acid: "Кислота",
  light: "Свет",
  poison: "Яд",
  bleed: "Кровотечение",
  pure: "Чистый",
};
