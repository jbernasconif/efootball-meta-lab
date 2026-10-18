// Build Planner: the main, simplified page. Pick a card, spend points, see where points stop paying off.
import { esc, statusBadge } from './common.js';
import { GROUPS, LABELS, normalizeAttrKey } from '../engine/attributes.js';
import { PLAYSTYLES } from './managers.js';
import { summarize, skillBoosts, maxBoost, statBreakdown, toggleableSkills, combineBoosters, withNoBreach, capBreaches } from '../engine/planner.js';
import { emptyAllocation } from '../engine/progression.js';
import { matchCardSkills } from '../engine/skills.js';
import { weightsFor, skillStates, makeObjective, optimize, curvesFrom, curveValue, targetsFor, maxSpendFor } from '../engine/optimizer.js';

// 99-cap check per active stat skill: full benefit only while the stat before the skill is ≤ 99 − bonus.
function skillCaps(D, active, rows, opponents) {
  const out = [];
  for (const id of active) {
    const s = D.skills.skills.find((x) => x.id === id);
    for (const e of s?.effects ?? []) {
      if (e.kind !== 'temp' && e.kind !== 'temp_scaled') continue;
      const amount = e.kind === 'temp' ? e.amount : e.perUnit * Math.min(opponents, e.maxUnits);
      const max = 99 - amount;
      const stats = e.attrs.filter((a) => rows[a]).map((a) => ({ a, pre: rows[a].afterManager, lost: Math.max(0, rows[a].afterManager + amount - 99) }));
      out.push({ name: s.name, amount, max, stats, lost: stats.filter((x) => x.lost) });
    }
  }
  if (!out.length) return '';
  return `<div class="capcheck"><label>Skill caps</label>${out.map((c) => `<div class="caprow ${c.lost.length ? 'has-lost' : ''}">
    <b>${esc(c.name)} +${c.amount}</b><span class="muted">full benefit if stat ≤ ${c.max} before the skill</span><span class="spacer"></span>
    ${c.lost.length ? c.lost.map((x) => `<span class="lostchip" title="${esc(`${LABELS[x.a]} is ${x.pre} before the skill: ${x.pre} + ${c.amount} = ${x.pre + c.amount} → 99`)}">${LABELS[x.a]} ${x.pre} −${x.lost}</span>`).join('')
      : `<span class="up" style="font-size:12px">✓ no loss${c.stats.length > 6 ? ` (${c.stats.length} stats)` : `: ${c.stats.map((x) => `${LABELS[x.a]} ${x.pre}`).join(', ')}`}</span>`}
  </div>`).join('')}</div>`;
}

const ui = { q: '', mq: '', suggestFor: null, suggestions: null, role: null, manager: { id: null, playstyle: 'quickCounter', proficiency: 70 } };

export const statColor = (v) => (v >= 90 ? 'c-elite' : v >= 80 ? 'c-high' : v >= 70 ? 'c-mid' : 'c-low');

// Per-card match context (condition, coach/DT, active skills). When a card opens, its own skills start on.
function cardCtx(D, card) {
  ui.ctxByCard ??= {};
  return (ui.ctxByCard[card.id] ??= {
    condition: 'C', opponents: 2, managerId: null, playstyle: 'quickCounter', proficiency: 70,
    active: withoutConflicts(toggleableSkills(card, D.skills).filter((t) => !t.fromTeammate && t.kind !== 'local').map((t) => t.id)),
  });
}

// Manager shared across cards (like a squad's coach): proficiency comes from the chosen team playstyle.
function applyManager(D, ctx) {
  const m = ui.manager.id ? (D.managers ?? []).find((x) => x.id === ui.manager.id) : null;
  ctx.managerLevel = m ? (m[ui.manager.playstyle] || 70) : ui.manager.proficiency;
  ctx.managerBoosts = {};
  for (const bst of m?.boosts ?? []) {
    const [, name, n] = bst.match(/^(.*) \+(\d+)$/) ?? [];
    const a = normalizeAttrKey(name ?? '');
    if (a) ctx.managerBoosts[a] = (ctx.managerBoosts[a] ?? 0) + Number(n);
  }
  return m;
}

function suggestions(app, card, ctx, allBoosters) {
  const key = JSON.stringify([card.id, ctx.condition, ctx.managerLevel, ctx.managerBoosts, allBoosters, app.state.opt.freqs, ui.role]);
  if (ui.suggestKey === key && ui.suggestions) return ui.suggestions;
  const { D } = app;
  const group = D.roles.positionGroup[card.position];
  const roles = Object.keys(D.roles.profiles[group].tactical);
  ui.role = roles.includes(ui.role) ? ui.role : roles[0];
  const common = { card, prog: D.progression, mech: D.mechanics, targets: targetsFor(D.roles, card.position), curves: curvesFrom(D.breakpoints) };
  const neutral = [{ prob: 1, temp: {}, ids: [] }];
  const defs = {
    auto: ['Balanced', 'Spreads points over the stats that matter most for this position. No skills, boosters or coach considered.', weightsFor(D.roles, card.position, 'auto'), neutral],
    meta: ['Meta', 'Leans toward pace, physical contact and stamina — the competitive meta priorities for this position. No skills, boosters or coach considered.', weightsFor(D.roles, card.position, 'meta'), neutral],
    role: [ui.role, `Weights tuned for the ${ui.role} role (pick another role on the right).`, weightsFor(D.roles, card.position, 'tactical', ui.role), neutral],
    skills: ['Skill-aware', 'Like Balanced, but skips stats that the card’s own skills already push past 99.', weightsFor(D.roles, card.position, 'auto'), skillStates(card, D.skills, D.roles, app.state.opt.freqs)],
  };
  // Complete / No-cap-breach: own skills + boosters (card + slot 2) + coach (DT) + condition; no teammate effects.
  const b = app.build(card);
  const full = { condition: ctx.condition, managerLevel: ctx.managerLevel, managerBoosts: ctx.managerBoosts, boosters: allBoosters, rating: b.rating };
  const out = {};
  for (const [k, [name, desc, weights, states]] of Object.entries(defs)) {
    const score = makeObjective({ ...common, weights, states });
    const r = optimize({ prog: D.progression, budget: card.progressionPoints, score, lookahead: D.roles.optimizer.lookahead, maxSpend: maxSpendFor(D.roles, card.position) });
    out[k] = { name, desc, allocation: r.allocation, spent: r.spent, score };
  }
  const fullW = weightsFor(D.roles, card.position, 'auto');
  const fullStates = skillStates(card, D.skills, D.roles, app.state.opt.freqs);
  const fullScore = makeObjective({ ...common, ...full, weights: fullW, states: fullStates });
  const complete = optimize({ prog: D.progression, budget: card.progressionPoints, score: fullScore, lookahead: D.roles.optimizer.lookahead, maxSpend: maxSpendFor(D.roles, card.position) });
  out.complete = { name: 'Complete', desc: 'Uses everything on this card: own skills, boosters, coach proficiency and boosts, condition, speed/acceleration breakpoints and the 90 passing/shooting threshold. Teammate effects (e.g. Visionary Pass) are left out.', allocation: complete.allocation, spent: complete.spent, score: fullScore, featured: true };
  const safeScore = withNoBreach(fullScore, card, D.progression, D.mechanics, D.skills, full);
  const safe = optimize({ prog: D.progression, budget: card.progressionPoints, score: safeScore, lookahead: D.roles.optimizer.lookahead, maxSpend: maxSpendFor(D.roles, card.position) });
  out.nocap = { name: 'No cap breach', desc: 'Same as Complete, but no stat may go over 99 even with all its own skills active, so no point is wasted.', allocation: safe.allocation, spent: safe.spent, score: safeScore, featured: true };
  // Points each build loses to the cap in the current context (own skills on, boosters, coach, condition).
  for (const s of Object.values(out)) {
    const rows = statBreakdown(card, D.progression, s.allocation, D.mechanics, D.skills, { ...ctx, active: ctx.active.filter((id) => !toggleableSkills(card, D.skills).find((t) => t.id === id)?.fromTeammate), rating: b.rating, boosters: allBoosters });
    s.lost = Object.values(rows).reduce((n, r) => n + r.capLoss + Math.max(0, r.B - 99), 0);
  }
  ui.suggestKey = key;
  ui.suggestions = { out, roles };
  return ui.suggestions;
}

// Skill names seen on any card in the dataset (the in-game learnable list isn't published; this avoids inventing names).
function skillOptions(app, baseCard, b, current) {
  ui.allSkills ??= [...new Set(app.state.cards.flatMap((c) => c.skills ?? []))].sort((x, y) => x.localeCompare(y));
  const own = new Set(baseCard.skills ?? []);
  const taken = new Set((b.extraSkills ?? []).filter((x) => x && x !== current));
  const article = new Set(app.D.skills.skills.map((s) => s.name));
  return ui.allSkills.filter((s) => !own.has(s) && !taken.has(s))
    .map((s) => `<option value="${esc(s)}" ${s === current ? 'selected' : ''}>${esc(s)}${article.has(s) ? ' ★' : ''}</option>`).join('');
}

// The card plus up to 5 added skills (like the game's additional skill slots).
function withExtraSkills(base, b) {
  const extra = (b.extraSkills ?? []).filter(Boolean);
  return extra.length ? { ...base, skills: [...(base.skills ?? []), ...extra] } : base;
}

// opts.embedded: rendered inside another page (Roster Builder) for opts.cardId, without the page title and search.
export function render(root, app, opts = {}) {
  const { D } = app;
  const prog = D.progression;
  const baseCard = opts.cardId ? app.card(opts.cardId) : app.card();
  const b = app.build(baseCard);
  b.extraSkills ??= [null, null, null, null, null];
  const card = withExtraSkills(baseCard, b);
  const alloc = b.custom;
  const sum = summarize(card, prog, alloc, D.skills);
  const curves = curvesFrom(D.breakpoints);
  const boosts = skillBoosts(card, D.skills);
  const owned = matchCardSkills(card.skills, D.skills);
  const ctx0 = cardCtx(D, card);
  const mgr = applyManager(D, ctx0);
  const sug = card.progressionPoints ? suggestions(app, card, ctx0, combineBoosters(b.boosters, b.booster2, D.boosters)) : null;
  const pct = card.progressionPoints ? Math.min(100, (sum.spent / card.progressionPoints) * 100) : 0;
  const ovr = card.overall ?? card.positionRating;

  root.innerHTML = `
  ${opts.embedded ? '' : `<div class="row" style="margin-bottom:14px">
    <h1 style="margin:0">Build Planner</h1><span class="spacer"></span>
    <div class="search">
      <input placeholder="Search player… (${app.state.cards.length} cards)" value="${esc(ui.q)}" data-action="q" autocomplete="off">
      <div class="results" data-results></div>
    </div>
  </div>`}

  <div class="card hero">
    <div class="ovr ${statColor(ovr)}">${esc(ovr ?? '–')}<small>${esc(card.position)}</small></div>
    <div style="min-width:0">
      <h2 style="margin:0 0 2px">${esc(card.name)}</h2>
      <div class="muted"><span title="Offensive playing style">⚔ ${esc(card.playingStyle || '—')}</span> · <span title="Defensive playing style">🛡 ${esc(card.defensivePlayingStyle || 'no defensive style')}</span> · ${esc(card.version)}${card.fictional ? ' · <span class="badge b-sim">fictional demo</span>' : ''}</div>
      <div class="muted" style="font-size:12px">${[card.height && `Height ${card.height}`, card.weight && `Weight ${card.weight}`, card.age && `Age ${card.age}`, card.foot && `Foot ${card.foot}`].filter(Boolean).map(esc).join(' · ')}
        ${card.boostedOverall && card.boostedOverall !== ovr ? ` · OVR with boosters <b class="t-boost">${card.boostedOverall}</b>` : ''}
        ${card.maxOverall ? ` · eFHUB max OVR <b>${card.maxOverall}</b>` : ''}
        ${card.boosterNames?.length ? `<div class="row" style="gap:4px;margin-top:4px">${card.boosterNames.map((n) => `<span class="chip boostchip">${esc(n)}</span>`).join('')}</div>` : ''}${card.source?.url ? ` · <a href="${esc(card.source.url)}" target="_blank" rel="noopener">eFHUB ↗</a>` : ''}</div>
    </div>
    <span class="spacer"></span>
    <div style="min-width:220px">
      <div class="row"><b>Progression points</b><span class="spacer"></span><span class="kpi" style="font-size:18px">${sum.spent} / ${card.progressionPoints}</span></div>
      <div class="budget"><i style="width:${pct}%"></i></div>
      <div class="row" style="font-size:12px;margin-top:4px">
        <span class="${sum.left ? 'warn-t' : 'muted'}">${sum.left ? `${sum.left} left to spend` : card.progressionPoints ? 'All points spent' : 'This card has no progression points'}</span>
        <span class="spacer"></span>
        ${sum.wastedPoints ? `<span class="down">${sum.wastedPoints} pts wasted</span>` : '<span class="up">No wasted points</span>'}
        <button class="small" data-action="reset">Reset</button>
      </div>
    </div>
  </div>

  ${sug ? `<div class="sugg">
    ${Object.entries(sug.out).map(([k, s]) => `<button class="sug ${s.featured ? 'featured' : ''} ${JSON.stringify(s.allocation) === JSON.stringify(alloc) ? 'applied' : ''}" data-apply="${k}" title="${esc(s.desc)}"><b>${esc(s.name)}</b><em>${s.spent} pts · <span class="${s.lost ? 't-lost' : 'up'}">${s.lost} lost to cap</span> · apply</em></button>`).join('')}
    <label class="f" style="min-width:160px">Role<select data-action="role">${sug.roles.map((r) => `<option ${r === ui.role ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
  </div>
  ${(() => { const s = Object.values(sug.out).find((x) => JSON.stringify(x.allocation) === JSON.stringify(alloc)); return s ? `<p class="sugdesc"><b>${esc(s.name)}:</b> ${esc(s.desc)}</p>` : ''; })()}
` : ''}

  <div class="grid g-plan">
    <div class="card">
      ${managerBox(D, mgr)}
      <h2 style="margin-top:16px">Spend points</h2>
      ${sum.rows.map((r) => `
        <div class="cat2 ${r.status}" title="${esc([tipText(r, sum.left), dimText(r, curves)].filter(Boolean).join(' · '))}">
          <span class="st">${r.status === 'capped' ? '⛔' : r.status === 'clipped' ? '⚠' : dimText(r, curves) ? '<span class="dimico">&#8600;</span>' : ''}</span>
          <b>${esc(r.label)}</b>
          <button class="step" data-dec="${r.id}" ${r.level ? '' : 'disabled'} aria-label="Remove a level">−</button>
          <span class="lv">${r.level}</span>
          <button class="step" data-inc="${r.id}" ${r.canAdd ? '' : 'disabled'} aria-label="Add a level" title="Next level costs ${r.nextCost} pts">+</button>
        </div>`).join('')}
    </div>

    <div class="grid" style="align-content:start">
      ${breakdownCard(app, card, b, alloc)}

      <div class="card">
        <h2>Skills</h2>
        ${owned.known.map((id) => skillRow(D, card, sum, id)).join('')}
        ${owned.unknown.length ? `<div class="row" style="margin-top:8px">${owned.unknown.map((s) => `<span class="chip plain">${esc(s)}</span>`).join('')}</div>` : ''}
        ${card.comSkills?.length ? `<div class="row" style="margin-top:6px"><span class="muted" style="font-size:12px">COM:</span>${card.comSkills.map((s) => `<span class="chip plain">${esc(s)}</span>`).join('')}</div>` : ''}
        <h3>Additional skills · ${b.extraSkills.filter(Boolean).length}/5</h3>
        <div class="slots">${b.extraSkills.map((s, i) => `<select class="slot ${s ? 'on' : ''}" data-slot="${i}">
          <option value="">+ Add skill</option>
          ${skillOptions(app, baseCard, b, s)}</select>`).join('')}</div>
      </div>

      ${physicsCard(card)}
    </div>
  </div>`;

  // Search box: re-render only the result list so the input keeps focus.
  const input = root.querySelector('[data-action=q]');
  const results = root.querySelector('[data-results]');
  const showResults = () => {
    const q = ui.q.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    const hits = app.state.cards.filter((c) => `${c.name} ${c.playingStyle} ${c.position}`.toLowerCase().includes(q)).slice(0, 15);
    results.innerHTML = hits.map((c) => `<div class="res" data-pick="${esc(c.id)}"><b>${esc(c.overall ?? '')}</b> ${esc(c.position)} · ${esc(c.name)} <span class="muted">${esc(c.playingStyle)} · ${c.progressionPoints} pts</span></div>`).join('') || '<div class="res muted">No match</div>';
    results.querySelectorAll('[data-pick]').forEach((el) => el.addEventListener('mousedown', () => { ui.q = ''; app.selectCard(el.dataset.pick); }));
  };
  if (input) {
    input.addEventListener('input', () => { ui.q = input.value; showResults(); });
    input.addEventListener('blur', () => setTimeout(() => (results.innerHTML = ''), 150));
    showResults();
  }

  root.querySelectorAll('[data-inc]').forEach((el) => el.addEventListener('click', () => { alloc[el.dataset.inc] = (alloc[el.dataset.inc] ?? 0) + 1; app.update(); }));
  root.querySelectorAll('[data-dec]').forEach((el) => el.addEventListener('click', () => { alloc[el.dataset.dec] = Math.max(0, (alloc[el.dataset.dec] ?? 0) - 1); app.update(); }));
  root.querySelector('[data-action=reset]').addEventListener('click', () => { b.custom = emptyAllocation(prog); app.update(); });
  root.querySelectorAll('[data-apply]').forEach((el) => el.addEventListener('click', () => { b.custom = { ...sug.out[el.dataset.apply].allocation }; app.update(); }));
  root.querySelectorAll('[data-lab]').forEach((el) => el.addEventListener('click', () => { app.state.lab.selected = el.dataset.lab; }));
  root.querySelectorAll('[data-ctx]').forEach((el) => el.addEventListener('click', () => {
    const c = ui.ctx, v = el.dataset.val;
    if (el.dataset.ctx === 'skill') c.active = toggleSkill(c.active, v);
    else if (el.dataset.ctx === 'boostersOff') c.boostersOff = v === '1';
    else c[el.dataset.ctx] = v;
    app.update();
  }));
  root.querySelector('[data-action=booster2]')?.addEventListener('change', (e) => { b.booster2 = e.target.value || null; app.update(); });
  root.querySelector('[data-action=opp]')?.addEventListener('change', (e) => { ui.ctx.opponents = Number(e.target.value); app.update(); });
  // Additional skill slots: newly added skills start switched on.
  root.querySelectorAll('[data-slot]').forEach((el) => el.addEventListener('change', () => {
    b.extraSkills[Number(el.dataset.slot)] = el.value || null;
    const c = cardCtx(D, withExtraSkills(baseCard, b));
    const now = withExtraSkills(baseCard, b);
    const ids = [...toggleableSkills(now, D.skills).filter((t) => !t.fromTeammate && t.id && now.skills.some((s) => s.toLowerCase() === t.name.toLowerCase() || (t.id === 'ordinary_heading' && s === 'Heading'))).map((t) => t.id)];
    for (const id of ids) if (!c.active.includes(id)) c.active = toggleSkill(c.active, id);
    app.update();
  }));
  // Manager picker
  const mInput = root.querySelector('[data-action=mq]');
  const mRes = root.querySelector('[data-mresults]');
  const showManagers = () => {
    const q = ui.mq.trim().toLowerCase();
    if (!q) { mRes.innerHTML = ''; return; }
    const st = ui.manager.playstyle;
    const hits = (D.managers ?? []).filter((m) => m.name.toLowerCase().includes(q)).sort((x, y) => y[st] - x[st]).slice(0, 12);
    mRes.innerHTML = hits.map((m) => `<div class="res" data-mpick="${esc(m.id)}"><b class="t-mgr">${m[st]}</b> ${esc(m.name)} <span class="muted">${esc(m.boosts.join(' · '))}</span></div>`).join('') || '<div class="res muted">No match</div>';
    mRes.querySelectorAll('[data-mpick]').forEach((el) => el.addEventListener('mousedown', () => { ui.manager.id = el.dataset.mpick; ui.mq = ''; app.update(); }));
  };
  mInput?.addEventListener('input', () => { ui.mq = mInput.value; showManagers(); });
  mInput?.addEventListener('blur', () => setTimeout(() => (mRes.innerHTML = ''), 150));
  root.querySelector('[data-action=mstyle]')?.addEventListener('change', (e) => { ui.manager.playstyle = e.target.value; app.update(); });
  root.querySelector('[data-action=mclear]')?.addEventListener('click', () => { ui.manager.id = null; app.update(); });
  root.querySelector('[data-action=prof]')?.addEventListener('change', (e) => { ui.manager.proficiency = Number(e.target.value); app.update(); });
  root.querySelector('[data-action=role]')?.addEventListener('change', (e) => { ui.role = e.target.value; ui.suggestions = null; app.update(); });
}

// ---------- Stat breakdown (base → training → condition → manager → skills → 99 cap → boosters) ----------
const SRC = [
  ['base', 'Base', 'Card stat at max level'],
  ['prog', 'Training', 'Your progression points'],
  ['cond', 'Condition', 'Condition arrow (form)'],
  ['mgr', 'Manager', 'Manager proficiency adjustment'],
  ['skill', 'Skills', 'In-match skill bonus while active'],
  ['boost', 'Booster', 'Booster (added after the 99 cap)'],
  ['lost', 'Lost to cap', 'Points that go above 99 and are discarded'],
];
const CONDS = [['A', '↑', 'Excellent'], ['B', '↗', 'Good'], ['C', '→', 'Normal'], ['D', '↘', 'Bad'], ['E', '↓', 'Very bad']];
const SCALE = 110; // bar width = 110 so post-cap boosters fit; the cap marker sits at 99
const pctOf = (v) => `${(Math.max(0, v) / SCALE) * 100}%`;

function bar(r, bps = []) {
  const s1 = Math.min(r.A, 99), s2 = Math.min(r.B, 99), s3 = r.afterCondition, s4 = Math.min(r.afterManager, 99), s5 = r.ordinary, s6 = r.extended;
  const lost = r.capLoss + Math.max(0, r.B - 99);
  const seg = (cls, from, to, title) => (to > from ? `<i class="seg s-${cls}" style="left:${pctOf(from)};width:${pctOf(to - from)}" title="${esc(title)}"></i>` : '');
  return `<div class="sbar">
    ${seg('base', 0, s1, `Base ${r.A}`)}${seg('prog', s1, s2, `Training +${r.prog}`)}
    ${s3 >= s2 ? seg('cond', s2, s3, `Condition +${s3 - s2}`) : seg('neg', s3, s2, `Condition ${r.cond}`)}
    ${seg('mgr', Math.min(s3, 99), s4, `Manager +${r.mgr}`)}${seg('skill', s4, s5, `Skills +${s5 - s4}`)}
    ${seg('boost', s5, s6, `Booster +${s6 - s5}`)}
    ${lost ? seg('lost', s6, s6 + lost, `${lost} lost to the 99 cap`) : ''}
    ${bps.map((b) => `<b class="bp ${r.extended >= b.at ? 'hit' : ''}" style="left:${pctOf(b.at)}" title="${esc(`${b.at} · ${b.label}: ${b.effect} (community, ${b.confidence})`)}"></b>`).join('')}
    <b class="cap" style="left:${pctOf(99)}" title="99 cap"></b></div>`;
}

const cell = (v, cls, title) => (v ? `<td class="n t-${cls}" title="${esc(title)}">${v > 0 ? '+' : ''}${v}</td>` : '<td class="n dim">·</td>');

function boosterOption(D, name, current) {
  const x = D.boosters.slot2.find((b) => b.name === name);
  if (!x) return '';
  return `<option value="${esc(name)}" ${current === name ? 'selected' : ''}>${esc(name)} +1 — ${x.attrs.map((a) => LABELS[a]).join(', ')}</option>`;
}

// Skills that can never be active at the same moment (score state / possession).
const EXCLUSIVE = [['fortress', 'game_changing_pass'], ['momentum_dribbling', 'attacking_surge']];
function withoutConflicts(ids) {
  return ids.filter((id) => !EXCLUSIVE.some(([a, b2]) => id === b2 && ids.includes(a)));
}
function toggleSkill(active, id) {
  if (active.includes(id)) return active.filter((x) => x !== id);
  const rival = EXCLUSIVE.find((p) => p.includes(id))?.find((x) => x !== id);
  return [...active.filter((x) => x !== rival), id];
}

function breakdownCard(app, card, b, alloc) {
  const { D } = app;
  const toggles = toggleableSkills(card, D.skills).filter((t) => t.kind !== 'local'); // action-only bonuses are not shown
  const ctx = cardCtx(D, card);
  ui.ctx = ctx;
  ctx.active = ctx.active.filter((id) => toggles.some((t) => t.id === id));
  // Slot 1 = the card's own booster(s). Slot 2 = selectable +1 booster when the card's second slot is empty (as on eFHUB).
  const cardNames = card.boosterNames?.length ? card.boosterNames : Object.entries(b.boosters ?? {}).filter(([, v]) => v).map(([a, v]) => `${LABELS[a]} +${v}`);
  const slot2Free = cardNames.length < 2;
  if (!slot2Free) b.booster2 = null;
  const allBoosters = combineBoosters(b.boosters, b.booster2, D.boosters);
  const rows = statBreakdown(card, D.progression, alloc, D.mechanics, D.skills, { ...ctx, rating: b.rating, boosters: ctx.boostersOff ? {} : allBoosters });
  const hasBoosters = Object.values(b.boosters ?? {}).some(Boolean);
  const boosterNames = [...cardNames, ...(b.booster2 ? [`${b.booster2} +1`] : [])];
  const unsplit = card.source?.method === 'scraper' && !card.boostersSeparated;
  const vals = Object.values(rows);
  const bpsByStat = {};
  for (const bp of D.breakpoints?.breakpoints ?? []) if (!bp.needsSkill || (card.skills ?? []).includes(bp.needsSkill)) (bpsByStat[bp.stat] ??= []).push(bp);
  const totals = {
    prog: vals.reduce((s, r) => s + r.prog, 0), lost: vals.reduce((s, r) => s + r.capLoss + Math.max(0, r.B - 99), 0),
    maxed: vals.filter((r) => r.ordinary >= 99).length,
  };
  const pill = (attr, val, cur, label, title = '') => `<button class="pill ${cur ? 'on' : ''}" data-ctx="${attr}" data-val="${esc(val)}" title="${esc(title)}">${label}</button>`;
  return `<div class="card breakdown">
    <div class="row" style="align-items:flex-start">
      <h2 style="margin:0">Stats</h2>
      <span class="spacer"></span>
      <div class="kpis"><span><b>${totals.maxed}</b> at 99</span><span class="${totals.lost ? 't-lost' : ''}"><b>${totals.lost}</b> pts lost to cap</span></div>
    </div>

    <div class="ctxbar">
      <div><label>Condition</label><div class="pills">${CONDS.map(([k, arr, name]) => pill('condition', k, ctx.condition === k, `<span class="arrow a-${k}">${arr}</span>${k}`, name)).join('')}</div></div>
      <div><label>Boosters</label><div class="pills">
        ${hasBoosters ? `<button class="pill boost ${ctx.boostersOff ? '' : 'on'}" data-ctx="boostersOff" data-val="${ctx.boostersOff ? '' : '1'}" title="Card booster(s) from eFHUB — click to compare without boosters">${cardNames.map(esc).join(' · ')}</button>`
          : `<span class="muted" style="font-size:12px">${unsplit ? 'Card booster not separated yet' : 'No card booster'}</span>`}
        ${slot2Free ? `<select class="slot2 ${b.booster2 ? 'on' : ''}" data-action="booster2" title="Second booster slot (+1 to four stats)">
          <option value="">+ Slot 2 booster…</option>
          <optgroup label="Community picks">${D.boosters.communityPicks.map((n) => boosterOption(D, n, b.booster2)).join('')}</optgroup>
          <optgroup label="All boosters">${D.boosters.slot2.map((x) => boosterOption(D, x.name, b.booster2)).join('')}</optgroup>
        </select>` : ''}</div></div>
      ${toggles.length ? `<div style="flex:1 1 100%"><label>Skills active in this moment</label><div class="pills">${toggles.map((t) =>
        pill('skill', t.id, ctx.active.includes(t.id), `${t.fromTeammate ? '<span class="tm">teammate</span>' : ''}${t.kind === 'local' ? '<span class="zap">⚡</span>' : ''}${esc(t.name)}`, `${t.kind === 'local' ? 'Action bonus · ' : ''}When: ${t.when}`)).join('')}
        ${toggles.some((t) => t.id === 'magnetic_feet') && ctx.active.includes('magnetic_feet') ? `<span class="opp">Opponents within 5 m <input type="range" min="1" max="4" value="${ctx.opponents}" data-action="opp"> <b>${ctx.opponents}</b></span>` : ''}</div></div>` : ''}
    </div>
    ${skillCaps(D, ctx.active, rows, ctx.opponents)}

    ${unsplit ? `<div class="notice" style="margin-top:0">Booster not separated yet for this card (re-scrape pending).</div>` : ''}
    <div class="legend2">${SRC.map(([k, l, t]) => `<span title="${esc(t)}"><i class="dot2 s-${k}"></i>${l}</span>`).join('')}<span><i class="capmark"></i>99 cap</span></div>

    <div class="xscroll"><table class="bk">
      <thead><tr><th>Stat</th><th class="n">Base</th><th class="n t-prog">Train</th><th class="n t-boost">Boost</th><th class="n t-mgr">Mgr</th><th class="n ingame" title="What the game shows: base + training + booster + manager">In-game</th><th class="n t-cond">Cond</th><th class="n t-skill" title="In-match stat bonus while the skill is active (goes through the 99 cap)">Skill</th><th class="n">Final</th><th style="width:34%"></th></tr></thead>
      <tbody>${Object.entries(GROUPS).map(([g, attrs]) => `<tr class="grp"><td colspan="10">${g}</td></tr>${attrs.map((a) => {
        const r = rows[a];
        const lost = r.capLoss + Math.max(0, r.B - 99);
        return `<tr class="${lost ? 'has-lost' : ''}">
          <td>${LABELS[a]}${lost ? ` <span class="lostchip" title="${lost} points above 99 are discarded">−${lost}</span>` : ''}${bpChip(r, bpsByStat[a])}</td>
          <td class="n">${r.A}</td>
          ${cell(r.prog, 'prog', 'Training')}
          ${cell(r.boost, 'boost', `Booster: ${boosterNames.join(', ')} (applied after the 99 cap)`)}
          ${cell(r.mgr, 'mgr', `Proficiency +${r.mgrProf}${r.mgrBoost ? ` · manager boost +${r.mgrBoost}` : ''}`)}
          <td class="n ingame"><b class="${statColor(r.ingame)}">${r.ingame}</b></td>
          ${cell(r.cond, r.cond < 0 ? 'neg' : 'cond', 'Condition arrow')}
          ${r.skill ? `<td class="n t-skill" title="${esc(r.sources.join(', '))}">+${r.skill}</td>` : '<td class="n dim">·</td>'}
          <td class="n"><b class="final ${statColor(r.extended)} ${r.ordinary >= 99 ? 'is-max' : ''}">${r.extended}</b></td>
          <td>${bar(r, bpsByStat[a])}</td></tr>`;
      }).join('')}`).join('')}</tbody>
    </table></div>
  </div>`;
}

// Compact skill line: name · magnitude · cap-loss chip (if this build clips the bonus).
function skillRow(D, card, sum, id) {
  const s = D.skills.skills.find((x) => x.id === id) ?? D.skills.auxiliarySkills.find((x) => x.id === id);
  if (!s.effectCategory) return `<div class="skl"><span class="zap">⚡</span><b>${esc(s.name)}</b></div>`;
  const local = s.effectCategory === 'local_ability';
  const tempE = s.effects.find((e) => e.target === 'self' && (e.kind === 'temp' || e.kind === 'temp_scaled'));
  let clip = '';
  if (tempE && !(s.eligiblePositions && !s.eligiblePositions.includes(card.position))) {
    const amt = tempE.kind === 'temp' ? tempE.amount : tempE.perUnit * tempE.maxUnits;
    const stats = sum.rows.flatMap((r) => r.stats);
    const lost = tempE.attrs.reduce((n, a) => n + Math.max(0, (stats.find((x) => x.attr === a)?.now ?? card.stats[a]) + amt - 99), 0);
    if (lost) clip = `<span class="lostchip" title="Lost to the 99 cap while active">−${lost}</span>`;
  }
  return `<div class="skl" title="${esc(s.summary)}">
    ${local ? '<span class="zap">⚡</span>' : ''}<b>${esc(s.name)}</b>${clip}
    <span class="spacer"></span><span class="muted">${esc(s.magnitude.split(';')[0])}</span>
    <a href="#/lab" data-lab="${s.id}" title="Skills Lab">↗</a></div>`;
}

// Next level of this category lands in a diminishing-returns zone (e.g. Speed above 90): what each point is worth.
function dimText(r, curves) {
  const parts = [];
  for (const s of r.stats) {
    const seg = (curves[s.attr] ?? []).filter((b) => s.now + 1 > b.at).pop();
    if (seg && s.now < 99) parts.push(`${s.label} next point ≈${seg.valueFactor.toFixed(2)} (above ${seg.at})`);
  }
  return parts.join(', ');
}

function tipText(r, left) {
  if (r.status === 'capped') return 'All stats at 99';
  const parts = [];
  if (r.nextClipped.length) parts.push(`Next level clips: ${r.nextClipped.join(', ')}`);
  if (r.hardStop > r.level) parts.push(`99 at Lv ${r.hardStop}`);
  if (r.skillStop !== null && r.skillStop > r.level) parts.push(`Skill limit Lv ${r.skillStop}`);
  if (r.nextCost > left) parts.push(`Next ${r.nextCost} pts (${left} left)`);
  return parts.join(' · ');
}

// Manager picker: search a real manager (proficiency from the chosen team playstyle) or set proficiency directly.
function managerBox(D, m) {
  const st = ui.manager.playstyle;
  const prof = m ? (m[st] || 70) : ui.manager.proficiency;
  return `<div class="mgrbox">
    <div class="row" style="gap:8px">
      <h2 style="margin:0">Manager</h2><span class="spacer"></span>
      <select data-action="mstyle" class="mini">${PLAYSTYLES.map(([k, l]) => `<option value="${k}" ${k === st ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="search" style="width:100%;margin-top:8px">
      <input data-action="mq" placeholder="${m ? esc(m.name) : `Search ${(D.managers ?? []).length} managers…`}" value="${esc(ui.mq)}" autocomplete="off">
      <div class="results" data-mresults></div>
    </div>
    ${m ? `<div class="row mchosen"><b>${esc(m.name)}</b>${m.boosts.map((x) => `<span class="chip mgrchip">${esc(x)}</span>`).join('')}<span class="spacer"></span><button class="small" data-action="mclear" title="Remove manager">✕</button></div>` : ''}
    <div class="row" style="gap:10px;margin-top:8px">
      <span class="muted" style="font-size:12px">Proficiency</span>
      <input type="range" min="70" max="90" value="${prof}" data-action="prof" ${m ? 'disabled' : ''} style="flex:1;padding:0;accent-color:var(--src-mgr)">
      <b class="t-mgr mono" style="min-width:22px">${prof}</b>
    </div>
  </div>`;
}

const PHYS = { legCoverageRadius: 'Leg coverage radius', armCoverageRadius: 'Arm coverage radius', jumpingHeight: 'Jumping height', torsoCollision: 'Torso collision', legLengthBasedHeight: 'Leg-length based height' };
const MODEL = { armLength: 'Arm length', shoulderWidth: 'Shoulder width', neckLength: 'Neck length', chest: 'Chest', neckSize: 'Neck size', shoulderHeight: 'Shoulder height', legLength: 'Leg length', thighSize: 'Thigh size', waistSize: 'Waist size', armSize: 'Arm size', calfSize: 'Calf size' };

function physicsCard(card) {
  if (!card.physics && !card.model) return '';
  const other = [['Weak Foot Usage', card.weakFootUsage], ['Weak Foot Accuracy', card.weakFootAccuracy], ['Form', card.form], ['Injury Resistance', card.injuryResistance]].filter(([, v]) => v);
  return `<div class="card"><h2>Physics</h2>
    <div class="grid g2">
      <div>${Object.entries(PHYS).filter(([k]) => card.physics?.[k] !== undefined).map(([k, l]) => `<div class="srow"><span>${l}</span><span class="spacer"></span><b class="mono">${esc(card.physics[k])}</b></div>`).join('')}
        ${other.map(([l, v]) => `<div class="srow"><span>${l}</span><span class="spacer"></span><b>${esc(v)}</b></div>`).join('')}</div>
      <div><h3 style="margin-top:0">Player model</h3>${Object.entries(MODEL).filter(([k]) => card.model?.[k] !== undefined).map(([k, l]) => `
        <div class="srow"><span>${l}</span><span class="spacer"></span><b class="mono">${esc(card.model[k])}</b></div>`).join('')}</div>
    </div>
    </div>`;
}

// Community breakpoint chip: the next threshold within 3 points, or "↘" once past a diminishing-returns line.
function bpChip(r, bps = []) {
  const v = r.extended;
  let out = '';
  // Past a diminishing-returns line: how many raw points are "lost" vs their full value (Amadeusz curve).
  const curve = bps.filter((b) => b.valueFactor != null).sort((a, b) => a.at - b.at);
  const past = curve.filter((b) => v > b.at).pop();
  if (past) {
    const loss = v - curveValue(v, curve);
    out += ` <span class="bpchip dim" title="${esc(`${v} counts as ≈${(v - loss).toFixed(1)}: ${curve.map((b) => `above ${b.at} each point ≈${b.valueFactor.toFixed(2)}`).join('; ')} (community, ${past.confidence})`)}">&#8600; −${loss.toFixed(1)} eff.</span>`;
  }
  const next = bps.filter((b) => b.at > v && b.at - v <= 3).sort((a, b) => a.at - b.at)[0];
  if (next) out += ` <span class="bpchip" title="${esc(`${next.label}: ${next.effect} (community, ${next.confidence})`)}">&#9670;${next.at} ${esc(next.label)}</span>`;
  return out;
}
