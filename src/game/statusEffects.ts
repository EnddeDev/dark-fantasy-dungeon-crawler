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
  { id: "poison", name: "Яд", text: "Периодический урон 4% макс. ОЗ в конце раунда." },
  { id: "burn", name: "Горение", text: "Периодический урон 5% макс. ОЗ в конце раунда." },
  { id: "bleed", name: "Кровотечение", text: "Периодический урон 5% макс. ОЗ в конце раунда." },
  { id: "chill", name: "Обморожение", text: "Лечение цели −50% и периодический урон 3% макс. ОЗ." },
  { id: "wither", name: "Увядание", text: "Любое лечение цели переходит в магический урон." },
  { id: "stun", name: "Оглушение", text: "Цель пропускает следующий ход." },
  { id: "fear", name: "Страх", text: "Цель автоматически уходит в защиту в свой ход." },
  { id: "sunder", name: "Раскол", text: "Снижает броню цели." },
];
