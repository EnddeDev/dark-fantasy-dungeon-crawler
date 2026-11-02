/**
 * Рост снаряжения — линейный, без сложного процента.
 *
 *   основные параметры (урон, броня, ОЗ, уклонение): ×(1 + 0.5 × уровень);
 *   эффекты, свойства, приёмы, пассивки и цены:        ×(1 + 0.17 × уровень).
 *
 * Уровень берётся как есть (1…10), значение округляется вверх один раз — на итоговом шаге.
 */
import type { GearEffectId, GearPassiveId } from "./gearEffects";
import type { EpicSkillId, LegendaryPassiveId, RareAffixId } from "./types";

/** Шаг эффектов, свойств и цен: +17% от базового значения за каждый уровень. */
export const GEAR_EFFECT_RATE = 0.17;
/** Шаг основных параметров: +50% от базового значения за каждый уровень. */
export const GEAR_STAT_RATE = 0.5;
/** Прежнее имя шага эффектов. */
export const GEAR_LEVEL_GROWTH = GEAR_EFFECT_RATE;
/**
 * Двуручное оружие бьёт вдвое сильнее одноручного аналога.
 * Раньше коэффициент был ×3 — теперь базовый урон двуручников пересчитан на ×2.
 */
export const TWO_HAND_VS_ONE_HAND = 2;
export const TWO_HAND_LEGACY_FACTOR = 3;
export const TWO_HAND_DAMAGE_SCALE = TWO_HAND_VS_ONE_HAND / TWO_HAND_LEGACY_FACTOR;
/** Дополнительных ходов от снаряжения не бывает больше трёх. */
export const MAX_EXTRA_AP = 3;
/** Уровень предмета, с которого может выпасть свойство дополнительного хода. */
export const EXTRA_AP_MIN_LEVEL = 5;
export const GEAR_STAT_GROWTH = GEAR_STAT_RATE;
export const MAX_GEAR_LEVEL = 10;

export function clampGearLevel(level: number | undefined): number {
  return Math.max(1, Math.min(MAX_GEAR_LEVEL, Math.floor(level ?? 1)));
}

/** Множитель уровня: 1 + rate × уровень. */
export function levelFactor(level: number, rate: number): number {
  return 1 + rate * clampGearLevel(level);
}

/** Эффекты и свойства: ceil(значение × (1 + 0.17 × уровень)). */
export function scaleByLevel(value: number, level: number, precision = 1): number {
  return Math.ceil(value * levelFactor(level, GEAR_EFFECT_RATE) * precision - 1e-9) / precision;
}

/**
 * Дискретные количества (число ударов приёма, лишние предметы) считаются от базы:
 * 1 + 0.17 × (уровень − 1). Иначе «двойной удар» на первом уровне бил бы три раза.
 */
export function scaleIntegerByLevel(value: number, level: number): number {
  const factor = 1 + GEAR_EFFECT_RATE * (clampGearLevel(level) - 1);
  return Math.ceil(Math.ceil(value) * factor - 1e-9);
}

/** Основные параметры предмета: ceil(значение × (1 + 0.5 × уровень)). */
export function scaleGearStatByLevel(value: number, level: number): number {
  return Math.ceil(Math.ceil(value) * levelFactor(level, GEAR_STAT_RATE));
}

/** Процент хранится как целое число процентных пунктов: 5 → 7 → 9 → 10… */
export function scalePercentByLevel(percent: number, level: number): number {
  return scaleByLevel(percent, level, 1);
}

/** Множитель хранится в сотых: 1.8 на 2 уровне → 2.41. */
export function scaleMultByLevel(mult: number, level: number): number {
  return scaleByLevel(Math.round(mult * 100), level, 1) / 100;
}

/** Множитель уровня для цен и сравнений: 1 + 0.17 × уровень. */
export function gearLevelMultiplier(level: number): number {
  return levelFactor(level, GEAR_EFFECT_RATE);
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
  poison_damage: { value: 30 },
  bleed: { value: 35 },
  sunder: { value: 30 },
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
  poison_damage: 6, bleed: 7, sunder: 6,
};

export function rollEffectBase(id: GearEffectId, rng: () => number = Math.random): number {
  const base = GEAR_EFFECT_BASE[id]?.value ?? 0;
  const spread = GEAR_EFFECT_SPREAD[id] ?? 0;
  if (!spread) return base;
  return Math.max(0, base + Math.floor(rng() * (spread * 2 + 1)) - spread);
}

export function effectMagnitude(id: GearEffectId, level: number, rolledBase?: number): number {
  if (id === "ap") {
    /* Дополнительные ходы: свойство появляется с 5 уровня и даёт не больше трёх ходов. */
    const l = clampGearLevel(level);
    if (l < EXTRA_AP_MIN_LEVEL) return 0;
    return Math.min(MAX_EXTRA_AP, l >= 9 ? 3 : l >= 7 ? 2 : 1);
  }
  const def = GEAR_EFFECT_BASE[id];
  const base = rolledBase ?? def.value;
  /* Базовые значения свойств заданы на 1 уровне: дальше +17% за каждый уровень. */
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
