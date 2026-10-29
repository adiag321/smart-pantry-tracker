"""H-E-B price/aisle scraper.

Same caveat as walmart_scraper.py: selectors reflect heb.com as of late
2026 and will need updating when H-E-B changes their markup. H-E-B does
expose in-aisle location on the product detail page for many SKUs, which
Walmart's search results don't - hence the extra PDP hop here.
"""

from playwright.sync_api import Page

from common import ScrapeResult, jitter_sleep

SEARCH_URL = "https://www.heb.com/search?q={query}"
PRODUCT_LINK_SELECTOR = 'a[data-qe-id="searchResultProductCardTitle"]'
PRICE_SELECTOR = '[data-qe-id="productPrice"]'
AISLE_SELECTOR = '[data-qe-id="productAisleLocation"]'

# Set via H-E-B's store-locator cookie; find your store number at
# heb.com/store-locator, then set HEB_STORE_ID.
STORE_COOKIE_NAME = "selectedStoreId"


def set_store(page: Page, store_id: str) -> None:
    if not store_id:
        return
    page.context.add_cookies(
        [
            {
                "name": STORE_COOKIE_NAME,
                "value": store_id,
                "domain": ".heb.com",
                "path": "/",
            }
        ]
    )


def search_product(page: Page, query: str) -> ScrapeResult | None:
    page.goto(SEARCH_URL.format(query=query.replace(" ", "+")))
    jitter_sleep()

    try:
        page.wait_for_selector(PRODUCT_LINK_SELECTOR, timeout=10_000)
        first_result = page.locator(PRODUCT_LINK_SELECTOR).first
        name = first_result.inner_text(timeout=5_000).strip()
        first_result.click()
        page.wait_for_load_state("domcontentloaded")
        jitter_sleep()
    except Exception:
        return None

    try:
        price_text = page.locator(PRICE_SELECTOR).first.inner_text(timeout=5_000)
        price = float(price_text.replace("$", "").replace(",", "").split()[0])
    except Exception:
        price = None

    try:
        aisle = page.locator(AISLE_SELECTOR).first.inner_text(timeout=5_000).strip()
    except Exception:
        aisle = None

    return ScrapeResult(name=name, store="HEB", price=price, aisle=aisle)
