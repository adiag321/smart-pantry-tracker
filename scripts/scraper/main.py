"""Entry point for the weekly grocery data pipeline (PRD section 3A).

Usage: python main.py
Reads scripts/scraper/items.yaml, scrapes each item from Walmart and H-E-B,
writes CSVs to data/, and (if SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
set) upserts the results into Supabase.
"""

import csv
import datetime
import os
import pathlib
import sys

import yaml

sys.path.insert(0, os.path.dirname(__file__))

import heb_scraper
import walmart_scraper
from common import hardened_browser

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent.parent / "data"


def load_items() -> list[str]:
    items_path = pathlib.Path(__file__).parent / "items.yaml"
    with open(items_path) as f:
        config = yaml.safe_load(f)
    return [item["query"] for item in config["items"]]


def scrape_store(store_name: str, module, store_id_env: str, queries: list[str]) -> list[dict]:
    store_id = os.environ.get(store_id_env, "")
    results = []
    with hardened_browser() as page:
        module.set_store(page, store_id)
        for query in queries:
            try:
                result = module.search_product(page, query)
            except Exception as exc:
                print(f"[{store_name}] '{query}' failed: {exc}", file=sys.stderr)
                continue
            if result is None:
                print(f"[{store_name}] '{query}' returned no match", file=sys.stderr)
                continue
            results.append(result.to_dict())
    return results


def write_csv(path: pathlib.Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "store", "aisle", "price"])
        writer.writeheader()
        writer.writerows(rows)


def append_price_history(path: pathlib.Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    file_exists = path.exists()
    with open(path, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "store", "price", "recorded_at"])
        if not file_exists:
            writer.writeheader()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        for row in rows:
            if row["price"] is None:
                continue
            writer.writerow(
                {
                    "name": row["name"],
                    "store": row["store"],
                    "price": row["price"],
                    "recorded_at": now,
                }
            )


def main() -> None:
    queries = load_items()

    walmart_results = scrape_store("Walmart", walmart_scraper, "WALMART_STORE_ID", queries)
    heb_results = scrape_store("HEB", heb_scraper, "HEB_STORE_ID", queries)

    write_csv(DATA_DIR / "walmart_data.csv", walmart_results)
    write_csv(DATA_DIR / "heb_data.csv", heb_results)
    append_price_history(DATA_DIR / "price_history.csv", walmart_results + heb_results)

    print(f"Walmart: {len(walmart_results)}/{len(queries)} items matched")
    print(f"HEB: {len(heb_results)}/{len(queries)} items matched")

    if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        import sync_supabase

        sync_supabase.sync(walmart_results + heb_results)
    else:
        print("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set - skipping DB sync.")


if __name__ == "__main__":
    main()
