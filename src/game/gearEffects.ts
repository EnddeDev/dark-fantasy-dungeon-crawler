/**
 * Эффекты качества снаряжения и легендарные пассивки.
 * Пулы привязаны к типу предмета: у оружия — по виду клинка, у брони — по весу,
 * у аксессуаров — по требуемой характеристике.
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
  | "scroll_damage" | "scroll_scale" | "scroll_vamp" | "scroll_save" | "scroll_create"
  // Оружейные свойства: яд, кровотечение, раскол
  | "poison_damage" | "bleed" | "sunder"
  // Новый набор свойств предметов
  | "magic_vamp" | "fortify" | "magic_resist" | "rage" | "wisdom" | "might" | "precision";

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
  regen: { id: "regen", stat: "str", name: "Регенерация", desc: "Затягивает раны в бою.", detail: "+4 здоровья в конце каждого раунда" },
  resist: { id: "resist", stat: "str", name: "Стойкость", desc: "Реже поддаётся негативным эффектам.", detail: "+10% сопротивления эффектам" },
  guard_bonus: { id: "guard_bonus", stat: "str", name: "Глухая оборона", desc: "Защита держит удар крепче.", detail: "Защита снижает входящий урон ещё на 15%" },
  armor_damage: { id: "armor_damage", stat: "str", name: "Наступление", desc: "Часть защиты превращается в урон.", detail: "+8% брони к урону оружия" },
  stun_chance: { id: "stun_chance", stat: "str", name: "Шанс оглушения", desc: "Удары могут лишить врага хода.", detail: "+8% шанс оглушить врага на 1 ход" },
  vamp_str: { id: "vamp_str", stat: "str", name: "Кровавый вампиризм", desc: "Урон оружием возвращает здоровье.", detail: "+8% лечения от урона оружием и приёмами" },
  missing_hp_damage: { id: "missing_hp_damage", stat: "str", name: "Боль берсерка", desc: "Раны злят и усиливают удар.", detail: "+6% урона за каждые 10% недостающего здоровья (до 60%)" },
  enemy_missing_damage: { id: "enemy_missing_damage", stat: "str", name: "Добивание", desc: "Раненого врага легче сломать.", detail: "+6% урона за каждые 10% недостающего здоровья врага (до 60%)" },
  two_hand_damage: { id: "two_hand_damage", stat: "str", name: "Двуручный хват", desc: "Двуручное оружие бьёт страшнее.", detail: "+15% урона двуручным оружием" },
  evade: { id: "evade", stat: "agi", name: "Уклонение", desc: "Шанс полного промаха врага.", detail: "+3% к уклонению" },
  counter: { id: "counter", stat: "agi", name: "Контратака", desc: "Быстрый выпад после своего удара.", detail: "+12% шанс нанести второй удар подряд" },
  crit_chance: { id: "crit_chance", stat: "agi", name: "Шанс крита", desc: "Вероятность критического удара.", detail: "+5% к шансу критического удара" },
  crit_mult: { id: "crit_mult", stat: "agi", name: "Критический урон", desc: "Критический удар становится жестче.", detail: "+10% к множителю критического урона" },
  vamp: { id: "vamp", stat: "agi", name: "Вампиризм", desc: "Физический урон возвращает здоровье.", detail: "+5% лечения от физического урона" },
  ap: { id: "ap", stat: "agi", name: "Ускорение", desc: "Дополнительные ходы в каждом раунде.", detail: "+1 ход в раунд с 3 уровня" },
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
  magic_vamp: { id: "magic_vamp", stat: "int", name: "Магический вампиризм", desc: "Магический урон возвращает здоровье.", detail: "+5% лечения от магического урона" },
  fortify: { id: "fortify", stat: "str", name: "Укрепление", desc: "Снижает физический урон.", detail: "+5% сопротивления физическому урону" },
  magic_resist: { id: "magic_resist", stat: "int", name: "Магическое сопротивление", desc: "Снижает магический урон.", detail: "+5% снижения магического урона" },
  rage: { id: "rage", stat: "str", name: "Ярость", desc: "Недостающее здоровье усиливает урон.", detail: "+10% урона за каждые 10% недостающего здоровья" },
  wisdom: { id: "wisdom", stat: "int", name: "Мудрость", desc: "Усиливает урон, зависящий от Интеллекта.", detail: "+5% к множителю от Интеллекта" },
  might: { id: "might", stat: "str", name: "Мощь", desc: "Сила усиливает физический удар.", detail: "+5% к множителю от Силы" },
  precision: { id: "precision", stat: "agi", name: "Точность", desc: "Усиливает урон, зависящий от Ловкости.", detail: "+5% к множителю от Ловкости" },
  poison_damage: { id: "poison_damage", stat: "agi", name: "Урон от яда", desc: "Удары отравляют противника.", detail: "+30% шанс отравить врага на 3 раунда" },
  bleed: { id: "bleed", stat: "str", name: "Кровотечение", desc: "Удары открывают кровь.", detail: "+35% шанс вызвать кровотечение на 3 раунда" },
  sunder: { id: "sunder", stat: "str", name: "Раскол", desc: "Удар ломает броню противника.", detail: "+30% шанс расколоть броню врага" },
};

/** Только эти свойства выпадают на новых предметах. Остальные id — совместимость старых сохранений. */
export const ACTIVE_GEAR_EFFECTS: GearEffectId[] = [
  "vamp", "magic_vamp", "crit_chance", "crit_mult", "regen", "fortify", "magic_resist",
  "armor_damage", "rage", "ap", "wisdom", "might", "precision", "thorns",
  "evade", "counter", "resist", "poison_damage", "bleed", "sunder",
];

/* ─────────────  ПУЛЫ СВОЙСТВ ПО ТИПУ ПРЕДМЕТА  ───────────── */

/**
 * Пул свойств оружия по виду клинка. Наборы заданы правилами мира:
 * кинжал травит и режет, рапира уклоняется и контратакует, топор — ярость и кровь.
 */
export const WEAPON_EFFECT_POOLS: Record<string, GearEffectId[]> = {
  dagger: ["crit_chance", "crit_mult", "poison_damage", "bleed", "precision"],
  rapier: ["evade", "counter", "precision", "sunder"],
  spear: ["crit_chance", "crit_mult", "counter"],
  sword: ["counter", "sunder", "might", "precision", "armor_damage"],
  axe: ["bleed", "rage", "vamp", "might"],
  hammer: ["might", "armor_damage", "fortify", "resist"],
  greatsword: ["might", "armor_damage", "fortify", "resist", "rage", "regen"],
  greataxe: ["rage", "vamp", "might", "sunder", "regen", "fortify", "crit_chance"],
  warhammer: ["rage", "might", "sunder", "regen", "fortify", "crit_chance", "armor_damage"],
  staff: ["magic_vamp", "regen", "magic_resist", "wisdom"],
  wand: ["magic_vamp", "regen", "magic_resist", "wisdom"],
};

/** Пул свойств брони по весу и требуемой характеристике. */
export const ARMOR_EFFECT_POOLS: Record<"heavy" | "medium" | "light", Record<string, GearEffectId[]>> = {
  heavy: {
    str: ["fortify", "thorns", "resist", "regen", "rage"],
    agi: ["fortify", "thorns", "resist"],
    int: ["fortify", "thorns", "resist"],
  },
  medium: {
    str: ["fortify", "armor_damage", "might", "thorns"],
    agi: ["evade", "counter", "precision", "crit_chance"],
    int: ["regen", "wisdom", "magic_resist"],
  },
  light: {
    str: ["regen", "thorns", "resist"],
    agi: ["evade", "counter", "precision"],
    int: ["regen", "wisdom", "magic_resist", "magic_vamp"],
    none: ["regen", "thorns", "resist", "fortify"],
  },
};

/** Пул свойств аксессуара: всегда по требуемой характеристике. */
export const ACCESSORY_EFFECT_POOLS: Record<StatKey, GearEffectId[]> = {
  str: ["fortify", "might", "thorns", "armor_damage", "resist"],
  agi: ["evade", "precision", "crit_chance", "counter", "vamp"],
  int: ["regen", "wisdom", "magic_resist", "magic_vamp", "ap"],
};

export interface GearPoolQuery {
  kind: "weapon" | "armor" | "accessory";
  /** Вид оружия: dagger, rapier, spear, sword, axe, hammer, greatsword, greataxe, warhammer, staff, wand. */
  weaponType?: string | null;
  gearClass?: "light" | "medium" | "heavy";
  stat: StatKey;
  /** Лёгкая броня без требования. */
  requiresNothing?: boolean;
  archetype?: ArchetypeId | null;
}

/** Пул свойств предмета по его типу и требованию. */
export function effectPoolForGear(q: GearPoolQuery): GearEffectId[] {
  if (q.kind === "weapon") {
    const pool = WEAPON_EFFECT_POOLS[q.weaponType ?? "sword"] ?? WEAPON_EFFECT_POOLS.sword;
    return pool.filter((id) => ACTIVE_GEAR_EFFECTS.includes(id));
  }
  if (q.kind === "accessory") {
    return ACCESSORY_EFFECT_POOLS[q.stat].filter((id) => ACTIVE_GEAR_EFFECTS.includes(id));
  }
  const cls = q.gearClass ?? "medium";
  const pool = ARMOR_EFFECT_POOLS[cls][q.requiresNothing ? "none" : q.stat] ?? ARMOR_EFFECT_POOLS[cls].str;
  return pool.filter((id) => ACTIVE_GEAR_EFFECTS.includes(id));
}

/**
 * Сколько свойств выпадает на предмет.
 * Аксессуар всегда даёт хотя бы одно свойство, копьё и посох — всегда два.
 */
export function effectCountForGear(q: {
  kind: "weapon" | "armor" | "accessory";
  rarity: "common" | "rare" | "epic" | "legendary";
  weaponType?: string | null;
}): number {
  const bonus = q.rarity === "rare" ? 1 : q.rarity === "epic" || q.rarity === "legendary" ? 2 : 0;
  if (q.kind === "armor") return bonus;
  if (q.kind === "accessory") return 1 + bonus;
  const base = q.weaponType === "spear" || q.weaponType === "staff" ? 2 : 1;
  return base + bonus;
}

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
export function effectDetail(id: GearEffectId, level = 1, rolledBase?: number): string {
  const n = effectMagnitude(id, level, rolledBase);
  switch (id) {
    case "damage_resist": return `−${n} урона за каждый входящий удар`;
    case "thorns": return `+${n} урона врагу за каждый его удар по тебе`;
    case "regen": return `+${n} здоровья в конце каждого раунда`;
    case "resist": return `+${n}% сопротивления эффектам`;
    case "guard_bonus": return `Защита снижает входящий урон ещё на ${n}%`;
    case "armor_damage": return `+${n}% брони к урону оружия`;
    case "stun_chance": return `+${n}% шанс оглушить врага на 1 ход`;
    case "vamp_str": return `+${n}% лечения от урона оружием и приёмами`;
    case "missing_hp_damage": return `+${n}% урона за каждые 10% недостающего здоровья (до ${n * 10}%)`;
    case "enemy_missing_damage": return `+${n}% урона за каждые 10% недостающего здоровья врага (до ${n * 10}%)`;
    case "two_hand_damage": return `+${n}% урона двуручным оружием`;
    case "evade": return `+${n}% к уклонению`;
    case "counter": return `+${n}% шанс нанести второй удар подряд`;
    case "crit_chance": return `+${n}% к шансу критического удара`;
    case "crit_mult": return `+${n}% к множителю критического урона`;
    case "vamp": return `+${n}% лечения от физического урона`;
    case "ap": return n > 0 ? `+${n} ход в каждом раунде` : "Ускорение пробуждается с 3 уровня предмета";
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
    case "magic_vamp": return `+${n}% лечения от магического урона`;
    case "fortify": return `+${n}% сопротивления физическому урону`;
    case "magic_resist": return `+${n}% снижения магического урона`;
    case "poison_damage": return `+${n}% шанс отравить врага на 3 раунда`;
    case "bleed": return `+${n}% шанс вызвать кровотечение на 3 раунда`;
    case "sunder": return `+${n}% шанс расколоть броню врага`;
    case "rage": return `+${n}% урона за каждые 10% недостающего здоровья`;
    case "wisdom": return `+${n}% к множителю от Интеллекта`;
    case "might": return `+${n}% к множителю от Силы`;
    case "precision": return `+${n}% к множителю от Ловкости`;
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
  bulwark: ["fortify", "thorns", "regen", "armor_damage", "might", "magic_resist"],
  barbarian: ["rage", "vamp", "might", "thorns", "regen", "fortify"],
  assassin: ["crit_chance", "crit_mult", "vamp", "ap", "precision", "might"],
  ninja: ["ap", "precision", "crit_chance", "vamp", "magic_vamp", "thorns"],
  warlock: ["wisdom", "magic_vamp", "magic_resist", "rage", "might", "regen"],
  sage: ["wisdom", "magic_resist", "regen", "magic_vamp", "ap", "fortify"],
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
  if (archetype) return ARCHETYPE_EFFECTS[archetype].filter((id) => ACTIVE_GEAR_EFFECTS.includes(id));
  return ACTIVE_GEAR_EFFECTS.filter((id) => GEAR_EFFECTS[id].stat === stat);
}

/** Пулы аксессуаров по характеристике: открыты интерфейсу и тестам. */
export function accessoryPool(stat: StatKey): GearEffectId[] {
  return ACCESSORY_EFFECT_POOLS[stat].filter((id) => ACTIVE_GEAR_EFFECTS.includes(id));
}

export function passivePoolFor(stat: StatKey, archetype?: ArchetypeId | null): GearPassiveId[] {
  if (archetype) return [ARCHETYPE_PASSIVES[archetype]];
  return (Object.values(GEAR_PASSIVES) as GearPassiveDef[]).filter((e) => e.stat === stat).map((e) => e.id);
}

export function archetypePassive(archetype: ArchetypeId): GearPassiveId {
  return ARCHETYPE_PASSIVES[archetype];
}
