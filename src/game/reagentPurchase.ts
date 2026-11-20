/**
 * Докупка недостающих реагентов для горна и ритуала волшебника.
 *
 * Цена такая же, как в лавке: каждая единица — отдельная покупка, а купон скидки
 * действует на одну покупку. Чистые функции: состояние героя возвращается новым объектом.
 */
import { ITEMS, canBuySupply, supplyLevel } from "./content";
import { couponCharge, logOf } from "./quests";
import type { Player } from "./types";

export interface ReagentNeed {
  id: string;
  count: number;
}

export interface ReagentShortfall {
  id: string;
  name: string;
  /** Сколько уже в сумке/рюкзаке. */
  have: number;
  /** Сколько докупить до нужного количества. */
  missing: number;
  /** Цена одной единицы в лавке без купона. */
  unitPrice: number;
  /** Можно купить сейчас: продаётся и открыт уровень лавки. */
  sold: boolean;
  /** Почему не продаётся, если не продаётся. */
  soldNote: string | null;
}

export interface ReagentQuote {
  /** Сколько единиц докупить. */
  units: number;
  /** Цена всех недостающих единиц с учётом купонов. */
  cost: number;
  /** Сколько купонов уйдёт на покупку. */
  couponsUsed: number;
  canBuy: boolean;
  /** Причина, почему нельзя купить (нет золота, не продаётся). */
  reason: string | null;
}

/** Недостающие реагенты по списку нужных: одинаковые id суммируются, полные строки не возвращаются. */
export function missingReagents(player: Player, needs: ReagentNeed[]): ReagentShortfall[] {
  const counts = new Map<string, number>();
  for (const need of needs) counts.set(need.id, (counts.get(need.id) ?? 0) + need.count);
  const out: ReagentShortfall[] = [];
  for (const [id, count] of counts) {
    const have = player.bag[id] ?? 0;
    const missing = Math.max(0, count - have);
    if (missing <= 0) continue;
    const def = ITEMS[id];
    const isReagent = !!def && def.kind === "reagent" && (def.price ?? 0) > 0;
    const levelOk = isReagent && canBuySupply(id, player.shopLevel);
    out.push({
      id,
      name: def?.name ?? id,
      have,
      missing,
      unitPrice: isReagent ? def.price ?? 0 : 0,
      sold: levelOk,
      soldNote: !isReagent ? "не продаётся в лавке" : levelOk ? null : `нужна лавка ур. ${supplyLevel(id)}`,
    });
  }
  return out;
}

/** Проходит по единицам подряд, как по покупкам в лавке: купон уходит на первую подходящую покупку. */
function chargeUnits(player: Player, lines: ReagentShortfall[]): { cost: number; couponsUsed: number; player: Player } {
  let current = player;
  let cost = 0;
  let couponsUsed = 0;
  for (const line of lines) {
    for (let i = 0; i < line.missing; i++) {
      const charge = couponCharge(current, line.unitPrice);
      cost += charge.cost;
      if (charge.used) couponsUsed += 1;
      current = { ...current, questLog: charge.log };
    }
  }
  return { cost, couponsUsed, player: current };
}

export function reagentQuote(player: Player, lines: ReagentShortfall[]): ReagentQuote {
  const units = lines.reduce((sum, line) => sum + line.missing, 0);
  const blocked = lines.find((line) => !line.sold);
  if (blocked) {
    return { units, cost: 0, couponsUsed: 0, canBuy: false, reason: `${blocked.name}: ${blocked.soldNote ?? "нельзя купить"}` };
  }
  const { cost, couponsUsed } = chargeUnits(player, lines);
  const short = player.gold < cost;
  return {
    units,
    cost,
    couponsUsed,
    canBuy: units > 0 && !short,
    reason: short ? "не хватает золота" : null,
  };
}

/** Покупка недостающего: золото, реагенты в сумке и журнал купонов. Null, если купить нельзя. */
export function buyMissingReagents(player: Player, needs: ReagentNeed[]): { player: Player; message: string } | null {
  const lines = missingReagents(player, needs);
  const quote = reagentQuote(player, lines);
  if (!quote.canBuy) return null;
  const charged = chargeUnits(player, lines);
  const bag = { ...player.bag };
  for (const line of lines) bag[line.id] = (bag[line.id] ?? 0) + line.missing;
  const next: Player = {
    ...charged.player,
    gold: player.gold - charged.cost,
    bag,
    questLog: logOf(charged.player),
  };
  const list = lines.map((line) => `${line.name} ×${line.missing}`).join(", ");
  const coupon = charged.couponsUsed > 0 ? " · скидка 25%" : "";
  return { player: next, message: `Докуплено: ${list} за ${charged.cost} зол.${coupon}` };
}
