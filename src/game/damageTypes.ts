/**
 * Виды урона: единый справочник для руководства и для расчётов.
 *
 * Прямой урон делится на две школы — физический (режется бронёй) и магический
 * (режется магическим сопротивлением). Стихии (огонь, лёд, кислота, свет) —
 * магические удары с меткой стихии: они дают уязвимость или иммунитет родов.
 * Периодический урон (яд, кровотечение) тикает в конце раунда; величину тика задаёт источник
 * (у монстров — базовая формула, у боссов — процент от макс. ОЗ) и не режется сопротивлениями. Горение — это огонь: отдельного вида нет.
 */
import { MONSTER_RACE_META, ELEMENT_WEAKNESS_MULT, type DamageElement, type MonsterRace } from "./monsters";

/** Школа прямого удара: какой защитой режется. */
export type DamageSchool = "phys" | "magic";

export type DamageTypeId = "phys" | "magic" | DamageElement | "poison" | "bleed";

export interface DamageTypeInfo {
  id: DamageTypeId;
  name: string;
  /** direct — удар в момент действия; periodic — тикает в конце раунда. */
  group: "direct" | "periodic";
  /** Школа прямого удара; у периодического урона школы нет. */
  school?: DamageSchool;
  text: string;
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
    text: "Заклинания, свитки, зелья и магические приёмы. Игнорирует броню и уклонение; режется магическим сопротивлением. Магическое масло: сразу 3 + 3×ИНТ при каждом ударе.",
  },
  {
    id: "fire",
    name: "Огонь",
    group: "direct",
    school: "magic",
    text: elementText("fire", "Огненный шар поджигает врага: горение, тик задан силой шара. Огненное масло: тик 10% от удара, 3 раунда."),
  },
  {
    id: "ice",
    name: "Лёд",
    group: "direct",
    school: "magic",
    text: elementText("ice", "Ледяные оковы накладывают обморожение: лечение −50% и периодический урон. Ледяное масло: 3 урона за раунд и −5% силы атаки врага за каждое очко ИНТ, 3 раунда."),
  },
  {
    id: "acid",
    name: "Кислота",
    group: "direct",
    school: "magic",
    text: elementText("acid", "Кислотный флакон снимает с брони 3 единицы. Кислотное масло: 10 урона за раунд и броня врага −(1 + ЛОВ), 3 раунда."),
  },
  {
    id: "light",
    name: "Свет",
    group: "direct",
    school: "magic",
    text: elementText("light", "Некоторые свитки бьют нежить вдвое сильнее. Световое масло: сразу 2×ИНТ и 25% промахов врага, 3 раунда."),
  },
  {
    id: "poison",
    name: "Яд",
    group: "periodic",
    text: "Тик в конце раунда за каждый стек, величину задаёт источник. Повторное наложение продлевает срок и складывает урон. Не режется сопротивлениями. Ядовитое масло: тик 10% от удара, 3 раунда.",
  },
  {
    id: "bleed",
    name: "Кровотечение",
    group: "periodic",
    text: "Тик в конце раунда за каждый стек, величину задаёт источник. Повторное наложение продлевает срок и складывает урон. Не режется сопротивлениями.",
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
