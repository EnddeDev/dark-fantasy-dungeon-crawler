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

## Онлайн-режим

В игре есть аккаунты (логин и пароль) и общий сервер: друзья, рынок снаряжения, обмен вещами,
дуэли с 20 секундами на ход, общий чат и личные сообщения для друзей.

```bash
npm run server   # API и база SQLite на порту 8787
npm run dev      # клиент на 5173, запросы /api уходят на сервер
```

Всё вместе на одном адресе (и так же разворачивается публично):

```bash
npm run build    # клиент в dist/
npm run start    # сервер отдаёт и игру, и /api на порту 8787
```

Для облака в репозитории есть `Dockerfile` и `render.yaml`: платформа соберёт контейнер,
поднимет сервер и сохранит базу на диске `/data`.

Если сервер недоступен (например, на GitHub Pages), игра автоматически работает как раньше —
соло, с сохранением в браузере. Подробности: [docs/online.md](docs/online.md).
Схема для внешнего BaaS (Supabase/Postgres): [supabase/README.md](supabase/README.md).

## Архитектура

Код разделён по MVC: `src/model` хранит состояние и сохранения, `src/controllers` принимает команды,
`src/views` и `src/components` отображают интерфейс. Доменные правила лежат в `src/game`,
сетевой слой — `src/net`, серверная часть — `server/`.
Подробнее: [docs/architecture.md](docs/architecture.md).

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
