"""
eFHUB player-card scraper (Playwright) → CSV compatible with the eFootball Meta Lab importer.

For each player URL it:
  1. opens the page and waits until the Attacking / Defending / Athleticism stats are rendered,
  2. reads name, position, base overall, playing style(s), skills and the 26 stats at max level (0 points spent),
  3. presses eFHUB's "Max" button and reads the maximum overall ("media máxima") plus the
     progression-point budget, using eFHUB's own automatic point distribution,
  4. writes one CSV row per card.

Polite by design: it checks robots.txt, waits at least the published Crawl-delay (5 s) between pages,
blocks images/fonts/media, and only renders public pages like a normal visitor. Personal use only:
eFHUB states "All rights reserved" and offers no data licence, so do not republish the output.

Usage:
  python tools/efhub_scraper.py https://efhub.com/players/110718 123236838933952
  python tools/efhub_scraper.py --file players.txt --out cards.csv
  python tools/efhub_scraper.py --file players.txt --headed      # watch the browser
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import logging
import re
import sys
import time
import urllib.robotparser
from dataclasses import dataclass, field
from pathlib import Path

from playwright.sync_api import Page, TimeoutError as PWTimeout, sync_playwright

BASE = "https://efhub.com"
DEFAULT_DELAY = 5.0  # robots.txt Crawl-delay for "*" (checked again at runtime)
log = logging.getLogger("efhub")

# eFHUB label → Meta Lab attribute key (order = CSV column order).
STAT_LABELS = {
    "Attacking Awareness": "offensiveAwareness", "Ball Control": "ballControl", "Dribbling": "dribbling",
    "Tight Possession": "tightPossession", "Low Pass": "lowPass", "Lofted Pass": "loftedPass",
    "Finishing": "finishing", "Heading": "heading", "Set Piece Taking": "placeKicking", "Curl": "curl",
    "Defensive Awareness": "defensiveAwareness", "Defensive Engagement": "defensiveEngagement",
    "Tackling": "tackling", "Aggression": "aggression", "GK Awareness": "gkAwareness",
    "GK Catching": "gkCatching", "GK Parrying": "gkParrying", "GK Reflexes": "gkReflexes", "GK Reach": "gkReach",
    "Speed": "speed", "Acceleration": "acceleration", "Kicking Power": "kickingPower", "Jumping": "jump",
    "Physical Contact": "physicalContact", "Balance": "balance", "Stamina": "stamina",
}
POSITIONS = ["GK", "CB", "LB", "RB", "DMF", "CMF", "LMF", "RMF", "AMF", "LWF", "RWF", "SS", "CF"]
CATEGORIES = ["SHOOTING", "PASSING", "DRIBBLING", "DEXTERITY", "LOWER BODY STRENGTH", "AERIAL STRENGTH",
              "DEFENDING", "GK 1", "GK 2", "GK 3"]

MODEL_LABELS = {
    "Arm Length": "model_armLength", "Shoulder Width": "model_shoulderWidth", "Neck Length": "model_neckLength",
    "Chest Measurement": "model_chest", "Neck Size": "model_neckSize", "Shoulder Height": "model_shoulderHeight",
    "Leg Length": "model_legLength", "Thigh Size": "model_thighSize", "Waist Size": "model_waistSize",
    "Arm Size": "model_armSize", "Calf Size": "model_calfSize",
}
PHYSICS_LABELS = {
    "LEG COVERAGE RADIUS": "phys_legCoverageRadius", "ARM COVERAGE RADIUS": "phys_armCoverageRadius",
    "JUMPING HEIGHT": "phys_jumpingHeight", "TORSO COLLISION": "phys_torsoCollision",
    "LEG LENGTH BASED HEIGHT": "phys_legLengthBasedHeight",
}
OTHER_LABELS = {
    "Weak Foot Usage": "weakFootUsage", "Weak Foot Accuracy": "weakFootAccuracy",
    "Form": "form", "Injury Resistance": "injuryResistance",
}

CSV_COLUMNS = (
    ["id", "name", "version", "cardType", "position", "positionRating", "overall", "boostedOverall", "maxOverall",
     "playingStyle", "defensivePlayingStyle", "foot", "height", "weight", "age", "condition",
     "progressionPoints", "skills", "additionalSkills", "boosters", "boostersSeparated"]
    + list(STAT_LABELS.values())
    + [f"booster_{k}" for k in STAT_LABELS.values()]
    + [f"max_{k}" for k in STAT_LABELS.values()]
    + [f"maxBuild_{c.lower().replace(' ', '_')}" for c in CATEGORIES]
    + list(MODEL_LABELS.values()) + list(PHYSICS_LABELS.values()) + list(OTHER_LABELS.values())
    + ["comSkills", "sourceUrl", "retrievedAt"]
)

# Runs in the page: returns {label: {value, chip}} for every stat row. "value" is what eFHUB displays
# (it already INCLUDES boosters); "chip" is the small "+N" booster badge next to it (0 if none).
JS_READ_STATS = """(labels) => {
  const out = {};
  const leaves = [...document.querySelectorAll('span')].filter(e => e.childElementCount === 0);
  for (const l of labels) {
    const e = leaves.find(x => x.textContent.trim() === l && x.parentElement.querySelector('.tabular-nums'));
    const spans = e ? [...e.parentElement.querySelectorAll('span')].map(s => s.textContent.trim()) : [];
    const v = spans.find(t => /^\\d+$/.test(t));
    const chip = spans.find(t => /^\\+\\d+$/.test(t));
    out[l] = { value: v ? Number(v) : null, chip: chip ? Number(chip.slice(1)) : 0 };
  }
  return out;
}"""

# Booster names as shown under the card art (e.g. "Breakthrough +4"); empty slots read "Booster 1/2".
JS_BOOSTERS = """() => [...document.querySelectorAll('button')]
  .map(b => b.textContent.trim())
  .filter(t => /^[A-Za-z][A-Za-z .'&-]* \\+\\d+$/.test(t) && t.length < 40)"""

JS_STATS_READY = """(labels) => {
  const leaves = [...document.querySelectorAll('span')].filter(e => e.childElementCount === 0);
  return labels.every(l => leaves.some(x => x.textContent.trim() === l
      && /^\\d+$/.test(x.parentElement.querySelector('.tabular-nums')?.textContent.trim() ?? '')));
}"""

# Card overall: the big number on the card art (first white numeric leaf), as observed on 2026-10-18.
JS_CARD_OVERALL = """() => {
  const n = [...document.querySelectorAll('body *')].find(e => e.childElementCount === 0
      && /^\\d{2,3}$/.test(e.textContent.trim()) && String(e.className).includes('text-white'));
  return n ? Number(n.textContent.trim()) : null;
}"""


JS_STYLES = """() => {
  const h = [...document.querySelectorAll('h1')].find(x => x.offsetParent !== null);
  let c = h; for (let i = 0; i < 3 && c; i++) c = c.parentElement;
  return c ? [...c.querySelectorAll('span.truncate')].filter(s => s.childElementCount === 0)
      .map(s => s.textContent.trim()).filter(Boolean).slice(0, 2) : [];
}"""


class RegionalCard(Exception):
    """The card redirects to a non-English locale page and no dictionary is available; skipped (not retried)."""


# pt-BR -> English page texts, built by tools/efhub_ptbr.py from the same cards in both languages.
PTBR_FILE = Path(__file__).with_name("efhub_ptbr.json")
PTBR = json.loads(PTBR_FILE.read_text(encoding="utf-8"))["table"] if PTBR_FILE.exists() else {}

# Replaces every text node whose trimmed text is in the dictionary (labels, skills, styles, boosters...).
JS_TRANSLATE = """(table) => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n, k = 0;
  while ((n = w.nextNode())) { const t = n.textContent.trim(); if (t && table[t] !== undefined) { n.textContent = table[t]; k++; } }
  return k;
}"""


def translate(page: Page) -> None:
    if PTBR and "/pt-BR/" in page.url:
        page.evaluate(JS_TRANSLATE, PTBR)


@dataclass
class Card:
    url: str
    row: dict = field(default_factory=dict)


def normalize_url(arg: str) -> str:
    arg = arg.strip()
    if re.fullmatch(r"\d+", arg):
        return f"{BASE}/players/{arg}"
    if not arg.startswith(f"{BASE}/players/"):
        raise ValueError(f"Not an eFHUB player URL or id: {arg}")
    return arg.split("?")[0].split("#")[0]


def robots_delay(ctx, urls: list[str]) -> float:
    # Fetched through the browser context: eFHUB answers 403 to Python's urllib user agent,
    # which RobotFileParser.read() would misread as "disallow everything".
    rp = urllib.robotparser.RobotFileParser()
    res = ctx.request.get(f"{BASE}/robots.txt")
    if not res.ok:
        raise SystemExit(f"robots.txt returned HTTP {res.status}; aborting to stay on the safe side.")
    rp.parse(res.text().splitlines())
    for u in urls:
        if not rp.can_fetch("*", u):
            raise SystemExit(f"robots.txt disallows {u}; aborting.")
    return max(DEFAULT_DELAY, float(rp.crawl_delay("*") or 0))


def section(text: str, start: str, end: str) -> str:
    i = text.find(start)
    if i < 0:
        return ""
    j = text.find(end, i + len(start))
    return text[i + len(start): j if j >= 0 else None]


def labelled(text: str, label: str) -> str:
    m = re.search(rf"\n{re.escape(label)}\n+([^\n]+)\n", text)
    return m.group(1).strip() if m else ""


def points(text: str) -> tuple[int, int] | None:
    m = re.search(r"Points\s+(\d+)\s*/\s*(\d+)", text)
    return (int(m.group(1)), int(m.group(2))) if m else None


def category_levels(text: str) -> dict[str, int]:
    out = {}
    for c in CATEGORIES:
        m = re.search(rf"\n{re.escape(c)}\n−\n(\d+)\n\+", text)
        out[c] = int(m.group(1)) if m else 0
    return out


def click_button(page: Page, name: str) -> bool:
    # DOM click on the first visible, enabled match: ad overlays can intercept real pointer clicks.
    clicked = page.evaluate(
        """(name) => {
          const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().toLowerCase() === name
              && !b.disabled && b.offsetParent !== null);
          if (!b) return false;
          b.click();
          return true;
        }""",
        name.lower(),
    )
    if clicked:
        page.wait_for_timeout(700)
    return clicked


def scrape(page: Page, url: str, timeout_ms: int) -> dict:
    page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
    # Some regional cards only exist in a localized version (e.g. /pt-BR/players/...): English labels never appear.
    regional = re.search(r"efhub\.com/[a-z]{2}(-[A-Za-z]{2})?/players/", page.url)
    if regional and not ("/pt-BR/" in page.url and PTBR):
        raise RegionalCard(page.url)
    labels = list(STAT_LABELS)
    # Stats are rendered client-side after a skeleton: wait until all 26 rows have numbers.
    if regional:  # wait on the Portuguese labels, then translate the page in place
        page.wait_for_function("""() => [...document.querySelectorAll('.tabular-nums')]
            .filter(e => /^\d+$/.test(e.textContent.trim())).length >= 26""", timeout=timeout_ms)
        translate(page)
    page.wait_for_function(JS_STATS_READY, arg=labels, timeout=timeout_ms)

    desc = page.locator('meta[name="description"]').get_attribute("content") or ""
    # Some cards have no "Playing style:" sentence, so it is optional; the style is also read from the page below.
    m = re.search(r"^(.*) is an? (\d+)-rated (\w+) in eFootball\.(?: Playing style: (.+?)\.)? View full", desc)
    name = (page.locator("h1").first.text_content() or "").strip()  # text_content: not CSS-uppercased
    position = m.group(3) if m else ""
    if position not in POSITIONS:  # fallback: the position label on the card art
        position = page.evaluate("""() => [...document.querySelectorAll('span')].find(s => s.childElementCount === 0
            && String(s.className).includes('text-center text-white'))?.textContent.trim() ?? ''""")
    style = (m.group(4) or "").strip() if m else ""

    # Max level, 0 points spent: press Max (sets max level + eFHUB auto-allocation), read, then Reset.
    pressed_max = click_button(page, "Max")
    translate(page)
    text_max = page.inner_text("body")
    max_stats = page.evaluate(JS_READ_STATS, labels)
    max_overall = page.evaluate(JS_CARD_OVERALL)
    pts = points(text_max)
    max_build = category_levels(text_max)
    if pressed_max:
        click_button(page, "Reset")
    translate(page)
    text = page.inner_text("body")
    base_stats = page.evaluate(JS_READ_STATS, labels)
    boosters = page.evaluate(JS_BOOSTERS)
    # The card art shows OVR with boosters; the title/description rating is without them.
    boosted_overall = page.evaluate(JS_CARD_OVERALL)
    # Localized pages have a translated description; the <title> ("Name — 85 OVR | eFHUB") still has the rating.
    t_ovr = re.search(r"(\d{2,3}) OVR", page.title())
    base_overall = int(m.group(2)) if m else int(t_ovr.group(1)) if t_ovr else boosted_overall
    if pts and points(text) and points(text)[0] != 0:
        log.warning("%s: points still allocated after Reset (%s); base stats may include training", url, points(text))

    # Playing style + defensive playing style: the "truncate" spans next to the visible player name.
    styles = page.evaluate(JS_STYLES)
    if styles:
        style = styles[0]
    def_style = styles[1] if len(styles) > 1 else ""

    skills = [s for s in section(text, "SKILLS\nSKILL FX\n", "ADDITIONAL SKILLS").split("\n") if s.strip()]
    extra = [s for s in section(text, "ADDITIONAL SKILLS\n", "PLAYER MODEL").split("\n")
             if s.strip() and s.strip() != "Add skill"]

    pos_ratings = {}
    for p in POSITIONS:
        found = re.findall(rf"\n{p}\n(\d{{2,3}})\n", text)
        if found:
            pos_ratings[p] = int(found[-1])

    pid = url.rstrip("/").split("/")[-1]
    row = {
        "id": f"efhub-{pid}", "name": name, "version": f"eFHUB {pid}", "cardType": "unknown",
        "position": position, "positionRating": pos_ratings.get(position, base_overall),
        "overall": base_overall, "boostedOverall": boosted_overall, "maxOverall": max_overall,
        "boosters": "|".join(boosters), "boostersSeparated": 1,
        "playingStyle": style, "defensivePlayingStyle": def_style,
        "foot": labelled(text, "Foot"), "height": labelled(text, "Height"), "weight": labelled(text, "Weight"),
        "age": labelled(text, "Age"), "condition": labelled(text, "Condition"),
        "progressionPoints": pts[1] if pts else 0,
        "skills": "|".join(skills), "additionalSkills": "|".join(extra),
        "sourceUrl": url, "retrievedAt": dt.date.today().isoformat(),
    }
    for label, key in STAT_LABELS.items():
        b = base_stats.get(label) or {}
        mx = max_stats.get(label) or {}
        chip = b.get("chip") or 0
        # Base stat WITHOUT booster (eFHUB displays base + booster); booster kept separately.
        row[key] = b["value"] - chip if b.get("value") is not None else None
        row[f"booster_{key}"] = chip
        row[f"max_{key}"] = mx.get("value")  # as displayed by eFHUB after "Max" (training + booster)
    for c, lv in max_build.items():
        row[f"maxBuild_{c.lower().replace(' ', '_')}"] = lv
    for label, key in {**MODEL_LABELS, **PHYSICS_LABELS, **OTHER_LABELS}.items():
        row[key] = labelled(text, label)
    com = section(text, "COM SKILLS\n", "OTHER STATS")
    row["comSkills"] = "|".join(s.strip() for s in com.split("\n") if s.strip())
    missing = [k for k in STAT_LABELS.values() if row[k] is None]
    if missing:
        raise RuntimeError(f"missing stats: {', '.join(missing)}")
    return row


# Listing filter values observed on efhub.com/players (2026-10-18).
PLAYER_TYPES = {"normal": 1, "featured": 2, "trending": 3, "legend": 4, "epic": 5, "highlight": 6, "bigtime": 7, "showtime": 8}


def collect_urls(page: Page, type_name: str, delay: float, timeout_ms: int) -> list[str]:
    """Walks the public listing (?playerType=N&page=K) like a visitor and returns card URLs."""
    pt = PLAYER_TYPES[type_name]
    urls: list[str] = []
    last_page, k = 1, 1
    while k <= last_page:
        if k > 1:
            time.sleep(delay)
        page.goto(f"{BASE}/players?playerType={pt}" + (f"&page={k}" if k > 1 else ""), wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_function("() => document.querySelectorAll('a[href^=\"/players/\"]').length > 5", timeout=timeout_ms)
        page.wait_for_timeout(500)
        hrefs = page.eval_on_selector_all('a[href^="/players"]', "els => els.map(e => e.getAttribute('href'))")
        found = [f"{BASE}{h}" for h in hrefs if re.fullmatch(r"/players/\d+", h or "")]
        pages = [int(m.group(1)) for h in hrefs if h and (m := re.search(rf"playerType={pt}&page=(\d+)", h))]
        last_page = max([last_page, *pages])
        new = [u for u in found if u not in urls]
        urls += new
        log.info("%s listing page %d/%d: %d cards (total %d)", type_name, k, last_page, len(new), len(urls))
        k += 1
    return urls


def existing_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    with path.open(encoding="utf-8-sig", newline="") as f:
        return {r["sourceUrl"] for r in csv.DictReader(f) if r.get("sourceUrl")}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("players", nargs="*", help="eFHUB player URLs or numeric ids")
    ap.add_argument("--file", type=Path, help="text file with one URL/id per line (# comments allowed)")
    ap.add_argument("--types", nargs="+", choices=list(PLAYER_TYPES), help="collect all cards of these types from the listing")
    ap.add_argument("--limit", type=int, help="stop after N cards (for testing)")
    ap.add_argument("--reuse-lists", action="store_true", help="reuse saved *_urls.txt listings instead of re-walking them")
    ap.add_argument("--out", type=Path, default=Path("efhub_cards.csv"))
    ap.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="seconds between pages (min: robots.txt delay)")
    ap.add_argument("--timeout", type=int, default=45, help="seconds to wait for a page's stats")
    ap.add_argument("--retries", type=int, default=2)
    ap.add_argument("--headed", action="store_true", help="show the browser window")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    raw = list(args.players)
    if args.file:
        raw += [l.split("#")[0] for l in args.file.read_text(encoding="utf-8-sig").splitlines()]
    urls = list(dict.fromkeys(normalize_url(r) for r in raw if r.strip()))
    if not urls and not args.types:
        ap.error("no players given (pass URLs/ids, --file or --types)")

    done = existing_ids(args.out)  # resume: skip cards already in the CSV
    new_file = not args.out.exists()
    failures, written = [], 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headed)
        ctx = browser.new_context(locale="en-US", viewport={"width": 1366, "height": 900})
        delay = max(args.delay, robots_delay(ctx, urls or [f"{BASE}/players"]))
        ctx.route(re.compile(r".*\.(png|jpe?g|webp|gif|svg|mp4|woff2?|ttf)(\?.*)?$"), lambda r: r.abort())
        page = ctx.new_page()

        for t in args.types or []:
            list_file = args.out.with_name(f"{args.out.stem}_{t}_urls.txt")
            if args.reuse_lists and list_file.exists() and list_file.stat().st_size:
                listed = [l.strip() for l in list_file.read_text(encoding="utf-8").splitlines() if l.strip()]
                log.info("%s: reusing %d URLs from %s", t, len(listed), list_file)
                urls += [u for u in listed if u not in urls]
                continue
            listed = collect_urls(page, t, delay, args.timeout * 1000)
            list_file.write_text("\n".join(listed) + "\n", encoding="utf-8")
            log.info("%s: %d card URLs saved to %s", t, len(listed), list_file)
            urls += [u for u in listed if u not in urls]
            time.sleep(delay)

        todo = [u for u in urls if u not in done]
        if args.limit:
            todo = todo[: args.limit]
        log.info("%d card(s) to scrape (%d already in %s), %.1fs between pages", len(todo), len(done), args.out, delay)

        with args.out.open("a", newline="", encoding="utf-8-sig" if new_file else "utf-8") as f:
            w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
            if new_file:
                w.writeheader()
            for i, url in enumerate(todo):
                if i:
                    time.sleep(delay)
                for attempt in range(args.retries + 1):
                    try:
                        row = scrape(page, url, args.timeout * 1000)
                        w.writerow(row)
                        f.flush()
                        written += 1
                        log.info("[%d/%d] OK %s · %s %s · OVR %s → max %s · %s pts", i + 1, len(todo),
                                 row["name"], row["position"], row["playingStyle"], row["overall"], row["maxOverall"], row["progressionPoints"])
                        break
                    except RegionalCard as e:
                        log.info("[%d/%d] SKIP regional card (localized page only): %s", i + 1, len(todo), e)
                        with args.out.with_name(f"{args.out.stem}_regional.txt").open("a", encoding="utf-8") as rf:
                            rf.write(url + "\n")
                        break
                    except Exception as e:  # keep the overnight run alive; failures are listed at the end
                        log.warning("attempt %d failed for %s: %s", attempt + 1, url, str(e).splitlines()[0])
                        if attempt == args.retries:
                            failures.append(url)
                        else:
                            time.sleep(delay * 2)
                            page.close()
                            page = ctx.new_page()
        browser.close()

    log.info("Wrote %d new row(s) to %s", written, args.out)
    if failures:
        fail_file = args.out.with_name(f"{args.out.stem}_failed.txt")
        fail_file.write_text("\n".join(failures) + "\n", encoding="utf-8")
        log.error("%d failed; list saved to %s (re-run with --file to retry)", len(failures), fail_file)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
