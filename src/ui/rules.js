import { esc, validationBadge, statusBadge } from './common.js';
import { LABELS } from '../engine/attributes.js';

// Rules table generated from the versioned data files (single source of truth).
export function render(root, app) {
  const { skills: S, mechanics: M, progression: P, roles: R } = app.D;
  const transversal = [
    ['Order of operations', M.orderOfOperations.steps.join(' → '), M.orderOfOperations.status],
    ['Ordinary / extended cap', `${M.caps.ordinaryMin}–${M.caps.ordinaryMax}; extended ${M.caps.extendedMax}`, M.caps.status],
    ['Three kinds of bonus', `${M.bonusTypes.temporary} ${M.bonusTypes.local} ${M.bonusTypes.motion}`, 'documented'],
    ['Condition arrows', `${M.conditionArrows.interpolation}. ${M.conditionArrows.note}`, M.conditionArrows.status],
    ['Arrows: level/group mapping', M.conditionArrows.levelMappingNote, M.conditionArrows.levelMappingStatus],
    ['Manager', `${M.manager.referenceRule} ${M.manager.note}`, M.manager.status],
    ['±18 regions', M.pitch.note, M.pitch.status],
    ['Penalty box width', M.pitch.boxHalfWidthNote, M.pitch.boxHalfWidthStatus],
    ['Boosters', M.boosters.note, M.boosters.status],
    ...S.stackingRules.map((r) => [`Combination ${r.id}`, r.text, r.status]),
    ...Object.values(S.defaultRules).map((r) => ['Default rule', r.text, r.status]),
    ['Progression (categories and costs)', P.note, P.status],
    ['Role weights and frequencies', R.note, R.status],
  ];
  root.innerHTML = `
  <h1>Rules &amp; Evidence</h1>
  <p class="sub">Generated from <code>data/*.json</code> (skills v${esc(S.version)}, mechanics v${esc(M.version)}). Source: <a href="${esc(S.source.url)}" target="_blank" rel="noopener">${esc(S.source.title)}</a> (${esc(S.source.date)}).</p>
  <div class="notice">${esc(S.source.caveat)}</div>
  <div class="card"><h2>Skills</h2><div class="xscroll"><table>
    <thead><tr><th>#</th><th>Skill</th><th>Internal ID</th><th>Effect</th><th>Stats</th><th>99 cap</th><th>Evidence</th><th>Uncertainties</th></tr></thead>
    <tbody>${S.skills.map((s) => `<tr><td class="mono">${String(s.order).padStart(2, '0')}</td>
      <td><a href="${esc(S.source.url + s.anchor)}" target="_blank" rel="noopener">${esc(s.name)}</a></td><td class="mono" style="font-size:12px">${esc(s.internalId)}</td>
      <td style="font-size:13px">${esc(s.magnitude)}</td><td style="font-size:12px">${s.attributes.map((a) => LABELS[a]).join(', ') || '—'}</td>
      <td style="font-size:12px">${esc(s.cap99.text)}</td><td>${validationBadge(s.validation)}</td>
      <td style="font-size:12px">${esc(s.uncertainties.join(' · ') || '—')}</td></tr>`).join('')}</tbody>
  </table></div></div>
  <div class="card" style="margin-top:16px"><h2>General rules and assumptions</h2><div class="xscroll"><table>
    <thead><tr><th>Rule</th><th>Content</th><th>Status</th></tr></thead>
    <tbody>${transversal.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td style="font-size:13px">${esc(b)}</td><td>${statusBadge(c)}</td></tr>`).join('')}</tbody>
  </table></div></div>`;
}
