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

## Phase 2: Manual Data Entry & Keep-Alive

**Pivot:** originally scoped as a GitHub Actions + Playwright scraper. Built
and run against live Walmart/H-E-B — both blocked it outright (Walmart:
press-and-hold Arkose/FunCaptcha challenge; H-E-B: Akamai bot-manager block
page), confirmed from a residential IP too so it wasn't just GitHub's
datacenter IPs being flagged. Walmart's real API needs Seller/Solution-Provider
partner approval (not available to an individual); H-E-B has no public API.
Scraper code removed entirely rather than pursuing stealth/evasion
techniques — see PRD section 5 for the full writeup.

- [x] Remove `scripts/scraper/`, `.github/workflows/scraper.yml`, `data/`
- [x] Add unique constraint on `products (name, store)` (`0003_products_unique_constraint.sql`) — now backs the manual-entry upsert instead of a scraper sync
- [x] Build `/products` manual price/aisle entry form (`src/app/products/page.tsx`)
- [x] Build `/api/products` route — `GET` lists products, `POST` upserts into `products` and appends to `price_history`
- [x] Build `/api/cron/keep-alive` route, secured with `CRON_SECRET` bearer token, exempted from the password-gate proxy
- [x] Add `vercel.json` with a daily Vercel Cron job hitting the keep-alive route
- [ ] Apply `0003_products_unique_constraint.sql` against the live Supabase project — **user action**, added after the project was first set up
- [ ] Set `CRON_SECRET` in Vercel's project environment variables (same value as local `.env.local`) once deployed — **user action**, needed before the cron job will authenticate successfully
- [ ] Clean up now-unused repo secrets `WALMART_STORE_ID` / `HEB_STORE_ID` on GitHub

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
