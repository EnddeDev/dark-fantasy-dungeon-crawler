/**
 * Виды урона: единый справочник для руководства и для расчётов.
 *
 * Прямой урон делится на две школы — физический (режется бронёй) и магический
 * (режется магическим сопротивлением). Стихии (огонь, лёд, кислота, свет) —
 * магические удары с меткой стихии: они дают уязвимость или иммунитет родов.
 * Периодический урон (яд, горение, кровотечение) тикает в конце раунда от
 * максимального ОЗ и не режется сопротивлениями.
 */
import { MONSTER_RACE_META, ELEMENT_WEAKNESS_MULT, type DamageElement, type MonsterRace } from "./monsters";
import { STATUS_DOT } from "./statusEffects";

/** Школа прямого удара: какой защитой режется. */
export type DamageSchool = "phys" | "magic";

export type DamageTypeId = "phys" | "magic" | DamageElement | "poison" | "burn" | "bleed";

export interface DamageTypeInfo {
  id: DamageTypeId;
  name: string;
  /** direct — удар в момент действия; periodic — тикает в конце раунда. */
  group: "direct" | "periodic";
  /** Школа прямого удара; у периодического урона школы нет. */
  school?: DamageSchool;
  text: string;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function racesWith(element: DamageElement, kind: "vulnerable" | "immune"): string {
  const races = (Object.keys(MONSTER_RACE_META) as MonsterRace[])
    .filter((race) => {
      const meta = MONSTER_RACE_META[race];
      return kind === "vulnerable" ? meta.vulnerable?.includes(element) : meta.immuneElements?.includes(element);
    })
    .map((race) => MONSTER_RACE_META[race].name.toLowerCase());
  return races.join(", ");
}

function elementText(element: DamageElement, extra: string): string {
  const weak = racesWith(element, "vulnerable");
  const immune = racesWith(element, "immune");
  const parts = [`Магический урон стихии: броню игнорирует, режется магическим сопротивлением.`];
  if (weak) parts.push(`Уязвимость (×${ELEMENT_WEAKNESS_MULT}): ${weak}.`);
  if (immune) parts.push(`Иммунитет (0 урона): ${immune}.`);
  if (extra) parts.push(extra);
  return parts.join(" ");
}

export const DAMAGE_TYPES: DamageTypeInfo[] = [
  {
    id: "phys",
    name: "Физический",
    group: "direct",
    school: "phys",
    text: "Оружие и физические приёмы. Режется бронёй и укреплением; уклонение отменяет удар; шипы врага ранят только при ударе вплотную.",
  },
  {
    id: "magic",
    name: "Магический",
    group: "direct",
    school: "magic",
    text: "Заклинания, свитки, зелья и магические приёмы. Игнорирует броню и уклонение; режется магическим сопротивлением.",
  },
  {
    id: "fire",
    name: "Огонь",
    group: "direct",
    school: "magic",
    text: elementText("fire", "Огненный шар и свиток огня."),
  },
  {
    id: "ice",
    name: "Лёд",
    group: "direct",
    school: "magic",
    text: elementText("ice", "Ледяные оковы накладывают обморожение: лечение −50% и периодический урон."),
  },
  {
    id: "acid",
    name: "Кислота",
    group: "direct",
    school: "magic",
    text: elementText("acid", "Кислотный флакон снимает с брони 3 единицы."),
  },
  {
    id: "light",
    name: "Свет",
    group: "direct",
    school: "magic",
    text: elementText("light", "Некоторые свитки бьют нежить вдвое сильнее."),
  },
  {
    id: "poison",
    name: "Яд",
    group: "periodic",
    text: `${percent(STATUS_DOT.poison)} макс. ОЗ в конце раунда за каждый стек. Повторное наложение продлевает срок и складывает урон. Не режется сопротивлениями.`,
  },
  {
    id: "burn",
    name: "Горение",
    group: "periodic",
    text: `${percent(STATUS_DOT.burn)} макс. ОЗ в конце раунда. В огненном биоме дополнительно 2 урона за каждый слой горения. Не режется магическим сопротивлением.`,
  },
  {
    id: "bleed",
    name: "Кровотечение",
    group: "periodic",
    text: `${percent(STATUS_DOT.bleed)} макс. ОЗ в конце раунда за каждый стек. Повторное наложение продлевает срок и складывает урон. Не режется сопротивлениями.`,
  },
];

/** Стихии: всегда магический урон с меткой стихии. */
export const DAMAGE_ELEMENTS: DamageElement[] = ["fire", "ice", "acid", "light"];

export function isDamageElement(id: DamageTypeId): id is DamageElement {
  return (DAMAGE_ELEMENTS as string[]).includes(id);
}

/** Стихии, к которым род уязвим или иммунен — для карточек врага и бестиария. */
export function raceElementRows(race: MonsterRace): { weak: DamageElement[]; immune: DamageElement[] } {
  const meta = MONSTER_RACE_META[race];
  return {
    weak: meta.vulnerable ?? [],
    immune: meta.immuneElements ?? [],
  };
}

/** Вид урона предмета по его применению: стихия, яд или кровотечение. */
export function itemDamageType(use: { type?: string; element?: DamageElement } | undefined): DamageTypeId | undefined {
  if (!use) return undefined;
  if (use.element) return use.element;
  if (use.type === "poison") return "poison";
  if (use.type === "bleed") return "bleed";
  return undefined;
}

/** Название вида урона для журнала и подсказок. */
export function damageTypeName(id: DamageTypeId): string {
  return DAMAGE_TYPES.find((t) => t.id === id)?.name ?? id;
}
