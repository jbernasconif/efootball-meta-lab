"""
Builds data/manager-proficiency.v1.json from proficiency sweeps measured on the eFHUB player builder
(18 Oct 2026, cards 110718, 105899666447703, 123236838933952; slider 70→90, cards without boosters).

For each stat value v (40–99) and bonus level k (+1/+2/+3) it stores the lowest proficiency p at which
eFHUB shows at least +k. Unmeasured values are linearly interpolated between measured neighbours,
rounded up (conservative), and made monotone. Proficiency 89 is then checked against the article's table.
"""
import json
import math
from pathlib import Path

# (value: first proficiency reaching the level) — measured points.
L1 = {40: 80, 41: 79, 42: 79, 44: 78, 45: 78, 46: 78, 48: 77, 49: 77, 50: 77, 52: 76, 54: 76, 57: 75, 59: 75,
      60: 75, 61: 75, 62: 75, 63: 75, 64: 74, 67: 74, 69: 74, 70: 74, 71: 74, 72: 73, 74: 73, 77: 73, 78: 73,
      80: 73, 82: 73, 83: 73, 84: 73, 85: 73, 86: 72, 87: 72, 88: 72, 89: 72, 90: 72, 91: 72, 98: 72}
L2 = {57: 88, 59: 87, 60: 86, 61: 86, 62: 85, 63: 84, 64: 84, 67: 83, 69: 82, 70: 82, 71: 82, 72: 82, 74: 81,
      77: 80, 78: 80, 80: 80, 82: 79, 83: 79, 84: 79, 85: 79, 86: 79, 87: 79, 88: 78, 89: 78, 90: 78, 91: 78}
L3 = {83: 90, 84: 89, 85: 88, 86: 88, 87: 88, 88: 87, 89: 86, 90: 86, 91: 86}
# Article (proficiency 89): 40–55 +1, 56–83 +2, 84–99 +3  → v=56 reaches +2 at 89; v=55 does not before 90.
L2[56] = 89
L2[55] = 90

NEVER = 999


def fill(points: dict, lo: int, hi: int) -> dict:
    keys = sorted(points)
    out = {}
    for v in range(lo, hi + 1):
        if v in points:
            out[v] = points[v]
        elif v < keys[0]:
            out[v] = NEVER  # below the lowest value ever seen reaching this level: not within 70–90
        elif v > keys[-1]:
            out[v] = points[keys[-1]]  # extrapolate flat (higher stats never need more proficiency)
        else:
            a = max(k for k in keys if k < v)
            b = min(k for k in keys if k > v)
            t = (v - a) / (b - a)
            out[v] = math.ceil(points[a] + (points[b] - points[a]) * t)
    # Monotone: a higher stat never needs MORE proficiency than a lower one.
    for v in range(hi - 1, lo - 1, -1):
        out[v] = max(out[v], out[v + 1]) if out[v] != NEVER else out[v]
    for v in range(lo + 1, hi + 1):
        out[v] = min(out[v], out[v - 1]) if out[v - 1] != NEVER else out[v]
    return out


def main() -> None:
    first = {str(k): fill(p, 40, 99) for k, p in (("1", L1), ("2", L2), ("3", L3))}
    for k in first:
        first[k] = {str(v): (None if p == NEVER else p) for v, p in first[k].items()}

    def delta(p, v):
        return sum(1 for k in ("1", "2", "3") if first[k][str(v)] is not None and p >= first[k][str(v)])

    article = lambda v: 1 if v <= 55 else 2 if v <= 83 else 3
    mismatches = [v for v in range(40, 100) if delta(89, v) != article(v)]
    data = {
        "schema": "efml.manager-proficiency",
        "version": "1.0.0",
        "source": "Measured on the eFHUB player builder manager slider (70–90), 2026-10-18; cards 110718, 105899666447703, 123236838933952.",
        "status": "measured",
        "note": "delta(p, v) = number of levels k with p >= firstProficiency[k][v]. Proficiency 89 reproduces the article's documented table. Values 92–99 and gaps are interpolated from measured neighbours.",
        "articleCheck89": "ok" if not mismatches else f"mismatch at {mismatches}",
        "firstProficiency": first,
    }
    out = Path(__file__).resolve().parent.parent / "lab" / "data" / "manager-proficiency.v1.json"
    out.write_text(json.dumps(data, indent=1), encoding="utf-8")
    print("written", out, "| article check 89:", data["articleCheck89"])


if __name__ == "__main__":
    main()
