import { esc } from './common.js';
import { statColor } from './planner.js';
import { importText, CSV_TEMPLATE } from '../data/importer.js';
import { matchCardSkills } from '../engine/skills.js';
import { POSITIONS } from '../engine/attributes.js';

const PAGE = 60;
const ui = { q: '', pos: 'all', skill: 'all', off: 'all', def: 'all', sort: 'ovr', page: 0, msg: null };

export function render(root, app) {
  const { D } = app;
  const q = ui.q.toLowerCase();
  let list = app.state.cards.filter((c) => (ui.pos === 'all' || c.position === ui.pos)
    && (!q || `${c.name} ${c.version} ${c.playingStyle} ${c.defensivePlayingStyle ?? ''}`.toLowerCase().includes(q))
    && (ui.off === 'all' || c.playingStyle === ui.off) && (ui.def === 'all' || (c.defensivePlayingStyle || '—') === ui.def)
    && (ui.skill === 'all' || matchCardSkills(c.skills, D.skills).known.includes(ui.skill)));
  const offStyles = [...new Set(app.state.cards.map((c) => c.playingStyle).filter(Boolean))].sort();
  const defStyles = [...new Set(app.state.cards.map((c) => c.defensivePlayingStyle || '—'))].sort();
  list = list.sort((a, b) => (ui.sort === 'name' ? a.name.localeCompare(b.name) : ui.sort === 'pts' ? b.progressionPoints - a.progressionPoints : (b.overall ?? 0) - (a.overall ?? 0)));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  ui.page = Math.min(ui.page, pages - 1);
  const shown = list.slice(ui.page * PAGE, ui.page * PAGE + PAGE);

  root.innerHTML = `
  <h1>Players</h1>
  <p class="sub">${app.state.cards.length} cards · ${D.bundledCount ? `${D.bundledCount} from the eFHUB scraper dataset` : 'no scraper dataset loaded yet'}. Click a card to open it in the Build Planner.</p>
  <div class="card" style="margin-bottom:14px">
    <div class="row">
      <input placeholder="Search name or style…" value="${esc(ui.q)}" data-f="q" style="flex:1;min-width:180px">
      <select data-f="pos" style="width:auto"><option value="all">All positions</option>${POSITIONS.map((p) => `<option ${ui.pos === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <select data-f="off" style="width:auto"><option value="all">Any offensive style</option>${offStyles.map((s) => `<option ${ui.off === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <select data-f="def" style="width:auto"><option value="all">Any defensive style</option>${defStyles.map((s) => `<option ${ui.def === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <select data-f="skill" style="width:auto"><option value="all">Any skill</option>${D.skills.skills.map((s) => `<option value="${s.id}" ${ui.skill === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <select data-f="sort" style="width:auto">${[['ovr', 'Sort: OVR'], ['pts', 'Sort: points'], ['name', 'Sort: name']].map(([v, l]) => `<option value="${v}" ${ui.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
  </div>
  <div class="card">
    <div class="xscroll"><table>
      <thead><tr><th class="n">OVR</th><th class="n">Max</th><th>Pos</th><th>Player</th><th>Offensive style</th><th>Defensive style</th><th class="n">Pts</th><th>Article skills</th></tr></thead>
      <tbody>${shown.map((c) => {
        const m = matchCardSkills(c.skills, D.skills).known.filter((k) => D.skills.skills.some((s) => s.id === k));
        return `<tr class="pick" data-id="${esc(c.id)}"><td class="n"><b class="${statColor(c.overall ?? 0)}">${esc(c.overall ?? '')}</b></td><td class="n muted">${esc(c.maxOverall ?? '')}</td>
          <td>${esc(c.position)}</td><td>${esc(c.name)}${c.fictional ? ' <span class="badge b-sim">demo</span>' : ''}</td><td class="muted">${esc(c.playingStyle)}</td><td class="muted">${esc(c.defensivePlayingStyle || '—')}</td>
          <td class="n">${c.progressionPoints}</td><td style="font-size:12px">${m.map((k) => esc(D.skills.skills.find((s) => s.id === k).name)).join(', ')}</td></tr>`;
      }).join('') || '<tr><td colspan="8" class="muted">No cards match.</td></tr>'}</tbody>
    </table></div>
    <div class="row" style="margin-top:10px"><span class="muted">${list.length} results</span><span class="spacer"></span>
      <button class="small" data-pg="-1" ${ui.page ? '' : 'disabled'}>‹ Prev</button><span class="muted">Page ${ui.page + 1} / ${pages}</span><button class="small" data-pg="1" ${ui.page < pages - 1 ? '' : 'disabled'}>Next ›</button></div>
  </div>

  <details class="card" style="margin-top:14px">
    <summary><b>Import cards</b> (CSV/JSON)</summary>
    <p class="muted" style="font-size:13px">The full dataset comes from <code>tools/efhub_scraper.py</code> and loads automatically from <code>data/cards.efhub.csv</code>. You can also import your own CSV/JSON here (stored in this browser). eFHUB has no public API or data licence, so keep scraped data for personal use.</p>
    <input type="file" accept=".json,.csv" data-action="file">
    <div class="row" style="margin-top:8px"><button class="small" data-action="tpl-csv">CSV template</button><button class="small" data-action="export">Export my imported cards</button></div>
    ${ui.msg ? `<div class="notice ${ui.msg.ok ? 'doc' : ''}" style="white-space:pre-wrap">${esc(ui.msg.text)}</div>` : ''}
  </details>`;

  root.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('change', () => { ui[el.dataset.f] = el.value; ui.page = 0; render(root, app); }));
  root.querySelectorAll('[data-pg]').forEach((el) => el.addEventListener('click', () => { ui.page += Number(el.dataset.pg); render(root, app); window.scrollTo(0, 0); }));
  root.querySelectorAll('tr.pick').forEach((el) => el.addEventListener('click', () => { app.state.selectedCardId = el.dataset.id; app.save(); location.hash = '#/planner'; }));
  root.querySelector('[data-action=file]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const { cards, errors } = importText(await f.text(), f.name);
      for (const c of cards) {
        const i = app.state.cards.findIndex((x) => x.id === c.id);
        if (i >= 0) app.state.cards[i] = c; else app.state.cards.unshift(c);
      }
      ui.msg = { ok: !errors.length, text: `${cards.length} card(s) imported.${errors.length ? `\n${errors.length} error(s):\n` + errors.slice(0, 15).join('\n') : ''}` };
    } catch (err) { ui.msg = { ok: false, text: `Invalid file: ${err.message}` }; }
    app.update();
  });
  root.querySelector('[data-action=tpl-csv]').addEventListener('click', () => download('card-template.csv', CSV_TEMPLATE, 'text/csv'));
  root.querySelector('[data-action=export]').addEventListener('click', () =>
    download('my-cards.json', JSON.stringify({ schema: 'efml.cards', version: '1.0.0', cards: app.state.cards.filter((c) => !['fictional', 'scraper'].includes(c.source?.method)) }, null, 2), 'application/json'));
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
