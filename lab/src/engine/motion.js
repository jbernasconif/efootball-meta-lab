// Motion / trajectory / penalty parameters documented in the article (layer G).
// These are never converted into attribute points.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Article's normalisation N(x, a, b) = clamp((x − a)/(b − a), 0, 1).
export const N = (x, a, b) => clamp((x - a) / (b - a), 0, 1);

export function bulletHeaderRetention(diffDeg, withSkill) {
  const r = clamp((diffDeg - 45) / 90, 0, 1);
  return 1 - (withSkill ? 0.15 : 0.2) * r * r;
}

export function blitzCurlerPower(input) {
  return 0.7 + 0.3 * N(input, 0.5, 1);
}

export function blitzCurlerC(curl) {
  return 0.17 * N(curl, 10, 60) + 0.75 * N(curl, 60, 90) + 0.08 * N(curl, 90, 99);
}

export function blitzCurlerR(d) {
  return 7 - 4 * (1 - N(d, 10, 15)) - 3 * (1 - N(d, 20, 25));
}

// Extra launch angle in degrees (preferred foot). Curl above 99 has separate, undocumented handling.
export function blitzCurlerAngle(d, curl, kickingPower) {
  return blitzCurlerR(d) * (0.8 + 0.2 * blitzCurlerC(curl) + 0.1 * (1 - (kickingPower - 40) / (99.9 - 40)));
}

export function lowScreamerPower(power) {
  return power < 0.5 ? power + 0.2 : power;
}

export function fightingSpiritThreshold({ captain = false, fightingSpirit = false, specialDefensive = false }) {
  return Math.min(100, 60 + 10 * +captain + 15 * +fightingSpirit + 15 * +specialDefensive);
}

export function fightingSpiritDistanceThreshold({ consumed, captain = false, fightingSpirit = false, attacking = false, specialDefensive = false }) {
  const init = fightingSpiritThreshold({ captain, fightingSpirit, specialDefensive });
  const q = N(consumed, init, Math.min(init + 20, 100));
  return 40 - 35 * q + (attacking ? 15 : 0) + (fightingSpirit ? 10 : captain ? 5 : 0);
}

// Phenomenal Finishing posture retention (severity 1): linear in effective Finishing, weight 0 at 114.
export function postureRetention(effectiveFinishing) {
  const w = clamp((114 - effectiveFinishing) / (114 - 99), 0, 1);
  return 1 - 0.1 * w;
}

export function edgedCrossingSpinB(distance) {
  return 3.4 - N(distance, 25, 30);
}

// Builds the layer-G report for an owned motion skill given scenario facts and effective stats.
export function motionReport(formula, f, stats) {
  switch (formula) {
    case 'bullet_header':
      return [
        row('Direction-mismatch retention', bulletHeaderRetention(f.headerDirectionDiff, false), bulletHeaderRetention(f.headerDirectionDiff, true), `mismatch ${f.headerDirectionDiff}°`),
        row('Motion tier 9 loss', '8% / 13%', '5% / 10%'),
        row('Perturbation multiplier (classes 0,2,15,17)', 0.4, 0.5),
        row('Max ball-speed bound', '+0 km/h', '+4 km/h', 'e.g. Heading 99: 52→56 km/h'),
        row('Contact severity', '×1', '×0.5'),
      ];
    case 'blitz_curler':
      return [
        row('Local trajectory power', f.shotPower, blitzCurlerPower(f.shotPower)),
        row('Extra launch angle (preferred foot)', 0, blitzCurlerAngle(f.distance, stats.curl, stats.kickingPower), `d=${f.distance} m, Curl ${stats.curl}, Kicking Power ${stats.kickingPower}`),
      ];
    case 'low_screamer':
      return [row('Local power', f.shotPower, lowScreamerPower(f.shotPower), 'Kicking Power unchanged')];
    case 'edged_crossing':
      return [
        row('Spin components (state A)', '—', '4.6 / −3.6'),
        row('Spin components (state B)', '—', `${edgedCrossingSpinB(f.distance).toFixed(3)} / −2.4`),
        row('Extra launch angle', 0, '+3.8° or +2.5° (clamped 0–31°)'),
        row('Ball-speed increase', '—', 'NOT confirmed'),
      ];
    case 'acceleration_burst':
      return [
        row('Internal speed limit (dribble sub-state)', 11, 16, 'internal units'),
        row('Speed-configuration multiplier', 1, 1.025),
        row('Normalised TP coefficient', '+0', '+0.1', 'not TP +10'),
      ];
    case 'long_reach_tackle':
      return [
        row('Orientation limit (designated side)', '11.25°', '16.875°', 'example Tackling 99'),
        row('Other orientation limit', '22.5°', '28.125°'),
        row('Stationary lateral limit', 2, 5),
      ];
    case 'fighting_spirit':
      return [
        row('AI fatigue threshold (% consumed)', fightingSpiritThreshold({ captain: f.isCaptain }), fightingSpiritThreshold({ captain: f.isCaptain, fightingSpirit: true })),
        row('Distance-to-ball threshold', fightingSpiritDistanceThreshold({ consumed: f.staminaConsumed, captain: f.isCaptain, attacking: f.attacking }), fightingSpiritDistanceThreshold({ consumed: f.staminaConsumed, captain: f.isCaptain, fightingSpirit: true, attacking: f.attacking }), `consumed ${f.staminaConsumed}%`),
        row('Ball-release penalty under pressure', '×1', '×0.8'),
      ];
    case 'phenomenal_finishing':
      return [
        row('Posture retention (severity 1)', postureRetention(stats.finishing), postureRetention(stats.finishing + 7), 'from effective Finishing'),
        row('Backward error coefficients', 0.3, 0.8),
        row('Acrobatic error score', '×1', '×0.9 (×0.8 with Acrobatic Finishing)'),
      ];
    case 'phenomenal_pass':
      return [
        row('Backward error coefficients', 0.3, 0.8),
        row('Extra backward severity', '×1', '×0.4'),
        row('q-discounts (×0.6, ×0.8, ×0.9)', 'applied', 'skipped'),
      ];
    default:
      return [];
  }
}

function row(name, without, withSkill, note = '') {
  return { name, without, with: withSkill, note };
}
