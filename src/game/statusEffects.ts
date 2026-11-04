/**
 * Единые правила негативных эффектов.
 * Периодический урон задаёт источник наложения: у каждого предмета, приёма,
 * монстра и ловушки свой тик. Боссы получают периодику процентом от макс. ОЗ.
 */
export type DotKind = "bleed" | "poison" | "burn" | "chill" | "curse" | "blight";

/**
 * Значение периодического урона: у монстров и у героя одно и то же.
 * Яд 1, кровотечение 1, огонь 3, лёд 1, кислота (порча) 2, проклятие 1.
 */
export const DOT_VALUE: Record<DotKind, number> = {
  poison: 1, bleed: 1, burn: 3, chill: 1, curse: 1, blight: 2,
};

/** Боссы получают периодику процентом от своего макс. ОЗ (как раньше). */
export const BOSS_DOT_PCT: Record<DotKind, number> = {
  bleed: 0.05, poison: 0.04, burn: 0.05, chill: 0.03, curse: 0.03, blight: 0.03,
};

/** Приём монстра берёт базовую формулу атаки и умножает на это. */
export const DOT_SKILL_MULT = 2;

/** Базовая формула: случайно от значение × уровень до значение × уровень + 3. */
export function dotBaseTick(kind: DotKind, level: number, rng: () => number = Math.random): number {
  const lo = DOT_VALUE[kind] * Math.max(1, Math.floor(level));
  return lo + Math.floor(rng() * 4);
}

/** Тик от приёма монстра: базовая формула × 2. */
export function dotSkillTick(kind: DotKind, level: number, rng: () => number = Math.random): number {
  return dotBaseTick(kind, level, rng) * DOT_SKILL_MULT;
}

/** Тик приёма героя: яд, кровотечение и проклятие — +1% макс. ОЗ цели. */
export const SKILL_TARGET_HP_PCT = 0.01;
/** Тик приёма героя: огонь, лёд и кислота — +уровень героя × 2. */
export const SKILL_LEVEL_MULT = 2;

/**
 * Тик приёма героя: базовая формула монстров (от уровня героя) плюс
 * 1% макс. ОЗ цели для яда, кровотечения и проклятия, либо уровень героя × 2 для огня, льда и кислоты.
 */
export function skillDotTick(kind: DotKind, playerLevel: number, targetMaxHp: number, rng: () => number = Math.random): number {
  const base = dotBaseTick(kind, playerLevel, rng);
  if (kind === "burn" || kind === "chill" || kind === "blight") {
    return base + Math.max(0, Math.floor(playerLevel)) * SKILL_LEVEL_MULT;
  }
  return base + Math.round(Math.max(0, targetMaxHp) * SKILL_TARGET_HP_PCT);
}

/** Тик на боссе: процент от его макс. ОЗ, не меньше 1. */
export function bossDotTick(kind: DotKind, maxHp: number): number {
  return Math.max(1, Math.ceil(Math.max(0, maxHp) * BOSS_DOT_PCT[kind]));
}

/** Тик масла: 10% от урона удара, которым масло наложено. */
export function oilTickFromHit(damage: number): number {
  return Math.max(1, Math.round(Math.max(0, damage) * 0.1));
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
 * Периодический урон масла за раунд: тик — 10% от удара, которым масло наложено.
 * Огонь, лёд и кислота режутся магическим сопротивлением, яд — нет.
 * Разовые виды (магия, свет) тиков не дают — возвращают 0.
 */
export function oilTickDamage(kind: OilKind, tick: number, magicResist: number): number {
  if (kind !== "fire" && kind !== "ice" && kind !== "acid" && kind !== "poison") return 0;
  if (kind === "poison") return Math.max(1, tick);
  return magicTickFrom(tick, magicResist);
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
