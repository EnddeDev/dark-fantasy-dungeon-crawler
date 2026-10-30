import { useEffect, useState } from "react";
import { BattleView } from "./components/BattleView";
import { Dungeon } from "./components/Dungeon";
import { Lobby } from "./components/Lobby";
import { Rail } from "./components/Rail";
import { ItemArt } from "./components/ItemArt";
import { Btn, Modal, Tag } from "./components/ui";
import {
  derived,
  enemyStep,
  newBattle,
  playerAct,
  rollConsumableLoot,
  rollGearDrop,
  type BattleState,
  type PlayerAction,
} from "./game/battle";
import {
  GEAR_BASES,
  ITEMS,
  WEAR_META,
  createGearItem,
  equipItem,
  unequipSlot,
  grantXp,
  pick,
  randInt,
  REAGENTS,
  rollShopStock,
  scaledGearStats,
  consumableIntReq,
  consumablePower,
} from "./game/content";
import { MAP_EVENTS, mapEventById, SHOP_MAX_LEVEL, shopUpgradeCost, type MapEffect } from "./game/world";
import { rollStepEvent } from "./game/events";
import { cellIdx, findPath, genMaze, mazeSizeForFloor, wallBetween } from "./game/maze";
import { normalizeStatMilestones } from "./game/statMilestones";
import type { Cell, GearItem, ModalState, Player, Run, Slot } from "./game/types";
import { SLOT_META, SLOT_ORDER } from "./game/types";

type Screen = "title" | "lobby" | "dungeon" | "battle";

const BEST_KEY = "sumrak.best";
const UNLOCKED_KEY = "sumrak.unlocked-floor";
const PLAYER_KEY = "sumrak.player.v2";

function readBest(): number {
  try {
    return Number(window.localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeBest(v: number) {
  try {
    window.localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* приватный режим */
  }
}

/** Уровень лавки из сохранения — он определяет ассортимент при первом входе. */
function readShopLevel(): number {
  try {
    const raw = window.localStorage.getItem(PLAYER_KEY);
    if (raw) {
      const lvl = Number((JSON.parse(raw) as Player).shopLevel);
      if (Number.isFinite(lvl)) return Math.max(1, Math.min(SHOP_MAX_LEVEL, Math.round(lvl) || 1));
    }
  } catch {
    /* нет сохранения — первая ступень лавки */
  }
  return 1;
}

function readUnlockedFloor(): number {
  try {
    return Math.max(1, readBest(), Number(window.localStorage.getItem(UNLOCKED_KEY)) || 1);
  } catch {
    return 1;
  }
}

function writeUnlockedFloor(floor: number) {
  try {
    window.localStorage.setItem(UNLOCKED_KEY, String(floor));
  } catch {
    /* приватный режим */
  }
}

function makeInitial(): Player {
  const starterWeapon = createGearItem({
    baseId: "knife",
    wear: "worn",
    rarity: "common",
    identified: true,
  });
  const starterArmor = createGearItem({
    baseId: "rag",
    wear: "worn",
    rarity: "common",
    identified: true,
  });
  const p: Player = {
    name: "Покоритель",
    level: 1,
    xp: 0,
    statPoints: 4,
    stats: { str: 1, agi: 1, int: 1 },
    hp: 1,
    gold: 220,
    bag: { potion_s: 2, antidote: 1, scroll_spark: 1, moss: 1, fire: 1 },
    knownRecipes: [],
    armory: [starterWeapon, starterArmor],
    equip: {
      mainHand: starterWeapon.uid,
      offHand: null,
      head: null,
      body: starterArmor.uid,
      feet: null,
      wrists: null,
      ring1: null,
      ring2: null,
      amulet: null,
    },
    passives: [],
    statuses: { wound: 0, curse: 0, poison: 0 },
    kills: 0,
    shopLevel: 1,
  };
  const d = derived(p);
  p.hp = d.maxHp;
  return p;
}

function readSavedPlayer(): Player {
  try {
    const raw = window.localStorage.getItem(PLAYER_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Player;
      if (
        saved &&
        Number.isInteger(saved.level) &&
        saved.level >= 1 &&
        saved.level <= 10 &&
        saved.stats &&
        saved.bag &&
        Array.isArray(saved.armory) &&
        saved.equip &&
        Array.isArray(saved.passives)
      ) {
        const isOldStarterRapier =
          saved.level === 1 &&
          saved.xp === 0 &&
          saved.kills === 0 &&
          saved.armory.length === 3 &&
          saved.armory.some(
            (g) => g.baseId === "rapier" && g.wear === "new" && g.rarity === "rare" && !g.identified,
          );
        const armory = saved.armory
          .filter((g) => !(isOldStarterRapier && g.baseId === "rapier"))
          .map((g) => {
            const base = GEAR_BASES[g.baseId];
            return {
              ...g,
              statMult: g.statMult ?? 1,
              level: g.level ?? Math.max(1, Math.min(SHOP_MAX_LEVEL, base?.level ?? base?.minFloor ?? 1)),
              slot: (base?.slot ?? g.slot) as Slot,
              gearClass: base?.gearClass ?? g.gearClass,
            };
          });
        const owned = new Set(armory.map((g) => g.uid));

        /* Старые слоты weapon/armor/trinket переносятся в новые ячейки. */
        const legacy = (saved.equip ?? {}) as Record<string, string | null>;
        const equip: Record<Slot, string | null> = {
          mainHand: null, offHand: null, head: null, body: null,
          feet: null, wrists: null, ring1: null, ring2: null, amulet: null,
        };
        if (legacy.weapon && owned.has(legacy.weapon)) equip.mainHand = legacy.weapon;
        if (legacy.armor && owned.has(legacy.armor)) equip.body = legacy.armor;
        if (legacy.trinket && owned.has(legacy.trinket)) equip.amulet = legacy.trinket;
        SLOT_ORDER.forEach((slot) => {
          const uid = legacy[slot];
          if (uid && owned.has(uid)) equip[slot] = uid;
        });
        const mainItem = armory.find((g) => g.uid === equip.mainHand);
        if (mainItem && GEAR_BASES[mainItem.baseId]?.hands === 2) equip.offHand = null;

        const restored: Player = {
          ...saved,
          armory,
          equip,
          statuses: { ...saved.statuses, poison: saved.statuses?.poison ?? 0 },
          knownRecipes: Array.isArray(saved.knownRecipes) ? saved.knownRecipes : [],
          shopLevel: Math.max(1, Math.min(SHOP_MAX_LEVEL, Number(saved.shopLevel) || 1)),
          archetype: saved.archetype ?? null,
          statMilestones: saved.statMilestones ?? {},
        };
        // Снятое снаряжение могло уменьшить максимум — здоровье не должно его превышать.
        const migrated = normalizeStatMilestones(restored);
        const maxHp = derived(migrated).maxHp;
        return { ...migrated, hp: Math.max(1, Math.min(maxHp, migrated.hp || maxHp)) };
      }
    }
  } catch {
    /* повреждённое сохранение или запрещённое хранилище */
  }
  return makeInitial();
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [lobbyEntry, setLobbyEntry] = useState<"train" | "guide">("train");
  const [player, setPlayer] = useState<Player>(readSavedPlayer);
  const [shopStock, setShopStock] = useState<GearItem[]>(() => rollShopStock(readShopLevel(), 1));
  const [run, setRun] = useState<Run | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [best, setBest] = useState<number>(readBest);
  const [unlockedFloor, setUnlockedFloor] = useState<number>(readUnlockedFloor);
  /** Маршрут, выбранный мышью: клетки по порядку от текущей. */
  const [path, setPath] = useState<Cell[]>([]);

  const logRun = (line: string) => setRun((r) => (r ? { ...r, log: [...r.log, line] } : r));

  /* хуки — строго до любого раннего выхода */
  useEffect(() => {
    // Прогресс пишем только в лобби: перезагрузка во время вылазки не сохранит рискованную добычу.
    if (screen !== "lobby" || run || battle) return;
    try {
      window.localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
    } catch {
      /* игра остаётся доступной без localStorage */
    }
  }, [screen, run, battle, player]);

  useEffect(() => {
    if (screen !== "dungeon") return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        w: [0, -1],
        s: [0, 1],
        a: [-1, 0],
        d: [1, 0],
        ц: [0, -1],
        ы: [0, 1],
        ф: [-1, 0],
        в: [1, 0],
      };
      const dir = map[k];
      if (!dir) return;
      e.preventDefault();
      move(dir[0], dir[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, modal, run, player]);

  /* Автопоход по маршруту, выбранному мышью: по одному шагу, но шаг — событие. */
  useEffect(() => {
    if (path.length === 0) return;
    if (screen !== "dungeon" || modal || battle || !run) {
      setPath([]);
      return;
    }
    const target = path[0];
    const dx = target.x - run.pos.x;
    const dy = target.y - run.pos.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) {
      setPath([]);
      return;
    }
    const id = cellIdx(target.x, target.y, run.maze.size);
    const closedDoor = run.maze.doors.includes(id) && !run.maze.openedDoors.includes(id);
    if (closedDoor) {
      /* Перед запертой дверью маршрут обрывается — откроют сами. */
      setPath([]);
      move(dx, dy);
      return;
    }
    const t = window.setTimeout(() => {
      move(dx, dy);
      setPath((p) => p.slice(1));
    }, 110);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, screen, modal, battle, run]);

  useEffect(() => {
    if (!battle || !battle.over || battle.over === "win") return;
    const b = battle;

    if (b.over === "lose") {
      die("Ты не выдержал последнего удара. Подземелье забрало всё, что ты нашёл на его ярусах.");
      return;
    }

    /* побег: теряем до 70% добычи, при побеге от босса отступаем на предыдущую клетку */
    const r = run;
    setPlayer((p) => ({
      ...p,
      hp: b.p.hp,
      bag: b.bag,
      statuses: { wound: b.p.statuses.wound, curse: b.p.statuses.curse, poison: b.p.statuses.poison },
    }));
    if (!r) {
      setBattle(null);
      setScreen("dungeon");
      return;
    }
    const rate = b.fleeRate;
    const lostGold = Math.round(r.gold * rate);
    const droppedItems = shuffled(r.loot).slice(0, Math.floor(r.loot.length * rate));
    const droppedGear = shuffled(r.gearLoot).slice(0, Math.floor(r.gearLoot.length * rate));
    const droppedGearUids = new Set(droppedGear.map((g) => g.uid));
    const droppedCounts: Record<string, number> = {};
    droppedItems.forEach((id) => (droppedCounts[id] = (droppedCounts[id] ?? 0) + 1));

    setPlayer((p) => {
      const bag = { ...p.bag };
      Object.entries(droppedCounts).forEach(([id, count]) => {
        bag[id] = (bag[id] ?? 0) - count;
        if (bag[id] <= 0) delete bag[id];
      });
      const armory = p.armory.filter((g) => !droppedGearUids.has(g.uid));
      const equip = { ...p.equip };
      SLOT_ORDER.forEach((slot) => {
        if (equip[slot] && droppedGearUids.has(equip[slot]!)) equip[slot] = null;
      });
      return { ...p, bag, armory, equip };
    });

    const nextPos = b.isBoss ? r.prevPos : r.pos;
    setRun({
      ...r,
      pos: nextPos,
      gold: r.gold - lostGold,
      loot: (() => {
        const remaining = { ...droppedCounts };
        return r.loot.filter((id) => {
          if ((remaining[id] ?? 0) > 0) {
            remaining[id] -= 1;
            return false;
          }
          return true;
        });
      })(),
      gearLoot: r.gearLoot.filter((g) => !droppedGearUids.has(g.uid)),
      log: [
        ...r.log,
        `Побег из боя: потеряно ${lostGold} зол., ${droppedItems.length} припасов и ${droppedGear.length} снар.`,
      ],
    });
    setModal({
      kind: "note",
      title: "Побег",
      body:
        lostGold || droppedItems.length || droppedGear.length
          ? `В панике ты выронил ${lostGold} золота и ${droppedItems.length + droppedGear.length} трофеев — около ${Math.round(rate * 100)}% собранного в подземелье.`
          : "Свиток тени унёс тебя без потерь: добыча цела.",
    });
    setBattle(null);
    setScreen("dungeon");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.over]);

  /* ─────────────── ТИТУЛ ─────────────── */
  if (screen === "title") {
    return (
      <div className="relative flex min-h-screen flex-col justify-end overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-slab2 via-slab to-soot" />
        <img
          src="images/gate.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-soot via-soot/55 to-soot/70" />
        <div className="vignette absolute inset-0" />
        <div className="grain absolute inset-0" />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-14 pt-24 sm:px-8">
          <span className="sc text-flame">Хроники покорителя подземелья</span>
          <h1 className="font-title text-[clamp(4rem,17vw,11rem)] leading-[0.8] text-flamehi drop-shadow-[0_10px_40px_rgba(0,0,0,0.9)]">
            Сумрак
          </h1>
          <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,440px)_1fr] md:items-end">
            <p className="dropcap text-[1rem] leading-relaxed text-parch/90">
              Первый ярус — короткий лабиринт 6×6. Дальше коридоры растут до 10×10, но свет факела показывает
              лишь три клетки вперёд. Исследуй снаряжение, читай свитки и победи Стража у лестницы.
            </p>
            <div className="flex flex-wrap items-center gap-3 md:justify-end">
              <Btn tone="flame" className="px-8 py-3.5 text-sm" onClick={() => { setLobbyEntry("train"); setScreen("lobby"); }}>
                Войти в лобби
              </Btn>
              <Btn onClick={() => { setLobbyEntry("guide"); setScreen("lobby"); }}>
                Как играть
              </Btn>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────── ПОДЗЕМЕЛЬЕ ─────────────── */
  const startRun = (floor: number) => {
    if (!Number.isInteger(floor) || floor < 1 || floor > unlockedFloor) return;
    const maze = genMaze(mazeSizeForFloor(floor), floor);
    setPlayer((p) => ({ ...p, hp: derived(p).maxHp, statuses: { wound: 0, curse: 0, poison: 0 } }));
    setRun({
      floor,
      maze,
      pos: { ...maze.start },
      prevPos: { ...maze.start },
      seen: { [`${maze.start.x},${maze.start.y}`]: true },
      gold: 0,
      loot: [],
      gearLoot: [],
      keys: 0,
      steps: 0,
      log: [`Спускаетесь на этаж ${floor} (${maze.size}×${maze.size}). Факел освещает круг радиусом 3, но стены и запертые двери блокируют свет.`],
    });
    if (floor > best) {
      setBest(floor);
      writeBest(floor);
    }
    setScreen("dungeon");
    setLobbyEntry("train");
    setModal({ kind: "intro" });
  };

  const die = (cause: string) => {
    const lost = run?.gold ?? 0;
    const lostItems = [...(run?.loot ?? [])];
    const lostGearUids = new Set((run?.gearLoot ?? []).map((g) => g.uid));
    const lostGearCount = lostGearUids.size;

    setPlayer((p) => {
      const bag = { ...p.bag };
      lostItems.forEach((id) => {
        bag[id] = (bag[id] ?? 0) - 1;
        if (bag[id] <= 0) delete bag[id];
      });
      const armory = p.armory.filter((g) => !lostGearUids.has(g.uid));
      const equip = { ...p.equip };
      SLOT_ORDER.forEach((slot) => {
        if (equip[slot] && lostGearUids.has(equip[slot]!)) equip[slot] = null;
      });
      const nextP = { ...p, bag, armory, equip, statuses: { wound: 0, curse: 0, poison: 0 } };
      return { ...nextP, hp: derived(nextP).maxHp };
    });
    setRun(null);
    setBattle(null);
    setScreen("lobby");
    setModal({ kind: "death", cause, lost, lostGear: lostGearCount });
  };

  const stepInto = (nx: number, ny: number, base?: Run) => {
    const src = base ?? run;
    if (!src) return;
    const m = src.maze;
    const idx = cellIdx(nx, ny, m.size);
    const knownPath = !!src.seen[`${nx},${ny}`];
    const d = derived(player);
    const has = (id: string) => player.passives.includes(id);

    let r: Run = {
      ...src,
      prevPos: { ...src.pos },
      pos: { x: nx, y: ny },
      seen: { ...src.seen, [`${nx},${ny}`]: true },
      steps: src.steps + 1,
      log: [...src.log],
    };
    let hp = player.hp;
    const statuses = { ...player.statuses };

    /* негативные эффекты тикают на каждом шаге */
    if (statuses.wound > 0 && !d.legendaryPassives.includes("titan_heart")) {
      const dmg = 2 + r.floor;
      hp -= dmg;
      statuses.wound -= 1;
      r.log.push(`Кровотечение: −${dmg} здоровья.`);
    }
    if (statuses.curse > 0) statuses.curse -= 1;
    if (statuses.poison > 0 && !d.legendaryPassives.includes("titan_heart")) {
      const poisonDmg = 3 + r.floor;
      hp -= poisonDmg;
      statuses.poison -= 1;
      r.log.push(`Яд в крови: −${poisonDmg} здоровья.`);
    }

    if (hp <= 0) {
      setPlayer((p) => ({ ...p, hp: 0 }));
      die("Кровь не сворачивалась, и подземелье забрало своё.");
      return;
    }

    /* Клетка Босса перед лестницей */
    if (m.boss.x === nx && m.boss.y === ny && !m.bossDefeated) {
      r.log.push("Перед лестницей встаёт Страж яруса!");
      setPlayer((p) => ({ ...p, hp, statuses }));
      setRun(r);
      setBattle(newBattle({ ...player, hp, statuses }, r.floor, true));
      setScreen("battle");
      return;
    }

    /* Лестница */
    if (m.stairs.x === nx && m.stairs.y === ny) {
      if (!m.bossDefeated) {
        setPlayer((p) => ({ ...p, hp, statuses }));
        setRun(r);
        setBattle(newBattle({ ...player, hp, statuses }, r.floor, true));
        setScreen("battle");
        return;
      }
      setPlayer((p) => ({ ...p, hp, statuses }));
      setRun(r);
      setModal({ kind: "stairs" });
      return;
    }

    /* Сундук */
    if (m.chests.includes(idx) && !m.openedChests.includes(idx)) {
      const raw = 35 + Math.floor(Math.random() * 46);
      const gold = Math.round((raw * (1 + (r.floor - 1) * 0.6)) / 5) * 5;
      const items = rollConsumableLoot(r.floor, Math.random() < 0.55 ? 2 : 1);
      const droppedGear = rollGearDrop(r.floor, Math.random() < 0.35);
      const chestXp = 6 + r.floor * 3;
      const earnedXp = chestXp;

      r = {
        ...r,
        maze: { ...m, openedChests: [...m.openedChests, idx] },
        gold: r.gold + gold,
        loot: [...r.loot, ...items],
        gearLoot: [...r.gearLoot, droppedGear],
        log: [
          ...r.log,
          `Сундук вскрыт: +${gold} зол., +${earnedXp} XP и неизученный предмет (${scaledGearStats(droppedGear).base.name}).`,
        ],
      };

      setPlayer((p) => {
        const bag = { ...p.bag };
        items.forEach((id) => (bag[id] = (bag[id] ?? 0) + 1));
        const withLoot: Player = {
          ...p,
          hp,
          statuses,
          bag,
          armory: [droppedGear, ...p.armory],
        };
        return grantXp(withLoot, chestXp).player;
      });
      setRun(r);
      setModal({ kind: "chest", gold, items, gear: [droppedGear], xp: earnedXp });
      return;
    }

    /* Ключ */
    if (m.keys.includes(idx) && !m.takenKeys.includes(idx)) {
      r = {
        ...r,
        maze: { ...m, takenKeys: [...m.takenKeys, idx] },
        keys: r.keys + 1,
        log: [...r.log, "Подобран ключ от запертой двери."],
      };
      setPlayer((p) => ({ ...p, hp, statuses }));
      setRun(r);
      setModal({ kind: "key" });
      return;
    }

    /* Клетка события: у каждого исхода есть и дар, и цена */
    if (m.events.includes(idx) && !m.usedEvents.includes(idx)) {
      const ev = MAP_EVENTS[idx % MAP_EVENTS.length];
      setPlayer((p) => ({ ...p, hp, statuses }));
      setRun({
        ...r,
        maze: { ...m, usedEvents: [...m.usedEvents, idx] },
        log: [...r.log, `Событие: ${ev.name}.`],
      });
      setPath([]);
      setModal({ kind: "event", eventId: ev.id });
      return;
    }

    /* На известном пути ловушек 5%, на новом — 10%. Враги всегда 20%. */
    const event = rollStepEvent(knownPath);
    if (event === "quiet") {
      r.log.push(
        knownPath
          ? "Знакомый коридор. Ты помнишь, где потрескался камень."
          : Math.random() < 0.5
          ? "Тишина. Только капли воды да чей-то скрип вдали."
          : "Пустой коридор. Пламя факела тянется на три шага вперёд.",
      );
      setPlayer((p) => ({ ...p, hp, statuses }));
      setRun(r);
      return;
    }
    if (event === "find") {
      if (Math.random() < 0.5) {
        const foundGold = randInt(5 + r.floor * 2, 12 + r.floor * 4);
        r.gold += foundGold;
        r.log.push(`Среди камней найдены ${foundGold} золотых монет.`);
        setPlayer((p) => ({ ...p, hp, statuses }));
      } else {
        const reagent = pick(REAGENTS);
        r = { ...r, loot: [...r.loot, reagent] };
        r.log.push(`В щели найден реагент: ${ITEMS[reagent].name}.`);
        setPlayer((p) => ({
          ...p,
          hp,
          statuses,
          bag: { ...p.bag, [reagent]: (p.bag[reagent] ?? 0) + 1 },
        }));
      }
      setRun(r);
      return;
    }
    if (event === "trap") {
      const baseDmg = 6 + r.floor * 4;
      let dmg = baseDmg * (1 - player.stats.str * 0.04);
      if (has("stone_skin")) dmg *= 0.75;
      const swiftBonus = d.rareAffixes.filter((x) => x === "swift").length * 0.12;
      const chance = Math.min(
        0.9,
        0.22 + player.stats.agi * 0.05 + player.stats.int * 0.02 + (has("light_step") ? 0.3 : 0) + swiftBonus,
      );
      setPlayer((p) => ({ ...p, hp, statuses }));
      setRun(r);
      setModal({ kind: "trap", dmg: Math.max(1, Math.round(dmg)), chance });
      return;
    }

    /* Бой со случайным существом */
    setPlayer((p) => ({ ...p, hp, statuses }));
    setRun(r);
    setBattle(newBattle({ ...player, hp, statuses }, r.floor, false));
    setScreen("battle");
  };

  const move = (dx: number, dy: number) => {
    if (screen !== "dungeon" || modal || !run) return;
    const { x, y } = run.pos;
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= run.maze.size || ny >= run.maze.size) return;
    if (wallBetween(run.maze, x, y, dx, dy)) {
      logRun("Каменная стена. Сквозь неё ни пройти, ни заглянуть.");
      return;
    }
    const id = cellIdx(nx, ny, run.maze.size);
    if (run.maze.doors.includes(id) && !run.maze.openedDoors.includes(id)) {
      if (run.keys > 0) setModal({ kind: "door", x: nx, y: ny });
      else
        setModal({
          kind: "note",
          title: "Закрытая дверь",
          body: "Замок заперт наглухо. Без ключа здесь не пройти и не увидеть, что скрыто за порогом.",
        });
      return;
    }
    stepInto(nx, ny);
  };

  const clickCell = (cx: number, cy: number) => {
    if (!run || modal || battle || screen !== "dungeon") return;
    if (cx === run.pos.x && cy === run.pos.y) return;
    if (!run.seen[`${cx},${cy}`]) return;
    const route = findPath(run.maze, run.pos, { x: cx, y: cy }, { avoidClosedDoors: run.keys === 0 });
    if (!route || route.length === 0) {
      setPath([]);
      return;
    }
    setPath(route);
  };

  const handleEquip = (uid: string, slot: Slot) => {
    let note: string | undefined;
    let name = "предмет";
    setPlayer((p) => {
      const before = derived(p).maxHp;
      const res = equipItem(p, uid, slot);
      note = res.note;
      const item = p.armory.find((g) => g.uid === uid);
      if (item) name = GEAR_BASES[item.baseId]?.name ?? name;
      const after = derived(res.player).maxHp;
      return { ...res.player, hp: Math.min(after, res.player.hp + Math.max(0, after - before)) };
    });
    logRun(`Смена снаряжения: ${name} → ${SLOT_META[slot].name.toLowerCase()}${note ? `. ${note}` : "."}`);
  };

  const handleUnequip = (slot: Slot) => {
    setPlayer((p) => {
      const before = derived(p).maxHp;
      const next = unequipSlot(p, slot);
      const after = derived(next).maxHp;
      return { ...next, hp: Math.min(after, next.hp + Math.max(0, after - before)) };
    });
    logRun(`${SLOT_META[slot].name}: снято.`);
  };

  /* Событие карты: бросаем исход и применяем обе стороны результата. */
  const resolveEvent = (eventId: string, choiceId: string) => {
    const ev = mapEventById(eventId);
    if (!ev || !run) return;
    const choice = ev.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    const good = Math.random() < choice.chance;
    const effects: MapEffect[] = good ? choice.good : choice.bad;
    const floor = run.floor;

    let hp = player.hp;
    let xpGain = 0;
    const statuses = { ...player.statuses };
    const gainedItems: string[] = [];
    const gainedGear: GearItem[] = [];
    const statUp: Partial<Record<Slot | string, number>> = {};
    let goldDelta = 0;

    for (const e of effects) {
      switch (e.k) {
        case "hp": hp += e.v ?? 0; break;
        case "heal": hp = Math.min(derived(player).maxHp, hp + (e.v ?? 0)); break;
        case "gold": goldDelta += e.v ?? 0; break;
        case "gold_loss": goldDelta -= e.v ?? 0; break;
        case "xp": xpGain += e.v ?? 0; break;
        case "curse": statuses.curse = Math.max(statuses.curse, e.v ?? 0); break;
        case "poison": statuses.poison = Math.max(statuses.poison, e.v ?? 0); break;
        case "reagent": for (let i = 0; i < (e.v ?? 1); i++) gainedItems.push(pick(REAGENTS)); break;
        case "supply": for (let i = 0; i < (e.v ?? 1); i++) gainedItems.push(pick(["potion_s", "antidote", "scroll_spark", "throwing_knife"])); break;
        case "gear": for (let i = 0; i < (e.v ?? 1); i++) gainedGear.push(rollGearDrop(floor, Math.random() < 0.4)); break;
        case "stat": if (e.stat) statUp[e.stat] = (statUp[e.stat] ?? 0) + (e.v ?? 1); break;
      }
    }

    const stats = { ...player.stats } as Record<string, number>;
    Object.entries(statUp).forEach(([k, v]) => { stats[k] = Math.min(10, (stats[k] ?? 1) + (v ?? 0)); });
    hp = Math.min(hp, derived({ ...player, stats: stats as typeof player.stats }).maxHp);

    const deathCausesHp = hp <= 0;
    const nextPlayer: Player = {
      ...player,
      hp: deathCausesHp ? 0 : Math.max(1, hp),
      stats: stats as typeof player.stats,
      statuses,
      bag: (() => {
        const bag = { ...player.bag };
        gainedItems.forEach((id) => (bag[id] = (bag[id] ?? 0) + 1));
        return bag;
      })(),
      armory: [...gainedGear, ...player.armory],
    };
    const withXp = xpGain > 0 ? grantXp(nextPlayer, xpGain).player : nextPlayer;

    setPlayer(withXp);
    setRun((r) => {
      if (!r) return r;
      const mark = r.maze.events.find((i) => !r.maze.usedEvents.includes(i) && MAP_EVENTS[i % MAP_EVENTS.length]?.id === eventId);
      const merged = { ...r };
      if (mark !== undefined) merged.maze = { ...r.maze, usedEvents: [...r.maze.usedEvents, mark] };
      if (goldDelta !== 0) merged.gold = Math.max(0, r.gold + goldDelta);
      if (gainedItems.length) merged.loot = [...r.loot, ...gainedItems];
      if (gainedGear.length) merged.gearLoot = [...gainedGear, ...r.gearLoot];
      merged.log = [
        ...r.log,
        `${ev.name}: ${good ? "удача" : "неудача"} — ${good ? choice.goodText : choice.badText}`,
      ];
      return merged;
    });

    if (deathCausesHp) {
      die("Событие подземелья забрало последние силы.");
      return;
    }
    setModal({ kind: "event", eventId, result: { title: ev.name, good: choice.goodText, bad: choice.badText } });
  };

  const takeTrap = (disarm: boolean) => {
    if (!modal || modal.kind !== "trap") return;
    setModal(null);
    const trapXp = 2 + (run?.floor ?? 1);
    if (disarm && Math.random() < modal.chance) {
      setPlayer((p) => grantXp(p, trapXp).player);
      logRun(`Механизм ловушки обезврежен (+${trapXp} XP).`);
      return;
    }
    const dmg = disarm ? Math.round(modal.dmg * 1.35) : modal.dmg;
    const hp = player.hp - dmg;
    logRun(`Ловушка сработала: −${dmg} здоровья.`);
    if (hp <= 0) {
      setPlayer((p) => ({ ...p, hp: 0 }));
      die("Ловушка сработала быстрее, чем ты успел отскочить.");
      return;
    }
    setPlayer((p) => ({ ...p, hp }));
  };

  const openDoor = (x: number, y: number) => {
    if (!run || run.keys <= 0) return;
    const id = cellIdx(x, y, run.maze.size);
    const next: Run = {
      ...run,
      keys: run.keys - 1,
      maze: { ...run.maze, openedDoors: [...run.maze.openedDoors, id] },
      log: [...run.log, "Ключ повёрнут. Дверь открыта."],
    };
    setRun(next);
    setModal(null);
    stepInto(x, y, next);
  };

  const useFieldItem = (id: string) => {
    const def = ITEMS[id];
    if (!run || !def?.use) return;
    if ((player.bag[id] ?? 0) <= 0) return;
    const u = def.use;
    const d = derived(player);
    const req = consumableIntReq(def, d.intDiscount);
    if (player.stats.int < req) {
      setModal({
        kind: "note",
        title: "Недостаточно Интеллекта",
        body: `Для «${def.name}» нужен Интеллект ${req}.`,
      });
      return;
    }
    let hp = player.hp;
    const statuses = { ...player.statuses };
    let msg = "";
    if (u.type === "heal") {
      const amt = consumablePower(def, player.stats);
      hp = Math.min(d.maxHp, hp + amt);
      if (def.kind === "scroll") statuses.wound = 0;
      msg = `${def.name}: +${amt} здоровья.`;
    } else if (u.type === "cleanse") {
      statuses.wound = 0;
      statuses.curse = 0;
      statuses.poison = 0;
      hp = Math.min(d.maxHp, hp + 8);
      msg = `${def.name}: раны, проклятие и яд сняты (+8 ОЗ).`;
    } else {
      return;
    }
    setPlayer((p) => {
      const bag = { ...p.bag };
      bag[id] = (bag[id] ?? 0) - 1;
      if (bag[id] <= 0) delete bag[id];
      return { ...p, bag, hp, statuses };
    });
    logRun(msg);
  };

  const descend = () => {
    if (!run || !run.maze.bossDefeated) return;
    const nf = run.floor + 1;
    const maze = genMaze(mazeSizeForFloor(nf), nf);
    setRun({
      ...run,
      floor: nf,
      maze,
      pos: { ...maze.start },
      prevPos: { ...maze.start },
      seen: { [`${maze.start.x},${maze.start.y}`]: true },
      keys: 0,
      log: [...run.log, `Спуск на этаж ${nf} (${maze.size}×${maze.size}). Монстры опаснее, сокровища богаче.`],
    });
    setPlayer((p) => {
      const d = derived(p);
      return { ...p, hp: Math.min(d.maxHp, p.hp + 10) };
    });
    setPath([]);
    setShopStock(rollShopStock(player.shopLevel, nf));
    const nb = Math.max(best, nf);
    setBest(nb);
    writeBest(nb);
    setModal(null);
  };

  const winContinue = () => {
    if (!battle) return;
    const b = battle;
    const bag = { ...b.bag };
    b.loot.items.forEach((id) => (bag[id] = (bag[id] ?? 0) + 1));
    const withLoot: Player = {
      ...player,
      hp: b.p.hp,
      bag,
      armory: [...b.loot.gear, ...player.armory],
      kills: player.kills + 1,
      statuses: { wound: b.p.statuses.wound, curse: b.p.statuses.curse, poison: b.p.statuses.poison },
    };
    const { player: updated, levelsGained } = grantXp(withLoot, b.loot.xp);
    setPlayer(updated);

    if (b.isBoss) {
      const nextUnlocked = Math.max(unlockedFloor, b.floor + 1);
      setUnlockedFloor(nextUnlocked);
      writeUnlockedFloor(nextUnlocked);
    }

    setRun((r) => {
      if (!r) return r;
      const maze = b.isBoss ? { ...r.maze, bossDefeated: true } : r.maze;
      const lvlNote = levelsGained > 0 ? ` Повышен уровень (+${levelsGained * 2} очк. хар.)!` : "";
      const earnedXp = b.loot.xp;
      return {
        ...r,
        maze,
        gold: r.gold + b.loot.gold,
        loot: [...r.loot, ...b.loot.items],
        gearLoot: [...r.gearLoot, ...b.loot.gear],
        log: [
          ...r.log,
          `Победа над ${b.enemy.def.name}: +${b.loot.gold} зол., +${earnedXp} XP.${lvlNote}${b.isBoss ? ` Открыт этаж ${b.floor + 1}.` : ""}`,
        ],
      };
    });

    setBattle(null);
    setScreen("dungeon");
  };

  const leaveRun = () => {
    if (!run) return;
    const r = run;
    setPlayer((p) => {
      const d = derived(p);
      return {
        ...p,
        gold: p.gold + r.gold,
        hp: d.maxHp,
        statuses: { wound: 0, curse: 0, poison: 0 },
      };
    });
    setPath([]);
    setShopStock(rollShopStock(player.shopLevel, r.floor));
    setRun(null);
    setScreen("lobby");
    setModal({
      kind: "note",
      title: "Возвращение в лобби",
      body: `Ты выбрался живым! Сохранено ${r.gold} золота, ${r.loot.length} расходуемых предметов и ${r.gearLoot.length} ед. трофейного снаряжения. Теперь можно распределить очки опыта и исследовать находки.`,
    });
  };

  /* ─────────────── МОДАЛКИ ─────────────── */
  const renderModal = () => {
    if (!modal) return null;
    const close = () => setModal(null);

    switch (modal.kind) {
      case "intro":
        return (
          <Modal
            title="Вход в лабиринт"
            sub="Правила подземелья"
            actions={
              <Btn tone="flame" onClick={close}>
                В путь
              </Btn>
            }
          >
            <ul className="space-y-2">
              <li className="dropcap">
                <b className="text-flame">Туман и стены:</b> сквозь стены ничего не видно — открыты только
                пройденные клетки и <b>круг радиусом 3</b> — стены блокируют свет.
              </li>
              <li>
                <b className="text-flame">Новая клетка:</b> 60% тихо, 10% ловушка, 20% бой и 10% небольшая находка.
                Повторный путь: 75% тихо, 5% ловушка, 20% бой.
              </li>
              <li>
                <b className="text-rubric">Страж перед лестницей:</b> спуск на следующий ярус охраняет Босс со
                своими способностями.
              </li>
              <li>
                <b className="text-verd">Трофейное снаряжение:</b> найденные вещи скрывают свою редкость, пока ты не
                исследуешь их в арсенале за Интеллект или золото. Уровень растёт без потолка, но каждый следующий
                требует всё больше вылазок.
              </li>
            </ul>
          </Modal>
        );

      case "trap":
        return (
          <Modal
            title="Ловушка"
            sub="Пластина под сапогом ушла вниз со щелчком"
            actions={
              <>
                <Btn
                  tone="verd"
                  onClick={() => {
                    close();
                    takeTrap(true);
                  }}
                >
                  Обезвредить · {Math.round(modal.chance * 100)}%
                </Btn>
                <Btn
                  tone="danger"
                  onClick={() => {
                    close();
                    takeTrap(false);
                  }}
                >
                  Принять удар · {modal.dmg}
                </Btn>
              </>
            }
          >
            <p>
              Можно перехватить механизм на лету (дает опыт при успехе) или принять удар на себя. Ловкость и
              Интеллект повышают шанс обезвреживания, а Сила снижает урон.
            </p>
            <p className="mt-3 flex flex-wrap gap-2">
              <Tag tone="rubric">урон {modal.dmg}</Tag>
              <Tag tone="mute">при срыве: {Math.round(modal.dmg * 1.35)}</Tag>
              <Tag tone="flame">СИЛ {player.stats.str}</Tag>
            </p>
          </Modal>
        );

      case "door":
        return (
          <Modal
            title="Закрытая дверь"
            sub="Железная решётка преграждает путь и скрывает то, что дальше"
            actions={
              <>
                <Btn onClick={close}>Отступить</Btn>
                <Btn tone="verd" disabled={(run?.keys ?? 0) === 0} onClick={() => openDoor(modal.x, modal.y)}>
                  Использовать ключ ({run?.keys ?? 0})
                </Btn>
              </>
            }
          >
            <p>
              Ключей в связке: <b className="text-verd">{run?.keys ?? 0}</b>. Открытая дверь остаётся распахнутой до
              конца этажа и пропускает свет факела дальше.
            </p>
          </Modal>
        );

      case "chest":
        return (
          <Modal
            title="Сундук сокровищ"
            sub="Внутри звенит золото и лежит неизученное снаряжение"
            actions={
              <Btn tone="flame" onClick={close}>
                Забрать всё
              </Btn>
            }
          >
            <div className="flex items-baseline justify-between border-b border-line pb-2">
              <span className="sc">Золото и опыт</span>
              <span className="font-mono text-xl tab text-flame">
                +{modal.gold} зол. · <span className="text-verd">+{modal.xp} XP</span>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {modal.items.map((id, i) => (
                <span key={id + i} className="flex items-center gap-1.5 border border-line bg-black/40 px-2 py-1">
                  <ItemArt id={id} name={ITEMS[id]?.name} size={30} framed={false} />
                  <span className="font-mono text-[0.68rem] text-parch">{ITEMS[id]?.name ?? id}</span>
                </span>
              ))}
              {modal.gear.map((g) => {
                const st = scaledGearStats(g);
                return (
                  <span key={g.uid} className="flex items-center gap-1.5 border border-line bg-black/40 px-2 py-1">
                    <ItemArt id={g.baseId} name={st.base.name} size={32} />
                    <span className="font-mono text-[0.68rem] text-parch">
                      {st.base.name} ({WEAR_META[g.wear].name} ×{WEAR_META[g.wear].mult} · Редкость: ???)
                    </span>
                  </span>
                );
              })}
            </div>
            <p className="mt-3 text-sm italic text-mute">
              Редкость найденного снаряжения неизвестна — проведите исследование в лобби за Интеллект или золото.
            </p>
          </Modal>
        );

      case "key":
        return (
          <Modal
            title="Найден ключ"
            sub="Тяжёлый кованый ключ от подземелья"
            actions={
              <Btn tone="flame" onClick={close}>
                Взять ключ
              </Btn>
            }
          >
            <p>
              Ключей у тебя: <b className="text-verd">{run?.keys ?? 0}</b>. Теперь можно отпереть закрытую дверь на
              этом ярусе.
            </p>
          </Modal>
        );

      case "stairs":
        return (
          <Modal
            title="Лестница на ярус ниже"
            sub={`Страж этажа ${run?.floor ?? 1} повержен — проход свободен`}
            actions={
              <>
                <Btn onClick={close}>Остаться на этаже</Btn>
                <Btn tone="flame" onClick={descend}>
                  Спуститься на этаж {(run?.floor ?? 1) + 1}
                </Btn>
              </>
            }
          >
            <p>
              Ниже обитают более опасные монстры и новый Босс-страж, но сундуки там богаче, а шанс найти Эпическое
              и Легендарное снаряжение выше. Передышка на ступенях восстановит 10 здоровья.
            </p>
          </Modal>
        );

      case "death":
        return (
          <Modal
            title="Поражение в подземелье"
            actions={
              <Btn
                tone="flame"
                onClick={() => {
                  close();
                  setScreen("lobby");
                }}
              >
                Очнуться в лобби
              </Btn>
            }
          >
            <p className="dropcap">{modal.cause}</p>
            <p className="mt-3 text-mute">
              Потеряна вся добыча этой вылазки: <b className="text-rubric">{modal.lost}</b> золота и{" "}
              <b className="text-rubric">{modal.lostGear}</b> ед. невынесенного снаряжения. Уровень, опыт,
              характеристики и сохранённый в лобби арсенал остались с тобой.
            </p>
          </Modal>
        );

      case "event": {
        const ev = mapEventById(modal.eventId);
        if (!ev) return null;
        if (modal.result) {
          return (
            <Modal
              title={modal.result.title}
              sub="Что осталось после твоего выбора"
              actions={
                <Btn tone="flame" onClick={close}>
                  Продолжить путь
                </Btn>
              }
            >
              <p className="dropcap">{modal.result.good}</p>
              <p className="mt-3 border-l-2 border-rubric/70 pl-3 text-mute">{modal.result.bad}</p>
            </Modal>
          );
        }
        return (
          <Modal
            title={ev.name}
            sub="Значок на карте. Выбор один — и у каждого исхода две стороны"
            actions={<span className="font-mono text-[0.7rem] text-mute">Итог смешивает дар и потерю</span>}
          >
            <p className="mb-4 italic text-mute">{ev.prompt}</p>
            <div className="grid gap-2">
              {ev.choices.map((c) => (
                <button
                  key={c.id}
                  onClick={() => resolveEvent(ev.id, c.id)}
                  className="group border border-line bg-black/30 px-3 py-2.5 text-left transition-colors hover:border-flame hover:bg-flame/10"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-[0.95rem] uppercase tracking-[0.1em] text-flamehi group-hover:text-flame">
                      {c.label}
                    </span>
                    <span className="shrink-0 font-mono text-[0.7rem] text-mute">
                      удача {Math.round(c.chance * 100)}%
                    </span>
                  </span>
                  <span className="mt-1 block font-mono text-[0.7rem] text-verd">{c.detail}</span>
                </button>
              ))}
            </div>
          </Modal>
        );
      }

      case "note":
        return (
          <Modal
            title={modal.title}
            actions={
              <Btn tone="flame" onClick={close}>
                Принято
              </Btn>
            }
          >
            <p className="dropcap">{modal.body}</p>
          </Modal>
        );
    }
  };

  const d = derived(player);

  /* ─────────────── РЕНДЕР ─────────────── */
  return (
    <div className="flex min-h-screen flex-col bg-soot lg:flex-row">
      <Rail player={player} run={run} battle={battle} onLeaveRun={leaveRun} />
      <main className="order-2 min-w-0 flex-1">
        {screen === "lobby" && (
          <Lobby
            player={player}
            setPlayer={(fn) => setPlayer((p) => fn(p))}
            shopStock={shopStock}
            onRefreshShop={() => {
              setPlayer((p) => ({ ...p, gold: Math.max(0, p.gold - 25) }));
              setShopStock(rollShopStock(player.shopLevel, Math.max(1, best)));
            }}
            onPurchaseGear={(uid) =>
              setShopStock((prev) => prev.filter((g) => g.uid !== uid))
            }
            onUpgradeShop={() => {
              const cost = shopUpgradeCost(player.shopLevel);
              if (player.gold < cost || player.shopLevel >= SHOP_MAX_LEVEL) return;
              const level = player.shopLevel + 1;
              setPlayer((p) => ({ ...p, gold: p.gold - cost, shopLevel: level }));
              setShopStock(rollShopStock(level, Math.max(1, best)));
            }}
            onStart={startRun}
            best={best}
            unlockedFloor={unlockedFloor}
            initialTab={lobbyEntry}
          />
        )}
        {screen === "dungeon" && run && (
          <Dungeon
            run={run}
            player={player}
            bag={player.bag}
            hp={player.hp}
            maxHp={d.maxHp}
            intStat={player.stats.int}
            intDiscount={d.intDiscount}
            path={path}
            onMove={move}
            onCellClick={clickCell}
            onUseItem={useFieldItem}
            onEquip={handleEquip}
            onUnequip={handleUnequip}
            onCancelPath={() => setPath([])}
          />
        )}
        {screen === "battle" && battle && (
          <BattleView
            battle={battle}

            onAct={(a: PlayerAction) => setBattle((b) => (b ? playerAct(b, a) : b))}
            onEnemyTurn={() => setBattle((b) => (b ? enemyStep(b) : b))}
            onContinue={winContinue}
          />
        )}
      </main>
      {renderModal()}
    </div>
  );
}
