# Smart Pantry and Grocery Tracker

A personal, multi-device web app that tracks home grocery inventory with FIFO
batch logic, parses recipes from URLs, and generates aisle-sorted shopping
lists for local H-E-B and Walmart stores. Full scope, schema, and rationale
live in [`Product Requirements Document.md`](./Product%20Requirements%20Document.md).
Day-to-day progress is tracked in [`TASKS.md`](./TASKS.md).

## Stack

Next.js (App Router, TypeScript) · Supabase (Postgres) · Tailwind CSS ·
Vercel Cron (daily Supabase keep-alive) · `convert-units` for unit
conversion · `cheerio`/`@mozilla/readability`/`jsdom` + Groq/Gemini/OpenRouter/NVIDIA NIM
for recipe extraction (last two via the `openai` SDK with a custom `baseURL`,
both being OpenAI-compatible).

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
- Optionally, any combination of `GROQ_API_KEY` / `GEMINI_API_KEY` /
  `OPENROUTER_API_KEY` / `NVIDIA_API_KEY` for the recipe-extraction LLM
  fallback (section below) — all free-tier, all optional, each tried only
  if its key is set.

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

## Recipe ingestion (Phase 3)

`/recipes` takes a URL and `POST`s it to `/api/recipes`, which:

1. Checks `recipes` by `source_url` first — an exact match is returned
   immediately (`cached: true`), no re-fetch.
2. Otherwise fetches the page and tries, in order:
   - **Structured extraction** (`src/lib/recipes/extractStructured.ts`) —
     parses schema.org `Recipe` JSON-LD via `cheerio`. No API cost, no rate
     limit, succeeds on most recipe sites.
   - **LLM fallback** (`extractLLM.ts`) — tries Groq, then Gemini, then
     OpenRouter, then NVIDIA NIM, skipping any provider without an API key
     configured. All four confirmed working against real keys. NVIDIA NIM
     has a quirk worth knowing: it grants invocation access per-model, not
     account-wide — a key only works for whichever model's page on
     build.nvidia.com you clicked "Get API Key" from (ours is scoped to
     `openai/gpt-oss-20b`; other models 404 with "Function not found for
     account" even though they're in the same account's model listing).
   - **Readability fallback** (`extractReadability.ts`) — `@mozilla/readability`
     + `jsdom` for clean article text, splitting on "Ingredients"/"Instructions"
     headings when present.
3. Saves the result to `recipes`/`recipe_ingredients`, recording which
   engine succeeded in `extraction_method`.

All three extraction paths, and all four LLM providers, are verified working
against real requests (see [`TASKS.md`](./TASKS.md)).

## Unit conversion, FIFO deduction & shopping list (Phase 4)

`src/lib/units/convert.ts` converts between recipe units and pantry storage
units (e.g. "2 cups" → the ounces a batch is tracked in), on top of
`convert-units` plus a small custom table for units it doesn't know (bare
counts, a butter "stick", and non-convertible grocery units like "clove"
that only combine with themselves).

`src/lib/inventory/matchProducts.ts` resolves a recipe ingredient's
free-text name ("butter, softened") to matching `products` rows ("Unsalted
Butter") via case-insensitive **whole-word** regex matching — not plain
substring, which live testing caught matching "salt" against "Unsalted
Butter" and silently deducting the wrong product.

- **`POST /api/recipes/[id]/cook`** — for each ingredient, converts the
  required quantity into the matched product's inventory unit and calls the
  Phase 1 `deduct_inventory_fifo()` stored procedure. Each ingredient
  reports its own status independently (`deducted` / `no_product_match` /
  `no_inventory` / `unit_mismatch` / `insufficient`) rather than one failure
  blocking the rest.
- **`GET /api/recipes/[id]/shopping-list`** — sums available inventory per
  ingredient (converted to its required unit), computes the shortfall,
  picks the cheapest matching product per shortfall item, and groups the
  result by store/aisle.
- **`/recipes/[id]`** — minimal UI with "Cook this recipe" and "Shopping
  list" buttons.

Verified end-to-end against live Supabase data (not just unit-tested): a
two-batch product correctly drained the older batch first, a shopping list
correctly omitted an ingredient that was already fully stocked, and a
failed/insufficient deduction left inventory completely unchanged,
confirming the stored procedure's atomicity under a real failure.

## Project structure

```
src/
  app/
    products/                    Manual price/aisle entry UI
    recipes/                     Recipe URL input + saved-recipes list UI
    recipes/[id]/                Cook / shopping-list UI for one recipe
    api/products/                 Upsert products + append price_history
    api/recipes/                  DB-check-first, structured/LLM/Readability chain
    api/recipes/[id]/cook/        Per-ingredient FIFO deduction
    api/recipes/[id]/shopping-list/  Shortfall calculation, grouped by store
    api/cron/keep-alive/          Daily Supabase keep-alive (Vercel Cron)
  lib/
    supabase/       Server-only Supabase client (admin.ts, service-role key)
    recipes/        Extraction engines: extractStructured, extractLLM,
                    extractReadability, parseIngredientLine, types
    units/          convert.ts - recipe unit <-> pantry storage unit conversion
    inventory/      matchProducts.ts, availability.ts - ingredient-to-product
                    resolution shared by the cook and shopping-list routes
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

Phases 1–4 complete and verified end-to-end against live Supabase data:
scaffold + auth, manual price entry + keep-alive, recipe ingestion (all
three extraction paths, all four LLM providers), and unit conversion/FIFO
deduction/shopping list. Nothing is deployed to Vercel yet — everything so
far only runs locally. See [`TASKS.md`](./TASKS.md) for the full
phase-by-phase breakdown.
