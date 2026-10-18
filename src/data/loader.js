// Loads the versioned rule/data files. Paths are relative to the site root.
export const DATA_FILES = {
  skills: 'data/skills.v1.json',
  mechanics: 'data/mechanics.v1.json',
  progression: 'data/progression.v1.json',
  roles: 'data/roles.v1.json',
  boosters: 'data/boosters.v1.json',
  managerProficiency: 'data/manager-proficiency.v1.json',
  breakpoints: 'data/breakpoints.v1.json',
  formations: 'data/formations.v1.json',
  sampleCards: 'data/cards.sample.json',
};

// Optional card dataset produced by tools/efhub_scraper.py (copied to data/cards.efhub.csv).
export const OPTIONAL_CARDS = 'data/cards.efhub.csv';

export async function loadOptionalText(path, base = '') {
  try {
    const res = await fetch(base + path, { cache: 'no-cache' });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

export async function loadAll(base = '') {
  const entries = await Promise.all(Object.entries(DATA_FILES).map(async ([k, p]) => {
    const res = await fetch(base + p, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Could not load ${p}: ${res.status}`);
    return [k, await res.json()];
  }));
  const D = Object.fromEntries(entries);
  D.mechanics.proficiency = D.managerProficiency; // used by managerDelta for proficiency 70–90
  // Full tier lists exist only in local copies (git-ignored); the public site gets the link-only version.
  const tiersText = (await loadOptionalText('data/tiers.v1.json', base)) ?? (await loadOptionalText('data/tiers.public.json', base));
  D.tiers = tiersText ? JSON.parse(tiersText) : { public: true, links: [] };
  return D;
}
