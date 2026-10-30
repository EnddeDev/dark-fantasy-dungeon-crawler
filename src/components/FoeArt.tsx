import type { CSSProperties } from "react";
import { foeArtSrc } from "../game/artManifest";

/**
 * Художественные портреты всех существ подземелья.
 * Сначала ищем индивидуальную картину в public/images/monsters (или базовый портрет),
 * а пока она не готова — используем живописную базу с индивидуальным цветовым грейдингом,
 * атмосферными эффектами (споры, паутина, руны, пламя) и реальной холщовой текстурой.
 */

interface CreatureStyle {
  base: string;
  filter: string;
  overlay?: "venom" | "frost" | "fire" | "blood" | "holy" | "shadow";
  vignette?: string;
}

const CREATURE_STYLES: Record<string, CreatureStyle> = {
  // --- НИЗКИЕ ЭТАЖИ ---
  rat_swarm: { base: "images/foe-vermin.jpg", filter: "contrast(1.25) saturate(1.3) hue-rotate(-15deg)", overlay: "blood" },
  rat_giant: { base: "images/foe-vermin.jpg", filter: "contrast(1.15) brightness(1.05)" },
  bat_vampire: { base: "images/foe-wraith.jpg", filter: "contrast(1.3) hue-rotate(195deg) brightness(1.1)", overlay: "shadow" },
  slime: { base: "images/foe-husk.jpg", filter: "hue-rotate(85deg) saturate(2.2) brightness(1.1)", overlay: "venom" },
  goblin_scout: { base: "images/foe-brute.jpg", filter: "hue-rotate(75deg) contrast(1.15) brightness(1.05)", overlay: "venom" },
  skeleton_guard: { base: "images/foe-bone.jpg", filter: "contrast(1.2) brightness(1.05)" },
  spider_weaver: { base: "images/foe-vermin.jpg", filter: "hue-rotate(105deg) saturate(1.8) contrast(1.2)", overlay: "venom" },
  sporeling: { base: "images/foe-husk.jpg", filter: "hue-rotate(45deg) saturate(1.8) brightness(1.1)", overlay: "venom" },
  mimic_larva: { base: "images/foe-husk.jpg", filter: "contrast(1.35) sepia(0.4) brightness(0.95)" },
  kobold: { base: "images/foe-brute.jpg", filter: "hue-rotate(55deg) brightness(1.1) contrast(1.1)" },
  ghost_light: { base: "images/foe-wraith.jpg", filter: "hue-rotate(175deg) saturate(2.4) brightness(1.35)", overlay: "frost" },

  // --- СРЕДНИЕ ЭТАЖИ ---
  goblin_warrior: { base: "images/foe-brute.jpg", filter: "hue-rotate(65deg) contrast(1.25) saturate(1.4)", overlay: "venom" },
  orc_raider: { base: "images/foe-brute.jpg", filter: "contrast(1.3) saturate(1.4) hue-rotate(-15deg)", overlay: "blood" },
  skeleton_archer: { base: "images/foe-bone.jpg", filter: "contrast(1.35) hue-rotate(200deg) brightness(0.9)", overlay: "shadow" },
  harpy: { base: "images/foe-wraith.jpg", filter: "contrast(1.35) hue-rotate(-20deg) brightness(1.05)", overlay: "blood" },
  ogre_oaf: { base: "images/foe-brute.jpg", filter: "contrast(1.15) brightness(1.05)" },
  spider_hunter: { base: "images/foe-vermin.jpg", filter: "hue-rotate(125deg) saturate(2) contrast(1.3)", overlay: "venom" },
  mimic_chest: { base: "images/foe-boss.jpg", filter: "contrast(1.4) sepia(0.5) brightness(0.9)" },
  gargoyle: { base: "images/foe-boss.jpg", filter: "grayscale(0.85) sepia(0.25) contrast(1.35) brightness(1.05)" },
  dark_priest: { base: "images/foe-wraith.jpg", filter: "hue-rotate(255deg) saturate(1.8) contrast(1.2)", overlay: "shadow" },
  werewolf: { base: "images/foe-brute.jpg", filter: "contrast(1.35) hue-rotate(215deg) brightness(0.95)", overlay: "blood" },
  iron_guardian: { base: "images/foe-boss.jpg", filter: "grayscale(0.65) contrast(1.4) brightness(0.95)" },
  witch_spider: { base: "images/foe-wraith.jpg", filter: "hue-rotate(115deg) saturate(2) contrast(1.3)", overlay: "venom" },

  // --- ВЫСОКИЕ ЭТАЖИ ---
  troll: { base: "images/foe-brute.jpg", filter: "contrast(1.25) hue-rotate(45deg) saturate(1.3)" },
  vampire_lord: { base: "images/foe-boss.jpg", filter: "contrast(1.4) saturate(1.6) hue-rotate(-25deg)", overlay: "blood" },
  lich_tender: { base: "images/foe-bone.jpg", filter: "hue-rotate(240deg) saturate(2) contrast(1.35)", overlay: "shadow" },
  wyrmling: { base: "images/foe-brute.jpg", filter: "hue-rotate(-45deg) saturate(2.8) brightness(1.15)", overlay: "fire" },
  devourer: { base: "images/foe-boss.jpg", filter: "hue-rotate(-35deg) saturate(2.5) contrast(1.4)", overlay: "fire" },
  golem_colossus: { base: "images/foe-boss.jpg", filter: "grayscale(0.9) sepia(0.3) contrast(1.4) brightness(0.9)" },
  mimic_elder: { base: "images/foe-husk.jpg", filter: "contrast(1.45) sepia(0.6) brightness(0.85)" },
  spider_queen: { base: "images/foe-vermin.jpg", filter: "hue-rotate(120deg) saturate(2.4) contrast(1.35)", overlay: "venom" },
  bone_warlord: { base: "images/foe-bone.jpg", filter: "contrast(1.4) brightness(1.1) sepia(0.2)" },
  sphinx: { base: "images/foe-boss.jpg", filter: "sepia(0.7) saturate(1.8) brightness(1.1) contrast(1.2)", overlay: "holy" },

  // --- БОССЫ ---
  boss_warden: { base: "images/foe-boss.jpg", filter: "contrast(1.2) brightness(1.0)" },
  boss_prelate: { base: "images/foe-boss.jpg", filter: "contrast(1.35) hue-rotate(240deg) saturate(1.5)", overlay: "shadow" },
  boss_inquisitor: { base: "images/foe-boss.jpg", filter: "contrast(1.3) hue-rotate(-30deg) saturate(2)", overlay: "fire" },
  boss_queen: { base: "images/foe-vermin.jpg", filter: "hue-rotate(115deg) saturate(2.5) contrast(1.4)", overlay: "venom" },
  boss_lich: { base: "images/foe-bone.jpg", filter: "hue-rotate(250deg) saturate(2.2) contrast(1.4)", overlay: "shadow" },
  boss_warlord: { base: "images/foe-bone.jpg", filter: "contrast(1.45) brightness(1.15) sepia(0.3)" },
  boss_devourer: { base: "images/foe-boss.jpg", filter: "hue-rotate(-40deg) saturate(3) contrast(1.5)", overlay: "fire" },
  boss_sphinx: { base: "images/foe-boss.jpg", filter: "sepia(0.85) saturate(2.2) brightness(1.15) contrast(1.25)", overlay: "holy" },

  // --- БАЗОВЫЕ МОНСТРЫ ---
  vermin: { base: "images/foe-vermin.jpg", filter: "none" },
  husk: { base: "images/foe-husk.jpg", filter: "none" },
  bone: { base: "images/foe-bone.jpg", filter: "none" },
  wraith: { base: "images/foe-wraith.jpg", filter: "none" },
  brute: { base: "images/foe-brute.jpg", filter: "none" },
  seer: { base: "images/foe-wraith.jpg", filter: "hue-rotate(200deg) saturate(1.5)" },
  golem: { base: "images/foe-brute.jpg", filter: "grayscale(0.7) sepia(0.3) contrast(1.3)" },
  imp: { base: "images/foe-wraith.jpg", filter: "hue-rotate(-40deg) saturate(2.5)", overlay: "fire" },
};

/**
 * Живописный портрет существа:
 * Отображает настоящую картину маслом на холсте с индивидуальным освещением
 * и атмосферным ореолом.
 */
export function FoePortrait({
  id,
  art,
  name,
  className = "",
  style,
}: {
  /** Игровой id существа: именно по нему ищется индивидуальная иллюстрация. */
  id?: string;
  art: string;
  name?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const cleanId = art.replace(/^foe:/, "").replace(/^images\//, "").replace(/\.jpg$/, "");
  const styleKey = id ?? cleanId;
  const conf = CREATURE_STYLES[styleKey] ?? {
    base: art.startsWith("images/") ? art : "images/foe-vermin.jpg",
    filter: "none",
  };
  const individual = id ? foeArtSrc(id) : null;
  const base = individual ?? conf.base;
  const filter = individual ? "none" : conf.filter;
  const overlay = individual ? undefined : conf.overlay;

  const overlayBg: Record<string, string> = {
    venom: "radial-gradient(circle at 45% 40%, rgba(34,197,94,0.18) 0%, transparent 65%)",
    frost: "radial-gradient(circle at 50% 35%, rgba(56,189,248,0.22) 0%, transparent 65%)",
    fire: "radial-gradient(circle at 50% 45%, rgba(239,68,68,0.24) 0%, transparent 65%)",
    blood: "radial-gradient(circle at 40% 40%, rgba(185,28,28,0.24) 0%, transparent 65%)",
    holy: "radial-gradient(circle at 50% 30%, rgba(245,158,11,0.22) 0%, transparent 65%)",
    shadow: "radial-gradient(circle at 50% 40%, rgba(147,51,234,0.22) 0%, transparent 65%)",
  };

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-soot ${className}`}
      style={style}
      role="img"
      aria-label={name ?? id ?? cleanId}
    >
      <img
        src={base}
        alt={name ?? ""}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover object-top transition-transform duration-700 ease-out hover:scale-105"
        style={{ filter }}
        onError={(ev) => {
          const img = ev.currentTarget;
          if (individual && !img.dataset.fallback) {
            img.dataset.fallback = "1";
            img.src = conf.base;
          } else {
            img.style.display = "none";
          }
        }}
      />
      {overlay && (
        <div
          className="pointer-events-none absolute inset-0 mix-blend-screen"
          style={{ backgroundImage: overlayBg[overlay] }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-soot via-soot/25 to-transparent" />
      <div className="vignette pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 opacity-25 mix-blend-overlay grain" />
    </div>
  );
}
