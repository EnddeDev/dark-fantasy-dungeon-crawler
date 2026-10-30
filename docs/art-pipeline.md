# Арт-пайплайн «СУМРАК»

## Стиль
- Oil on canvas, grimdark, near-black dungeon background.
- Warm amber torchlight from upper left, heavy chiaroscuro and vignette.
- Desaturated umber / bone / rust / blood-crimson palette; visible canvas grain.
- Monsters: square portrait, creature fills frame, no text/border/collage.
- Items: single object centered on near-black background, same lighting, no text/border/collage.

## Каталоги
- `public/images/monsters/<enemy-id>.jpg` — индивидуальные портреты существ.
- `public/images/items/<item-id>.jpg` — индивидуальные иллюстрации предметов.
- Базовые портреты `public/images/foe-*.jpg` остаются как fallback и для старых существ.
- `public/images/items-atlas.jpg` остаётся только как fallback для предметов без индивидуальной картины.

## Команды
```bash
npm run art:manifest   # пересобрать src/game/artManifest.ts после добавления файлов
npm run art:check      # отчёт покрытия
npm run art:check -- --strict  # упасть, если хотя бы одному id не хватает картины
```

## Приоритет следующих партий
1. Монстры без индивидуального портрета: seer, golem, rat_swarm, rat_giant, bat_vampire, slime, goblin_scout, skeleton_guard, spider_weaver, sporeling.
2. Далее: mimic_larva, kobold, ghost_light, goblin_warrior, orc_raider, skeleton_archer, harpy, ogre_oaf, spider_hunter, mimic_chest.
3. Далее: gargoyle, dark_priest, werewolf, iron_guardian, witch_spider, troll, vampire_lord, lich_tender, wyrmling, devourer.
4. Далее: golem_colossus, mimic_elder, spider_queen, bone_warlord, sphinx, boss_prelate, boss_inquisitor, boss_queen, boss_lich, boss_warlord, boss_devourer, boss_sphinx.
5. Предметы: greatsword, spear, warhammer2, dagger, shield_round, shield_tower, buckler, coif, helm, greathelm.
6. Далее: crown_husk, shoes, greaves, strider_boots, wraps, vambraces, runed_bracers, ring_band, ring_edge, ring_ward.
7. Далее: ring_venom, tooth, icon, soulstone, powder, cloth, root, herb, silk, fang.
8. Далее: gland, ember, potion_haste, scroll_terror, scroll_snare, acid_vial, holy_water, potion_stone, bomb_flash.

После каждой партии: `npm run art:manifest`, `npm run art:check`, `npx tsc --noEmit`, `node --test tests/game.test.cjs`, `npm run build`.
