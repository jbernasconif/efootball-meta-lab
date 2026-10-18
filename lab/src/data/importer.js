// Card import: validates JSON or CSV (including the tools/efhub_scraper.py output).
import { ATTRS, POSITIONS, normalizeAttrKey } from '../engine/attributes.js';

const num = (v) => (v === '' || v === undefined || v === null ? undefined : Number(v));
const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split('|').map((s) => s.trim()).filter(Boolean));

// Groups prefixed scraper columns (phys_*, model_*, max_*, maxBuild_*) into nested objects.
function nested(raw, prefix) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith(prefix) && v !== '' && v !== undefined) out[k.slice(prefix.length)] = isNaN(Number(v)) ? v : Number(v);
  }
  return Object.keys(out).length ? out : undefined;
}

export function validateCard(raw, i = 0) {
  const errors = [];
  const where = `Card ${i + 1}${raw?.name ? ` (${raw.name})` : ''}`;
  if (!raw || typeof raw !== 'object') return { errors: [`${where}: not an object`] };
  const stats = {};
  for (const [k, v] of Object.entries(raw.stats ?? {})) {
    const key = normalizeAttrKey(k);
    if (!key) { errors.push(`${where}: unknown stat "${k}"`); continue; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 40 || n > 120) errors.push(`${where}: ${k}=${v} outside 40–120`);
    stats[key] = n;
  }
  for (const a of ATTRS) if (stats[a] === undefined) errors.push(`${where}: missing stat ${a}`);
  if (!raw.id) errors.push(`${where}: missing id (unique per card version)`);
  if (!raw.name) errors.push(`${where}: missing name`);
  if (!POSITIONS.includes(raw.position)) errors.push(`${where}: invalid position "${raw.position}"`);
  const pts = Number(raw.progressionPoints ?? 0);
  if (!Number.isInteger(pts) || pts < 0) errors.push(`${where}: progressionPoints must be an integer ≥ 0`);
  const card = {
    id: String(raw.id), name: raw.name, version: raw.version ?? '', cardType: raw.cardType ?? 'unknown',
    position: raw.position, positionRating: num(raw.positionRating ?? raw.overall), overall: num(raw.overall ?? raw.positionRating),
    maxOverall: num(raw.maxOverall), playingStyle: raw.playingStyle ?? '', defensivePlayingStyle: raw.defensivePlayingStyle ?? '',
    foot: raw.foot ?? '', height: raw.height, weight: raw.weight, age: raw.age, condition: raw.condition,
    weakFootUsage: raw.weakFootUsage, weakFootAccuracy: raw.weakFootAccuracy, form: raw.form, injuryResistance: raw.injuryResistance,
    progressionPoints: pts, stats, skills: list(raw.skills), comSkills: list(raw.comSkills),
    physics: raw.physics ?? nested(raw, 'phys_'), model: raw.model ?? nested(raw, 'model_'),
    maxStats: raw.maxStats ?? nested(raw, 'max_'), efhubMaxBuild: raw.efhubMaxBuild ?? nested(raw, 'maxBuild_'),
    // Card boosters: per-stat amounts (booster_*) and names ("Breakthrough +4"). Older scrapes (v1) folded
    // boosters into the base stats, so boostersSeparated tells the UI whether the split is known.
    boosters: raw.boosters && typeof raw.boosters === 'object' ? raw.boosters : Object.fromEntries(Object.entries(nested(raw, 'booster_') ?? {}).filter(([, v]) => v)),
    boosterNames: Array.isArray(raw.boosterNames) ? raw.boosterNames : typeof raw.boosters === 'string' ? list(raw.boosters) : [],
    boostersSeparated: raw.boostersSeparated === true || raw.boostersSeparated === '1' || raw.fictional === true || raw.source?.method === 'manual',
    boostedOverall: num(raw.boostedOverall),
    fictional: !!raw.fictional,
    source: raw.source ?? (raw.sourceUrl ? { site: 'efhub', url: raw.sourceUrl, retrievedAt: raw.retrievedAt, method: 'scraper' } : { method: 'manual' }),
  };
  return { card, errors };
}

export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!head) return [];
  return body.map((r) => {
    const obj = { stats: {} };
    head.forEach((h, i) => {
      const key = h.trim().replace(/^﻿/, '');
      const val = (r[i] ?? '').trim();
      const attr = normalizeAttrKey(key);
      if (attr) obj.stats[attr] = Number(val);
      else obj[key] = val;
    });
    return obj;
  });
}

export function importText(text, filename = '') {
  let raws;
  if (filename.toLowerCase().endsWith('.csv')) raws = parseCSV(text);
  else {
    const data = JSON.parse(text);
    raws = Array.isArray(data) ? data : data.cards ?? [data];
  }
  const cards = [];
  const errors = [];
  raws.forEach((r, i) => {
    const res = validateCard(r, i);
    if (res.errors.length) errors.push(...res.errors);
    else cards.push(res.card);
  });
  return { cards, errors };
}

export const CSV_TEMPLATE = ['id', 'name', 'version', 'cardType', 'position', 'positionRating', 'overall', 'playingStyle', 'foot', 'progressionPoints', 'skills', ...ATTRS].join(',') + '\n';
