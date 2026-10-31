/**
 * Типы этажей («биомы») и их числовые правила.
 * Классический лабиринт не меняет механику; особые этажи появляются с 3-го.
 */
export type BiomeId = "classic" | "swamp" | "ice" | "dark" | "fire";

export const BIOME_ORDER: BiomeId[] = ["classic", "swamp", "ice", "dark", "fire"];

export interface BiomeDef {
  id: BiomeId;
  name: string;
  /** Короткая подпись для карты и боя. */
  effect: string;
  /** Подробное правило для справки. */
  description: string;
  /** Шанс с 3-го этажа. На 1–2 этажах всегда classic. */
  chance: number;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  classic: {
    id: "classic",
    name: "Классический лабиринт",
    effect: "Без дополнительных эффектов.",
    description: "Обычные правила подземелья: видимость 3 клетки, лечение и урон без поправок среды.",
    chance: 0.3,
  },
  swamp: {
    id: "swamp",
    name: "Подземное болото",
    effect: "Лечение обоих участников −50%, кроме зелий.",
    description:
      "Любое восстановление здоровья у игрока и врага ослаблено на 50%: регенерация, вампиризм, свитки, способности и события карты. Зелья лечения и поддержки работают полностью.",
    chance: 0.175,
  },
  ice: {
    id: "ice",
    name: "Ледяные просторы",
    effect: "Игрок: −3 ОЗ в начале своего хода. Физические удары обоих участников −25%.",
    description:
      "В начале каждого своего хода игрок теряет 3 здоровья. Физические удары оружием и атаки врагов наносят на 25% меньше урона; заклинания, расходники и урон среды не ослабляются.",
    chance: 0.175,
  },
  dark: {
    id: "dark",
    name: "Тёмное подземелье",
    effect: "Видимость 2 клетки. Дополнительный шанс промаха физическим ударом 25%.",
    description:
      "Факел освещает только 2 клетки, стены и углы по-прежнему блокируют свет. Физические удары игрока и врага получают отдельную проверку промаха 25% до уклонения и брони.",
    chance: 0.175,
  },
  fire: {
    id: "fire",
    name: "Огненные недра",
    effect: "Каждый свой ход: горение усиливается на 2 ОЗ (−2, −4, −6…).",
    description:
      "В начале каждого своего хода игрок и враг получают отдельный слой горения. Первый слой отнимает 2 ОЗ, второй — 4, третий — 6 и так далее. Слои копятся до конца боя и не снимаются противоядием.",
    chance: 0.175,
  },
};

export const SWAMP_HEALING_MULT = 0.5;
export const ICE_TURN_DAMAGE = 3;
export const ICE_STRIKE_MULT = 0.75;
export const DARK_VISION = 2;
export const DARK_MISS_CHANCE = 0.25;
export const FIRE_BURN_STEP = 2;

/** Старые сохранения и тестовые карты без поля biome остаются классическими. */
export function normalizeBiome(value: unknown): BiomeId {
  return typeof value === "string" && BIOME_ORDER.includes(value as BiomeId)
    ? (value as BiomeId)
    : "classic";
}

export function mazeBiome(maze?: { biome?: BiomeId } | null): BiomeId {
  return normalizeBiome(maze?.biome);
}

/** 1–2 этажи: только классика. С 3-го: 30% / 17.5% / 17.5% / 17.5% / 17.5%. */
export function rollBiome(floor: number, rng: () => number = Math.random): BiomeId {
  if (!Number.isFinite(floor) || floor < 3) return "classic";
  const roll = Math.min(Math.max(rng(), 0), 0.999999);
  if (roll < 0.3) return "classic";
  if (roll < 0.475) return "swamp";
  if (roll < 0.65) return "ice";
  if (roll < 0.825) return "dark";
  return "fire";
}

export function biomeVision(biome: BiomeId, normalRadius = 3): number {
  return biome === "dark" ? DARK_VISION : normalRadius;
}

export function biomeHealingAmount(biome: BiomeId, amount: number, isPotion = false): number {
  const safe = Math.max(0, amount);
  return Math.round(safe * (biome === "swamp" && !isPotion ? SWAMP_HEALING_MULT : 1));
}

export function biomeStrikeMult(biome: BiomeId): number {
  return biome === "ice" ? ICE_STRIKE_MULT : 1;
}

export function biomeMissChance(biome: BiomeId): number {
  return biome === "dark" ? DARK_MISS_CHANCE : 0;
}

export function fireBurnDamage(stacks: number): number {
  return Math.max(0, stacks) * FIRE_BURN_STEP;
}

export function biomeChanceLabel(biome: BiomeId): string {
  const chance = `${Math.round(BIOMES[biome].chance * 1000) / 10}%`;
  return biome === "classic" ? `1–2 этажи: 100% · с 3-го: ${chance}` : `с 3-го этажа: ${chance}`;
}

export interface BiomeMapColors {
  paper: string;
  wash: string;
  grid: string;
  fog: string;
  fogLine: string;
  wallShadow: string;
  wall: string;
  wallEdge: string;
  wallLight: string;
  trail: string;
  room: string;
  roomLine: string;
  roomLabel: string;
  accent: string;
  accentHi: string;
  background: string;
  panel: string;
  border: string;
}

export const BIOME_MAP_COLORS: Record<BiomeId, BiomeMapColors> = {
  classic: {
    paper: "#d9c9a6", wash: "#efdfb6", grid: "#8f7f5e", fog: "#070504", fogLine: "#1c140d",
    wallShadow: "#120c08", wall: "#85592e", wallEdge: "#f5ce75", wallLight: "#fff7db",
    trail: "#7a5c2a", room: "#cbb894", roomLine: "#9e855c", roomLabel: "#6b4f2a",
    accent: "#e0a33c", accentHi: "#f6d48a", background: "#0d0a09", panel: "#15100d", border: "#322720",
  },
  swamp: {
    paper: "#9fb87a", wash: "#c5d99a", grid: "#395331", fog: "#071109", fogLine: "#1d3320",
    wallShadow: "#071109", wall: "#365c35", wallEdge: "#a7d275", wallLight: "#e1f3b6",
    trail: "#3f6a35", room: "#78985d", roomLine: "#426039", roomLabel: "#17351d",
    accent: "#9acb62", accentHi: "#d8f0a5", background: "#0b120c", panel: "#131d14", border: "#31472e",
  },
  ice: {
    paper: "#e7f1f5", wash: "#ffffff", grid: "#7c9bab", fog: "#101820", fogLine: "#2b3d49",
    wallShadow: "#16242e", wall: "#5b8196", wallEdge: "#c9e9f5", wallLight: "#ffffff",
    trail: "#6f95a8", room: "#c6dce6", roomLine: "#8fb2c4", roomLabel: "#294b5e",
    accent: "#8fd3ee", accentHi: "#e8f8ff", background: "#0c141c", panel: "#14202b", border: "#314957",
  },
  dark: {
    paper: "#b7b9ba", wash: "#d7d9da", grid: "#666a6d", fog: "#090a0b", fogLine: "#242628",
    wallShadow: "#101112", wall: "#555a5e", wallEdge: "#c4c8cb", wallLight: "#f0f2f3",
    trail: "#707579", room: "#969a9d", roomLine: "#686d71", roomLabel: "#2f3336",
    accent: "#c4c8cb", accentHi: "#f0f2f3", background: "#101112", panel: "#191b1d", border: "#3a3d40",
  },
  fire: {
    paper: "#3a1712", wash: "#7a2a16", grid: "#ff8a3d", fog: "#120605", fogLine: "#3a130c",
    wallShadow: "#160605", wall: "#7a2a16", wallEdge: "#ff8a3d", wallLight: "#ffd08a",
    trail: "#ff9d4d", room: "#571d12", roomLine: "#b84a22", roomLabel: "#ffd08a",
    accent: "#ff8a3d", accentHi: "#ffd08a", background: "#160907", panel: "#24100c", border: "#5a281a",
  },
};
