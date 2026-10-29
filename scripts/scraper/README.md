# Scraper pipeline

Implements PRD section 3A. Runs weekly via
[`.github/workflows/scraper.yml`](../../.github/workflows/scraper.yml); can
also be run locally for testing.

## Local run

```bash
cd scripts/scraper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

export WALMART_STORE_ID=<your store id>
export HEB_STORE_ID=<your store number>
# Optional - omit to skip the Supabase sync and just produce CSVs:
export SUPABASE_URL=<your project url>
export SUPABASE_SERVICE_ROLE_KEY=<your service role key>

python main.py
```

Output CSVs land in `data/` at the repo root: `walmart_data.csv`,
`heb_data.csv`, and an append-only `price_history.csv`.

## Finding your store IDs

- **Walmart:** walmart.com → set your store via the store-locator → the
  numeric ID is in the URL (`walmart.com/store/<id>`).
- **H-E-B:** heb.com → Store Locator → select your store → the ID is in the
  URL (`heb.com/store-locator/.../<id>`).

## Maintenance expectations

Both scrapers' CSS selectors (`walmart_scraper.py`, `heb_scraper.py`) will
break when either site redesigns its markup - this is expected per PRD
section 5, not a sign the scraping approach itself is broken. If a run
suddenly matches 0 items, inspect the live search page first and update the
`*_SELECTOR` constants at the top of the relevant file.
