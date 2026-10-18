"""
Publishes the league data you entered by hand (Corner Kikudes) to the site.

1. In the app: Datos -> Descargar  (saves corner-kikudes-YYYY-MM-DD.json in Downloads)
2. Run this script (or double-click "Publicar liga.cmd" in the repo root).

It takes the newest corner-kikudes-*.json (or data.json) from Downloads, checks it is a Corner Kikudes
export, removes the admin PIN (the site is public), writes league/public/data.json and, with --push,
commits and pushes it. GitHub Actions then rebuilds the site; everyone's browser merges the new file
on their next visit (seed.js applies each export once, by its "saved" date).

    python tools/publish_league.py [file.json] [--push]
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "league" / "public" / "data.json"
DOWNLOADS = Path.home() / "Downloads"
SECRET_KEYS = ("admin-pin",)  # never published


def newest_export() -> Path | None:
    files = list(DOWNLOADS.glob("corner-kikudes-*.json")) + list(DOWNLOADS.glob("data.json"))
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def count(data: dict, key: str) -> int:
    v = data.get(f"kikudes:shared:{key}", data.get(key))
    try:
        v = json.loads(v) if isinstance(v, str) else v
    except ValueError:
        return 0
    return len(v) if hasattr(v, "__len__") else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("file", nargs="?", type=Path)
    ap.add_argument("--push", action="store_true", help="commit and push league/public/data.json")
    args = ap.parse_args()

    src = args.file or newest_export()
    if not src or not src.exists():
        print(f"No export found in {DOWNLOADS}. In the app: Datos -> Descargar, then run this again.")
        return 1
    payload = json.loads(src.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("app") != "corner-kikudes" or not isinstance(payload.get("data"), dict):
        print(f"{src.name} is not a Corner Kikudes export (expected app = corner-kikudes).")
        return 1
    data = payload["data"]
    removed = [k for k in list(data) if any(k.endswith(s) for s in SECRET_KEYS)]
    for k in removed:
        del data[k]

    old = json.loads(TARGET.read_text(encoding="utf-8")).get("saved") if TARGET.exists() else None
    if old and payload.get("saved") and payload["saved"] < old:
        print(f"Warning: {src.name} ({payload['saved']}) is OLDER than the published data ({old}).")
        if input("Publish it anyway? [y/N] ").strip().lower() != "y":
            return 1
    TARGET.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{src.name} -> league/public/data.json")
    print(f"  saved {payload.get('saved')} | clubs {count(data, 'teams-data')} | tournaments {count(data, 'tournament-archive')}"
          f" | archived leagues {count(data, 'league-archive')} | removed: {', '.join(removed) or 'nothing'}")

    if not args.push:
        print("Not pushed (run with --push, or use 'Publicar liga.cmd').")
        return 0
    git = lambda *a: subprocess.run(["git", *a], cwd=ROOT, check=False, capture_output=True, text=True)
    git("add", str(TARGET.relative_to(ROOT)))
    if not git("diff", "--cached", "--quiet").returncode:
        print("Nothing new to publish: the site already has this data.")
        return 0
    c = git("commit", "-m", f"League data {payload.get('saved', '')[:16]}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")
    p = git("push") if c.returncode == 0 else c
    if p.returncode:
        print("Git failed:\n" + (p.stderr or p.stdout))
        return 1
    print("Pushed. The site updates in ~2 minutes: https://jbernasconif.github.io/efootball-meta-lab/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
