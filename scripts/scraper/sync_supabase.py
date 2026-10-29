"""Upserts scraped results into Supabase (PRD section 3A, step 5).

This doubles as the mandatory Supabase keep-alive: running these writes on
every scheduled scrape is what stops the free-tier project from
auto-pausing after ~7 days idle (PRD section 5), so this must run every
pipeline execution, not just be "nice to have."
"""

import os

from supabase import Client, create_client


def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def sync(results: list[dict]) -> None:
    if not results:
        return

    supabase = get_client()

    products_payload = [
        {
            "name": r["name"],
            "store": r["store"],
            "aisle": r["aisle"],
            "price": r["price"],
        }
        for r in results
        if r["price"] is not None
    ]
    if not products_payload:
        print("No priced results to sync - skipping Supabase upsert.")
        return

    upserted = (
        supabase.table("products")
        .upsert(products_payload, on_conflict="name,store")
        .execute()
    )

    price_history_payload = [
        {"product_id": row["id"], "price": row["price"]}
        for row in upserted.data
    ]
    supabase.table("price_history").insert(price_history_payload).execute()

    print(f"Synced {len(products_payload)} products and "
          f"{len(price_history_payload)} price_history rows to Supabase.")
