import { ARCHETYPES, ARCHETYPE_ORDER, type ArchetypeId } from "./archetypes";
import type { Player, StatKey } from "./types";

export type StatMilestoneTier = 5 | 10;

export interface StatMilestoneOption {
  id: string;
  archetype: ArchetypeId;
  stat: StatKey;
  tier: StatMilestoneTier;
  name: string;
  desc: string;
}

export type StatMilestoneChoices = Partial<Record<StatKey, Partial<Record<StatMilestoneTier, string>>>>;

const STAT_ORDER: StatKey[] = ["str", "agi", "int"];
const TIERS: StatMilestoneTier[] = [5, 10];

/** На каждом рубеже характеристики ровно два варианта: по одному на архетип этой характеристики. */
export function statMilestoneOptions(stat: StatKey, tier: StatMilestoneTier): [StatMilestoneOption, StatMilestoneOption] {
  const ids = ARCHETYPE_ORDER.filter((id) => ARCHETYPES[id].stat === stat);
  if (ids.length !== 2) throw new Error(`Для ${stat} должно быть два архетипа`);
  return ids.map((id) => {
    const a = ARCHETYPES[id];
    const m = tier === 5 ? a.milestone5 : a.milestone10;
    return { id: m.id, archetype: id, stat, tier, name: m.name, desc: m.desc };
  }) as [StatMilestoneOption, StatMilestoneOption];
}

export function statMilestoneById(id: string): StatMilestoneOption | null {
  for (const stat of STAT_ORDER) {
    for (const tier of TIERS) {
      const found = statMilestoneOptions(stat, tier).find((o) => o.id === id);
      if (found) return found;
    }
  }
  return null;
}

export function chosenStatMilestone(player: Player, stat: StatKey, tier: StatMilestoneTier): StatMilestoneOption | null {
  const id = player.statMilestones?.[stat]?.[tier];
  if (!id) return null;
  return statMilestoneOptions(stat, tier).find((o) => o.id === id) ?? null;
}

export function canChooseStatMilestone(player: Player, stat: StatKey, tier: StatMilestoneTier): boolean {
  return player.stats[stat] >= tier && !chosenStatMilestone(player, stat, tier);
}

/** Выбор не меняет основной архетип: можно усилить свой путь или взять усиление соседнего. */
export function chooseStatMilestone(player: Player, stat: StatKey, tier: StatMilestoneTier, id: string): Player {
  if (!canChooseStatMilestone(player, stat, tier)) return player;
  const option = statMilestoneOptions(stat, tier).find((o) => o.id === id);
  if (!option) return player;
  const statChoices = { ...(player.statMilestones?.[stat] ?? {}), [tier]: id };
  return {
    ...player,
    statMilestones: { ...(player.statMilestones ?? {}), [stat]: statChoices },
    passives: player.passives.includes(id) ? player.passives : [...player.passives, id],
  };
}

export function pendingStatMilestones(player: Player): { stat: StatKey; tier: StatMilestoneTier }[] {
  const out: { stat: StatKey; tier: StatMilestoneTier }[] = [];
  for (const stat of STAT_ORDER) {
    for (const tier of TIERS) {
      if (canChooseStatMilestone(player, stat, tier)) out.push({ stat, tier });
    }
  }
  return out;
}

/**
 * Миграция сохранений: старые автоматические пассивы архетипа превращаются в выбор рубежа,
 * если характеристика уже дотянула до порога. Если нет — пассив снимается, а выбор откроется позже.
 */
export function normalizeStatMilestones(player: Player): Player {
  const choices: StatMilestoneChoices = { ...(player.statMilestones ?? {}) };
  let passives = [...player.passives];
  for (const stat of STAT_ORDER) {
    for (const tier of TIERS) {
      const options = statMilestoneOptions(stat, tier);
      const ids = options.map((o) => o.id);
      let chosen = choices[stat]?.[tier];
      if (!chosen || !ids.includes(chosen)) {
        chosen = ids.find((id) => passives.includes(id));
      }
      if (chosen && player.stats[stat] >= tier) {
        choices[stat] = { ...(choices[stat] ?? {}), [tier]: chosen };
        passives = passives.filter((id) => !ids.includes(id) || id === chosen);
        if (!passives.includes(chosen)) passives.push(chosen);
      } else {
        passives = passives.filter((id) => !ids.includes(id));
        if (choices[stat]?.[tier]) {
          const rest = { ...choices[stat] };
          delete rest[tier];
          choices[stat] = rest;
        }
      }
    }
  }
  return { ...player, statMilestones: choices, passives: [...new Set(passives)] };
}
