import type { GearBaseDef } from "./content";

/** Стартовые варианты снаряжения, чтобы в лавке 1-го уровня было ≥6 моделей на каждый слот. */
const G = (g: GearBaseDef): GearBaseDef => g;

export const SHOP_STARTER_GEAR: GearBaseDef[] = [
  // Правая рука (дополнение к ножу, рапире, мечу, посоху)
  G({ id: "start_mace", name: "Учебная булава", slot: "mainHand", gearClass: "medium", stat: "str", dmg: [5, 9], price: 70, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Тяжёлая головка на короткой рукояти.", preferredEpic: "blood_lance" }),
  G({ id: "start_wand", name: "Ученическая палочка", slot: "mainHand", gearClass: "light", stat: "int", dmg: [3, 7], price: 65, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Искрит, если ею постучать по камню.", preferredEpic: "fireball" }),
  // Левая рука
  G({ id: "start_offknife", name: "Лёгкий кинжал", slot: "offHand", gearClass: "light", stat: "agi", dmg: [3, 5], price: 60, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Для второй руки.", preferredEpic: "shadow_volley" }),
  G({ id: "start_smallshield", name: "Малый щит", slot: "offHand", shield: true, gearClass: "medium", stat: "str", armor: 2, hp: 12, price: 95, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35, desc: "Доски, окованные полосой.", preferredEpic: "ash_aegis" }),
  G({ id: "start_focus", name: "Ученический фокус", slot: "offHand", gearClass: "light", stat: "int", hp: 10, price: 75, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Кристалл в медной оправе.", preferredEpic: "fireball" }),
  // Шлемы
  G({ id: "start_hood", name: "Дорожный капюшон", slot: "head", gearClass: "light", stat: "agi", armor: 1, hp: 8, price: 55, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 25, desc: "Скрывает лицо от ветра.", preferredEpic: "shadow_volley" }),
  G({ id: "start_cap", name: "Стёганая шапка", slot: "head", gearClass: "medium", stat: "str", armor: 1, hp: 12, price: 65, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Толстая ткань держит удар.", preferredEpic: "ash_aegis" }),
  G({ id: "start_circlet", name: "Медный обруч", slot: "head", gearClass: "light", stat: "int", armor: 1, hp: 8, price: 70, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Тонкий ободок с руной.", preferredEpic: "fireball" }),
  G({ id: "start_leatherhelm", name: "Кожаный шлем", slot: "head", gearClass: "medium", stat: "agi", armor: 2, hp: 10, price: 80, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35, desc: "Варёная кожа и заклёпки.", preferredEpic: "shadow_volley" }),
  G({ id: "start_ironskull", name: "Железная шапка", slot: "head", gearClass: "heavy", stat: "str", armor: 2, hp: 14, price: 95, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35, desc: "Простая, но крепкая.", preferredEpic: "ash_aegis" }),
  // Тело
  G({ id: "start_jacket", name: "Стёганая куртка", slot: "body", gearClass: "medium", stat: "str", armor: 2, hp: 14, price: 90, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35, desc: "Слои ткани вместо лат.", preferredEpic: "ash_aegis" }),
  G({ id: "start_leather", name: "Кожаная броня", slot: "body", gearClass: "medium", stat: "agi", armor: 2, hp: 12, evade: 0.02, price: 95, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35, desc: "Гнётся вместе с телом.", preferredEpic: "shadow_volley" }),
  G({ id: "start_robe", name: "Ученическая мантия", slot: "body", gearClass: "light", stat: "int", armor: 1, hp: 16, price: 85, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Пахнет пылью и мелом.", preferredEpic: "fireball" }),
  G({ id: "start_hide", name: "Шкура со швами", slot: "body", gearClass: "heavy", stat: "str", armor: 3, hp: 12, price: 110, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 40, desc: "Грубая, но держит зубы.", preferredEpic: "blood_lance" }),
  // Ботинки
  G({ id: "start_sandals", name: "Кожаные сандалии", slot: "feet", gearClass: "light", stat: "agi", hp: 8, evade: 0.04, price: 50, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 25, desc: "Лёгкий шаг.", preferredEpic: "shadow_volley" }),
  G({ id: "start_workboots", name: "Рабочие ботинки", slot: "feet", gearClass: "medium", stat: "str", armor: 1, hp: 12, price: 65, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Подошва в два слоя.", preferredEpic: "ash_aegis" }),
  G({ id: "start_softshoes", name: "Мягкие туфли", slot: "feet", gearClass: "light", stat: "int", hp: 10, evade: 0.03, price: 60, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 25, desc: "Не слышно шагов.", preferredEpic: "fireball" }),
  G({ id: "start_ironboots", name: "Кованые ботинки", slot: "feet", gearClass: "heavy", stat: "str", armor: 2, hp: 10, evade: -0.01, price: 85, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35, desc: "Тяжёлые, зато целые пальцы.", preferredEpic: "ash_aegis" }),
  G({ id: "start_trailboots", name: "Походные сапоги", slot: "feet", gearClass: "medium", stat: "agi", armor: 1, hp: 10, evade: 0.03, price: 75, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Для долгих коридоров.", preferredEpic: "shadow_volley" }),
  // Наручи
  G({ id: "start_cuffs", name: "Кожаные манжеты", slot: "wrists", gearClass: "light", stat: "agi", armor: 1, hp: 8, price: 50, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 25, desc: "Закрывают запястья.", preferredEpic: "shadow_volley" }),
  G({ id: "start_ironcuffs", name: "Железные наручи", slot: "wrists", gearClass: "heavy", stat: "str", armor: 2, hp: 10, price: 80, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35, desc: "Полосы металла на ремнях.", preferredEpic: "ash_aegis" }),
  G({ id: "start_runecuffs", name: "Рунные запястья", slot: "wrists", gearClass: "light", stat: "int", armor: 1, hp: 10, price: 70, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Тёплые на ощупь.", preferredEpic: "fireball" }),
  G({ id: "start_chainwrists", name: "Кольчужные наручи", slot: "wrists", gearClass: "medium", stat: "str", armor: 2, hp: 12, price: 85, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35, desc: "Кольца не режут кожу.", preferredEpic: "ash_aegis" }),
  G({ id: "start_straps", name: "Ремни лучника", slot: "wrists", gearClass: "medium", stat: "agi", armor: 1, hp: 10, evade: 0.02, price: 65, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Не мешают движению.", preferredEpic: "shadow_volley" }),
  // Кольца
  G({ id: "start_copperring", name: "Медное кольцо", slot: "ring1", altSlots: ["ring1", "ring2"], gearClass: "light", stat: "str", hp: 8, price: 55, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 25, desc: "Простой ободок.", preferredEpic: "ash_aegis" }),
  G({ id: "start_silverring", name: "Серебряное кольцо", slot: "ring1", altSlots: ["ring1", "ring2"], gearClass: "light", stat: "int", hp: 10, price: 75, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Холодит палец.", preferredEpic: "fireball" }),
  G({ id: "start_bonering", name: "Костяное кольцо", slot: "ring1", altSlots: ["ring1", "ring2"], gearClass: "light", stat: "agi", hp: 8, evade: 0.02, price: 65, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Вырезано из чьего-то ребра.", preferredEpic: "shadow_volley" }),
  G({ id: "start_ironring", name: "Железное кольцо", slot: "ring1", altSlots: ["ring1", "ring2"], gearClass: "medium", stat: "str", armor: 1, hp: 8, price: 70, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Тяжёлое для пальца.", preferredEpic: "ash_aegis" }),
  G({ id: "start_glassring", name: "Стеклянное кольцо", slot: "ring1", altSlots: ["ring1", "ring2"], gearClass: "light", stat: "int", hp: 12, price: 80, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35, desc: "Внутри застыла искра.", preferredEpic: "fireball" }),
  // Обереги
  G({ id: "start_pendant", name: "Медный жетон", slot: "amulet", gearClass: "light", stat: "str", hp: 10, price: 65, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Стёртый герб.", preferredEpic: "ash_aegis" }),
  G({ id: "start_feather", name: "Перо на шнурке", slot: "amulet", gearClass: "light", stat: "agi", hp: 8, evade: 0.02, price: 60, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 25, desc: "Лёгкое, как шаг.", preferredEpic: "shadow_volley" }),
  G({ id: "start_bead", name: "Стеклянная бусина", slot: "amulet", gearClass: "light", stat: "int", hp: 12, price: 75, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 30, desc: "Светится в темноте.", preferredEpic: "fireball" }),
  G({ id: "start_claw", name: "Коготь на цепи", slot: "amulet", gearClass: "medium", stat: "str", hp: 12, price: 80, level: 1, minFloor: 1, idIntReq: 2, idGoldCost: 35, desc: "Трофей с первой охоты.", preferredEpic: "blood_lance" }),
];
