"""
Builds data/tiers.v1.json from the research notes:
- game8.jp/efootball (player Top 10 per position, formation tiers, manager tiers by team style,
  recommended training allocations) — extracted JSON block in research/game8_findings.md
- r/Amadeusz via Skye's eFootball Encyclopedia (F2P defenders, Showtime skills, Link Up tiers)
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
notes = (ROOT / "research" / "game8_findings.md").read_text(encoding="utf-8")
blocks = re.findall(r"```json\n(.*?)\n```", notes, re.S)
g8 = json.loads(blocks[-1])

amadeusz = {
    "source": "r/Amadeusz (META image: latest post; other lists via Skye's eFootball Encyclopedia, https://docs.google.com/spreadsheets/d/1A33zBtq6cVTghg6ytROST6k70SRMSFoOxEkSvdXSeRk/htmlview)",
    "lists": [
        {
            "title": "META players by position (Top 3 / Top 5 / Top 10)", "date": "2026-10-18",
            "url": "https://www.reddit.com/r/Amadeusz/comments/1x95sjd/full_tier_list_updated_181026/",
            # Local copy of the "Full tier list updated 18/10/26" image (shared by the user on 18 Oct 2026).
            "image": "data/img/amadeusz-meta-2026-10-18.webp",
            "imageSource": "https://www.reddit.com/r/Amadeusz/comments/1x95sjd/full_tier_list_updated_181026/",
            "imageOnly": True,
            "note": "Full tier list updated 18 Oct 2026 (player faces only, no names). New cards are rated 5 days after release. Click to open it full size.",
            "tiers": [],
        },
        {
            "title": "Showtime skills", "date": "2025–2026", "url": "https://docs.google.com/spreadsheets/d/1A33zBtq6cVTghg6ytROST6k70SRMSFoOxEkSvdXSeRk/htmlview",
            "tiers": [
                {"tier": "Mythic", "items": ["Phenomenal Pass", "Long-reach Tackle"]},
                {"tier": "T0", "items": ["Phenomenal Finishing", "Momentum Dribbling", "Bullet Header"]},
                {"tier": "T1", "items": ["Low Screamer", "Acceleration Burst", "Blitz Curler", "Visionary Pass", "Aerial Fort", "Magnetic Feet", "Edged Crossing"]},
                {"tier": "T2", "items": ["Willpower", "Fortress", "GK Spirit Roar", "GK Directing Defence", "Game-changing Pass"]},
                {"tier": "N/A", "items": ["Attack Trigger"]},
            ],
        },
        {
            "title": "Link Up (centerpiece → key man · example manager)", "date": "2026", "url": "https://www.reddit.com/r/Amadeusz/s/qONaUQjR0V",
            "tiers": [
                {"tier": "T0", "items": ["Over-the-top Pass A: DMF Orchestrator → CF Goal Poacher (Capello)", "Breakthrough Pass B: CMF Box-to-box → CF Goal Poacher (Beckenbauer)"]},
                {"tier": "T1", "items": ["Breakthrough Pass A: AMF Creative Playmaker → CF Goal Poacher (Xabi)", "Aggressive Centering A: WMF Cross Specialist → CF Fox in the Box (Allegri)",
                                          "1-2 Cut-in A: WMF Creative Playmaker → CF Fox in the Box (Cruyff)", "Over-the-top Pass B: CMF Orchestrator → WF Prolific Winger (Rijkaard)"]},
                {"tier": "T2", "items": ["Over-the-top Pass C: CB Build Up → WF Prolific Winger (Klopp)", "Diagonal Long Pass A: AMF Creative Playmaker → WMF Hole Player (Mourinho)",
                                          "Diagonal Long Pass B: WF Creative Playmaker → WB Attacking Fullback (Guardiola)"]},
            ],
        },
    ],
}

data = {
    "schema": "efml.tiers",
    "version": "1.0.0",
    "note": "Editorial tier lists from third-party sites, stored as names + tiers with links. Opinions, not mechanics; check the date before relying on them.",
    "game8": {
        "site": "https://game8.jp/efootball",
        "game": "eFootball 2027 (game8 pages)",
        "caveat": "Read via a summarizing fetcher; spot-check card versions. Rows marked (verify) looked odd.",
        **{k: g8[k] for k in g8 if k in ("meta", "players_top10", "formations", "managers", "progression")},
    },
    "amadeusz": amadeusz,
}
out = ROOT / "data" / "tiers.v1.json"  # full version: local use only (git-ignored)
out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

# Public version (committed to GitHub Pages): links to the sources only, no copied rankings or images.
pages = {}
for row in g8.get("players_top10", []):
    pages.setdefault(row["source_url"], {"title": f"Player ranking · {row['position']}", "url": row["source_url"], "date": row.get("page_date")})
for f in g8.get("formations", [])[:1]:
    pages.setdefault(f["source_url"], {"title": "Formation tier list", "url": f["source_url"], "date": f.get("page_date")})
mg = g8.get("managers", {})
if mg.get("source_url"):
    pages.setdefault(mg["source_url"], {"title": "Manager ranking", "url": mg["source_url"], "date": mg.get("page_date")})
public = {
    "schema": "efml.tiers", "version": data["version"], "public": True,
    "note": "Public build: tier lists are linked, not copied. Run tools/build_tiers.py locally for the full in-app version.",
    "links": [
        {"site": "game8.jp", "items": list(pages.values())},
        {"site": "r/Amadeusz", "items": [{"title": l["title"], "url": l["url"], "date": l.get("date")} for l in amadeusz["lists"]]},
    ],
}
(ROOT / "data" / "tiers.public.json").write_text(json.dumps(public, ensure_ascii=False, indent=1), encoding="utf-8")
print("players", len(g8.get("players_top10", [])), "formations", len(g8.get("formations", [])), "keys", list(g8.keys()))
print("sample player", g8["players_top10"][0])
print("sample formation", g8["formations"][0])
print("managers keys", list(g8["managers"].keys()) if isinstance(g8["managers"], dict) else type(g8["managers"]))
print("progression sample", json.dumps(g8.get("progression"), ensure_ascii=False)[:500])
