import type { ArchetypeId } from "./archetypes";
import type { StatMilestoneChoices } from "./statMilestones";
import type { BiomeId } from "./biomes";

export type StatKey = "str" | "agi" | "int";

/**
 * Слоты снаряжения.
 * Руки — две независимые ячейки: двуручное оружие занимает обе (mainHand.hands === 2),
 * либо в паре работают оружие + щит, либо парное оружие.
 */
export type Slot =
  | "mainHand"
  | "offHand"
  | "head"
  | "body"
  | "feet"
  | "wrists"
  | "ring1"
  | "ring2"
  | "amulet";

export const SLOT_ORDER: Slot[] = [
  "mainHand",
  "offHand",
  "head",
  "body",
  "feet",
  "wrists",
  "ring1",
  "ring2",
  "amulet",
];

export const SLOT_META: Record<Slot, { name: string; short: string }> = {
  mainHand: { name: "Правая рука", short: "П. рука" },
  offHand: { name: "Левая рука", short: "Л. рука" },
  head: { name: "Шлем", short: "Шлем" },
  body: { name: "Тело", short: "Тело" },
  feet: { name: "Ботинки", short: "Ботинки" },
  wrists: { name: "Наручи", short: "Наручи" },
  ring1: { name: "Кольцо I", short: "Кольцо I" },
  ring2: { name: "Кольцо II", short: "Кольцо II" },
  amulet: { name: "Оберег", short: "Оберег" },
};

export type WearTier = "battered" | "worn" | "new";

/** Диапазоны множителя состояния предмета. */
export const WEAR_RANGE: Record<WearTier, { base: number; lo: number; hi: number; label: string }> = {
  battered: { base: 0.75, lo: 0.7, hi: 0.8, label: "Изношенное" },
  worn: { base: 1.0, lo: 0.9, hi: 1.1, label: "Ношенное" },
  new: { base: 1.325, lo: 1.3, hi: 1.35, label: "Новое" },
};
export type RarityTier = "common" | "rare" | "epic" | "legendary";

/** Вес/габарит снаряжения. Характеристика задаётся отдельно: лёгкий нож — ЛОВ, посох — ИНТ. */
export type GearClass = "light" | "medium" | "heavy";

/**
 * Три типа снаряжения: оружие, броня и аксессуары.
 * Оружие не даёт здоровья, брони и уклонения; броня и аксессуары не дают урона.
 */
export type GearKind = "weapon" | "armor" | "accessory";

/** Вид оружия: от него зависят вес, рука, число свойств и их пул. */
export type WeaponType =
  | "dagger" | "rapier" | "sword" | "spear" | "axe" | "hammer"
  | "greatsword" | "greataxe" | "warhammer" | "staff" | "wand";

import type { GearEffectId, GearPassiveId } from "./gearEffects";

export type RareAffixId = "vamp" | "crit" | "thorns" | "regen" | "pierce" | "swift" | "might";
export type EpicSkillId = "fireball" | "blood_lance" | "ash_aegis" | "shadow_volley" | "frost_nova";
/** Приёмы брони: 7 на каждый класс (тяжёлая, средняя, лёгкая), из них 2 атакующих и 5 защитных. */
export type ArmorSkillId =
  | "heavy_bash"
  | "heavy_rampart"
  | "heavy_wall"
  | "heavy_fort"
  | "heavy_rage"
  | "heavy_guard"
  | "heavy_ward"
  | "medium_feint"
  | "medium_roll"
  | "medium_slip"
  | "medium_trip"
  | "medium_dance"
  | "medium_retreat"
  | "medium_hide"
  | "medium_bash"
  | "medium_hammer"
  | "medium_riposte"
  | "medium_brace"
  | "medium_guard"
  | "medium_stand"
  | "medium_shield_up"
  | "light_charm"
  | "light_spark"
  | "light_ward"
  | "light_veil"
  | "light_mind"
  | "light_runestone"
  | "light_glimmer"
  | "light_venom"
  | "light_dagger"
  | "light_evade"
  | "light_slip"
  | "light_dodge2"
  | "light_veilagi"
  | "light_quick"
  | "light_cut"
  | "light_hook"
  | "light_brace"
  | "light_sturdy"
  | "light_resolve"
  | "light_iron"
  | "light_patch";
export type LegendaryPassiveId =
  | "executioner"
  | "time_weaver"
  | "immortal_pact"
  | "archmage_blood"
  | "titan_heart";

export interface GearItem {
  uid: string;
  baseId: string;
  slot: Slot;
  /** Уровень предмета 1…10: выше уровня персонажа надеть нельзя. */
  level: number;
  /** Класс снаряжения: лёгкое / среднее / тяжёлое (у аксессуаров не выводится). */
  gearClass: GearClass;
  /** Тип снаряжения. У старых сохранений может отсутствовать — выводится из базы. */
  kind?: GearKind;
  /** Вид оружия (только для kind === "weapon"). */
  weaponType?: WeaponType;
  wear: WearTier;
  rarity: RarityTier;
  identified: boolean;
  /**
   * Множитель состояния предмета. Изношенное 0.75 (0.70–0.80), ношенное 1.0 (0.90–1.10),
   * новое 1.325 (1.30–1.35). Применяется ко всем характеристикам предмета.
   */
  wearMult: number;
  /** Множитель урона R экземпляра (только оружие): от 1 до 1.5, выпадает при создании. Нет поля — считается 1. */
  dmgMult?: number;
  /** Разброс параметров брони и украшений: 0.9 … 1.1 (только совместимость). */
  statMult: number;
  /** Базовые броски ОЗ/брони/уклонения до изношенности и уровня. Броню теперь задаёт armorQuality. */
  /** Регенерация снаряжения: разброс 90–110 (сотые); значение за ход считает scaledGearStats. Есть у брони и аксессуаров СИЛ/ИНТ. */
  statRolls?: { hp: number; armor: number; evade?: number; regen?: number; barrier?: number };
  /** Качество брони 0…1: положение защиты внутри диапазона слота (см. armorValue). */
  armorQuality?: number;
  /** Базовые значения свойств этого экземпляра до уровня. */
  effectRolls?: Partial<Record<GearEffectId, number>>;
  /** Конкретный приём этого экземпляра оружия (может отличаться от базового) */
  skillId?: string;
  /** Хват среднего оружия: одной рукой или двумя (×1.5 к урону). */
  grip?: "one" | "two";
  /** Стартовое снаряжение: надевается без требований к характеристикам. */
  noReq?: boolean;
  /** Редкое (и выше): 1 уникальный эффект по характеристике требования. */
  effects: GearEffectId[];
  /** Эпическое (и выше): боевой приём предмета (альтернатива двум эффектам). */
  epicSkill?: EpicSkillId;
  /** Приём брони: выпадает у эпической и легендарной брони. */
  armorSkill?: ArmorSkillId;
  /** Легендарное: пассивная способность по характеристике требования. */
  passive?: GearPassiveId;
  /** @deprecated поле сохранено для старых сохранений */
  rareAffix?: RareAffixId;
  /** @deprecated поле сохранено для старых сохранений */
  legendaryPassive?: LegendaryPassiveId;
}

/* ─────────────  ЗАДАНИЯ  ───────────── */

export type QuestGiverId =
  | "priest"
  | "smith"
  | "merchant"
  | "wizard"
  | "mercenary"
  | "villager"
  | "alchemist"
  | "master";
/** Доверие к жителю: от 0 до 5, растёт на один за каждое выполненное задание. */
export const TRUST_MAX = 5;
/** Убить существо на этаже, принести из подземелья или отдать реагенты. */
export type QuestKind = "kill" | "fetch" | "reagents";
/** Что приносим: трофей с существа, остатки товарища или живого товарища. */
export type FetchSource = "drop" | "remains" | "captive";

export type QuestReward =
  | { kind: "gold"; amount: number }
  | { kind: "supplies"; items: string[] }
  | { kind: "gear"; level: number };

export interface Quest {
  id: string;
  giver: QuestGiverId;
  kind: QuestKind;
  /** Этаж, где выполняется задание (для убийства и принесения). */
  floor: number;
  title: string;
  text: string;
  /** Вид существа: для убийства и трофея с существа. */
  enemyId?: string;
  enemyName?: string;
  /** Источник принесённого предмета (только для вида «принести»). */
  source?: FetchSource;
  /** Название принесённого предмета. */
  itemName?: string;
  /** Реагенты: id и нужное количество. */
  reagent?: string;
  amount?: number;
  reward: QuestReward;
  /** Скидка 25% на одну покупку (кузнец и торговец, в части заданий). */
  coupon: boolean;
  /** Убийство: существо побеждено. */
  done?: boolean;
}

/** Строка прилавка NPC: предмет, количество и цена. */
export interface ShopLine {
  id: string;
  qty: number;
  price: number;
}

/** Журнал заданий и торговцев героя. */
export interface QuestLog {
  /** Предложенные задания, ещё не взятые. */
  offers: Quest[];
  /** Взятые задания. */
  active: Quest[];
  /** id заданий, чей принесённый предмет уже в лобби. */
  carried: string[];
  /** Скидки 25% на следующую покупку. */
  coupons: number;
  /** Доверие к каждому жителю: 0…TRUST_MAX. */
  trust: Record<QuestGiverId, number>;
  /** Благословения, которые предлагает священник. */
  blessingOffers: string[];
  /** Благословение, купленное на следующий поход. */
  blessingNext: string | null;
  /** Волшебник: уникальные свитки и зелья, до 3 штук каждого. */
  wizard: ShopLine[];
  /** Проходимец: реагенты с чёрного хода по сниженной цене. */
  villager: ShopLine[];
  /** Наёмник: исследованное снаряжение с ценой ×2. */
  mercenary: GearItem[];
}

/** Метка задания на карте этажа. */
export interface QuestMark {
  cell: number;
  questId: string;
  kind: "kill" | "drop" | "remains" | "captive";
  /** Вид существа для убийства и трофея. */
  enemyId?: string;
  label: string;
}

/** Принесённое в вылазке: лежит в рюкзаке героя, пока он не вернулся в лобби. */
export interface CarriedQuest {
  questId: string;
  label: string;
}

export type Threat = "normal" | "horror" | "catastrophe";
export type EnemySeal = "items" | "skills" | "attack";

export interface Player {
  name: string;
  level: number;
  xp: number;
  statPoints: number;
  stats: Record<StatKey, number>;
  hp: number;
  /** Выносливость, перенесённая с карты в следующий бой. Нет — полный запас. */
  stamina?: number;
  gold: number;
  /** Расходники, свитки и реагенты: id -> количество */
  bag: Record<string, number>;
  /** Сумка с зельями: три слота (id зелья или null). Нет поля — сумка пустая. */
  pouch?: (string | null)[];
  /** Купленные в лавке рецепты: знание сохраняется между вылазками. */
  knownRecipes: string[];
  /** Инвентарь снаряжения (оружие, броня, украшения) */
  armory: GearItem[];
  /** UID надетых предметов из armory */
  equip: Record<Slot, string | null>;
  passives: string[];
  /** Выбранный на 5 уровне архетип. null — ещё не выбран. */
  archetype?: ArchetypeId | null;
  /** Выборы на рубежах характеристик 5/10. */
  statMilestones?: StatMilestoneChoices;
  /** Ранги веток навыков архетипа (0–5). Очки считаются от уровня. */
  skillRanks?: Record<string, number>;
  statuses: {
    wound: number; curse: number; poison: number; cursePower?: number;
    /** Новые боевые эффекты, которые могут переживать бой. */
    chill?: number; fear?: number; wither?: number; burn?: number;
    /** Тик периодического урона, который задал источник наложения (живёт между боями). */
    woundTick?: number; poisonTick?: number; burnTick?: number; chillTick?: number; curseTick?: number;
  };
  kills: number;
  /** Уровень лавки 1…10: задаёт шансы изношенности, редкости и ассортимент. */
  shopLevel: number;
  /** Задания и торговцы. У старых сохранений поля нет — создаётся при загрузке. */
  questLog?: QuestLog;
  /** Благословение текущего похода (null — нет). */
  blessing?: string | null;
}

export interface EnemyPassive {
  id: string;
  name: string;
  desc: string;
}

export interface Cell {
  x: number;
  y: number;
}

/** Событие, закреплённое за комнатой: шаг на клетку-метку его и запускает. */
export interface EventSpawn {
  /** Индекс комнаты в maze.rooms. */
  room: number;
  /** Клетка-метка внутри комнаты: там рисуется значок. */
  cell: number;
  kind: "positive" | "neutral" | "negative";
  eventId: string;
}

export interface Maze {
  size: number;
  /** Тип этажа. Необязателен для совместимости со старыми картами: отсутствие = классика. */
  biome?: BiomeId;
  /** h[y][x] — стена между (x,y-1) и (x,y) */
  h: boolean[][];
  /** v[y][x] — стена между (x-1,y) и (x,y) */
  v: boolean[][];
  start: Cell;
  stairs: Cell;
  boss: Cell;
  bossDefeated: boolean;
  doors: number[];
  openedDoors: number[];
  chests: number[];
  openedChests: number[];
  keys: number[];
  takenKeys: number[];
  /** Клетки-события: метка комнаты, видна на карте до подхода. */
  events: number[];
  /** Метки заданий: убийство, трофей, остатки или товарищ. */
  questMarks?: QuestMark[];
  usedEvents: number[];
  /**
   * События по комнатам: одна комната — одно событие, вид задаёт значок.
   * У старых сохранений поля нет — тогда работает прежний случайный выбор.
   */
  eventSpawns?: EventSpawn[];
  /** Постоянные обитатели карты: 1 монстр на 8 клеток, виден в свете факела. */
  monsters: number[];
  /** Ловушки: 1 на 16 клеток, обычно скрыты до момента обнаружения. */
  traps: number[];
  /** Комнаты, разбавляющие коридоры: залы, крипты, галереи, пилоны. */
  rooms: {
    x: number;
    y: number;
    w: number;
    h: number;
    kind: string;
    name: string;
    /** Тон настила на карте: plain, crypt, throne, arcane, forge, store. */
    tone?: string;
    pillars: [number, number][];
  }[];
  dist: number[][];
}

export interface Run {
  /** Страж хоть одного яруса в этом походе побеждён: выход без потерь. */
  bossSlain?: boolean;
  floor: number;
  maze: Maze;
  pos: Cell;
  prevPos: Cell;
  seen: Record<string, boolean>;
  gold: number;
  loot: string[];
  gearLoot: GearItem[];
  keys: number;
  steps: number;
  log: string[];
  /** Факел: оставшиеся ходы по карте (+1 видимость, снимает штраф мрака). */
  torchTurns?: number;
  /** Потрёпанная карта раскрыла сундуки, босса и события до конца этажа. */
  mapRevealed?: boolean;
  /** Горение, оставшееся на карте в Огненных недрах. */
  burning?: number;
  /** Клетка монстра, который начал текущий бой (null — босс или событие). */
  battleCell?: number | null;
  /** Монстры, побеждённые на этом этаже: их клетки больше не опасны. */
  clearedMonsters?: number[];
  /** Ловушки, которые игрок уже заметил: только они видны на карте. */
  revealedTraps?: number[];
  /** События, которые герой посетил и покинул, не использовав: их значок на карте настоящий. */
  revealedEvents?: number[];
  /** Сработавшие ловушки: повторно не срабатывают. */
  sprungTraps?: number[];
  /** Принесённое в этой вылазке: попадёт в лобби только при возвращении. */
  questCarry?: CarriedQuest[];
}

export type ModalState =
  | { kind: "intro" }
  | {
      kind: "trap";
      trap: import("./traps").TrapState;
      /** Провал обхода или обезвреживания: исход ждёт решения — принять или избежать за выносливость. */
      failed?: { action: "bypass" | "disarm"; outcome: import("./traps").TrapOutcome };
    }
  | { kind: "door"; x: number; y: number }
  | { kind: "chest"; gold: number; items: string[]; gear: GearItem[]; xp: number }
  | { kind: "key" }
  | { kind: "stairs" }
  /** Выход без победы над стражем: сколько уйдёт при подтверждении. */
  | { kind: "leave"; gold: number; items: number; gear: number }
  | { kind: "death"; cause: string; lost: number; lostGear: number }
  | { kind: "event"; eventId: string; cell: number; result?: { title: string; good: string; bad?: string } }
  | { kind: "note"; title: string; body: string };
