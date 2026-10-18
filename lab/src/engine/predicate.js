// Evaluates declarative activation predicates stored in data/skills.v*.json.
// Node shapes: {all:[...]}, {any:[...]}, {not:node}, {fact, op, value, label}.

const OPS = {
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
};

// Returns { ok, checks: [{label, ok, fact, actual, expected}] } — checks are leaf/group results for explanations.
export function evaluate(node, facts) {
  const checks = [];
  const ok = evalNode(node, facts, checks, 0);
  return { ok, checks };
}

function evalNode(node, facts, checks, depth) {
  if (!node) return true;
  if (node.all) {
    const inner = [];
    const ok = node.all.map((n) => evalNode(n, facts, inner, depth + 1)).every(Boolean);
    if (node.label && depth > 0) checks.push({ label: node.label, ok, group: true });
    else checks.push(...inner);
    return ok;
  }
  if (node.any) {
    const inner = [];
    const ok = node.any.map((n) => evalNode(n, facts, inner, depth + 1)).some(Boolean);
    checks.push({ label: node.label ?? 'Any of the alternatives', ok, group: true });
    return ok;
  }
  if (node.not) {
    const inner = [];
    const ok = !evalNode(node.not, facts, inner, depth + 1);
    checks.push({ label: node.label ?? 'Negation', ok, group: true });
    return ok;
  }
  const fn = OPS[node.op];
  if (!fn) throw new Error(`Unknown operator: ${node.op}`);
  const actual = facts[node.fact];
  const ok = actual !== undefined && fn(actual, node.value);
  checks.push({ label: node.label ?? `${node.fact} ${node.op} ${JSON.stringify(node.value)}`, ok, fact: node.fact, actual, expected: node.value, op: node.op });
  return ok;
}

// Lists the facts a predicate reads (used by the UI to show only relevant scenario inputs).
export function factsUsed(node, out = new Set()) {
  if (!node) return out;
  for (const k of ['all', 'any']) if (node[k]) node[k].forEach((n) => factsUsed(n, out));
  if (node.not) factsUsed(node.not, out);
  if (node.fact) out.add(node.fact);
  return out;
}
