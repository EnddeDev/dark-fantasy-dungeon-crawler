/**
 * Эффекты боссов и катастроф «как у снаряжения».
 * Пул зависит от типа существа, сила скейлится от уровня монстра тем же gearScaling.
 */
import type { CreatureType, EnemyDef } from "./content";
import type { GearEffectId } from "./gearEffects";
import { effectMagnitude } from "./gearScaling";
import { combineChances } from "./chances";

const TYPE_POOLS: Record<CreatureType, GearEffectId[]> = {
  construct: ["fortify", "thorns", "regen", "armor_damage", "magic_resist"],
  undead: ["magic_resist", "regen", "magic_vamp", "thorns", "fortify"],
  beast: ["rage", "vamp", "crit_chance", "crit_mult", "ap"],
  humanoid: ["crit_chance", "crit_mult", "vamp", "ap", "fortify"],
  demon: ["magic_vamp", "rage", "crit_mult", "magic_resist", "fortify"],
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

/** Вероятностные свойства врага перемножаются, а не складываются. */
export function enemyChance(effects: GearEffectId[], level: number, id: GearEffectId): number {
  return combineChances(effects.filter((x) => x === id).map(() => effectMagnitude(id, level) / 100));
}
