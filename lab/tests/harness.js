// Minimal test harness (no dependencies; runs in the browser).
const registry = [];
export function test(name, fn) { registry.push({ name, fn }); }

export function eq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
export function close(actual, expected, tol = 1e-6, msg = '') {
  if (Math.abs(actual - expected) > tol) throw new Error(`${msg} expected ≈${expected}, got ${actual}`);
}
export function ok(v, msg = 'condition is false') { if (!v) throw new Error(msg); }

export async function run() {
  const results = [];
  for (const t of registry) {
    try { await t.fn(); results.push({ name: t.name, ok: true }); }
    catch (e) { results.push({ name: t.name, ok: false, error: e.message }); }
  }
  return results;
}
