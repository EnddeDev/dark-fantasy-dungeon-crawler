/**
 * Потери при выходе из подземелья без победы над стражем яруса.
 * Теряется доля добытого: золото (округление), расходники и трофейное снаряжение (вниз, случайно).
 * Победа над стражем текущего яруса снимает штраф.
 */
import type { GearItem, Player, Run } from "./types";
import { SLOT_ORDER } from "./types";

export const EXIT_LOSS_RATE = 0.2;

export interface ExitLossPlan {
  lostGold: number;
  droppedItems: string[];
  droppedGear: GearItem[];
}

/** Сколько уйдёт при доле `rate`. Золото округляется, предметы — вниз. */
export function exitLossCounts(run: Pick<Run, "gold" | "loot" | "gearLoot">, rate: number) {
  return {
    gold: Math.round(run.gold * rate),
    items: Math.floor(run.loot.length * rate),
    gear: Math.floor(run.gearLoot.length * rate),
  };
}

/** Какие именно предметы уйдут. Перемешивание — случайное, как у побега. */
export function planExitLoss(
  run: Pick<Run, "gold" | "loot" | "gearLoot">,
  rate: number,
  rng: () => number = Math.random,
): ExitLossPlan {
  const counts = exitLossCounts(run, rate);
  const shuffle = <T,>(list: T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return {
    lostGold: counts.gold,
    droppedItems: shuffle(run.loot).slice(0, counts.items),
    droppedGear: shuffle(run.gearLoot).slice(0, counts.gear),
  };
}

/** Убирает потерянное из сумки, снаряжения и слотов героя. */
export function applyExitLoss(player: Player, plan: ExitLossPlan): Player {
  const bag = { ...player.bag };
  for (const id of plan.droppedItems) {
    const left = (bag[id] ?? 0) - 1;
    if (left > 0) bag[id] = left;
    else delete bag[id];
  }
  const gone = new Set(plan.droppedGear.map((g) => g.uid));
  const armory = player.armory.filter((g) => !gone.has(g.uid));
  const equip = { ...player.equip };
  for (const slot of SLOT_ORDER) {
    if (equip[slot] && gone.has(equip[slot]!)) equip[slot] = null;
  }
  return { ...player, bag, armory, equip };
}
