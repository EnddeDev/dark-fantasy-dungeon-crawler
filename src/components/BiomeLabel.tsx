import type { CSSProperties } from "react";
import { Castle, Flame, Moon, Snowflake, Waves } from "lucide-react";
import { BIOMES, BIOME_MAP_COLORS, type BiomeId } from "../game/biomes";

const ICONS = {
  classic: Castle,
  swamp: Waves,
  ice: Snowflake,
  dark: Moon,
  fire: Flame,
} as const;

export function BiomeIcon({ biome, size = 16 }: { biome: BiomeId; size?: number }) {
  const Icon = ICONS[biome];
  return <Icon size={size} aria-hidden />;
}

/** Компактная подпись типа этажа. */
export function BiomeTag({ biome }: { biome: BiomeId }) {
  return (
    <span className="inline-flex items-center gap-2 border border-flamedim/70 bg-black/35 px-2.5 py-1 font-display text-[0.92rem] uppercase tracking-[0.08em] text-flamehi">
      <BiomeIcon biome={biome} size={15} />
      {BIOMES[biome].name}
    </span>
  );
}

/** Одна строка с правилом среды; классика не добавляет лишнего блока. */
export function BiomeRule({ biome, className = "" }: { biome: BiomeId; className?: string }) {
  if (biome === "classic") return null;
  return (
    <p className={`flex items-start gap-2 text-[0.95rem] leading-snug text-parch/85 ${className}`}>
      <span className="mt-0.5 shrink-0 text-flame"><BiomeIcon biome={biome} size={16} /></span>
      <span><b className="text-flamehi">{BIOMES[biome].name}:</b> {BIOMES[biome].effect}</span>
    </p>
  );
}

/** Локальная палитра: меняет карту/бой, не трогая остальные экраны. */
export function biomeStyle(biome: BiomeId): CSSProperties {
  const c = BIOME_MAP_COLORS[biome];
  return {
    "--color-soot": c.background,
    "--color-slab": c.panel,
    "--color-slab2": c.panel,
    "--color-line": c.border,
    "--color-flame": c.accent,
    "--color-flamehi": c.accentHi,
    "--color-flamedim": c.wall,
  } as CSSProperties;
}
