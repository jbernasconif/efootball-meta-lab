// Progression optimizer: maximises a role-weighted expected effective-attribute score.
// Expected value is taken over skill-activation states whose frequencies are user-configurable HYPOTHESES.
import { ATTRS, LABELS } from './attributes.js';
import { progressionDeltas, emptyAllocation, totalCost, levelCost } from './progression.js';
import { conditionDelta, managerDelta, pipelineValue } from './stats.js';
import { matchCardSkills } from './skills.js';

export const BUILD_TYPES = {
  auto: 'Balanced',
  meta: 'Meta',
  tactical: 'Tactical role',
  skills: 'Skill-aware',
  custom: 'Your build',
};

export function weightsFor(roles, position, type, tacticalName) {
  const group = roles.positionGroup[position] ?? 'CM';
  const p = roles.profiles[group];
  if (type === 'meta') return p.meta;
  if (type === 'tactical') return p.tactical[tacticalName] ?? Object.values(p.tactical)[0];
  return p.auto;
}

// Skill states for the optimizer: self temporary skills owned by the card with frequency > 0.
export function skillStates(card, skillsDB, roles, freqs) {
  const owned = matchCardSkills(card.skills, skillsDB).known;
  const opt = roles.optimizer;
  const items = [];
  for (const id of owned) {
    const s = skillsDB.skills.find((x) => x.id === id);
    const p = freqs[id] ?? 0;
    if (!s || p <= 0) continue;
    const adds = {};
    for (const e of s.effects) {
      if (e.target !== 'self') continue;
      if (e.kind === 'temp') e.attrs.forEach((a) => (adds[a] = (adds[a] ?? 0) + e.amount));
      if (e.kind === 'temp_scaled') e.attrs.forEach((a) => (adds[a] = (adds[a] ?? 0) + e.perUnit * Math.min(opt.magneticFeetOpponents, e.maxUnits)));
    }
    if (s.eligiblePositions && !s.eligiblePositions.includes(card.position)) continue;
    if (Object.keys(adds).length) items.push({ id, p, adds });
  }
  // Enumerate independent Bernoulli states; drop exclusive combinations and renormalise.
  const states = [];
  const n = items.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const on = items.filter((_, i) => mask & (1 << i));
    const ids = on.map((x) => x.id);
    if (opt.exclusiveStates.some(([a, b]) => ids.includes(a) && ids.includes(b))) continue;
    const prob = items.reduce((acc, it, i) => acc * (mask & (1 << i) ? it.p : 1 - it.p), 1);
    const temp = {};
    on.forEach((x) => Object.entries(x.adds).forEach(([a, v]) => (temp[a] = (temp[a] ?? 0) + v)));
    states.push({ ids, prob, temp });
  }
  const total = states.reduce((s, x) => s + x.prob, 0) || 1;
  return states.map((s) => ({ ...s, prob: s.prob / total }));
}

// Community breakpoints with a valueFactor make stat points above a threshold worth less (e.g. Speed > 90).
// utility(v) = v up to the first threshold, then each segment scaled by that threshold's factor.
export function curveValue(v, bps) {
  if (!bps?.length) return v;
  let out = 0, prev = 0, factor = 1;
  for (const b of bps) {
    if (v <= b.at) break;
    out += (b.at - prev) * factor;
    prev = b.at;
    factor = b.valueFactor;
  }
  return out + (v - prev) * factor;
}

export function curvesFrom(breakpoints) {
  const out = {};
  for (const b of breakpoints?.breakpoints ?? []) if (b.valueFactor) (out[b.stat] ??= []).push(b);
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.at - b.at);
  return out;
}

export function makeObjective({ card, prog, mech, weights, states, condition = 'C', managerLevel = 'none', boosters = {}, rating, managerBoosts = {}, curves = {} }) {
  const wSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const r = rating ?? card.positionRating ?? card.overall;
  const attrs = Object.keys(weights).filter((a) => ATTRS.includes(a));
  return function score(allocation, detail = false) {
    const d = progressionDeltas(prog, allocation);
    let total = 0;
    const perAttr = {};
    for (const a of attrs) {
      const B = card.stats[a] + (d[a] ?? 0);
      const condD = conditionDelta(mech, a, condition, r, card.position);
      const mgrD = managerDelta(mech, managerLevel, B) + (managerBoosts[a] ?? 0);
      let ev = 0, loss = 0, util = 0;
      for (const s of states) {
        const v = pipelineValue({ base: B, condDelta: condD, mgrDelta: mgrD, temp: s.temp[a] ?? 0, postCap: boosters[a] ?? 0 }, mech.caps);
        ev += s.prob * v.extended;
        loss += s.prob * v.capLoss;
        util += s.prob * curveValue(v.extended, curves[a]);
      }
      perAttr[a] = { expected: ev, capLoss: loss, weight: weights[a] };
      total += weights[a] * util;
    }
    const value = total / wSum;
    return detail ? { value, perAttr } : value;
  };
}

function costOfNext(prog, alloc, cat, k) {
  let c = 0;
  for (let i = 1; i <= k; i++) c += levelCost(prog, (alloc[cat] ?? 0) + i);
  return c;
}

// Greedy marginal-gain-per-point with lookahead (handles cost steps), then pairwise swap refinement.
export function optimize({ prog, budget, score, lookahead = 4, allowed }) {
  const cats = prog.categories.map((c) => c.id).filter((c) => !allowed || allowed.includes(c));
  const alloc = emptyAllocation(prog);
  const steps = [];
  let current = score(alloc);
  for (let guard = 0; guard < 500; guard++) {
    const spent = totalCost(prog, alloc);
    let best = null;
    for (const cat of cats) {
      for (let k = 1; k <= lookahead; k++) {
        const cost = costOfNext(prog, alloc, cat, k);
        if (spent + cost > budget) break;
        const trial = { ...alloc, [cat]: alloc[cat] + k };
        const gain = score(trial) - current;
        const ratio = gain / cost;
        if (gain > 1e-9 && (!best || ratio > best.ratio + 1e-12)) best = { cat, k, cost, gain, ratio };
      }
    }
    if (!best) break;
    alloc[best.cat] += best.k;
    current += best.gain;
    steps.push(best);
  }
  // Swap refinement: move one level from i to j when it improves the score within budget.
  let improved = true;
  for (let it = 0; improved && it < 200; it++) {
    improved = false;
    for (const i of cats) {
      if (!alloc[i]) continue;
      for (const j of cats) {
        if (i === j) continue;
        const trial = { ...alloc, [i]: alloc[i] - 1, [j]: alloc[j] + 1 };
        if (totalCost(prog, trial) > budget) continue;
        const s = score(trial);
        if (s > current + 1e-9) {
          steps.push({ cat: j, k: 1, swapFrom: i, gain: s - current, ratio: null });
          Object.assign(alloc, trial);
          current = s;
          improved = true;
        }
      }
    }
  }
  return { allocation: alloc, score: current, spent: totalCost(prog, alloc), steps };
}

// Marginal value of one more level in each category from a given allocation (for explanations).
export function marginalTable(prog, alloc, score, budget) {
  const base = score(alloc);
  const spent = totalCost(prog, alloc);
  return prog.categories.map((c) => {
    const cost = levelCost(prog, (alloc[c.id] ?? 0) + 1);
    const gain = score({ ...alloc, [c.id]: (alloc[c.id] ?? 0) + 1 }) - base;
    return { cat: c.id, label: c.label, nextCost: cost, gain, perPoint: gain / cost, affordable: spent + cost <= budget };
  });
}

export function explainBuild({ prog, card, alloc, score, budget, weights }) {
  const detail = score(alloc, true);
  const lines = [];
  const margins = marginalTable(prog, alloc, score, budget);
  for (const c of prog.categories) {
    const lv = alloc[c.id] ?? 0;
    if (!lv) continue;
    const pts = totalCost(prog, { [c.id]: lv });
    const weighted = c.attrs.filter((a) => weights[a]).map((a) => `${LABELS[a]} (weight ${weights[a]})`);
    lines.push(`${c.label}: ${lv} levels (${pts} pts). Weighted stats: ${weighted.join(', ') || 'none'}.`);
  }
  const bestNext = margins.filter((m) => m.affordable).sort((a, b) => b.perPoint - a.perPoint)[0];
  const capped = Object.entries(detail.perAttr).filter(([, v]) => v.capLoss > 0.05).map(([a, v]) => `${LABELS[a]} loses ${v.capLoss.toFixed(2)} expected pts to the cap`);
  const spent = totalCost(prog, alloc);
  return {
    lines,
    capped,
    margins,
    leftover: budget - spent,
    stopReason: bestNext ? `Next best option: ${bestNext.label} (+${bestNext.perPoint.toFixed(3)}/pt)` : 'No affordable category with a positive gain is left.',
    strengths: rank(detail.perAttr, card, 'high'),
    weaknesses: rank(detail.perAttr, card, 'low'),
  };
}

function rank(perAttr, card, dir) {
  const arr = Object.entries(perAttr).filter(([, v]) => v.weight >= 0.7).map(([a, v]) => ({ a, v: v.expected }));
  arr.sort((x, y) => (dir === 'high' ? y.v - x.v : x.v - y.v));
  return arr.slice(0, 3).map((x) => `${LABELS[x.a]} ${x.v.toFixed(1)}`);
}
