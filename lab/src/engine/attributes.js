// Canonical attribute keys (26) and Spanish labels.
export const ATTRS = [
  'offensiveAwareness', 'ballControl', 'dribbling', 'tightPossession', 'lowPass', 'loftedPass',
  'finishing', 'heading', 'placeKicking', 'curl',
  'defensiveAwareness', 'defensiveEngagement', 'tackling', 'aggression',
  'gkAwareness', 'gkCatching', 'gkParrying', 'gkReflexes', 'gkReach',
  'speed', 'acceleration', 'kickingPower', 'jump', 'physicalContact', 'balance', 'stamina',
];

// In-game English names (eFootball), so the app reads like the game's Player Progression screen.
export const LABELS = {
  offensiveAwareness: 'Offensive Awareness', ballControl: 'Ball Control', dribbling: 'Dribbling',
  tightPossession: 'Tight Possession', lowPass: 'Low Pass', loftedPass: 'Lofted Pass',
  finishing: 'Finishing', heading: 'Heading', placeKicking: 'Place Kicking', curl: 'Curl',
  defensiveAwareness: 'Defensive Awareness', defensiveEngagement: 'Defensive Engagement',
  tackling: 'Tackling', aggression: 'Aggression', gkAwareness: 'GK Awareness',
  gkCatching: 'GK Catching', gkParrying: 'GK Parrying', gkReflexes: 'GK Reflexes', gkReach: 'GK Reach',
  speed: 'Speed', acceleration: 'Acceleration', kickingPower: 'Kicking Power', jump: 'Jump',
  physicalContact: 'Physical Contact', balance: 'Balance', stamina: 'Stamina',
};

// Stat groups as shown in the game / eFHUB.
export const GROUPS = {
  Attacking: ['offensiveAwareness', 'ballControl', 'dribbling', 'tightPossession', 'lowPass', 'loftedPass', 'finishing', 'heading', 'placeKicking', 'curl'],
  Defending: ['defensiveAwareness', 'defensiveEngagement', 'tackling', 'aggression', 'gkAwareness', 'gkCatching', 'gkParrying', 'gkReflexes', 'gkReach'],
  Athleticism: ['speed', 'acceleration', 'kickingPower', 'jump', 'physicalContact', 'balance', 'stamina'],
};

export const GK_ATTRS = ['gkAwareness', 'gkCatching', 'gkParrying', 'gkReflexes', 'gkReach'];

export const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF'];

// Accepts English names as shown on eFHUB ("Attacking Awareness", "Set Piece Taking", "Jumping"...).
const ALIASES = {
  'attacking awareness': 'offensiveAwareness', 'offensive awareness': 'offensiveAwareness',
  'ball control': 'ballControl', dribbling: 'dribbling', 'tight possession': 'tightPossession',
  'low pass': 'lowPass', 'lofted pass': 'loftedPass', finishing: 'finishing', heading: 'heading',
  'set piece taking': 'placeKicking', 'place kicking': 'placeKicking', curl: 'curl',
  'defensive awareness': 'defensiveAwareness', 'defensive engagement': 'defensiveEngagement',
  tackling: 'tackling', aggression: 'aggression', 'gk awareness': 'gkAwareness',
  'gk catching': 'gkCatching', 'gk parrying': 'gkParrying', 'gk reflexes': 'gkReflexes', 'gk reach': 'gkReach',
  speed: 'speed', acceleration: 'acceleration', 'kicking power': 'kickingPower', jumping: 'jump', jump: 'jump',
  'physical contact': 'physicalContact', balance: 'balance', stamina: 'stamina',
};

export function normalizeAttrKey(k) {
  if (ATTRS.includes(k)) return k;
  return ALIASES[String(k).trim().toLowerCase()] ?? null;
}
