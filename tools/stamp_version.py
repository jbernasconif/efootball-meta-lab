"""
Cache busting for GitHub Pages (files are cached by browsers for ~10 minutes).

Writes into index.html:
- an import map that points every src/**/*.js module to "?v=<content hash>", so a changed file is always
  fetched fresh and an unchanged one stays cached;
- "?v=<hash>" on the stylesheet;
- <meta name="build" content="<build hash>">.
And writes version.json ({"build": ...}). The app compares both at start and reloads once when the
page itself is an old cached copy.

Run before every commit that changes the site:  python tools/stamp_version.py
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "lab"  # the Meta Lab site


def h(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:10]


def main() -> None:
    mods = sorted(p for p in (ROOT / "src").rglob("*.js"))
    imports = {f"./{p.relative_to(ROOT).as_posix()}": f"./{p.relative_to(ROOT).as_posix()}?v={h(p)}" for p in mods}
    css = ROOT / "src" / "styles.css"
    build = hashlib.sha1("".join(sorted(imports.values()) + [h(css)]).encode()).hexdigest()[:10]

    html_path = ROOT / "index.html"
    html = html_path.read_text(encoding="utf-8")
    html = re.sub(r'\s*<script type="importmap">.*?</script>', "", html, flags=re.S)
    html = re.sub(r'\s*<meta name="build"[^>]*>', "", html)
    html = re.sub(r'href="src/styles\.css(\?v=[^"]*)?"', f'href="src/styles.css?v={h(css)}"', html)
    block = (f'\n  <meta name="build" content="{build}">'
             f'\n  <script type="importmap">{json.dumps({"imports": imports}, indent=2)}</script>')
    html = html.replace('<link rel="stylesheet"', block.lstrip("\n") + '\n  <link rel="stylesheet"', 1) \
        if "<link rel=\"stylesheet\"" in html else html.replace("</head>", block + "\n</head>", 1)
    html = re.sub(r'<script type="module" src="src/app\.js[^"]*"></script>',
                  f'<script type="module" src="src/app.js?v={h(ROOT / "src" / "app.js")}"></script>', html)
    html_path.write_text(html, encoding="utf-8")
    (ROOT / "version.json").write_text(json.dumps({"build": build}) + "\n", encoding="utf-8")
    print(f"build {build}: {len(imports)} modules stamped")


if __name__ == "__main__":
    main()
