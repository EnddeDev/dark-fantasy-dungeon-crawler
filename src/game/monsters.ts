/**
 * Типы и роды монстров.
 *
 * Тип задаёт боевой профиль: сколько у твари здоровья, брони и ходов и на чём
 * держится её урон. Род задаёт особенности: иммунитеты, уязвимости, приёмы и
 * пассивные свойства. Любая тварь — это пара «тип + род».
 */
import type { EnemyMove } from "./content";

/** Боевой профиль монстра. */
export type MonsterType = "strong" | "agile" | "smart";
/** Род монстра: к какому племени он принадлежит. */
export type MonsterRace =
  | "undead"
  | "construct"
  | "vampire"
  | "ghost"
  | "beast"
  | "demon"
  | "dragon"
  | "none";

/** Стихии, к которым бывают уязвимости и иммунитеты. */
export type DamageElement = "fire" | "ice" | "acid" | "light";
/** Эффекты, от которых бывает врождённый иммунитет. */
export type EffectKind = "poison" | "bleed" | "fear";

export const ELEMENT_NAMES: Record<DamageElement, string> = {
  fire: "огонь",
  ice: "лёд",
  acid: "кислота",
  light: "свет",
};

export const EFFECT_NAMES: Record<EffectKind, string> = {
  poison: "яд",
  bleed: "кровотечение",
  fear: "страх",
};

export interface MonsterTypeMeta {
  id: MonsterType;
  name: string;
  note: string;
  /** Множитель здоровья. */
  hpMult: number;
  /** Прибавка к броне (может быть отрицательной). */
  armorDelta: number;
  /** Множитель урона обычной атаки. */
  atkMult: number;
  /** Ходы вида поверх базового хода: 1 всегда, у ловкого +1, у остальных 0. Ловкость добавляет ходы сверху. */
  apDelta: number;
  /** Врождённое уклонение. */
  evade: number;
  /** Множитель урона приёмов: у умных приёмы — основной источник урона. */
  movePower: number;
}

export const MONSTER_TYPE_META: Record<MonsterType, MonsterTypeMeta> = {
  strong: {
    id: "strong",
    name: "Сильный",
    note: "Много здоровья и брони, мало ходов, но каждый удар тяжёл.",
    hpMult: 1.15,
    armorDelta: 1,
    atkMult: 1.2,
    apDelta: 0,
    evade: 0,
    movePower: 0.9,
  },
  agile: {
    id: "agile",
    name: "Ловкий",
    note: "Мало здоровья и брони, зато уклонение и лишний ход; бьёт слабее.",
    hpMult: 0.85,
    armorDelta: -1,
    atkMult: 0.85,
    apDelta: 1,
    evade: 0.15,
    movePower: 0.9,
  },
  smart: {
    id: "smart",
    name: "Умный",
    note: "Средние здоровье, броня и ходы; обычный удар слаб, а урон держится на приёмах.",
    hpMult: 1.0,
    armorDelta: 0,
    atkMult: 0.75,
    apDelta: 0,
    evade: 0.05,
    movePower: 1.45,
  },
};

export interface MonsterRaceMeta {
  id: MonsterRace;
  name: string;
  note: string;
  /** Врождённые иммунитеты к эффектам. */
  immune: EffectKind[];
  /** Типы, с которыми род совместим. */
  allowedTypes: MonsterType[];
  /** Приёмы, которые есть у каждой твари рода. */
  bonusMoves: EnemyMove[];
  /** Уязвимость к стихиям: получает в полтора раза больше. */
  vulnerable?: DamageElement[];
  /** Иммунитет к стихиям: не получает урона вовсе. */
  immuneElements?: DamageElement[];
  /** Врождённое уклонение (призрак скользит между ударами). */
  evade?: number;
  /** Шанс проигнорировать любой наложенный эффект (дракон). */
  effectResist?: number;
  /** Постоянное «Укрепление»: доля, на которую режется физический урон. */
  fortify?: number;
  /** Нельзя восстанавливать здоровье (конструкт). */
  noHealing?: boolean;
  /** Множитель брони рода (конструкт — ×2). */
  armorMult?: number;
  /** Воскресает один раз за бой: полное здоровье, затем урон и броня −50%. */
  revive?: boolean;
  /** Каждое попадание его атаки накладывает слабость: твой урон от атак снижается. */
  weakens?: boolean;
}

/** Слабость вампира: каждое наложение режет урон героя от обычных атак на эту долю. */
export const WEAKNESS_STEP = 0.07;
/** Нежить после воскрешения: урон и броня на эту долю меньше. */
export const REVIVE_DEBUFF = 0.5;
/** Сильный «без рода»: регенерация в конце своего хода = уровень + уровень × 1.5 ОЗ. */
export function noneStrongRegen(level: number): number {
  return Math.max(1, Math.round(level + level * 1.5));
}
/** Ловкий «без рода»: шанс уйти от физического удара и контратаковать без урона. */
export const NONE_AGILE_COUNTER_CHANCE = 0.2;
/** Умный «без рода»: приём, который получает каждая такая тварь. */
export const NONE_SMART_MOVE = "drain" as const;

/** Множитель уязвимости к стихии. */
export const ELEMENT_WEAKNESS_MULT = 1.5;

export const MONSTER_RACE_META: Record<MonsterRace, MonsterRaceMeta> = {
  undead: {
    id: "undead",
    name: "Нежить",
    note: "Иммунитет к яду, кровотечению и страху. Умеет запугивать: лишает тебя атаки и приёма на ход. Падая до 0 ОЗ, поднимается полностью, но после этого урон и броня −50% (один раз за бой).",
    immune: ["poison", "bleed", "fear"],
    allowedTypes: ["strong", "agile", "smart"],
    bonusMoves: ["intimidate"],
    revive: true,
  },
  construct: {
    id: "construct",
    name: "Конструкт",
    note: "Иммунитет к яду, кровотечению и страху, всегда под Укреплением; вылечить его нельзя. Уязвим к огню, льду и кислоте. Броня ×2.",
    immune: ["poison", "bleed", "fear"],
    allowedTypes: ["strong"],
    bonusMoves: [],
    vulnerable: ["fire", "ice", "acid"],
    fortify: 0.2,
    noHealing: true,
    armorMult: 2,
  },
  vampire: {
    id: "vampire",
    name: "Вампир",
    note: "Вампиризм и магический вампиризм, атаки открывают кровотечение. Каждая его атака накладывает слабость: твой урон от обычных атак −7%, складывается весь бой. Уязвим к свету. Приём «Мрак»: полраунда промахов.",
    immune: [],
    allowedTypes: ["agile", "smart"],
    bonusMoves: ["darkness"],
    vulnerable: ["light"],
    weakens: true,
  },
  ghost: {
    id: "ghost",
    name: "Призрак",
    note: "Иммунитет к яду и кровотечению, большое уклонение, атаки наводят страх. «Холодное касание» бьёт сквозь броню и сопротивления и на 2 хода запрещает лечение.",
    immune: ["poison", "bleed"],
    allowedTypes: ["agile", "smart"],
    bonusMoves: ["cold_touch"],
    evade: 0.2,
    /* У призрака мало здоровья и защиты: он слаб в лобовом обмене. */
  },
  beast: {
    id: "beast",
    name: "Зверь",
    note: "Агрессия: ниже половины здоровья бьёт вдвое сильнее. Атаки накладывают яд или кровотечение. Иммунитет к свету.",
    immune: [],
    allowedTypes: ["agile", "strong"],
    bonusMoves: [],
    immuneElements: ["light"],
  },
  demon: {
    id: "demon",
    name: "Демон",
    note: "Атаки накладывают горение или страх. Приём «Сила ада»: двойной урон и четыре слоя горения.",
    immune: [],
    allowedTypes: ["strong", "agile", "smart"],
    bonusMoves: ["hell_force"],
  },
  dragon: {
    id: "dragon",
    name: "Дракон",
    note: "Устойчив ко всем эффектам. После трёх твоих атак впадает в ярость на 3 хода: двойной урон и лечение 10% запаса в конце хода.",
    immune: [],
    allowedTypes: ["strong", "agile", "smart"],
    bonusMoves: [],
    effectResist: 0.5,
  },
  none: {
    id: "none",
    name: "Без рода",
    note: "Родовых иммунитетов и приёмов нет. Свойство даёт тип: сильный — регенерация в конце своего хода, ловкий — 20% шанс контратаковать без получения урона, умный — лишний приём.",
    immune: [],
    allowedTypes: ["strong", "agile", "smart"],
    bonusMoves: [],
  },
};

export const MONSTER_TYPES: MonsterType[] = ["strong", "agile", "smart"];
export const MONSTER_RACES: MonsterRace[] = [
  "undead",
  "construct",
  "vampire",
  "ghost",
  "beast",
  "demon",
  "dragon",
  "none",
];

/** Приёмы, которые появляются у твари только от рода. */
export const RACE_MOVES: EnemyMove[] = ["intimidate", "darkness", "cold_touch", "hell_force"];

function raceMeta(race: MonsterRace): MonsterRaceMeta {
  return MONSTER_RACE_META[race] ?? MONSTER_RACE_META.none;
}

/** Врождённый иммунитет рода к эффекту. */
export function raceImmuneTo(race: MonsterRace, effect: EffectKind): boolean {
  return raceMeta(race).immune.includes(effect);
}

/** Множитель урона стихией для рода: 0 — иммунитет, 1.5 — уязвимость. */
export function raceElementMult(race: MonsterRace, element: DamageElement | undefined): number {
  if (!element) return 1;
  const meta = raceMeta(race);
  if (meta.immuneElements?.includes(element)) return 0;
  if (meta.vulnerable?.includes(element)) return ELEMENT_WEAKNESS_MULT;
  return 1;
}

/** Род накладывает на тварь дополнительные приёмы. */
export function raceBonusMoves(race: MonsterRace): EnemyMove[] {
  return [...raceMeta(race).bonusMoves];
}

/** Шанс проигнорировать любой эффект (дракон). */
export function raceEffectResist(race: MonsterRace): number {
  return raceMeta(race).effectResist ?? 0;
}

/** Постоянное «Укрепление» рода: доля среза физического урона. */
export function raceFortify(race: MonsterRace): number {
  return raceMeta(race).fortify ?? 0;
}


/** Врождённое уклонение рода (без уклонения типа). */
export function raceEvade(race: MonsterRace): number {
  return raceMeta(race).evade ?? 0;
}

/** Род нельзя вылечить (конструкт). */
export function raceCannotHeal(race: MonsterRace): boolean {
  return raceMeta(race).noHealing === true;
}

/** Множитель брони рода (конструкт — ×2). */
export function raceArmorMult(race: MonsterRace): number {
  return raceMeta(race).armorMult ?? 1;
}

/** Воскресает ли род после падения ОЗ до 0 (нежить). */
export function raceRevives(race: MonsterRace): boolean {
  return raceMeta(race).revive === true;
}

/** Накладывает ли род слабость на героя при каждом попадании (вампир). */
export function raceWeakens(race: MonsterRace): boolean {
  return raceMeta(race).weakens === true;
}

/** Особенность рода «без рода» зависит от типа твари. */
export const NONE_TYPE_TRAIT: Record<MonsterType, string> = {
  strong: "регенерация в конце своего хода: уровень + уровень × 1.5 ОЗ",
  agile: "20% шанс контратаковать без получения урона",
  smart: "лишний приём",
};

/** Приводит тип к разрешённому для рода: конструкт может быть только сильным. */
export function coerceMonsterType(race: MonsterRace, type: MonsterType): MonsterType {
  const allowed = raceMeta(race).allowedTypes;
  if (allowed.includes(type)) return type;
  return allowed[0] ?? "strong";
}

/** Итоговое уклонение твари: тип плюс род. */
export function monsterEvade(race: MonsterRace, type: MonsterType): number {
  const t = MONSTER_TYPE_META[type] ?? MONSTER_TYPE_META.strong;
  return Math.min(0.6, t.evade + raceEvade(race));
}

/** Описание врождённых свойств рода для интерфейса и бестиария. */
export function raceTraits(race: MonsterRace, type?: MonsterType): string[] {
  const meta = raceMeta(race);
  const traits: string[] = [];
  if (meta.armorMult && meta.armorMult !== 1) traits.push(`броня ×${meta.armorMult}`);
  if (meta.revive) traits.push("воскресает один раз за бой: полное ОЗ, затем урон и броня −50%");
  if (meta.weakens) traits.push(`слабость: твой урон от атак −${Math.round(WEAKNESS_STEP * 100)}% за каждое попадание, складывается`);
  if (race === "none" && type) traits.push(NONE_TYPE_TRAIT[type]);
  if (meta.immune.length) {
    traits.push(`иммунитет: ${meta.immune.map((e) => EFFECT_NAMES[e]).join(", ")}`);
  }
  if (meta.immuneElements?.length) {
    traits.push(`иммунитет к стихии: ${meta.immuneElements.map((e) => ELEMENT_NAMES[e]).join(", ")}`);
  }
  if (meta.vulnerable?.length) {
    traits.push(`уязвим: ${meta.vulnerable.map((e) => ELEMENT_NAMES[e]).join(", ")} (×${ELEMENT_WEAKNESS_MULT})`);
  }
  if (meta.fortify) traits.push(`Укрепление: физический урон −${Math.round(meta.fortify * 100)}%`);
  if (meta.noHealing) traits.push("нельзя вылечить");
  if (meta.effectResist) traits.push(`сопротивление эффектам ${Math.round(meta.effectResist * 100)}%`);
  if (meta.evade) traits.push(`уклонение +${Math.round(meta.evade * 100)}%`);
  return traits;
}

/** Подпись твари: «Ловкий призрак», «Сильный конструкт». */
export function monsterLabel(race: MonsterRace, type: MonsterType): string {
  return `${MONSTER_TYPE_META[type]?.name ?? MONSTER_TYPE_META.strong.name} · ${raceMeta(race).name.toLowerCase()}`;
}
