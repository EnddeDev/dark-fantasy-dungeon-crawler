import { useId } from "react";
import type { RarityTier } from "../game/types";

/**
 * Предметные плитки, нарисованные кодом: тёмный подиум, тёплый свет факела
 * слева-сверху, двойной штрих (сажа под охрой) — та же световая схема,
 * что у живописного атласа, поэтому старые и новые вещи выглядят одним рядом.
 */
const GLYPHS: Record<string, string> = {
  /* ── оружие ── */
  knife: `<path d="M9 39 L31 13 L35 9 L39 7 L37 13 L15 39 Z" /><path d="M6 42 l5-5" /><path d="M20 30 l3 3" />`,
  rapier: `<path d="M24 4 L26 30 L24 34 L22 30 Z" /><path d="M14 34 h20" /><path d="M21 38 h6" /><path d="M34 10 c5 7 5 16 0 22" />`,
  sword: `<path d="M24 3 L27 28 L24 32 L21 28 Z" /><path d="M13 32 h22" /><path d="M24 32 v6" /><path d="M20 38 h8" />`,
  staff: `<path d="M13 43 L29 17" /><circle cx="32" cy="13" r="7" /><path d="M32 4 c3 4 1 6 0 7 c-2-1-3-3 0-7Z" />`,
  axe: `<path d="M15 43 L26 18" /><path d="M26 19 c9-7 16 1 12 10 c-2 5-7 6-12 3 z" /><path d="M20 30 l4 3" />`,
  hammer: `<path d="M15 43 L25 19" /><path d="M14 8 h20 v11 h-20 z" /><path d="M19 8 v-4 h10 v4" />`,
  abyss: `<path d="M12 42 c7-12 5-22 15-34 c2 14-5 26-12 34 z" /><path d="M20 30 c3 3 5 5 9 6" /><path d="M30 12 c3 2 5 1 7-2" />`,

  greatsword: `<path d="M24 3 L30 14 L27 34 H21 L18 14 Z" /><path d="M11 34 h26" /><path d="M24 34 v9" />`,
  spear: `<path d="M24 3 L28 13 L24 24 L20 13 Z" /><path d="M24 24 V44" /><path d="M19 15 h10" />`,
  warhammer2: `<path d="M24 8 V44" /><path d="M10 6 h28 v13 h-28 z" /><path d="M15 6 v-3 h18 v3" /><path d="M14 19 h20" />`,
  dagger: `<path d="M24 6 L27 24 L24 30 L21 24 Z" /><path d="M17 30 h14" /><path d="M24 30 v8" />`,
  shield_round: `<circle cx="24" cy="25" r="16" /><circle cx="24" cy="25" r="6" /><path d="M24 9 v6 M24 35 v6 M8 25 h6 M34 25 h6" />`,
  buckler: `<path d="M10 14 h28 v14 c0 8-7 13-14 16 -7-3-14-8-14-16 z" /><path d="M24 16 v22 M14 24 h20" />`,
  shield_tower: `<path d="M11 8 h26 v20 c0 9-8 15-13 18 -5-3-13-9-13-18 z" /><path d="M17 14 h14 M17 22 h14 M24 8 v36" />`,

  coif: `<path d="M14 26 a10 10 0 0 1 20 0 v10 h-6 v-8 h-8 v8 h-6 z" /><path d="M18 24 h12" /><path d="M20 34 h8" />`,
  helm: `<path d="M12 27 a12 12 0 0 1 24 0 v12 h-8 v-9 h-8 v9 h-8 z" /><path d="M24 15 v24" /><path d="M16 20 h16" />`,
  greathelm: `<path d="M13 26 h22 v14 h-22 z" /><path d="M13 26 a11 11 0 0 1 22 0" /><path d="M18 30 v10 M24 30 v10 M30 30 v10" />`,
  crown_husk: `<path d="M11 34 l4-18 6 9 3-13 3 13 6-9 4 18 z" /><path d="M11 34 h26" /><path d="M18 38 h12" />`,
  shoes: `<path d="M13 14 h9 v14 l13 8 v6 h-22 z" /><path d="M13 33 h9" /><path d="M31 36 h5" />`,
  greaves: `<path d="M16 8 h7 v16 l5 6 v10 h-12 v-6 l4-6 z" /><path d="M28 8 h6 v16 l4 6 v8 h-10 v-6 l4-6 z" />`,
  strider_boots: `<path d="M14 6 h9 v18 l8 6 h7 v7 h-24 z" /><path d="M14 31 h24" /><path d="M18 14 l6 4" />`,
  wraps: `<path d="M14 12 h20 v10 c-4 3-16 3-20 0 z" /><path d="M14 26 h20 v10 c-4 3-16 3-20 0 z" /><path d="M16 16 h16 M16 30 h16" />`,
  vambraces: `<path d="M14 10 h20 v14 l-4 4 h-12 l-4-4 z" /><path d="M14 28 h20 v10 l-4 4 h-12 l-4-4 z" /><path d="M18 17 h12 M18 34 h12" />`,
  runed_bracers: `<path d="M15 10 h18 v14 h-18 z" /><path d="M15 28 h18 v14 h-18 z" /><path d="M20 14 l4 5 4-5 M20 32 l4 5 4-5" />`,
  ring_band: `<circle cx="24" cy="30" r="12" /><circle cx="24" cy="30" r="7" />`,
  ring_edge: `<circle cx="24" cy="31" r="11" /><path d="M24 12 l4 8 h-8 z" />`,
  ring_ward: `<circle cx="24" cy="31" r="11" /><path d="M24 13 l7 8 -7 8 -7-8 z" />`,
  ring_venom: `<circle cx="24" cy="31" r="11" /><path d="M24 15 a4 4 0 0 1 0 8 a4 4 0 0 1 0-8" /><path d="M24 23 v6" />`,
  tooth: `<path d="M17 8 c6 6 8 14 7 20 c-1 5-4 6-7 6 -3 0-6-1-7-6 c-1-6 1-14 7-20 z" /><path d="M20 20 h8" />`,
  icon: `<path d="M14 8 h20 v30 l-10 4 -10-4 z" /><path d="M24 14 c4 4 4 10 0 14 c-4-4-4-10 0-14 z" />`,
  soulstone: `<circle cx="24" cy="24" r="14" /><path d="M24 10 c6 6 6 22 0 28 c-6-6-6-22 0-28 z" />`,

  /* ── доспехи ── */
  rag: `<path d="M16 13 l8-5 8 5 6 11 -7 4 v16 h-14 v-16 l-7-4 z" /><path d="M20 20 l4 6 4-6" />`,
  mail: `<path d="M14 13 l10-5 10 5 4 13 -6 3 v13 h-16 v-13 l-6-3 z" /><circle cx="18" cy="18" r="1.6" /><circle cx="24" cy="17" r="1.6" /><circle cx="30" cy="18" r="1.6" /><circle cx="21" cy="24" r="1.6" /><circle cx="27" cy="24" r="1.6" /><circle cx="24" cy="31" r="1.6" />`,
  shroud: `<path d="M24 5 c7 0 11 7 11 13 l4 24 H9 l4-24 c0-6 4-13 11-13 z" /><path d="M18 18 a6 6 0 0 0 12 0" /><path d="M14 42 h20" />`,
  plate: `<path d="M13 12 l11-5 11 5 3 15 -7 6 v9 h-14 v-9 l-7-6 z" /><path d="M24 13 v24" /><path d="M17 20 h5 M26 20 h5" />`,

  /* ── украшения ── */
  amulet: `<path d="M12 7 c5 9 19 9 24 0" /><path d="M24 15 l6 9 -6 9 -6-9 z" /><circle cx="24" cy="24" r="2.5" />`,
  ring_stone: `<circle cx="24" cy="30" r="11" /><path d="M24 11 l5 7 h-10 z" /><path d="M24 18 v5" />`,
  boots: `<path d="M15 7 h9 v19 l11 7 v6 h-20 z" /><path d="M15 32 h10" />`,
  seal: `<circle cx="24" cy="24" r="15" /><circle cx="24" cy="24" r="5" /><path d="M24 9 v6 M24 33 v6 M9 24 h6 M33 24 h6" />`,

  /* ── зелья и расходники ── */
  potion_s: `<path d="M19 5 h10 v9 l7 18 a7 7 0 0 1-6 10 h-12 a7 7 0 0 1-6-10 l7-18 z" /><path d="M17 28 h14" />`,
  potion_l: `<path d="M19 4 h10 v10 l8 18 a8 8 0 0 1-7 11 h-12 a8 8 0 0 1-7-11 l8-18 z" /><path d="M15 25 h18" /><path d="M15 31 h18" />`,
  antidote: `<path d="M19 5 h10 v9 l7 18 a7 7 0 0 1-6 10 h-12 a7 7 0 0 1-6-10 l7-18 z" /><path d="M19 12 h10" /><path d="M24 20 v8 M20 24 h8" />`,
  rage: `<path d="M19 5 h10 v9 l7 18 a7 7 0 0 1-6 10 h-12 a7 7 0 0 1-6-10 l7-18 z" /><path d="M24 18 l-3 7 h5 l-3 7" />`,
  smoke_bomb: `<rect x="16" y="17" width="16" height="24" rx="3" /><path d="M24 17 v-6" /><path d="M17 6 c4 4 10 4 14 0" /><path d="M19 25 h10" />`,
  blast_bomb: `<circle cx="24" cy="29" r="12" /><path d="M24 17 v-6" /><path d="M28 11 l5-5" /><path d="M33 6 l3 3 -3 3" />`,
  fear_vial: `<path d="M20 5 h8 v13 l6 12 a5 5 0 0 1-5 7 h-10 a5 5 0 0 1-5-7 l6-12 z" /><circle cx="21" cy="28" r="1.8" /><circle cx="27" cy="28" r="1.8" />`,
  throwing_knife: `<path d="M14 34 L30 14 L34 10 L33 16 L19 36 Z" /><path d="M11 38 l5-5" />`,
  poison_dart: `<path d="M11 37 L31 13" /><path d="M28 10 l10-3 -3 10 z" /><path d="M24 16 l4 4" />`,

  /* ── свитки ── */
  scroll_spark: `<path d="M15 11 h18 v26 H15 z" /><path d="M12 6 h24 v6 H12 z" /><path d="M19 19 h10 M19 25 h10 M19 31 h6" />`,
  scroll_fire: `<path d="M15 11 h18 v26 H15 z" /><path d="M12 6 h24 v6 H12 z" /><path d="M24 18 c4 5 1 8 0 9 c-3-1-4-4 0-9Z" />`,
  scroll_heal: `<path d="M15 11 h18 v26 H15 z" /><path d="M12 6 h24 v6 H12 z" /><path d="M20 24 h8 M24 20 v8" />`,
  scroll_shadow: `<path d="M15 11 h18 v26 H15 z" /><path d="M12 6 h24 v6 H12 z" /><path d="M18 22 a6 6 0 0 1 12 0 a6 6 0 0 1 -12 0Z" />`,
  scroll_frost: `<path d="M15 11 h18 v26 H15 z" /><path d="M12 6 h24 v6 H12 z" /><path d="M24 17 v12 M19 20 l10 6 M29 20 l-10 6" />`,
  scroll_bolt: `<path d="M15 11 h18 v26 H15 z" /><path d="M12 6 h24 v6 H12 z" /><path d="M27 17 l-8 9 h5 l-3 8 l9-11 h-5 z" />`,

  /* новые припасы и реагенты */
  potion_haste: `<path d="M19 5 h10 v9 l7 18 a7 7 0 0 1-6 10 h-12 a7 7 0 0 1-6-10 l7-18 z" /><path d="M27 14 l-7 8 h5 l-4 7 h6" />`,
  potion_stone: `<path d="M19 5 h10 v9 l7 18 a7 7 0 0 1-6 10 h-12 a7 7 0 0 1-6-10 l7-18 z" /><path d="M18 30 l6-6 6 6 -6 6 z" />`,
  scroll_terror: `<path d="M15 11 h18 v26 H15 z" /><path d="M12 6 h24 v6 H12 z" /><path d="M18 20 l6-4 6 4 -6 10 z" />`,
  scroll_snare: `<path d="M15 11 h18 v26 H15 z" /><path d="M12 6 h24 v6 H12 z" /><path d="M19 19 l6 6 -6 6 M29 19 l-6 6 6 6" />`,
  acid_vial: `<path d="M20 4 h8 v10 l6 14 a6 6 0 0 1-5 9 h-10 a6 6 0 0 1-5-9 l6-14 z" /><path d="M17 30 l5-4 4 5 5-5" />`,
  holy_water: `<path d="M20 5 h8 v8 l6 16 a6 6 0 0 1-5 9 h-10 a6 6 0 0 1-5-9 l6-16 z" /><path d="M24 22 v10 M19 27 h10" />`,
  bomb_flash: `<circle cx="24" cy="30" r="12" /><path d="M24 18 v-5" /><path d="M24 24 l7-7 M24 24 l-7-7 M24 24 v8 M24 24 l8 4 M24 24 l-8 4" />`,
  powder: `<path d="M10 34 c4-9 8-14 14-14 s10 5 14 14 z" /><path d="M14 34 h20" /><path d="M18 16 l2-6 M26 16 l-1-7 M32 19 l4-5" />`,
  cloth: `<path d="M12 12 h24 v24 h-24 z" /><path d="M12 20 l8 6 -8 6 M36 20 l-8 6 8 6" /><path d="M20 12 v24 M28 12 v24" />`,
  root: `<path d="M24 44 V16" /><path d="M24 16 c-6-4-10-10-8-13 c4-1 8 5 8 13 z" /><path d="M24 24 c6-3 9-8 7-11 c-4 0-7 5-7 11 z" /><path d="M17 40 h14" />`,
  herb: `<path d="M24 44 V18" /><path d="M24 24 c-7-2-11-8-9-12 c5 0 9 6 9 12 z" /><path d="M24 32 c7-2 11-8 9-12 c-5 0-9 6-9 12 z" />`,
  silk: `<path d="M8 24 c8-10 14 6 24-4 c4-4 6-2 8 2" /><path d="M8 32 c8-10 14 6 24-4 c4-4 6-2 8 2" /><path d="M10 16 c6-6 12 2 18-4" />`,
  fang: `<path d="M14 8 c8 8 11 18 10 25 c-1 6-6 7-10 7 -4 0-9-1-10-7 c-1-7 2-17 10-25 z" /><path d="M16 30 c2 4 5 5 8 4" />`,
  gland: `<path d="M24 8 c9 8 12 18 12 23 a12 12 0 0 1-24 0 c0-5 3-15 12-23 z" /><path d="M20 30 a4 4 0 0 0 8 0" />`,
  ember: `<path d="M24 6 c6 9 10 13 10 21 a10 10 0 0 1-20 0 c0-6 4-8 6-12 c1 4 4 5 4 5 z" /><path d="M12 42 h24" />`,

  /* ── реагенты ── */
  moss: `<path d="M10 40 c0-12 7-20 14-20 s14 8 14 20 z" /><path d="M18 40 c0-6 3-11 6-11 s6 5 6 11" /><path d="M14 26 l-3-4 M24 24 l0-5 M34 26 l3-4" />`,
  bone: `<path d="M13 34 l19-19" /><circle cx="11" cy="36" r="5" /><circle cx="17" cy="30" r="5" /><circle cx="29" cy="18" r="5" /><circle cx="35" cy="12" r="5" />`,
  fire: `<path d="M9 30 h30" /><path d="M13 30 c0-11 5-16 11-16 s11 5 11 16" /><path d="M19 42 h10 v-7 h-10 z" /><path d="M24 8 c3 5 0 8-1 9 c-2-1-3-4 1-9Z" />`,
  tear: `<path d="M24 6 c7 12 12 16 12 23 a12 12 0 0 1 -24 0 c0-7 5-11 12-23 z" /><path d="M18 30 a6 6 0 0 0 6 6" />`,
};

export const RARITY_COLOR: Record<RarityTier, string> = {
  common: "#9a8672",
  rare: "#5aa9e6",
  epic: "#a78bfa",
  legendary: "#f6d48a",
};

export function ItemIcon({
  id,
  className = "",
  size = 44,
  rarity,
  framed = true,
}: {
  id: string;
  className?: string;
  size?: number;
  rarity?: RarityTier;
  framed?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const glyph = GLYPHS[id];
  const color = rarity ? RARITY_COLOR[rarity] : "#e8dcc8";

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden
      style={{ color, display: "block" }}
    >
      <defs>
        <radialGradient id={`bg${uid}`} cx="28%" cy="22%" r="88%">
          <stop offset="0%" stopColor="#54401f" />
          <stop offset="42%" stopColor="#241a12" />
          <stop offset="100%" stopColor="#0a0806" />
        </radialGradient>
        <radialGradient id={`gl${uid}`} cx="30%" cy="26%" r="60%">
          <stop offset="0%" stopColor="#e0a33c" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#e0a33c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="48" height="48" fill={`url(#bg${uid})`} />
      <rect width="48" height="48" fill={`url(#gl${uid})`} />
      <ellipse cx="24" cy="42" rx="14" ry="3.2" fill="#000" opacity="0.5" />

      {glyph ? (
        <>
          <g
            fill="none"
            stroke="#080605"
            strokeWidth="4.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
            dangerouslySetInnerHTML={{ __html: glyph }}
          />
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            dangerouslySetInnerHTML={{ __html: glyph }}
          />
        </>
      ) : (
        <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <rect x="12" y="12" width="24" height="24" rx="3" />
          <path d="M12 20 h24 M24 12 v24" />
        </g>
      )}

      {framed && (
        <rect
          x="0.9"
          y="0.9"
          width="46.2"
          height="46.2"
          fill="none"
          stroke={rarity ? RARITY_COLOR[rarity] : "#3a2b1c"}
          strokeOpacity={rarity ? "0.85" : "0.7"}
          strokeWidth="1.8"
        />
      )}
    </svg>
  );
}
