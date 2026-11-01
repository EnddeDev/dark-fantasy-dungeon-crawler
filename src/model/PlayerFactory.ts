import { derived } from "../game/battle";
import { GEAR_BASES, ITEMS, RECIPES, createGearItem, migrateGearItem } from "../game/content";
import { normalizeStatMilestones } from "../game/statMilestones";
import type { Player, Slot } from "../game/types";
import { SLOT_ORDER } from "../game/types";
import { SHOP_MAX_LEVEL } from "../game/world";

/** Фабрика игрока: создание нового героя и миграция старых сохранений. */
export class PlayerFactory {
  static createInitial(): Player {
    const starterWeapon = createGearItem({ baseId: "knife", wear: "worn", rarity: "common", identified: true });
    const starterArmor = createGearItem({ baseId: "rag", wear: "worn", rarity: "common", identified: true });
    const player: Player = {
      name: "Покоритель",
      level: 1,
      xp: 0,
      statPoints: 2,
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
      statuses: { wound: 0, curse: 0, poison: 0, chill: 0, fear: 0, wither: 0, burn: 0 },
      kills: 0,
      shopLevel: 1,
    };
    player.hp = derived(player).maxHp;
    return player;
  }

  static restore(saved: Player | null): Player {
    if (!saved) return PlayerFactory.createInitial();
    try {
      if (
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
          saved.armory.some((g) => g.baseId === "rapier" && g.wear === "new" && g.rarity === "rare" && !g.identified);
        const armory = saved.armory
          .filter((g) => !(isOldStarterRapier && g.baseId === "rapier"))
          .map((g) => {
            const base = GEAR_BASES[g.baseId];
            return migrateGearItem({
              ...g,
              statMult: g.statMult ?? 1,
              level: g.level ?? Math.max(1, Math.min(SHOP_MAX_LEVEL, base?.level ?? base?.minFloor ?? 1)),
              slot: (base?.slot ?? g.slot) as Slot,
              gearClass: base?.gearClass ?? g.gearClass,
            });
          });
        const owned = new Set(armory.map((g) => g.uid));
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

        const bag = Object.fromEntries(
          Object.entries(saved.bag)
            .filter(([id, count]) => ITEMS[id] && Number.isFinite(count) && count > 0)
            .map(([id, count]) => [id, Math.floor(count)]),
        );
        const knownRecipes = (Array.isArray(saved.knownRecipes) ? saved.knownRecipes : [])
          .filter((id) => RECIPES.some((recipe) => recipe.id === id));
        const restored: Player = {
          ...saved,
          bag,
          armory,
          equip,
          statuses: {
            ...saved.statuses,
            poison: saved.statuses?.poison ?? 0,
            cursePower: saved.statuses?.cursePower ?? 0,
            chill: saved.statuses?.chill ?? 0,
            fear: saved.statuses?.fear ?? 0,
            wither: saved.statuses?.wither ?? 0,
            burn: saved.statuses?.burn ?? 0,
          },
          knownRecipes,
          shopLevel: Math.max(1, Math.min(SHOP_MAX_LEVEL, Number(saved.shopLevel) || 1)),
          archetype: saved.archetype ?? null,
          statMilestones: saved.statMilestones ?? {},
        };
        const migrated = normalizeStatMilestones(restored);
        const maxHp = derived(migrated).maxHp;
        return { ...migrated, hp: Math.max(1, Math.min(maxHp, migrated.hp || maxHp)) };
      }
    } catch {
      /* повреждённое сохранение */
    }
    return PlayerFactory.createInitial();
  }
}
