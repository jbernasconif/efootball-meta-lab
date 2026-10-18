# eFootball Meta Lab

A web app for planning eFootball player builds without overspending progression points.

**Live site:** https://jbernasconif.github.io/efootball-meta-lab/

It uses:

- skill rules from eFHUB's article *Skill Mechanics Cracked* (17 Oct 2026), stored as versioned data;
- card, physics and manager data collected from [eFHUB](https://efhub.com) public pages.

No build step: plain ES modules. Locally it runs with a small PowerShell server; online it is a static GitHub Pages site.

> **Data notice.** eFootball and all player/card data are © KONAMI. Card and manager data were read from eFHUB's public pages, which carry no data licence; credit for that data goes to eFHUB. Tier lists from game8.jp and r/Amadeusz are linked, not copied. This is an unofficial fan project, not affiliated with KONAMI, eFHUB, game8 or Amadeusz. Rights holders can ask for removal by opening an issue.

## Run the app

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 -Port 5173
```

- App: <http://localhost:5173/>. The **Build Planner** is the start page.
- Tests: <http://localhost:5173/tests/index.html> (63 cases, mostly the article's numeric examples)

## Pages

| Page | What it does |
|---|---|
| **Build Planner** | Pick a card, spend points per category (Shooting … GK 3), and see warnings before you waste points: the 99 cap, and skills (Fortress, Momentum Dribbling, Magnetic Feet…) whose bonus would be clipped. It also shows one-click suggestions (Balanced, Meta, role, Skill-aware), Physics and Player Model. |
| Players | All cards, with filters for position, offensive and defensive playing style, and article skill. |
| Managers | All managers by team playstyle proficiency and stat boosts. |
| Skills Lab | The 21 skills: conditions, numbers, evidence, combinations, and a draggable pitch for the ±18 m zones and the 5 m radius. |
| Match Scenarios | Half, score, sub, possession, zone, opponents, action, condition arrow, manager. Shows layers A→G, with documented rules kept apart from hypotheses. |
| Advanced Optimizer | The full optimizer, with editable activation frequencies and cross-scores. |
| Rules & Evidence | Every extracted rule and its documentation status. |

## Data scraping (eFHUB)

eFHUB has no public API or data licence, and the site says "All rights reserved". The scrapers render public pages like a visitor, follow robots.txt (Crawl-delay 5 s), block images and fonts, and run one at a time. See the data notice at the top.

```bash
python tools/efhub_scraper.py 110718 105899666447703 --out out/test.csv
```

```bash
python tools/efhub_scraper.py --types epic bigtime showtime --out out/cards.csv
```

```bash
python tools/efhub_managers.py --out out/efhub_managers.csv
```

```bash
python tools/scrape_queue.py --wait-pid <pid>
```

The last command is the overnight queue: managers, then Legend, Featured, Trending, Highlight and Normal cards.

- Card CSV columns:
  - id, name, position, base OVR at max level, eFHUB max OVR, offensive and defensive playing style;
  - progression points, skills, COM skills, the 26 stats (base, and `max_*` after eFHUB's auto build);
  - eFHUB's auto build levels, Player Model, Physics, weak foot, form, injury resistance;
  - source URL and date.
- The queue merges everything into `data/cards.efhub.csv` and `data/managers.efhub.csv`. The app loads both on start.
- Every step resumes: cards already in a CSV are skipped, and listing URLs are reused with `--reuse-lists`.
- Logs: `out/scrape.log`, `out/queue.log`, `out/queue_steps.log`.

Card counts on 18 Oct 2026:

| Type | Cards |
|---|---|
| Epic | 907 |
| Big Time | 150 |
| Showtime | 737 |
| Legend | 255 |
| Featured | 429 |
| Trending | 3,608 |
| Highlight | 7,791 |
| Normal | 36,836 |

At about 6 s per card, the full set takes about 3–4 days.

## Verified vs assumed

- **Verified on eFHUB:** the 10 progression categories map to the listed stats (+1 per level), and levels 1–16 cost 1/2/3/4 points.
- **Assumed:** the cost from level 17 onward (5 points), which was not observed.
- **Hypotheses:**
  - role weights and activation frequencies;
  - Boosters as post-cap additions;
  - the manager adjustment applying to all stats (only proficiency 89 is documented);
  - stacking for pairs the article does not list.
- **No skill is validated in real matches.** This is a limitation the article states itself.
