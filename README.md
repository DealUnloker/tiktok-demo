# Frontend Template

Next.js 16 (App Router) starter with Feature-Sliced Design and strict tooling
out of the box.

## Stack

- **Next.js 16** — App Router, React 19, React Compiler enabled
- **Feature-Sliced Design** — validated with [steiger](https://github.com/feature-sliced/steiger)
- **TanStack React Query v5** — client + SSR-ready `QueryClient` factory wired up
- **Tailwind CSS v4** + **shadcn** (base-nova, Base UI primitives)
- **Biome** — lint + format (tabs, single quotes, no semicolons)
- **Lefthook** — pre-commit lint, pre-push type-check + FSD validation
- **Vitest** + **Testing Library** — colocated component tests
- **Playwright** — e2e tests in `e2e/`
- **GitHub Actions** — lint, type-check, FSD, tests, build on push/PR
- **t3-env** — validated environment variables

## Getting started

```bash
pnpm install
pnpm dev
```

`.env.local` is optional (`cp .env.example .env.local` to customize `SITE_URL`).

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm tsc` | Type-check |
| `pnpm lint` | Biome check + auto-fix |
| `pnpm lint:ci` | Biome check only (CI) |
| `pnpm test` | Run Vitest tests |
| `pnpm test:coverage` | Run Vitest tests with coverage report |
| `pnpm test:e2e` | Run Playwright e2e tests |
| `pnpm run fsd` | Validate FSD layer boundaries |

## Project structure

```
app/       — Next.js App Router routes (thin, import from src/pages)
pages/     — required stub, see pages/README.md
src/
  app/     — providers
  pages/   — page compositions (home)
  shared/  — api (React Query client), config, lib, ui
```

Add `entities/`, `features/`, and `widgets/` layers under `src/` as the app
grows — layer boundaries are enforced by steiger.

## E2E tests

Playwright specs live in `e2e/`. The web server config builds and starts the
app itself (`pnpm build-start`); locally it reuses a server already running on
:3000, and in CI it runs `pnpm start` against the build produced earlier in the
pipeline.

## Docker

```bash
docker build -t frontend-template .
docker run -p 3000:3000 frontend-template
```

Or with Compose (reads env from `.env.local`):

```bash
docker compose up --build
```

## Requirements

- Node >= 24 (`.nvmrc`)
- pnpm 11

## License

[MIT](./LICENSE)
