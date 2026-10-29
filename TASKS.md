# Tasks

Tracks progress against the phases defined in
[`Product Requirements Document.md`](./Product%20Requirements%20Document.md)
section 6. Check items off as they're completed; add sub-items if a phase
needs to be split further once work starts.

## Phase 1: Supabase & Next.js Scaffold

- [x] Scaffold Next.js (App Router, TypeScript, Tailwind, ESLint) project with pnpm
- [x] Install `@supabase/supabase-js` and `convert-units`
- [x] Add server-only Supabase admin client (`src/lib/supabase/admin.ts`, service-role key)
- [x] Add hand-maintained `Database` type (`src/types/database.ts`)
- [x] Write SQL migration for core schema: `products`, `price_history`, `inventory_batches`, `recipes`, `recipe_ingredients`
- [x] Write SQL migration/stored procedure for FIFO deduction (`deduct_inventory_fifo`)
- [x] Add single shared-password auth gate (`src/proxy.ts`, `/login`, `/api/login`)
- [x] Add `.env.example`
- [x] Verify `pnpm build` / `pnpm lint` / `tsc --noEmit` pass clean
- [x] Write project README
- [x] Create a Supabase project and apply migrations (`0001_init_schema.sql`, `0002_fifo_deduct.sql`)
- [x] Confirm the app runs end-to-end locally against the live Supabase project (login → home page, all 5 tables + `deduct_inventory_fifo()` reachable via service-role client)
- [x] Move `node_modules`/`.next` out of the OneDrive-synced tree (symlinked from `~/Library/pnpm/projects/smart-pantry-tracker`) to stop OneDrive from syncing thousands of package files
- [x] Pin `dev`/`build` scripts to `--webpack` — Turbopack refuses to resolve `next` itself through a symlinked `node_modules` outside the workspace root ("hermetic build" restriction); switched Tailwind from the Turbopack-loader config to a standard `postcss.config.mjs` + `@tailwindcss/postcss` to match

## Phase 2: The GitHub Action Pipeline

- [x] Write Python scraping script (Playwright) for Walmart + H-E-B targeted item list (`scripts/scraper/`)
- [x] Export `walmart_data.csv`, `heb_data.csv`, `price_history.csv` to `data/`
- [x] Add `.github/workflows/scraper.yml` (weekly Sunday 2am UTC trigger + manual `workflow_dispatch`)
- [x] Add auto-commit step (`stefanzweifel/git-auto-commit-action`) to reset the 60-day cron-suspension clock
- [x] Add mandatory Supabase sync/keep-alive call — done directly from the Python script (`sync_supabase.py`) via the service-role key rather than a separate Edge Function/API route, since the script already has the scraped data in memory; the weekly upsert itself is the keep-alive ping
- [x] Add unique constraint on `products (name, store)` (`0003_products_unique_constraint.sql`) so the upsert has something to target
- [ ] Set repo secrets: `WALMART_STORE_ID`, `HEB_STORE_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — **user action**
- [ ] Run the workflow once manually (`workflow_dispatch`) to confirm selectors still match live site markup and verify the full pipeline end-to-end — **user action**, see "known limitation" note below
- [ ] (Optional hardening) Add Vercel Cron backup ping to the same keep-alive endpoint — deferred; not needed yet since the Supabase sync above already covers the keep-alive requirement

**Known limitation:** the Walmart/H-E-B CSS selectors in `walmart_scraper.py`
/ `heb_scraper.py` are best-effort against each site's markup as of when
they were written and have **not** been validated against a live bot-check
pass (PRD section 5 flags this as expected, ongoing maintenance, not a
one-time bug). First real run will likely need selector adjustments.

## Phase 3: The Recipe Ingestion Engine

- [ ] Build `/api/recipes` route accepting a URL
- [ ] Implement DB-check-first lookup against `recipes`
- [ ] Implement primary structured-data parser (`recipe-scrapers` or JSON-LD parsing)
- [ ] Implement LLM fallback (current-gen free-tier flash model) with strict JSON-extraction prompt
- [ ] Implement final Readability-style DOM fallback
- [ ] Record `extraction_method` on save

## Phase 4: Unit Conversion, FIFO & Shopping List Logic

- [ ] Build unit-conversion utility on top of `convert-units`, plus small lookup table for grocery-specific units it doesn't cover natively
- [ ] Wire app-layer calls to `deduct_inventory_fifo()` when a recipe is cooked
- [ ] Implement shopping-list shortfall calculation (required − available per product)
- [ ] Implement store/aisle grouping and cheaper-store tie-breaking using `price_history`

## Phase 5: Pantry Intelligence Features

- [ ] Expiry tracking "use soon" view (sort by `expiry_date`, configurable threshold)
- [ ] "What can I cook now" / "almost there" reverse-match view
- [ ] Price-history sparklines per product

## Phase 6: Barcode Logging & PWA

- [ ] Camera-based barcode scanner (`BarcodeDetector` API + fallback lib)
- [ ] Barcode lookup against a free UPC database (e.g. Open Food Facts), graceful fallback to manual entry
- [ ] `manifest.json` + service worker for installable, partially-offline use

## Phase 7: The Frontend UI

- [ ] Pantry dashboard (expiry flags, price sparklines)
- [ ] Recipe search/input bar
- [ ] "Ready to Cook" view
- [ ] Shopping List view (grouped by store, sorted by aisle)

---

**Legend:** `[x]` done · `[ ]` not started. Items aren't split into
in-progress state here — use this file for coarse status; finer-grained
in-session progress is tracked via the assistant's todo list during active work.

## Environment notes

- **Package manager:** pnpm (`~/Library/pnpm`). `node_modules` and `.next` are
  symlinked from `~/Library/pnpm/projects/smart-pantry-tracker/` because the
  project folder lives inside OneDrive — this keeps OneDrive from trying to
  sync the full dependency tree (thousands of small files/symlinks it handles
  poorly), while Node's module resolution still works through the symlink.
- **Turbopack is disabled.** It refuses to resolve packages through a
  symlinked `node_modules` outside its detected workspace root (a deliberate
  "hermetic build" restriction) — both `next dev` and `next build` failed
  with `Could not find the Next.js package` until pinned to `--webpack` in
  `package.json`. If `node_modules` is ever moved back inside the project
  folder, Turbopack can be re-enabled by removing `--webpack` from the
  scripts and restoring the `turbopack.rules` Tailwind loader in
  `next.config.ts`.
