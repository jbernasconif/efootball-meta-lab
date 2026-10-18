"""
eFHUB managers scraper (Playwright) → CSV.

Walks the public listing efhub.com/managers?page=N like a visitor and reads, for each manager card:
name, stat boosts (e.g. "Tackling +1") and the six team-playstyle proficiencies.
Same politeness rules as efhub_scraper.py: robots.txt check, ≥ Crawl-delay between pages,
images/fonts blocked. Personal use only (eFHUB: "All rights reserved", no data licence).

Usage:
  python tools/efhub_managers.py --out out/efhub_managers.csv
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import logging
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from efhub_scraper import BASE, DEFAULT_DELAY, robots_delay  # noqa: E402

log = logging.getLogger("efhub.managers")
STYLES = ["Possession Game", "Long Ball Counter", "Quick Counter", "Long Ball", "Out Wide", "Overload"]
COLUMNS = ["id", "name", "boosts"] + [s[0].lower() + s.title().replace(" ", "")[1:] for s in STYLES] + ["imageUrl", "sourceUrl", "retrievedAt"]

JS_CARDS = """(styles) => [...document.querySelectorAll('main a[href^="/managers/"]')].map(a => {
  const name = a.querySelector('p')?.textContent.trim() ?? '';
  const boosts = [...a.querySelectorAll('span')].map(s => s.textContent.trim()).filter(t => /^[A-Za-z ]+ \\+\\d+$/.test(t));
  const leaves = [...a.querySelectorAll('span')].filter(s => s.childElementCount === 0).map(s => s.textContent.trim());
  const prof = {};
  for (let i = 0; i < leaves.length - 1; i++) if (/^\\d+$/.test(leaves[i]) && styles.includes(leaves[i + 1])) prof[leaves[i + 1]] = Number(leaves[i]);
  return { href: a.getAttribute('href'), name, boosts, prof, img: a.querySelector('img')?.getAttribute('src') ?? '' };
})"""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=Path("efhub_managers.csv"))
    ap.add_argument("--delay", type=float, default=DEFAULT_DELAY)
    ap.add_argument("--timeout", type=int, default=60)
    ap.add_argument("--max-pages", type=int, help="stop after N listing pages (for testing)")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    rows: dict[str, dict] = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(locale="en-US", viewport={"width": 1366, "height": 900})
        delay = max(args.delay, robots_delay(ctx, [f"{BASE}/managers"]))
        ctx.route(re.compile(r".*\.(png|jpe?g|webp|gif|svg|mp4|woff2?|ttf)(\?.*)?$"), lambda r: r.abort())
        page = ctx.new_page()
        last, k = 1, 1
        while k <= last:
            if k > 1:
                time.sleep(delay)
            url = f"{BASE}/managers" + (f"?page={k}" if k > 1 else "")
            for attempt in range(3):
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=args.timeout * 1000)
                    page.wait_for_function("() => document.querySelectorAll('main a[href^=\"/managers/\"]').length > 0", timeout=args.timeout * 1000)
                    page.wait_for_timeout(500)
                    break
                except Exception as e:
                    log.warning("page %d attempt %d failed: %s", k, attempt + 1, str(e).splitlines()[0])
                    time.sleep(delay * 2)
            else:
                log.error("giving up on page %d", k)
                k += 1
                continue
            hrefs = page.eval_on_selector_all("a[href^='/managers']", "els => els.map(e => e.getAttribute('href'))")
            last = max([last, *[int(m.group(1)) for h in hrefs if h and (m := re.search(r"page=(\d+)", h))]])
            if args.max_pages:
                last = min(last, args.max_pages)
            for c in page.evaluate(JS_CARDS, STYLES):
                mid = c["href"].rstrip("/").split("/")[-1]
                row = {"id": f"efhub-mgr-{mid}", "name": c["name"], "boosts": "|".join(c["boosts"]),
                       "imageUrl": c["img"], "sourceUrl": f"{BASE}{c['href']}", "retrievedAt": dt.date.today().isoformat()}
                for s, col in zip(STYLES, COLUMNS[3:9]):
                    row[col] = c["prof"].get(s, "")
                rows[row["id"]] = row
            log.info("managers page %d/%d: total %d", k, last, len(rows))
            k += 1
        browser.close()

    with args.out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows.values())
    log.info("Wrote %d managers to %s", len(rows), args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
