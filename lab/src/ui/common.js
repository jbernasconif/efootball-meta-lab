// Shared UI helpers: escaping, badges, card picker, scenario form, pitch.
import { ACTIONS, countNearbyOpponents, inBox } from '../engine/scenario.js';
import { POSITIONS } from '../engine/attributes.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Search text without accents or case: "kovac" finds "Niko Kovač", "vinicius" finds "Vinícius".
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').replace(/[łŁ]/g, 'l').replace(/ø/gi, 'o').toLowerCase();
export const fmt = (v, d = 2) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(d)) : esc(v));
export const signed = (v) => (v > 0 ? `+${fmt(v)}` : v < 0 ? fmt(v) : '0');

const VAL_BADGE = {
  constructed_validated: ['b-doc', 'A · validated (constructed scenarios)'],
  code_documented: ['b-doc', 'B · documented (code)'],
  partial: ['b-warn', 'C · partial'],
};
export function validationBadge(level) {
  const [cls, txt] = VAL_BADGE[level] ?? ['', level];
  return `<span class="badge ${cls}">${txt}</span>`;
}
export function statusBadge(status) {
  const map = {
    documented: ['b-doc', 'Documented'], hypothesis: ['b-hyp', 'Hypothesis'], hypothesis_generalized: ['b-hyp', 'Hypothesis (generalised)'],
    inferred: ['b-warn', 'Inferred'], verified: ['b-doc', 'Verified on eFHUB'], partial: ['b-warn', 'Partial'], unverified: ['b-ko', 'Unverified'], uncertain: ['b-warn', 'Uncertain'], simulation: ['b-sim', 'Simulation'],
  };
  const [cls, txt] = map[status] ?? ['', status];
  return `<span class="badge ${cls}">${txt}</span>`;
}

export function cardPicker(app) {
  const cur = app.card();
  return `<label class="f">Card<select data-action="pick-card">${app.state.cards.map((c) =>
    `<option value="${esc(c.id)}" ${c.id === cur.id ? 'selected' : ''}>${esc(c.name)} · ${esc(c.position)} ${esc(c.overall ?? '')} · ${esc(c.version)}${c.fictional ? ' (fictional)' : ''}</option>`).join('')}</select></label>`;
}
export function bindCardPicker(root, app) {
  root.querySelectorAll('[data-action=pick-card]').forEach((el) => el.addEventListener('change', () => app.selectCard(el.value)));
}

const opt = (pairs) => pairs.map(([v, l]) => ({ v, l }));
export const SCENARIO_FIELDS = [
  { g: 'Match', k: 'half', l: 'Period', t: 'select', o: opt([[1, '1st half'], [2, '2nd half'], [3, 'Extra time 1'], [4, 'Extra time 2']]) },
  { g: 'Match', k: 'scoreState', l: 'Score', t: 'select', o: opt([['ahead', 'Winning'], ['level', 'Drawing'], ['behind', 'Losing']]) },
  { g: 'Match', k: 'isSubstitute', l: 'Substitute', t: 'bool' },
  { g: 'Match', k: 'subEntry', l: 'Sub came on', t: 'select', o: opt([['first_half', '1st half'], ['second_half', 'Half-time / 2nd half'], ['et_first', 'Before / in ET 1st half'], ['et_second', 'ET interval / ET 2nd half']]) },
  { g: 'Match', k: 'inPlay', l: 'Live play (IN_PLAY)', t: 'bool' },
  { g: 'Match', k: 'condition', l: 'Condition arrow', t: 'select', o: opt([['A', 'A ↑ Excellent'], ['B', 'B ↗ Good'], ['C', 'C → Normal'], ['D', 'D ↘ Bad'], ['E', 'E ↓ Very bad']]) },
  { g: 'Match', k: 'managerLevel', l: 'Manager', t: 'select', o: opt([['none', 'No adjustment'], ['89', 'Proficiency 89 (only documented)']]) },
  { g: 'Possession & action', k: 'possession', l: 'Ball', t: 'select', o: opt([['self', 'On the ball (holder)'], ['teammate', 'Teammate has the ball'], ['opponent', 'Opponent has the ball'], ['none', 'Loose ball']]) },
  { g: 'Possession & action', k: 'role', l: 'Formation position', t: 'select', o: POSITIONS.map((p) => ({ v: p, l: p })) },
  { g: 'Possession & action', k: 'action', l: 'Action', t: 'select', o: Object.entries(ACTIONS).map(([v, l]) => ({ v, l })) },
  { g: 'Position on pitch', k: 'player.x', l: 'Player x (m from halfway)', t: 'num', step: 0.5 },
  { g: 'Position on pitch', k: 'player.y', l: 'Player y (m lateral)', t: 'num', step: 0.5 },
  { g: 'Position on pitch', k: 'nearbyOpponentsOverride', l: 'Opponents within 5 m', t: 'select', o: [{ v: 'null', l: 'From the pitch' }, ...[0, 1, 2, 3, 4, 5, 6].map((n) => ({ v: n, l: String(n) }))] },
  { g: 'Position on pitch', k: 'ball.x', l: 'Ball x (m)', t: 'num', step: 0.5 },
  { g: 'Teammate providers', k: 'providerAttackTrigger', l: 'Teammate holder has Attack Trigger', t: 'bool' },
  { g: 'Teammate providers', k: 'gkDirectingDefence', l: 'GK has Directing Defence', t: 'bool' },
  { g: 'Teammate providers', k: 'gkSpiritRoar', l: 'GK has Spirit Roar', t: 'bool' },
  { g: 'Teammate providers', k: 'visionaryMarker', l: 'Receiving a Visionary Pass', t: 'bool' },
  { g: 'Teammate providers', k: 'markerCleared', l: 'Marker cleared (trap/contact dribble)', t: 'bool' },
  { g: 'Action detail', k: 'lastContact', l: 'Last touch', t: 'select', o: opt([['none', '—'], ['opponent_pass', 'Opponent pass/throw'], ['teammate_pass', 'Own team pass/throw'], ['other', 'Other']]) },
  { g: 'Action detail', k: 'moveAngleToOwnEnd', l: 'Angle toward own end (°)', t: 'num', step: 5 },
  { g: 'Action detail', k: 'passGet', l: 'PASS_GET state', t: 'bool' },
  { g: 'Action detail', k: 'ballHigher', l: 'Ball higher than player', t: 'bool' },
  { g: 'Action detail', k: 'ballOrigin', l: 'Ball origin', t: 'select', o: opt([['open_play', 'Open play'], ['set_piece', 'Goal kick/corner/free kick']]) },
  { g: 'Action detail', k: 'storedPointInOwnBox', l: 'Stored point in own box', t: 'bool' },
  { g: 'Action detail', k: 'specialMotion', l: 'Special motion', t: 'bool' },
  { g: 'Action detail', k: 'shotPower', l: 'Power (0–1)', t: 'num', step: 0.05 },
  { g: 'Action detail', k: 'distance', l: 'Planned distance (m)', t: 'num', step: 1 },
  { g: 'Action detail', k: 'ballSpeedBeforeKick', l: 'Ball speed before kick (km/h)', t: 'num', step: 1 },
  { g: 'Action detail', k: 'lateralTarget', l: '|Lateral target| (m)', t: 'num', step: 0.5 },
  { g: 'Action detail', k: 'releaseAngle', l: 'Release angle (°)', t: 'num', step: 1 },
  { g: 'Action detail', k: 'inputAngle', l: 'Input-to-body angle (°)', t: 'num', step: 1 },
  { g: 'Action detail', k: 'headerDirectionDiff', l: 'Header direction mismatch (°)', t: 'num', step: 5 },
  { g: 'Action detail', k: 'ordinaryPassing', l: 'Ordinary passing skill (+5)', t: 'bool' },
  { g: 'Action detail', k: 'ordinaryShooting', l: 'Ordinary shooting skill (+5)', t: 'bool' },
  { g: 'Action detail', k: 'isCaptain', l: 'Captain', t: 'bool' },
  { g: 'Action detail', k: 'staminaConsumed', l: 'Fatigue consumed (%)', t: 'num', step: 5 },
  { g: 'Action detail', k: 'attacking', l: 'Team attacking', t: 'bool' },
];

const get = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
function set(o, path, v) { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

// only: optional Set of fact names; 'x'/'y' map to player.x/y; Partido group always shown.
export function scenarioForm(s, only) {
  const want = (f) => {
    if (!only || f.g === 'Match') return true;
    const k = f.k === 'player.x' ? 'x' : f.k === 'player.y' ? 'y' : f.k === 'nearbyOpponentsOverride' ? 'nearbyOpponents' : f.k === 'ball.x' ? 'ballCloserToOwnGoal' : f.k;
    return only.has(k) || (f.k === 'player.y' && (only.has('inOwnBox') || only.has('x'))) || (f.k === 'player.x' && only.has('inOwnBox')) || f.k === 'possession' || f.k === 'role' || f.k === 'action';
  };
  const groups = {};
  for (const f of SCENARIO_FIELDS.filter(want)) (groups[f.g] ??= []).push(f);
  return Object.entries(groups).map(([g, fs]) => `<h3>${g}</h3><div class="fields">${fs.map((f) => field(f, get(s, f.k))).join('')}</div>`).join('');
}

function field(f, v) {
  if (f.t === 'bool') return `<label class="f"><span>${f.l}</span><input type="checkbox" data-s="${f.k}" data-t="bool" ${v ? 'checked' : ''}></label>`;
  if (f.t === 'num') return `<label class="f">${f.l}<input type="number" step="${f.step}" data-s="${f.k}" data-t="num" value="${v}"></label>`;
  return `<label class="f">${f.l}<select data-s="${f.k}" data-t="select">${f.o.map((o) => `<option value="${o.v}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`;
}

export function bindScenario(root, app, scenario = app.state.scenario) {
  root.querySelectorAll('[data-s]').forEach((el) => el.addEventListener('change', () => {
    let v;
    if (el.dataset.t === 'bool') v = el.checked;
    else if (el.dataset.t === 'num') v = Number(el.value);
    else v = el.value === 'null' ? null : /^-?\d+(\.\d+)?$/.test(el.value) ? Number(el.value) : el.value;
    set(scenario, el.dataset.s, v);
    app.update();
  }));
}

// ---------- Pitch ----------
export function pitchSVG(s, pitch, { showBox = true, highlight = [] } = {}) {
  const L = pitch.halfLength, W = pitch.halfWidth, b = pitch.boxFrontFromHalfway, bw = pitch.boxHalfWidth, k = pitch.skillLine;
  const near = countNearbyOpponents(s.player, s.opponents);
  const hl = (id) => highlight.includes(id);
  return `
  <svg class="pitch" viewBox="${-L - 2} ${-W - 2} ${2 * L + 4} ${2 * W + 4}" data-pitch>
    <rect x="${-L}" y="${-W}" width="${2 * L}" height="${2 * W}" class="line"/>
    <line x1="0" y1="${-W}" x2="0" y2="${W}" class="line"/>
    <circle cx="0" cy="0" r="9.15" class="line"/>
    ${showBox ? `<rect x="${-L}" y="${-bw}" width="${L - b}" height="${2 * bw}" class="line" ${hl('ownBox') ? 'style="stroke:#e3b341;stroke-width:.5"' : ''}/>
    <rect x="${b}" y="${-bw}" width="${L - b}" height="${2 * bw}" class="line"/>` : ''}
    <line x1="${k}" y1="${-W}" x2="${k}" y2="${W}" class="zone" stroke="${hl('plus18') ? '#36c2a2' : '#3c6a57'}"/>
    <line x1="${-k}" y1="${-W}" x2="${-k}" y2="${W}" class="zone" stroke="${hl('minus18') ? '#4f8cff' : '#3c6a57'}"/>
    ${hl('plus18') ? `<rect x="${k}" y="${-W}" width="${L - k}" height="${2 * W}" fill="#36c2a2" opacity=".08"/>` : ''}
    ${hl('minus18') ? `<rect x="${-L}" y="${-W}" width="${L - k}" height="${2 * W}" fill="#4f8cff" opacity=".08"/>` : ''}
    ${hl('oppHalf') ? `<rect x="0" y="${-W}" width="${L}" height="${2 * W}" fill="#e3b341" opacity=".06"/>` : ''}
    <text x="${k + 0.6}" y="${-W + 3}" font-size="2.4" fill="#8fbfa8">+18</text>
    <text x="${-k + 0.6}" y="${-W + 3}" font-size="2.4" fill="#8fbfa8">−18</text>
    <text x="${L - 14}" y="${W - 1.2}" font-size="2.2" fill="#8fbfa8">attack →</text>
    <circle cx="${s.player.x}" cy="${s.player.y}" r="5" fill="#36c2a2" opacity=".1" stroke="#36c2a2" stroke-width=".2" stroke-dasharray=".6 .6"/>
    ${s.opponents.map((o, i) => `<circle class="drag" data-drag="opp" data-i="${i}" cx="${o.x}" cy="${o.y}" r="1.3" fill="#f85149" stroke="#fff" stroke-width=".2"/>`).join('')}
    <circle class="drag" data-drag="ball" cx="${s.ball.x}" cy="${s.ball.y}" r="0.9" fill="#fff" stroke="#000" stroke-width=".2"/>
    <circle class="drag" data-drag="player" cx="${s.player.x}" cy="${s.player.y}" r="1.6" fill="#36c2a2" stroke="#fff" stroke-width=".3"/>
  </svg>
  <div class="legend">
    <span><i class="dot" style="background:#36c2a2"></i>Player (${s.player.x.toFixed(1)}, ${s.player.y.toFixed(1)})</span>
    <span><i class="dot" style="background:#fff"></i>Ball</span>
    <span><i class="dot" style="background:#f85149"></i>Opponents within 5 m: ${near}</span>
    <span>Own box: ${inBox(s.player, pitch) ? 'yes' : 'no'}</span>
    <span class="spacer"></span>
    <button class="small" data-action="add-opp">+ opponent</button>
    <button class="small" data-action="del-opp">− opponent</button>
  </div>
  <p class="muted" style="font-size:12px;margin:4px 0 0">Drag the player, ball and opponents. Default pitch from the article (half 52.56 × 34.06 m); box width = regulation-size hypothesis.</p>`;
}

export function bindPitch(root, app, scenario = app.state.scenario) {
  const svg = root.querySelector('[data-pitch]');
  if (!svg) return;
  const L = app.D.mechanics.pitch.halfLength, W = app.D.mechanics.pitch.halfWidth;
  let drag = null;
  const toPitch = (e) => {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.max(-L, Math.min(L, Math.round(q.x * 10) / 10)), y: Math.max(-W, Math.min(W, Math.round(q.y * 10) / 10)) };
  };
  svg.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('[data-drag]');
    if (!t) return;
    drag = { el: t, kind: t.dataset.drag, i: Number(t.dataset.i) };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toPitch(e);
    drag.el.setAttribute('cx', p.x); drag.el.setAttribute('cy', p.y);
    drag.pos = p;
  });
  svg.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.pos) {
      if (drag.kind === 'player') scenario.player = drag.pos;
      else if (drag.kind === 'ball') scenario.ball = drag.pos;
      else scenario.opponents[drag.i] = drag.pos;
      if (drag.kind === 'opp') scenario.nearbyOpponentsOverride = null;
    }
    drag = null;
    app.update();
  });
  root.querySelector('[data-action=add-opp]')?.addEventListener('click', () => {
    const a = scenario.opponents.length * 1.3;
    scenario.opponents.push({ x: Math.max(-L, Math.min(L, scenario.player.x + 3 * Math.cos(a))), y: Math.max(-W, Math.min(W, scenario.player.y + 3 * Math.sin(a))) });
    scenario.nearbyOpponentsOverride = null;
    app.update();
  });
  root.querySelector('[data-action=del-opp]')?.addEventListener('click', () => { scenario.opponents.pop(); app.update(); });
}

export function checksList(checks) {
  if (!checks?.length) return '<div class="muted">No activation conditions (passive or per-action effect).</div>';
  return checks.map((c) => `<div class="check"><span class="i ${c.ok ? 'up' : 'down'}">${c.ok ? '✔' : '✘'}</span><span>${esc(c.label)}${c.fact && c.actual !== undefined ? ` <span class="muted mono">(${esc(c.fact)} = ${esc(JSON.stringify(c.actual))})</span>` : ''}</span></div>`).join('');
}
