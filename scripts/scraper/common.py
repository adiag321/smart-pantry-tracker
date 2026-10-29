"""Shared helpers for the Walmart/H-E-B scrapers.

Both sites run bot-detection (PRD section 5), so every scraper in this
package goes through the same hardened browser context (realistic UA,
viewport, randomized delays) rather than each rolling its own. This reduces
but does not eliminate the chance of being blocked or seeing layout changes
break selectors - treat scraper breakage as expected maintenance, not a bug
in this helper.
"""

import random
import time
from contextlib import contextmanager

from playwright.sync_api import sync_playwright

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
)


def jitter_sleep(min_seconds: float = 1.5, max_seconds: float = 4.0) -> None:
    time.sleep(random.uniform(min_seconds, max_seconds))


@contextmanager
def hardened_browser():
    """Yields a Playwright page configured to look like a normal user session."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1366, "height": 900},
            locale="en-US",
        )
        page = context.new_page()
        try:
            yield page
        finally:
            context.close()
            browser.close()


class ScrapeResult:
    def __init__(self, name: str, store: str, price: float | None, aisle: str | None):
        self.name = name
        self.store = store
        self.price = price
        self.aisle = aisle

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "store": self.store,
            "aisle": self.aisle,
            "price": self.price,
        }
