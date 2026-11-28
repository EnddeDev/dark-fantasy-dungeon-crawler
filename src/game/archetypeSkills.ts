/**
 * Навыки архетипа: одно дерево на архетип, корень — архетип, три ветки.
 *
 * В ветке четыре узла:
 *   1. пассив — даёт эффект до приёма;
 *   2. приём — техника оружия, которую усиливает пассив (требует пассив);
 *   3. усиление приёма и 4. новый эффект приёма — развилка, берутся вместе (требуют приём).
 *
 * Каждый узел качается от 0 до 3. Ранг 0 — узел не открыт, эффекта нет.
 * Числа в `values` заданы для рангов 1, 2, 3 (индекс = ранг − 1).
 * Очки: 1 за каждый уровень выше 5; на 15 уровне — 10. Полное дерево архетипа — 36.
 */
import type { ArchetypeId } from "./archetypes";
import type { Player } from "./types";

/** Выбор архетипа на 5 уровне: очки навыков начинаются с 6. */
export const SKILL_BASE_LEVEL = 5;
/** Потолок уровня героя: очки навыков на 15 уровне — 10. */
export const SKILL_LEVEL_CAP = 15;
/** Максимальный ранг одного узла. */
export const SKILL_RANK_MAX = 3;

export type SkillNodeKind = "passive" | "technique" | "upgrade" | "effect";

/** Числа узла по рангам: [ранг 1, ранг 2, ранг 3]. */
export type SkillValues = Record<string, [number, number, number]>;

export interface SkillNodeDef {
  /** Id узла: `<ветка>_<passive|tech|up|fx>`. */
  id: string;
  branch: string;
  archetype: ArchetypeId;
  kind: SkillNodeKind;
  name: string;
  /** Текст с подстановками `{ключ}` из `values`. */
  desc: string;
  values: SkillValues;
  /** Для приёма: id техники оружия из `TECHNIQUE_POOL`. */
  technique?: string;
  /** Узел, который должен быть открыт (ранг ≥ 1) до этого. */
  requires: string | null;
}

export interface SkillBranchDef {
  id: string;
  archetype: ArchetypeId;
  name: string;
  desc: string;
  /** Порядок: пассив, приём, усиление, эффект. */
  nodes: SkillNodeDef[];
}

interface NodeInit {
  name: string;
  desc: string;
  values?: SkillValues;
}

interface BranchInit {
  id: string;
  archetype: ArchetypeId;
  name: string;
  desc: string;
  passive: NodeInit;
  tech: NodeInit & { technique: string };
  up: NodeInit;
  fx: NodeInit;
}

function buildBranch(init: BranchInit): SkillBranchDef {
  const passiveId = `${init.id}_passive`;
  const techId = `${init.id}_tech`;
  const make = (
    kind: SkillNodeKind,
    n: NodeInit,
    requires: string | null,
    technique?: string,
  ): SkillNodeDef => ({
    id: `${init.id}_${kind === "passive" ? "passive" : kind === "technique" ? "tech" : kind === "upgrade" ? "up" : "fx"}`,
    branch: init.id,
    archetype: init.archetype,
    kind,
    name: n.name,
    desc: n.desc,
    values: n.values ?? {},
    requires,
    ...(technique ? { technique } : {}),
  });
  return {
    id: init.id,
    archetype: init.archetype,
    name: init.name,
    desc: init.desc,
    nodes: [
      make("passive", init.passive, null),
      make("technique", init.tech, passiveId, init.tech.technique),
      make("upgrade", init.up, techId),
      make("effect", init.fx, techId),
    ],
  };
}

const BRANCH_INITS: BranchInit[] = [
  // ── Варвар: секира кровавого обета ──
  {
    id: "rage", archetype: "barbarian", name: "Ярость",
    desc: "Озлобление копится от ударов врага и тратится на размах.",
    passive: { name: "Озлобление", desc: "Каждый удар врага по тебе даёт стак. Максимум стаков: {max}.", values: { max: [2, 3, 4] } },
    tech: { name: "Яростный размах", technique: "rage_sweep", desc: "Два удара подряд. Тратит все стаки: каждый удар +{perStack}% урона за стак.", values: { perStack: [3, 5, 7] } },
    up: { name: "Остаток ярости", desc: "Размах оставляет стаков: {keep}.", values: { keep: [1, 2, 3] } },
    fx: { name: "Оглушающая ярость", desc: "При 3+ стаках каждый удар размаха оглушает врага с шансом {chance}%.", values: { chance: [10, 15, 20] } },
  },
  {
    id: "thirst", archetype: "barbarian", name: "Жажда",
    desc: "Кровь врага возвращает здоровье, раскол черепа пьёт её сильнее.",
    passive: { name: "Кровавый след", desc: "{pct}% нанесённого урона возвращается здоровьем.", values: { pct: [5, 8, 10] } },
    tech: { name: "Раскол черепа", technique: "skull_split", desc: "Урон +6% за каждые 10% недостающего здоровья врага. На этом ударе «Кровавый след» ×{mult}.", values: { mult: [2, 2.5, 3] } },
    up: { name: "Предел раскола", desc: "Потолок бонуса {cap}% (вместо 60%).", values: { cap: [70, 80, 90] } },
    fx: { name: "Кровотечение", desc: "Удар накладывает кровотечение на {rounds} раунда.", values: { rounds: [2, 3, 4] } },
  },
  {
    id: "windup", archetype: "barbarian", name: "Замах",
    desc: "Удар после защиты тяжелее, полный замах ломает ход врагу.",
    passive: { name: "Тяжёлый замах", desc: "Если в прошлом ходу ты стоял в защите, первый удар в этом ходу +{bonus}% урона.", values: { bonus: [15, 25, 35] } },
    tech: { name: "Кровавый расчёт", technique: "blood_reckoning", desc: "Урон оружия + 0,5×СИЛ за каждый ранг приёма; +6% за каждые 10% недостающего здоровья. Получает бонус замаха.", values: { str: [0.5, 1, 1.5] } },
    up: { name: "Бонус замаха", desc: "Бонус замаха для этого приёма +{bonus}%.", values: { bonus: [5, 10, 15] } },
    fx: { name: "Полный замах", desc: "При полном замахе враг пропускает следующий ход с шансом {chance}%.", values: { chance: [20, 30, 40] } },
  },

  // ── Бастион: булава бастиона ──
  {
    id: "wall", archetype: "bulwark", name: "Стена",
    desc: "Броня копится в защите и становится щитом.",
    passive: { name: "Упор", desc: "Каждый ход в защите подряд +{armor} брони (максимум +{max}). Атака сбрасывает.", values: { armor: [2, 3, 4], max: [6, 9, 12] } },
    tech: { name: "Стена щитов", technique: "bulwark_wall", desc: "Защита на 2 хода и +4 брони до конца боя. Тратит броню Упора: щит ×{ratio} от неё, он поглощает урон первым.", values: { ratio: [0.5, 0.75, 1] } },
    up: { name: "Прочная стена", desc: "Броня до конца боя сверх +4: +{armor}.", values: { armor: [1, 2, 3] } },
    fx: { name: "Ответ на осаду", desc: "Удар врага по твоей защите оглушает его с шансом {chance}%.", values: { chance: [10, 20, 30] } },
  },
  {
    id: "answer", archetype: "bulwark", name: "Ответ",
    desc: "Тяжесть брони в ударах и ответ, который ломает броню врага.",
    passive: { name: "Тяжесть", desc: "За каждые 10 брони +{pct}% урона твоих ударов.", values: { pct: [2, 3, 4] } },
    tech: { name: "Ответ бастиона", technique: "bulwark_answer", desc: "Броня переводится в урон с 50%. Бонус Тяжести добавляется к этой доле на этом ударе. Включает Защиту." },
    up: { name: "Доля брони", desc: "Доля брони в уроне {share}% (вместо 50%).", values: { share: [60, 70, 80] } },
    fx: { name: "Сломанный ответ", desc: "Враг получает −{armor} брони на 2 раунда.", values: { armor: [1, 2, 3] } },
  },
  {
    id: "verdict", archetype: "bulwark", name: "Приговор",
    desc: "Шипы на броне копятся от ударов врага и тратятся на приговор.",
    passive: { name: "Шипы", desc: "Каждый физический удар врага даёт стак шипов. Максимум стаков: {max}. Стаки держатся до конца боя.", values: { max: [3, 4, 5] } },
    tech: { name: "Приговор лат", technique: "bulwark_verdict", desc: "Урон оружия + 2,2×СИЛ и +75% брони к урону. Тратит все шипы: +5% к броне-урону за стак." },
    up: { name: "Остаток шипов", desc: "Приговор оставляет стаков: {keep}.", values: { keep: [1, 2, 3] } },
    fx: { name: "Сломанная броня", desc: "Удар накладывает «Сломанную броню»: −{armor} брони врагу на 2 раунда.", values: { armor: [2, 3, 4] } },
  },

  // ── Ассасин: стилет ──
  {
    id: "mark", archetype: "assassin", name: "Чутьё",
    desc: "Криты копят чутьё, метка смерти тратит его.",
    passive: { name: "Чутьё", desc: "Каждый критический удар даёт стак (максимум {max}). Каждый стак +2% шанса крита.", values: { max: [3, 4, 5] } },
    tech: { name: "Метка смерти", technique: "death_mark", desc: "Урон оружия + 2,2×ЛОВ. Тратит все стаки чутья: +4% урона за стак." },
    up: { name: "Долгая метка", desc: "Крит гарантирован {rounds} раундов (вместо 2).", values: { rounds: [3, 4, 5] } },
    fx: { name: "Эхо метки", desc: "После окончания метки первый крит по врагу с шансом {chance}% срабатывает ещё раз.", values: { chance: [25, 40, 60] } },
  },
  {
    id: "rush", archetype: "assassin", name: "Разгон",
    desc: "Атака подряд разгоняет первый удар хода.",
    passive: { name: "Разгон", desc: "Если в прошлом ходу ты атаковал, первый удар в этом ходу +{bonus}% урона.", values: { bonus: [10, 15, 20] } },
    tech: { name: "Парные клыки", technique: "twin_fangs", desc: "Два удара подряд. Оба удара получают бонус Разгона, если он активен." },
    up: { name: "Второй удар", desc: "Второй удар +{bonus}% урона.", values: { bonus: [20, 30, 40] } },
    fx: { name: "Рваные клыки", desc: "Каждый удар накладывает кровотечение на {rounds} раунд(ов).", values: { rounds: [1, 2, 3] } },
  },
  {
    id: "quiet", archetype: "assassin", name: "Тихий шаг",
    desc: "Начало боя за тобой не угнаться, удар открытия открывает бой.",
    passive: { name: "Тихий шаг", desc: "В первые 2 раунда враг промахивается по тебе с шансом {miss}%.", values: { miss: [10, 15, 20] } },
    tech: { name: "Удар открытия", technique: "opening_strike", desc: "Урон оружия + 2,4×ЛОВ; в окне открытия урон удваивается. Если враг промахнулся по тебе, следующий удар критует." },
    up: { name: "Долгое открытие", desc: "Окно открытия — первые {rounds} раунда(ов) (вместо 2).", values: { rounds: [3, 4, 5] } },
    fx: { name: "Слабое место", desc: "Враг получает +{pct}% урона от всех ударов на 2 раунда.", values: { pct: [5, 10, 15] } },
  },

  // ── Дуэлянт: кусарикама ──
  {
    id: "shade", archetype: "duelist", name: "Тень на ране",
    desc: "Негативные эффекты на враге копят комбо и усиливают захват.",
    passive: { name: "Тень на ране", desc: "Каждый негативный эффект на враге даёт 1 стак комбо (максимум {max}).", values: { max: [3, 4, 5] } },
    tech: { name: "Теневой захват", technique: "shadow_snare", desc: "Урон оружия + 1,8×ЛОВ. Каждый стак комбо тоже считается как негативный эффект: +10% урона за каждый." },
    up: { name: "Потолок тени", desc: "Потолок бонуса {cap}% (вместо 40%).", values: { cap: [50, 60, 70] } },
    fx: { name: "Оглушающий захват", desc: "Захват оглушает врага на 1 ход с шансом {chance}%.", values: { chance: [10, 20, 30] } },
  },
  {
    id: "venom", archetype: "duelist", name: "Яд на клинке",
    desc: "Контратаки отравляют врага, цепь продлевает яд.",
    passive: { name: "Яд на клинке", desc: "Каждая контратака отравляет врага на 1 раунд: {pct}% макс. ОЗ за ход.", values: { pct: [2, 3, 4] } },
    tech: { name: "Ядовитая цепь", technique: "venom_chain", desc: "Урон оружия + 1,6×ЛОВ и отравление на 3 раунда. Если враг уже отравлен, срок продлевается на {ext} раунд(ов).", values: { ext: [1, 2, 3] } },
    up: { name: "Цепь яда", desc: "Отравление цепи +{pct}% макс. ОЗ врага за ход.", values: { pct: [1, 2, 3] } },
    fx: { name: "Паралич яда", desc: "Отравленный враг пропускает свой ход с шансом {chance}%.", values: { chance: [10, 15, 20] } },
  },
  {
    id: "wait", archetype: "duelist", name: "Выжидание",
    desc: "Тот, кто выжидал, бьёт первым; контратака оглушает.",
    passive: { name: "Выжидание", desc: "Если в прошлом раунде ты не атаковал, первый удар +{bonus}% урона.", values: { bonus: [10, 15, 20] } },
    tech: { name: "Встречный выпад", technique: "empty_step", desc: "Урон оружия + 1,5×ЛОВ; если враг атаковал в прошлом раунде — контратака. Выпад получает бонус Выжидания." },
    up: { name: "Быстрый выпад", desc: "Контратака не тратит перезарядку." },
    fx: { name: "Оглушающая контра", desc: "Контратака оглушает врага на 1 ход с шансом {chance}%.", values: { chance: [10, 20, 30] } },
  },

  // ── Колдун: скипетр пакта ──
  {
    id: "reserve", archetype: "warlock", name: "Запас крови",
    desc: "Цена пакта копится и уходит в отток.",
    passive: { name: "Запас крови", desc: "{pct}% здоровья, потраченного на приёмы, копится в запас (максимум 20% макс. ОЗ).", values: { pct: [10, 15, 20] } },
    tech: { name: "Отток пакта", technique: "pact_drain", desc: "Урон оружия + 3×ИНТ сквозь броню. Лечит и добавляет весь запас к лечению; запас тратится." },
    up: { name: "Глубокий отток", desc: "Лечение {pct}% урона (вместо 25%).", values: { pct: [30, 35, 40] } },
    fx: { name: "Очищение пакта", desc: "Снимает 1 негативный эффект с героя с шансом {chance}%.", values: { chance: [20, 30, 40] } },
  },
  {
    id: "brand", archetype: "warlock", name: "Тёмный отпечаток",
    desc: "Проклятый враг слабеет от приёмов, печать может заморозить.",
    passive: { name: "Тёмный отпечаток", desc: "Каждый удар по проклятому врагу +{pct}% урона приёмов.", values: { pct: [2, 3, 4] } },
    tech: { name: "Печать проклятия", technique: "curse_brand", desc: "Урон оружия + 2,6×ИНТ; проклятие и холод на 3 раунда. Бонус Отпечатка удваивается на этом ударе." },
    up: { name: "Глубокая печать", desc: "Проклятие {rounds} раунда(ов) (вместо 3).", values: { rounds: [4, 5, 6] } },
    fx: { name: "Обморожение", desc: "Холод превращается в обморожение: враг пропускает ход с шансом {chance}%.", values: { chance: [10, 15, 20] } },
  },
  {
    id: "vitality", archetype: "warlock", name: "Живучесть",
    desc: "Когда здоровья мало, приёмы бьют сильнее и реприза лечит больше.",
    passive: { name: "Живучесть", desc: "При ОЗ ниже 50% урон приёмов +{pct}%.", values: { pct: [5, 8, 10] } },
    tech: { name: "Реприза души", technique: "soul_reprise", desc: "Урон оружия + 3,4×ИНТ сквозь броню; лечит на 35% урона. Лечение умножается на бонус Живучести." },
    up: { name: "Скорый отклик", desc: "Откат сокращается на {cd} (вместо 2).", values: { cd: [2, 3, 4] } },
    fx: { name: "Пакт без платы", desc: "Следующий приём не тратит 3% ОЗ на плату." },
  },

  // ── Архимаг: кадило ──
  {
    id: "quill", archetype: "archmage", name: "Перо",
    desc: "Созданные в бою свитки усиливают магию и поджигают врага.",
    passive: { name: "Перо", desc: "Каждый созданный в бою свиток даёт +{pct}% магического урона до конца боя (максимум +{max}%).", values: { pct: [1, 2, 3], max: [15, 20, 25] } },
    tech: { name: "Слово творения", technique: "word_creation", desc: "Урон оружия + 2,4×ИНТ; создаёт свиток и сразу применяет его. Созданный свиток получает бонус Пера к своей силе." },
    up: { name: "Вторая строка", desc: "Второй свиток создаётся с шансом {chance}%.", values: { chance: [20, 35, 50] } },
    fx: { name: "Горящая строка", desc: "Применённый свиток накладывает горение на {rounds} раунда(ов).", values: { rounds: [1, 2, 3] } },
  },
  {
    id: "barrier", archetype: "archmage", name: "Барьерный слой",
    desc: "Свитки дают барьер, защита впитывает магию и гаснет огнём.",
    passive: { name: "Барьерный слой", desc: "Каждый созданный свиток даёт +{barrier} магического барьера.", values: { barrier: [10, 20, 30] } },
    tech: { name: "Слово защиты", technique: "warding_word", desc: "Полная защита на 2 хода. Барьер сохраняется и поглощает магический урон первым, пока защита действует." },
    up: { name: "Крепкий барьер", desc: "Барьер ×{mult} от полученного урона.", values: { mult: [1, 1.5, 2] } },
    fx: { name: "Угасающий щит", desc: "Когда защита заканчивается, враг горит {rounds} раунда(ов).", values: { rounds: [2, 3, 4] } },
  },
  {
    id: "extra", archetype: "archmage", name: "Лишний свиток",
    desc: "Иногда свиток создаётся дважды, буря свитков применяет всё.",
    passive: { name: "Лишний свиток", desc: "Каждый {every}-й созданный в бою свиток создаётся дважды.", values: { every: [4, 3, 2] } },
    tech: { name: "Буря свитков", technique: "scroll_tempest", desc: "Урон оружия + 2,8×ИНТ; создаёт 2 свитка и применяет один. Если пассив сработал в этом ходу, создаётся третий." },
    up: { name: "Два свитка", desc: "Применяются оба свитка." },
    fx: { name: "Сила бури", desc: "Свитки Бури получают +{power} к силе.", values: { power: [1, 2, 3] } },
  },
];

export const SKILL_BRANCHES: SkillBranchDef[] = BRANCH_INITS.map(buildBranch);

export const SKILL_NODES: SkillNodeDef[] = SKILL_BRANCHES.flatMap((b) => b.nodes);

export function skillBranchesOf(archetype: ArchetypeId): SkillBranchDef[] {
  return SKILL_BRANCHES.filter((b) => b.archetype === archetype);
}

export function skillBranchById(id: string): SkillBranchDef | null {
  return SKILL_BRANCHES.find((b) => b.id === id) ?? null;
}

export function skillNodeById(id: string): SkillNodeDef | null {
  return SKILL_NODES.find((n) => n.id === id) ?? null;
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

export function skillRankOf(player: Pick<Player, "skillRanks">, nodeId: string): number {
  return Math.max(0, Math.min(SKILL_RANK_MAX, player.skillRanks?.[nodeId] ?? 0));
}

/** Число узла по рангу: 0, если узел не открыт. */
export function skillNum(ranks: Record<string, number> | undefined, nodeId: string, key: string): number {
  const rank = Math.max(0, Math.min(SKILL_RANK_MAX, ranks?.[nodeId] ?? 0));
  if (rank === 0) return 0;
  const node = skillNodeById(nodeId);
  const row = node?.values[key];
  return row ? row[rank - 1] : 0;
}

/**
 * Ранг узла. Прирост списывает очко; снижение возвращает его.
 * Узел требует открытого родителя; снижение до 0 сбрасывает узлы, которые от него зависят.
 * Узлы чужого архетипа и ранги вне 0–3 не меняются.
 */
export function setSkillRank(player: Player, nodeId: string, rank: number): Player {
  const node = skillNodeById(nodeId);
  if (!node || node.archetype !== player.archetype) return player;
  if (!Number.isInteger(rank) || rank < 0 || rank > SKILL_RANK_MAX) return player;
  const current = skillRankOf(player, nodeId);
  if (rank === current) return player;
  if (rank > current) {
    if (node.requires && skillRankOf(player, node.requires) < 1) return player;
    if (skillPointsAvailable(player) < rank - current) return player;
    return { ...player, skillRanks: { ...(player.skillRanks ?? {}), [nodeId]: rank } };
  }
  const next: Record<string, number> = { ...(player.skillRanks ?? {}), [nodeId]: rank };
  if (rank === 0) {
    const dropped = new Set<string>([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const other of SKILL_NODES) {
        if (other.requires && dropped.has(other.requires) && !dropped.has(other.id)) {
          dropped.add(other.id);
          changed = true;
        }
      }
    }
    for (const id of dropped) next[id] = 0;
  }
  return { ...player, skillRanks: next };
}

/** Ранги узлов основного архетипа с открытым рангом: для боя. */
export function activeSkillRanks(player: Pick<Player, "archetype" | "skillRanks">): Record<string, number> {
  const out: Record<string, number> = {};
  if (!player.archetype) return out;
  for (const node of SKILL_NODES) {
    if (node.archetype !== player.archetype) continue;
    const rank = skillRankOf(player, node.id);
    if (rank > 0) out[node.id] = rank;
  }
  return out;
}

/** Текст узла для ранга: подставляет числа ранга (для ранга 0 — числа первого ранга). */
export function skillNodeText(node: SkillNodeDef, rank: number): string {
  const r = Math.max(1, Math.min(SKILL_RANK_MAX, rank));
  return node.desc.replace(/\{(\w+)\}/g, (_, key: string) => {
    const row = node.values[key];
    if (!row) return "?";
    return String(row[r - 1]).replace(".", ",");
  });
}
