/**
 * АВТОМАТИЧЕСКИ СОБРАННЫЙ МАНИФЕСТ ИЛЛЮСТРАЦИЙ.
 * Не правьте вручную: запустите npm run art:manifest.
 * Ключ — id существа/предмета, значение — путь от корня public.
 */
export const FOE_ART: Readonly<Record<string, string>> = {
  "vermin": "images/foe-vermin.jpg",
  "husk": "images/foe-husk.jpg",
  "bone": "images/foe-bone.jpg",
  "wraith": "images/foe-wraith.jpg",
  "brute": "images/foe-brute.jpg",
  "boss_warden": "images/foe-boss.jpg",
  "bat_vampire": "images/monsters/bat_vampire.jpg",
  "imp": "images/monsters/imp.jpg",
  "rat_giant": "images/monsters/rat_giant.jpg",
  "rat_swarm": "images/monsters/rat_swarm.jpg"
};

export const ITEM_ART: Readonly<Record<string, string>> = {
  "abyss": "images/items/abyss.jpg",
  "amulet": "images/items/amulet.jpg",
  "antidote": "images/items/antidote.jpg",
  "axe": "images/items/axe.jpg",
  "blast_bomb": "images/items/blast_bomb.jpg",
  "bone": "images/items/bone.jpg",
  "boots": "images/items/boots.jpg",
  "fear_vial": "images/items/fear_vial.jpg",
  "fire": "images/items/fire.jpg",
  "hammer": "images/items/hammer.jpg",
  "knife": "images/items/knife.jpg",
  "mail": "images/items/mail.jpg",
  "moss": "images/items/moss.jpg",
  "plate": "images/items/plate.jpg",
  "poison_dart": "images/items/poison_dart.jpg",
  "potion_l": "images/items/potion_l.jpg",
  "potion_s": "images/items/potion_s.jpg",
  "rag": "images/items/rag.jpg",
  "rage": "images/items/rage.jpg",
  "rapier": "images/items/rapier.jpg",
  "ring_stone": "images/items/ring_stone.jpg",
  "scroll_bolt": "images/items/scroll_bolt.jpg",
  "scroll_fire": "images/items/scroll_fire.jpg",
  "scroll_frost": "images/items/scroll_frost.jpg",
  "scroll_heal": "images/items/scroll_heal.jpg",
  "scroll_shadow": "images/items/scroll_shadow.jpg",
  "scroll_spark": "images/items/scroll_spark.jpg",
  "seal": "images/items/seal.jpg",
  "shroud": "images/items/shroud.jpg",
  "smoke_bomb": "images/items/smoke_bomb.jpg",
  "staff": "images/items/staff.jpg",
  "sword": "images/items/sword.jpg",
  "tear": "images/items/tear.jpg",
  "throwing_knife": "images/items/throwing_knife.jpg"
};

export function foeArtSrc(id: string): string | null {
  return FOE_ART[id] ?? null;
}

export function itemArtSrc(id: string): string | null {
  return ITEM_ART[id] ?? null;
}
