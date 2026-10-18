// Roster Builder: pick a formation and manager, place cards on the pitch, keep a bench, compare fit.
import { esc } from './common.js';
import { statColor, render as renderBuild } from './planner.js';
import { PLAYSTYLES } from './managers.js';
import { POSITIONS } from '../engine/attributes.js';

const LINE = { GK: 'gk', CB: 'def', LB: 'def', RB: 'def', DMF: 'mid', CMF: 'mid', LMF: 'mid', RMF: 'mid', AMF: 'mid', SS: 'att', CF: 'att', LWF: 'att', RWF: 'att' };
const BENCH_MAX = 12;
const ui = { slot: null, bench: false, q: '', pos: 'slot', mq: '', focus: null };

const uid = () => Math.random().toString(36).slice(2, 9);
const clone = (x) => JSON.parse(JSON.stringify(x));
function newRoster(name, formation) {
  return { id: uid(), name, formation, playstyle: 'quickCounter', managerId: null, xi: Array(11).fill(null), bench: [] };
}

function store(app) {
  const s = app.state;
  s.rosters ??= { list: [], current: null };
  if (!s.rosters.list.length) {
    const r = newRoster('My roster', Object.keys(app.D.formations.layouts)[0]);
    s.rosters.list.push(r);
    s.rosters.current = r.id;
  }
  return s.rosters;
}

const current = (st) => st.list.find((r) => r.id === st.current) ?? st.list[0];
const fitOf = (slotPos, card) => (!card ? null : card.position === slotPos ? 'ok' : LINE[card.position] === LINE[slotPos] ? 'near' : 'off');

// Each roster keeps its own editable copy of the formation (dragged spots, changed position types).
function layoutOf(app, r) {
  if (!r.layout || r.layout.length !== 11) r.layout = clone(app.D.formations.layouts[r.formation]);
  return r.layout;
}

// Keep players when the formation changes: same position first, then same line, the rest go to the bench.
function remap(app, r, newFormation) {
  const oldLayout = layoutOf(app, r);
  const newLayout = clone(app.D.formations.layouts[newFormation]);
  const pool = r.xi.map((id, i) => (id ? { id, pos: oldLayout[i]?.[0] } : null)).filter(Boolean);
  const xi = Array(11).fill(null);
  for (const pass of ['exact', 'line']) {
    newLayout.forEach(([pos], i) => {
      if (xi[i]) return;
      const k = pool.findIndex((p) => (pass === 'exact' ? p.pos === pos : LINE[p.pos] === LINE[pos]));
      if (k >= 0) xi[i] = pool.splice(k, 1)[0].id;
    });
  }
  r.bench = [...r.bench, ...pool.map((p) => p.id)].slice(0, BENCH_MAX);
  r.xi = xi;
  r.formation = newFormation;
  r.layout = newLayout;
}

export function render(root, app) {
  const { D } = app;
  const st = store(app);
  const r = current(st);
  const layout = layoutOf(app, r);
  const edited = JSON.stringify(layout) !== JSON.stringify(D.formations.layouts[r.formation]);
  const card = (id) => (id ? app.state.cards.find((c) => c.id === id) : null);
  const mgr = r.managerId ? (D.managers ?? []).find((m) => m.id === r.managerId) : null;
  const xiCards = r.xi.map(card);
  const placed = xiCards.filter(Boolean);
  const avg = placed.length ? placed.reduce((s, c) => s + (c.overall ?? 0), 0) / placed.length : 0;
  const fits = layout.map(([pos], i) => fitOf(pos, xiCards[i]));
  const selPos = ui.slot !== null ? layout[ui.slot]?.[0] : null;
  // Player whose build is shown below: the selected pitch slot's player, otherwise the bench player chosen with 'Build'.
  const inRoster = new Set([...r.xi, ...r.bench].filter(Boolean));
  if (ui.focus && !inRoster.has(ui.focus)) ui.focus = null;
  const focusId = (ui.slot !== null && r.xi[ui.slot]) || ui.focus;
  const Y = (y) => ((128 - y * 1.2) / 134) * 100;

  root.innerHTML = `
  <div class="row" style="margin-bottom:12px;gap:8px">
    <h1 style="margin:0">Roster Builder</h1><span class="spacer"></span>
    <select data-action="pick" class="mini" style="min-width:160px">${st.list.map((x) => `<option value="${x.id}" ${x.id === r.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
    <button class="small" data-action="new">+ New</button>
    <button class="small" data-action="rename">Rename</button>
    <button class="small" data-action="del" ${st.list.length > 1 ? '' : 'disabled'}>Delete</button>
  </div>

  <div class="card rbar">
    <label class="f">Formation${edited ? ' <span class="badge b-warn">edited</span>' : ''}<select data-action="formation">${Object.keys(D.formations.layouts).map((f) => `<option ${f === r.formation ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    ${edited ? '<button class="small" data-action="resetlayout" title="Back to the original formation layout">Reset positions</button>' : ''}
    <label class="f">Team playstyle<select data-action="style">${PLAYSTYLES.map(([k, l]) => `<option value="${k}" ${k === r.playstyle ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="f" style="flex:1;min-width:220px">Manager
      <div class="search" style="width:100%"><input data-action="mq" placeholder="${mgr ? esc(mgr.name) : 'Search manager…'}" value="${esc(ui.mq)}" autocomplete="off"><div class="results" data-mres></div></div>
    </div>
    ${mgr ? `<div class="mgrsum"><b class="t-mgr mono" title="Proficiency in ${esc(PLAYSTYLES.find(([k]) => k === r.playstyle)[1])}">${mgr[r.playstyle] || '–'}</b>
      <div><b>${esc(mgr.name)}</b><div>${mgr.boosts.map((b) => `<span class="chip mgrchip">${esc(b)}</span>`).join(' ')}</div></div>
      <button class="small" data-action="mclear">✕</button></div>` : ''}
  </div>

  <div class="grid g-roster">
    <div class="card">
      <div class="rpitch">
        <div class="rp-lines"><i class="half"></i><i class="circle"></i><i class="box top"></i><i class="box bot"></i></div>
        ${layout.map(([pos, x, y], i) => {
          const c = xiCards[i];
          return `<button class="rslot ${LINE[pos]} ${ui.slot === i ? 'sel' : ''} ${c ? 'filled' : ''}" style="left:${x}%;top:${Y(y)}%" data-slot="${i}" title="${c ? esc(`${c.name} · ${c.position} ${c.overall}`) : `Empty ${pos}`}">
            <span class="rpos">${pos}</span>
            ${c ? `<span class="rovr ${statColor(c.overall ?? 0)}">${c.overall ?? ''}</span><span class="rname">${esc(shortName(c.name))}</span><span class="rfit ${fits[i]}">${fits[i] === 'ok' ? '✓' : fits[i] === 'near' ? '~' : '✗'} ${esc(c.position)}</span>` : '<span class="rplus">+</span>'}
          </button>`;
        }).join('')}
      </div>
    </div>

    <div class="grid" style="align-content:start">
      <div class="card rsum">
        <div><span class="muted">XI</span><b class="kpi">${placed.length}/11</b></div>
        <div><span class="muted">Avg OVR</span><b class="kpi ${statColor(avg)}">${avg ? avg.toFixed(1) : '–'}</b></div>
        <div><span class="muted">In position</span><b class="kpi up">${fits.filter((f) => f === 'ok').length}</b></div>
        <div><span class="muted">Near (~)</span><b class="kpi warn-t">${fits.filter((f) => f === 'near').length}</b></div>
        <div><span class="muted">Out of position</span><b class="kpi ${fits.some((f) => f === 'off') ? 'down' : ''}">${fits.filter((f) => f === 'off').length}</b></div>
        <div><span class="muted">Bench</span><b class="kpi">${r.bench.length}/${BENCH_MAX}</b></div>
      </div>

      <div class="card">
        <div class="row"><h2 style="margin:0">${ui.slot !== null ? 'Slot' : ui.bench ? 'Add to bench' : 'Players'}</h2>
          ${ui.slot !== null ? `<select data-action="slotpos" class="mini" title="Change this slot's position type">${POSITIONS.map((p) => `<option ${p === selPos ? 'selected' : ''}>${p}</option>`).join('')}</select>` : ''}
          <span class="spacer"></span>
          ${ui.slot !== null && r.xi[ui.slot] ? `<button class="small" data-action="toplanner">Build Planner ↗</button><button class="small" data-action="tobench">To bench</button><button class="small" data-action="clear">Remove</button>` : ''}
          <button class="small ${ui.bench ? 'on' : ''}" data-action="benchmode">Bench mode</button></div>
        <p class="muted" style="font-size:12px;margin:6px 0">${ui.slot !== null ? 'Pick a player for this slot (or click a bench player).' : ui.bench ? 'Picked players go to the bench.' : 'Click a slot to fill it or change its position; drag slots anywhere on the pitch. Or turn on bench mode.'}</p>
        <div class="row" style="gap:6px">
          <input data-action="q" placeholder="Search name or style…" value="${esc(ui.q)}" style="flex:1;min-width:140px" autocomplete="off">
          <select data-action="pos" class="mini">${[['slot', 'Slot position'], ['line', 'Same line'], ['all', 'All positions'], ...POSITIONS.map((p) => [p, p])].map(([v, l]) => `<option value="${v}" ${ui.pos === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <div class="rlist" data-list>${pickerList(app, r, selPos)}</div>
      </div>

      <div class="card">
        <h2>Bench</h2>
        ${r.bench.length ? r.bench.map((id, k) => { const c = card(id); return c ? `<div class="trow"><span class="ctype ${c.cardType ?? ''}">${esc(c.position)}</span><b class="${statColor(c.overall ?? 0)}">${c.overall}</b><span>${esc(c.name)}</span><span class="muted" style="font-size:11px">${esc(c.playingStyle)}</span><span class="spacer"></span>
          <button class="small ${focusId === id ? 'on' : ''}" data-focus="${esc(id)}">Build</button>${ui.slot !== null ? `<button class="small" data-swap="${k}">→ ${esc(selPos)}</button>` : ''}<button class="small" data-unbench="${k}">✕</button></div>` : ''; }).join('') : '<p class="muted" style="font-size:13px">No subs yet.</p>'}
      </div>
    </div>
  </div>
  ${focusId ? `<div class="rbuild-head"><h2 style="margin:0">Build · ${esc(card(focusId)?.name ?? '')}</h2><span class="muted" style="font-size:12px">${xiCards.some((c) => c?.id === focusId) ? 'on the pitch' : 'on the bench'}</span></div><div data-build></div>`
    : '<p class="muted rbuild-hint">Select a player on the pitch or press "Build" on a bench player to edit their build here.</p>'}`;
  if (focusId) renderBuild(root.querySelector('[data-build]'), app, { embedded: true, cardId: focusId });

  const save = () => app.update();
  root.querySelector('[data-action=pick]').addEventListener('change', (e) => { st.current = e.target.value; ui.slot = null; save(); });
  root.querySelector('[data-action=new]').addEventListener('click', () => { const n = newRoster(`Roster ${st.list.length + 1}`, r.formation); st.list.push(n); st.current = n.id; ui.slot = null; save(); });
  root.querySelector('[data-action=rename]').addEventListener('click', () => { const n = prompt('Roster name', r.name); if (n) { r.name = n.trim().slice(0, 40); save(); } });
  root.querySelector('[data-action=del]').addEventListener('click', () => { if (confirm(`Delete "${r.name}"?`)) { st.list = st.list.filter((x) => x.id !== r.id); st.current = st.list[0].id; ui.slot = null; save(); } });
  root.querySelector('[data-action=formation]').addEventListener('change', (e) => { remap(app, r, e.target.value); ui.slot = null; save(); });
  root.querySelector('[data-action=style]').addEventListener('change', (e) => { r.playstyle = e.target.value; save(); });
  root.querySelector('[data-action=mclear]')?.addEventListener('click', () => { r.managerId = null; save(); });
  root.querySelector('[data-action=resetlayout]')?.addEventListener('click', () => { r.layout = clone(D.formations.layouts[r.formation]); save(); });
  root.querySelector('[data-action=slotpos]')?.addEventListener('change', (e) => { layout[ui.slot][0] = e.target.value; save(); });
  bindDrag(root, app, r, layout, () => render(root, app), save);
  root.querySelector('[data-action=benchmode]').addEventListener('click', () => { ui.bench = !ui.bench; ui.slot = null; render(root, app); });
  root.querySelector('[data-action=clear]')?.addEventListener('click', () => { r.xi[ui.slot] = null; save(); });
  root.querySelector('[data-action=tobench]')?.addEventListener('click', () => { if (r.bench.length < BENCH_MAX) r.bench.push(r.xi[ui.slot]); r.xi[ui.slot] = null; save(); });
  root.querySelector('[data-action=toplanner]')?.addEventListener('click', () => { app.state.selectedCardId = r.xi[ui.slot]; app.save(); location.hash = '#/planner'; });
  root.querySelectorAll('[data-focus]').forEach((el) => el.addEventListener('click', () => { ui.focus = el.dataset.focus; ui.slot = null; render(root, app); root.querySelector('[data-build]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  root.querySelectorAll('[data-unbench]').forEach((el) => el.addEventListener('click', () => { r.bench.splice(Number(el.dataset.unbench), 1); save(); }));
  root.querySelectorAll('[data-swap]').forEach((el) => el.addEventListener('click', () => {
    const k = Number(el.dataset.swap);
    const out = r.xi[ui.slot];
    r.xi[ui.slot] = r.bench[k];
    if (out) r.bench[k] = out; else r.bench.splice(k, 1);
    save();
  }));
  root.querySelector('[data-action=pos]').addEventListener('change', (e) => { ui.pos = e.target.value; refreshList(); });
  const q = root.querySelector('[data-action=q]');
  q.addEventListener('input', () => { ui.q = q.value; refreshList(); });
  function refreshList() {
    root.querySelector('[data-list]').innerHTML = pickerList(app, r, selPos);
    bindPicks();
  }
  function bindPicks() {
    root.querySelectorAll('[data-add]').forEach((el) => el.addEventListener('click', () => {
      const id = el.dataset.add;
      for (const arr of [r.xi]) { const k = arr.indexOf(id); if (k >= 0) arr[k] = null; }
      r.bench = r.bench.filter((x) => x !== id);
      if (ui.slot !== null) {
        const prev = r.xi[ui.slot];
        r.xi[ui.slot] = id;
        if (prev && r.bench.length < BENCH_MAX) r.bench.push(prev);
        const next = r.xi.findIndex((x, i) => !x && i > ui.slot);
        ui.slot = next >= 0 ? next : null; // jump to the next empty slot
      } else if (r.bench.length < BENCH_MAX) r.bench.push(id);
      save();
    }));
  }
  bindPicks();

  // Manager search
  const mi = root.querySelector('[data-action=mq]');
  const mres = root.querySelector('[data-mres]');
  mi.addEventListener('input', () => {
    ui.mq = mi.value;
    const s = ui.mq.trim().toLowerCase();
    if (!s) { mres.innerHTML = ''; return; }
    const hits = (D.managers ?? []).filter((m) => m.name.toLowerCase().includes(s)).sort((a, b) => b[r.playstyle] - a[r.playstyle]).slice(0, 12);
    mres.innerHTML = hits.map((m) => `<div class="res" data-m="${esc(m.id)}"><b class="t-mgr">${m[r.playstyle]}</b> ${esc(m.name)} <span class="muted">${esc(m.boosts.join(' · '))}</span></div>`).join('') || '<div class="res muted">No match</div>';
    mres.querySelectorAll('[data-m]').forEach((el) => el.addEventListener('mousedown', () => { r.managerId = el.dataset.m; ui.mq = ''; save(); }));
  });
  mi.addEventListener('blur', () => setTimeout(() => (mres.innerHTML = ''), 150));
}

// Slots: a short press selects the slot; dragging moves it to any spot on the pitch (saved in the roster layout).
function bindDrag(root, app, r, layout, rerender, save) {
  const pitch = root.querySelector('.rpitch');
  root.querySelectorAll('[data-slot]').forEach((el) => {
    let start = null, moved = false;
    el.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY };
      moved = false;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
      moved = true;
      el.classList.add('drag');
      const b = pitch.getBoundingClientRect();
      const left = Math.min(100, Math.max(0, ((e.clientX - b.left) / b.width) * 100));
      const top = Math.min(100, Math.max(0, ((e.clientY - b.top) / b.height) * 100));
      el.style.left = `${left}%`;
      el.style.top = `${top}%`;
    });
    el.addEventListener('pointerup', () => {
      if (!start) return;
      start = null;
      const i = Number(el.dataset.slot);
      if (moved) {
        // Back from screen % to layout coordinates (x 0–100, y 0–100 from own goal).
        const left = parseFloat(el.style.left), top = parseFloat(el.style.top);
        layout[i][1] = Math.round(left * 10) / 10;
        layout[i][2] = Math.round(Math.min(100, Math.max(0, (128 - (top * 134) / 100) / 1.2)) * 10) / 10;
        save();
      } else {
        ui.slot = ui.slot === i ? null : i;
        if (ui.slot !== null && r.xi[i]) ui.focus = r.xi[i]; // keep showing this player's build
        ui.bench = false;
        rerender();
      }
    });
  });
}

function shortName(n) {
  const p = String(n).split(' ');
  return p.length > 1 ? p[p.length - 1] : n;
}

function pickerList(app, r, selPos) {
  const q = ui.q.trim().toLowerCase();
  const used = new Set([...r.xi, ...r.bench].filter(Boolean));
  // Like the game: one version of each player per squad (other versions of someone already in are hidden).
  const nm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const usedNames = new Set(app.state.cards.filter((c) => used.has(c.id)).map((c) => nm(c.name)));
  let list = app.state.cards;
  if (selPos && ui.pos === 'slot') list = list.filter((c) => c.position === selPos);
  else if (selPos && ui.pos === 'line') list = list.filter((c) => LINE[c.position] === LINE[selPos]);
  else if (POSITIONS.includes(ui.pos)) list = list.filter((c) => c.position === ui.pos);
  if (q) list = list.filter((c) => `${c.name} ${c.playingStyle} ${c.defensivePlayingStyle ?? ''}`.toLowerCase().includes(q));
  list = list.filter((c) => !used.has(c.id) && !usedNames.has(nm(c.name))).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 40);
  return list.map((c) => `<div class="trow pickrow"><span class="ctype ${c.cardType ?? ''}">${esc(c.position)}</span><b class="${statColor(c.overall ?? 0)}">${c.overall ?? ''}</b>
    <span>${esc(c.name)}</span><span class="muted" style="font-size:11px">${esc(c.playingStyle)}</span><span class="spacer"></span>
    <button class="small" data-add="${esc(c.id)}">${ui.slot !== null ? 'Place' : 'Bench'}</button></div>`).join('') || '<p class="muted" style="font-size:13px">No players match.</p>';
}
