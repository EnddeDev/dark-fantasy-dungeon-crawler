/**
 * Единые правила негативных эффектов.
 * Периодический урон задаёт источник наложения: у каждого предмета, приёма,
 * монстра и ловушки свой тик. Тик не зависит от макс. ОЗ цели.
 */
export type DotKind = "bleed" | "poison" | "burn" | "chill" | "curse" | "blight";

/**
 * Доля силы источника, которая уходит в тик. Сила — та же величина, что даёт
 * урон источника: у расходника — его урон, у приёма — урон приёма, у монстра — его атака.
 */
export const DOT_SHARE = {
  consumable: { poison: 0.2, bleed: 0.25, chill: 0.15, blight: 0.15 },
  weapon: { poison: 0.2, bleed: 0.25, chill: 0.15, curse: 0.15 },
  spell: { burn: 0.25, chill: 0.15 },
  monster: { bleed: 0.25, poison: 0.2, burn: 0.3, chill: 0.15, curse: 0.15 },
} as const;

/** Тик по силе источника: не меньше 1. */
export function dotTickFrom(power: number, share: number): number {
  return Math.max(1, Math.round(Math.max(0, power) * share));
}

/** Тик магического эффекта, который режется сопротивлением цели. */
export function magicTickFrom(tick: number, magicResist: number): number {
  return Math.max(1, Math.round(Math.max(0, tick) * (1 - Math.max(0, Math.min(0.99, magicResist)))));
}

/**
 * Тик при наложении. Пока эффект активен, держится сильнейший тик; новый
 * эффект после конца старого берёт свой тик.
 */
export function refreshedTick(active: boolean, prev: number, next: number): number {
  return active ? Math.max(prev, next) : next;
}

/** Тик проклятия с карты (событие): магический, растёт с этажом. */
export function curseTickFrom(floor: number): number {
  return 1 + Math.max(1, Math.floor(floor));
}

/** Тик ловушки на шагах по карте: растёт с этажом. */
export function trapTickFrom(kind: "bleed" | "poison", floor: number): number {
  const f = Math.max(1, Math.floor(floor));
  return kind === "bleed" ? 2 + f : 3 + f;
}

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
 * Огонь 6, лёд 3, кислота 10, яд 2 + ЛОВ героя. Разовые виды (магия, свет) тиков не дают — возвращают 0.
 */
export function oilTickBase(kind: OilKind, agi: number): number {
  switch (kind) {
    case "fire":
      return 6;
    case "ice":
      return 3;
    case "acid":
      return 10;
    case "poison":
      return 2 + Math.max(0, agi);
    default:
      return 0;
  }
}

/** Периодический урон масла за тик: огонь, лёд и кислота режутся магическим сопротивлением, яд — нет. */
export function oilTickDamage(kind: OilKind, agi: number, magicResist: number): number {
  const base = oilTickBase(kind, agi);
  if (base <= 0) return 0;
  if (kind === "poison") return base;
  return magicTickFrom(base, magicResist);
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

export const NEGATIVE_EFFECTS: { id: string; name: string; text: string }[] = [
  { id: "curse", name: "Проклятие", text: "Урон цели −30% и периодический магический урон, величину задаёт источник." },
  { id: "poison", name: "Яд", text: "Периодический урон в конце раунда, величину задаёт источник; повторное наложение продлевает срок и складывает урон." },
  { id: "burn", name: "Горение", text: "Периодический урон в конце раунда, величину задаёт источник." },
  { id: "bleed", name: "Кровотечение", text: "Периодический урон в конце раунда, величину задаёт источник; повторное наложение продлевает срок и складывает урон." },
  { id: "chill", name: "Обморожение", text: "Лечение цели −50% и периодический урон, величину задаёт источник." },
  { id: "wither", name: "Увядание", text: "Любое лечение цели переходит в магический урон." },
  { id: "stun", name: "Оглушение", text: "Цель пропускает следующий ход." },
  { id: "fear", name: "Страх", text: "Цель автоматически уходит в защиту в свой ход." },
  { id: "sunder", name: "Раскол", text: "Снижает броню цели; наложения складываются, сила растёт с уровнем эффекта." },
];
