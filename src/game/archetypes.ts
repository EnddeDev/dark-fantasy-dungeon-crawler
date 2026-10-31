import type { StatKey } from "./types";

/** Шесть боевых архетипов: по два на каждую характеристику. */
export type ArchetypeId =
  | "bulwark"
  | "barbarian"
  | "assassin"
  | "ninja"
  | "warlock"
  | "sage";

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
      desc: "+15% сопротивления эффектам, +3 регенерации за раунд. Защита дополнительно снижает входящий урон на 15%.",
    },
    milestone10: {
      id: "arch_bulwark_10",
      name: "Непробиваемый",
      desc: "Броня даёт +50% к урону приёмов и обычных ударов. Шипы возвращают ещё 6 урона. Раз за бой смертельный удар оставляет 1 ОЗ и включает защиту.",
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
      desc: "+25% урона двуручным оружием. За каждые 10% недостающего здоровья +4% урона. Вампиризм +8%.",
    },
    milestone10: {
      id: "arch_barbarian_10",
      name: "Мясник",
      desc: "По врагам ниже 50% здоровья урон +35%. Каждый убийственный удар в раунде лечит на 10% максимального здоровья. Оглушение от ударов +15%.",
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
      desc: "+1 ход в первом раунде. В первые два раунда +25% шанса крита и +50% к силе крита.",
    },
    milestone10: {
      id: "arch_assassin_10",
      name: "Тень смерти",
      desc: "Первая атака в каждом бою всегда критическая. Криты лечат на 15% нанесённого урона. +10% шанса контратаки.",
    },
  },
  ninja: {
    id: "ninja",
    stat: "agi",
    name: "Ниндзя",
    short: "Расходники и тень",
    desc: "Урон от расходников, множитель ЛОВ для расходников, вампиризм от них, лишние ходы, уклонение. Добивает цели под негативными эффектами и исчезает перед ударом.",
    gear: ["ninja_kusarigama", "shoes", "wraps", "ring_venom", "shroud"],
    supplies: ["serrated_knife", "poison_dart", "acid_vial", "smoke_bomb", "blast_bomb"],
    milestone5: {
      id: "arch_ninja_5",
      name: "Путь тени",
      desc: "+20% урона расходников и +0.5×ЛОВ к их масштабу. Расходники лечат на 8% нанесённого урона.",
    },
    milestone10: {
      id: "arch_ninja_10",
      name: "Пустое тело",
      desc: "+15% уклонения. После полного уклонения следующий ход получает +1 действие. По врагам с негативными эффектами урон +10% за эффект (до 40%).",
    },
  },
  warlock: {
    id: "warlock",
    stat: "int",
    name: "Колдун",
    short: "Приёмы и пакт",
    desc: "Живёт приёмами оружия и снаряжения: урон приёмов, сокращение перезарядки, вампиризм приёмов, длительность эффектов и множитель характеристики.",
    gear: ["warlock_scepter", "abyss", "shroud", "runed_bracers", "ring_ward", "soulstone"],
    supplies: ["pact_elixir", "scroll_frost", "scroll_terror"],
    milestone5: {
      id: "arch_warlock_5",
      name: "Тёмный пакт",
      desc: "+20% урона приёмов, −1 раунд перезарядки приёмов (минимум 1). Приёмы лечат на 10% нанесённого урона.",
    },
    milestone10: {
      id: "arch_warlock_10",
      name: "Владыка пакта",
      desc: "+0.8 к множителю характеристики приёмов. Позитивные и негативные эффекты длятся на 2 раунда дольше. 25% шанс, что приём не уйдёт на перезарядку.",
    },
  },
  sage: {
    id: "sage",
    stat: "int",
    name: "Мудрец",
    short: "Свитки и слово",
    desc: "Создаёт и применяет свитки, усиливает их урон и множитель ИНТ, вампиризм свитков, лишние ходы и шанс не потратить свиток.",
    gear: ["sage_censer", "staff", "shroud", "seal", "amulet", "ring_ward"],
    supplies: ["scroll_creation", "scroll_heal", "scroll_bolt", "scroll_frost"],
    milestone5: {
      id: "arch_sage_5",
      name: "Живое слово",
      desc: "+25% урона и лечения свитков, +0.5×ИНТ к их масштабу. Свитки лечат на 8% нанесённого урона. 15% шанс не потратить свиток.",
    },
    milestone10: {
      id: "arch_sage_10",
      name: "Библиотека душ",
      desc: "+1 ход в раунде. Приёмы, создающие свитки, создают на 1 больше и сразу применяют один. Полная защита от свитков длится на 1 раунд дольше. Шанс не потратить свиток +20%.",
    },
  },
};

export const ARCHETYPE_ORDER: ArchetypeId[] = [
  "bulwark", "barbarian", "assassin", "ninja", "warlock", "sage",
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
