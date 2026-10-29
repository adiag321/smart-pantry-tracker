# Smart Pantry and Grocery Tracker — Product Requirements Document

## 1. Project Overview & Objectives

A personal, multi-device web application designed to manage home grocery inventory using a First-In-First-Out (FIFO) method, store and parse recipes, and generate aisle-sorted shopping lists for local H-E-B and Walmart stores. The system uses a hybrid scraper/AI approach for recipe extraction (structured-data parsing first, LLM fallback second). Grocery price/aisle data is entered manually on a weekly cadence rather than scraped — see section 3A for why.

Beyond the original scope, the app also helps answer "what can I cook with what I already have," tracks expiry dates (not just purchase dates), keeps a price history so trends are visible, supports fast barcode-based pantry logging, and is installable as a PWA for phone use.

Single-user by design — no multi-tenant auth system is needed.

## 2. Tech Stack (100% Free Tier)

| Layer | Choice | Notes / Gotchas |
|---|---|---|
| Frontend & API Routes | Next.js (App Router, React) | — |
| Hosting | Vercel (Hobby tier) | Permanently free for non-commercial personal projects. Hobby plan includes Vercel Cron (max 1 trigger/day), used for the Supabase keep-alive ping (section 3A). |
| Database & Auth | Supabase (PostgreSQL, REST API) | **Gotcha:** free-tier projects auto-pause after ~7 days of inactivity. The daily keep-alive cron (section 3A) exists specifically to prevent this. |
| Grocery price/aisle data | **Manual weekly entry** via an in-app form (`/products`), not a scraper | Walmart and H-E-B both actively block automated/headless-browser access — confirmed by direct testing, not just theory (section 5). Walmart returns an Arkose/FunCaptcha "press and hold" challenge page before any content loads; H-E-B returns an Akamai bot-manager block page. Walmart's real product/pricing API exists but requires Seller/Solution-Provider partner approval with a reviewed business plan, not available to an individual. H-E-B has no public API at all. Commercial scraping-as-a-service wrappers (SerpApi, Zinc, etc.) just outsource the same scraping and cost money, breaking the free-tier constraint. Manual entry was chosen as the only option that is actually free, legal, and durable. |
| Recipe parsing | JSON-LD structured-data extraction (Node, `cheerio`) as **primary**, multi-provider LLM as **fallback**, Readability text extraction as **last resort** | `recipe-scrapers` (Python) was in the original design, but since the whole app is a single Next.js/TypeScript codebase, equivalent schema.org `Recipe` JSON-LD extraction is implemented directly in Node instead of standing up a separate Python service for just this. Functionally the same approach: most recipe sites embed structured data, so this succeeds with no API cost and no rate limits on the large majority of sites. |
| AI/Parsing fallback | Multi-provider: Groq, then Gemini, then Mistral (`src/lib/recipes/extractLLM.ts`) | Each provider is only tried if its API key env var is set, so the fallback chain scales to however many free-tier accounts you set up — zero configured providers just skips straight to the Readability fallback rather than erroring. Default models: Groq `llama-3.3-70b-versatile`, Gemini `gemini-flash-latest`, Mistral `mistral-small-latest` (all overridable via env vars — see section 5 on model-name churn). |
| Unit conversion | `convert-units` (npm) | Use an existing, tested conversion library instead of hand-writing `cupsToOunces()`-style helpers — smaller surface area for unit-math bugs. |
| Barcode lookup | A free barcode/UPC lookup API (e.g. Open Food Facts) | Used only for the pantry-logging feature (section 3F); no paid tier required. |
| Auth | None / single static session | Single-user app — full Supabase Auth (multi-user rows, RLS policies, signup flows) is unnecessary overhead. A single shared password gate (HTTP Basic Auth at the edge, or one Vercel environment-variable-backed login) is sufficient. |

## 3. Core Features & Logic Flows

### A. Manual Grocery Data Entry & Supabase Keep-Alive

**History:** the original design called for a GitHub Actions + Playwright pipeline to scrape Walmart and H-E-B weekly. That was built, deployed, and run against the live sites — both blocked it outright before any page content loaded (Walmart: Arkose/FunCaptcha "press and hold" challenge; H-E-B: Akamai bot-manager block page, `errorCode: 15`). This is deliberate anti-automation, not a selector bug or an IP-reputation issue (confirmed by re-running the same scraper from a residential IP, not just GitHub's datacenter runners). Walmart's actual product/pricing API requires Seller/Solution-Provider approval unavailable to an individual; H-E-B has no public API. The scraper was removed rather than built out further to defeat bot-detection, since that would mean deliberately circumventing an access control the retailer intentionally put up.

**Current design:**

1. **Manual entry:** `/products` in the app is a simple form — product name, store (Walmart/HEB), aisle, price. Submitting it upserts into `products` (keyed on `(name, store)`) and appends a row to `price_history`. Takes a couple of minutes once a week for whatever was actually bought.
2. **Supabase keep-alive (still needed, now independent of any scrape):** without the GitHub Actions pipeline, nothing else was touching the database regularly, and Supabase free-tier projects auto-pause after ~7 days idle. `vercel.json` defines a Vercel Cron job hitting `/api/cron/keep-alive` daily, which does a trivial read. The route is exempted from the shared-password proxy gate (Vercel Cron requests carry no login cookie) and instead checks a `CRON_SECRET` bearer token that Vercel sends automatically for cron invocations, so the endpoint isn't left open to the public internet.

### B. Intelligent Recipe Extraction (Scraper-first, LLM Fallback)

When the user inputs a recipe URL or a text query:

1. **Database Check:** `POST /api/recipes` first queries `recipes` by `source_url`. If found, return the cached row immediately (`cached: true` in the response) — no re-fetch, no re-parsing.
2. **Primary Engine (Structured Data Parser):** If not cached, fetch the raw HTML and run it through `extractStructured()` (`src/lib/recipes/extractStructured.ts`), which walks every `<script type="application/ld+json">` block (including `@graph`/`mainEntity` wrappers some sites use) looking for a schema.org `Recipe` node. `recipeInstructions` is flattened from its several possible shapes (plain string, array of strings, array of `HowToStep`/`HowToSection` objects); `recipeIngredient` lines are run through a shared best-effort parser (`parseIngredientLine.ts`) that splits a free-text line like "2 cups whole milk" into `{name, amount, unit}` via leading-quantity and known-unit regexes. No external API call, no rate limit.
3. **Fallback Engine (multi-provider LLM):** If no structured data is found, `extractLLM()` sends the page's visible text (HTML stripped via `cheerio`, truncated to ~12k chars) to each *configured* provider in turn — Groq, then Gemini, then Mistral, skipping any without an API key set — with the strict system prompt: *"Extract the recipe title, instructions, and ingredients. Return ONLY a valid JSON object with keys: title, instructions, ingredients (array of objects with name, amount, unit)."* A provider that errors, rate-limits, or returns unparseable JSON is caught and the next one is tried; markdown code-fence wrapping around the JSON (a common model quirk despite the prompt) is stripped before parsing.
4. **Second Fallback (Readability-style DOM parser):** If every configured LLM provider fails (or none are configured), `extractReadability()` parses the page with `@mozilla/readability` + `jsdom` for clean article text, then looks for "Ingredients"/"Instructions" section headings in the plain text to split ingredients from instructions. If those headings aren't found, the full article text is saved as `instructions` with empty `ingredients` — the user still gets something readable rather than nothing.
5. **Storage:** The successfully parsed recipe is saved to `recipes` (with `extraction_method` recording which engine produced it: `structured` / `llm` / `readability`) and `recipe_ingredients`, regardless of which engine succeeded.

### C. Unit Conversion Engine

A utility module (built on `convert-units`) within the Next.js backend that maps recipe measurements to purchasing units.

- Converts volumetric recipe units (tablespoons, cups) to standard purchasing units (ounces, liters, grams).
- Example: Recipe requires 2 cups of milk → engine converts 2 cups → 16 fl oz → compares against a 1-gallon (128 fl oz) inventory item.
- Falls back to a small custom lookup table only for grocery-specific units `convert-units` doesn't know natively (e.g. "1 head of lettuce," "1 can").

### D. Pantry Inventory (FIFO)

Inventory is tracked by batches (purchase dates) rather than a single flat quantity, so the oldest stock is always used first.

- When groceries are purchased, a new batch row is added with the current `purchase_date` (and optional `expiry_date`, see section 3E).
- When a recipe is cooked, the system deducts the required quantities from the batch with the oldest `purchase_date` first.
- If the oldest batch hits 0, it rolls over to deduct from the next oldest batch.
- **Implementation note:** deduction across one or more batches must run as a single PostgreSQL transaction/stored procedure (`plpgsql` function), not as sequential app-layer read-then-write calls, to avoid race conditions if the app is used from two devices at the same time.

### E. Expiry Tracking ("Use Soon")

Each inventory batch carries its own `expiry_date`, separate from `purchase_date` — FIFO is about purchase order, expiry tracking is about spoilage risk, and the two can disagree (a newer batch might expire sooner).

- A dashboard view lists batches sorted by `expiry_date` ascending, flagging anything within N days (configurable, default 3) as "use soon."
- `expiry_date` is optional at entry time (not every item has a printed date); items without one are simply excluded from this view rather than blocking entry.

### F. Barcode-Based Pantry Logging

To make logging a purchase faster than manual form entry:

- The mobile-web UI exposes a camera-based barcode scanner (standard browser `BarcodeDetector` API where supported, with a JS fallback library otherwise).
- A scanned UPC is looked up against a free barcode database (e.g. Open Food Facts) to auto-fill product name/size; the user confirms quantity, purchase date, and optional expiry date before the batch is saved.
- If the UPC isn't found, the flow degrades gracefully to manual entry with the UPC pre-filled for next time.

### G. Price History

Rather than overwriting `last_updated` on every manual price update, each save appends a new row to `price_history`, so trends are preserved for free as a byproduct of the entry form in section 3A.

- The pantry/product dashboard can show a simple sparkline of a product's price over the last N weeks.
- Optionally, the shopping list view can flag "price dropped since last check" per item.

### H. "What Can I Cook Now"

Given the schema already distinguishes recipes/ingredients from pantry batches, a reverse-match view is low marginal cost:

- For each stored recipe, sum available `quantity_remaining` (converted to the recipe's unit) across all batches of each matching product.
- Recipes where every ingredient's required quantity is already met are surfaced in a "ready to cook" list; recipes missing only 1–2 ingredients are surfaced in an "almost there" list.

### I. Shopping List Generation

Explicitly defining the step the original draft left implicit:

1. For a recipe (or the full meal plan for the week), convert each ingredient's `required_quantity` to the pantry's storage unit via the Unit Conversion Engine.
2. Sum `quantity_remaining` across all of that product's current `inventory_batches`.
3. Shortfall = required − available. If shortfall ≤ 0, the item is already covered and is omitted from the list.
4. Remaining shortfall items are grouped by `store`, then sorted by `aisle` within each store, using the latest `products` data from manual entry.
5. If an item is sold at both Walmart and H-E-B, default to the cheaper of the two (using `price_history`'s latest entry) unless the user has pinned a preferred store for that item.

### J. Progressive Web App (Multi-Device Support)

Since the app is explicitly multi-device:

- A `manifest.json` and service worker are added so the app is installable to a phone home screen.
- Core read views (pantry list, shopping list) are cached for basic offline viewing; write actions (logging a purchase, cooking a recipe) require connectivity and queue/fail gracefully offline rather than silently losing data.

## 4. Database Schema (Supabase PostgreSQL)

### Table: `products` (updated via manual entry, section 3A)
- `id` (UUID, PK)
- `name` (String, e.g. "H-E-B Whole Milk")
- `store` (String, "Walmart" or "HEB") — unique together with `name`, so manual-entry upserts have a conflict target
- `aisle` (String, e.g. "Dairy - A12")
- `price` (Decimal) — latest known price, kept for fast lookups
- `barcode` (String, nullable) — UPC, populated opportunistically from section 3F
- `last_updated` (Timestamp)

### Table: `price_history` (new — supports section 3G)
- `id` (UUID, PK)
- `product_id` (UUID, FK to `products`)
- `price` (Decimal)
- `recorded_at` (Timestamp)

### Table: `inventory_batches` (handles FIFO + expiry)
- `batch_id` (UUID, PK)
- `product_id` (UUID, FK to `products`)
- `quantity_remaining` (Decimal)
- `unit` (String, e.g. "oz", "count")
- `purchase_date` (Timestamp)
- `expiry_date` (Timestamp, nullable) — supports section 3E, independent of `purchase_date`/FIFO order

### Table: `recipes`
- `id` (UUID, PK)
- `title` (String)
- `source_url` (String, nullable)
- `instructions` (Text)
- `extraction_method` (String, e.g. "structured", "llm", "readability") — records which engine in section 3B produced this row, useful for debugging parse quality over time

### Table: `recipe_ingredients`
- `id` (UUID, PK)
- `recipe_id` (UUID, FK to `recipes`)
- `standardized_name` (String)
- `required_quantity` (Decimal)
- `unit` (String)

## 5. Known Risks & Gotchas (summary)

- **Supabase free-tier pause:** auto-pauses after ~7 days idle. Mitigated by the daily Vercel Cron keep-alive ping (section 3A).
- **Walmart/H-E-B actively block automated access — confirmed, not theoretical.** A full Playwright pipeline was built and run against both live sites: Walmart returned a press-and-hold Arkose/FunCaptcha challenge, H-E-B returned an Akamai bot-manager block page (`errorCode: 15`) — both before any real page content loaded, reproduced from a residential IP (not just GitHub's datacenter runners) to rule out IP-reputation as the cause. This was treated as a hard stop, not a "add stealth plugins and retry" problem: deliberately defeating a retailer's explicit anti-automation wall is a different thing from an incidentally-fragile selector, and isn't something to build further on. Resolution: manual weekly price/aisle entry via `/products` (section 3A) replaced the scraper entirely.
- **No free public API alternative exists either.** Walmart's real pricing/catalog API requires Seller/Solution-Provider partner approval with a reviewed business plan — not obtainable as an individual. H-E-B has no public API. Third-party "Walmart API" services (SerpApi, Zinc, etc.) are paid wrappers around the same scraping, which both costs money and doesn't avoid the underlying access-control question.
- **LLM model churn:** free-tier model names/availability change over time (e.g. Gemini 1.5 Flash's deprecation) — pin to whatever current-generation free-tier flash model is available at build time rather than a specific model string in this document.
- **Store/location specificity:** prices and aisle numbers are per-store, not national — manual entries should reflect your actual local store, not a brand-level average.

## 6. Implementation Phases (Prompting Guide for Claude)

Build the project in these phases:

**Phase 1: Supabase & Next.js Scaffold.**
Set up a Next.js (App Router) project integrated with Supabase. Generate SQL migrations for `products`, `price_history`, `inventory_batches`, `recipes`, and `recipe_ingredients`, including the FIFO deduction stored procedure. Add a single shared-password auth gate.

**Phase 2: Manual Data Entry & Keep-Alive.**
Build the `/products` manual price/aisle entry form and its API route (upsert `products`, append `price_history`). Add the `/api/cron/keep-alive` route, secure it with `CRON_SECRET`, exempt it from the shared-password proxy gate, and configure it in `vercel.json` as a daily Vercel Cron job. (Originally scoped as a GitHub Actions + Playwright scraper pipeline; replaced after confirming Walmart/H-E-B both block automated access — see section 5.)

**Phase 3: The Recipe Ingestion Engine.**
Build `/api/recipes` (`GET` lists saved recipes, `POST` accepts a URL) and the minimal `/recipes` input/list UI. Implement the structured-data-first flow using a Node JSON-LD parser (`cheerio`), with a multi-provider LLM fallback (Groq/Gemini/Mistral, in order, skipping unconfigured providers) and a final Readability-based (`@mozilla/readability` + `jsdom`) fallback. Record `extraction_method` on save.

**Phase 4: The Unit Conversion, FIFO & Shopping List Logic.**
Write the TypeScript utility built on `convert-units`, the database transaction/stored-procedure logic that deducts required ingredients from the oldest `inventory_batches` first, and the shopping-list shortfall/grouping/store-preference logic from section 3I.

**Phase 5: Pantry Intelligence Features.**
Implement expiry tracking (section 3E), the "what can I cook now" reverse-match view (section 3H), and price-history sparklines (section 3G).

**Phase 6: Barcode Logging & PWA.**
Add the camera-based barcode scanning flow with UPC lookup fallback (section 3F), and the `manifest.json`/service worker setup for installable, partially-offline multi-device use (section 3J).

**Phase 7: The Frontend UI.**
Build the Vercel-hosted React components: a Pantry dashboard (with expiry flags and price sparklines), a Recipe search/input bar, a "Ready to Cook" view, and the final Shopping List view grouped by store and sorted by aisle.
