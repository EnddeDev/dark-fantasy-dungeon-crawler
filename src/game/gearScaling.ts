/**
 * Рост снаряжения.
 * Новые свойства предметов и базовые ОЗ/броня растут сложно: ×1.5 или ×1.25 за уровень,
 * с округлением вверх на каждом шаге. Приёмы и пассивные способности пока живут по старому ×1.2.
 */
import type { GearEffectId, GearPassiveId } from "./gearEffects";
import type { EpicSkillId, LegendaryPassiveId, RareAffixId } from "./types";

export const GEAR_LEVEL_GROWTH = 1.2;
export const GEAR_STAT_GROWTH = 1.5;
export const GEAR_EFFECT_FAST_GROWTH = 1.5;
export const GEAR_EFFECT_SLOW_GROWTH = 1.25;
export const MAX_GEAR_LEVEL = 10;

export function clampGearLevel(level: number | undefined): number {
  return Math.max(1, Math.min(MAX_GEAR_LEVEL, Math.floor(level ?? 1)));
}

/** Итеративный рост: значение каждого следующего уровня = ceil(предыдущее × 1.2). */
export function scaleByLevel(value: number, level: number, precision = 1): number {
  let v = value;
  const target = clampGearLevel(level);
  for (let l = 1; l < target; l++) {
    v = Math.ceil(v * GEAR_LEVEL_GROWTH * precision - 1e-9) / precision;
  }
  return v;
}

export function scaleIntegerByLevel(value: number, level: number): number {
  return scaleByLevel(Math.ceil(value), level, 1);
}

/** Сложный рост целой характеристики предмета: ceil на каждом уровне. */
export function scaleGearStatByLevel(value: number, level: number, growth = GEAR_STAT_GROWTH): number {
  let v = Math.ceil(value);
  const target = clampGearLevel(level);
  for (let l = 1; l < target; l++) v = Math.ceil(v * growth - 1e-9);
  return v;
}

/** Процент хранится как целое число процентных пунктов: 3 → 4 → 5 → 6 → 8… */
export function scalePercentByLevel(percent: number, level: number): number {
  return scaleByLevel(percent, level, 1);
}

/** Множитель хранится в сотых: 1.80 → 2.16 → 2.60 → 3.12… */
export function scaleMultByLevel(mult: number, level: number): number {
  return scaleByLevel(Math.round(mult * 100), level, 1) / 100;
}

/** Непрерывный множитель для цен и сравнений; боевые числа используют scaleByLevel. */
export function gearLevelMultiplier(level: number): number {
  return Math.pow(GEAR_LEVEL_GROWTH, clampGearLevel(level) - 1);
}

type NumericDef = { value: number; precision?: number };

export const GEAR_EFFECT_BASE: Record<GearEffectId, NumericDef> = {
  // Новые свойства предметов
  vamp: { value: 5 },
  magic_vamp: { value: 5 },
  crit_chance: { value: 5 },
  crit_mult: { value: 10 },
  regen: { value: 4 },
  fortify: { value: 5 },
  magic_resist: { value: 5 },
  armor_damage: { value: 8 },
  rage: { value: 10 },
  ap: { value: 0 },
  wisdom: { value: 5 },
  might: { value: 5 },
  precision: { value: 5 },
  thorns: { value: 4 },
  // Старые id сохранены только для миграции сохранений
  damage_resist: { value: 2 },
  resist: { value: 10 },
  guard_bonus: { value: 15 },
  stun_chance: { value: 8 },
  vamp_str: { value: 8 },
  missing_hp_damage: { value: 6 },
  enemy_missing_damage: { value: 6 },
  two_hand_damage: { value: 15 },
  evade: { value: 3 },
  counter: { value: 12 },
  first_strike: { value: 20 },
  consumable_damage: { value: 15 },
  consumable_scale: { value: 0.25, precision: 100 },
  consumable_vamp: { value: 8 },
  debuff_damage: { value: 8 },
  dodge_action: { value: 10 },
  skill_damage: { value: 12 },
  skill_cd: { value: 1 },
  skill_vamp: { value: 10 },
  status_duration: { value: 1 },
  skill_scale: { value: 0.3, precision: 100 },
  scroll_damage: { value: 15 },
  scroll_scale: { value: 0.3, precision: 100 },
  scroll_vamp: { value: 10 },
  scroll_save: { value: 12 },
  scroll_create: { value: 1 },
};

/** Разброс базового значения нового свойства при создании предмета. */
export const GEAR_EFFECT_SPREAD: Partial<Record<GearEffectId, number>> = {
  vamp: 2, magic_vamp: 2, crit_chance: 3, crit_mult: 5, regen: 2,
  fortify: 1, magic_resist: 1, armor_damage: 2, rage: 5,
  wisdom: 1, might: 1, precision: 1, thorns: 1,
};

export const GEAR_EFFECT_GROWTH: Partial<Record<GearEffectId, number>> = {
  vamp: 1.5, magic_vamp: 1.5, crit_chance: 1.25, crit_mult: 1.5, regen: 1.5,
  fortify: 1.25, magic_resist: 1.25, armor_damage: 1.5, rage: 1.5,
  wisdom: 1.5, might: 1.5, precision: 1.5, thorns: 1.5,
};

export function rollEffectBase(id: GearEffectId, rng: () => number = Math.random): number {
  const base = GEAR_EFFECT_BASE[id]?.value ?? 0;
  const spread = GEAR_EFFECT_SPREAD[id] ?? 0;
  if (!spread) return base;
  return Math.max(0, base + Math.floor(rng() * (spread * 2 + 1)) - spread);
}

export function effectMagnitude(id: GearEffectId, level: number, rolledBase?: number): number {
  if (id === "ap") {
    const l = clampGearLevel(level);
    return l >= 10 ? 3 : l >= 7 ? 2 : l >= 3 ? 1 : 0;
  }
  const def = GEAR_EFFECT_BASE[id];
  const base = rolledBase ?? def.value;
  const growth = GEAR_EFFECT_GROWTH[id];
  if (growth) return scaleGearStatByLevel(base, level, growth);
  return scaleByLevel(base, level, def.precision ?? 1);
}

export const GEAR_PASSIVE_BASE: Record<GearPassiveId, Record<string, NumericDef>> = {
  heavy_blow: { stun: { value: 20 } },
  fortress: { resist: { value: 20 } },
  dance: { counter: { value: 25 } },
  precision: { crit: { value: 25 } },
  spell_echo: { echo: { value: 20 } },
  time_warp: { duration: { value: 2 } },
  bulwark_wall: { regen: { value: 4 }, thorns: { value: 6 }, guard: { value: 20 } },
  barbarian_rage: { vamp: { value: 12 }, damage: { value: 20 }, stun: { value: 15 } },
  assassin_shadow: { ap: { value: 1 }, crit: { value: 25 }, critMult: { value: 50 } },
  ninja_phantom: { evade: { value: 10 }, vamp: { value: 12 }, dodge: { value: 25 } },
  warlock_pact: { skillDamage: { value: 25 }, cd: { value: 1 }, vamp: { value: 12 } },
  sage_library: { scrollDamage: { value: 25 }, save: { value: 20 }, create: { value: 1 } },
};

export function passiveMagnitude(id: GearPassiveId, key: string, level: number): number {
  const def = GEAR_PASSIVE_BASE[id]?.[key];
  if (!def) return 0;
  return scaleByLevel(def.value, level, def.precision ?? 1);
}

export const RARE_AFFIX_BASE: Record<RareAffixId, Record<string, NumericDef>> = {
  vamp: { ratio: { value: 20 } },
  crit: { chance: { value: 15 } },
  thorns: { damage: { value: 5 } },
  regen: { heal: { value: 4 } },
  pierce: { armor: { value: 2 } },
  swift: { evade: { value: 8 } },
  might: { damage: { value: 3 }, hp: { value: 10 } },
};

export function rareAffixMagnitude(id: RareAffixId, key: string, level: number): number {
  const def = RARE_AFFIX_BASE[id]?.[key];
  if (!def) return 0;
  return scaleByLevel(def.value, level, def.precision ?? 1);
}

export const LEGENDARY_PASSIVE_BASE: Record<LegendaryPassiveId, Record<string, NumericDef>> = {
  executioner: { damage: { value: 35 } },
  time_weaver: { ap: { value: 1 } },
  immortal_pact: { heal: { value: 50 } },
  archmage_blood: { spellDamage: { value: 30 }, intDiscount: { value: 1 } },
  titan_heart: { hp: { value: 24 }, armor: { value: 2 } },
};

export function legendaryMagnitude(id: LegendaryPassiveId, key: string, level: number): number {
  const def = LEGENDARY_PASSIVE_BASE[id]?.[key];
  if (!def) return 0;
  return scaleByLevel(def.value, level, def.precision ?? 1);
}

export const EPIC_SKILL_BASE: Record<EpicSkillId, Record<string, NumericDef>> = {
  fireball: { base: { value: 20 }, scale: { value: 3.5, precision: 100 }, burn: { value: 4 }, rounds: { value: 3 } },
  blood_lance: { base: { value: 16 }, scale: { value: 2.5, precision: 100 }, leech: { value: 50 } },
  ash_aegis: { base: { value: 16 }, scale: { value: 2.5, precision: 100 } },
  shadow_volley: { base: { value: 16 }, scale: { value: 3, precision: 100 }, rounds: { value: 2 } },
  frost_nova: { base: { value: 16 }, scale: { value: 3, precision: 100 }, rounds: { value: 3 }, stun: { value: 1 } },
};

export function epicMagnitude(id: EpicSkillId, key: string, level: number): number {
  const def = EPIC_SKILL_BASE[id]?.[key];
  if (!def) return 0;
  return scaleByLevel(def.value, level, def.precision ?? 1);
}

/** Требования ИНТ для приёмов снаряжения: 1–5 → 2, 6–8 → 3, 9–10 → 4; силовое — на 1 ниже. */
export function techniqueIntReq(level: number, affinity: "str" | "agi" | "int"): number {
  const l = clampGearLevel(level);
  const tier = l <= 5 ? 2 : l <= 8 ? 3 : 4;
  return affinity === "str" ? Math.max(1, tier - 1) : tier;
}
