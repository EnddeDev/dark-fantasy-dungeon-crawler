/**
 * Модель урона: какими слоями сопротивлений режется каждый вид и какой вид урона у приёма.
 *
 * Правила (по damage-model-draft.md):
 * - физический — броня (плоско), укрепление (%);
 * - магический — сопротивление магии (%);
 * - стихия (огонь, лёд, кислота, свет) — магический урон плюс сопротивление стихии у цели;
 * - чистый — без слоёв: проходит сквозь все защиты;
 * - яд и кровотечение — периодические, слоёв удара не имеют.
 *
 * Сопротивление стихии — число res: 1 — иммунитет, отрицательное — уязвимость.
 * Множитель урона = 1 − res (см. elementMult в monsters.ts).
 */
import type { DamageElement } from "./monsters";
import type { DamageTypeId } from "./damageTypes";

/** Слои сопротивлений, которые режут удар данного вида, по порядку применения. */
export type ResistLayer = "armor" | "fortify" | "magicResist" | "elementRes";

export function resistLayersOf(id: DamageTypeId): ResistLayer[] {
  switch (id) {
    case "phys":
      return ["armor", "fortify"];
    case "magic":
      return ["magicResist"];
    case "fire":
    case "ice":
    case "acid":
    case "light":
      return ["magicResist", "elementRes"];
    case "pure":
    case "poison":
    case "bleed":
      return [];
  }
}

/** Характеристика, от которой идёт приём; ИНТ — магический по умолчанию. */
export type TechniqueStat = "str" | "agi" | "int";

export interface TechniqueDamageInput {
  scaleStat: TechniqueStat;
  /** Приём явно магический (как у посоха и палочки). */
  magic?: boolean;
  /** Стихия приёма; задаётся самим приёмом, не родом цели. */
  element?: DamageElement;
  /** Чистый урон. */
  pure?: boolean;
}

/**
 * Вид урона приёма: чистый, стихия, магический или физический.
 * Стихия важнее школы: огненный приём — огонь, даже если он от СИЛ.
 * ИНТ-приём без стихии — магический.
 */
export function techniqueDamageType(t: TechniqueDamageInput): DamageTypeId {
  if (t.pure) return "pure";
  if (t.element) return t.element;
  if (t.magic || t.scaleStat === "int") return "magic";
  return "phys";
}

/** Класс приёма: атакующий наносит урон, защитный — защищает или усиливает. */
export type TechniqueClass = "attack" | "defense";

export function techniqueClassOf(kind: "attack" | "defense" | undefined): TechniqueClass {
  return kind === "defense" ? "defense" : "attack";
}
