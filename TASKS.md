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
- [x] Apply `0003_products_unique_constraint.sql` against the live Supabase project — verified via direct upsert test (constraint present, update-not-duplicate behavior confirmed) and via the real `/api/products` HTTP route end-to-end
- [x] Clean up now-unused repo secrets (`WALMART_STORE_ID`, `HEB_STORE_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) on GitHub — no workflow needs them anymore
- [ ] Deploy to Vercel and set env vars there (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SHARED_PASSWORD`, `CRON_SECRET`) — **user action**; app currently only runs locally, nothing is live on the internet yet

## Phase 3: The Recipe Ingestion Engine

- [x] Build `/api/recipes` route (`GET` lists saved recipes, `POST` accepts a URL)
- [x] Implement DB-check-first lookup against `recipes` by `source_url` (verified: second POST of the same URL returns `cached: true`, no re-fetch)
- [x] Implement primary structured-data parser — JSON-LD extraction via `cheerio` (`src/lib/recipes/extractStructured.ts`), not Python `recipe-scrapers` (app is single-codebase TypeScript); handles `@graph`/`mainEntity` wrappers and the three `recipeInstructions` shapes schema.org allows
- [x] Implement shared best-effort ingredient-line parser (`parseIngredientLine.ts`) — splits "2 cups milk" into `{name, amount, unit}`; used by both the structured and Readability paths
- [x] Implement multi-provider LLM fallback (`extractLLM.ts`) — tries Groq, then Gemini, then Mistral, skipping any without an API key configured; strips markdown code-fences models sometimes wrap JSON in
- [x] Implement final Readability-style DOM fallback (`extractReadability.ts`) — `@mozilla/readability` + `jsdom`, splits on "Ingredients"/"Instructions" headings when present
- [x] Record `extraction_method` on save (`structured` / `llm` / `readability`)
- [x] Build minimal `/recipes` UI page (input bar + saved-recipes list) to exercise the flow
- [x] Verified end-to-end against a real recipe URL (food.com) — structured path succeeded, HTML entities decoded correctly (`&deg;` → `°`), 9/9 ingredients parsed with sane `{amount, unit, name}` splits, cache-hit path confirmed on second request
- [x] Readability fallback verified via synthetic HTML test — correctly splits Ingredients/Instructions headings, parses quantities/units, and extracts the page `<title>`
- [ ] LLM fallback path is implemented but **not yet tested against a live provider** — none of Groq/Gemini/Mistral API keys are configured yet, so this code path has only been exercised by the "no provider configured → falls through to Readability" branch, not a real provider call. Needs a real key set in `.env.local` and a test against a site with no JSON-LD to validate — **user action** to obtain a key

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
