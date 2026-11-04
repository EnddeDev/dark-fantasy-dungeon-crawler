import { playSfx } from "../audio/sfx";
import { derived } from "../game/battle";
import {
  ARCHETYPES,
  ITEMS,
  RARITY_META,
  RECIPES,
  STAT_META,
  attemptBrew,
  canBuySupply,
  equipItem,
  gearBuyPrice,
  gearSellPrice,
  identifyAllPlan,
  identifyIntReq,
  identifyReqs,
  scaledGearStats,
  statPointCost,
  supplySellPrice,
  unequipSlot,
  type ItemDef,
  type Recipe,
} from "../game/content";
import { forgeUpgrade, type ForgeUpgradeKind } from "../game/forge";
import { resetStats } from "../game/progression";
import { chooseStatMilestone, type StatMilestoneTier } from "../game/statMilestones";
import type { ArchetypeId } from "../game/archetypes";
import type { GearItem, Player, Slot, StatKey } from "../game/types";
import { SLOT_META } from "../game/types";
import { SHOP_MAX_LEVEL, shopUpgradeCost } from "../game/world";
import { rollShopStock } from "../game/content";
import {
  acceptQuest,
  buyBlessing,
  buyMercenaryItem,
  buyVillagerItem,
  buyWizardItem,
  canLearnRecipe,
  claimQuest,
  couponCharge,
} from "../game/quests";
import type { GameModel } from "../model/GameModel";
import { recipePrice } from "../model/pricing";

export interface StatUpgradeResult {
  message: string;
  milestone?: { stat: StatKey; tier: StatMilestoneTier };
}

/**
 * Controller лобби: все изменения героя, лавки, арсенала и ремёсел.
 * View только вызывает команды и показывает результат.
 */
export class LobbyController {
  constructor(private model: GameModel) {}

  private get player(): Player {
    return this.model.getSnapshot().player;
  }

  upgradeStat(stat: StatKey): StatUpgradeResult | null {
    const player = this.player;
    const cur = player.stats[stat];
    if (cur >= 10) return null;
    const cost = statPointCost(stat, cur);
    if (player.statPoints < cost) return null;
    const next = cur + 1;
    const stats = { ...player.stats, [stat]: next };
    const updated: Player = {
      ...player,
      stats,
      statPoints: player.statPoints - cost,
      hp: derived({ ...player, stats }).maxHp,
    };
    this.model.setPlayer(updated);
    if (next === 5 || next === 10) {
      return { message: `${STAT_META[stat].name}: ${next}/10`, milestone: { stat, tier: next as StatMilestoneTier } };
    }
    return { message: `${STAT_META[stat].name}: ${next}/10` };
  }

  chooseArchetype(id: ArchetypeId): string | null {
    if (this.player.archetype) return null;
    this.model.updatePlayer((p) => ({ ...p, archetype: id }));
    return `Архетип выбран: ${ARCHETYPES[id].name}`;
  }

  pickStatMilestone(stat: StatKey, tier: StatMilestoneTier, id: string): string | null {
    const before = this.player;
    const next = chooseStatMilestone(before, stat, tier, id);
    if (next === before) return null;
    this.model.setPlayer({ ...next, hp: derived(next).maxHp });
    return "Усиление рубежа записано в лист";
  }

  buyConsumable(def: ItemDef): string | null {
    const player = this.player;
    const charge = couponCharge(player, def.price ?? 0);
    if (player.gold < charge.cost || !canBuySupply(def.id, player.shopLevel)) return null;
    this.model.updatePlayer((p) => ({
      ...p,
      gold: p.gold - charge.cost,
      bag: { ...p.bag, [def.id]: (p.bag[def.id] ?? 0) + 1 },
      questLog: charge.log,
    }));
    playSfx("buy");
    return `Куплено: ${def.name}${charge.used ? " · скидка 25%" : ""}`;
  }

  sellSupply(def: ItemDef): string | null {
    const have = this.player.bag[def.id] ?? 0;
    if (have <= 0) return null;
    const price = supplySellPrice(def);
    this.model.updatePlayer((p) => {
      const bag = { ...p.bag, [def.id]: (p.bag[def.id] ?? 0) - 1 };
      if (bag[def.id] <= 0) delete bag[def.id];
      return { ...p, gold: p.gold + price, bag };
    });
    playSfx("sell");
    return `Продано: ${def.name} за ${price} зол.`;
  }

  resetStats(): string | null {
    const res = resetStats(this.player);
    if (!res) return null;
    this.model.setPlayer(res.player);
    return `Характеристики сброшены. Возвращено ${res.refunded} очк., потрачено ${res.cost} зол.${res.removedSlots.length ? ` Снято снаряжение: ${res.removedSlots.length}.` : ""}`;
  }

  /** Автоматическое исследование при достаточном Интеллекте. */
  autoIdentify(): string | null {
    const player = this.player;
    const pending = player.armory.filter((g) => !g.identified);
    if (!pending.length) return null;
    /* Скидка на исследование («Тайновед», кровь архимага) действует и здесь:
       раньше авто-исследование сравнивало сырое требование, а кнопка — со
       скидкой, поэтому у части героев вещи оставались неисследованными. */
    const discount = derived(player).intDiscount;
    const canDo = pending.filter((g) => player.stats.int >= identifyIntReq(g, discount));
    if (!canDo.length) return null;
    const ids = new Set(canDo.map((g) => g.uid));
    this.model.updatePlayer((p) => ({
      ...p,
      armory: p.armory.map((g) => (ids.has(g.uid) ? { ...g, identified: true } : g)),
    }));
    return `Исследовано автоматически: ${canDo.length} предмет(ов)`;
  }

  buyGear(item: GearItem): string | null {
    const player = this.player;
    const charge = couponCharge(player, gearBuyPrice(item));
    if (player.gold < charge.cost) return null;
    const auto = player.stats.int >= identifyIntReq(item, derived(player).intDiscount);
    this.model.updatePlayer((p) => ({
      ...p,
      gold: p.gold - charge.cost,
      armory: [{ ...item, identified: auto }, ...p.armory],
      questLog: charge.log,
    }));
    this.model.setShopStock(this.model.getSnapshot().shopStock.filter((g) => g.uid !== item.uid));
    playSfx("buy");
    const name = scaledGearStats(item).base.name;
    const sale = charge.used ? " · скидка 25%" : "";
    return auto ? `Куплено и исследовано: ${name}${sale}` : `Куплено: ${name}${sale}`;
  }

  /* ─────────────  задания и торговцы  ───────────── */

  acceptQuest(questId: string): string | null {
    const next = acceptQuest(this.player, questId);
    if (!next) return null;
    this.model.setPlayer(next);
    playSfx("buy");
    const quest = next.questLog?.active.find((q) => q.id === questId);
    return quest ? `Задание принято: ${quest.title}` : "Задание принято";
  }

  claimQuest(questId: string): string | null {
    const res = claimQuest(this.player, questId);
    if (!res) return null;
    this.model.setPlayer(res.player);
    playSfx("buy");
    return res.message;
  }

  buyBlessing(id: string): string | null {
    const res = buyBlessing(this.player, id, this.model.getSnapshot().unlockedFloor);
    if (!res) return null;
    this.model.setPlayer(res.player);
    playSfx("buy");
    return res.message;
  }

  buyWizardItem(id: string): string | null {
    const res = buyWizardItem(this.player, id);
    if (!res) return null;
    this.model.setPlayer(res.player);
    playSfx("buy");
    return res.message;
  }

  buyVillagerItem(id: string): string | null {
    const res = buyVillagerItem(this.player, id);
    if (!res) return null;
    this.model.setPlayer(res.player);
    playSfx("buy");
    return res.message;
  }

  buyMercenaryItem(uid: string): string | null {
    const res = buyMercenaryItem(this.player, uid);
    if (!res) return null;
    this.model.setPlayer(res.player);
    playSfx("buy");
    return res.message;
  }

  /** План кнопки «Исследовать все» (см. identifyAllPlan в content.ts). */
  identifyAllPlan(): { count: number; free: number; gold: number } {
    const player = this.player;
    return identifyAllPlan(player, derived(player).intDiscount);
  }

  /** Исследует все неисследованные вещи в арсенале. Платное — только если золота хватает на всё. */
  identifyAllGear(): string | null {
    const player = this.player;
    const plan = this.identifyAllPlan();
    if (plan.count === 0) return null;
    if (player.gold < plan.gold) return null;
    const ids = new Set(player.armory.filter((g) => !g.identified).map((g) => g.uid));
    this.model.updatePlayer((p) => {
      const armory = p.armory.map((g) => (ids.has(g.uid) ? { ...g, identified: true } : g));
      const next = { ...p, armory, gold: p.gold - plan.gold };
      return { ...next, hp: derived(next).maxHp };
    });
    return plan.gold > 0
      ? `Исследовано предметов: ${plan.count} · заплачено ${plan.gold} зол.`
      : `Исследовано предметов: ${plan.count}`;
  }

  identifyGear(uid: string, mode: "int" | "gold"): string | null {
    const player = this.player;
    const target = player.armory.find((g) => g.uid === uid);
    if (!target || target.identified) return null;
    const st = scaledGearStats(target);
    const reqs = identifyReqs(target);
    const d = derived(player);
    const reqInt = identifyIntReq(target, d.intDiscount);
    if (mode === "int" && player.stats.int < reqInt) return null;
    if (mode === "gold" && player.gold < reqs.gold) return null;
    this.model.updatePlayer((p) => {
      const armory = p.armory.map((g) => (g.uid === uid ? { ...g, identified: true } : g));
      const gold = mode === "gold" ? p.gold - reqs.gold : p.gold;
      const next = { ...p, armory, gold };
      return { ...next, hp: derived(next).maxHp };
    });
    return `Исследовано: ${st.base.name} — ${RARITY_META[target.rarity].name}!`;
  }

  equipGear(item: GearItem, slot: Slot, grip?: "one" | "two"): string {
    const player = this.player;
    const before = derived(player).maxHp;
    const { player: next, note } = equipItem(player, item.uid, slot, grip);
    if (next === player) return note ?? "Не удалось надеть предмет.";
    const after = derived(next).maxHp;
    this.model.setPlayer({ ...next, hp: Math.min(after, next.hp + Math.max(0, after - before)) });
    playSfx("equip");
    return note ?? `Надето: ${scaledGearStats(item).base.name} · ${SLOT_META[slot].name}`;
  }

  takeOff(slot: Slot): string {
    if (this.player.equip[slot]) playSfx("unequip");
    this.model.updatePlayer((p) => {
      const next = unequipSlot(p, slot);
      return { ...next, hp: Math.min(derived(next).maxHp, next.hp) };
    });
    return `${SLOT_META[slot].name}: снято`;
  }

  sellGear(item: GearItem): string | null {
    const player = this.player;
    if (Object.values(player.equip).includes(item.uid)) return null;
    const price = gearSellPrice(item);
    this.model.updatePlayer((p) => ({
      ...p,
      gold: p.gold + price,
      armory: p.armory.filter((g) => g.uid !== item.uid),
    }));
    playSfx("sell");
    return `Продано за ${price} зол.`;
  }

  buyRecipe(recipe: Recipe): string | null {
    const player = this.player;
    if (!canLearnRecipe(player, recipe)) return null;
    const charge = couponCharge(player, recipePrice(recipe));
    if (player.knownRecipes.includes(recipe.id) || player.gold < charge.cost) return null;
    this.model.updatePlayer((p) => ({
      ...p,
      gold: p.gold - charge.cost,
      knownRecipes: [...p.knownRecipes, recipe.id],
      questLog: charge.log,
    }));
    playSfx("buy");
    return `Рецепт изучен: ${ITEMS[recipe.out].name}`;
  }

  brew(recipeId: string): string | null {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return null;
    const player = this.player;
    const result = attemptBrew(player, recipe);
    if (!result) return null;
    this.model.setPlayer(result.player);
    if (result.success) {
      return `Создано: ${ITEMS[recipe.out].name}${player.passives.includes("brewer") ? " (+1)" : ""}`;
    }
    return recipe.station === "workshop"
      ? "Сборка не удалась: реагенты потрачены, результата нет."
      : "Алхимия не удалась: реагенты потрачены, результата нет.";
  }

  forge(uid: string, kind: ForgeUpgradeKind, useReagents = false): string {
    const res = forgeUpgrade(this.player, uid, kind, Math.random, useReagents);
    const maxHp = derived(res.player).maxHp;
    this.model.setPlayer({ ...res.player, hp: Math.min(res.player.hp, maxHp) });
    /* Звук только у реальной попытки: отказ («нет золота», «недостижимо») стоит 0 и молчит. */
    if (res.cost > 0) playSfx(res.success ? "forgeSuccess" : "forgeFail");
    return res.message;
  }

  refreshShop(): void {
    const { player, best } = this.model.getSnapshot();
    if (player.gold < 25) return;
    this.model.updatePlayer((p) => ({ ...p, gold: Math.max(0, p.gold - 25) }));
    this.model.setShopStock(rollShopStock(player.shopLevel, Math.max(1, best)));
  }

  upgradeShop(): void {
    const player = this.player;
    const cost = shopUpgradeCost(player.shopLevel);
    if (player.gold < cost || player.shopLevel >= SHOP_MAX_LEVEL) return;
    const level = player.shopLevel + 1;
    this.model.updatePlayer((p) => ({ ...p, gold: p.gold - cost, shopLevel: level }));
    this.model.setShopStock(rollShopStock(level, Math.max(1, this.model.getSnapshot().best)));
  }
}
