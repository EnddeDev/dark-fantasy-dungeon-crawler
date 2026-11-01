/**
 * Чистые данные нового содержания: снаряжение со слотами и уровнями, лавка,
 * бестиарий, припасы с реагентами и события карты с выбором.
 *
 * Модуль зависит только от типов content.ts (type-импорт стирается на этапе сборки),
 * поэтому циклической зависимости при слиянии данных не возникает.
 */
import type { EnemyDef, GearBaseDef, ItemDef, Recipe } from "./content";
import type { RarityTier, StatKey, WearTier } from "./types";

/* ═══════════════  ЛАВКА: 10 УРОВНЕЙ  ═══════════════ */

export const SHOP_MAX_LEVEL = 10;

/** Цена улучшения лавки: 250 × текущий уровень (1→2 = 250, 9→10 = 2250). */
export function shopUpgradeCost(level: number): number {
  return 250 * Math.max(1, Math.floor(level));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const levelT = (level: number) => (Math.max(1, Math.min(SHOP_MAX_LEVEL, level)) - 1) / 9;

/** Изношенность по уровню лавки: L1 → 5 / 25 / 70, L10 → 40 / 60 / 0. */
export function shopWearTable(level: number): Record<WearTier, number> {
  const t = levelT(level);
  const nw = lerp(5, 40, t);
  const wn = lerp(25, 60, t);
  const bt = lerp(70, 0, t);
  const total = nw + wn + bt;
  return {
    new: (nw / total) * 100,
    worn: (wn / total) * 100,
    battered: (bt / total) * 100,
  };
}

/** Редкость по уровню лавки: L1 → 80 / 15 / 5 / 0, L10 → 40 / 25 / 20 / 15. */
export function shopRarityTable(level: number): Record<RarityTier, number> {
  const t = levelT(level);
  const cm = lerp(80, 40, t);
  const rr = lerp(15, 25, t);
  const ep = lerp(5, 20, t);
  const lg = lerp(0, 15, t);
  const total = cm + rr + ep + lg;
  return {
    common: (cm / total) * 100,
    rare: (rr / total) * 100,
    epic: (ep / total) * 100,
    legendary: (lg / total) * 100,
  };
}

export function shopWeight<T extends string>(table: Record<T, number>): Record<T, number> {
  return table;
}

export function rollFromTable<T extends string>(table: Record<T, number>, rng: () => number): T {
  const keys = Object.keys(table) as T[];
  const total = keys.reduce((s, k) => s + table[k], 0);
  let r = rng() * total;
  for (const k of keys) {
    r -= table[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

/* ═══════════════  НОВОЕ СНАРЯЖЕНИЕ  ═══════════════ */

const G = (g: GearBaseDef): GearBaseDef => g;

export const EXTRA_GEAR: GearBaseDef[] = [
  /* ── ПРАВАЯ РУКА: двуручное оружие занимает обе руки ── */
  G({
    id: "greatsword", name: "Клеймор следопыта", slot: "mainHand", hands: 2,
    dmg: [18, 30], price: 460, level: 3, minFloor: 3, idIntReq: 5, idGoldCost: 80,
    desc: "Метр ржавой стали: медленно, но вскрывает латы вместе с тем, кто в них стоит.",
    preferredEpic: "blood_lance",
    weaponSkill: {
      id: "cleave_double", name: "Рассечение надвое", intReq: 4, cooldown: 3,
      scaleStat: "str", scaleMult: 2.6, effect: "sunder",
      desc: "Двуручный взмах: урон оружия + 2.6×СИЛ, броня врага −3.",
      passiveNote: "При ИНТ ≥ 4 обычные удары получают +0.9×СИЛ.",
    },
  }),
  G({
    id: "spear", name: "Копьё пещерного охотника", slot: "mainHand", hands: 2,
    dmg: [15, 24], price: 380, level: 3, minFloor: 3, idIntReq: 4, idGoldCost: 70,
    desc: "Древко обмотано сухожилиями, наконечник точен в один уклон.",
    preferredEpic: "shadow_volley",
    weaponSkill: {
      id: "long_reach", name: "Дальний выпад", intReq: 3, cooldown: 2,
      scaleStat: "agi", scaleMult: 2.2, effect: "pierce",
      desc: "Выпад с дистанции: урон оружия + 2.2×ЛОВ, игнорирует броню.",
      passiveNote: "При ИНТ ≥ 3 обычные удары получают +0.8×ЛОВ.",
    },
  }),
  G({
    id: "warhammer2", name: "Осадный молот", slot: "mainHand", hands: 2,
    dmg: [30, 48], price: 690, level: 5, minFloor: 5, idIntReq: 6, idGoldCost: 110,
    desc: "Собран из баллистиры. Ломает стены, если до них дотянуться.",
    preferredEpic: "frost_nova",
    weaponSkill: {
      id: "quake", name: "Толчок", intReq: 5, cooldown: 3,
      scaleStat: "str", scaleMult: 3.0, effect: "stun",
      desc: "Удар в землю: урон оружия + 3.0×СИЛ и враг теряет ход.",
      passiveNote: "При ИНТ ≥ 5 обычные удары получают +1.1×СИЛ.",
    },
  }),

  /* ── ЛЕВАЯ РУКА: кинжалы и щиты ── */
  G({
    id: "dagger", name: "Кинжал затяжки", slot: "offHand",
    dmg: [3, 5], price: 90, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30,
    desc: "Вторая рука не должна бездельничать.",
    preferredEpic: "shadow_volley",
    weaponSkill: {
      id: "offhand_riposte", name: "Подхват", intReq: 3, cooldown: 2,
      scaleStat: "agi", scaleMult: 1.6, effect: "pierce",
      desc: "Второй удар наотмашь: +1.6×ЛОВ сквозь броню.",
      passiveNote: "При ИНТ ≥ 3 обычные удары получают +0.6×ЛОВ.",
    },
  }),
  G({
    id: "shield_round", name: "Круглый щит", slot: "offHand", shield: true,
    armor: 2, hp: 14, price: 130, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35,
    desc: "Дуб, полоса и вмятина от чьего-то размаха.",
    preferredEpic: "ash_aegis",
  }),
  G({
    id: "shield_tower", name: "Башенный щит", slot: "offHand", shield: true,
    armor: 4, hp: 34, evade: -0.02, price: 420, level: 3, minFloor: 3, idIntReq: 4, idGoldCost: 80,
    desc: "Целая дверь, приставленная к лицу. Немного тормозит шаг.",
    preferredEpic: "ash_aegis",
  }),
  G({
    id: "buckler", name: "Калёный полущит", slot: "offHand", shield: true,
    armor: 1, hp: 12, evade: 0.03, price: 180, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 40,
    desc: "Лёгкий: закрывает и не мешает двигаться.",
    preferredEpic: "ash_aegis",
  }),

  /* ── ШЛЕМЫ ── */
  G({
    id: "coif", name: "Капюшон контриника", slot: "head",
    armor: 1, hp: 8, price: 70, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30,
    desc: "Сшит из колец и упрямства.",
    preferredEpic: "ash_aegis",
  }),
  G({
    id: "helm", name: "Шлем стражи", slot: "head",
    armor: 2, hp: 18, price: 210, level: 2, minFloor: 2, idIntReq: 3, idGoldCost: 55,
    desc: "С каймой и следом от топора.",
    preferredEpic: "ash_aegis",
  }),
  G({
    id: "greathelm", name: "Латный шлем", slot: "head",
    armor: 4, hp: 34, evade: -0.02, price: 470, level: 4, minFloor: 4, idIntReq: 5, idGoldCost: 90,
    desc: "Мир за решёткой виден хуже, но зато не долетает.",
    preferredEpic: "frost_nova",
  }),
  G({
    id: "crown_husk", name: "Венец пустого трона", slot: "head",
    armor: 3, hp: 30, price: 640, level: 6, minFloor: 6, idIntReq: 6, idGoldCost: 120,
    desc: "Тяжёлый, холодный и почему-то знакомый.",
    preferredEpic: "blood_lance",
  }),

  /* ── БОТИНКИ ── */
  G({
    id: "shoes", name: "Кожаные ботинки", slot: "feet",
    hp: 8, evade: 0.04, price: 65, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30,
    desc: "Просто ботинки. Но без них подземелье дороже.",
    preferredEpic: "shadow_volley",
  }),
  G({
    id: "greaves", name: "Наголенники", slot: "feet",
    armor: 2, hp: 16, price: 240, level: 2, minFloor: 2, idIntReq: 3, idGoldCost: 55,
    desc: "Бьёшь по щиколоткам — они бьют в ответ.",
    preferredEpic: "ash_aegis",
  }),
  G({
    id: "strider_boots", name: "Сапоги дальнобойщика", slot: "feet",
    hp: 14, evade: 0.09, price: 360, level: 4, minFloor: 4, idIntReq: 4, idGoldCost: 80,
    desc: "Подошвы помнят больше лестниц, чем ты.",
    preferredEpic: "shadow_volley",
  }),

  /* ── НАРУЧИ ── */
  G({
    id: "wraps", name: "Витые наручи", slot: "wrists",
    armor: 1, hp: 10, price: 80, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30,
    desc: "Кожа в три оборота — и ты не режешь себе запястья.",
    preferredEpic: "ash_aegis",
  }),
  G({
    id: "vambraces", name: "Латные наручи", slot: "wrists",
    armor: 3, hp: 24, price: 340, level: 3, minFloor: 3, idIntReq: 4, idGoldCost: 70,
    desc: "Держат отвод от удара снизу вверх.",
    preferredEpic: "blood_lance",
  }),
  G({
    id: "runed_bracers", name: "Рунные наручи", slot: "wrists",
    armor: 2, hp: 22, evade: 0.05, price: 520, level: 5, minFloor: 5, idIntReq: 5, idGoldCost: 100,
    desc: "Руны гасят первые секунды чужого заклинания.",
    preferredEpic: "fireball",
  }),

  /* ── КОЛЬЦА (можно надеть в оба слота колец) ── */
  G({
    id: "ring_band", name: "Гладкое кольцо", slot: "ring1", altSlots: ["ring1", "ring2"],
    hp: 10, price: 90, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35,
    desc: "Ничего не значит. Или значит, пока на нём ничего нет.",
    preferredEpic: "ash_aegis",
  }),
  G({
    id: "ring_edge", name: "Кольцо-лезвие", slot: "ring1", altSlots: ["ring1", "ring2"],
    hp: 12, price: 280, level: 2, minFloor: 2, idIntReq: 3, idGoldCost: 60,
    desc: "Носить удобно — если не сжимать кулак.",
    preferredEpic: "blood_lance",
  }),
  G({
    id: "ring_ward", name: "Перстень оберега", slot: "ring1", altSlots: ["ring1", "ring2"],
    armor: 2, hp: 16, price: 380, level: 4, minFloor: 4, idIntReq: 4, idGoldCost: 85,
    desc: "Щёлкает, когда рядом зло.",
    preferredEpic: "frost_nova",
  }),
  G({
    id: "ring_venom", name: "Кольцо с бороздкой", slot: "ring1", altSlots: ["ring1", "ring2"],
    hp: 18, evade: 0.05, price: 470, level: 5, minFloor: 5, idIntReq: 5, idGoldCost: 95,
    desc: "Бороздка заполнена тем, что не высыхает.",
    preferredEpic: "fireball",
  }),

  /* ── ОБЕРЕГИ ── */
  G({
    id: "tooth", name: "Зуб из-под лестницы", slot: "amulet",
    hp: 14, price: 110, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35,
    desc: "Кто-то его потерял и не вернулся искать.",
    preferredEpic: "shadow_volley",
  }),
  G({
    id: "icon", name: "Икона без лика", slot: "amulet",
    hp: 26, price: 330, level: 3, minFloor: 3, idIntReq: 4, idGoldCost: 70,
    desc: "Лицо вырезано, чтобы не глядело обратно.",
    preferredEpic: "ash_aegis",
  }),
  G({
    id: "soulstone", name: "Камень души", slot: "amulet",
    hp: 34, armor: 1, price: 560, level: 5, minFloor: 5, idIntReq: 5, idGoldCost: 110,
    desc: "Тёплый, пока ты жив.",
    preferredEpic: "fireball",
  }),

  /* ── ФОКУСЫ: аксессуар для левой руки, поэтому конкурирует со щитом ── */
  G({
    id: "focus_rune", name: "Рунный фокус", slot: "offHand", stat: "int",
    hp: 12, price: 240, level: 2, minFloor: 2, idIntReq: 3, idGoldCost: 55,
    desc: "Камень с прорезью: в неё смотрят, чтобы увидеть чужую мысль.",
    preferredEpic: "frost_nova",
  }),

  /* ── ВОЛШЕБНАЯ ПАЛОЧКА ── */
  G({
    id: "wand_ash", name: "Пепельная палочка", slot: "mainHand", stat: "int",
    dmg: [6, 10], price: 300, level: 3, minFloor: 3, idIntReq: 4, idGoldCost: 65,
    desc: "Обгоревший кончик всё ещё держит искру.",
    preferredEpic: "fireball",
    weaponSkill: {
      id: "ash_spark", name: "Пепельная искра", intReq: 3, cooldown: 2,
      scaleStat: "int", scaleMult: 2.2, effect: "chill",
      desc: "Взмах палочки: урон оружия + 2.2×ИНТ магией сквозь броню и озноб на 2 раунда.",
      passiveNote: "При ИНТ ≥ 3 обычные удары палочкой получают +0.8×ИНТ.",
    },
  }),
];

/* ═══════════════  БЕСТИАРИЙ: 3 ЯРУСА  ═══════════════ */


const C = (c: EnemyDef): EnemyDef => c;

/** Низкие этажи (1+): мелочь, твари и первая нежить. */
const LOW_TIER: EnemyDef[] = [
  C({ id: "rat_swarm", name: "Крысиный рой", race: "beast", art: "foe:swarm", tier: 1,
    type: "agile",
    hp: 18, ap: 3, atk: [2, 5], armor: 0, gold: [10, 22], xp: 6, minFloor: 1,
    flavor: "Их двадцать. Они не считают тебя за существо — только за корм.",
    moves: ["multi", "attack", "poison", "attack"] }),
  C({ id: "rat_giant", name: "Гигантская крыса", race: "beast", art: "foe:rat", tier: 1,
    type: "strong",
    hp: 30, ap: 2, atk: [5, 9], armor: 0, gold: [16, 30], xp: 9, minFloor: 1,
    flavor: "Рыжая, с ухом, вырванным половиной прошлой драки.",
    moves: ["attack", "wound", "heavy", "attack"] }),
  C({ id: "bat_vampire", name: "Летучая мышь-вампир", race: "vampire", art: "foe:bat", tier: 1,
    type: "agile",
    hp: 20, ap: 4, atk: [3, 7], armor: 0, gold: [12, 26], xp: 8, minFloor: 1,
    flavor: "Кусает туда, где уже есть рана, — экономно.",
    moves: ["attack", "drain", "attack", "poison"] }),
  C({ id: "slime", name: "Слизь", race: "construct", art: "foe:ooze", tier: 1,
    type: "strong",
    hp: 34, ap: 2, atk: [4, 7], armor: 3, gold: [14, 28], xp: 9, minFloor: 1,
    flavor: "Она не кусается. Она въедается.",
    moves: ["attack", "poison", "guard", "attack"] }),
  C({ id: "goblin_scout", name: "Гоблин-разведчик", race: "none", art: "foe:goblin", tier: 1,
    type: "agile",
    hp: 22, ap: 3, atk: [4, 8], armor: 0, gold: [20, 38], xp: 10, minFloor: 1,
    flavor: "Пришёл посмотреть и остался торговаться насчёт твоих зубов.",
    moves: ["attack", "guard", "terror", "attack"] }),
  C({ id: "skeleton_guard", name: "Скелет-страж", race: "undead", art: "foe:skeleton", tier: 1,
    type: "strong",
    hp: 28, ap: 2, atk: [5, 8], armor: 2, gold: [18, 34], xp: 10, minFloor: 1,
    flavor: "Стоит. Стражит ничего. Прекрасно справляется.",
    moves: ["attack", "guard", "heavy", "attack"] }),
  C({ id: "spider_weaver", name: "Паук-ткач", race: "beast", art: "foe:arachnid", tier: 1,
    type: "agile",
    hp: 24, ap: 3, atk: [4, 7], armor: 0, gold: [12, 26], xp: 9, minFloor: 1,
    flavor: "Сети между балками — это не украшения, это счётчик входящих.",
    moves: ["attack", "poison", "attack", "guard"] }),
  C({ id: "sporeling", name: "Гриб-споровик", race: "construct", art: "foe:fungus", tier: 1,
    type: "strong",
    hp: 26, ap: 2, atk: [3, 6], armor: 2, gold: [12, 24], xp: 9, minFloor: 1,
    flavor: "Пока ты читаешь описание, споры уже внутри.",
    moves: ["attack", "poison", "guard", "wound"] }),
  C({ id: "mimic_larva", name: "Мимик-малыш", race: "construct", art: "foe:mimic", tier: 1,
    type: "strong",
    hp: 25, ap: 3, atk: [5, 9], armor: 1, gold: [24, 44], xp: 12, minFloor: 1,
    flavor: "Первый сундук в подземелье всегда он. Всегда.",
    moves: ["attack", "guard", "heavy", "poison"] }),
  C({ id: "kobold", name: "Кобольд-рудокоп", race: "none", art: "foe:goblin", tier: 1,
    type: "smart",
    hp: 23, ap: 3, atk: [4, 8], armor: 1, gold: [26, 46], xp: 11, minFloor: 1,
    flavor: "Копает, звенит киркой и злится на любой шум.",
    moves: ["attack", "sunder", "attack", "guard"] }),
  C({ id: "ghost_light", name: "Призрачный огонёк", race: "ghost", art: "foe:orb", tier: 1,
    type: "smart",
    hp: 20, ap: 3, atk: [4, 9], armor: 0, gold: [14, 30], xp: 11, minFloor: 1,
    flavor: "Ведёт туда, где нет дна. Вежливо и без единого слова.",
    moves: ["attack", "curse", "drain", "attack"] }),
];

/** Средние этажи (3+): воинья, хищники и улучшенная нежить. */
const MID_TIER: EnemyDef[] = [
  C({ id: "goblin_warrior", name: "Гоблин-воин", race: "none", art: "foe:goblin", tier: 2,
    type: "strong",
    hp: 44, ap: 3, atk: [7, 12], armor: 2, gold: [30, 54], xp: 15, minFloor: 3,
    flavor: "Носит чужие доспехи и не подгоняет по размеру.",
    moves: ["attack", "guard", "sunder", "attack"] }),
  C({ id: "orc_raider", name: "Орк-налётчик", race: "none", art: "foe:brute", tier: 2,
    type: "strong",
    hp: 58, ap: 3, atk: [9, 15], armor: 2, gold: [40, 72], xp: 18, minFloor: 3,
    flavor: "Пришёл за добычей, остался за развлечением.",
    moves: ["heavy", "attack", "sunder", "attack"] }),
  C({ id: "skeleton_archer", name: "Скелет-лучник", race: "undead", art: "foe:skeleton", tier: 2,
    type: "agile",
    hp: 38, ap: 4, atk: [7, 13], armor: 1, gold: [30, 56], xp: 16, minFloor: 3,
    flavor: "Тетива протянута на пальцах — точно, неудобно, смертельно.",
    moves: ["attack", "terror", "attack", "guard"] }),
  C({ id: "harpy", name: "Гарпия", race: "beast", art: "foe:harpy", tier: 2,
    type: "agile",
    hp: 46, ap: 4, atk: [8, 13], armor: 1, gold: [34, 60], xp: 18, minFloor: 3,
    flavor: "Кричит перед ударом — единственное, что она делает вежливо.",
    moves: ["attack", "multi", "terror", "attack"] }),
  C({ id: "ogre_oaf", name: "Огр-тупица", race: "none", art: "foe:brute", tier: 2,
    type: "strong",
    hp: 74, ap: 2, atk: [11, 18], armor: 3, gold: [48, 84], xp: 21, minFloor: 3,
    flavor: "Медленно соображает, быстро размахивает.",
    moves: ["heavy", "attack", "guard", "sunder"] }),
  C({ id: "spider_hunter", name: "Паук-охотник", race: "beast", art: "foe:arachnid", tier: 2,
    type: "agile",
    hp: 52, ap: 3, atk: [8, 13], armor: 1, gold: [30, 56], xp: 18, minFloor: 3,
    flavor: "Не плетёт сетей. Просто догоняет.",
    moves: ["attack", "poison", "multi", "attack"] }),
  C({ id: "mimic_chest", name: "Мимик-сундук", race: "construct", art: "foe:mimic", tier: 2,
    type: "strong",
    hp: 66, ap: 3, atk: [10, 16], armor: 3, gold: [56, 98], xp: 24, minFloor: 4,
    flavor: "Золото внутри — единственная правда в этой комнате.",
    moves: ["heavy", "attack", "guard", "wound"] }),
  C({ id: "gargoyle", name: "Каменная горгулья", race: "construct", art: "foe:construct", tier: 2,
    type: "strong",
    hp: 70, ap: 3, atk: [9, 15], armor: 5, gold: [44, 78], xp: 23, minFloor: 4,
    flavor: "Спала на потолке весь прошлый этаж.",
    moves: ["guard", "heavy", "sunder", "attack"] }),
  C({ id: "dark_priest", name: "Тёмный жрец", race: "none", art: "foe:robed", tier: 2,
    type: "smart",
    hp: 50, ap: 4, atk: [7, 12], armor: 1, gold: [46, 84], xp: 22, minFloor: 4,
    flavor: "Молитва в обратную сторону: его лечит, тебя гноит.",
    moves: ["drain", "curse", "attack", "guard"] }),
  C({ id: "werewolf", name: "Волколак", race: "beast", art: "foe:wolf", tier: 2,
    type: "strong",
    hp: 64, ap: 4, atk: [10, 15], armor: 1, gold: [42, 76], xp: 24, minFloor: 4,
    flavor: "Луны здесь нет, ему всё равно.",
    moves: ["attack", "multi", "wound", "heavy"] }),
  C({ id: "iron_guardian", name: "Железный голем-страж", race: "construct", art: "foe:construct", tier: 2,
    type: "strong",
    hp: 82, ap: 2, atk: [12, 18], armor: 6, gold: [52, 92], xp: 27, minFloor: 5,
    flavor: "Внутри не осталось того, кто его собирал.",
    moves: ["guard", "heavy", "sunder", "heavy"] }),
  C({ id: "witch_spider", name: "Ведьма-паучиха", race: "demon", art: "foe:arachnid", tier: 2,
    type: "smart",
    hp: 56, ap: 4, atk: [9, 15], armor: 2, gold: [54, 96], xp: 26, minFloor: 5,
    flavor: "Наматывает волосы на челюсти и вяжет себе новое лицо.",
    moves: ["curse", "poison", "attack", "drain"] }),
];

/** Высокие этажи (6+): предводители и старшая нежить. */
const HIGH_TIER: EnemyDef[] = [
  C({ id: "troll", name: "Тролль-пещерник", race: "beast", art: "foe:brute", tier: 3,
    type: "strong",
    hp: 108, ap: 3, atk: [14, 21], armor: 3, gold: [70, 126], xp: 34, minFloor: 6,
    flavor: "Рана на его шее закрылась, пока ты смотрел.",
    moves: ["heavy", "attack", "guard", "wound"] }),
  C({ id: "vampire_lord", name: "Вампир-лорд", race: "vampire", art: "foe:vampire", tier: 3,
    type: "smart",
    hp: 88, ap: 5, atk: [12, 18], armor: 3, gold: [86, 148], xp: 40, minFloor: 6,
    flavor: "Просит разрешения войти. Не дожидается.",
    moves: ["drain", "attack", "curse", "multi"] }),
  C({ id: "lich_tender", name: "Лич-хранитель", race: "undead", art: "foe:robed", tier: 3,
    type: "smart",
    hp: 96, ap: 4, atk: [13, 20], armor: 4, gold: [96, 168], xp: 46, minFloor: 7,
    flavor: "Хранит чужой прах в собственном саркофаге.",
    moves: ["curse", "drain", "bell_stun", "heavy"] }),
  C({ id: "wyrmling", name: "Дракон-подросток", race: "dragon", art: "foe:dragon", tier: 3,
    type: "strong",
    hp: 120, ap: 4, atk: [15, 23], armor: 5, gold: [110, 190], xp: 54, minFloor: 7,
    flavor: "Первый ожог на собственном крыле — и уже гордится им.",
    moves: ["heavy", "attack", "multi", "sunder"] }),
  C({ id: "devourer", name: "Демон-пожиратель", race: "demon", art: "foe:demon", tier: 3,
    type: "smart",
    hp: 104, ap: 5, atk: [14, 21], armor: 4, gold: [104, 182], xp: 52, minFloor: 7,
    flavor: "Ест память, потом сам ужасается, что вспомнил.",
    moves: ["attack", "curse", "drain", "heavy"] }),
  C({ id: "golem_colossus", name: "Голем-колосс", race: "construct", art: "foe:construct", tier: 3,
    type: "strong",
    hp: 140, ap: 3, atk: [17, 25], armor: 8, gold: [98, 176], xp: 56, minFloor: 8,
    flavor: "Каждый его шаг — пересчёт этажа.",
    moves: ["heavy", "guard", "sunder", "heavy"] }),
  C({ id: "mimic_elder", name: "Старший мимик-лабиринт", race: "construct", art: "foe:mimic", tier: 3,
    type: "strong",
    hp: 92, ap: 4, atk: [14, 20], armor: 5, gold: [124, 214], xp: 60, minFloor: 8,
    flavor: "Он не притворяется сундуком. Он притворяется коридором.",
    moves: ["multi", "heavy", "guard", "wound"] }),
  C({ id: "spider_queen", name: "Королева пауков", race: "beast", art: "foe:arachnid", tier: 3,
    type: "agile",
    hp: 116, ap: 5, atk: [14, 20], armor: 4, gold: [118, 206], xp: 58, minFloor: 8,
    flavor: "Её яйцекладки пронизывают стены — этаж уже занят.",
    moves: ["poison", "attack", "multi", "curse"] }),
  C({ id: "bone_warlord", name: "Древний скелет-полководец", race: "undead", art: "foe:skeleton", tier: 3,
    type: "strong",
    hp: 124, ap: 5, atk: [16, 23], armor: 6, gold: [132, 228], xp: 66, minFloor: 9,
    flavor: "Командует войском, которого давно никто не видит.",
    moves: ["sunder", "heavy", "bell_stun", "attack"] }),
  C({ id: "sphinx", name: "Сфинкс-страж", race: "construct", art: "foe:construct", tier: 3,
    type: "strong",
    hp: 132, ap: 4, atk: [17, 24], armor: 7, gold: [140, 240], xp: 72, minFloor: 9,
    flavor: "Ответ не открывает дверь — он и есть дверь.",
    moves: ["curse", "heavy", "guard", "drain"] }),
];

export const EXTRA_ENEMIES: EnemyDef[] = [...LOW_TIER, ...MID_TIER, ...HIGH_TIER];

/** Боссы лестниц: ярусы 1–3 оставлены прежними, дальше — новые. */
export const EXTRA_BOSSES: EnemyDef[] = [
  C({ id: "boss_queen", name: "Матка Глубины", race: "beast", title: "Страж лестницы IV яруса",
    type: "agile",
    isBoss: true, art: "foe:arachnid", minFloor: 4,
    hp: 128, ap: 4, atk: [12, 18], armor: 3, gold: [150, 220], xp: 70,
    flavor: "Весь этаж — её тело, только растянутое на несколько комнат.",
    moves: ["poison", "multi", "attack", "curse", "guard"], passiveId: "venom",
    abilitiesDesc: ["Плетение — удушающее кровотечение на 3 раунда",
      "Засада — выпад после её хода (двойной удар)", "Ядовитый укус — отравление живым"] }),
  C({ id: "boss_lich", name: "Владыка Урны", race: "undead", title: "Страж лестницы V яруса",
    type: "smart",
    isBoss: true, art: "foe:robed", minFloor: 5,
    hp: 152, ap: 4, atk: [14, 21], armor: 4, gold: [190, 270], xp: 92,
    flavor: "Его урна стоит за порогом, и он об этом напоминает каждым ударом.",
    moves: ["curse", "drain", "bell_stun", "heavy", "guard"], passiveId: "regen",
    abilitiesDesc: ["Печать урны — накладывает проклятие и при жизни питается раной",
      "Отбор дыхания — вытягивает здоровье", "Костяной звон — отнимает 1 ход"] }),
  C({ id: "boss_warlord", name: "Мёртвый Маршал", race: "undead", title: "Страж лестницы VI яруса",
    type: "strong",
    isBoss: true, art: "foe:skeleton", minFloor: 6,
    hp: 176, ap: 5, atk: [17, 24], armor: 6, gold: [230, 320], xp: 118,
    flavor: "Считает шаги твоего отряда. Отряда давно нет.",
    moves: ["sunder", "heavy", "bell_stun", "attack", "guard"], passiveId: "frenzy",
    abilitiesDesc: ["Приказ — раскалывает броню и усиливает удар",
      "Ратный колокол — лишает хода", "Строй — уходит в глухую оборону"] }),
  C({ id: "boss_devourer", name: "Пожиратель Сводов", race: "demon", title: "Страж лестницы VII яруса",
    type: "strong",
    isBoss: true, art: "foe:demon", minFloor: 7,
    hp: 196, ap: 5, atk: [18, 26], armor: 5, gold: [270, 370], xp: 146,
    flavor: "Проглотил комнату целиком. Ещё ему мало.",
    moves: ["attack", "drain", "curse", "heavy", "multi"], passiveId: "frenzy",
    abilitiesDesc: ["Пожирание — бьёт и лечится от нанесённого урона",
      "Нутрование — накладывает проклятие", "Истерика — действует на ход больше"] }),
  C({ id: "boss_sphinx", name: "Хранитель Загадок", race: "construct", title: "Страж лестницы VIII яруса",
    type: "strong",
    isBoss: true, art: "foe:construct", minFloor: 8,
    hp: 224, ap: 4, atk: [19, 27], armor: 8, gold: [320, 430], xp: 178,
    flavor: "Три вопроса. Ты не услышишь ни одного.",
    moves: ["curse", "heavy", "guard", "drain", "bell_stun"], passiveId: "stone_hide",
    abilitiesDesc: ["Каменный ответ — мощный удар сквозь латы",
      "Вопрос без слов — проклятие", "Постамент — глухая защита под камнем"] }),
];

/* ═══════════════  ПРИПАСЫ, РЕАГЕНТЫ, СВИТКИ  ═══════════════ */

export const EXTRA_REAGENTS: string[] = [
  "powder", // порох
  "cloth", // ткань
  "root", // растение
  "herb", // растение
  "silk", // ингредиент монстра
  "fang", // ингредиент монстра
  "gland", // ингредиент монстра
  "ember", // ингредиент монстра
  "parchment", "magic_ink", "scrap_metal", "vial",
];

export const EXTRA_ITEMS: ItemDef[] = [
  /* реагенты */
  { id: "powder", name: "Порох", kind: "reagent", price: 40, reagentCat: "mineral",
    desc: "Копоть, сера и правило «не ударять два раза подряд»." },
  { id: "cloth", name: "Зачарованная ткань", kind: "reagent", price: 46, reagentCat: "cloth",
    desc: "Ткань, из которой выткали чужое имя, и оно до сих пор держится." },
  { id: "root", name: "Кривокорень", kind: "reagent", price: 32, reagentCat: "plant",
    desc: "Кривой, потому что растило ему некуда." },
  { id: "herb", name: "Горькая полынь", kind: "reagent", price: 30, reagentCat: "plant",
    desc: "Растёт у порога. Никто не сажал." },
  { id: "silk", name: "Шёлк паука", kind: "reagent", price: 55, reagentCat: "monster",
    desc: "Снят с ловушки размером с человека." },
  { id: "fang", name: "Клык твари", kind: "reagent", price: 58, reagentCat: "monster",
    desc: "Ещё тёплый. Не надевать на нитку — он жуёт." },
  { id: "gland", name: "Железа слизи", kind: "reagent", price: 52, reagentCat: "monster",
    desc: "Разрывается от волнения. Ведёт себя как живая." },
  { id: "ember", name: "Уголь с дна", kind: "reagent", price: 60, reagentCat: "monster",
    desc: "Не остывает. Обжигает на втором метре снаружи." },
  { id: "parchment", name: "Пергамент", kind: "reagent", price: 24, reagentCat: "cloth",
    desc: "Выделанная кожа, готовая принять заклинание. Основа любого свитка." },
  { id: "magic_ink", name: "Магические чернила", kind: "reagent", price: 48, reagentCat: "mineral",
    desc: "Мерцают в темноте. Без них свиток останется просто бумагой." },
  { id: "scrap_metal", name: "Металлолом", kind: "reagent", price: 22, reagentCat: "mineral",
    desc: "Обломки клинков и лат. Из них собирают боеприпасы." },
  { id: "vial", name: "Фляга", kind: "reagent", price: 18, reagentCat: "mineral",
    desc: "Пустая стеклянная фляга. Нужна для любого зелья." },

  /* специальные предметы */
  { id: "sapper_kit", name: "Снаряжение сапёра", kind: "special", price: 85, level: 2, minFloor: 2,
    use: { type: "special_kit" },
    desc: "Позволяет обезвредить ловушку. Шанс растёт от Интеллекта. Тратится при попытке в любом случае." },
  { id: "lockpicks", name: "Отмычки", kind: "special", price: 55, level: 1, minFloor: 1,
    use: { type: "special_lockpick" },
    desc: "Шанс открыть запертую дверь без ключа. Зависит от Ловкости. Тратятся при попытке в любом случае." },
  { id: "tattered_map", name: "Потрёпанная карта", kind: "special", price: 120, level: 2, minFloor: 2,
    use: { type: "special_map" },
    desc: "Используется на карте лабиринта: показывает сундуки, босса и события до конца этажа." },
  { id: "water_skin", name: "Бурдюк с водой", kind: "special", price: 40, level: 1, minFloor: 1,
    use: { type: "special_water" },
    desc: "Снимает горение на карте в Огненных недрах." },
  { id: "field_torch", name: "Факел", kind: "special", price: 35, level: 1, minFloor: 1,
    use: { type: "special_torch", rounds: 5 },
    desc: "+1 к видимости на 5 ходов по карте. В Тёмном подземелье на это время снимает штраф мрака." },

  /* припасы: новая вариативность */
  { id: "potion_haste", name: "Зелье скорости", kind: "potion", price: 110,
    use: { type: "haste", rounds: 3 },
    desc: "Три раунда ты действуешь на один ход раньше. Синяки на рёбрах после — отдельно." },
  { id: "scroll_terror", name: "Свиток ужаса", kind: "scroll", price: 130,
    use: { type: "terror", intReq: 3, rounds: 2 },
    desc: "Пугает настолько, что враг проводит 2 хода в защитной стойке." },
  { id: "scroll_snare", name: "Свиток оков", kind: "scroll", price: 145,
    use: { type: "stun_enemy", intReq: 4, rounds: 1 },
    desc: "Вяжет инициативу: враг пропускает следующий ход." },
  { id: "acid_vial", name: "Зелье кислоты", kind: "potion", price: 88, level: 2, minFloor: 2,
    use: { type: "acid", power: 12, scale: 1.5, scaleStat: "int", rounds: 2, element: "acid" },
    desc: "7 + 1.5×ЛОВ урона и снимает 3 брони врага (надолго)." },
  { id: "holy_water", name: "Зелье святого пламени", kind: "potion", price: 105, level: 3, minFloor: 3,
    use: { type: "damage", power: 18, scale: 3, scaleStat: "int", vs: "undead", element: "light" },
    desc: "7 + 1.5×ЛОВ урона. Нежити — вдвое против обычных." },
  { id: "serrated_knife", name: "Зазубренный кинжал", kind: "throwable", price: 62, level: 2, minFloor: 2,
    use: { type: "bleed", power: 8, scale: 1.5, scaleStat: "agi", rounds: 3 },
    desc: "7 + 1.5×ЛОВ физического урона и кровотечение на 3 раунда." },
  { id: "frost_bomb", name: "Морозная бомба", kind: "throwable", price: 84, level: 3, minFloor: 3,
    use: { type: "chill", power: 10, scale: 1.5, scaleStat: "agi", rounds: 3, element: "ice" },
    desc: "7 + 1.5×ЛОВ урона и обморожение: лечение −50% и периодический урон на 3 раунда." },
  { id: "blight_powder", name: "Прах порчи", kind: "throwable", price: 96, level: 4, minFloor: 4,
    use: { type: "blight", power: 6, scale: 1, scaleStat: "agi", rounds: 3 },
    desc: "7 + 1.5×ЛОВ урона и порча: враг наносит −20% урона и теряет 3% макс. ОЗ за раунд." },
  { id: "wither_dust", name: "Прах увядания", kind: "throwable", price: 110, level: 5, minFloor: 5,
    use: { type: "wither", power: 4, scale: 1, scaleStat: "agi", rounds: 3 },
    desc: "7 + 1.5×ЛОВ урона и увядание: любое лечение врага переходит в магический урон на 3 раунда." },
  { id: "potion_stone", name: "Зелье каменной кожи", kind: "potion", price: 100,
    use: { type: "stone", rounds: 3 },
    desc: "Три раунда входящий урон снижен на 30%." },
  { id: "bomb_flash", name: "Световая бомба", kind: "throwable", price: 92,
    use: { type: "stun_enemy", rounds: 2 },
    desc: "Ослепляет: враг пропускает 2 следующих хода." },
];

export const EXTRA_RECIPES: Recipe[] = [
  { id: "r9", out: "potion_haste", count: 1, need: ["root", "herb", "powder"], intReq: 3, price: 85 },
  { id: "r10", out: "scroll_terror", count: 1, need: ["silk", "cloth", "bone"], intReq: 4, price: 95 },
  { id: "r11", out: "acid_vial", count: 1, need: ["powder", "gland"], intReq: 2, price: 70, station: "alchemy" },
  { id: "r12", out: "holy_water", count: 1, need: ["herb", "tear", "cloth"], intReq: 4, price: 100, station: "alchemy" },
  { id: "r21", out: "serrated_knife", count: 2, need: ["fang", "powder"], intReq: 2, price: 55, station: "workshop" },
  { id: "r22", out: "frost_bomb", count: 1, need: ["powder", "ember", "cloth"], intReq: 3, price: 75, station: "workshop" },
  { id: "r23", out: "blight_powder", count: 1, need: ["gland", "bone", "herb"], intReq: 3, price: 85, station: "workshop" },
  { id: "r24", out: "wither_dust", count: 1, need: ["tear", "bone", "silk"], intReq: 4, price: 95, station: "workshop" },
  { id: "r25", out: "throwing_knife", count: 3, need: ["fang", "powder"], intReq: 1, price: 40, station: "workshop" },
  { id: "r26", out: "smoke_bomb", count: 1, need: ["powder", "cloth", "herb"], intReq: 2, price: 65, station: "workshop" },
  { id: "r27", out: "blast_bomb", count: 1, need: ["powder", "ember", "fang"], intReq: 3, price: 85, station: "workshop" },
  { id: "r28", out: "bomb_flash", count: 1, need: ["powder", "silk", "cloth"], intReq: 3, price: 80, station: "workshop" },
  { id: "r13", out: "potion_stone", count: 1, need: ["root", "ember", "bone"], intReq: 5, price: 105 },
  { id: "r14", out: "scroll_snare", count: 1, need: ["silk", "root"], intReq: 4, price: 90 },
  { id: "r29", out: "sapper_kit", count: 1, need: ["scrap_metal", "cloth", "powder"], intReq: 3, price: 70, station: "workshop" },
  { id: "r30", out: "lockpicks", count: 1, need: ["scrap_metal", "fang"], intReq: 2, price: 45, station: "workshop" },
  { id: "r31", out: "tattered_map", count: 1, need: ["parchment", "magic_ink", "cloth"], intReq: 3, price: 95, station: "workshop" },
  { id: "r32", out: "water_skin", count: 1, need: ["vial", "herb"], intReq: 1, price: 30, station: "workshop" },
  { id: "r33", out: "field_torch", count: 1, need: ["cloth", "fire", "scrap_metal"], intReq: 1, price: 28, station: "workshop" }
];

/* ═══════════════  СОБЫТИЯ КАРТЫ  ═══════════════ */

export type MapEffectKind =
  | "hp"
  | "heal"
  | "gold"
  | "gold_loss"
  | "xp"
  | "curse"
  | "poison"
  | "reagent"
  | "supply"
  | "gear"
  | "stat";

export interface MapEffect {
  k: MapEffectKind;
  v?: number;
  stat?: StatKey;
}

export interface MapEventChoice {
  id: string;
  label: string;
  detail: string;
  /** Шанс хорошего исхода; при неудаче срабатывает bad. */
  chance: number;
  good: MapEffect[];
  bad: MapEffect[];
  goodText: string;
  badText: string;
}

export interface MapEvent {
  id: string;
  name: string;
  prompt: string;
  choices: MapEventChoice[];
}

/**
 * Каждый исход несёт и плюс, и минус: выигрыш всегда оплачен чем-то,
 * проигрыш никогда не бывает пустым.
 */
export const MAP_EVENTS: MapEvent[] = [
  {
    id: "altar",
    name: "Алтарь неизвестного",
    prompt: "Камень тёплый, а на нём — свежая влага. Кто-то успел раньше тебя.",
    choices: [
      {
        id: "blood",
        label: "Пролить кровь",
        detail: "Кровь за дар",
        chance: 0.6,
        good: [{ k: "xp", v: 70 }, { k: "hp", v: -18 }],
        bad: [{ k: "xp", v: 26 }, { k: "hp", v: -34 }],
        goodText: "Алтарь принимает дар и отвечает: прорыв опыта, но плечо гудит ещё долго.",
        badText: "Алтарь пьёт молча и почти ничего за это не даёт — плечо ноет.",
      },
      {
        id: "coins",
        label: "Собрать монеты",
        detail: "Золото с жертвенника",
        chance: 0.55,
        good: [{ k: "gold", v: 90 }, { k: "poison", v: 2 }],
        bad: [{ k: "gold", v: 35 }, { k: "curse", v: 3 }],
        goodText: "Монеты целы и тяжелы — но под ними блестит жало, и рука немеет.",
        badText: "Монет меньше, чем хотелось бы, и первая же отравлена.",
      },
      {
        id: "smash",
        label: "Разбить идола",
        detail: "Сломать угол",
        chance: 0.5,
        good: [{ k: "reagent", v: 1 }, { k: "xp", v: 30 }],
        bad: [{ k: "hp", v: -26 }, { k: "poison", v: 2 }],
        goodText: "Внутри — алые кристаллы. Края обломка крошатся в порох.",
        badText: "Осколок отскакивает и впечатывается в лицо; кровь идёт из носа.",
      },
    ],
  },
  {
    id: "well",
    name: "Колодец без дна",
    prompt: "Верёвка на блоке, ведро внизу. Оттуда тянет холодом и медом.",
    choices: [
      {
        id: "drink",
        label: "Напиться",
        detail: "Вода или что-то вместо неё",
        chance: 0.6,
        good: [{ k: "heal", v: 40 }, { k: "supply", v: 1 }],
        bad: [{ k: "heal", v: 14 }, { k: "poison", v: 3 }],
        goodText: "Вода освежает, а на дне ведра — забытый фляжник с припасами.",
        badText: "Вода стояла. Тяжело, горько и не проходит — начинается тяжёлый вечер.",
      },
      {
        id: "bucket",
        label: "Поднять ведро",
        detail: "Что там внизу?",
        chance: 0.5,
        good: [{ k: "gold", v: 110 }, { k: "hp", v: -12 }],
        bad: [{ k: "reagent", v: 1 }, { k: "curse", v: 2 }],
        goodText: "В ведре — кожаный мешочек. Рыба сгнила, монеты остались.",
        badText: "Мешочек пуст, зато снизу донеслось, как тебя зовут по имени.",
      },
      {
        id: "rope",
        label: "Спуститься по верёвке",
        detail: "К нижним камерам",
        chance: 0.45,
        good: [{ k: "gear", v: 1 }, { k: "hp", v: -22 }],
        bad: [{ k: "supply", v: 2 }, { k: "hp", v: -30 }],
        goodText: "Внизу лежит снаряжение проигравшего. Верёвка рвётся на середине.",
        badText: "Ниже темно и гулко. Ты поднимаешься с припасами, но с воспалённым плечом.",
      },
    ],
  },
  {
    id: "mirror",
    name: "Обсидиановое зеркало",
    prompt: "В чёрном стекле отражается комната, но без тебя.",
    choices: [
      {
        id: "touch",
        label: "Прикоснуться",
        detail: "Отражение подождёт",
        chance: 0.55,
        good: [{ k: "xp", v: 65 }, { k: "gold", v: -25 }],
        bad: [{ k: "xp", v: 24 }, { k: "curse", v: 3 }],
        goodText: "Стекло холодное, а в голове — сразу готовая мысль. Ты понимаешь больше.",
        badText: "Отражение не моргнуло. Взамен ты получаешь задержку в размышлениях и порчу.",
      },
      {
        id: "break",
        label: "Разбить зеркало",
        detail: "Металл о стекло",
        chance: 0.5,
        good: [{ k: "reagent", v: 2 }, { k: "xp", v: 25 }],
        bad: [{ k: "reagent", v: 1 }, { k: "hp", v: -20 }],
        goodText: "Осколки режутся чисто — оба осколка можно унести.",
        badText: "Осколок рвёт ладонь: часть руны потеряна, но один осколок цел.",
      },
      {
        id: "turn",
        label: "Отвернуться",
        detail: "Не манит",
        chance: 1,
        good: [{ k: "supply", v: 1 }],
        bad: [{ k: "gold", v: -15 }],
        goodText: "Мимо полки с чужими тряпками: один бинт выходит целым.",
        badText: "Мешок задевает стену и по краю высыпаются мелкие монеты — так, чтоб не ронять.",
      },
    ],
  },
  {
    id: "cache",
    name: "Ниша с проходом",
    prompt: "За камнем — чья-то выемка с записками на корой.",
    choices: [
      {
        id: "read",
        label: "Прочитать жилетки",
        detail: "Записки прохожих",
        chance: 0.6,
        good: [{ k: "xp", v: 55 }, { k: "poison", v: 1 }],
        bad: [{ k: "xp", v: 22 }, { k: "curse", v: 2 }],
        goodText: "Записки ведут до клада в соседнем коридоре — и разбирают подземелье, как ладонь.",
        badText: "Почерк разборчив, но последняя строка — твоя фамилия, выведенная заранее.",
      },
      {
        id: "grab",
        label: "Забрать всё",
        detail: "Корой, верёвка, мелочь",
        chance: 0.55,
        good: [{ k: "gold", v: 75 }, { k: "reagent", v: 1 }],
        bad: [{ k: "gold", v: 30 }, { k: "hp", v: -18 }],
        goodText: "В верёвке — мешочек с золотом и сухой мох.",
        badText: "Верёвка срывается натягом, рванувший узел бьёт по виску.",
      },
      {
        id: "leave",
        label: "Оставить прибор нетронутым",
        detail: "Чужое — чужое",
        chance: 1,
        good: [{ k: "heal", v: 16 }],
        bad: [{ k: "xp", v: -12 }],
        goodText: "Ты отдыхаешь у ниши: дышится легче, но воспоминания чужого прогулки уходят.",
        badText: "Ниша не помогла ни в чём — кроме привычки считать шаги.",
      },
    ],
  },
  {
    id: "mark",
    name: "Клеймённая колонна",
    prompt: "На камне — символ, нарисованный так часто, что стёрся в ямку.",
    choices: [
      {
        id: "take",
        label: "Принять клеймо",
        detail: "Рука на символ",
        chance: 0.55,
        good: [{ k: "stat", v: 1, stat: "str" }, { k: "hp", v: -24 }],
        bad: [{ k: "xp", v: 40 }, { k: "curse", v: 3 }],
        goodText: "Тело твердеет: сила в пригоршне, но шрам уже не сойдёт.",
        badText: "Клеймо не легло — осталась лишь печать усталости и чужое неудовольствие.",
      },
      {
        id: "scrape",
        label: "Соскоблить символ",
        detail: "Порох в ямку",
        chance: 0.6,
        good: [{ k: "reagent", v: 2 }, { k: "gold", v: 45 }],
        bad: [{ k: "hp", v: -14 }, { k: "reagent", v: 1 }],
        goodText: "Порох из выемки сходит слоями: два горстья и мелочь наверху.",
        badText: "Камень хрупок: руку рвёт об осколок, но одна горсть пороха цела.",
      },
      {
        id: "pray",
        label: "Помолиться по-своему",
        detail: "Без свидетелей",
        chance: 0.65,
        good: [{ k: "heal", v: 30 }, { k: "supply", v: 1 }],
        bad: [{ k: "poison", v: 2 }, { k: "gold", v: -20 }],
        goodText: "Тихо и неловко, но рана подтягивается, а кто-то оставил флягу у колонны.",
        badText: "Символ не расслышал зато под кожу лёг сквозняк, а мешок меньше на четверть.",
      },
    ],
  },
];

export function mapEventById(id: string): MapEvent | undefined {
  return MAP_EVENTS.find((e) => e.id === id);
}
