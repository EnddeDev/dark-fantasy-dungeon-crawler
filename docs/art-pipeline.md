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

## Правила изображения
- Никаких символов реальных религий и культов: ни крестов, ни нимбов, ни ликов, ни облачений.
  Сюжеты — подземелье, ремесло, алхимия, звери и конструкты.
- `icon` — светский артефакт: железная табличка с пустым овальным углублением.
- `holy_water` называется «Зелье очищающего пламени»: белое пламя, никакой обрядности.

## Остаток покрытия
Покрытие завершено: у каждого существа и каждого предмета есть индивидуальная
картина, `npm run art:check -- --strict` проходит. `items-atlas.jpg` и портреты
`foe-*.jpg` оставлены как fallback на случай новых записей без арта.

## Уже добавленные индивидуальные портреты

Покрытие на текущий момент: монстры 49/49, предметы 135/135.

- все 49 существ: от `imp` и `rat_swarm` до `boss_sphinx` и `boss_devourer`;
- всё боевое снаряжение, аксессуары, реагенты, зелья, свитки и инструменты;
- «Зелье очищающего пламени» (`holy_water`) и предметы истощения
  (`scroll_dispel`, `dispel_powder`);
- всё стартовое снаряжение `start_*` — оружие, броня, обувь, наручи, кольца и амулеты.

После каждой партии: `npm run art:manifest`, `npm run art:check`, `npx tsc --noEmit`, `node --test tests/game.test.cjs`, `npm run build`.
