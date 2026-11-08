/**
 * Полный список эффектов героя и монстра для вкладки «Эффекты» в бою.
 *
 * Чистые функции: только читают данные. Статусы берутся из effects.ts,
 * здесь — то, что висит постоянно: свойства и пассивы вещей, изученные
 * способности героя и врождённые свойства монстра.
 */
import type { EnemyPassive, GearItem } from "./types";
import { GEAR_EFFECTS, GEAR_PASSIVES, effectTotalDetail, passiveDetail, type GearEffectId } from "./gearEffects";
import { gearEffectTotals } from "./gearEffectTotals";
import { ARCHETYPES, LEGENDARY_PASSIVES, PASSIVES, RARE_AFFIXES, STAT_META, STAT_ORDER, legendaryPassiveDesc, rareAffixDesc } from "./content";
import { archetypeByMilestone } from "./archetypes";
import { statMilestoneById } from "./statMilestones";

/** Одна строка вкладки: название, что делает, и короткая пометка справа (срок, источник). */
export interface TabEffect {
  id: string;
  name: string;
  detail: string;
  meta?: string;
  negative?: boolean;
}

/**
 * Эффекты надетых исследованных вещей: числовые свойства (с суммой по предметам),
 * пассивы, редкие аффиксы и легендарные свойства. Титанова сердца здесь нет:
 * его иммунитет уже показан статусом героя.
 */
export function heroItemEffects(items: GearItem[]): TabEffect[] {
  const out: TabEffect[] = [];
  const seen = new Set<string>();
  const add = (key: string, entry: TabEffect) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };
  for (const total of gearEffectTotals(items)) {
    out.push({ id: `item-effect-${total.id}`, name: total.name, detail: total.detail, meta: "снаряжение" });
  }
  for (const item of items) {
    const level = item.level ?? 1;
    if (item.passive && GEAR_PASSIVES[item.passive]) {
      add(`passive-${item.passive}`, {
        id: `item-passive-${item.passive}`,
        name: GEAR_PASSIVES[item.passive].name,
        detail: passiveDetail(item.passive, level),
        meta: "пассив предмета",
      });
    }
    if (item.rareAffix && RARE_AFFIXES[item.rareAffix]) {
      add(`affix-${item.rareAffix}`, {
        id: `item-affix-${item.rareAffix}`,
        name: RARE_AFFIXES[item.rareAffix].name,
        detail: rareAffixDesc(item.rareAffix, level),
        meta: "редкий аффикс",
      });
    }
    if (item.legendaryPassive && item.legendaryPassive !== "titan_heart" && LEGENDARY_PASSIVES[item.legendaryPassive]) {
      add(`legendary-${item.legendaryPassive}`, {
        id: `item-legendary-${item.legendaryPassive}`,
        name: LEGENDARY_PASSIVES[item.legendaryPassive].name,
        detail: legendaryPassiveDesc(item.legendaryPassive, level),
        meta: "легендарное",
      });
    }
  }
  return out;
}

/** Изученные способности героя: рубежи характеристик, пассивы архетипов и ветки. */
export function learnedEffects(passives: string[]): TabEffect[] {
  return passives.flatMap((id): TabEffect[] => {
    const sm = statMilestoneById(id);
    if (sm) {
      const arch = ARCHETYPES[sm.archetype];
      return [{ id: `learned-${id}`, name: sm.name, detail: sm.desc, meta: `${STAT_META[sm.stat].name} ${sm.tier} · ${arch.name}` }];
    }
    const arch = archetypeByMilestone(id);
    if (arch) {
      const m = arch.milestone5.id === id ? arch.milestone5 : arch.milestone10;
      return [{ id: `learned-${id}`, name: m.name, detail: m.desc, meta: `${arch.name} · ${STAT_META[arch.stat].name}` }];
    }
    for (const stat of STAT_ORDER) {
      for (const tier of ["5", "10"] as const) {
        const passive = PASSIVES[stat][tier].find((entry) => entry.id === id);
        if (passive) return [{ id: `learned-${id}`, name: passive.name, detail: passive.desc, meta: `${STAT_META[stat].name}, рубеж ${tier}` }];
      }
    }
    return [];
  });
}

/**
 * Врождённые свойства монстра: эффекты его рода и пассив. Регенерация и шипы
 * пропускаются: они уже показаны иконками статусов.
 */
export function enemyEffects(e: {
  effects: GearEffectId[];
  effectPower: Partial<Record<GearEffectId, number>>;
  passive: EnemyPassive | null;
}): TabEffect[] {
  const out: TabEffect[] = [];
  const ids = [...new Set(e.effects)].filter((id) => id !== "regen" && id !== "thorns" && (e.effectPower[id] ?? 0) > 0);
  for (const id of ids) {
    out.push({
      id: `foe-effect-${id}`,
      name: GEAR_EFFECTS[id]?.name ?? id,
      detail: effectTotalDetail(id, e.effectPower[id] ?? 0),
      meta: "врождённое",
    });
  }
  if (e.passive) {
    out.push({ id: `foe-passive-${e.passive.id}`, name: e.passive.name, detail: e.passive.desc, meta: "пассив" });
  }
  return out;
}
