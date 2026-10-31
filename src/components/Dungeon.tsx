import { useMemo, useState } from "react";
import { Footprints, Hammer, Info, X } from "lucide-react";
import { GEAR_BASES, ITEMS, canWear, consumableIntReq, consumablePower, gearStatReqLabel, slotsForItem, wearRequirementNote } from "../game/content";
import { TORCH, computeVisibility, openDirs } from "../game/maze";
import { BIOMES, BIOME_MAP_COLORS, biomeHealingAmount, biomeVision, mazeBiome } from "../game/biomes";
import { BiomeRule, BiomeTag, biomeStyle } from "./BiomeLabel";
import type { GearItem, Player, Run, Slot } from "../game/types";
import { SLOT_META, SLOT_ORDER } from "../game/types";
import { ItemArt } from "./ItemArt";
import { GearNote } from "./GearNote";
import { Btn, Meter } from "./ui";

const CS = 34;

export function Dungeon({
  run,
  player,
  bag,
  hp,
  maxHp,
  intStat,
  intDiscount,
  path,
  pathPaused,
  onMove,
  onCellClick,
  onUseItem,
  onEquip,
  onUnequip,
  onCancelPath,
  onResumePath,
}: {
  run: Run;
  player: Player;
  bag: Record<string, number>;
  hp: number;
  maxHp: number;
  intStat: number;
  intDiscount: number;
  path: { x: number; y: number }[];
  pathPaused: boolean;
  onMove: (dx: number, dy: number) => void;
  onCellClick: (x: number, y: number) => void;
  onUseItem: (id: string) => void;
  onEquip: (uid: string, slot: Slot) => void;
  onUnequip: (slot: Slot) => void;
  onCancelPath: () => void;
  onResumePath: () => void;
}) {
  const m = run.maze;
  const biome = mazeBiome(m);
  const colors = BIOME_MAP_COLORS[biome];
  const radius = biomeVision(biome, TORCH);
  const S = m.size;
  const W = S * CS;
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [detailUid, setDetailUid] = useState<string | null>(null);

  /* 0 — темнота, 1 — луч факела, 2 — уже пройденные клетки */
  const vis = useMemo(() => computeVisibility(m, run.pos, run.seen), [m, run.pos, run.seen]);
  const visAt = (x: number, y: number) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : vis[y][x]);

  const wallPath = useMemo(() => {
    const parts: string[] = [];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (!vis[y][x]) continue;
        const px = x * CS;
        const py = y * CS;
        if (m.h[y][x]) parts.push(`M${px} ${py}h${CS}`);
        if (m.v[y][x]) parts.push(`M${px} ${py}v${CS}`);
        if ((m.h[y + 1]?.[x] ?? true) && !visAt(x, y + 1)) parts.push(`M${px} ${py + CS}h${CS}`);
        if ((m.v[y][x + 1] ?? true) && !visAt(x + 1, y)) parts.push(`M${px + CS} ${py}v${CS}`);
      }
    }
    return parts.join(" ");
  }, [vis, m, S]);

  const neighbourCells = openDirs(m, run.pos.x, run.pos.y).map(([dx, dy]) => [run.pos.x + dx, run.pos.y + dy]);
  const isNextTo = (x: number, y: number) => neighbourCells.some(([nx, ny]) => nx === x && ny === y);

  const seenTrail: string[] = [];
  const dark: { x: number; y: number; o: number }[] = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (run.seen[`${x},${y}`] && vis[y][x] === 2) {
        seenTrail.push(`M${x * CS + CS / 2 - 1.5} ${y * CS + CS / 2 - 1.5}h3`);
        dark.push({ x, y, o: 0.28 });
      } else if (!vis[y][x]) {
        dark.push({ x, y, o: 1 });
      } else if (vis[y][x] === 1) {
        const dist = Math.max(Math.abs(x - run.pos.x), Math.abs(y - run.pos.y));
        if (dist === radius) dark.push({ x, y, o: 0.35 });
      }
    }
  }

  const px = run.pos.x * CS + CS / 2;
  const py = run.pos.y * CS + CS / 2;
  const center = (i: number) => ({ cx: (i % S) * CS + CS / 2, cy: Math.floor(i / S) * CS + CS / 2 });

  /* Маршрут, выбранный мышью: рисуем от руки рваный штрих */
  const routeD = useMemo(() => {
    if (path.length === 0) return "";
    const pts: [number, number][] = [[px, py]];
    path.forEach((c) => pts.push([c.x * CS + CS / 2, c.y * CS + CS / 2]));
    return pts.map(([x, y], i) => (i === 0 ? `M${x} ${y}` : `L${x} ${y}`)).join(" ");
  }, [path, px, py]);

  const fieldConsumables = Object.entries(bag).filter(([id]) => {
    const t = ITEMS[id]?.use?.type;
    return t === "heal" || t === "cleanse";
  });

  const equippedUid = openSlot ? player.equip[openSlot] : null;
  const candidates: GearItem[] = openSlot
    ? player.armory.filter((g) => slotsForItem(g).includes(openSlot))
    : [];
  const detailItem = player.armory.find((item) => item.uid === detailUid);
  const inspectGear = (uid: string) => {
    onCancelPath();
    setDetailUid(uid);
  };

  return (
    <div className="biome-surface flex min-h-screen flex-col bg-soot" data-biome={biome} style={biomeStyle(biome)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line bg-black/40 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg uppercase tracking-[0.2em] text-flamehi">
            Этаж <span className="font-mono tab">{run.floor}</span>
          </h2>
          <BiomeTag biome={biome} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[0.86rem] text-mute">
          <span className="tab">шагов: <span className="text-parch">{run.steps}</span></span>
          <span className="tab">добыча: <span className="text-flame">{run.gold}</span></span>
          <span className="tab text-verd">ключи: {run.keys}</span>
          <span className="flex items-center gap-2">
            <span className="sc text-rubric">здоровье</span>
            <span className="inline-block w-20 sm:w-32">
              <Meter value={hp} max={maxHp} tone="rubric" />
            </span>
            <span className="tab text-parch">{hp}/{maxHp}</span>
          </span>
        </div>
      </header>
      {biome !== "classic" && (
        <div className="border-b border-line bg-black/30 px-4 py-2 sm:px-6">
          <BiomeRule biome={biome} />
        </div>
      )}

      <div className="flex flex-1 flex-col items-center gap-6 px-4 py-6 sm:px-6 min-[1400px]:flex-row min-[1400px]:items-start min-[1400px]:justify-center">
        {/* КАРТА-ЧЕРТЁЖ */}
        <div className="relative w-full min-w-0 max-w-[600px]">
          <div className="grain relative border border-line bg-ink p-2 shadow-[0_30px_80px_-40px_#000]">
            <svg viewBox={`-6 -6 ${W + 12} ${W + 12}`} className="block w-full" role="img" aria-label={`План подземелья: ${BIOMES[biome].name}`}>
              <defs>
                <radialGradient id="torch">
                  <stop offset="0%" stopColor={colors.accentHi} stopOpacity="0.65" />
                  <stop offset="50%" stopColor={colors.accent} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
                </radialGradient>
                <pattern id="grid" width={CS} height={CS} patternUnits="userSpaceOnUse">
                  <path d={`M${CS} 0V${CS}H0`} fill="none" stroke={colors.grid} strokeOpacity="0.18" strokeWidth="0.7" />
                </pattern>
                <pattern id="fogHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="8" height="8" fill={colors.fog} />
                  <path d="M0 0V8" stroke={colors.fogLine} strokeWidth="2.8" />
                </pattern>
                <pattern id="roomHall" width="12" height="12" patternUnits="userSpaceOnUse">
                  <rect width="12" height="12" fill={colors.room} />
                  <path d="M12 0V12H0" fill="none" stroke={colors.roomLine} strokeWidth="1" />
                </pattern>
                <pattern id="roomThrone" width="14" height="14" patternUnits="userSpaceOnUse">
                  <rect width="14" height="14" fill="#661912" />
                  <path d="M0 0L14 14M14 0L0 14" stroke="#8a2a22" strokeWidth="1.2" />
                  <circle cx="7" cy="7" r="2" fill="#e0a33c" />
                </pattern>
                <pattern id="roomCrypt" width="12" height="12" patternUnits="userSpaceOnUse">
                  <rect width="12" height="12" fill="#262329" />
                  <path d="M0 6h12M6 0v12" stroke="#3d3744" strokeWidth="1" />
                </pattern>
                <pattern id="roomSanctuary" width="16" height="16" patternUnits="userSpaceOnUse">
                  <rect width="16" height="16" fill="#1b2026" />
                  <circle cx="8" cy="8" r="5" fill="none" stroke="#5f8f7a" strokeWidth="1.2" />
                </pattern>
                <pattern id="roomArmory" width="10" height="10" patternUnits="userSpaceOnUse">
                  <rect width="10" height="10" fill="#524338" />
                  <path d="M0 0L10 10M10 0L0 10" stroke="#736052" strokeWidth="1" />
                </pattern>
                <pattern id="roomTreasury" width="12" height="12" patternUnits="userSpaceOnUse">
                  <rect width="12" height="12" fill="#a8894d" />
                  <circle cx="6" cy="6" r="3" fill="#ffd470" stroke="#7a5c20" strokeWidth="0.8" />
                </pattern>
                {biome !== "classic" && (
                  <pattern id="biomeTexture" width="44" height="44" patternUnits="userSpaceOnUse">
                    {biome === "swamp" && (
                      <>
                        <ellipse cx="12" cy="14" rx="10" ry="5" fill="#496b3a" opacity="0.38" />
                        <ellipse cx="33" cy="34" rx="8" ry="4" fill="#3f6a35" opacity="0.32" />
                        <path d="M22 40v-9m0 4l-4-5m4 2l4-6M6 30v-7m0 3l-3-4" stroke="#2f4f2a" strokeWidth="1.3" fill="none" opacity="0.55" />
                      </>
                    )}
                    {biome === "ice" && (
                      <>
                        <path d="M11 4v14M4 11h14M6 6l10 10M16 6L6 16" stroke="#ffffff" strokeWidth="1.1" opacity="0.85" />
                        <path d="M33 27v12M27 33h12M29 29l8 8M37 29l-8 8" stroke="#bfe3f2" strokeWidth="1" opacity="0.8" />
                        <circle cx="30" cy="9" r="1.6" fill="#ffffff" opacity="0.9" />
                        <circle cx="8" cy="34" r="1.3" fill="#ffffff" opacity="0.8" />
                      </>
                    )}
                    {biome === "dark" && (
                      <>
                        <path d="M0 44L44 0M-11 11L11 -11M33 55L55 33" stroke="#6a6e72" strokeWidth="1" opacity="0.28" />
                        <circle cx="12" cy="12" r="1" fill="#4a4e52" opacity="0.35" />
                        <circle cx="32" cy="28" r="1.4" fill="#4a4e52" opacity="0.3" />
                      </>
                    )}
                    {biome === "fire" && (
                      <>
                        <path d="M4 40L14 26L10 18L22 8M28 44L32 30L42 22M18 34L26 30" stroke="#ff6a2a" strokeWidth="1.6" fill="none" opacity="0.6" />
                        <circle cx="34" cy="10" r="2" fill="#ffb347" opacity="0.75" />
                        <circle cx="8" cy="8" r="1.4" fill="#ff8a3d" opacity="0.7" />
                      </>
                    )}
                  </pattern>
                )}
              </defs>

              <rect x={0} y={0} width={W} height={W} fill={colors.paper} />
              {biome === "classic" && (
                <image
                  href="images/parchment.jpg"
                  x={0}
                  y={0}
                  width={W}
                  height={W}
                  preserveAspectRatio="xMidYMid slice"
                  opacity="0.34"
                  style={{ mixBlendMode: "multiply" }}
                />
              )}
              <rect x={0} y={0} width={W} height={W} fill={colors.wash} opacity={biome === "classic" ? 0.22 : 0.18} style={{ mixBlendMode: "screen" }} />
              {biome !== "classic" && <rect x={0} y={0} width={W} height={W} fill="url(#biomeTexture)" opacity="0.55" />}
              <rect x={0} y={0} width={W} height={W} fill="url(#grid)" />

              {/* Комнаты разных типов с индивидуальным настилом и бордюром */}
              {m.rooms.map((room, ri) => {
                let anyVisible = false;
                for (let y = room.y; y < room.y + room.h && !anyVisible; y++)
                  for (let x = room.x; x < room.x + room.w; x++)
                    if (visAt(x, y) > 0) { anyVisible = true; break; }
                if (!anyVisible) return null;
                const rx = room.x * CS;
                const ry = room.y * CS;
                const rw = room.w * CS;
                const rh = room.h * CS;
                const patternId = biome !== "classic" ? "roomHall" :
                  room.kind === "throne"
                    ? "roomThrone"
                    : room.kind === "crypt"
                    ? "roomCrypt"
                    : room.kind === "sanctuary"
                    ? "roomSanctuary"
                    : room.kind === "armory"
                    ? "roomArmory"
                    : room.kind === "treasury"
                    ? "roomTreasury"
                    : "roomHall";
                const labelColor = biome !== "classic" ? colors.roomLabel :
                  room.kind === "throne"
                    ? "#f6d48a"
                    : room.kind === "crypt"
                    ? "#9a8672"
                    : room.kind === "sanctuary"
                    ? "#8fc4ae"
                    : "#6b4f2a";

                return (
                  <g key={`room${ri}`}>
                    <rect x={rx + 2} y={ry + 2} width={rw - 4} height={rh - 4} fill={`url(#${patternId})`} opacity="0.92" />
                    <rect
                      x={rx + 2} y={ry + 2} width={rw - 4} height={rh - 4}
                      fill="none" stroke={colors.accent} strokeOpacity="0.5" strokeWidth="1.4" strokeDasharray="5 4"
                    />
                    <text
                      x={rx + 6} y={ry + 12} fill={labelColor} fontSize="9"
                      fontFamily="Forum, Georgia, serif" letterSpacing="1.8" opacity="0.95"
                    >
                      {room.name.toUpperCase()}
                    </text>
                    {room.pillars.map(([pxc, pyc], pi) => (
                      <g key={`pil${ri}-${pi}`} transform={`translate(${pxc * CS + CS / 2} ${pyc * CS + CS / 2})`}>
                        <rect x={-9} y={-9} width={18} height={18} fill={colors.wallShadow} stroke={colors.wallShadow} strokeWidth="2" />
                        <path d="M-9 -9h18M-9 -9v18" stroke={colors.wallEdge} strokeWidth="1.6" fill="none" />
                      </g>
                    ))}
                  </g>
                );
              })}

              <path d={seenTrail.join(" ")} stroke={colors.trail} strokeOpacity="0.65" strokeWidth="2.4" fill="none" />

              {/* сундуки */}
              {m.chests.map((i) => {
                const { cx, cy } = center(i);
                const open = m.openedChests.includes(i);
                if (!visAt(i % S, Math.floor(i / S))) return null;
                if (m.doors.includes(i) && !m.openedDoors.includes(i)) return null;
                return (
                  <g key={`c${i}`} transform={`translate(${cx} ${cy})`} opacity={open ? 0.4 : 1}>
                    <rect x={-11} y={-4} width={22} height={13} fill={open ? "#6b5b45" : "#c98b2e"} stroke={colors.wallShadow} strokeWidth="2" />
                    <path d="M-11 -4a11 8 0 0 1 22 0" fill={open ? "#6b5b45" : "#e0a33c"} stroke={colors.wallShadow} strokeWidth="2" />
                    <rect x={-2} y={0} width={4} height={5} fill={colors.wallShadow} />
                  </g>
                );
              })}

              {/* двери */}
              {m.doors.map((i) => {
                const { cx, cy } = center(i);
                if (!visAt(i % S, Math.floor(i / S))) return null;
                const opened = m.openedDoors.includes(i);
                return (
                  <g key={`d${i}`} transform={`translate(${cx} ${cy})`}>
                    <path
                      d="M-9 12V-2a9 9 0 0 1 18 0v14z"
                      fill={opened ? "none" : colors.trail}
                      stroke={colors.wallShadow}
                      strokeWidth="2.2"
                      strokeDasharray={opened ? "3 3" : undefined}
                    />
                    {!opened && (
                      <>
                        <circle cx={0} cy={2} r={2.6} fill="#5f8f7a" />
                        <path d="M0 4v5" stroke="#5f8f7a" strokeWidth="2" />
                      </>
                    )}
                  </g>
                );
              })}

              {/* ключи */}
              {m.keys
                .filter((i) => !m.takenKeys.includes(i) && visAt(i % S, Math.floor(i / S)))
                .map((i) => {
                  const { cx, cy } = center(i);
                  return (
                    <g key={`k${i}`} transform={`translate(${cx} ${cy})`}>
                      <circle cx={-5} cy={0} r={4.5} fill="none" stroke={colors.trail} strokeWidth="2.6" />
                      <path d="M-1 0h11M7 0v4M10 0v3" stroke={colors.trail} strokeWidth="2.6" strokeLinecap="round" />
                    </g>
                  );
                })}

              {/* события карты: руна-значок, виден до подхода */}
              {m.events
                .filter((i) => !m.usedEvents.includes(i) && visAt(i % S, Math.floor(i / S)) > 0)
                .map((i) => {
                  const { cx, cy } = center(i);
                  return (
                    <g key={`e${i}`} transform={`translate(${cx} ${cy}) rotate(45)`} className="breathe">
                      <rect x={-9} y={-9} width={18} height={18} fill={colors.wash} stroke={colors.accent} strokeWidth="2.4" />
                      <path d="M-4 0h8M0 -4v8" stroke="#a52a2a" strokeWidth="2.4" strokeLinecap="round" />
                    </g>
                  );
                })}

              {/* Босс перед лестницей */}
              {visAt(m.boss.x, m.boss.y) > 0 && (
                <g transform={`translate(${m.boss.x * CS + CS / 2} ${m.boss.y * CS + CS / 2})`} opacity={m.bossDefeated ? 0.35 : 1}>
                  <circle r={11} fill={m.bossDefeated ? "#5a4a3a" : "#8f1d14"} stroke={colors.wallShadow} strokeWidth="2" />
                  <path d="M-6 -3L-3 -8L0 -4L3 -8L6 -3L5 5L-5 5Z" fill="#f6d48a" stroke={colors.wallShadow} strokeWidth="1.4" />
                  {!m.bossDefeated && (
                    <>
                      <circle cx={-2.5} cy={1} r={1.3} fill="#8f1d14" />
                      <circle cx={2.5} cy={1} r={1.3} fill="#8f1d14" />
                    </>
                  )}
                </g>
              )}

              {/* Лестница */}
              {visAt(m.stairs.x, m.stairs.y) > 0 && (
                <g transform={`translate(${m.stairs.x * CS + 7} ${m.stairs.y * CS + 8})`}>
                  <path d="M0 0h18M3 5h15M6 10h12M9 15h9" stroke={colors.wallShadow} strokeWidth="2.6" strokeLinecap="round" />
                  <path d="M25 3l5 5-5 5" fill="none" stroke="#a52a2a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )}

              {/* тьма */}
              {dark.map((c) => (
                <rect key={`z${c.x}-${c.y}`} x={c.x * CS} y={c.y * CS} width={CS} height={CS} fill="url(#fogHatch)" opacity={c.o} />
              ))}

              {/* Стены лабиринта: поверх тумана, трёхслойная тёплая кладка с золотой факельной кромкой */}
              <path d={wallPath} stroke={colors.wallShadow} strokeWidth="7" strokeLinecap="square" fill="none" opacity="0.95" />
              <path d={wallPath} stroke={colors.wall} strokeWidth="4.5" strokeLinecap="square" fill="none" />
              <path d={wallPath} stroke={colors.wallEdge} strokeWidth="1.8" strokeLinecap="square" fill="none" />
              <path d={wallPath} stroke={colors.wallLight} strokeWidth="0.8" strokeLinecap="square" fill="none" opacity="0.9" />

              {/* маршрут, выбранный мышью */}
              {routeD && (
                <g>
                  <path d={routeD} fill="none" stroke={colors.accent} strokeOpacity="0.55" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                  <path
                    d={routeD}
                    fill="none"
                    stroke={colors.accent}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="7 8"
                    className="route-mark"
                  />
                  <g transform={`translate(${path[path.length - 1].x * CS + CS / 2} ${path[path.length - 1].y * CS + CS / 2})`}>
                    <circle r={7} fill="none" stroke="#a52a2a" strokeWidth="2.5" />
                  </g>
                </g>
              )}

              {/* клик-зоны */}
              {Array.from({ length: S * S }).map((_, i) => {
                const x = i % S;
                const y = Math.floor(i / S);
                const near = isNextTo(x, y);
                const onRoute = path.some((p) => p.x === x && p.y === y);
                return (
                  <rect
                    key={`h${i}`}
                    x={x * CS}
                    y={y * CS}
                    width={CS}
                    height={CS}
                    fill="transparent"
                    className={`cursor-pointer hover:fill-flame/25 ${near ? "" : ""}`}
                    style={onRoute ? { fill: "rgba(224,163,60,0.14)" } : undefined}
                    onClick={() => onCellClick(x, y)}
                  />
                );
              })}

              {/* персонаж */}
              <g style={{ transform: `translate(${px}px, ${py}px)`, transition: "transform 280ms cubic-bezier(.2,.8,.2,1)" }} className="flicker">
                <circle r={CS * 1.4} fill="url(#torch)" />
                <circle r={9} fill={colors.accentHi} stroke={colors.wallShadow} strokeWidth="2.5" />
                <path d="M0 -4.5L4.5 0L0 4.5L-4.5 0Z" fill={colors.wallShadow} />
              </g>
            </svg>
            <div className="vignette pointer-events-none absolute inset-2" />
          </div>

          {path.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-flamedim/70 bg-black/45 px-3 py-2 font-mono text-[0.88rem]">
              <span className="flex items-center gap-2 text-flamehi">
                <Footprints size={14} aria-hidden />
                {pathPaused ? "маршрут приостановлен" : "маршрут"}: {path.length} {path.length === 1 ? "шаг" : path.length < 5 ? "шага" : "шагов"}
                <span className="text-mute">{pathPaused ? "— можно продолжить или отменить" : "— шаги пойдут по очереди"}</span>
              </span>
              <span className="flex items-center gap-3">
                {pathPaused && (
                  <button onClick={onResumePath} className="text-verd transition-colors hover:text-flamehi">
                    продолжить
                  </button>
                )}
                <button onClick={onCancelPath} className="flex items-center gap-1 text-mute transition-colors hover:text-rubric">
                  <X size={13} aria-hidden /> отменить
                </button>
              </span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 font-mono text-[0.82rem] text-mute">
            <span className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 bg-[#c98b2e]" />сундук</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: colors.trail }} />дверь</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: colors.trail }} />ключ</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rotate-45 border" style={{ borderColor: colors.accent }} />
                событие
              </span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#8f1d14]" />босс</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 bg-[#a52a2a]" />лестница</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 border border-dashed" style={{ borderColor: colors.roomLine, backgroundColor: colors.room }} />
                комната
              </span>
            </span>
            <span>наведи на клетку — пойдём сами</span>
          </div>
        </div>

        {/* СНАРЯЖЕНИЕ + УПРАВЛЕНИЕ + ЖУРНАЛ */}
        <div className="flex w-full max-w-[600px] flex-col gap-4">
          {/* Экипировка: смена прямо в походе */}
          <section className="border border-line bg-slab/70">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="sc">Снаряжение · смена в походе</span>
              <span className="font-mono text-[0.88rem] text-mute">Подробности — по кнопке ⓘ</span>
            </div>
            <div className="grid grid-cols-1 gap-px bg-line/60 sm:grid-cols-2">
              {SLOT_ORDER.map((slot) => {
                const item = player.armory.find((g) => g.uid === player.equip[slot]);
                const open = openSlot === slot;
                return (
                  <div key={slot} className={`flex min-w-0 items-center bg-slab ${open ? "ring-1 ring-inset ring-flame" : ""}`}>
                    <button
                      onClick={() => setOpenSlot(open ? null : slot)}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2.5 text-left transition-colors hover:bg-flame/10"
                    >
                      {item ? (
                        <ItemArt id={item.baseId} name={stName(item)} size={32} rarity={item.identified ? item.rarity : undefined} />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-dashed border-line text-mute"><Hammer size={14} aria-hidden /></span>
                      )}
                      <span className="min-w-0">
                        <span className="block font-mono text-[0.84rem] uppercase text-flamedim">{SLOT_META[slot].short}</span>
                        <span className="block truncate font-display text-[1rem] uppercase tracking-[0.03em] text-parch" title={item ? stName(item) : "Пусто"}>{item ? stName(item) : "Пусто"}</span>
                      </span>
                    </button>
                    {item && (
                      <button
                        onClick={() => inspectGear(item.uid)}
                        className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center text-mute transition-colors hover:text-flamehi"
                        aria-label={`Подробнее: ${stName(item)}`}
                        title="Подробнее о предмете"
                      ><Info size={16} aria-hidden /></button>
                    )}
                  </div>
                );
              })}
            </div>

            {openSlot && (
              <div className="border-t border-line bg-black/35 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="sc">{SLOT_META[openSlot].name} · {candidates.length} подходит</span>
                  <button onClick={() => setOpenSlot(null)} className="sc hover:text-rubric">
                    закрыть
                  </button>
                </div>
                <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
                  {equippedUid && (
                    <button
                      onClick={() => onUnequip(openSlot)}
                      className="border border-rubric/60 bg-rubric/10 px-3 py-2 text-left transition-colors hover:bg-rubric/20"
                    >
                      <span className="block font-display text-[1rem] uppercase tracking-[0.06em] text-rubric">Снять предмет</span>
                      <span className="block text-[0.92rem] text-mute">Ячейка останется пустой</span>
                    </button>
                  )}
                  {candidates.filter((g) => g.uid !== equippedUid).map((g) => {
                    const wearable = canWear(g, player);
                    return (
                      <div key={g.uid} className="flex min-w-0 items-center gap-2 border border-line bg-slab2 pr-1">
                        <button
                          onClick={() => onEquip(g.uid, openSlot!)}
                          disabled={!wearable}
                          title={wearable ? `Надеть: ${SLOT_META[openSlot!].name}` : wearRequirementNote(g, player)}
                          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left transition-colors enabled:hover:bg-flame/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ItemArt id={g.baseId} name={stName(g)} size={36} rarity={g.identified ? g.rarity : undefined} />
                          <span className="min-w-0">
                            <span className="block truncate font-display text-[1rem] uppercase tracking-[0.04em] text-flamehi">{stName(g)}</span>
                            <span className="block font-mono text-[0.86rem] leading-snug text-mute">
                              ур. {g.level ?? 1} · {gearStatReqLabel(g)} · {g.identified ? "исследовано" : "редкость ???"}
                              {GEAR_BASES[g.baseId]?.hands === 2 ? " · обе руки" : ""}
                            </span>
                          </span>
                        </button>
                        <button onClick={() => inspectGear(g.uid)} className="flex h-9 w-9 shrink-0 items-center justify-center text-mute hover:text-flamehi" aria-label={`Подробнее: ${stName(g)}`} title="Подробнее о предмете">
                          <Info size={16} aria-hidden />
                        </button>
                      </div>
                    );
                  })}
                  {candidates.length <= (equippedUid ? 1 : 0) && (
                    <p className="text-[0.96rem] italic text-mute">Подходящих вещей нет — загляни в магазин.</p>
                  )}
                </div>
              </div>
            )}
          </section>

          <div className="flex items-start gap-5">
            <div className="grid shrink-0 grid-cols-3 gap-1.5">
              {(
                [
                  ["", 0, 0], ["▲", 0, -1], ["", 0, 0],
                  ["◀", -1, 0], ["◈", 0, 0], ["▶", 1, 0],
                  ["", 0, 0], ["▼", 0, 1], ["", 0, 0],
                ] as [string, number, number][]
              ).map(([label, dx, dy], i) =>
                label === "" ? (
                  <span key={i} className="h-11 w-11" />
                ) : label === "◈" ? (
                  <span key={i} className="flex h-11 w-11 items-center justify-center border border-line bg-black/40 font-mono text-[0.81rem] text-flamedim" title="Ты здесь">·</span>
                ) : (
                  <button
                    key={i}
                    onClick={() => onMove(dx, dy)}
                    className="h-11 w-11 border border-line bg-slab2 font-mono text-parch transition-colors hover:border-flame hover:bg-flame/15 hover:text-flamehi active:translate-y-px"
                    aria-label={`Шаг ${label}`}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
            <div className="flex-1">
              <div className="sc mb-1.5">Журнал этажа</div>
              <div className="max-h-40 space-y-1 overflow-y-auto border border-line bg-black/40 px-3 py-2 text-[0.96rem] leading-snug">
                {run.log.length === 0 && <span className="italic text-mute">Тишина.</span>}
                {run.log.slice(-40).reverse().map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.includes("урон") || l.includes("ловуш") || l.includes("Ловуш") || l.includes("СТРАЖ") || l.includes("Событие")
                        ? "text-rubric"
                        : l.includes("Сундук") || l.includes("ключ") || l.includes("Победа") || l.includes("удача")
                          ? "text-flame"
                          : "text-parch/80"
                    }
                  >
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border border-line bg-slab/70 px-4 py-3 text-[0.96rem] leading-snug text-mute">
            <span className="sc mb-1 block">Разведка и опасности</span>
            <p className="font-mono text-[0.88rem] text-parch/80">
              Новый путь: <span className="text-flame">60%</span> тихо · <span className="text-rubric">10%</span> ловушка ·{" "}
              <span className="text-rubric">20%</span> бой · <span className="text-verd">10%</span> находка
            </p>
            <p className="mt-1 font-mono text-[0.88rem] text-parch/80">
              Известный путь: <span className="text-flame">90%</span> ничего · <span className="text-rubric">10%</span> бой
            </p>
            <p className="mt-1.5">
              Кликни любую клетку — маршрут прочертится на чертеже и пойдёт сам. После боя или ловушки его можно
              продолжить. Свет не проходит сквозь стены и углы, а перед лестницей стоит <b className="text-rubric">Босс этажа</b>.
            </p>
          </div>

          <div className="border border-line bg-slab/70 px-4 py-3">
            <div className="sc mb-2">Перевязка в коридоре</div>
            <div className="flex flex-wrap gap-2">
              {fieldConsumables.map(([id, n]) => {
                const def = ITEMS[id];
                const req = consumableIntReq(def, intDiscount);
                const intOk = intStat >= req;
                return (
                  <button
                    key={id}
                    disabled={!intOk}
                    onClick={() => onUseItem(id)}
                    title={def.desc}
                    className="flex items-center gap-2 border border-verd/60 bg-slab2 px-3 py-2 text-left transition-colors enabled:hover:border-verd enabled:hover:bg-verd/15 disabled:opacity-45"
                  >
                    <ItemArt id={id} name={def.name} size={36} framed={false} />
                    <span>
                      <span className="block font-display text-[0.94rem] uppercase tracking-[0.1em] text-verd">
                        {def.name} <span className="font-mono text-[0.84rem]">×{n}</span>
                      </span>
                      <span className="block font-mono text-[0.82rem] text-mute">
                        {!intOk
                          ? `нужен ИНТ ${req}`
                          : def.use?.type === "heal"
                            ? `+${biomeHealingAmount(biome, consumablePower(def, player.stats), def.kind === "potion")} здоровья`
                            : `снять раны, проклятие и яд (+${biomeHealingAmount(biome, def.use?.power ?? 8, def.kind === "potion")} ОЗ)`}
                      </span>
                    </span>
                  </button>
                );
              })}
              {fieldConsumables.length === 0 && (
                <span className="text-sm italic text-mute">Целебных зелий и свитков исцеления не осталось.</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => onMove(0, -1)}>Север</Btn>
            <Btn onClick={() => onMove(1, 0)}>Восток</Btn>
            <Btn onClick={() => onMove(0, 1)}>Юг</Btn>
            <Btn onClick={() => onMove(-1, 0)}>Запад</Btn>
          </div>
        </div>
      </div>

      {detailItem && <GearNote item={detailItem} player={player} onClose={() => setDetailUid(null)} />}
    </div>
  );
}

/** Быстрый доступ к названию предмета без повторного поиска в словаре. */
const GEAR_NAME_CACHE: Record<string, string> = Object.fromEntries(
  Object.values(GEAR_BASES).map((b) => [b.id, b.name]),
);

function stName(item: GearItem) {
  return GEAR_NAME_CACHE[item.baseId] ?? item.baseId;
}
