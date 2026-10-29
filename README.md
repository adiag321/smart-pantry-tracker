# Smart Pantry and Grocery Tracker

A personal, multi-device web app that tracks home grocery inventory with FIFO
batch logic, parses recipes from URLs, and generates aisle-sorted shopping
lists for local H-E-B and Walmart stores. Full scope, schema, and rationale
live in [`Product Requirements Document.md`](./Product%20Requirements%20Document.md).
Day-to-day progress is tracked in [`TASKS.md`](./TASKS.md).

## Stack

Next.js (App Router, TypeScript) · Supabase (Postgres) · Tailwind CSS ·
GitHub Actions + Playwright (weekly scrape pipeline, added in Phase 2) ·
`convert-units` for unit conversion.

Single-user app: there's no Supabase Auth / multi-tenant login, just one
shared password gated by `src/proxy.ts`.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase keys + a password, see below
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to
`/login` until `APP_SHARED_PASSWORD` is set and entered.

**Note:** `dev`/`build` run with `--webpack`, not Turbopack. The project
folder lives inside OneDrive, so `node_modules`/`.next` are symlinked out to
`~/Library/pnpm/projects/smart-pantry-tracker/` to avoid OneDrive syncing the
whole dependency tree — and Turbopack refuses to resolve packages through a
symlinked `node_modules` outside the workspace root. Details in
[`TASKS.md`](./TASKS.md#environment-notes).

## Environment variables

See [`.env.example`](./.env.example). You'll need:

- A Supabase project (Project Settings → API) for `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Any value of your choosing for `APP_SHARED_PASSWORD`.

**Gotcha:** Supabase free-tier projects auto-pause after ~7 days with no
activity. Once the Phase 2 pipeline is running, its weekly sync doubles as a
keep-alive ping — see PRD section 5.

## Database migrations

SQL migrations live in [`supabase/migrations`](./supabase/migrations) and are
applied in filename order. Run them against your Supabase project via either:

- The Supabase SQL Editor (dashboard → SQL Editor → paste each file, in
  order), or
- The [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase db push`
  (requires `supabase link` first).

Current migrations:

| File | Adds |
|---|---|
| `0001_init_schema.sql` | `products`, `price_history`, `inventory_batches`, `recipes`, `recipe_ingredients` |
| `0002_fifo_deduct.sql` | `deduct_inventory_fifo()` — atomic oldest-batch-first deduction |
| `0003_products_unique_constraint.sql` | Unique `(name, store)` constraint on `products`, needed by the Phase 2 scraper's upsert |

## Weekly data pipeline (Phase 2)

`.github/workflows/scraper.yml` runs `scripts/scraper/main.py` every Sunday
at 2am UTC (or on demand via `workflow_dispatch`): scrapes the item list in
`scripts/scraper/items.yaml` against Walmart and H-E-B, writes CSVs to
`data/`, upserts into Supabase, and auto-commits the CSVs back to `main`
(which is also what keeps GitHub from disabling the schedule after 60 days
of inactivity — see PRD section 5).

Requires these repo secrets (Settings → Secrets and variables → Actions):
`WALMART_STORE_ID`, `HEB_STORE_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
See [`scripts/scraper/README.md`](./scripts/scraper/README.md) for how to
find your store IDs and run it locally.

## Project structure

```
src/
  app/            Next.js App Router pages & API routes
  lib/supabase/   Server-only Supabase client (admin.ts, service-role key)
  types/          Hand-maintained Database type for Supabase queries
  proxy.ts        Shared-password auth gate (Next.js 16 "proxy" convention,
                  formerly "middleware")
supabase/
  migrations/     SQL migrations, applied in order
scripts/scraper/  Python/Playwright weekly scrape pipeline (Phase 2)
data/             CSV output from the weekly scrape, auto-committed
.github/workflows/scraper.yml   Weekly schedule + auto-commit
```

## Scripts

```bash
pnpm dev     # start the dev server
pnpm build   # production build
pnpm lint    # eslint
```

## Status

Phase 1 (Supabase & Next.js scaffold) complete. Phase 2 (GitHub Action
pipeline) code complete, not yet run against live sites — needs repo
secrets set and a first `workflow_dispatch` run to validate scraper
selectors. See [`TASKS.md`](./TASKS.md) for the full phase-by-phase
breakdown.
