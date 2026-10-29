# Smart Pantry and Grocery Tracker

A personal, multi-device web app that tracks home grocery inventory with FIFO
batch logic, parses recipes from URLs, and generates aisle-sorted shopping
lists for local H-E-B and Walmart stores. Full scope, schema, and rationale
live in [`Product Requirements Document.md`](./Product%20Requirements%20Document.md).
Day-to-day progress is tracked in [`TASKS.md`](./TASKS.md).

## Stack

Next.js (App Router, TypeScript) · Supabase (Postgres) · Tailwind CSS ·
Vercel Cron (daily Supabase keep-alive) · `convert-units` for unit
conversion.

Single-user app: there's no Supabase Auth / multi-tenant login, just one
shared password gated by `src/proxy.ts`.

Grocery price/aisle data is entered manually via `/products`, not scraped —
Walmart and H-E-B both actively block automated access (confirmed by
testing, see PRD section 5), and neither has a free public API. A Playwright
scraper pipeline was built and tried first; it's gone now.

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
- Any random string for `CRON_SECRET` (set the same value in Vercel's
  project env vars once deployed — it's how `/api/cron/keep-alive`
  authenticates Vercel Cron's requests).

**Gotcha:** Supabase free-tier projects auto-pause after ~7 days with no
activity. The daily Vercel Cron job hitting `/api/cron/keep-alive` exists
specifically to prevent this — see PRD section 5.

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
| `0003_products_unique_constraint.sql` | Unique `(name, store)` constraint on `products`, needed by the manual-entry upsert |

## Manual price entry & keep-alive (Phase 2)

`/products` is a small form for updating prices/aisles by hand — the
free/legal alternative to scraping (PRD section 5). Submitting it calls
`POST /api/products`, which upserts into `products` and appends to
`price_history`.

`/api/cron/keep-alive`, wired up in `vercel.json` as a daily Vercel Cron
job, does a trivial Supabase read so the free-tier project doesn't
auto-pause. It's exempted from the `/src/proxy.ts` password gate (cron
requests carry no login cookie) and instead checks a `CRON_SECRET` bearer
token.

## Project structure

```
src/
  app/
    products/           Manual price/aisle entry UI
    api/products/        Upsert products + append price_history
    api/cron/keep-alive/ Daily Supabase keep-alive (Vercel Cron)
  lib/supabase/   Server-only Supabase client (admin.ts, service-role key)
  types/          Hand-maintained Database type for Supabase queries
  proxy.ts        Shared-password auth gate (Next.js 16 "proxy" convention,
                  formerly "middleware"); exempts /api/login and /api/cron
supabase/
  migrations/     SQL migrations, applied in order
vercel.json       Daily cron schedule for /api/cron/keep-alive
```

## Scripts

```bash
pnpm dev     # start the dev server
pnpm build   # production build
pnpm lint    # eslint
```

## Status

Phase 1 (Supabase & Next.js scaffold) complete. Phase 2 pivoted from an
automated scraper (blocked by both retailers' bot-detection, confirmed via
testing) to manual price entry + Vercel Cron keep-alive — code complete,
needs the new migration applied and `CRON_SECRET` set in Vercel. See
[`TASKS.md`](./TASKS.md) for the full phase-by-phase breakdown.
