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

const PAGES = { planner, library, managers, tiers, lab, rules };
const STORE_KEY = 'efml.v1';

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) ?? {}; } catch { return {}; }
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
        builds: s.builds, freqs: s.opt.freqs, selectedCardId: s.selectedCardId,
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
  PAGES[r].render(root, app);
  window.scrollTo(0, y);
}

async function init() {
  try {
    app.D = await loadAll();
  } catch (e) {
    document.getElementById('root').innerHTML = `<div class="notice">Could not load the versioned data files: ${e.message}. Start the app with <code>serve.ps1</code>, not as a local file.</div>`;
    return;
  }
  const saved = loadStore();
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
