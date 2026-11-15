import type { StatKey } from "./types";

/** Шесть боевых архетипов: по два на каждую характеристику. */
export type ArchetypeId =
  | "bulwark"
  | "barbarian"
  | "assassin"
  | "duelist"
  | "warlock"
  | "archmage";

export interface ArchetypeDef {
  id: ArchetypeId;
  stat: StatKey;
  name: string;
  short: string;
  desc: string;
  /** Что искать в снаряжении и припасах. */
  gear: string[];
  supplies: string[];
  /** Пассив рубежа 5 уровня. */
  milestone5: { id: string; name: string; desc: string };
  /** Пассив рубежа 10 уровня. */
  milestone10: { id: string; name: string; desc: string };
  /** Спец-приём: открывается при концентрации 5 (SPECIAL_CONCENTRATION) и тратит 5, остаток сохраняется. */
  special: { id: string; name: string; desc: string };
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  bulwark: {
    id: "bulwark",
    stat: "str",
    name: "Бастион",
    short: "Полная защита",
    desc: "Тяжёлая броня и щит, регенерация, шипы, сопротивление эффектам. Затягивает бой, уходит в защиту и бьёт тем сильнее, чем выше его броня.",
    gear: ["bulwark_mace", "shield_tower", "plate", "greathelm", "greaves", "vambraces", "ring_stone", "icon"],
    supplies: ["potion_stone", "potion_l", "antidote"],
    milestone5: {
      id: "arch_bulwark_5",
      name: "Стена щитов",
      desc: "+15% сопротивления эффектам, регенерация 3 + защита / 10 за раунд. Защита дополнительно снижает входящий урон на 15%.",
    },
    milestone10: {
      id: "arch_bulwark_10",
      name: "Непробиваемый",
      desc: "Броня даёт +50% к урону приёмов и обычных ударов. Шипы возвращают 6 + защита / 5 урона за каждую физическую атаку. Раз за бой смертельный удар оставляет 1 ОЗ и включает защиту.",
    },
    special: {
      id: "bulwark_special",
      name: "Стойка-щит",
      desc: "Встать в защиту и восстановить здоровье на величину брони в стойке. Следующая обычная атака получит столько же прямого урона.",
    },
  },
  barbarian: {
    id: "barbarian",
    stat: "str",
    name: "Варвар",
    short: "Двуручная ярость",
    desc: "Самое тяжёлое двуручное оружие, здоровье вместо брони, регенерация, оглушение и вампиризм. Чем меньше своего или чужого здоровья — тем страшнее удар.",
    gear: ["barbarian_greataxe", "blood_hide", "tooth", "ring_band", "rag"],
    supplies: ["rage", "potion_l", "antidote"],
    milestone5: {
      id: "arch_barbarian_5",
      name: "Кровавая ярость",
      desc: "+25% урона двуручным оружием. За каждые 10% недостающего здоровья +4% урона от атаки. Вампиризм +8%.",
    },
    milestone10: {
      id: "arch_barbarian_10",
      name: "Мясник",
      desc: "По врагам ниже 50% здоровья урон +35%. За каждые 10% недостающего здоровья регенерация каждый ход +1% макс. здоровья. Оглушение от ударов +15%. Сила: здоровье от СИЛ ×3, урон от СИЛ ×2.",
    },
    special: {
      id: "barbarian_special",
      name: "Кровавый расчёт",
      desc: "Удар на величину недостающего здоровья. Проходит через броню врага.",
    },
  },
  assassin: {
    id: "assassin",
    stat: "agi",
    name: "Ассасин",
    short: "Первый удар",
    desc: "Максимум урона в первые ходы: гарантированные криты, несколько атак за ход, инициатива, шанс и сила крита, вампиризм, уклонение и контратака.",
    gear: ["assassin_stiletto", "dagger", "boots", "strider_boots", "ring_edge", "wraps"],
    supplies: ["potion_haste", "smoke_bomb", "throwing_knife"],
    milestone5: {
      id: "arch_assassin_5",
      name: "Первая кровь",
      desc: "+1 ход в первом раунде. В первый ход +25% шанса крита и +50% к силе крита.",
    },
    milestone10: {
      id: "arch_assassin_10",
      name: "Тень смерти",
      desc: "Первая атака в каждом бою оглушает. Криты лечат на 15% нанесённого урона. +10% шанса контратаки.",
    },
    special: {
      id: "assassin_special",
      name: "Смертельный удар",
      desc: "Обычная атака с 100% шансом крита и вампиризмом 20% для этого удара.",
    },
  },
  duelist: {
    id: "duelist",
    stat: "agi",
    name: "Дуэлянт",
    short: "Контратака и раскол",
    desc: "Контратака, раскол брони и комбо. Каждая удачная контратака и каждый раскол копят стаки: каждый стак даёт +5% урона, стаки сгорают, если в раунде не было ни одного удара.",
    gear: ["duelist_kusarigama", "shoes", "wraps", "ring_venom", "shroud"],
    supplies: ["serrated_knife", "poison_dart", "acid_vial", "smoke_bomb", "blast_bomb"],
    milestone5: {
      id: "arch_duelist_5",
      name: "Ответный шаг",
      desc: "+10% шанса контратаки. Каждая контратака даёт +1 стак комбо, даже промах.",
    },
    milestone10: {
      id: "arch_duelist_10",
      name: "Расколотый строй",
      desc: "Каждый раскол брони снимает ещё 2 брони на 2 раунда. При 5 стаках следующий удар ×1,5, стаки тратятся.",
    },
    special: {
      id: "duelist_special",
      name: "Ответный залп",
      desc: "Контратака по врагу и раскол брони −3 на 2 раунда. Тратит 5 концентрации.",
    },
  },
  warlock: {
    id: "warlock",
    stat: "int",
    name: "Колдун",
    short: "Приёмы и пакт",
    desc: "Платит здоровьем за приёмы: каждый приём тратит 3% макс. ОЗ. Удачный приём иссушает врага и возвращает кровь герою.",
    gear: ["warlock_scepter", "abyss", "shroud", "runed_bracers", "ring_ward", "soulstone"],
    supplies: ["pact_elixir", "scroll_frost", "scroll_terror"],
    milestone5: {
      id: "arch_warlock_5",
      name: "Тёмный пакт",
      desc: "+20% урона приёмов. Приёмы лечат на 10% нанесённого урона. После приёма 20% шанс −1 перезарядки этого приёма. Живучесть: +10% макс. ОЗ.",
    },
    milestone10: {
      id: "arch_warlock_10",
      name: "Владыка пакта",
      desc: "Пока ОЗ ниже 50%, урон приёмов +30%. Иссушение длится на 2 раунда дольше. Скейл любого оружия идёт через ИНТ.",
    },
    special: {
      id: "warlock_special",
      name: "Жертвенный пакт",
      desc: "Здоровье становится 50% максимума, неуязвимость от всего на 1 ход, иссушение врага на 3 раунда. Тратит 5 концентрации.",
    },
  },
  archmage: {
    id: "archmage",
    stat: "int",
    name: "Архимаг",
    short: "Свитки и слово",
    desc: "Множитель магии: магический урон, горение и обморожение от приёмов и свитков, созданные свитки.",
    gear: ["archmage_censer", "staff", "shroud", "seal", "amulet", "ring_ward"],
    supplies: ["scroll_creation", "scroll_heal", "scroll_bolt", "scroll_frost"],
    milestone5: {
      id: "arch_archmage_5",
      name: "Живое слово",
      desc: "Магический урон +10%. Горение и обморожение от приёмов и свитков тикают на 25% сильнее. 25% шанс не потратить свиток.",
    },
    milestone10: {
      id: "arch_archmage_10",
      name: "Вечная стужа",
      desc: "Магический урон +25%. Горение от приёмов и свитков держится до конца боя. Обморожение даёт врагу −20% урона.",
    },
    special: {
      id: "archmage_special",
      name: "Слово созидания",
      desc: "Создаёт 2 свитка. Один сразу накладывает на врага горение или обморожение на 3 раунда. Тратит 5 концентрации.",
    },
  },
};

export const ARCHETYPE_ORDER: ArchetypeId[] = [
  "bulwark", "barbarian", "assassin", "duelist", "warlock", "archmage",
];

export function archetypeForStat(stat: StatKey): ArchetypeDef[] {
  return ARCHETYPE_ORDER.map((id) => ARCHETYPES[id]).filter((a) => a.stat === stat);
}

export function archetypeMilestoneIds(id: ArchetypeId): [string, string] {
  const a = ARCHETYPES[id];
  return [a.milestone5.id, a.milestone10.id];
}

export function archetypeByMilestone(passiveId: string): ArchetypeDef | null {
  for (const id of ARCHETYPE_ORDER) {
    const a = ARCHETYPES[id];
    if (a.milestone5.id === passiveId || a.milestone10.id === passiveId) return a;
  }
  return null;
}
