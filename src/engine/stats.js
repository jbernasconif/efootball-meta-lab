// Layered stat engine following the article's documented order of operations:
//  A card base → B + user progression → C condition arrow, then manager delta from the reference value
//  → D temporary skill additions → E ordinary cap 40–99, then post-cap additions, extended cap 120
//  → F action-local bonus (ceiling 127, current action only) → G motion parameters (never attribute points).
import { ATTRS, GK_ATTRS } from './attributes.js';
import { progressionDeltas } from './progression.js';
import { resolveSkills, matchCardSkills } from './skills.js';
import { deriveFacts } from './scenario.js';
import { motionReport, clamp } from './motion.js';

export function conditionDelta(mech, attr, condition, rating, originalPosition) {
  const ca = mech.conditionArrows;
  if (originalPosition !== 'GK' && GK_ATTRS.includes(attr)) return 0;
  const group = Object.values(ca.groups).find((g) => g.attrs.includes(attr));
  if (!group) return 0;
  const i = ca.levels.indexOf(condition);
  if (i < 0) throw new Error(`Unknown condition: ${condition}`);
  const [lo, hi] = ca.ratingRange;
  const t = clamp((rating - lo) / (hi - lo), 0, 1);
  return Math.trunc(group.at60[i] + (group.at95[i] - group.at60[i]) * t);
}

// level: 'none' | proficiency 70–90 (number or string). Proficiency uses the table measured on eFHUB
// (data/manager-proficiency.v1.json), which reproduces the article's documented 89 table exactly.
export function managerDelta(mech, level, reference) {
  if (level === undefined || level === null || level === 'none' || level === '') return 0;
  const ref = clamp(reference, mech.caps.ordinaryMin, mech.caps.ordinaryMax);
  const p = Number(level);
  const first = mech.proficiency?.firstProficiency;
  if (first && Number.isFinite(p)) {
    return ['1', '2', '3'].filter((k) => first[k][String(ref)] != null && p >= first[k][String(ref)]).length;
  }
  const table = mech.manager.tables[String(level)];
  return table ? table.find((r) => ref >= r.min && ref <= r.max)?.delta ?? 0 : 0;
}

// Pure single-attribute pipeline (also used directly by tests).
export function pipelineValue({ base, condDelta = 0, mgrDelta = 0, temp = 0, postCap = 0, local = 0 }, caps = { ordinaryMin: 40, ordinaryMax: 99, extendedMax: 120, localMax: 127 }) {
  const afterCondition = clamp(base + condDelta, caps.ordinaryMin, caps.ordinaryMax);
  const afterManager = afterCondition + mgrDelta;
  const preCap = afterManager + temp;
  const ordinary = clamp(preCap, caps.ordinaryMin, caps.ordinaryMax);
  const extended = Math.min(ordinary + postCap, caps.extendedMax);
  // Action-local value: effective ceiling 127 (datamine).
  return { afterCondition, afterManager, preCap, ordinary, extended, local: Math.min(extended + local, caps.localMax ?? 127), capLoss: Math.max(0, preCap - caps.ordinaryMax) };
}

/**
 * ctx: { card, allocation, prog, mech, skillsDB, scenario, boosters?, rating?, managerAttrs? }
 * Returns per-attribute layers plus skill/motion reports.
 */
export function computePlayer(ctx) {
  const { card, allocation = {}, prog, mech, skillsDB, scenario, boosters = {} } = ctx;
  const facts = deriveFacts(scenario, mech.pitch);
  const rating = ctx.rating ?? card.positionRating ?? card.overall;
  const progD = progressionDeltas(prog, allocation);
  const owned = matchCardSkills(card.skills, skillsDB).known;
  const sk = resolveSkills(owned, facts, skillsDB);
  const mgrAttrs = ctx.managerAttrs ?? ATTRS;

  const rows = {};
  for (const a of ATTRS) {
    const A = card.stats[a];
    const B = A + (progD[a] ?? 0);
    const condD = conditionDelta(mech, a, scenario.condition, rating, card.position);
    const mgrD = mgrAttrs.includes(a) ? managerDelta(mech, scenario.managerLevel, B) : 0;
    const temp = sk.tempAdds[a] ?? 0;
    const local = sk.local && sk.local.attr === a ? sk.local.bonus : 0;
    const v = pipelineValue({ base: B, condDelta: condD, mgrDelta: mgrD, temp, postCap: boosters[a] ?? 0, local }, mech.caps);
    // v.local is the action-local effective value; localBonus is the bonus that produced it.
    rows[a] = { A, prog: progD[a] ?? 0, B, condD, mgrD, temp, postCap: boosters[a] ?? 0, localBonus: local, ...v, progWaste: Math.max(0, B - mech.caps.ordinaryMax) };
  }

  const effective = Object.fromEntries(ATTRS.map((a) => [a, rows[a].extended]));
  const motion = sk.motion.map((m) => ({ ...m, rows: motionReport(m.formula, facts, effective) }));
  return { rows, facts, rating, skills: sk, motion, effective, owned, unknownSkills: matchCardSkills(card.skills, skillsDB).unknown };
}

// Permanent stats: card + progression only (uncapped here; anything above 99 is reported as waste).
export function permanentStats(card, prog, allocation) {
  const d = progressionDeltas(prog, allocation);
  return Object.fromEntries(ATTRS.map((a) => [a, card.stats[a] + (d[a] ?? 0)]));
}
