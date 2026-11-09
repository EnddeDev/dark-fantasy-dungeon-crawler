/**
 * Навыки архетипа: три ветки на основной архетип, ранг 0–5 в каждой.
 * Ранг 3 открывает эффект «A», ранг 5 — эффект «B». Очки: 1 за каждый уровень выше 5.
 * Очки не зависят от того, прокачан ли архетип: набираются с 6 уровня.
 */
import type { ArchetypeId } from "./archetypes";
import type { Player } from "./types";

/** Выбор архетипа на 5 уровне: очки навыков начинаются с 6. */
export const SKILL_BASE_LEVEL = 5;
/** Потолок уровня героя: очки навыков на 15 уровне — 10. */
export const SKILL_LEVEL_CAP = 15;
export const SKILL_RANK_MAX = 5;
export const SKILL_RANK_A = 3;
export const SKILL_RANK_B = 5;

export type SkillBranchId =
  | "wall" | "fortitude" | "ram"
  | "rage" | "thirst" | "beast"
  | "shadow" | "bladepoison" | "flurry"
  | "poisoner" | "stealth" | "smokeveil"
  | "curse" | "price" | "cooldown"
  | "rewrite" | "sealknow" | "library";

export interface SkillEffectText {
  name: string;
  desc: string;
}

export interface SkillBranchDef {
  id: SkillBranchId;
  archetype: ArchetypeId;
  name: string;
  desc: string;
  /** Ранг 3. */
  a: SkillEffectText;
  /** Ранг 5. */
  b: SkillEffectText;
}

/** Ключ эффекта в бою: ветка + ранг (a = ранг 3, b = ранг 5). */
export type SkillEffectKey = `${SkillBranchId}_${"a" | "b"}`;

export const SKILL_BRANCHES: SkillBranchDef[] = [
  {
    id: "wall", archetype: "bulwark", name: "Стена щитов",
    desc: "Оборона из щита и брони: щит в защите и ответ на удары.",
    a: { name: "Щит в защите", desc: "В защите получаешь щит 15% макс. здоровья до конца раунда; щит поглощает урон первым." },
    b: { name: "Ответный удар", desc: "Пока стоишь в защите, каждый удар врага получает ответ: урон равен броне ÷ 10." },
  },
  {
    id: "fortitude", archetype: "bulwark", name: "Непреклонность",
    desc: "Выживание на грани: защита и лечение, когда здоровья мало.",
    a: { name: "Упорство", desc: "Ниже 30% здоровья: защита +20% и лечение 5% макс. здоровья в начале твоего хода." },
    b: { name: "Последний рубеж", desc: "Один раз за бой, упав ниже 10% здоровья, лечишься на 25% макс. здоровья и оглушаешь врага на ход." },
  },
  {
    id: "ram", archetype: "bulwark", name: "Таран",
    desc: "Удар после защиты: пробить броню и сбить врага с ног.",
    a: { name: "Пробой", desc: "Первая атака после защиты игнорирует 20% брони врага." },
    b: { name: "Ошеломляющий удар", desc: "Первая атака после защиты оглушает врага с шансом 25%." },
  },
  {
    id: "rage", archetype: "barbarian", name: "Кровавая ярость",
    desc: "Чем меньше здоровья, тем яростнее удары.",
    a: { name: "Ярость", desc: "Ниже 50% здоровья: +25% урона и −5 брони." },
    b: { name: "Неостывающая ярость", desc: "Ярость действует и при здоровье героя выше 50%, пока враг ниже 30% здоровья; броня −5 тоже остаётся." },
  },
  {
    id: "thirst", archetype: "barbarian", name: "Жажда крови",
    desc: "Кровь врага возвращает здоровье.",
    a: { name: "Кровопийца", desc: "10% нанесённого урона возвращается здоровьем." },
    b: { name: "Трофей", desc: "Убийство врага возвращает 20% макс. здоровья." },
  },
  {
    id: "beast", archetype: "barbarian", name: "Зверь",
    desc: "Первый удар сокрушительный, добивание неотвратимо.",
    a: { name: "Первый рывок", desc: "Первый удар в бою +50% урона." },
    b: { name: "Добивание", desc: "По врагам ниже 20% здоровья удар не промахивается и наносит +100% урона." },
  },
  {
    id: "shadow", archetype: "assassin", name: "Тень",
    desc: "Скрытность в начале боя и ответ из укрытия.",
    a: { name: "Невидимость", desc: "Первый удар в бою не может быть уклонён врагом." },
    b: { name: "Контрудар из тени", desc: "Раз за раунд, уклонившись от атаки врага, отвечаешь ударом." },
  },
  {
    id: "bladepoison", archetype: "assassin", name: "Яд клинка",
    desc: "Порезы, которые не заживают.",
    a: { name: "Кровоточащий крит", desc: "Критический удар накладывает кровотечение." },
    b: { name: "Глубокий порез", desc: "Кровотечение от крита накладывается дважды." },
  },
  {
    id: "flurry", archetype: "assassin", name: "Серия",
    desc: "Крит продолжает атаку.",
    a: { name: "Добивающая серия", desc: "Критический удар даёт дополнительный удар в этот же ход." },
    b: { name: "Вихрь", desc: "Если крит и враг ниже 50% здоровья, дополнительных ударов два." },
  },
  {
    id: "poisoner", archetype: "ninja", name: "Отравитель",
    desc: "Расходники отравляют цель.",
    a: { name: "Отравленные зелья", desc: "Расходники накладывают яд на 2 раунда." },
    b: { name: "Растущий яд", desc: "Яд врага +1 урон за каждый расходник, использованный в бою." },
  },
  {
    id: "stealth", archetype: "ninja", name: "Незаметность",
    desc: "Быстрые руки и ловкость уклонения.",
    a: { name: "Быстрая рука", desc: "Первый расходник в раунд даёт +2 концентрации вместо +1." },
    b: { name: "Бесшумно", desc: "Расходник после уклонения не тратит выносливость." },
  },
  {
    id: "smokeveil", archetype: "ninja", name: "Дымовая завеса",
    desc: "Дым, который пугает врага.",
    a: { name: "Долгий дым", desc: "Дым действует на 1 ход дольше." },
    b: { name: "Страх тени", desc: "Дым накладывает страх на врага, если его ЛОВ ниже твоей." },
  },
  {
    id: "curse", archetype: "warlock", name: "Проклятие",
    desc: "Приёмы ослабляют врага надолго.",
    a: { name: "Порча приёмом", desc: "Приёмы накладывают проклятие: −30% урона врага на 2 раунда." },
    b: { name: "Ржавчина", desc: "Пока на враге проклятие, его броня −1 за каждый его ход." },
  },
  {
    id: "price", archetype: "warlock", name: "Плата",
    desc: "Приёмы берут цену и платят в ответ.",
    a: { name: "Цена крови", desc: "Приём стоит 5% макс. здоровья (не меньше 1), но возвращает 1 концентрацию." },
    b: { name: "Питание пакта", desc: "После приёма лечишься на 10% урона приёма." },
  },
  {
    id: "cooldown", archetype: "warlock", name: "Откат",
    desc: "Приёмы возвращаются быстрее.",
    a: { name: "Ускоренный откат", desc: "Приём с перезарядкой 3+ раунда сокращает её на 1 после использования." },
    b: { name: "Однократный эпик", desc: "Один раз за бой эпический приём без перезарядки." },
  },
  {
    id: "rewrite", archetype: "sage", name: "Переписывание",
    desc: "Свитки переписываются заново.",
    a: { name: "Вторая копия", desc: "Свиток, который не истлел при использовании, копируется (раз за бой)." },
    b: { name: "Лёгкая копия", desc: "Копия свитка не тратит выносливость." },
  },
  {
    id: "sealknow", archetype: "sage", name: "Печать знания",
    desc: "Свитки накладывают печати на врага.",
    a: { name: "Печать свитка", desc: "Свитки накладывают печать на врага: запрет приёмов на 1 ход." },
    b: { name: "Долгая печать", desc: "Печать от свитка держится 2 хода." },
  },
  {
    id: "library", archetype: "sage", name: "Библиотека",
    desc: "Знание копится и выплёскивается в свитках.",
    a: { name: "Накопление", desc: "Следующий свиток в бою получает +1 урона от предыдущего." },
    b: { name: "Бесплатный свиток", desc: "Каждый третий свиток в бою не тратит выносливость." },
  },
];

export function skillBranchesOf(archetype: ArchetypeId): SkillBranchDef[] {
  return SKILL_BRANCHES.filter((b) => b.archetype === archetype);
}

export function skillBranchById(id: string): SkillBranchDef | null {
  return SKILL_BRANCHES.find((b) => b.id === id) ?? null;
}

/** Очки навыков, заработанные к этому уровню: по одному за каждый уровень выше 5. */
export function skillPointsEarned(level: number): number {
  const lvl = Math.max(1, Math.min(SKILL_LEVEL_CAP, Math.floor(level)));
  return Math.max(0, lvl - SKILL_BASE_LEVEL);
}

export function skillPointsSpent(ranks: Record<string, number> | undefined): number {
  if (!ranks) return 0;
  return Object.values(ranks).reduce((sum, r) => sum + Math.max(0, Math.floor(r)), 0);
}

export function skillPointsAvailable(player: Pick<Player, "level" | "skillRanks">): number {
  return skillPointsEarned(player.level) - skillPointsSpent(player.skillRanks);
}

export function skillRankOf(player: Pick<Player, "skillRanks">, branch: SkillBranchId): number {
  return Math.max(0, Math.min(SKILL_RANK_MAX, player.skillRanks?.[branch] ?? 0));
}

/**
 * Ранг ветки. Прирост списывает очко; снижение возвращает его.
 * Ветки чужого архетипа и ранги вне 0–5 не меняются.
 */
export function setSkillRank(player: Player, branch: SkillBranchId, rank: number): Player {
  const def = skillBranchById(branch);
  if (!def || def.archetype !== player.archetype) return player;
  if (!Number.isInteger(rank) || rank < 0 || rank > SKILL_RANK_MAX) return player;
  const current = skillRankOf(player, branch);
  if (rank === current) return player;
  if (rank > current && skillPointsAvailable(player) < rank - current) return player;
  return { ...player, skillRanks: { ...(player.skillRanks ?? {}), [branch]: rank } };
}

/** Эффекты, которые действуют в бою: только ветки основного архетипа. */
export function activeSkillEffects(player: Pick<Player, "archetype" | "skillRanks">): SkillEffectKey[] {
  if (!player.archetype) return [];
  const out: SkillEffectKey[] = [];
  for (const def of skillBranchesOf(player.archetype)) {
    const rank = skillRankOf(player, def.id);
    if (rank >= SKILL_RANK_A) out.push(`${def.id}_a`);
    if (rank >= SKILL_RANK_B) out.push(`${def.id}_b`);
  }
  return out;
}
