# Smart Pantry and Grocery Tracker — Product Requirements Document

## 1. Project Overview & Objectives

A personal, multi-device web application designed to manage home grocery inventory using a First-In-First-Out (FIFO) method, store and parse recipes, and automatically generate aisle-sorted shopping lists for local H-E-B and Walmart stores. The system uses a hybrid scraper/AI approach for recipe extraction (structured-data parsing first, LLM fallback second) and relies on a GitHub Actions pipeline to automatically keep grocery data fresh without manual intervention.

Beyond the original scope, the app also helps answer "what can I cook with what I already have," tracks expiry dates (not just purchase dates), keeps a price history so trends are visible, supports fast barcode-based pantry logging, and is installable as a PWA for phone use.

Single-user by design — no multi-tenant auth system is needed.

## 2. Tech Stack (100% Free Tier)

| Layer | Choice | Notes / Gotchas |
|---|---|---|
| Frontend & API Routes | Next.js (App Router, React) | — |
| Hosting | Vercel (Hobby tier) | Permanently free for non-commercial personal projects. Hobby plan also includes Vercel Cron (max 1 trigger/day), which can serve as a backup trigger for the Supabase keep-alive ping independent of GitHub Actions. |
| Database & Auth | Supabase (PostgreSQL, REST API) | **Gotcha:** free-tier projects auto-pause after ~7 days of inactivity. The weekly data-sync step must be treated as mandatory (not optional, as in earlier drafts) so it doubles as a keep-alive ping. |
| Data Pipeline & Automation | GitHub Actions + Python (Playwright) | **Gotcha:** GitHub disables `schedule`-triggered workflows after 60 days with no repository activity (any commit, not just workflow runs, counts). Mitigated by having the pipeline auto-commit its CSV output back to `main` every run, which resets the inactivity clock indefinitely. |
| Scraping engine | Playwright (not plain `requests`/BeautifulSoup) | Walmart and H-E-B both run bot-detection (Akamai/PerimeterX-class). A full headless browser with realistic headers/viewport and randomized delays is materially more resilient than a raw HTTP scraper, though neither is immune to layout changes or IP throttling — budget for occasional scraper maintenance. Store-specific results require passing a saved store/zip ID; prices and aisle numbers are location-specific, not national. |
| Recipe parsing | `recipe-scrapers` (Python) as **primary**, LLM as **fallback** | Reversed from the original design. Most recipe sites embed schema.org `Recipe` JSON-LD, so a structured-data parser succeeds on the large majority of sites with no API cost and no rate limits. The LLM is only invoked when no structured data is found. |
| AI/Parsing fallback | Current free-tier flash model (e.g. Gemini 2.x/2.5 Flash-Lite, or Groq's free Llama tier) | Gemini 1.5 Flash is deprecated; pin to whichever current-generation flash-tier model is actually available at implementation time rather than hardcoding a model name in this doc. |
| Unit conversion | `convert-units` (npm) | Use an existing, tested conversion library instead of hand-writing `cupsToOunces()`-style helpers — smaller surface area for unit-math bugs. |
| Barcode lookup | A free barcode/UPC lookup API (e.g. Open Food Facts) | Used only for the pantry-logging feature (section 3F); no paid tier required. |
| Auth | None / single static session | Single-user app — full Supabase Auth (multi-user rows, RLS policies, signup flows) is unnecessary overhead. A single shared password gate (HTTP Basic Auth at the edge, or one Vercel environment-variable-backed login) is sufficient. |

## 3. Core Features & Logic Flows

### A. Automated Grocery Data Pipeline (The "Fresh Data" Loop)

To satisfy the requirement of updating data without manual pushes, while avoiding GitHub's 60-day cron suspension and Supabase's inactivity pause:

1. **Weekly Trigger:** A GitHub Action runs a Python script every Sunday at 2:00 AM (`cron` schedule in the workflow file).
2. **Targeted Scrape:** The script uses Playwright to iterate through a predefined list of regular items, querying the user's local Walmart and H-E-B (by saved store ID) for current prices, availability, and aisle numbers. Requests include randomized delays and realistic headers to reduce the chance of bot-detection blocks.
3. **Data Export & Commit:** The script writes output to `walmart_data.csv` and `heb_data.csv` in the runner, and appends a dated row to a `price_history.csv` for each product (see schema in section 4).
4. **Auto-Commit Logic:** A GitHub Action step (e.g. `stefanzweifel/git-auto-commit-action`) commits the new CSVs back to `main`. This simulates repository activity, indefinitely bypassing the 60-day cron suspension.
5. **Database Sync (mandatory, not optional):** The same workflow run calls a Supabase Edge Function (or a Next.js API route secured with a shared secret) to upsert the new CSV data into `products`, append to `price_history`, and perform a trivial read so Supabase registers activity and does not pause. This step must run every time the pipeline runs — it is both the sync and the keep-alive.
6. **Backup trigger (optional hardening):** A Vercel Cron job (max daily, Hobby-tier limit) can independently ping the same keep-alive endpoint as a second line of defense if a GitHub Actions run is ever skipped.

### B. Intelligent Recipe Extraction (Scraper-first, LLM Fallback)

When the user inputs a recipe URL or a text query:

1. **Database Check:** Query the `recipes` table to see if it already exists. If yes, load it.
2. **Primary Engine (Structured Data Parser):** If it does not exist, fetch the raw HTML of the URL and run it through `recipe-scrapers` (checks for schema.org `Recipe` JSON-LD / microdata, which the vast majority of recipe sites embed). This requires no external API call and has no rate limit.
3. **Fallback Engine (LLM API):** If the structured parser finds no usable data, send the page's text content to a free-tier LLM with a strict system prompt: *"Extract the recipe title, instructions, and ingredients. Return ONLY a valid JSON object with keys: title, instructions, ingredients (array of objects with name, amount, unit)."*
4. **Second Fallback (Readability-style DOM parser):** If the LLM call fails or hits a rate limit (HTTP 429), fall back further to a generic DOM/regex-based extractor (e.g. Mozilla Readability.js) as a last resort so the user still gets something usable.
5. **Storage:** The successfully parsed recipe is saved to Supabase for future use, regardless of which engine produced it.

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

Rather than overwriting `last_updated` on every scrape, each weekly run appends a new row to a `price_history` table, so trends are preserved for free as a byproduct of the existing pipeline.

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
4. Remaining shortfall items are grouped by `store`, then sorted by `aisle` within each store, using the latest `products` data from the weekly scrape.
5. If an item is sold at both Walmart and H-E-B, default to the cheaper of the two (using `price_history`'s latest entry) unless the user has pinned a preferred store for that item.

### J. Progressive Web App (Multi-Device Support)

Since the app is explicitly multi-device:

- A `manifest.json` and service worker are added so the app is installable to a phone home screen.
- Core read views (pantry list, shopping list) are cached for basic offline viewing; write actions (logging a purchase, cooking a recipe) require connectivity and queue/fail gracefully offline rather than silently losing data.

## 4. Database Schema (Supabase PostgreSQL)

### Table: `products` (updated via GitHub Actions)
- `id` (UUID, PK)
- `name` (String, e.g. "H-E-B Whole Milk")
- `store` (String, "Walmart" or "HEB")
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

- **Supabase free-tier pause:** auto-pauses after ~7 days idle. Mitigated by making the weekly sync/keep-alive step mandatory (section 3A, step 5).
- **GitHub Actions 60-day cron suspension:** mitigated by the auto-commit step resetting repo activity every run (section 3A, step 4).
- **Walmart/H-E-B anti-bot defenses:** Playwright + randomized delays reduce but do not eliminate the risk of blocks or layout breakage; treat the scraper as something that will need occasional maintenance, not a "set and forget" script.
- **LLM model churn:** free-tier model names/availability change over time (e.g. Gemini 1.5 Flash's deprecation) — pin to whatever current-generation free-tier flash model is available at build time rather than a specific model string in this document.
- **Store/location specificity:** prices and aisle numbers are per-store, not national — the scraper must target a specific saved store ID for both retailers, not just a brand-level query.

## 6. Implementation Phases (Prompting Guide for Claude)

Build the project in these phases:

**Phase 1: Supabase & Next.js Scaffold.**
Set up a Next.js (App Router) project integrated with Supabase. Generate SQL migrations for `products`, `price_history`, `inventory_batches`, `recipes`, and `recipe_ingredients`, including the FIFO deduction stored procedure. Add a single shared-password auth gate.

**Phase 2: The GitHub Action Pipeline.**
Write the Python scraping script (using Playwright) and `.github/workflows/scraper.yml` to handle the automated weekly scrape, CSV generation (including `price_history.csv`), auto-commit back to the repository, and the mandatory Supabase sync/keep-alive call.

**Phase 3: The Recipe Ingestion Engine.**
Build the Next.js API route that accepts a URL. Implement the structured-data-first flow using `recipe-scrapers` (or an equivalent Node JSON-LD parser), with LLM fallback (e.g. via the current Gemini/Groq SDK) and a final Readability-based fallback. Record `extraction_method` on save.

**Phase 4: The Unit Conversion, FIFO & Shopping List Logic.**
Write the TypeScript utility built on `convert-units`, the database transaction/stored-procedure logic that deducts required ingredients from the oldest `inventory_batches` first, and the shopping-list shortfall/grouping/store-preference logic from section 3I.

**Phase 5: Pantry Intelligence Features.**
Implement expiry tracking (section 3E), the "what can I cook now" reverse-match view (section 3H), and price-history sparklines (section 3G).

**Phase 6: Barcode Logging & PWA.**
Add the camera-based barcode scanning flow with UPC lookup fallback (section 3F), and the `manifest.json`/service worker setup for installable, partially-offline multi-device use (section 3J).

**Phase 7: The Frontend UI.**
Build the Vercel-hosted React components: a Pantry dashboard (with expiry flags and price sparklines), a Recipe search/input bar, a "Ready to Cook" view, and the final Shopping List view grouped by store and sorted by aisle.
