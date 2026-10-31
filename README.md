# СУМРАК — хроники покорителя подземелья

Браузерная однопользовательская RPG на React + TypeScript + Vite. Прогресс хранится локально в браузере каждого игрока.

## Играть онлайн

Публичная версия публикуется через GitHub Pages:

**https://enddedev.github.io/dark-fantasy-dungeon-crawler/**

Ссылку можно отправлять друзьям. У каждого игрока своё сохранение в его браузере; общий сервер и регистрация не нужны.

## Локальный запуск

```bash
npm ci
npm run dev
```

Откройте адрес, который покажет Vite (обычно `http://localhost:5173`).

## Проверки и сборка

```bash
npx tsc --noEmit
npm test
npm run build
npm run preview
```

Готовая статическая сборка появляется в `dist/`. Благодаря `vite-plugin-singlefile` основные JS и CSS встроены в `dist/index.html`.

## Публикация

Workflow `.github/workflows/deploy-pages.yml` автоматически проверяет типы, запускает тесты, собирает игру и публикует её на GitHub Pages при push в `main`. Также его можно запустить вручную: **Actions → Deploy game to GitHub Pages → Run workflow**.

В настройках репозитория GitHub Pages должен использовать источник **GitHub Actions**. Workflow включает Pages автоматически, если у него есть необходимые права (`pages: write`, `id-token: write`).
