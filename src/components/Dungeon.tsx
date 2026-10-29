import { useMemo, useState } from "react";
import { Footprints, Hammer, X } from "lucide-react";
import { GEAR_BASES, ITEMS, slotsForItem } from "../game/content";
import { TORCH, computeVisibility, openDirs } from "../game/maze";
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
  onMove,
  onCellClick,
  onUseItem,
  onEquip,
  onUnequip,
  onCancelPath,
}: {
  run: Run;
  player: Player;
  bag: Record<string, number>;
  hp: number;
  maxHp: number;
  intStat: number;
  intDiscount: number;
  path: { x: number; y: number }[];
  onMove: (dx: number, dy: number) => void;
  onCellClick: (x: number, y: number) => void;
  onUseItem: (id: string) => void;
  onEquip: (uid: string, slot: Slot) => void;
  onUnequip: (slot: Slot) => void;
  onCancelPath: () => void;
}) {
  const m = run.maze;
  const S = m.size;
  const W = S * CS;
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [hover, setHover] = useState<GearItem | null>(null);

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
        if (dist === TORCH) dark.push({ x, y, o: 0.35 });
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line bg-black/40 px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-4">
          <h2 className="font-display text-lg uppercase tracking-[0.2em] text-flamehi">
            Этаж <span className="font-mono tab">{run.floor}</span>
          </h2>
          <span className="sc">
            Лабиринт {S}×{S} · комнат {m.rooms.length} · сундуков {m.chests.length} · событий {m.events.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[0.72rem] text-mute">
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

      <div className="flex flex-1 flex-col items-center gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:items-start lg:justify-center">
        {/* КАРТА-ЧЕРТЁЖ */}
        <div className="relative w-full max-w-[600px] shrink-0">
          <div className="grain relative border border-line bg-ink p-2 shadow-[0_30px_80px_-40px_#000]">
            <svg viewBox={`-6 -6 ${W + 12} ${W + 12}`} className="block w-full" role="img" aria-label="План подземелья">
              <defs>
                <radialGradient id="torch">
                  <stop offset="0%" stopColor="#f6d48a" stopOpacity="0.65" />
                  <stop offset="50%" stopColor="#e0a33c" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#e0a33c" stopOpacity="0" />
                </radialGradient>
                <pattern id="grid" width={CS} height={CS} patternUnits="userSpaceOnUse">
                  <path d={`M${CS} 0V${CS}H0`} fill="none" stroke="#8f7f5e" strokeOpacity="0.18" strokeWidth="0.7" />
                </pattern>
                <pattern id="fogHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="8" height="8" fill="#070504" />
                  <path d="M0 0V8" stroke="#1c140d" strokeWidth="2.8" />
                </pattern>
                <pattern id="roomHall" width="12" height="12" patternUnits="userSpaceOnUse">
                  <rect width="12" height="12" fill="#cbb894" />
                  <path d="M12 0V12H0" fill="none" stroke="#9e855c" strokeWidth="1" />
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
              </defs>

              <rect x={0} y={0} width={W} height={W} fill="#d9c9a6" />
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
              <rect x={0} y={0} width={W} height={W} fill="#efdfb6" opacity="0.22" style={{ mixBlendMode: "screen" }} />
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
                const patternId =
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
                const labelColor =
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
                      fill="none" stroke="#e0a33c" strokeOpacity="0.5" strokeWidth="1.4" strokeDasharray="5 4"
                    />
                    <text
                      x={rx + 6} y={ry + 12} fill={labelColor} fontSize="7.5"
                      fontFamily="Forum, Georgia, serif" letterSpacing="1.8" opacity="0.95"
                    >
                      {room.name.toUpperCase()}
                    </text>
                    {room.pillars.map(([pxc, pyc], pi) => (
                      <g key={`pil${ri}-${pi}`} transform={`translate(${pxc * CS + CS / 2} ${pyc * CS + CS / 2})`}>
                        <rect x={-9} y={-9} width={18} height={18} fill="#261b12" stroke="#120c08" strokeWidth="2" />
                        <path d="M-9 -9h18M-9 -9v18" stroke="#f5ce75" strokeWidth="1.6" fill="none" />
                      </g>
                    ))}
                  </g>
                );
              })}

              <path d={seenTrail.join(" ")} stroke="#7a5c2a" strokeOpacity="0.65" strokeWidth="2.4" fill="none" />

              {/* сундуки */}
              {m.chests.map((i) => {
                const { cx, cy } = center(i);
                const open = m.openedChests.includes(i);
                if (!visAt(i % S, Math.floor(i / S))) return null;
                if (m.doors.includes(i) && !m.openedDoors.includes(i)) return null;
                return (
                  <g key={`c${i}`} transform={`translate(${cx} ${cy})`} opacity={open ? 0.4 : 1}>
                    <rect x={-11} y={-4} width={22} height={13} fill={open ? "#6b5b45" : "#c98b2e"} stroke="#171310" strokeWidth="2" />
                    <path d="M-11 -4a11 8 0 0 1 22 0" fill={open ? "#6b5b45" : "#e0a33c"} stroke="#171310" strokeWidth="2" />
                    <rect x={-2} y={0} width={4} height={5} fill="#171310" />
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
                      fill={opened ? "none" : "#2f4f43"}
                      stroke="#171310"
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
                      <circle cx={-5} cy={0} r={4.5} fill="none" stroke="#2f4f43" strokeWidth="2.6" />
                      <path d="M-1 0h11M7 0v4M10 0v3" stroke="#2f4f43" strokeWidth="2.6" strokeLinecap="round" />
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
                      <rect x={-9} y={-9} width={18} height={18} fill="#efdfb6" stroke="#8a5f1e" strokeWidth="2.4" />
                      <path d="M-4 0h8M0 -4v8" stroke="#a52a2a" strokeWidth="2.4" strokeLinecap="round" />
                    </g>
                  );
                })}

              {/* Босс перед лестницей */}
              {visAt(m.boss.x, m.boss.y) > 0 && (
                <g transform={`translate(${m.boss.x * CS + CS / 2} ${m.boss.y * CS + CS / 2})`} opacity={m.bossDefeated ? 0.35 : 1}>
                  <circle r={11} fill={m.bossDefeated ? "#5a4a3a" : "#8f1d14"} stroke="#171310" strokeWidth="2" />
                  <path d="M-6 -3L-3 -8L0 -4L3 -8L6 -3L5 5L-5 5Z" fill="#f6d48a" stroke="#171310" strokeWidth="1.4" />
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
                  <path d="M0 0h18M3 5h15M6 10h12M9 15h9" stroke="#171310" strokeWidth="2.6" strokeLinecap="round" />
                  <path d="M25 3l5 5-5 5" fill="none" stroke="#a52a2a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )}

              {/* тьма */}
              {dark.map((c) => (
                <rect key={`z${c.x}-${c.y}`} x={c.x * CS} y={c.y * CS} width={CS} height={CS} fill="url(#fogHatch)" opacity={c.o} />
              ))}

              {/* Стены лабиринта: поверх тумана, трёхслойная тёплая кладка с золотой факельной кромкой */}
              <path d={wallPath} stroke="#120c08" strokeWidth="7" strokeLinecap="square" fill="none" opacity="0.95" />
              <path d={wallPath} stroke="#85592e" strokeWidth="4.5" strokeLinecap="square" fill="none" />
              <path d={wallPath} stroke="#f5ce75" strokeWidth="1.8" strokeLinecap="square" fill="none" />
              <path d={wallPath} stroke="#fff7db" strokeWidth="0.8" strokeLinecap="square" fill="none" opacity="0.9" />

              {/* маршрут, выбранный мышью */}
              {routeD && (
                <g>
                  <path d={routeD} fill="none" stroke="#8a5f1e" strokeOpacity="0.55" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                  <path
                    d={routeD}
                    fill="none"
                    stroke="#e0a33c"
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
                if (!vis[y][x]) return null;
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
                <circle r={9} fill="#f6d48a" stroke="#171310" strokeWidth="2.5" />
                <path d="M0 -4.5L4.5 0L0 4.5L-4.5 0Z" fill="#171310" />
              </g>
            </svg>
            <div className="vignette pointer-events-none absolute inset-2" />
          </div>

          {path.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-flamedim/70 bg-black/45 px-3 py-2 font-mono text-[0.74rem]">
              <span className="flex items-center gap-2 text-flamehi">
                <Footprints size={14} aria-hidden />
                маршрут: {path.length} {path.length === 1 ? "шаг" : path.length < 5 ? "шага" : "шагов"}
                <span className="text-mute">— шаги пойдут по очереди</span>
              </span>
              <button onClick={onCancelPath} className="flex items-center gap-1 text-mute transition-colors hover:text-rubric">
                <X size={13} aria-hidden /> отменить
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 font-mono text-[0.66rem] text-mute">
            <span className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 bg-[#c98b2e]" />сундук</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 bg-[#2f4f43]" />дверь</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#2f4f43]" />ключ</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rotate-45 border border-[#8a5f1e]" />
                событие
              </span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#8f1d14]" />босс</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 bg-[#a52a2a]" />лестница</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 border border-dashed border-[#8a6a3c] bg-[#cbb894]" />
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
              <span className="font-mono text-[0.66rem] text-mute">наведи — полный разбор</span>
            </div>
            <div className="grid grid-cols-3 gap-px bg-line/60">
              {SLOT_ORDER.map((slot) => {
                const item = player.armory.find((g) => g.uid === player.equip[slot]);
                const open = openSlot === slot;
                return (
                  <button
                    key={slot}
                    onClick={() => setOpenSlot(open ? null : slot)}
                    onMouseEnter={() => setHover(item ?? null)}
                    onMouseLeave={() => setHover(null)}
                    className={`flex min-w-0 items-center gap-2 bg-slab px-2 py-2 text-left transition-colors hover:bg-flame/10 ${
                      open ? "ring-1 ring-inset ring-flame" : ""
                    }`}
                  >
                    {item ? (
                      <ItemArt id={item.baseId} name="Предмет" size={30} rarity={item.identified ? item.rarity : undefined} />
                    ) : (
                      <span className="flex h-[30px] w-[30px] items-center justify-center border border-dashed border-line text-mute">
                        <Hammer size={13} aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block font-mono text-[0.6rem] uppercase text-flamedim">{SLOT_META[slot].short}</span>
                      <span className="block truncate font-display text-[0.8rem] uppercase tracking-[0.04em] text-parch">
                        {item ? stName(item) : "—"}
                      </span>
                    </span>
                  </button>
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
                <div className="grid max-h-52 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {equippedUid && (
                    <button
                      onClick={() => { onUnequip(openSlot); setHover(null); }}
                      onMouseEnter={() => setHover(player.armory.find((g) => g.uid === equippedUid) ?? null)}
                      onMouseLeave={() => setHover(null)}
                      className="border border-rubric/60 bg-rubric/10 px-3 py-2 text-left transition-colors hover:bg-rubric/20"
                    >
                      <span className="block font-display text-[0.85rem] uppercase tracking-[0.08em] text-rubric">Снять всё</span>
                      <span className="block text-[0.7rem] text-mute">Ячейка останется пустой</span>
                    </button>
                  )}
                  {candidates
                    .filter((g) => g.uid !== equippedUid)
                    .map((g) => {
                      const done = player.equip[openSlot!] === g.uid;
                      return (
                        <button
                          key={g.uid}
                          onClick={() => { onEquip(g.uid, openSlot!); setHover(null); }}
                          onMouseEnter={() => setHover(g)}
                          onMouseLeave={() => setHover(null)}
                          className="flex items-center gap-2 border border-line bg-slab2 px-3 py-2 text-left transition-colors enabled:hover:border-flame enabled:hover:bg-flame/10 disabled:opacity-50"
                        >
                          <ItemArt id={g.baseId} name={stName(g)} size={32} rarity={g.identified ? g.rarity : undefined} />
                          <span className="min-w-0">
                            <span className="block truncate font-display text-[0.85rem] uppercase tracking-[0.06em] text-flamehi">
                              {stName(g)}
                            </span>
                            <span className="block font-mono text-[0.62rem] text-mute">
                              ур. {g.level ?? 1} · {g.identified ? "исследовано" : "редкость ???"}
                              {GEAR_BASES[g.baseId]?.hands === 2 ? " · обе руки" : ""} {done && "· надето"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  {candidates.length <= (equippedUid ? 1 : 0) && (
                    <p className="text-[0.78rem] italic text-mute">Подходящих вещей нет — загляни в магазин.</p>
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
                  <span key={i} className="flex h-11 w-11 items-center justify-center border border-line bg-black/40 font-mono text-[0.65rem] text-flamedim" title="Ты здесь">·</span>
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
              <div className="max-h-40 space-y-1 overflow-y-auto border border-line bg-black/40 px-3 py-2 text-[0.84rem] leading-snug">
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

          <div className="border border-line bg-slab/70 px-4 py-3 text-[0.84rem] leading-snug text-mute">
            <span className="sc mb-1 block">Разведка и опасности</span>
            <p className="font-mono text-[0.74rem] text-parch/80">
              Новый путь: <span className="text-flame">60%</span> тихо · <span className="text-rubric">10%</span> ловушка ·{" "}
              <span className="text-rubric">20%</span> бой · <span className="text-verd">10%</span> находка
            </p>
            <p className="mt-1 font-mono text-[0.74rem] text-parch/80">
              Известный путь: <span className="text-flame">75%</span> тихо · <span className="text-rubric">5%</span> ловушка ·{" "}
              <span className="text-rubric">20%</span> бой
            </p>
            <p className="mt-1.5">
              Кликни любую видимую клетку — маршрут прочертится на чертеже и пойдёт сам. Свет не проходит сквозь
              стены, а перед лестницей стоит <b className="text-rubric">Босс этажа</b>.
            </p>
          </div>

          <div className="border border-line bg-slab/70 px-4 py-3">
            <div className="sc mb-2">Перевязка в коридоре</div>
            <div className="flex flex-wrap gap-2">
              {fieldConsumables.map(([id, n]) => {
                const def = ITEMS[id];
                const req = Math.max(0, (def.use?.intReq ?? 0) - intDiscount);
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
                      <span className="block font-display text-[0.82rem] uppercase tracking-[0.1em] text-verd">
                        {def.name} <span className="font-mono text-[0.7rem]">×{n}</span>
                      </span>
                      <span className="block font-mono text-[0.66rem] text-mute">
                        {!intOk
                          ? `нужен ИНТ ${req}`
                          : def.use?.type === "heal"
                            ? def.use.scale
                              ? `+${def.use.power} + ${def.use.scale}×ИНТ ОЗ`
                              : `+${def.use.power} здоровья`
                            : "снять раны, проклятие и яд"}
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

      {hover && <GearNote item={hover} player={player} />}
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
