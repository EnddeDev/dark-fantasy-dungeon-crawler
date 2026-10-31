/**
 * Эффекты боссов и катастроф «как у снаряжения».
 * Пул зависит от типа существа, сила скейлится от уровня монстра тем же gearScaling.
 */
import type { CreatureType, EnemyDef } from "./content";
import type { GearEffectId } from "./gearEffects";
import { effectMagnitude } from "./gearScaling";

const TYPE_POOLS: Record<CreatureType, GearEffectId[]> = {
  construct: ["damage_resist", "thorns", "regen", "resist", "guard_bonus", "armor_damage", "stun_chance"],
  undead: ["damage_resist", "regen", "resist", "vamp_str", "thorns", "guard_bonus", "stun_chance"],
  beast: ["stun_chance", "vamp_str", "missing_hp_damage", "enemy_missing_damage", "crit_chance", "evade"],
  humanoid: ["evade", "counter", "crit_chance", "crit_mult", "vamp", "first_strike"],
  demon: ["skill_damage", "status_duration", "vamp", "crit_mult", "debuff_damage", "missing_hp_damage"],
};

export const BOSS_EFFECT_RESIST = 0.25;

export function rollEnemyEffects(
  def: EnemyDef,
  _level: number,
  count: number,
  rng: () => number = Math.random,
): GearEffectId[] {
  const source = TYPE_POOLS[def.type] ?? TYPE_POOLS.beast;
  let pool = [...source];
  const out: GearEffectId[] = [];
  while (out.length < count) {
    if (!pool.length) pool = [...source];
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

export function enemyEffectPower(effects: GearEffectId[], level: number): Partial<Record<GearEffectId, number>> {
  const out: Partial<Record<GearEffectId, number>> = {};
  for (const id of effects) out[id] = (out[id] ?? 0) + effectMagnitude(id, level);
  return out;
}
