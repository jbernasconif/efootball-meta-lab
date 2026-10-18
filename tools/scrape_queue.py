"""
Scrape queue: runs the eFHUB scrapers one after another (never in parallel, so the site only
ever sees one polite client) and merges results into the app's data files.

v2 (boosters separated from base stats) order: epic → bigtime → showtime → legend → featured →
trending → highlight → normal. Managers are skipped if already present. Re-running is safe: each
step resumes from its CSV and reuses saved URL lists.

Usage:
  python tools/scrape_queue.py [--wait-pid PID]
"""
from __future__ import annotations

import argparse
import csv
import ctypes
import logging
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
DATA = ROOT / "lab" / "data"  # Meta Lab site lives in lab/
PY = sys.executable
CARD_TYPES = ["epic", "bigtime", "showtime", "legend", "featured", "trending", "highlight", "normal"]
# URL lists already collected by v1 runs (avoid re-walking the listings).
V1_LISTS = {t: OUT / f"efhub_epic_bigtime_showtime_{t}_urls.txt" for t in ["epic", "bigtime", "showtime"]}
V1_LISTS["legend"] = OUT / "efhub_cards_legend_legend_urls.txt"
log = logging.getLogger("queue")


def keep_awake() -> None:
    # Ask Windows not to sleep while the queue runs (ES_CONTINUOUS | ES_SYSTEM_REQUIRED).
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)
    except Exception:
        pass


def pid_alive(pid: int) -> bool:
    out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True).stdout
    return str(pid) in out


def v2_out(t: str) -> Path:
    return OUT / f"efhub_v2_{t}.csv"


def merge_cards() -> None:
    # v1 files first (boosters NOT separated), then v2 files, so re-scraped v2 rows replace v1 rows.
    v1 = [OUT / "efhub_epic_bigtime_showtime.csv"] + sorted(OUT.glob("efhub_cards_*.csv"))
    files = v1 + [v2_out(t) for t in CARD_TYPES]
    # Card type is known from the per-type file (v2) or the per-type URL lists (v1).
    type_of = {}
    for t in CARD_TYPES:
        for lst in OUT.glob(f"*_{t}_urls.txt"):
            for u in lst.read_text(encoding="utf-8-sig").split():
                type_of[u.strip()] = t
    rows, cols = {}, []
    for f in files:
        if not f.exists():
            continue
        with f.open(encoding="utf-8-sig", newline="") as fh:
            r = csv.DictReader(fh)
            for c in r.fieldnames or []:
                if c not in cols:
                    cols.append(c)
            for row in r:
                if row.get("id") and row.get("speed") and row.get("position"):  # skip half-written/bad lines
                    row["cardType"] = type_of.get(row.get("sourceUrl", ""), row.get("cardType") or "unknown")
                    rows[row["id"]] = row
    if "cardType" not in cols:
        cols.append("cardType")
    tmp = DATA / "cards.efhub.csv.tmp"
    with tmp.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows.values())
    tmp.replace(DATA / "cards.efhub.csv")
    separated = sum(1 for r in rows.values() if r.get("boostersSeparated") == "1")
    log.info("merged %d cards into data/cards.efhub.csv (%d with boosters separated)", len(rows), separated)


def run(cmd: list[str]) -> int:
    log.info("running: %s", " ".join(cmd))
    with (OUT / "queue_steps.log").open("a", encoding="utf-8") as lf:
        return subprocess.run(cmd, cwd=ROOT, stdout=lf, stderr=lf).returncode


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait-pid", type=int)
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    logging.basicConfig(filename=OUT / "queue.log", level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    keep_awake()

    if args.wait_pid:
        while pid_alive(args.wait_pid):
            merge_cards()
            time.sleep(600)
    merge_cards()

    if (DATA / "managers.efhub.csv").exists() and (DATA / "managers.efhub.csv").stat().st_size > 100_000:
        log.info("managers already scraped; skipping")
    elif run([PY, "tools/efhub_managers.py", "--out", str(OUT / "efhub_managers.csv")]) == 0:
        shutil.copyfile(OUT / "efhub_managers.csv", DATA / "managers.efhub.csv")

    for t in CARD_TYPES:
        out = v2_out(t)
        reuse = out.with_name(f"{out.stem}_{t}_urls.txt")
        if not reuse.exists() and V1_LISTS.get(t, Path("-")).exists():
            shutil.copyfile(V1_LISTS[t], reuse)
        for attempt in range(3):  # resume after crashes / network drops
            code = run([PY, "tools/efhub_scraper.py", "--types", t, "--reuse-lists", "--out", str(out)])
            merge_cards()
            log.info("%s finished with exit code %d (attempt %d)", t, code, attempt + 1)
            if code == 0:
                break
            time.sleep(300)
    log.info("queue complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
