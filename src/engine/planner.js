// Build-planning helpers: per-category efficiency, cap waste and skill-aware ceilings.
import { LABELS } from './attributes.js';
import { progressionDeltas, levelCost, totalCost, canAdd } from './progression.js';
import { matchCardSkills } from './skills.js';
import { conditionDelta, managerDelta, pipelineValue } from './stats.js';

const CAP = 99;

// Self temporary skills on the card → max bonus per stat (for skill-aware ceilings).
export function skillBoosts(card, skillsDB) {
  const owned = matchCardSkills(card.skills, skillsDB).known;
  const out = {}; // attr → [{skill, amount, when}]
  for (const id of owned) {
    const s = skillsDB.skills.find((x) => x.id === id);
    if (!s) continue;
    if (s.eligiblePositions && !s.eligiblePositions.includes(card.position)) continue;
    for (const e of s.effects) {
      if (e.target !== 'self' || (e.kind !== 'temp' && e.kind !== 'temp_scaled')) continue;
      const amount = e.kind === 'temp' ? e.amount : e.perUnit * e.maxUnits;
      for (const a of e.attrs) (out[a] ??= []).push({ skill: s.name, id: s.id, amount, when: s.timeScore !== 'None' ? s.timeScore : s.zone, scaled: e.kind === 'temp_scaled' });
    }
  }
  return out;
}

// Highest boost that can be active at once on a stat (Momentum/Surge never stack; others summed as in the engine).
export function maxBoost(list = []) {
  const m = list.filter((b) => b.id !== 'attacking_surge');
  const surge = list.find((b) => b.id === 'attacking_surge');
  const sum = m.reduce((s, b) => s + b.amount, 0);
  return surge && !m.some((b) => b.id === 'momentum_dribbling') ? sum + surge.amount : sum;
}

/**
 * Per-category analysis for the current allocation.
 * Returns rows with: level, nextCost, canAdd, next-level gains, hard-cap stop level, skill-aware stop level, wasted stat points.
 */
export function analyzeCategories(card, prog, allocation, skillsDB) {
  const boosts = skillBoosts(card, skillsDB);
  const d = progressionDeltas(prog, allocation);
  const budget = card.progressionPoints;
  return prog.categories.map((c) => {
    const lv = allocation[c.id] ?? 0;
    const stats = c.attrs.map((a) => {
      const base = card.stats[a];
      const now = base + (d[a] ?? 0);
      const boost = maxBoost(boosts[a]);
      return { attr: a, label: LABELS[a], base, now, shown: Math.min(now, CAP), over: Math.max(0, now - CAP), boost, boosts: boosts[a] ?? [] };
    });
    // Level where every stat in the category is at 99 (further levels are 100% wasted).
    const hardStop = lv + Math.max(0, ...stats.map((s) => CAP - s.now));
    // Level where boosted stats reach 99 − boost (beyond that, the skill bonus is clipped while active).
    const boosted = stats.filter((s) => s.boost > 0);
    const skillStop = boosted.length ? lv + Math.max(0, Math.min(...boosted.map((s) => CAP - s.boost - s.now))) : null;
    const nextGain = stats.filter((s) => s.now < CAP).map((s) => s.label);
    const nextClipped = boosted.filter((s) => s.now + 1 > CAP - s.boost && s.now < CAP).map((s) => `${s.label} (${s.boosts.map((b) => b.skill).join(' + ')} +${s.boost})`);
    const wastedStats = stats.reduce((sum, s) => sum + s.over, 0);
    return {
      id: c.id, label: c.label, attrs: c.attrs, level: lv, stats,
      spent: totalCost(prog, { [c.id]: lv }),
      nextCost: levelCost(prog, lv + 1), canAdd: canAdd(prog, allocation, c.id, budget) && nextGain.length > 0,
      nextGain, nextClipped, hardStop, skillStop, wastedStats,
      status: !nextGain.length ? 'capped' : nextClipped.length ? 'clipped' : 'ok',
    };
  });
}

// Skills that can add stat points to this card: its own self-boost skills, plus teammate providers it can receive.
// kind 'temp' = in-match stat boost (goes through the 99 cap); 'local' = action bonus (layer F, after the cap).
export function toggleableSkills(card, skillsDB) {
  const owned = matchCardSkills(card.skills, skillsDB).known;
  const out = [];
  for (const s of skillsDB.skills) {
    if (s.eligiblePositions && !s.eligiblePositions.includes(card.position)) continue;
    const temp = s.effects.find((e) => e.kind === 'temp' || e.kind === 'temp_scaled');
    const local = s.effects.find((e) => e.kind === 'local');
    if (temp && (temp.target === 'self' ? owned.includes(s.id) : true)) {
      out.push({ id: s.id, name: s.name, kind: 'temp', fromTeammate: temp.target === 'recipient', when: s.timeScore !== 'None' ? s.timeScore : s.zone });
    } else if (local && (local.target === 'self' ? owned.includes(s.id) : true)) {
      out.push({ id: s.id, name: s.name, kind: 'local', fromTeammate: local.target === 'receiver', when: local.target === 'receiver' ? 'Next action after receiving his pass' : 'Special motions only' });
    }
  }
  for (const a of skillsDB.auxiliarySkills) {
    if (owned.includes(a.id)) out.push({ id: a.id, name: a.name, kind: 'local', fromTeammate: false, when: 'On that action' });
  }
  return out;
}

// Community-measured effects of ordinary skills the card (or an added skill slot) has.
export function communityEffectsFor(card, breakpoints) {
  const names = new Set((card.skills ?? []).map((s) => s.toLowerCase()));
  return (breakpoints?.communitySkillEffects ?? []).filter((e) => names.has(e.skill.toLowerCase()));
}

// Action (local) bonuses per stat: documented rule = the maximum applies, never the sum.
export function localBonuses(active, skillsDB) {
  const best = {};
  for (const id of active) {
    const s = skillsDB.skills.find((x) => x.id === id) ?? skillsDB.auxiliarySkills.find((x) => x.id === id);
    for (const e of s?.effects ?? []) {
      if (e.kind !== 'local') continue;
      for (const attr of new Set(Object.values(e.selectors))) {
        if (!best[attr] || e.bonus > best[attr].bonus) best[attr] = { bonus: e.bonus, source: s.name };
      }
    }
  }
  return best;
}

/**
 * "No cap breach" rule: training may not push any stat past 99 — neither the stat itself nor its pre-cap
 * value with condition + coach (DT) + the card's OWN skills all active at their maximum (worst case).
 * Teammate effects (Visionary Pass, Attack Trigger, GK skills) are ignored by design.
 * Returns the list of breaching stats for an allocation (empty = allowed).
 */
export function capBreaches(card, prog, allocation, mech, skillsDB, { condition = 'C', managerLevel = 'none', rating, managerBoosts = {} } = {}) {
  const boosts = skillBoosts(card, skillsDB);
  const d = progressionDeltas(prog, allocation);
  const r = rating ?? card.positionRating ?? card.overall;
  const out = [];
  for (const a of Object.keys(LABELS)) {
    if (!d[a]) continue; // only stats this allocation actually trains
    const B = card.stats[a] + d[a];
    const pre = pipelineValue({ base: B, condDelta: conditionDelta(mech, a, condition, r, card.position), mgrDelta: managerDelta(mech, managerLevel, B) + (managerBoosts[a] ?? 0), temp: maxBoost(boosts[a]) }, mech.caps).preCap;
    if (B > CAP || pre > CAP) out.push({ attr: a, trained: B, preCap: pre });
  }
  return out;
}

// Wraps an objective so any allocation that breaches the cap scores −∞ (the optimizer never picks it).
export function withNoBreach(score, card, prog, mech, skillsDB, ctx) {
  return (allocation, detail = false) => {
    if (capBreaches(card, prog, allocation, mech, skillsDB, ctx).length) return detail ? { value: -Infinity, perAttr: {} } : -Infinity;
    return score(allocation, detail);
  };
}

// Slot-2 booster (+1 to four stats) added on top of the card's own boosters.
export function combineBoosters(cardBoosters = {}, slot2Name, catalog) {
  const out = { ...cardBoosters };
  const b = catalog?.slot2?.find((x) => x.name === slot2Name);
  if (b) for (const a of b.attrs) out[a] = (out[a] ?? 0) + b.amount;
  return out;
}

/**
 * Per-stat breakdown in the documented order: base → progression → condition → manager → skills → 99 cap → boosters.
 * opts: { condition, managerLevel, rating, active: [skillIds], opponents, boosters }
 */
export function statBreakdown(card, prog, allocation, mech, skillsDB, opts = {}) {
  const { condition = 'C', managerLevel = 'none', active = [], opponents = 2, boosters = {}, managerBoosts = {}, community = [] } = opts;
  const rating = opts.rating ?? card.positionRating ?? card.overall;
  const d = progressionDeltas(prog, allocation);
  // Momentum Dribbling and Attacking Surge never apply together (documented ST02).
  const on = active.includes('momentum_dribbling') ? active.filter((id) => id !== 'attacking_surge') : active;
  const temp = {}, sources = {};
  for (const id of on) {
    const s = skillsDB.skills.find((x) => x.id === id);
    for (const e of s?.effects ?? []) {
      if (e.kind !== 'temp' && e.kind !== 'temp_scaled') continue;
      const amount = e.kind === 'temp' ? e.amount : e.perUnit * Math.min(Math.max(0, opponents), e.maxUnits);
      for (const a of e.attrs) { temp[a] = (temp[a] ?? 0) + amount; (sources[a] ??= []).push(`${s.name} +${amount}`); }
    }
  }
  const local = localBonuses(on, skillsDB);
  return Object.fromEntries(Object.keys(LABELS).map((a) => {
    const A = card.stats[a];
    const B = A + (d[a] ?? 0);
    const cond = conditionDelta(mech, a, condition, rating, card.position);
    // Manager: proficiency adjustment + the manager's listed stat boosts (e.g. "Tackling +1", eFHUB data).
    const mgrProf = managerDelta(mech, managerLevel, B);
    const mgrBoost = managerBoosts[a] ?? 0;
    const mgr = mgrProf + mgrBoost;
    const lb = local[a]?.bonus ?? 0;
    const v = pipelineValue({ base: B, condDelta: cond, mgrDelta: mgr, temp: temp[a] ?? 0, postCap: boosters[a] ?? 0, local: lb }, mech.caps);
    // Community skill effects (e.g. Through Passing +20%): applied to the final stat for that action, rounded up, capped at 99.
    const comm = community.filter((e) => e.attrs.includes(a)).map((e) => {
      const val = Math.min(e.cap ?? 99, e.flat ? v.extended + e.flat : Math.ceil(v.extended * (1 + e.pct / 100)));
      return { skill: e.skill, action: e.action, label: e.flat ? `+${e.flat}` : `+${e.pct}%`, value: Math.max(val, v.extended) };
    }).sort((x, y) => y.value - x.value);
    // v.local = value used for that one action (not capped); actionBonus/actionSource describe it.
    return [a, { A, prog: d[a] ?? 0, B, cond, mgr, mgrProf, mgrBoost, skill: temp[a] ?? 0, sources: sources[a] ?? [], boost: boosters[a] ?? 0,
      actionBonus: lb, actionSource: local[a]?.source ?? '', community: comm, ...v }];
  }));
}

export function summarize(card, prog, allocation, skillsDB) {
  const rows = analyzeCategories(card, prog, allocation, skillsDB);
  const spent = totalCost(prog, allocation);
  // Points spent on levels that raised no stat at all (every stat already at 99).
  let wastedPoints = 0;
  for (const r of rows) {
    for (let l = 1; l <= r.level; l++) {
      const allCapped = r.stats.every((s) => s.now - (r.level - l) - 1 >= CAP);
      if (allCapped) wastedPoints += levelCost(prog, l);
    }
  }
  return { rows, spent, left: card.progressionPoints - spent, wastedPoints, wastedStats: rows.reduce((s, r) => s + r.wastedStats, 0) };
}
