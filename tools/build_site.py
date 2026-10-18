"""
Assembles the published site in site/ (used locally and by .github/workflows/pages.yml):
  site/        <- league/dist   (Corner Kikudes, the home page; run `npm run build` in league/ first)
  site/lab/    <- lab/          (eFootball Meta Lab, without tests/)

    python tools/build_site.py
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"


def main() -> None:
    dist = ROOT / "league" / "dist"
    if not (dist / "index.html").exists():
        raise SystemExit("league/dist is missing: run `npm run build` in league/ first")
    if SITE.exists():
        shutil.rmtree(SITE)
    shutil.copytree(dist, SITE)
    shutil.copytree(ROOT / "lab", SITE / "lab", ignore=shutil.ignore_patterns("tests", "*.tmp"))
    (SITE / ".nojekyll").write_text("", encoding="utf-8")
    n = sum(1 for p in SITE.rglob("*") if p.is_file())
    print(f"site/ ready: {n} files (league at /, Meta Lab at /lab/)")


if __name__ == "__main__":
    main()
