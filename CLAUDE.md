# CLAUDE.md

## Commands

- `pnpm dev` — start dev server
- `pnpm build` — production build
- `pnpm tsc` — type-check (no emit)
- `pnpm lint` — Biome check + auto-fix
- `pnpm lint-unsafe` — Biome check + unsafe auto-fix
- `pnpm lint:ci` — Biome check only (no writes, used in CI)
- `pnpm test` / `pnpm test:watch` — Vitest (jsdom + Testing Library)
- `pnpm test:coverage` — Vitest with V8 coverage (`src/**`)
- `pnpm test:e2e` — Playwright e2e (builds and starts the app itself)
- `pnpm run fsd` — validate FSD architecture via steiger

## Architecture

Next.js 16 App Router with Feature-Sliced Design (FSD). The app is a
TikTok-style vertical video feed (see `docs/PLAN.md` for the design document);
the home page renders it via `src/pages/feed`.

### FSD layers (`src/`)

```
src/
  app/        — providers (app-providers.tsx wires them together)
  pages/      — feed: page composition with SSR prefetch of the first feed page
  widgets/    — video-feed: scroll-snap scroller, virtualization (spacer pattern),
                preload-manager, drag-to-scroll, debug metrics overlay
  features/   — media-playback: pool of 3 reusable <video> elements + hls.js,
                zustand stores (playback.store, metrics.store), player overlay,
                volume control
  entities/   — media-item: zod schema, mock feed generator, query options
  shared/     — api (React Query client), config, lib (cn()), ui (shadcn components)
```

### FSD rules (enforced by steiger, see `steiger.config.ts`)

- Preset: `fsd.configs.recommended` with overrides:
  - `fsd/public-api: off` and `fsd/no-public-api-sidestep: off` — **no `index.ts`
    barrel files in slices**. Import directly from segment paths, e.g.
    `@/pages/feed/ui/feed-page`. Do not create slice `index.ts` files.
  - `fsd/insignificant-slice: warn` — a slice referenced from only one place
    is a warning, not an error.
  - `fsd/segments-by-purpose: off` — the conventional `providers` segment in
    the app layer would be flagged otherwise.
- Layer imports go strictly downward only:
  pages → widgets → features → entities → shared. A slice must not import from
  its own layer (e.g. entity → entity) or any layer above.
- Slices are organized into segments: `ui/`, `api/`, `model/`, `lib/`, `config/`.

### Next.js routing vs FSD

- App Router lives in root `app/` (not `src/app` — that's the FSD app layer).
- Root `pages/` is a **required stub** (`_document.tsx`, `404.tsx`): it shadows
  the FSD layer `src/pages/` so Next.js doesn't treat it as a Pages Router
  directory. Do not delete it (see `pages/README.md`).
- Route files in `app/` are thin: they import a page composition from
  `@/pages/*` (e.g. `app/page.tsx` → `FeedPage`, with
  `dynamic = 'force-dynamic'` for the SSR prefetch).
- API routes also live in `app/`: `app/api/feed/route.ts` is the mock feed
  endpoint (cursor pagination, zod-validated query, delegates to the
  generator in `src/entities/media-item/api/feed.mock.ts`).
- Root-level route conventions live in `app/`: `not-found.tsx`, `error.tsx`,
  `global-error.tsx`, `robots.ts`, `sitemap.ts`, `manifest.ts`;
  `metadata` is exported from `app/layout.tsx`.
- `typedRoutes` is enabled; route constants live in `src/shared/config/routes.ts`.

### Path aliases

- `@/*` maps to `./src/*`

## Code style (Biome)

- Tabs, indent width 4
- Single quotes, JSX single quotes
- No semicolons (trailing commas everywhere)
- Linter: plain `recommended` preset, no rule overrides (unused imports are a
  warning; a11y rules are active)
- CSS modules enabled, Tailwind directives supported

## Git hooks (Lefthook) & CI

- **pre-commit**: Biome check + auto-fix on staged files
- **pre-push**: type-check (`pnpm tsc`) + FSD validation (`pnpm run fsd`)
- **CI** (`.github/workflows/ci.yml`): lint → tsc → fsd → tests → build → e2e on push/PR

## Testing

- **Vitest** + **Testing Library** (jsdom), config in `vitest.config.ts`
  (`resolve.tsconfigPaths: true` resolves the `@/` alias). `vitest.setup.ts`
  installs an in-memory `localStorage` before each test so zustand's persist
  middleware works with statically imported stores.
- Tests are colocated with slices: `src/**/*.test.{ts,tsx}` — player pool
  (`src/features/media-playback/model/player-pool.test.ts`, mocks `hls.js`
  and stubs `HTMLMediaElement.play/pause`), playback store, preload manager,
  mock feed generator.
- **Playwright** e2e tests live in `e2e/` (`*.spec.ts`), config in
  `playwright.config.ts` — its `webServer` runs `pnpm build-start` locally
  (reusing an already-running server on :3000) and `pnpm start` in CI, where
  the build step has already run. Chromium only by default.

## UI stack

- **shadcn** v4 (base-nova style, Base UI primitives) — components install to
  `src/shared/ui/`. Installed: `button`, `skeleton`, `slider`, `sonner`.
- **Tailwind CSS v4** with OKLCh color system (CSS variables, neutral base).
  Light theme only — there is no dark mode; do not add `dark:` variants.
- **Lucide** icons (e.g. `src/features/media-playback/ui/player-overlay.tsx`)
- **sonner** toasts — `<Toaster />` is mounted in `app/layout.tsx`
  (`src/shared/ui/sonner.tsx`); fire with `toast(...)`
- **class-variance-authority** + **clsx** + **tailwind-merge** for class composition (`cn()` in `src/shared/lib/utils.ts`)

To add a shadcn component: `pnpx shadcn@latest add <component>`

## Data fetching

- **TanStack React Query v5** — `QueryClient` factory at `src/shared/api/query-client.ts`,
  client provider at `src/app/providers/query-provider.tsx`.
- The feed uses `useInfiniteQuery` with cursor pagination: options factory at
  `src/entities/media-item/api/feed.options.ts` (fetches `/api/feed`,
  zod-parses the response). There is no real backend — `app/api/feed/route.ts`
  serves deterministic mock data from
  `src/entities/media-item/api/feed.mock.ts`.
- SSR prefetch of the first page happens in
  `src/pages/feed/ui/feed-page.tsx`: `makeQueryClient` +
  `prefetchInfiniteQuery` (calling the mock generator directly instead of
  going through HTTP) + `dehydrate` + `HydrationBoundary`; the route opts out
  of static prerendering via `dynamic = 'force-dynamic'` in `app/page.tsx`.
- Client-side playback state lives outside React Query, in zustand v5 stores:
  `src/features/media-playback/model/playback.store.ts` (mute/volume,
  persisted to localStorage) and `metrics.store.ts` (TTFF, rebuffering,
  dropped frames — rendered by the `?debug=1` overlay).

## Environment

- Validated via t3-env in `src/shared/config/env.ts`.
- `SITE_URL` (optional, server-only, defaults to `http://localhost:3000`) —
  public origin for robots.txt/sitemap.xml. Those routes are `force-dynamic`,
  so it is read at runtime (swappable per container). The Zod default applies
  at runtime, where validation runs — do not turn these routes static: at
  build time `SKIP_ENV_VALIDATION=1` (Docker) makes t3-env return raw
  `process.env` without defaults.
- `.env.local` is optional; `SKIP_ENV_VALIDATION=1` bypasses validation (used in Docker builds).

## Providers

`AppProviders` at `src/app/providers/app-providers.tsx` wraps the app with:
1. `QueryProvider`

## Build & deploy

- React Compiler enabled (`reactCompiler: true`), `poweredByHeader: false`, `typedRoutes: true`
- Docker: multi-stage `Dockerfile` (standalone output via `DOCKER_BUILD=1`);
  `.env*` files are dockerignored — pass env at runtime
- Node >= 24, pnpm 11
