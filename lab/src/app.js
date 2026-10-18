import { loadAll, loadOptionalText, OPTIONAL_CARDS } from './data/loader.js';
import { importText } from './data/importer.js';
import { defaultScenario } from './engine/scenario.js';
import { emptyAllocation } from './engine/progression.js';
import * as planner from './ui/planner.js';
import * as library from './ui/library.js';
import * as lab from './ui/lab.js';
import * as rules from './ui/rules.js';
import * as managers from './ui/managers.js';
import * as tiers from './ui/tiers.js';
// import * as roster from './ui/roster.js'; // hidden

const PAGES = { planner, library, managers, tiers, lab, rules }; // Roster Builder hidden (src/ui/roster.js kept)
const STORE_KEY = 'efml.v1';

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) ?? {}; } catch { return {}; }
}

// Saved data comes from older versions of the app too: keep only what still has a valid shape.
function cleanStore(saved, prog) {
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const cats = new Set(prog.categories.map((c) => c.id));
  const builds = {};
  for (const [id, b] of Object.entries(isObj(saved.builds) ? saved.builds : {})) {
    if (!isObj(b)) continue;
    const custom = {};
    for (const [k, v] of Object.entries(isObj(b.custom) ? b.custom : {})) {
      if (cats.has(k) && Number.isFinite(v)) custom[k] = Math.max(0, Math.min(prog.maxLevelPerCategory ?? 40, Math.round(v)));
    }
    builds[id] = {
      custom, boostersEdited: b.boostersEdited === true, boosters: isObj(b.boosters) ? b.boosters : undefined,
      booster2: typeof b.booster2 === 'string' ? b.booster2 : null, extraSkills: Array.isArray(b.extraSkills) ? b.extraSkills.filter((s) => typeof s === 'string' || s == null).slice(0, 5) : undefined,
      rating: Number.isFinite(b.rating) ? b.rating : undefined,
    };
  }
  const rosters = isObj(saved.rosters) && Array.isArray(saved.rosters.list) && saved.rosters.list.every((r) => isObj(r) && r.id && Array.isArray(r.xi) && Array.isArray(r.bench) && typeof r.formation === 'string') ? saved.rosters : undefined;
  return {
    imported: Array.isArray(saved.imported) ? saved.imported.filter((c) => isObj(c) && c.id && isObj(c.stats)) : [],
    builds, rosters, freqs: isObj(saved.freqs) ? saved.freqs : {}, selectedCardId: saved.selectedCardId,
  };
}

// Last resort when a page fails: offer to clear this browser's saved data (builds, rosters).
function showError(root, e) {
  console.error(e);
  root.innerHTML = `<div class="notice"><b>Something went wrong on this page.</b> It is usually old data saved in this browser from an earlier version.
    <div class="row" style="margin-top:10px;gap:8px"><button data-reset-store>Reset saved data and reload</button><button data-reload>Reload</button></div>
    <div class="muted" style="font-size:12px;margin-top:8px">${String(e?.message ?? e).replace(/[<>&]/g, '')}</div></div>`;
  root.querySelector('[data-reset-store]').addEventListener('click', () => { try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ } location.reload(); });
  root.querySelector('[data-reload]').addEventListener('click', () => location.reload());
}

const app = {
  D: null,
  state: null,
  card(id = this.state.selectedCardId) { return this.state.cards.find((c) => c.id === id) ?? this.state.cards[0]; },
  build(card = this.card()) {
    const b = (this.state.builds[card.id] ??= {});
    b.custom ??= emptyAllocation(this.D.progression);
    // Boosters follow the card's own boosters (refreshed when the dataset is re-scraped) unless the user edited them.
    if (!b.boostersEdited) b.boosters = { ...(card.boosters ?? {}) };
    b.booster2 ??= null; // optional slot-2 booster chosen in the Build Planner
    b.rating ??= card.positionRating ?? card.overall;
    return b;
  },
  selectCard(id) {
    this.state.selectedCardId = id;
    this.state.scenario.role = this.card().position;
    this.state.opt.result = null;
    this.update();
  },
  save() {
    try {
      const s = this.state;
      localStorage.setItem(STORE_KEY, JSON.stringify({
        // Only hand-imported cards are stored; demo and bundled scraper cards are reloaded from files.
        imported: s.cards.filter((c) => !['fictional', 'scraper'].includes(c.source?.method)),
        builds: s.builds, freqs: s.opt.freqs, selectedCardId: s.selectedCardId, rosters: s.rosters,
      }));
    } catch { /* storage unavailable or full: app keeps working in memory */ }
  },
  update() { this.save(); render(); },
};

function route() { return (location.hash.replace('#/', '') || 'planner').split('?')[0]; }

function render() {
  const r = PAGES[route()] ? route() : 'planner';
  document.querySelectorAll('#nav a[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
  const root = document.getElementById('root');
  const y = window.scrollY;
  try {
    PAGES[r].render(root, app);
  } catch (e) {
    showError(root, e);
  }
  window.scrollTo(0, y);
}

// The page itself can be an old cached copy (GitHub Pages ~10 min): compare with version.json and, once,
// reload under a new URL so the browser fetches the current index.html and its versioned files.
async function ensureFresh() {
  const mine = document.querySelector('meta[name="build"]')?.content;
  if (!mine) return true; // local dev: not stamped
  try {
    const { build } = await (await fetch('version.json', { cache: 'no-store' })).json();
    const url = new URL(location.href);
    if (build && build !== mine && url.searchParams.get('b') !== build) {
      url.searchParams.set('b', build);
      location.replace(url.toString());
      return false;
    }
  } catch { /* offline or no version file: keep going */ }
  return true;
}

async function init() {
  if (!(await ensureFresh())) return;
  try {
    app.D = await loadAll();
  } catch (e) {
    document.getElementById('root').innerHTML = `<div class="notice">Could not load the versioned data files: ${e.message}. Start the app with <code>serve.ps1</code>, not as a local file.</div>`;
    return;
  }
  const saved = cleanStore(loadStore(), app.D.progression);
  const csv = await loadOptionalText(OPTIONAL_CARDS);
  const bundled = csv ? importText(csv, 'cards.csv').cards : [];
  app.D.bundledCount = bundled.length;
  const mgrText = await loadOptionalText('data/managers.efhub.csv');
  app.D.managers = mgrText ? managers.parseManagers(mgrText) : [];
  const sample = app.D.sampleCards.cards;
  const known = new Set([...bundled, ...sample].map((c) => c.id));
  const imported = (saved.imported ?? []).filter((c) => !known.has(c.id));
  const cards = [...imported, ...bundled, ...sample];
  app.state = {
    cards,
    selectedCardId: cards.some((c) => c.id === saved.selectedCardId) ? saved.selectedCardId : cards[0].id,
    builds: saved.builds ?? {},
    rosters: saved.rosters,
    scenario: defaultScenario(),
    compare: [],
    opt: { freqs: { ...app.D.roles.defaultFrequencies.values, ...(saved.freqs ?? {}) }, tactical: null, condition: 'C', managerLevel: 'none', result: null },
    lab: { selected: 'fortress', query: '', filter: 'all', baseValue: 88 },
  };
  app.state.scenario.role = app.card().position;
  window.addEventListener('hashchange', render);
  render();
}

window.__app = app;
init();
