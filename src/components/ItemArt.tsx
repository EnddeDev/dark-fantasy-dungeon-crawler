import type { CSSProperties } from "react";
import type { RarityTier } from "../game/types";
import { RARITY_STYLE } from "./ui";

interface AtlasCell {
  col: number;
  row: number;
  filter?: string;
}

/**
 * Координаты и индивидуальная цветовая градуировка всех предметов в атласе 6×6
 * (public/images/items-atlas.jpg). Каждая вещь отображается как настоящая картина маслом!
 */
const ATLAS_MAP: Record<string, AtlasCell> = {
  // ── ОРУЖИЕ ──
  knife: { col: 0, row: 0 },
  dagger: { col: 0, row: 0, filter: "contrast(1.25) hue-rotate(25deg) brightness(1.05)" },
  rapier: { col: 1, row: 0 },
  spear: { col: 1, row: 0, filter: "hue-rotate(45deg) brightness(1.1) contrast(1.1)" },
  sword: { col: 2, row: 0 },
  greatsword: { col: 2, row: 0, filter: "contrast(1.35) brightness(0.9) saturate(1.25)" },
  staff: { col: 3, row: 0 },
  axe: { col: 4, row: 0 },
  hammer: { col: 5, row: 0 },
  warhammer2: { col: 5, row: 0, filter: "contrast(1.4) brightness(0.85) sepia(0.25)" },
  abyss: { col: 0, row: 1 },

  // ── БРОНЯ, ШЛЕМЫ, ЩИТЫ ──
  rag: { col: 1, row: 1 },
  coif: { col: 1, row: 1, filter: "sepia(0.4) contrast(1.25) brightness(1.05)" },
  wraps: { col: 1, row: 1, filter: "brightness(1.15) hue-rotate(20deg)" },
  mail: { col: 2, row: 1 },
  vambraces: { col: 2, row: 1, filter: "contrast(1.25) brightness(1.05)" },
  runed_bracers: { col: 2, row: 1, filter: "hue-rotate(210deg) saturate(1.8) contrast(1.1)" },
  shroud: { col: 3, row: 1 },
  plate: { col: 4, row: 1 },
  helm: { col: 4, row: 1, filter: "contrast(1.3) brightness(1.1)" },
  greathelm: { col: 4, row: 1, filter: "contrast(1.5) brightness(0.9)" },
  shield_round: { col: 4, row: 1, filter: "sepia(0.5) hue-rotate(-20deg) contrast(1.2)" },
  shield_tower: { col: 4, row: 1, filter: "contrast(1.4) hue-rotate(-15deg) brightness(0.95)" },
  buckler: { col: 4, row: 1, filter: "brightness(1.2) contrast(1.15)" },
  crown_husk: { col: 2, row: 2, filter: "brightness(1.35) hue-rotate(40deg) saturate(1.4)" },

  // ── ОБУВЬ И КОЛЬЦА ──
  boots: { col: 1, row: 2 },
  shoes: { col: 1, row: 2, filter: "brightness(1.15) sepia(0.3)" },
  greaves: { col: 1, row: 2, filter: "contrast(1.35) grayscale(0.25)" },
  strider_boots: { col: 1, row: 2, filter: "sepia(0.4) brightness(0.95) contrast(1.25)" },
  ring_stone: { col: 0, row: 2 },
  ring_band: { col: 0, row: 2, filter: "brightness(1.3) sepia(0.5) saturate(1.3)" },
  ring_edge: { col: 0, row: 2, filter: "contrast(1.45) brightness(1.05)" },
  ring_ward: { col: 0, row: 2, filter: "hue-rotate(190deg) saturate(1.8)" },
  ring_venom: { col: 0, row: 2, filter: "hue-rotate(95deg) saturate(2.2)" },

  // ── ОБЕРЕГИ И ТАЛИСМАНЫ ──
  amulet: { col: 5, row: 1 },
  tooth: { col: 5, row: 1, filter: "sepia(0.9) brightness(1.1) contrast(1.2)" },
  icon: { col: 5, row: 1, filter: "contrast(1.35) brightness(0.9) sepia(0.3)" },
  soulstone: { col: 5, row: 1, filter: "hue-rotate(265deg) saturate(2.2) brightness(1.1)" },
  seal: { col: 2, row: 2 },

  // ── ЗЕЛЬЯ И МЕТАТЕЛЬНОЕ ОРУЖИЕ ──
  potion_s: { col: 3, row: 2 },
  potion_l: { col: 4, row: 2 },
  antidote: { col: 5, row: 2 },
  potion_haste: { col: 0, row: 3, filter: "hue-rotate(185deg) saturate(2.2) brightness(1.15)" },
  potion_stone: { col: 4, row: 2, filter: "grayscale(1) brightness(1.25) contrast(1.3)" },
  rage: { col: 0, row: 3 },
  throwing_knife: { col: 1, row: 3 },
  poison_dart: { col: 2, row: 3 },
  smoke_bomb: { col: 3, row: 3 },
  blast_bomb: { col: 4, row: 3 },
  bomb_flash: { col: 4, row: 3, filter: "brightness(1.7) contrast(1.35) hue-rotate(35deg)" },
  fear_vial: { col: 5, row: 3 },
  acid_vial: { col: 5, row: 2, filter: "hue-rotate(80deg) saturate(2.2) brightness(1.15)" },
  holy_water: { col: 3, row: 5, filter: "hue-rotate(195deg) brightness(1.45) saturate(1.6)" },

  // ── СВИТКИ ──
  scroll_spark: { col: 0, row: 4 },
  scroll_fire: { col: 1, row: 4 },
  scroll_heal: { col: 2, row: 4 },
  scroll_shadow: { col: 3, row: 4 },
  scroll_terror: { col: 3, row: 4, filter: "hue-rotate(-25deg) contrast(1.35) brightness(1.1)" },
  scroll_frost: { col: 4, row: 4 },
  scroll_snare: { col: 4, row: 4, filter: "hue-rotate(65deg) brightness(1.15)" },
  scroll_bolt: { col: 5, row: 4 },

  // ── РЕАГЕНТЫ ──
  moss: { col: 0, row: 5 },
  herb: { col: 0, row: 5, filter: "hue-rotate(85deg) saturate(1.5)" },
  bone: { col: 1, row: 5 },
  powder: { col: 1, row: 5, filter: "grayscale(1) brightness(0.65) contrast(1.6)" },
  fang: { col: 1, row: 5, filter: "brightness(1.25) sepia(0.5) contrast(1.2)" },
  fire: { col: 2, row: 5 },
  root: { col: 2, row: 5, filter: "sepia(0.95) brightness(0.85) hue-rotate(-20deg)" },
  ember: { col: 2, row: 5, filter: "saturate(2.8) brightness(1.35)" },
  tear: { col: 3, row: 5 },
  gland: { col: 3, row: 5, filter: "hue-rotate(90deg) saturate(2) brightness(1.1)" },
  relic: { col: 4, row: 5 },
  cloth: { col: 4, row: 5, filter: "hue-rotate(160deg) brightness(1.15)" },
  silk: { col: 4, row: 5, filter: "brightness(1.45) grayscale(0.4) contrast(1.15)" },
  chest: { col: 5, row: 5 },
};

export function ItemArt({
  id,
  name,
  size = 72,
  rarity,
  framed = true,
  className = "",
}: {
  id: string;
  name?: string;
  size?: number;
  /** Передавайте редкость только для исследованных предметов. */
  rarity?: RarityTier;
  framed?: boolean;
  className?: string;
}) {
  const cell = ATLAS_MAP[id] ?? { col: 0, row: 0 };
  const style: CSSProperties = {
    width: size,
    height: size,
    ...(framed ? (rarity ? RARITY_STYLE[rarity] : RARITY_STYLE.common) : {}),
  };

  return (
    <span
      role="img"
      aria-label={name ?? id}
      title={name}
      className={`item-art inline-block shrink-0 overflow-hidden bg-soot ${framed ? "border" : ""} ${className}`}
      style={{
        ...style,
        backgroundImage: 'url("images/items-atlas.jpg")',
        backgroundSize: "600% 600%",
        backgroundPosition: `${cell.col * 20}% ${cell.row * 20}%`,
        backgroundRepeat: "no-repeat",
        filter: cell.filter ?? "none",
      }}
    />
  );
}
