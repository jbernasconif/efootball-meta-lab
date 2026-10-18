"""
Re-reads the skill lists of cards saved with no skills.

Older scraper versions only found the list when the page showed a "SKILL FX" toggle above it, so cards without
that toggle (e.g. Jay-Jay Okocha Epic) were saved with empty skills. This opens each affected card once,
reads skills + additional skills with the fixed parser and patches every out/*.csv row with that id.
Run tools/scrape_queue.py (or its merge) afterwards to rebuild data/cards.efhub.csv.

    python tools/fix_skills.py [--limit N]
"""
import argparse
import csv
import logging
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from efhub_scraper import JS_STATS_READY, PTBR, STAT_LABELS, read_skills, robots_delay, translate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
log = logging.getLogger("fix_skills")


def empty_ids() -> dict[str, str]:
    """id -> url of every card in the app dataset (data/cards.efhub.csv) whose skills are empty.

    Rows only in old v1 files are skipped: the scrape queue re-scrapes those types with the fixed parser.
    """
    with (ROOT / "lab" / "data" / "cards.efhub.csv").open(encoding="utf-8-sig", newline="") as fh:
        return {r["id"]: r["sourceUrl"] for r in csv.DictReader(fh)
                if r.get("id", "").startswith("efhub-") and r.get("sourceUrl") and not (r.get("skills") or "").strip()}


def patch(found: dict[str, tuple[str, str]]) -> int:
    n = 0
    for f in sorted(OUT.glob("*.csv")):
        with f.open(encoding="utf-8-sig", newline="") as fh:
            r = csv.DictReader(fh)
            cols, rows = r.fieldnames or [], list(r)
        if "skills" not in cols:
            continue
        changed = 0
        for row in rows:
            hit = found.get(row.get("id", ""))
            if hit and not (row.get("skills") or "").strip():
                row["skills"], row["additionalSkills"] = hit
                changed += 1
        if changed:
            tmp = f.with_suffix(".tmp")
            with tmp.open("w", encoding="utf-8-sig", newline="") as fh:
                w = csv.DictWriter(fh, fieldnames=cols)
                w.writeheader()
                w.writerows(rows)
            tmp.replace(f)
            n += changed
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--timeout", type=int, default=45)
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.FileHandler(OUT / "fix_skills.log", encoding="utf-8"), logging.StreamHandler()])
    todo = list(empty_ids().items())[: args.limit]
    log.info("%d cards with empty skills", len(todo))
    found: dict[str, tuple[str, str]] = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(locale="en-US")
        page = ctx.new_page()
        delay = robots_delay(ctx, [u for _, u in todo[:1]])
        for i, (cid, url) in enumerate(todo):
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=args.timeout * 1000)
                if "/pt-BR/" in page.url and PTBR:
                    page.wait_for_function("() => document.body.innerText.includes('ATLETISMO') || document.body.innerText.includes('Atletismo')",
                                           timeout=args.timeout * 1000)
                    page.wait_for_timeout(1500)
                    translate(page)
                page.wait_for_function(JS_STATS_READY, arg=list(STAT_LABELS), timeout=args.timeout * 1000)
                skills, extra = read_skills(page.inner_text("body"))
                if skills:
                    found[cid] = ("|".join(skills), "|".join(extra))
                    log.info("[%d/%d] %s: %d skills", i + 1, len(todo), cid, len(skills))
                else:
                    log.warning("[%d/%d] %s: still no skills (%s)", i + 1, len(todo), cid, page.url)
            except Exception as e:  # noqa: BLE001
                log.warning("[%d/%d] %s failed: %s", i + 1, len(todo), cid, str(e).splitlines()[0])
            if len(found) and (i + 1) % 25 == 0:
                log.info("patched %d rows so far", patch(found))
                found.clear()
            time.sleep(delay)
        browser.close()
    log.info("patched %d rows", patch(found))
    return 0


if __name__ == "__main__":
    sys.exit(main())
