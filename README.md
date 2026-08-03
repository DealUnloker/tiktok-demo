# Вертикальная видео-лента

Тестовое задание: mobile-first лента коротких видео в духе TikTok / Reels /
Shorts — скролл по одному ролику, автовоспроизведение активного, предзагрузка
соседних, виртуализация на любую длину ленты.

- **Демо:** [tiktok.dealunloker.com](https://tiktok.dealunloker.com) — лента на
  главной странице; [`?debug=1`](https://tiktok.dealunloker.com/?debug=1)
  показывает метрики воспроизведения (TTFF, ребуферизация, dropped frames).
- **Технический план и обоснование решений:** [docs/PLAN.md](./docs/PLAN.md).

## Стек

Next.js 16 (App Router, React 19 + Compiler), TypeScript, hls.js,
TanStack Query v5, Zustand v5, Tailwind CSS v4 + shadcn, Feature-Sliced Design
(steiger), Biome, Vitest + Playwright.

## Где что лежит

Проект организован по FSD; импорты между слоями идут строго вниз
(pages → widgets → features → entities → shared). Интересные места:

```
app/api/feed/route.ts        — тестовый эндпоинт ленты (cursor-пагинация, zod)
src/pages/feed/              — композиция страницы: SSR-префетч первой страницы
                               (prefetchInfiniteQuery + HydrationBoundary)
src/widgets/video-feed/      — скроллер на CSS scroll-snap, виртуализация
                               (spacer-паттерн, окно ±3), preload-manager,
                               drag-to-scroll мышью, debug-оверлей метрик
src/features/media-playback/ — пул из 3 переиспользуемых <video> + hls.js,
                               Zustand-сторы (playback, metrics), оверлей
                               плеера, контрол громкости
src/entities/media-item/     — zod-схема, мок-генератор ленты, query options
src/shared/                  — ui (shadcn), React Query client, конфиг
```

Реального бэкенда нет: `app/api/feed` детерминированно генерирует элементы
ленты из пула публичных CORS-доступных HLS-потоков
(`src/entities/media-item/api/feed.mock.ts`).

## Запуск

```bash
pnpm install
pnpm dev
```

| Команда | Описание |
| --- | --- |
| `pnpm dev` | Дев-сервер |
| `pnpm build` | Продакшен-сборка |
| `pnpm test` | Юнит-тесты (Vitest, jsdom) |
| `pnpm test:e2e` | E2e-тесты (Playwright, сам собирает и запускает приложение) |
| `pnpm lint` | Biome check + автофикс |
| `pnpm tsc` | Проверка типов |
| `pnpm run fsd` | Валидация границ FSD-слоёв (steiger) |

## Тесты

- **Юнит (Vitest + Testing Library)** — колокированы со слайсами
  (`src/**/*.test.ts`): пул плееров и его жизненный цикл
  (`player-pool.test.ts`), стратегия предзагрузки
  (`preload-manager.test.ts`), стор воспроизведения
  (`playback.store.test.ts`), мок-генератор ленты (`feed.mock.test.ts`).
- **E2e (Playwright)** — `e2e/feed.spec.ts`: ограниченный DOM при
  виртуализации, пошаговая навигация по ленте, бесшовная подгрузка следующей
  страницы.

## Требования

Node >= 24, pnpm 11. `.env.local` опционален
(`cp .env.example .env.local` — настроить `SITE_URL`).
