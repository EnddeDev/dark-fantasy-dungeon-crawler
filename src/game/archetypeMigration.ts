import { skillBranchById } from "./archetypeSkills";

/**
 * Переименованные id архетипов, рубежей, спец-приёмов и предметов.
 * Старые сохранения читаются через эту таблицу: неизвестный id не трогаем.
 */
const RENAMED_IDS: Record<string, string> = {
  ninja: "duelist",
  sage: "archmage",
  arch_ninja_5: "arch_duelist_5",
  arch_ninja_10: "arch_duelist_10",
  arch_sage_5: "arch_archmage_5",
  arch_sage_10: "arch_archmage_10",
  ninja_special: "duelist_special",
  sage_special: "archmage_special",
  ninja_kusarigama: "duelist_kusarigama",
  sage_censer: "archmage_censer",
  ninja_phantom: "duelist_phantom",
  sage_library: "archmage_library",
};

/**
 * Ветки навыков, которых больше нет. Ранги в сохранении отбрасываются, и очки возвращаются игроку.
 * Ветки с тем же id (`curse`, `vow`, …) сохраняют ранг, даже если их эффект изменился.
 */
const RETIRED_SKILL_IDS = new Set([
  "poisoner", "stealth", "smokeveil",
  "rewrite", "sealknow", "library",
  "price", "cooldown",
]);

/** Ранги навыков из сохранения: удалённые ветки убираются, остальные — только текущих веток этого архетипа. */
export function migrateSkillRanks(
  ranks: unknown,
  archetype: string | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!ranks || typeof ranks !== "object" || !archetype) return out;
  for (const [id, value] of Object.entries(ranks as Record<string, unknown>)) {
    if (RETIRED_SKILL_IDS.has(id)) continue;
    const def = skillBranchById(id);
    if (!def || def.archetype !== archetype) continue;
    const rank = Math.floor(Number(value));
    if (rank > 0) out[id] = rank;
  }
  return out;
}

/** Новый id по старому; если id не переименован, возвращается как есть. */
export function migrateLegacyId(id: string): string {
  return RENAMED_IDS[id] ?? id;
}

/** Список пассивов из сохранения: старые id переводятся, дубликаты убираются. */
export function migrateLegacyPassives(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const next = migrateLegacyId(id);
    if (!out.includes(next)) out.push(next);
  }
  return out;
}
