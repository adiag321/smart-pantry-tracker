"""Walmart price/aisle scraper.

Selectors below match walmart.com's search results page as of late 2026.
Walmart changes its markup periodically and runs bot-detection (PRD section
5) - if this starts returning empty results, the first thing to check is
whether `PRODUCT_CARD_SELECTOR` / `PRICE_SELECTOR` still match by inspecting
a live search page, not whether the scraping logic itself is wrong.
"""

from playwright.sync_api import Page

from common import ScrapeResult, jitter_sleep

SEARCH_URL = "https://www.walmart.com/search?q={query}"
PRODUCT_CARD_SELECTOR = '[data-item-id]'
PRICE_SELECTOR = '[data-automation-id="product-price"]'
TITLE_SELECTOR = '[data-automation-id="product-title"]'

# Walmart scopes search results to a store via this cookie once set. Find
# your store ID at walmart.com/store/finder, then set WALMART_STORE_ID.
STORE_COOKIE_NAME = "pref-store-locator"


def set_store(page: Page, store_id: str) -> None:
    if not store_id:
        return
    page.context.add_cookies(
        [
            {
                "name": STORE_COOKIE_NAME,
                "value": store_id,
                "domain": ".walmart.com",
                "path": "/",
            }
        ]
    )


def search_product(page: Page, query: str) -> ScrapeResult | None:
    page.goto(SEARCH_URL.format(query=query.replace(" ", "+")))
    jitter_sleep()

    try:
        page.wait_for_selector(PRODUCT_CARD_SELECTOR, timeout=10_000)
    except Exception:
        return None

    card = page.locator(PRODUCT_CARD_SELECTOR).first

    try:
        name = card.locator(TITLE_SELECTOR).inner_text(timeout=5_000).strip()
    except Exception:
        return None

    try:
        price_text = card.locator(PRICE_SELECTOR).inner_text(timeout=5_000)
        price = float(price_text.replace("$", "").replace(",", "").split()[0])
    except Exception:
        price = None

    # Walmart's search page doesn't expose in-store aisle number directly;
    # that requires the per-item PDP. Left null here deliberately rather
    # than guessing - downstream code treats a null aisle as "unknown."
    return ScrapeResult(name=name, store="Walmart", price=price, aisle=None)
