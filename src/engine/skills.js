// Skill resolution: which skills apply in a scenario, with stacking rules from data (layers D and F inputs).
import { evaluate } from './predicate.js';
import { LABELS } from './attributes.js';

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

export function buildSkillIndex(db) {
  const index = new Map();
  for (const s of db.skills) {
    index.set(norm(s.name), s.id);
    index.set(norm(s.internalId), s.id);
    index.set(norm(s.id), s.id);
  }
  for (const a of db.auxiliarySkills) for (const alias of a.aliases) index.set(norm(alias), a.id);
  index.set(norm('Blitz Crossing'), 'edged_crossing');
  return index;
}

// Maps a card's skill names to known ids; unknown names are kept for display (ordinary skills not modelled).
export function matchCardSkills(names, db) {
  const index = buildSkillIndex(db);
  const known = [];
  const unknown = [];
  for (const n of names ?? []) {
    const id = index.get(norm(n));
    if (id) known.push(id); else unknown.push(n);
  }
  return { known: [...new Set(known)], unknown };
}

function findRule(db, a, b, rule) {
  return db.stackingRules.find((r) => (!rule || r.rule === rule) && r.skills.includes(a) && r.skills.includes(b));
}

// owned: array of skill ids the simulated player has. facts: derived scenario facts.
export function resolveSkills(owned, facts, db) {
  const ownedSet = new Set(owned);
  if (facts.ordinaryPassing) ownedSet.add('ordinary_passing');
  if (facts.ordinaryShooting) ownedSet.add('ordinary_shooting');

  const activations = [];
  const tempParts = []; // {skillId, attr, amount}
  const localCandidates = []; // {skillId, attr, bonus}
  const motion = [];
  const notes = [];

  for (const s of db.skills) {
    const owns = ownedSet.has(s.id);
    for (const e of s.effects) {
      if (e.kind === 'temp' || e.kind === 'temp_scaled') {
        if (e.target === 'self' && !owns) continue;
        if (e.target === 'recipient' && !facts[e.provider]) {
          if (owns) activations.push({ skill: s, role: 'emitter', ok: null, checks: [], text: 'Provider: benefits eligible teammates, not himself.' });
          continue;
        }
        const res = evaluate(s.activation, facts);
        let amount = e.amount;
        if (e.kind === 'temp_scaled') amount = e.perUnit * Math.min(Math.max(0, facts[e.fact] ?? 0), e.maxUnits);
        activations.push({ skill: s, role: e.target === 'self' ? 'self' : 'recipient', ok: res.ok, checks: res.checks, amount, attrs: e.attrs });
        if (res.ok && amount > 0) for (const a of e.attrs) tempParts.push({ skillId: s.id, attr: a, amount });
      } else if (e.kind === 'local') {
        const isReceiver = e.target === 'receiver';
        if (!isReceiver && !owns) continue;
        if (isReceiver && !facts[e.provider]) {
          if (owns) activations.push({ skill: s, role: 'emitter', ok: null, checks: [], text: 'Provider: creates a marker for the receiver of his pass.' });
          continue;
        }
        const res = evaluate(s.activation, facts);
        const attr = e.selectors[facts.action];
        const ok = res.ok && !!attr;
        const checks = attr ? res.checks : [...res.checks, { label: `The current action uses one of this skill's selectors (${Object.keys(e.selectors).join(', ')})`, ok: false }];
        activations.push({ skill: s, role: isReceiver ? 'recipient' : 'self', ok, checks, local: true, bonus: e.bonus, attr });
        if (ok) localCandidates.push({ skillId: s.id, attr, bonus: e.bonus });
      } else if (e.kind === 'motion' && owns) {
        const res = evaluate(s.activation, facts);
        motion.push({ skill: s, ok: res.ok, checks: res.checks, formula: e.formula });
        if (!s.effects.some((x) => x.kind === 'local')) activations.push({ skill: s, role: 'self', ok: res.ok, checks: res.checks, motion: true });
      }
    }
  }

  // Auxiliary ordinary skills (local +5).
  for (const a of db.auxiliarySkills) {
    if (!ownedSet.has(a.id)) continue;
    for (const e of a.effects) {
      const attr = e.selectors[facts.action];
      if (attr) localCandidates.push({ skillId: a.id, attr, bonus: e.bonus });
    }
  }

  // Mutual exclusion (documented): keep the first by catalogue order, report the rest.
  for (const r of db.stackingRules.filter((x) => x.rule === 'mutually_exclusive')) {
    const active = r.skills.filter((id) => tempParts.some((p) => p.skillId === id));
    if (active.length > 1) {
      const drop = active.slice(1);
      for (let i = tempParts.length - 1; i >= 0; i--) if (drop.includes(tempParts[i].skillId)) tempParts.splice(i, 1);
      notes.push({ status: 'documented', text: `${r.id}: ${r.text}` });
    }
  }

  // Temporary additions: sum per attribute; flag combinations not covered by a documented additive rule.
  const tempAdds = {};
  const tempBreakdown = {};
  for (const p of tempParts) {
    tempAdds[p.attr] = (tempAdds[p.attr] ?? 0) + p.amount;
    (tempBreakdown[p.attr] ??= []).push(p);
  }
  for (const [attr, parts] of Object.entries(tempBreakdown)) {
    const ids = [...new Set(parts.map((p) => p.skillId))];
    if (ids.length < 2) continue;
    const documented = ids.every((a, i) => ids.slice(i + 1).every((b) => findRule(db, a, b, 'additive')));
    if (!documented) notes.push({ status: 'hypothesis', text: `${LABELS[attr] ?? attr}: sum of ${ids.join(' + ')} — ${db.defaultRules.temporaryDifferentSkills.text}` });
  }

  // Local bonus for the current action: maximum, never summed (documented pairs; generalised as hypothesis).
  let local = null;
  if (localCandidates.length) {
    const best = localCandidates.reduce((m, c) => (c.bonus > m.bonus ? c : m));
    const others = localCandidates.filter((c) => c !== best);
    const undocumented = others.filter((o) => !findRule(db, best.skillId, o.skillId, 'max_local'));
    local = { attr: best.attr, bonus: best.bonus, source: best.skillId, discarded: others, status: undocumented.length ? 'hypothesis' : 'documented' };
    if (others.length) notes.push({ status: local.status, text: `Local bonus: +${best.bonus} applied (${best.skillId}); discarded ${others.map((o) => `${o.skillId} +${o.bonus}`).join(', ')}.${undocumented.length ? ' ' + db.defaultRules.localSameSelector.text : ''}` });
  }

  return { activations, tempAdds, tempBreakdown, local, motion, notes };
}
