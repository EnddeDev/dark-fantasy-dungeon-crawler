# Архитектура: ООП + MVC

Проект разделён на три слоя, чтобы новые механики добавлялись без роста «божественного» компонента.

```text
src/
├─ model/          # Model: состояние, сохранения, фабрики, чистые правила
│  ├─ GameModel.ts        # observable-хранилище снимка GameState
│  ├─ SaveRepository.ts   # единственный доступ к localStorage / MemoryStorage
│  ├─ PlayerFactory.ts    # создание героя и миграция сохранений
│  ├─ pricing.ts          # общие правила цен
│  └─ types.ts            # DTO снимка состояния
├─ controllers/    # Controller: команды приложения
│  ├─ GameController.ts   # экраны, вылазка, смерть, спуск, сохранение
│  ├─ LobbyController.ts  # характеристики, лавка, арсенал, ремёсла, горн
│  ├─ DungeonController.ts# шаги, маршрут, двери, ловушки, события, полевые предметы
│  └─ BattleController.ts # действия боя, победа, побег, поражение
├─ views/          # View: React-экраны и адаптеры ввода
│  ├─ GameView.tsx        # компоновка лобби/подземелья/боя
│  ├─ TitleView.tsx       # титульный экран
│  ├─ ModalView.tsx       # модальные окна
│  └─ hooks/              # подписка на Model, клавиатура, автопоход
├─ components/     # переиспользуемые View-компоненты (Lobby, Dungeon, BattleView, Rail…)
└─ game/           # доменные правила и контент (battle, content, world, maze…)
```

## Поток данных

1. **View** получает снимок `GameState` через `useSyncExternalStore` и вызывает команды Controller.
2. **Controller** проверяет команду, вызывает доменные правила из `src/game` и обновляет **Model**.
3. **Model** рассылает новый снимок подписчикам; React перерисовывает только затронутые View.
4. **SaveRepository** пишет прогресс только в лобби, чтобы риски вылазки не сохранялись при перезагрузке.

## Правила расширения

- Новая механика боя: правило в `src/game/battle.ts` или соседнем модуле, команда в `BattleController`, отображение в `BattleView`.
- Новый экран: добавить `Screen` в `model/types.ts`, метод в `GameController`, компонент в `views/`.
- Новый предмет/враг/биом: контент в `src/game/content.ts`, `world.ts`, `biomes.ts`; контроллеры менять не нужно, если команда уже существует.
- Новый эффект: правило в `gearEffects`/`statusEffects`/`enemyEffects`, описание для View; контроллеры остаются прежними.
- Сохранения: новые поля добавлять в `PlayerFactory.restore` и `SaveRepository`, не в React-компоненты.

## Тесты

- `tests/game`, `stats`, `biomes`, `expansion` проверяют доменные правила.
- `tests/ui`, `guide` проверяют SSR-разметку View.
- `tests/mvc` проверяет команды Controller, observable Model и репозиторий сохранений без браузера.
