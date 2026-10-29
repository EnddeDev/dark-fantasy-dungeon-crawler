/**
 * Эффекты качества снаряжения и легендарные пассивки.
 * Каждый эффект привязан к характеристике назначения предмета (СИЛ/ЛОВ/ИНТ),
 * а не к его весовому классу.
 */
import type { StatKey } from "./types";

/** Уникальные эффекты предметов (редкое даёт 1, эпическое ещё 2 или боевой приём). */
export type GearEffectId =
  // ── силовые (СИЛ) ──
  | "damage_resist"
  | "riposte"
  | "thorns"
  | "stun_chance"
  | "regen"
  // ── ловкие (ЛОВ) ──
  | "evade"
  | "counter"
  | "crit_chance"
  | "crit_mult"
  | "vamp"
  // ── магические (ИНТ) ──
  | "spell_damage"
  | "status_duration"
  | "magic_vamp";

export interface GearEffectDef {
  id: GearEffectId;
  stat: StatKey;
  name: string;
  desc: string;
  /** Формальное описание влияния — подставляется в сплывающую подсказку. */
  detail: string;
}

export const GEAR_EFFECTS: Record<GearEffectId, GearEffectDef> = {
  /* ── СИЛОВЫЕ (СИЛ) ── */
  damage_resist: {
    id: "damage_resist", stat: "str", name: "Сопротивление урону",
    desc: "Весь получаемый урон снижен.",
    detail: "−2 урона за каждый входящий удар",
  },
  riposte: {
    id: "riposte", stat: "str", name: "Ответный удар",
    desc: "После полученного удара контратака.",
    detail: "+12% шанс мгновенно ударить в ответ",
  },
  thorns: {
    id: "thorns", stat: "str", name: "Шипы",
    desc: "Атакующий ранит сам себя.",
    detail: "+4 урона врагу за каждый его удар по тебе",
  },
  stun_chance: {
    id: "stun_chance", stat: "str", name: "Шанс оглушения",
    desc: "Удары могут лишить врага хода.",
    detail: "+8% шанс оглушить врага, пропустив его следующий ход",
  },
  regen: {
    id: "regen", stat: "str", name: "Регенерация",
    desc: "Затягивает раны в бою.",
    detail: "+3 здоровья в конце каждого раунда",
  },

  /* ── ЛОВКИЕ (ЛОВ) ── */
  evade: {
    id: "evade", stat: "agi", name: "Уклонение",
    desc: "Шанс полного промаха врага.",
    detail: "+3% к уклонению",
  },
  counter: {
    id: "counter", stat: "agi", name: "Контратака",
    desc: "Быстрый выпад после своего удара.",
    detail: "+12% шанс нанести второй удар подряд",
  },
  crit_chance: {
    id: "crit_chance", stat: "agi", name: "Шанс крита",
    desc: "Вероятность двойного удара.",
    detail: "+5% к шансу критического удара",
  },
  crit_mult: {
    id: "crit_mult", stat: "agi", name: "Множитель крита",
    desc: "Критический удар становится жестче.",
    detail: "+30% к урону критического удара",
  },
  vamp: {
    id: "vamp", stat: "agi", name: "Вампиризм",
    desc: "Часть урона возвращается здоровьем.",
    detail: "+8% к лечению от нанесённого урона",
  },

  /* ── МАГИЧЕСКИЕ (ИНТ) ── */
  spell_damage: {
    id: "spell_damage", stat: "int", name: "Урон от заклинаний",
    desc: "Свитки бьют сильнее.",
    detail: "+10% к урону свитков и способностей",
  },
  status_duration: {
    id: "status_duration", stat: "int", name: "Длительность эффектов",
    desc: "Негативные эффекты держатся дольше.",
    detail: "+1 раунд к длительности кровотечения, яда и проклятия",
  },
  magic_vamp: {
    id: "magic_vamp", stat: "int", name: "Магический вампиризм",
    desc: "Свитки лечат нанесённым уроном.",
    detail: "+8% к лечению от урона свитков",
  },
};

/** Легендарные пассивки — одна на предмет, зависит от характеристики. */
export type GearPassiveId =
  | "heavy_blow"
  | "fortress"
  | "dance"
  | "precision"
  | "spell_echo"
  | "time_warp";

export interface GearPassiveDef {
  id: GearPassiveId;
  stat: StatKey;
  name: string;
  desc: string;
  detail: string;
}

export const GEAR_PASSIVES: Record<GearPassiveId, GearPassiveDef> = {
  heavy_blow: {
    id: "heavy_blow", stat: "str", name: "Тяжёлый удар",
    desc: "Каждый удар может оглушить врага.",
    detail: "+20% шанс оглушения с каждого удара",
  },
  fortress: {
    id: "fortress", stat: "str", name: "Крепость",
    desc: "Весь получаемый урон снижен ещё сильнее.",
    detail: "−20% ко всему входящему урону",
  },
  dance: {
    id: "dance", stat: "agi", name: "Танец клинков",
    desc: "Каждый ход может смениться двойным ударом.",
    detail: "+25% шанс контратаки после своего удара",
  },
  precision: {
    id: "precision", stat: "agi", name: "Точность",
    desc: "Критические удары почти неизбежны.",
    detail: "+25% к шансу критического удара",
  },
  spell_echo: {
    id: "spell_echo", stat: "int", name: "Эхо заклинаний",
    desc: "Свиток может сработать дважды.",
    detail: "+20% шанс повторного применения свитка",
  },
  time_warp: {
    id: "time_warp", stat: "int", name: "Искажение времени",
    desc: "Негативные эффекты почти вечны.",
    detail: "+2 раунда к длительности наложенных эффектов",
  },
};

/** Пул эффектов для характеристики требования предмета. */
export function effectPoolFor(stat: StatKey): GearEffectId[] {
  return (Object.values(GEAR_EFFECTS) as GearEffectDef[])
    .filter((e) => e.stat === stat)
    .map((e) => e.id);
}

/** Пул легендарных пассивок для характеристики требования. */
export function passivePoolFor(stat: StatKey): GearPassiveId[] {
  return (Object.values(GEAR_PASSIVES) as GearPassiveDef[])
    .filter((e) => e.stat === stat)
    .map((e) => e.id);
}
