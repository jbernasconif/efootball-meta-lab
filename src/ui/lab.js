import { esc, fmt, signed, scenarioForm, bindScenario, pitchSVG, bindPitch, checksList, validationBadge, statusBadge } from './common.js';
import { ATTRS, LABELS } from '../engine/attributes.js';
import { computePlayer } from '../engine/stats.js';
import { defaultScenario } from '../engine/scenario.js';
import { factsUsed, evaluate } from '../engine/predicate.js';
import { pipelineValue } from '../engine/stats.js';

const CATEGORY = {
  temporary_attribute: 'Stat boost',
  local_ability: 'Action bonus',
  motion_parameter: 'Motion / trajectory',
  penalty_fatigue: 'Pressure / fatigue',
};

// Starting scenario per skill so the lab opens on a case where the skill can activate.
const START = {
  shadow_hunt: { role: 'CB', possession: 'none', lastContact: 'opponent_pass', player: { x: -10, y: 0 }, ball: { x: -22, y: 6 }, moveAngleToOwnEnd: 30 },
  attack_trigger: { role: 'CF', providerAttackTrigger: true, possession: 'teammate', player: { x: 20, y: 5 } },
  attacking_surge: { role: 'CF', possession: 'teammate', player: { x: 12, y: -6 } },
  fortress: { role: 'CB', half: 2, scoreState: 'ahead', player: { x: -30, y: 0 } },
  super_sub: { isSubstitute: true, subEntry: 'second_half', half: 2 },
  momentum_dribbling: { role: 'CF', possession: 'self', player: { x: 25, y: 4 } },
  aerial_fort: { role: 'CB', possession: 'none', lastContact: 'opponent_pass', passGet: true, ballHigher: true, player: { x: -45, y: 2 }, ball: { x: -44, y: 2 } },
  gk_directing_defence: { role: 'CB', gkDirectingDefence: true, player: { x: -30, y: 0 } },
  gk_spirit_roar: { role: 'CB', gkSpiritRoar: true, half: 2, scoreState: 'ahead', player: { x: -30, y: 0 } },
  low_screamer: { role: 'CF', possession: 'self', action: 'stunning_shot', shotPower: 0.4, player: { x: 30, y: 0 } },
  acceleration_burst: { role: 'LWF', possession: 'self', action: 'dribble', inputAngle: 60, player: { x: 20, y: 20 } },
  long_reach_tackle: { role: 'CB', possession: 'opponent', action: 'tackle', player: { x: -25, y: 0 } },
  visionary_pass: { role: 'CF', possession: 'self', action: 'receive', visionaryMarker: true, player: { x: 28, y: 0 } },
  bullet_header: { role: 'CF', action: 'shot_header', headerDirectionDiff: 90, player: { x: 45, y: 0 } },
  phenomenal_pass: { role: 'CMF', possession: 'self', action: 'pass_ground', specialMotion: true, player: { x: 5, y: 0 } },
  phenomenal_finishing: { role: 'CF', possession: 'self', action: 'shot_footed', specialMotion: true, player: { x: 40, y: 0 } },
  game_changing_pass: { role: 'CMF', half: 2, scoreState: 'level' },
  edged_crossing: { role: 'RWF', possession: 'self', action: 'cross', distance: 22, ballSpeedBeforeKick: 15, player: { x: 38, y: 28 } },
  blitz_curler: { role: 'RWF', possession: 'self', action: 'controlled_shot', shotPower: 0.7, distance: 20, lateralTarget: 3, player: { x: 34, y: 18 } },
  magnetic_feet: { role: 'LWF', possession: 'self', player: { x: 30, y: 10 }, opponents: [{ x: 32, y: 11 }, { x: 28.5, y: 8 }, { x: 36, y: 15 }] },
  fighting_spirit: { role: 'CB', isCaptain: false, staminaConsumed: 70 },
};

const SPATIAL = { momentum_dribbling: ['plus18'], gk_directing_defence: ['minus18'], attacking_surge: ['oppHalf'], aerial_fort: ['ownBox'] };

const ui = { scenarioFor: null, scenario: null };

function labScenario(app, skillId) {
  if (ui.scenarioFor !== skillId) {
    ui.scenarioFor = skillId;
    ui.scenario = defaultScenario({ ...JSON.parse(JSON.stringify(START[skillId] ?? {})) });
    ui.scenario.ball ??= { x: 0, y: 0 };
  }
  return ui.scenario;
}

export function render(root, app) {
  const { D } = app;
  const L = app.state.lab;
  const q = L.query.toLowerCase();
  const list = D.skills.skills.filter((s) => (L.filter === 'all' || s.effectCategory === L.filter || s.validation === L.filter) &&
    (!q || `${s.name} ${s.internalId} ${s.summary} ${s.attributes.map((a) => LABELS[a]).join(' ')}`.toLowerCase().includes(q)));
  const sk = D.skills.skills.find((s) => s.id === L.selected) ?? D.skills.skills[0];
  const s = labScenario(app, sk.id);
  const card = { id: 'lab', name: 'Test player', position: s.role, positionRating: 85, stats: Object.fromEntries(ATTRS.map((a) => [a, L.baseValue])), skills: [sk.name], progressionPoints: 0 };
  const res = computePlayer({ card, prog: D.progression, mech: D.mechanics, skillsDB: D.skills, scenario: s });
  const act = res.skills.activations.find((a) => a.skill.id === sk.id) ?? res.motion.find((m) => m.skill.id === sk.id);
  const used = factsUsed(sk.activation);
  const rules = D.skills.stackingRules.filter((r) => r.skills.includes(sk.id));
  const tempEffect = sk.effects.find((e) => e.kind === 'temp' || e.kind === 'temp_scaled');
  const maxAdd = tempEffect ? (tempEffect.amount ?? tempEffect.perUnit * tempEffect.maxUnits) : 0;

  root.innerHTML = `
  <h1>Skills Lab</h1>
  <p class="sub">The 21 skills from the article as versioned data (<code>data/skills.v1.json</code>, version ${esc(D.skills.version)}). Drag the player on the pitch to check spatial conditions.</p>
  <div class="grid g-narrow">
    <div class="card">
      <input placeholder="Search skill, ID, stat…" value="${esc(L.query)}" data-action="q" style="width:100%">
      <select data-action="filter" style="margin:8px 0">
        <option value="all">All types</option>
        ${Object.entries(CATEGORY).map(([k, v]) => `<option value="${k}" ${L.filter === k ? 'selected' : ''}>${v}</option>`).join('')}
        ${Object.entries(D.skills.validationLevels).map(([k, v]) => `<option value="${k}" ${L.filter === k ? 'selected' : ''}>Evidence: ${esc(v.slice(0, 44))}…</option>`).join('')}
      </select>
      ${list.map((x) => `<div class="list-item ${x.id === sk.id ? 'sel' : ''}" data-skill="${x.id}">
        <div class="row"><span class="muted mono">${String(x.order).padStart(2, '0')}</span><b>${esc(x.name)}</b></div>
        <div class="muted" style="font-size:11px">${CATEGORY[x.effectCategory]} · ${esc(x.magnitude.slice(0, 48))}</div></div>`).join('') || '<p class="muted">No results.</p>'}
    </div>
    <div class="grid" style="align-content:start">
      <div class="card">
        <div class="row"><h2 style="margin:0">${String(sk.order).padStart(2, '0')} · ${esc(sk.name)}</h2><span class="badge mono">${esc(sk.internalId)}</span>
          <span class="badge">${CATEGORY[sk.effectCategory]}</span>${validationBadge(sk.validation)}<span class="spacer"></span>
          <a href="${esc(D.skills.source.url + sk.anchor)}" target="_blank" rel="noopener">Original section ↗</a></div>
        <p>${esc(sk.summary)}</p>
        <div class="grid g2">
          <div>
            <h3>Numeric effect</h3><div>${esc(sk.magnitude)}</div>
            <h3>Stats affected</h3><div>${sk.attributes.length ? sk.attributes.map((a) => LABELS[a]).join(', ') : '<span class="muted">None (not stat points)</span>'}</div>
            <h3>99 cap interaction</h3><div>${esc(sk.cap99.text)}</div>
            <h3>Duration and switch-off</h3><div>${esc(sk.duration)}</div>
          </div>
          <div>
            <h3>Eligible positions</h3><div>${sk.eligiblePositions ? sk.eligiblePositions.join(', ') : 'No requirement'}</div>
            <h3>Possession · Zone · Time/score</h3><div>${esc(sk.possession)} · ${esc(sk.zone)} · ${esc(sk.timeScore)}</div>
            ${sk.movement ? `<h3>Technical details</h3><div style="font-size:13px">${esc(sk.movement)}</div>` : ''}
            <h3>Evidence</h3><div style="font-size:13px">${esc(sk.evidence)}</div>
          </div>
        </div>
        ${sk.uncertainties.length ? `<div class="notice"><b>Uncertainties:</b> ${esc(sk.uncertainties.join(' · '))}</div>` : ''}
        ${claimBox(D, sk.id)}
        <h3>Activation conditions (data)</h3>
        ${checksList(evaluate(sk.activation, res.facts).checks)}
      </div>

      <div class="grid g2">
        <div class="card" style="grid-column:1/-1">
          <h2>Pitch · spatial conditions</h2>
          ${pitchSVG(s, D.mechanics.pitch, { highlight: SPATIAL[sk.id] ?? [] })}
        </div>
        <div class="card">
          <h2>Skill simulator</h2>
          <label class="f">Base value for all stats of the test player<input type="number" min="40" max="99" value="${L.baseValue}" data-action="base"></label>
          ${scenarioForm(s, used)}
        </div>
        <div class="card">
          <h2>Result</h2>
          ${act ? `<div class="kpi ${act.ok ? 'up' : 'down'}">${act.ok ? 'ACTIVATES' : act.ok === false ? 'DOES NOT ACTIVATE' : 'PROVIDER'}</div>${checksList(act.checks)}` : '<div class="muted">No evaluation for this scenario.</div>'}
          ${sk.attributes.length && sk.effectCategory === 'temporary_attribute' ? `<table style="margin-top:8px"><thead><tr><th>Stat</th><th class="n">Base</th><th class="n">Bonus</th><th class="n">Result</th></tr></thead><tbody>
            ${(tempEffect.attrs.length > 6 ? tempEffect.attrs.slice(0, 6) : tempEffect.attrs).map((a) => `<tr><td>${LABELS[a]}</td><td class="n">${L.baseValue}</td><td class="n up">${res.rows[a].temp ? signed(res.rows[a].temp) : '—'}</td><td class="n"><b>${res.rows[a].extended}</b>${res.rows[a].capLoss ? ` <span class="down">(−${res.rows[a].capLoss} cap)</span>` : ''}</td></tr>`).join('')}
            </tbody></table>${tempEffect.attrs.length > 6 ? `<p class="muted" style="font-size:12px">…and ${tempEffect.attrs.length - 6} more stats.</p>` : ''}` : ''}
          ${res.skills.local ? `<div class="notice doc">Local bonus: ${LABELS[res.skills.local.attr]} ${L.baseValue} → <b>${res.rows[res.skills.local.attr].local}</b> (no cap; this action only)</div>` : ''}
          ${res.motion.filter((m) => m.skill.id === sk.id).map((m) => `<table style="margin-top:8px"><thead><tr><th>Parameter</th><th class="n">Without</th><th class="n">With</th></tr></thead><tbody>
            ${m.rows.map((r) => `<tr><td>${esc(r.name)}<div class="muted" style="font-size:11px">${esc(r.note)}</div></td><td class="n">${fmt(r.without, 6)}</td><td class="n">${fmt(r.with, 6)}</td></tr>`).join('')}</tbody></table>`).join('')}
        </div>
      </div>

      ${claimsCard(D)}

      <div class="grid g2">
        <div class="card">
          <h2>Compatibility and combinations</h2>
          ${rules.length ? rules.map((r) => `<div style="margin-bottom:8px">${statusBadge(r.status)} <b>${esc(r.skills.map((id) => nameOf(D, id)).join(' + '))}</b><div style="font-size:13px">${esc(r.text)}</div></div>`).join('') : '<p class="muted">The article documents no specific combinations for this skill.</p>'}
          <h3>Default rules</h3>
          ${Object.values(D.skills.defaultRules).map((r) => `<div style="font-size:13px;margin-bottom:6px">${statusBadge(r.status)} ${esc(r.text)}</div>`).join('')}
        </div>
        <div class="card">
          <h2>99 cap curve</h2>
          ${maxAdd ? `<table><thead><tr><th class="n">Before bonus</th><th class="n">+${maxAdd}</th><th class="n">Readback</th><th class="n">Lost</th></tr></thead><tbody>
            ${[85, 88, 90, 91, 93, 95, 96, 97, 98, 99].map((v) => { const p = pipelineValue({ base: v, temp: maxAdd }); return `<tr><td class="n">${v}</td><td class="n">${v + maxAdd}</td><td class="n"><b>${p.ordinary}</b></td><td class="n ${p.capLoss ? 'down' : ''}">${p.capLoss || ''}</td></tr>`; }).join('')}
          </tbody></table><p class="muted" style="font-size:12px">Maximum skill bonus applied before the 40–99 cap (documented).</p>`
          : `<p class="muted">${esc(sk.cap99.text)}</p>`}
        </div>
      </div>
    </div>
  </div>`;

  root.querySelector('[data-action=q]').addEventListener('change', (e) => { L.query = e.target.value; app.update(); });
  root.querySelector('[data-action=filter]').addEventListener('change', (e) => { L.filter = e.target.value; app.update(); });
  root.querySelector('[data-action=base]').addEventListener('change', (e) => { L.baseValue = Math.max(40, Math.min(99, Number(e.target.value) || 80)); app.update(); });
  root.querySelectorAll('[data-skill]').forEach((el) => el.addEventListener('click', () => { L.selected = el.dataset.skill; app.update(); }));
  bindScenario(root, app, s);
  bindPitch(root, app, s);
}

// Community disassembly slides (data/skill-claims.v1.json): popular belief vs code finding, next to the article.
const CHECK = { agrees: ['b-ok', 'Agrees with article'], partly: ['b-warn', 'Partly agrees'], differs: ['b-warn', 'Differs from engine'], conflict: ['b-warn', 'Conflicts'], new: ['', 'Not in article'] };
const checkBadge = (c) => `<span class="badge ${CHECK[c]?.[0] ?? ''}">${CHECK[c]?.[1] ?? esc(c)}</span>`;
const claimHtml = (c) => `${c.hypothesis ? `<div class="claim hyp"><span>Popular belief</span>“${esc(c.hypothesis)}”</div>` : ''}
  <div class="claim code"><span>Code finding</span>${esc(c.finding)}</div>
  ${c.vsCommunity ? `<div class="muted" style="font-size:12px">${esc(c.vsCommunity)}</div>` : ''}`;

function claimBox(D, id) {
  const c = D.skillClaims?.skills?.find((x) => x.id === id);
  if (!c) return '';
  return `<div class="claimbox"><div class="row"><h3 style="margin:0">Disassembly claim</h3><span class="badge mono">${esc(c.slideId)}</span>${checkBadge(c.check)}<span class="spacer"></span>
    <span class="muted" style="font-size:11px">community · unverified</span></div>${claimHtml(c)}</div>`;
}

function claimsCard(D) {
  const C = D.skillClaims;
  if (!C) return '';
  return `<div class="card">
    <h2>Community disassembly · other skills and engine rules</h2>
    <p class="muted" style="font-size:12px">${esc(C.source.title)} · ${esc(C.source.target)} · researcher ${esc(C.source.researcher)}. ${esc(C.source.note)}</p>
    <div class="grid g2">${C.otherSkills.map((c) => `<div class="claimbox"><div class="row"><b>${esc(c.name)}</b><span class="badge mono">${esc(c.slideId)}</span>${checkBadge(c.check)}</div>${claimHtml(c)}</div>`).join('')}</div>
    <h3>Engine pipeline</h3>
    <div class="muted" style="font-size:12px;margin-bottom:6px">${C.pipeline.stages.map((s, i) => `${i + 1}. ${esc(s)}`).join(' → ')}</div>
    ${C.pipeline.claims.map((c) => `<div style="font-size:13px;margin-bottom:6px">${checkBadge(c.check)} <b>${esc(c.topic)}:</b> ${esc(c.claim)} <span class="muted">${esc(c.vsEngine)}</span></div>`).join('')}
  </div>`;
}

function nameOf(D, id) {
  return D.skills.skills.find((s) => s.id === id)?.name ?? D.skills.auxiliarySkills.find((s) => s.id === id)?.name ?? id.replace(/_/g, ' ');
}
