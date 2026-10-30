// Managers: browse eFHUB managers (from tools/efhub_managers.py) by team playstyle proficiency and boosts.
import { esc, fold } from './common.js';
import { parseCSV } from '../data/importer.js';

export const PLAYSTYLES = [
  ['possessionGame', 'Possession Game'], ['longBallCounter', 'Long Ball Counter'], ['quickCounter', 'Quick Counter'],
  ['longBall', 'Long Ball'], ['outWide', 'Out Wide'], ['overload', 'Overload'],
];
const PAGE = 50;
const ui = { q: '', style: 'quickCounter', min: 80, boost: 'all', page: 0 };

export function parseManagers(text) {
  return parseCSV(text).map((r) => ({
    ...r,
    boosts: String(r.boosts ?? '').split('|').filter(Boolean),
    ...Object.fromEntries(PLAYSTYLES.map(([k]) => [k, Number(r[k]) || 0])),
  })).filter((m) => m.id && m.name);
}

const profClass = (v) => (v >= 89 ? 'c-elite' : v >= 80 ? 'c-high' : v >= 70 ? 'c-mid' : 'c-low');

export function render(root, app) {
  const all = app.D.managers ?? [];
  if (!all.length) {
    root.innerHTML = `<h1>Managers</h1><div class="card"><p class="muted">No manager data yet. The overnight queue runs <code>tools/efhub_managers.py</code> and writes <code>data/managers.efhub.csv</code>; reload this page when it is done.</p></div>`;
    return;
  }
  const boosts = [...new Set(all.flatMap((m) => m.boosts.map((b) => b.replace(/ \+\d+$/, ''))))].sort();
  const q = fold(ui.q.trim());
  // Searching by name shows every match: the minimum-proficiency filter only applies to browsing.
  const list = all.filter((m) => (q ? fold(m.name).includes(q) : m[ui.style] >= ui.min)
    && (ui.boost === 'all' || m.boosts.some((b) => b.startsWith(ui.boost + ' +'))))
    .sort((a, b) => b[ui.style] - a[ui.style] || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  ui.page = Math.min(ui.page, pages - 1);

  root.innerHTML = `
  <h1>Managers</h1>
  <p class="sub">${all.length} managers from eFHUB. Pick your team playstyle to see who runs it best, and which stats their boosts add.</p>
  <div class="card" style="margin-bottom:14px"><div class="row">
    <input placeholder="Search manager…" value="${esc(ui.q)}" data-f="q" style="flex:1;min-width:160px">
    <select data-f="style" style="width:auto">${PLAYSTYLES.map(([k, l]) => `<option value="${k}" ${ui.style === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label class="row muted" style="gap:6px">Min proficiency <input type="number" min="0" max="99" value="${ui.min}" data-f="min" style="width:70px"></label>
    <select data-f="boost" style="width:auto"><option value="all">Any boost</option>${boosts.map((b) => `<option ${ui.boost === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
  </div></div>
  <div class="card"><div class="xscroll"><table>
    <thead><tr><th>Manager</th><th>Boosts</th>${PLAYSTYLES.map(([k, l]) => `<th class="n" style="${k === ui.style ? 'color:var(--accent)' : ''}">${l}</th>`).join('')}</tr></thead>
    <tbody>${list.slice(ui.page * PAGE, ui.page * PAGE + PAGE).map((m) => `<tr>
      <td><a href="${esc(m.sourceUrl)}" target="_blank" rel="noopener">${esc(m.name)}</a></td>
      <td>${m.boosts.map((b) => `<span class="chip">${esc(b)}</span>`).join(' ') || '<span class="muted">—</span>'}</td>
      ${PLAYSTYLES.map(([k]) => `<td class="n"><b class="${profClass(m[k])}">${m[k] || ''}</b></td>`).join('')}</tr>`).join('') || '<tr><td colspan="8" class="muted">No managers match.</td></tr>'}</tbody>
  </table></div>
  <div class="row" style="margin-top:10px"><span class="muted">${list.length} results</span><span class="spacer"></span>
    <button class="small" data-pg="-1" ${ui.page ? '' : 'disabled'}>‹ Prev</button><span class="muted">Page ${ui.page + 1} / ${pages}</span><button class="small" data-pg="1" ${ui.page < pages - 1 ? '' : 'disabled'}>Next ›</button></div>
  <p class="muted" style="font-size:12px">The mechanics article only documents how a proficiency-89 manager adjusts stats (+1/+2/+3 by stat band, applied in Match Scenarios). Boosts are shown as listed on eFHUB.</p></div>`;

  root.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('change', () => {
    ui[el.dataset.f] = el.dataset.f === 'min' ? Number(el.value) || 0 : el.value;
    ui.page = 0;
    render(root, app);
  }));
  root.querySelectorAll('[data-pg]').forEach((el) => el.addEventListener('click', () => { ui.page += Number(el.dataset.pg); render(root, app); window.scrollTo(0, 0); }));
}
