/**
 * Эффекты качества снаряжения и легендарные пассивки.
 * Пулы привязаны к характеристике и архетипу предмета.
 */
import type { ArchetypeId } from "./archetypes";
import type { StatKey } from "./types";
import { effectMagnitude, passiveMagnitude } from "./gearScaling";

export type GearEffectId =
  // СИЛ / Бастион
  | "damage_resist" | "thorns" | "regen" | "resist" | "guard_bonus" | "armor_damage"
  // СИЛ / Варвар
  | "stun_chance" | "vamp_str" | "missing_hp_damage" | "enemy_missing_damage" | "two_hand_damage"
  // ЛОВ / Ассасин
  | "evade" | "counter" | "crit_chance" | "crit_mult" | "vamp" | "ap" | "first_strike"
  // ЛОВ / Ниндзя
  | "consumable_damage" | "consumable_scale" | "consumable_vamp" | "debuff_damage" | "dodge_action"
  // ИНТ / Колдун
  | "skill_damage" | "skill_cd" | "skill_vamp" | "status_duration" | "skill_scale"
  // ИНТ / Мудрец
  | "scroll_damage" | "scroll_scale" | "scroll_vamp" | "scroll_save" | "scroll_create";

export interface GearEffectDef {
  id: GearEffectId;
  stat: StatKey;
  name: string;
  desc: string;
  detail: string;
}

export const GEAR_EFFECTS: Record<GearEffectId, GearEffectDef> = {
  damage_resist: { id: "damage_resist", stat: "str", name: "Сопротивление урону", desc: "Весь получаемый урон снижен.", detail: "−2 урона за каждый входящий удар" },
  thorns: { id: "thorns", stat: "str", name: "Шипы", desc: "Атакующий ранит сам себя.", detail: "+4 урона врагу за каждый его удар по тебе" },
  regen: { id: "regen", stat: "str", name: "Регенерация", desc: "Затягивает раны в бою.", detail: "+3 здоровья в конце каждого раунда" },
  resist: { id: "resist", stat: "str", name: "Стойкость", desc: "Реже поддаётся негативным эффектам.", detail: "+10% сопротивления эффектам" },
  guard_bonus: { id: "guard_bonus", stat: "str", name: "Глухая оборона", desc: "Защита держит удар крепче.", detail: "Защита снижает входящий урон ещё на 15%" },
  armor_damage: { id: "armor_damage", stat: "str", name: "Тяжесть лат", desc: "Броня превращается в удар.", detail: "+25% брони к урону оружия и приёмов" },
  stun_chance: { id: "stun_chance", stat: "str", name: "Шанс оглушения", desc: "Удары могут лишить врага хода.", detail: "+8% шанс оглушить врага на 1 ход" },
  vamp_str: { id: "vamp_str", stat: "str", name: "Кровавый вампиризм", desc: "Урон оружием возвращает здоровье.", detail: "+8% лечения от урона оружием и приёмами" },
  missing_hp_damage: { id: "missing_hp_damage", stat: "str", name: "Боль берсерка", desc: "Раны злят и усиливают удар.", detail: "+6% урона за каждые 10% недостающего здоровья (до 60%)" },
  enemy_missing_damage: { id: "enemy_missing_damage", stat: "str", name: "Добивание", desc: "Раненого врага легче сломать.", detail: "+6% урона за каждые 10% недостающего здоровья врага (до 60%)" },
  two_hand_damage: { id: "two_hand_damage", stat: "str", name: "Двуручный хват", desc: "Двуручное оружие бьёт страшнее.", detail: "+15% урона двуручным оружием" },
  evade: { id: "evade", stat: "agi", name: "Уклонение", desc: "Шанс полного промаха врага.", detail: "+3% к уклонению" },
  counter: { id: "counter", stat: "agi", name: "Контратака", desc: "Быстрый выпад после своего удара.", detail: "+12% шанс нанести второй удар подряд" },
  crit_chance: { id: "crit_chance", stat: "agi", name: "Шанс крита", desc: "Вероятность критического удара.", detail: "+5% к шансу критического удара" },
  crit_mult: { id: "crit_mult", stat: "agi", name: "Сила крита", desc: "Критический удар становится жестче.", detail: "+30% к множителю критического урона" },
  vamp: { id: "vamp", stat: "agi", name: "Вампиризм", desc: "Часть урона возвращается здоровьем.", detail: "+8% лечения от нанесённого урона" },
  ap: { id: "ap", stat: "agi", name: "Лишний ход", desc: "Дополнительные ходы только в первом раунде.", detail: "+1 ход в первом раунде" },
  first_strike: { id: "first_strike", stat: "agi", name: "Первый удар", desc: "Начало боя смертельно.", detail: "+20% урона в первые 2 раунда" },
  consumable_damage: { id: "consumable_damage", stat: "agi", name: "Алхимический удар", desc: "Расходники бьют сильнее.", detail: "+15% урона расходников" },
  consumable_scale: { id: "consumable_scale", stat: "agi", name: "Точная доза", desc: "ЛОВ сильнее влияет на расходники.", detail: "+0.25×ЛОВ к масштабу расходников" },
  consumable_vamp: { id: "consumable_vamp", stat: "agi", name: "Кровавая алхимия", desc: "Расходники лечат уроном.", detail: "+8% лечения от урона расходников" },
  debuff_damage: { id: "debuff_damage", stat: "agi", name: "Удар по слабому", desc: "Негативные эффекты врага делают его уязвимее.", detail: "+8% урона за каждый негативный эффект на враге (до 32%)" },
  dodge_action: { id: "dodge_action", stat: "agi", name: "Шаг в тень", desc: "Уклонение открывает действие.", detail: "+10% шанс после уклонения получить +1 ход в следующем раунде" },
  skill_damage: { id: "skill_damage", stat: "int", name: "Урон приёмов", desc: "Приёмы оружия и снаряжения сильнее.", detail: "+12% урона приёмов" },
  skill_cd: { id: "skill_cd", stat: "int", name: "Быстрый откат", desc: "Приёмы восстанавливаются быстрее.", detail: "−1 раунд перезарядки приёмов (минимум 1)" },
  skill_vamp: { id: "skill_vamp", stat: "int", name: "Вампиризм приёмов", desc: "Приёмы возвращают здоровье.", detail: "+10% лечения от урона приёмов" },
  status_duration: { id: "status_duration", stat: "int", name: "Длительность эффектов", desc: "Эффекты держатся дольше.", detail: "+1 раунд к длительности наложенных эффектов" },
  skill_scale: { id: "skill_scale", stat: "int", name: "Множитель приёмов", desc: "Характеристика сильнее влияет на приёмы.", detail: "+0.3 к множителю характеристики приёмов" },
  scroll_damage: { id: "scroll_damage", stat: "int", name: "Урон свитков", desc: "Свитки бьют сильнее.", detail: "+15% урона свитков" },
  scroll_scale: { id: "scroll_scale", stat: "int", name: "Множитель свитков", desc: "ИНТ сильнее влияет на свитки.", detail: "+0.3×ИНТ к масштабу свитков" },
  scroll_vamp: { id: "scroll_vamp", stat: "int", name: "Вампиризм свитков", desc: "Свитки лечат уроном.", detail: "+10% лечения от урона свитков" },
  scroll_save: { id: "scroll_save", stat: "int", name: "Бережный почерк", desc: "Свиток может не истлеть.", detail: "+12% шанс не потратить свиток" },
  scroll_create: { id: "scroll_create", stat: "int", name: "Сотворение свитков", desc: "Приёмы чаще рождают свитки.", detail: "+1 свиток при создании приёмом" },
};

export type GearPassiveId =
  | "heavy_blow" | "fortress" | "dance" | "precision" | "spell_echo" | "time_warp"
  | "bulwark_wall" | "barbarian_rage" | "assassin_shadow" | "ninja_phantom" | "warlock_pact" | "sage_library";

export interface GearPassiveDef {
  id: GearPassiveId;
  stat: StatKey;
  name: string;
  desc: string;
  detail: string;
}

export const GEAR_PASSIVES: Record<GearPassiveId, GearPassiveDef> = {
  heavy_blow: { id: "heavy_blow", stat: "str", name: "Тяжёлый удар", desc: "Каждый удар может оглушить врага.", detail: "+20% шанс оглушения с каждого удара" },
  fortress: { id: "fortress", stat: "str", name: "Крепость", desc: "Весь получаемый урон снижен ещё сильнее.", detail: "−20% ко всему входящему урону" },
  dance: { id: "dance", stat: "agi", name: "Танец клинков", desc: "Каждый ход может смениться двойным ударом.", detail: "+25% шанс контратаки после своего удара" },
  precision: { id: "precision", stat: "agi", name: "Точность", desc: "Критические удары почти неизбежны.", detail: "+25% к шансу критического удара" },
  spell_echo: { id: "spell_echo", stat: "int", name: "Эхо заклинаний", desc: "Свиток может сработать дважды.", detail: "+20% шанс повторного применения свитка" },
  time_warp: { id: "time_warp", stat: "int", name: "Искажение времени", desc: "Негативные эффекты почти вечны.", detail: "+2 раунда к длительности наложенных эффектов" },
  bulwark_wall: { id: "bulwark_wall", stat: "str", name: "Живая стена", desc: "Бастион превращает бой в осаду.", detail: "+4 регенерации, +6 шипов, защита снижает урон ещё на 20%" },
  barbarian_rage: { id: "barbarian_rage", stat: "str", name: "Ярость мясника", desc: "Варвар живёт, пока бьёт.", detail: "+12% вампиризма, +20% урона при ОЗ < 50%, +15% шанс оглушения" },
  assassin_shadow: { id: "assassin_shadow", stat: "agi", name: "Тень убийцы", desc: "Первый удар решает бой.", detail: "+1 ход в первом раунде, +25% шанса крита и +50% силы крита в первые 2 раунда" },
  ninja_phantom: { id: "ninja_phantom", stat: "agi", name: "Фантом", desc: "Ниндзя исчезает между ударами.", detail: "+10% уклонения, расходники лечат на 12%, после уклонения 25% шанс +1 хода" },
  warlock_pact: { id: "warlock_pact", stat: "int", name: "Печать пакта", desc: "Колдун платит кровью за силу.", detail: "+25% урона приёмов, −1 откат, приёмы лечат на 12%" },
  sage_library: { id: "sage_library", stat: "int", name: "Запретная библиотека", desc: "Мудрец читает мир как книгу.", detail: "+25% урона свитков, +20% шанс не потратить свиток, +1 свиток при создании" },
};

/** Описание эффекта с учётом уровня предмета. */
export function effectDetail(id: GearEffectId, level = 1): string {
  const n = effectMagnitude(id, level);
  switch (id) {
    case "damage_resist": return `−${n} урона за каждый входящий удар`;
    case "thorns": return `+${n} урона врагу за каждый его удар по тебе`;
    case "regen": return `+${n} здоровья в конце каждого раунда`;
    case "resist": return `+${n}% сопротивления эффектам`;
    case "guard_bonus": return `Защита снижает входящий урон ещё на ${n}%`;
    case "armor_damage": return `+${n}% брони к урону оружия и приёмов`;
    case "stun_chance": return `+${n}% шанс оглушить врага на 1 ход`;
    case "vamp_str": return `+${n}% лечения от урона оружием и приёмами`;
    case "missing_hp_damage": return `+${n}% урона за каждые 10% недостающего здоровья (до ${n * 10}%)`;
    case "enemy_missing_damage": return `+${n}% урона за каждые 10% недостающего здоровья врага (до ${n * 10}%)`;
    case "two_hand_damage": return `+${n}% урона двуручным оружием`;
    case "evade": return `+${n}% к уклонению`;
    case "counter": return `+${n}% шанс нанести второй удар подряд`;
    case "crit_chance": return `+${n}% к шансу критического удара`;
    case "crit_mult": return `+${n}% к множителю критического урона`;
    case "vamp": return `+${n}% лечения от нанесённого урона`;
    case "ap": return `+${n} ход только в первом раунде`;
    case "first_strike": return `+${n}% урона в первые 2 раунда`;
    case "consumable_damage": return `+${n}% урона расходников`;
    case "consumable_scale": return `+${n}×ЛОВ к масштабу расходников`;
    case "consumable_vamp": return `+${n}% лечения от урона расходников`;
    case "debuff_damage": return `+${n}% урона за каждый негативный эффект на враге (до ${n * 4}%)`;
    case "dodge_action": return `+${n}% шанс после уклонения получить +1 ход в следующем раунде`;
    case "skill_damage": return `+${n}% урона приёмов`;
    case "skill_cd": return `−${n} раунд перезарядки приёмов (минимум 1)`;
    case "skill_vamp": return `+${n}% лечения от урона приёмов`;
    case "status_duration": return `+${n} раунд к длительности наложенных эффектов`;
    case "skill_scale": return `+${n} к множителю характеристики приёмов`;
    case "scroll_damage": return `+${n}% урона свитков`;
    case "scroll_scale": return `+${n}×ИНТ к масштабу свитков`;
    case "scroll_vamp": return `+${n}% лечения от урона свитков`;
    case "scroll_save": return `+${n}% шанс не потратить свиток`;
    case "scroll_create": return `+${n} свиток при создании приёмом`;
  }
}

export function passiveDetail(id: GearPassiveId, level = 1): string {
  const n = (key: string) => passiveMagnitude(id, key, level);
  switch (id) {
    case "heavy_blow": return `+${n("stun")}% шанс оглушения с каждого удара`;
    case "fortress": return `−${n("resist")}% ко всему входящему урону`;
    case "dance": return `+${n("counter")}% шанс контратаки после своего удара`;
    case "precision": return `+${n("crit")}% к шансу критического удара`;
    case "spell_echo": return `+${n("echo")}% шанс повторного применения свитка`;
    case "time_warp": return `+${n("duration")} раунда к длительности наложенных эффектов`;
    case "bulwark_wall": return `+${n("regen")} регенерации, +${n("thorns")} шипов, защита снижает урон ещё на ${n("guard")}%`;
    case "barbarian_rage": return `+${n("vamp")}% вампиризма, +${n("damage")}% урона при ОЗ < 50%, +${n("stun")}% шанс оглушения`;
    case "assassin_shadow": return `+${n("ap")} ход в первом раунде, +${n("crit")}% шанса крита и +${n("critMult")}% силы крита в первые 2 раунда`;
    case "ninja_phantom": return `+${n("evade")}% уклонения, расходники лечат на ${n("vamp")}%, после уклонения ${n("dodge")}% шанс +1 хода`;
    case "warlock_pact": return `+${n("skillDamage")}% урона приёмов, −${n("cd")} откат, приёмы лечат на ${n("vamp")}%`;
    case "sage_library": return `+${n("scrollDamage")}% урона свитков, +${n("save")}% шанс не потратить свиток, +${n("create")} свиток при создании`;
  }
}

const ARCHETYPE_EFFECTS: Record<ArchetypeId, GearEffectId[]> = {
  bulwark: ["damage_resist", "thorns", "regen", "resist", "guard_bonus", "armor_damage"],
  barbarian: ["regen", "resist", "stun_chance", "vamp_str", "missing_hp_damage", "enemy_missing_damage", "two_hand_damage"],
  assassin: ["evade", "counter", "crit_chance", "crit_mult", "vamp", "ap", "first_strike"],
  ninja: ["evade", "ap", "consumable_damage", "consumable_scale", "consumable_vamp", "debuff_damage", "dodge_action"],
  warlock: ["skill_damage", "skill_cd", "skill_vamp", "status_duration", "skill_scale"],
  sage: ["scroll_damage", "scroll_scale", "scroll_vamp", "scroll_save", "scroll_create", "ap"],
};

const ARCHETYPE_PASSIVES: Record<ArchetypeId, GearPassiveId> = {
  bulwark: "bulwark_wall",
  barbarian: "barbarian_rage",
  assassin: "assassin_shadow",
  ninja: "ninja_phantom",
  warlock: "warlock_pact",
  sage: "sage_library",
};

export function effectPoolFor(stat: StatKey, archetype?: ArchetypeId | null): GearEffectId[] {
  if (archetype) return ARCHETYPE_EFFECTS[archetype].filter((id) => GEAR_EFFECTS[id].stat === stat);
  return (Object.values(GEAR_EFFECTS) as GearEffectDef[]).filter((e) => e.stat === stat).map((e) => e.id);
}

export function passivePoolFor(stat: StatKey, archetype?: ArchetypeId | null): GearPassiveId[] {
  if (archetype) return [ARCHETYPE_PASSIVES[archetype]];
  return (Object.values(GEAR_PASSIVES) as GearPassiveDef[]).filter((e) => e.stat === stat).map((e) => e.id);
}

export function archetypePassive(archetype: ArchetypeId): GearPassiveId {
  return ARCHETYPE_PASSIVES[archetype];
}
