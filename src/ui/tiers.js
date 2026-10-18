// Tier Lists: player, formation, manager, skill and build tiers from game8.jp and r/Amadeusz (data/tiers.v1.json).
import { esc } from './common.js';
import { statColor } from './planner.js';

const POS = { CF: 'CF', ST: 'SS', LWG: 'LWF', RWG: 'RWF', LMF: 'LMF', RMF: 'RMF', OMF: 'AMF', CMF: 'CMF', DMF: 'DMF', LSB: 'LB', RSB: 'RB', CB: 'CB', GK: 'GK' };
const CARD = { BT: ['bigtime', 'Big Time'], EP: ['epic', 'Epic'], ST: ['showtime', 'Show Time'] };
const TABS = { players: 'Players', formations: 'Formations', managers: 'Managers', skills: 'Skills & Link Up' };
const ui = { tab: 'players', pos: 'all' };

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

// Best matching card in the dataset: same name (accents ignored) and card type when given; highest OVR wins.
function findCard(app, name, cardCode) {
  const n = norm(name);
  const type = CARD[cardCode]?.[0];
  const hits = app.state.cards.filter((c) => norm(c.name) === n && (!type || c.cardType === type));
  return hits.sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0];
}

const tierClass = (t) => (/SSS|Tier ?1|^T0|Mythic|^1$/.test(t) ? 't1' : /SS|Tier ?2|^T1|^S$/.test(t) ? 't2' : /Tier ?3|^T2|^A$/.test(t) ? 't3' : 't4');

export function render(root, app) {
  const T = app.D.tiers;
  if (T.public) return renderLinks(root, T);
  const g = T.game8;
  if (!TABS[ui.tab]) ui.tab = 'players';
  root.innerHTML = `
  <div class="row" style="margin-bottom:12px"><h1 style="margin:0">Tier Lists</h1><span class="spacer"></span>
    <span class="muted" style="font-size:12px">game8.jp · r/Amadeusz</span></div>
  <div class="tabs">${Object.entries(TABS).map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
  ${{ players: players, formations: formations, managers: managers, skills: skills }[ui.tab](app, T, g)}`;

  root.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => { ui.tab = el.dataset.tab; render(root, app); }));
  root.querySelectorAll('[data-pos]').forEach((el) => el.addEventListener('click', () => { ui.pos = el.dataset.pos; render(root, app); }));
  root.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => { app.state.selectedCardId = el.dataset.open; app.save(); location.hash = '#/planner'; }));
}

// Public build: the tier lists belong to their authors, so the site links to them instead of copying them.
function renderLinks(root, T) {
  root.innerHTML = `<h1>Tier Lists</h1>
  <p class="sub">Up-to-date tier lists from their original sources.</p>
  <div class="tiergrid">${(T.links ?? []).map((g) => `<div class="card"><h2>${esc(g.site)}</h2>
    ${g.items.map((i) => `<div class="trow"><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a><span class="spacer"></span><span class="muted" style="font-size:11px">${esc(i.date ?? '')}</span></div>`).join('')}
  </div>`).join('')}</div>`;
}

function src(url, date) {
  return `<a class="src" href="${esc(url)}" target="_blank" rel="noopener">source${date ? ` · ${esc(date)}` : ''} ↗</a>`;
}

function players(app, T, g) {
  const rows = g.players_top10;
  const positions = [...new Set(rows.map((r) => r.position))];
  const shown = ui.pos === 'all' ? positions : [ui.pos];
  const meta = T.amadeusz.lists.find((l) => l.imageOnly);
  return `
  <div class="pills" style="margin-bottom:12px">${['all', ...positions].map((p) => `<button class="pill ${ui.pos === p ? 'on' : ''}" data-pos="${p}">${p === 'all' ? 'All' : POS[p] ?? p}</button>`).join('')}</div>
  <div class="tiergrid">${shown.map((p) => {
    const list = rows.filter((r) => r.position === p).sort((a, b) => a.rank - b.rank);
    return `<div class="card"><div class="row"><h2 style="margin:0">${POS[p] ?? p}</h2><span class="spacer"></span>${src(list[0]?.source_url, list[0]?.page_date)}</div>
      ${list.map((r) => {
        const c = findCard(app, r.nameEn, r.card);
        return `<div class="trow"><span class="rank">${r.rank}</span>
          <span class="ctype ${CARD[r.card]?.[0] ?? ''}">${esc(r.card ?? '')}</span>
          <b>${esc(r.nameEn)}</b>${/verify/i.test(JSON.stringify(r)) ? '<span class="badge b-warn">verify</span>' : ''}
          <span class="spacer"></span>
          ${c ? `<button class="small" data-open="${esc(c.id)}" title="Open ${esc(c.name)} ${esc(c.playingStyle)} in the Build Planner"><b class="${statColor(c.overall ?? 0)}">${c.overall}</b> Open</button>` : '<span class="muted" style="font-size:11px">not in dataset</span>'}
        </div>`;
      }).join('')}</div>`;
  }).join('')}</div>
  ${meta ? `<div class="card" style="margin-top:16px"><div class="row"><h2 style="margin:0">${esc(meta.title)} · Amadeusz</h2><span class="spacer"></span>${src(meta.url, meta.date)}</div>
    <p class="muted" style="font-size:13px;margin:8px 0">${esc(meta.note)}</p>
    <a href="${esc(meta.image)}" target="_blank" rel="noopener"><img src="${esc(meta.image)}" alt="Amadeusz META tier image" class="tierimg" loading="lazy"></a></div>` : ''}`;
}

function formations(app, T, g) {
  const tiers = [...new Set(g.formations.map((f) => f.tier))];
  return `<div class="card">
    <div class="row"><h2 style="margin:0">Formations · game8</h2><span class="spacer"></span>${src(g.formations[0]?.source_url, g.formations[0]?.page_date)}</div>
    ${tiers.map((t) => `<div class="tierline"><span class="tier ${tierClass(t)}">${esc(t.replace('Tier', 'Tier '))}</span>
      <div class="flist">${g.formations.filter((f) => f.tier === t).map((f) => `<div class="fcard">
        ${formationSVG(app.D.formations, f.formation)}
        <b class="mono">${esc(f.formation)}</b>
        <div class="row" style="gap:4px;margin:4px 0">${(f.teamStyles ?? []).map((s) => `<span class="chip mgrchip">${esc(s)}</span>`).join('')}</div>
        <div class="muted" style="font-size:12px">${esc(f.why ?? '')}</div></div>`).join('')}</div></div>`).join('')}
  </div>`;
}

// Formation drawn on a vertical pitch from data/formations.v1.json (own replica of the layout, not game8's image).
const fkey = (s) => String(s).toLowerCase().replace(/[^a-z0-9+-]/g, '');
const LINE = { GK: 'gk', CB: 'def', LB: 'def', RB: 'def', DMF: 'mid', CMF: 'mid', LMF: 'mid', RMF: 'mid', AMF: 'mid', SS: 'att', CF: 'att', LWF: 'att', RWF: 'att' };
export function formationSVG(F, name) {
  const layout = Object.entries(F?.layouts ?? {}).find(([k]) => fkey(k) === fkey(name))?.[1];
  if (!layout) return '';
  const Y = (y) => 128 - y * 1.2; // own goal at the bottom
  return `<svg class="fpitch" viewBox="0 0 100 134" role="img" aria-label="${esc(name)} formation">
    <rect x="1" y="1" width="98" height="132" rx="2" class="pl"/>
    <line x1="1" y1="67" x2="99" y2="67" class="pl"/><circle cx="50" cy="67" r="9" class="pl"/>
    <rect x="25" y="1" width="50" height="16" class="pl"/><rect x="38" y="1" width="24" height="6" class="pl"/>
    <rect x="25" y="117" width="50" height="16" class="pl"/><rect x="38" y="127" width="24" height="6" class="pl"/>
    ${layout.map(([pos, x, y]) => `<g class="fp ${LINE[pos] ?? 'mid'}"><circle cx="${x}" cy="${Y(y)}" r="5.2"/><text x="${x}" y="${Y(y) + 1.6}">${pos}</text></g>`).join('')}
  </svg>`;
}

function managers(app, T, g) {
  const m = g.managers;
  const styles = [...new Set(m.rows.map((r) => r.teamStyle))];
  const known = new Map((app.D.managers ?? []).map((x) => [norm(x.name), x]));
  return `<div class="notice">Low confidence: tiers were inferred from the order of game8's tier images.</div>
  <div class="tiergrid">${styles.map((s) => `<div class="card"><div class="row"><h2 style="margin:0">${esc(s)}</h2><span class="spacer"></span>${src(m.source_url, m.page_date)}</div>
    ${m.rows.filter((r) => r.teamStyle === s).map((r) => `<div class="tierline"><span class="tier ${tierClass(r.tier)}">${esc(r.tier)}</span><div class="names">${[...new Set(r.managers)].map((n) => `<span class="chip ${known.has(norm(n)) ? 'mgrchip' : 'plain'}">${esc(n)}</span>`).join('')}</div></div>`).join('')}
  </div>`).join('')}</div>`;
}

function skills(app, T) {
  return T.amadeusz.lists.filter((l) => !l.imageOnly).map((l) => `<div class="card" style="margin-bottom:16px">
    <div class="row"><h2 style="margin:0">${esc(l.title)} · Amadeusz</h2><span class="spacer"></span>${src(l.url, l.date)}</div>
    ${l.tiers.map((t) => `<div class="tierline"><span class="tier ${tierClass(t.tier)}">${esc(t.tier)}</span><div class="names">${t.items.map((n) => `<span class="chip plain">${esc(n)}</span>`).join('')}</div></div>`).join('')}
  </div>`).join('');
}

