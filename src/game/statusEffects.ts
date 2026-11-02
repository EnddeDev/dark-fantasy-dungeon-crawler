/**
 * Единые правила негативных эффектов.
 * Периодический урон считается от максимального ОЗ цели.
 */
export const STATUS_DOT = {
  bleed: 0.05,
  poison: 0.04,
  burn: 0.05,
  chill: 0.03,
  curse: 0.03,
  blight: 0.03,
} as const;

export type DotKind = keyof typeof STATUS_DOT;

/**
 * Виды масла для оружия. Удар смазанным оружием накладывает вид на 3 раунда.
 * Разовые виды (магия, свет) бьют в момент удара; периодические (огонь, лёд,
 * кислота, яд) тикают в конце каждого раунда срока. Горение — это огонь.
 */
export type OilKind = "magic" | "fire" | "ice" | "acid" | "light" | "poison";

/**
 * Эффекты, от которых героя защищает зелье иммунитета. Только те, что реально
 * попадают на героя: проклятие, страх, раскол, оглушение, кровотечение, яд, горение,
 * запрет лечения, мрак и три печати. Обморожение и увядание на героя не накладываются.
 */
export const IMMUNITY_EFFECTS = [
  "bleed", "poison", "burn", "curse", "fear", "stun", "sunder",
  "noHeal", "darkness", "sealItems", "sealSkills", "sealAttack",
] as const;

export type ImmunityEffect = (typeof IMMUNITY_EFFECTS)[number];

/** Сколько ходов действует зелье иммунитета. */
export const IMMUNITY_ROUNDS = 3;

/** Название эффекта для журнала и подсказок: «Иммунитет: кровотечение не накладывается». */
export const IMMUNITY_NAMES: Record<ImmunityEffect, string> = {
  bleed: "кровотечение",
  poison: "яд",
  burn: "горение",
  curse: "проклятие",
  fear: "страх",
  stun: "оглушение",
  sunder: "раскол",
  noHeal: "запрет лечения",
  darkness: "мрак",
  sealItems: "печать немоты",
  sealSkills: "печать забвения",
  sealAttack: "печать оков",
};

/** Срок масла на клинке врага после удара, в раундах. */
export const OIL_ROUNDS = 3;

/** Шанс промаха врага под светом (ослепление). */
export const OIL_BLIND_MISS = 0.25;

/** Снижение силы атаки и физических приёмов врага под льдом: за каждое очко ИНТ. */
export const OIL_ICE_CUT_PER_INT = 0.05;

/**
 * Разовый урон масла при ударе: магия 3 + 3×ИНТ, свет 2×ИНТ.
 * Для периодических видов 0 — их урон идёт тиками.
 */
export function oilHitDamage(kind: OilKind, int: number): number {
  const i = Math.max(0, int);
  if (kind === "magic") return 3 + 3 * i;
  if (kind === "light") return 2 * i;
  return 0;
}

/**
 * Периодический урон масла за раунд до сопротивлений и уязвимости.
 * Огонь 5 + 1% макс. ОЗ, лёд 3, кислота 10, яд 2% + 1%×ЛОВ макс. ОЗ.
 * Разовые виды (магия, свет) тиков не дают — возвращают 0.
 */
export function oilTickBase(kind: OilKind, maxHp: number, agi: number): number {
  const hp = Math.max(0, maxHp);
  switch (kind) {
    case "fire":
      return 5 + Math.ceil(hp * 0.01);
    case "ice":
      return 3;
    case "acid":
      return 10;
    case "poison":
      return Math.max(1, Math.ceil(hp * (0.02 + 0.01 * Math.max(0, agi))));
    default:
      return 0;
  }
}

/** Периодический урон масла за тик: огонь, лёд и кислота режутся магическим сопротивлением, яд — нет. */
export function oilTickDamage(maxHp: number, kind: OilKind, agi: number, magicResist: number): number {
  const base = oilTickBase(kind, maxHp, agi);
  if (base <= 0) return 0;
  if (kind === "poison") return base;
  return Math.max(1, Math.round(base * (1 - Math.max(0, Math.min(0.99, magicResist)))));
}

/** Доля, на которую льдом снижена сила атаки врага (0.05 за каждое очко ИНТ героя). */
export function oilIceAttackCut(int: number): number {
  return Math.min(0.9, OIL_ICE_CUT_PER_INT * Math.max(0, int));
}

/** Сколько брони снимает кислота: 1 + ЛОВ героя. */
export function oilAcidArmorCut(agi: number): number {
  return 1 + Math.max(0, agi);
}

export const CHILL_HEAL_MULT = 0.5;
export const CURSE_DAMAGE_MULT = 0.7;
export const BLIGHT_DAMAGE_MULT = 0.8;

export function statusTickDamage(maxHp: number, kind: DotKind): number {
  return Math.max(1, Math.ceil(Math.max(0, maxHp) * STATUS_DOT[kind]));
}

export function magicTickDamage(maxHp: number, kind: DotKind, magicResist: number): number {
  const raw = statusTickDamage(maxHp, kind);
  return Math.max(1, Math.round(raw * (1 - Math.max(0, Math.min(0.99, magicResist)))));
}

export const NEGATIVE_EFFECTS: { id: string; name: string; text: string }[] = [
  { id: "curse", name: "Проклятие", text: "Урон цели −30% и периодический магический урон 3% макс. ОЗ." },
  { id: "poison", name: "Яд", text: "Периодический урон 4% макс. ОЗ в конце раунда; повторное наложение продлевает срок и складывает урон." },
  { id: "burn", name: "Горение", text: "Периодический урон 5% макс. ОЗ в конце раунда." },
  { id: "bleed", name: "Кровотечение", text: "Периодический урон 5% макс. ОЗ в конце раунда; повторное наложение продлевает срок и складывает урон." },
  { id: "chill", name: "Обморожение", text: "Лечение цели −50% и периодический урон 3% макс. ОЗ." },
  { id: "wither", name: "Увядание", text: "Любое лечение цели переходит в магический урон." },
  { id: "stun", name: "Оглушение", text: "Цель пропускает следующий ход." },
  { id: "fear", name: "Страх", text: "Цель автоматически уходит в защиту в свой ход." },
  { id: "sunder", name: "Раскол", text: "Снижает броню цели; наложения складываются, сила растёт с уровнем эффекта." },
];
