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
  new: { base: 1.25, lo: 1.3, hi: 1.35, label: "Новое" },
};
export type RarityTier = "common" | "rare" | "epic" | "legendary";

/** Вес/габарит снаряжения. Характеристика задаётся отдельно: лёгкий нож — ЛОВ, посох — ИНТ. */
export type GearClass = "light" | "medium" | "heavy";

import type { GearEffectId, GearPassiveId } from "./gearEffects";

export type RareAffixId = "vamp" | "crit" | "thorns" | "regen" | "pierce" | "swift" | "might";
export type EpicSkillId = "fireball" | "blood_lance" | "ash_aegis" | "shadow_volley" | "frost_nova";
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
  /** Класс снаряжения: лёгкое / среднее / тяжёлое. */
  gearClass: GearClass;
  wear: WearTier;
  rarity: RarityTier;
  identified: boolean;
  /**
   * Множитель состояния предмета. Изношенное 0.75 (0.70–0.80), ношенное 1.0 (0.90–1.10),
   * новое 1.25 (1.30–1.35). Применяется ко всем характеристикам предмета.
   */
  wearMult: number;
  /** Разброс урона конкретного экземпляра: [минимум, максимум] */
  dmgRoll?: [number, number];
  /** Разброс параметров брони и украшений: 0.9 … 1.1 (только совместимость). */
  statMult: number;
  /** Базовые броски ОЗ/брони до изношенности и уровня. */
  statRolls?: { hp: number; armor: number };
  /** Базовые значения свойств этого экземпляра до уровня. */
  effectRolls?: Partial<Record<GearEffectId, number>>;
  /** Конкретный приём этого экземпляра оружия (может отличаться от базового) */
  skillId?: string;
  /** Хват среднего оружия: одной рукой или двумя (×1.5 к урону). */
  grip?: "one" | "two";
  /** Редкое (и выше): 1 уникальный эффект по характеристике требования. */
  effects: GearEffectId[];
  /** Эпическое (и выше): боевой приём предмета (альтернатива двум эффектам). */
  epicSkill?: EpicSkillId;
  /** Легендарное: пассивная способность по характеристике требования. */
  passive?: GearPassiveId;
  /** @deprecated поле сохранено для старых сохранений */
  rareAffix?: RareAffixId;
  /** @deprecated поле сохранено для старых сохранений */
  legendaryPassive?: LegendaryPassiveId;
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
  gold: number;
  /** Расходники, свитки и реагенты: id -> количество */
  bag: Record<string, number>;
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
  statuses: {
    wound: number; curse: number; poison: number; cursePower?: number;
    /** Новые боевые эффекты, которые могут переживать бой. */
    chill?: number; fear?: number; wither?: number; burn?: number;
  };
  kills: number;
  /** Уровень лавки 1…10: задаёт шансы изношенности, редкости и ассортимент. */
  shopLevel: number;
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
  /** Клетки-события с выбором: видны на карте до подхода. */
  events: number[];
  usedEvents: number[];
  /** Комнаты, разбавляющие коридоры: залы, крипты, галереи, пилоны. */
  rooms: { x: number; y: number; w: number; h: number; kind: string; name: string; pillars: [number, number][] }[];
  dist: number[][];
}

export interface Run {
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
}

export type ModalState =
  | { kind: "intro" }
  | { kind: "trap"; trap: import("./traps").TrapState }
  | { kind: "door"; x: number; y: number }
  | { kind: "chest"; gold: number; items: string[]; gear: GearItem[]; xp: number }
  | { kind: "key" }
  | { kind: "stairs" }
  | { kind: "death"; cause: string; lost: number; lostGear: number }
  | { kind: "event"; eventId: string; result?: { title: string; good: string; bad: string } }
  | { kind: "note"; title: string; body: string };
