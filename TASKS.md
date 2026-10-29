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
- [x] LLM fallback swapped from Groq/Gemini/Mistral to Groq/Gemini/OpenRouter/NVIDIA NIM (no accessible Mistral free tier for this project); OpenRouter and NVIDIA NIM both go through the `openai` SDK with a custom `baseURL` since both are OpenAI-compatible, rather than adding dedicated SDKs
- [x] LLM fallback tested against real keys, all four providers in isolation: **Groq** (`openai/gpt-oss-120b`) ✅, **Gemini** (`gemini-flash-lite-latest`) ✅, **OpenRouter** (`openrouter/free`) ✅, **NVIDIA NIM** (`openai/gpt-oss-20b`) ✅ — all four correctly extracted title/ingredients/instructions from sample recipe text
- [x] Root-caused the initial NVIDIA "Function not found for account" failures: NVIDIA grants invocation access **per-model, not account-wide** — a key only works for the specific model whose page you clicked "Get API Key" from on build.nvidia.com. Confirmed by testing: the working `gpt-oss-20b` key still 404s on Nemotron models that appear in the same account's own `/v1/models` listing. Fixed by getting a fresh key from the `gpt-oss-20b` model page specifically.
- [x] First model name picked for both Groq (`llama-3.3-70b-versatile`) and NVIDIA (`meta/llama-3.3-70b-instruct`) turned out to already be deprecated — confirms the model-churn gotcha in PRD section 5 isn't theoretical. Fixed by querying each provider's live `/models` endpoint instead of trusting a remembered name.

## Phase 4: Unit Conversion, FIFO & Shopping List Logic

- [x] Build unit-conversion utility on top of `convert-units` (`src/lib/units/convert.ts`) — handles standard volume/mass units plus a custom lookup for grocery-specific ones `convert-units` doesn't know: bare counts ("2 eggs") via a hand-rolled `ea`/`dz` measure (the installed version supports this at runtime but `@types/convert-units` doesn't declare it, so handled outside the library), a butter "stick" anchored to both volume (8 Tbs) and mass (113g) since those are independent fixed culinary conventions, and non-convertible units (clove, slice, can, package, head, pinch) that only combine with themselves
- [x] Build ingredient-to-product matching (`src/lib/inventory/matchProducts.ts`) and batch-availability summing (`src/lib/inventory/availability.ts`) — both needed before FIFO deduction or shopping-list math can resolve which `products`/`inventory_batches` rows an ingredient refers to
- [x] Wire app-layer calls to `deduct_inventory_fifo()` when a recipe is cooked — `POST /api/recipes/[id]/cook`, one RPC call per ingredient, each reporting its own status (`deducted`/`no_product_match`/`no_inventory`/`unit_mismatch`/`insufficient`) rather than one failure blocking the rest
- [x] Implement shopping-list shortfall calculation (required − available per product) — `GET /api/recipes/[id]/shopping-list`
- [x] Implement store/aisle grouping and cheaper-store tie-breaking using `price_history` — grouped by store, sorted by aisle within each group, cheapest matching product chosen when an ingredient matches products at multiple stores
- [x] Minimal UI (`/recipes/[id]`) with "Cook this recipe" and "Shopping list" buttons to exercise both flows
- [x] **Verified end-to-end against live Supabase data**, not just unit tests: seeded a real product with two inventory batches (2 sticks @ Oct 1, 4 sticks @ Oct 20) and extracted a real recipe needing "1 cup butter, softened":
  - Shopping list correctly omitted butter (3 cups available > 1 cup needed) while listing every other unmatched ingredient
  - Cooking deducted exactly 2 sticks (= 1 cup) from the **older** batch first, leaving the newer batch untouched — FIFO order confirmed
  - Draining inventory further correctly produced `no_inventory`, then `insufficient` (with the RPC's own error message surfaced) once a non-zero-but-insufficient batch existed
  - The failed/insufficient deduction attempt left inventory completely unchanged — confirmed the stored procedure's atomicity holds under a real failure, not just the happy path
- [x] **Found and fixed a real matching bug during this testing, not after:** ingredient-to-product matching originally used plain substring `ilike`, which matched the ingredient "salt" against the product "Unsalted Butter" (the letters "salt" inside "un**salt**ed") and silently deducted the wrong product's inventory when cooking. Switched to Postgres word-boundary regex matching (`\y...\y` via the `imatch`/`~*` operator) to require whole-word containment instead of any substring.

## Phase 5: Pantry Intelligence Features

- [x] Expiry tracking "use soon" view — `GET /api/pantry` (`?days=`, default 3), joins `inventory_batches` to `products`, sorts by `expiry_date` ascending with nulls last, flags `useSoon` per batch
- [x] "What can I cook now" / "almost there" reverse-match view — `src/lib/recipes/readyToCook.ts` + `GET /api/recipes/ready-to-cook`, reusing the same `matchProducts`/`getAvailableQuantity`/unit-conversion logic the cook/shopping-list routes use; "ready" = 0 missing ingredients, "almost" = 1–2 missing
- [x] Price-history sparklines per product — `GET /api/products/[id]/price-history` (`?weeks=`, default 8) plus a minimal inline-SVG `src/components/Sparkline.tsx` (no charting library needed for a single polyline)
- [x] `/pantry` UI — use-soon list with sparklines, ready-to-cook/almost-there recipe lists
- [x] **Verified end-to-end against live Supabase data**: extracted a real food.com recipe (6 ingredients), stocked inventory for 5 of them via `POST /api/inventory` — confirmed the recipe correctly landed in "almost there" with exactly the one genuinely-unmatched ingredient listed; stocked the 6th and confirmed it moved to "ready to cook" with an empty missing list. Also confirmed a batch with an expiry 3 days out was flagged `useSoon: true`, and that two sequential price entries on the same product produced a two-point price-history series.

## Phase 6: Barcode Logging & PWA

- [x] Camera-based barcode scanner — `/pantry/scan`, tries the native `BarcodeDetector` API first (Chrome/Edge/Android), falls back to `@zxing/browser` decoding the same `getUserMedia` video element for Safari/iOS and Firefox, which don't implement `BarcodeDetector`
- [x] Barcode lookup against a free UPC database — `src/lib/barcode/lookupUpc.ts` (Open Food Facts, no API key), `GET /api/barcode/[upc]` checks our own `products.barcode` first (reuses known store/price/aisle) before falling back to Open Food Facts for a bare product name; 404s with `source: "none"` when neither has it, and the scan UI degrades to manual entry with the UPC pre-filled per PRD section 3F
- [x] `POST /api/inventory` — the write path barcode-scanning (and manual pantry logging) actually needed; resolves an existing product by `productId` or upserts by `name`+`store` (mirroring `/api/products`'s upsert), explicitly omitting `barcode` from the upsert payload unless provided so a manual re-entry can't silently null out a previously-scanned barcode
- [x] `manifest.json` + a hand-rolled service worker (`public/sw.js`) for installable, partially-offline use — caches the app shell (static pages) on install, always network-first for `/api/*` since the app is nothing but live Supabase data; `src/proxy.ts` exempted `/manifest.json`, `/sw.js`, and `/icon*` from the password gate so the browser can fetch them unauthenticated
- [x] **Verified end-to-end against live external services and Supabase, not just code review**: looked up a real UPC (Diet Coke, `0049000028911`) against the live Open Food Facts API and got back a real product name; looked up a known-invalid UPC and confirmed a clean 404 with `source: "none"`; logged a batch from that scan via `POST /api/inventory`, then re-looked-up the same UPC and confirmed it now resolves via `source: "products"` (our own table) instead of hitting Open Food Facts again; confirmed a manual price update afterward left the scanned barcode intact rather than nulling it out
- [ ] Actual camera permission/scan flow (`BarcodeDetector` vs. `@zxing/browser` fallback) needs manual verification in a real browser on a real device — this can't be exercised headlessly from the CLI

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
