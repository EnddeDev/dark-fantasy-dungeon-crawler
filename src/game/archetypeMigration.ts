import { SKILL_NODES, SKILL_RANK_MAX, skillNodeById } from "./archetypeSkills";

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
 * Ранги навыков из сохранения. Ранги хранятся по узлам дерева (`<ветка>_<узел>`).
 * Старые ветки (без узлов) и узлы чужого архетипа отбрасываются; ранги обрезаются до 0–3.
 * Узел без открытого предка (приём без пассива, усиление без приёма) тоже отбрасывается.
 */
export function migrateSkillRanks(
  ranks: unknown,
  archetype: string | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!ranks || typeof ranks !== "object" || !archetype) return out;
  for (const [id, value] of Object.entries(ranks as Record<string, unknown>)) {
    const node = skillNodeById(id);
    if (!node || node.archetype !== archetype) continue;
    const rank = Math.min(SKILL_RANK_MAX, Math.floor(Number(value)));
    if (rank > 0) out[id] = rank;
  }
  /* SKILL_NODES идёт по порядку ветки: предок всегда раньше потомка. */
  for (const node of SKILL_NODES) {
    if (node.archetype !== archetype || !out[node.id]) continue;
    if (node.requires && !out[node.requires]) delete out[node.id];
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
