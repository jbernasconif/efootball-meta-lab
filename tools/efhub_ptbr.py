"""
Builds tools/efhub_ptbr.json: a pt-BR -> English dictionary of eFHUB page texts (stat labels, skills,
playing styles, boosters, positions, UI labels).

A few regional cards only exist on eFHUB as /pt-BR/ pages. To read them with the normal English parser,
efhub_scraper.py replaces every page text found in this dictionary before parsing.

The dictionary is not hand-written: for sample cards we already have in English, the script opens the
English page and the /pt-BR/ page of the SAME card and pairs texts that sit at the same place in the page.
Cards are picked greedily so every skill / playing style / booster in data/cards.efhub.csv is covered.

    python tools/efhub_ptbr.py [--max-cards 40] [--need out/regional_texts.json]
"""
import argparse
import csv
import json
import logging
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from efhub_scraper import BASE, STAT_LABELS, robots_delay  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).with_name("efhub_ptbr.json")
log = logging.getLogger("ptbr")

# Text nodes in page order with their element path (tag:index chain), skipping scripts and ads.
JS_TEXTS = """() => {
  const out = [];
  const path = (el) => { const p = []; for (; el && el !== document.body; el = el.parentElement)
    p.push(el.tagName + ':' + [...el.parentElement.children].indexOf(el)); return p.reverse().join('/'); };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    const t = n.textContent.trim();
    const el = n.parentElement;
    if (!t || !el || el.closest('script,style,noscript,iframe,ins')) continue;
    out.push([path(el), t]);
  }
  return out;
}"""


def pick_cards(max_cards: int) -> list[dict]:
    rows = list(csv.DictReader((ROOT / "data" / "cards.efhub.csv").open(encoding="utf-8-sig")))
    rows = [r for r in rows if r.get("boostersSeparated") == "1"]
    feats = lambda r: {*(f"s:{s}" for s in (r["skills"] + "|" + r.get("additionalSkills", "")).split("|") if s),
                       *(f"c:{s}" for s in r.get("comSkills", "").split("|") if s),
                       *(f"b:{b.rsplit(' +', 1)[0]}" for b in r.get("boosters", "").split("|") if b),
                       f"p:{r['playingStyle']}", f"d:{r.get('defensivePlayingStyle', '')}", f"pos:{r['position']}"}
    todo, chosen = set().union(*(feats(r) for r in rows)), []
    while todo and len(chosen) < max_cards:
        best = max(rows, key=lambda r: len(feats(r) & todo))
        gain = feats(best) & todo
        if not gain:
            break
        chosen.append(best)
        todo -= gain
    log.info("%d sample cards; %d features left uncovered", len(chosen), len(todo))
    return chosen


def texts(page, url: str) -> list[list[str]]:
    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_function("() => document.body.innerText.includes('40') && document.querySelectorAll('h1').length",
                           timeout=45000)
    page.wait_for_timeout(2500)
    return page.evaluate(JS_TEXTS)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-cards", type=int, default=40)
    ap.add_argument("--delay", type=float, default=5.0)
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    cards = pick_cards(args.max_cards)
    votes: dict[str, Counter] = defaultdict(Counter)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(locale="en-US")
        page = ctx.new_page()
        delay = max(args.delay, robots_delay(ctx, [BASE + "/players/1"]))
        for i, c in enumerate(cards):
            pid = c["sourceUrl"].rstrip("/").split("/")[-1]
            try:
                en = texts(page, f"{BASE}/players/{pid}")
                time.sleep(delay)
                pt = texts(page, f"{BASE}/pt-BR/players/{pid}")
                time.sleep(delay)
            except Exception as e:  # noqa: BLE001
                log.warning("skip %s: %s", pid, e)
                continue
            en_at = defaultdict(list)
            for path, t in en:
                en_at[path].append(t)
            pt_at = defaultdict(list)
            for path, t in pt:
                pt_at[path].append(t)
            pairs = 0
            for path, pts in pt_at.items():
                ens = en_at.get(path)
                if not ens or len(ens) != len(pts):
                    continue
                for a, b in zip(pts, ens):
                    if a != b and not a.replace("+", "").replace(".", "").isdigit():
                        votes[a][b] += 1
                        pairs += 1
            log.info("[%d/%d] %s %s: %d pairs", i + 1, len(cards), c["name"], pid, pairs)
        browser.close()

    # Keep a pairing only when it is clearly the majority for that text.
    # Buttons that only appear after pressing Máx are not on the aligned pages; observed on 2026-10-18.
    table, unsure = {"Redefinir": "Reset"}, {}
    for a, cnt in votes.items():
        (b, n), total = cnt.most_common(1)[0], sum(cnt.values())
        if n >= 2 and n / total >= 0.8 or total == 1:
            table[a] = b
        else:
            unsure[a] = dict(cnt)
    stat_ok = sum(1 for v in table.values() if v in STAT_LABELS)
    OUT.write_text(json.dumps({"source": "aligned eFHUB /players/<id> vs /pt-BR/players/<id> pages",
                               "cards": len(cards), "table": dict(sorted(table.items())), "unsure": unsure},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    log.info("wrote %s: %d texts (%d stat labels of %d), %d unsure", OUT.name, len(table), stat_ok,
             len(STAT_LABELS), len(unsure))
    return 0


if __name__ == "__main__":
    sys.exit(main())
