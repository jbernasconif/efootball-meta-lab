// Progression points: cost per level and attribute increments, driven by data/progression.v*.json.

export function levelCost(prog, level) {
  const row = prog.costByLevel.find((r) => level >= r.fromLevel && level <= r.toLevel);
  if (!row) throw new Error(`No cost defined for level ${level}`);
  return row.cost;
}

export function categoryCost(prog, levels) {
  let total = 0;
  for (let l = 1; l <= levels; l++) total += levelCost(prog, l);
  return total;
}

export function totalCost(prog, allocation) {
  return prog.categories.reduce((sum, c) => sum + categoryCost(prog, allocation[c.id] ?? 0), 0);
}

export function emptyAllocation(prog) {
  return Object.fromEntries(prog.categories.map((c) => [c.id, 0]));
}

// Attribute increments produced by an allocation (category levels → +N per attribute).
export function progressionDeltas(prog, allocation) {
  const out = {};
  for (const c of prog.categories) {
    const lv = allocation[c.id] ?? 0;
    for (const a of c.attrs) out[a] = (out[a] ?? 0) + lv * prog.increasePerLevel;
  }
  return out;
}

export function canAdd(prog, allocation, catId, budget) {
  const next = (allocation[catId] ?? 0) + 1;
  if (prog.maxLevelPerCategory && next > prog.maxLevelPerCategory) return false;
  return totalCost(prog, allocation) + levelCost(prog, next) <= budget;
}
