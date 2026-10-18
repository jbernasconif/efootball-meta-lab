// Automated tests built from the numeric cases stated in the eFHUB article (17 Oct 2026).
// Tests tagged [derivado] check a documented formula at a point the article does not print explicitly.
import { test, eq, close, ok } from './harness.js';
import { pipelineValue, conditionDelta, managerDelta, computePlayer } from '../src/engine/stats.js';
import { resolveSkills } from '../src/engine/skills.js';
import { deriveFacts, defaultScenario, countNearbyOpponents } from '../src/engine/scenario.js';
import { bulletHeaderRetention, blitzCurlerAngle, blitzCurlerPower, postureRetention, fightingSpiritThreshold, lowScreamerPower } from '../src/engine/motion.js';
import { categoryCost, totalCost } from '../src/engine/progression.js';
import { optimize, makeObjective, weightsFor, skillStates, curveValue, curvesFrom, targetsFor } from '../src/engine/optimizer.js';
import { importText } from '../src/data/importer.js';
import { ATTRS } from '../src/engine/attributes.js';
import { summarize, analyzeCategories, statBreakdown, combineBoosters, withNoBreach, capBreaches, autoBuild } from '../src/engine/planner.js';

export function register(D) {
  const { skills: db, mechanics: mech, progression: prog, roles } = D;
  const facts = (o) => deriveFacts(defaultScenario(o), mech.pitch);
  const resolve = (owned, o) => resolveSkills(owned, facts(o), db);
  const flatCard = (v = 80, extra = {}) => ({ id: 't', name: 'T', position: 'CB', positionRating: 80, stats: Object.fromEntries(ATTRS.map((a) => [a, v])), skills: [], progressionPoints: 0, ...extra });

  // ---- 99 cap / order of operations ----
  test('99 cap · ordinary 99, post-cap 0: Fortress off 99 / on 99', () => {
    eq(pipelineValue({ base: 99 }).extended, 99);
    eq(pipelineValue({ base: 99, temp: 6 }).extended, 99);
  });
  test('99 cap · ordinary 97, post-cap 2: off 99 / on 101', () => {
    eq(pipelineValue({ base: 97, postCap: 2 }).extended, 99);
    eq(pipelineValue({ base: 97, temp: 6, postCap: 2 }).extended, 101);
  });
  test('99 cap · ordinary 93, post-cap 6: off 99 / on 105', () => {
    eq(pipelineValue({ base: 93, postCap: 6 }).extended, 99);
    eq(pipelineValue({ base: 93, temp: 6, postCap: 6 }).extended, 105);
  });
  test('Fortress full bonus up to pre-cap 93', () => {
    eq(pipelineValue({ base: 93, temp: 6 }).ordinary, 99);
    eq(pipelineValue({ base: 94, temp: 6 }).capLoss, 1);
  });
  test('Extended range capped at 120', () => {
    eq(pipelineValue({ base: 99, postCap: 30 }).extended, 120);
  });
  test('Super-sub: 98+1=99; 99 stays 99', () => {
    eq(pipelineValue({ base: 98, temp: 1 }).ordinary, 99);
    eq(pipelineValue({ base: 99, temp: 1 }).ordinary, 99);
  });

  // ---- Manager 89 ----
  test('Manager 89 · reference 83: 85 without skill, 88 with +3 (not 89)', () => {
    const d = managerDelta(mech, '89', 83);
    eq(d, 2);
    eq(pipelineValue({ base: 83, mgrDelta: d }).ordinary, 85);
    eq(pipelineValue({ base: 83, mgrDelta: d, temp: 3 }).ordinary, 88);
  });
  test('Manager 89 · reference 84: 87 without skill, 90 with +3', () => {
    const d = managerDelta(mech, '89', 84);
    eq(d, 3);
    eq(pipelineValue({ base: 84, mgrDelta: d }).ordinary, 87);
    eq(pipelineValue({ base: 84, mgrDelta: d, temp: 3 }).ordinary, 90);
  });
  test('Manager proficiency table (measured on eFHUB) reproduces the article at 89 for every stat 40–99', () => {
    for (let v = 40; v <= 99; v++) eq(managerDelta(mech, 89, v), v <= 55 ? 1 : v <= 83 ? 2 : 3, `v=${v}`);
  });
  test('Manager proficiency: measured points (Mbappe card, eFHUB 18 Oct 2026)', () => {
    eq(managerDelta(mech, 70, 86), 0); eq(managerDelta(mech, 72, 86), 1); eq(managerDelta(mech, 79, 86), 2); eq(managerDelta(mech, 88, 86), 3);
    eq(managerDelta(mech, 80, 40), 1); eq(managerDelta(mech, 79, 40), 0); eq(managerDelta(mech, 85, 62), 2); eq(managerDelta(mech, 84, 62), 1);
    eq(managerDelta(mech, 'none', 86), 0);
  });
  test('Manager boosts (e.g. Tackling +1) add to the Mgr column before the cap', () => {
    const card = flatCard(80);
    const r = statBreakdown(card, prog, {}, mech, db, { managerLevel: 89, managerBoosts: { tackling: 1 } }).tackling;
    eq(r.mgrProf, 2); eq(r.mgrBoost, 1); eq(r.extended, 83);
  });
  test('Manager 89 · bands 40–55 +1 / 56–83 +2 / 84–99 +3', () => {
    eq(managerDelta(mech, '89', 55), 1); eq(managerDelta(mech, '89', 56), 2); eq(managerDelta(mech, '89', 99), 3);
  });

  // ---- Condition arrows ----
  test('Arrows · rating ≥95: Awareness B +2 / A +3; Technical and Physical B +1 / A +2', () => {
    eq(conditionDelta(mech, 'offensiveAwareness', 'B', 95, 'CF'), 2);
    eq(conditionDelta(mech, 'offensiveAwareness', 'A', 99, 'CF'), 3);
    eq(conditionDelta(mech, 'finishing', 'B', 95, 'CF'), 1);
    eq(conditionDelta(mech, 'finishing', 'A', 95, 'CF'), 2);
    eq(conditionDelta(mech, 'speed', 'A', 95, 'CF'), 2);
  });
  test('Arrows · rating 60: Awareness 10/15; Technical 6/11; Physical 3/6', () => {
    eq(conditionDelta(mech, 'defensiveAwareness', 'B', 60, 'CB'), 10);
    eq(conditionDelta(mech, 'defensiveAwareness', 'A', 60, 'CB'), 15);
    eq(conditionDelta(mech, 'tackling', 'B', 60, 'CB'), 6);
    eq(conditionDelta(mech, 'tackling', 'A', 60, 'CB'), 11);
    eq(conditionDelta(mech, 'jump', 'B', 60, 'CB'), 3);
    eq(conditionDelta(mech, 'jump', 'A', 60, 'CB'), 6);
  });
  test('Arrows · 5-condition table group 2 at 95: [−12, −8, 0, 1, 2]', () => {
    eq(conditionDelta(mech, 'stamina', 'E', 95, 'CB'), -12);
    eq(conditionDelta(mech, 'stamina', 'D', 95, 'CB'), -8);
    eq(conditionDelta(mech, 'stamina', 'C', 95, 'CB'), 0);
  });
  test('Arrows · [derived] interpolation truncated toward zero (rating 77.5, Awareness B = 6)', () => {
    eq(conditionDelta(mech, 'offensiveAwareness', 'B', 77.5, 'CF'), 6);
    eq(conditionDelta(mech, 'stamina', 'E', 70, 'CB'), Math.trunc(-5 + (-7) * (10 / 35)));
  });
  test('Arrows · Aggression not listed; GK stats skipped for non-GK positions', () => {
    eq(conditionDelta(mech, 'aggression', 'A', 95, 'CB'), 0);
    eq(conditionDelta(mech, 'gkReflexes', 'A', 95, 'CB'), 0);
    eq(conditionDelta(mech, 'gkReflexes', 'A', 95, 'GK'), 2);
  });
  test('Arrows · result clamped to 40–99', () => {
    eq(pipelineValue({ base: 98, condDelta: 3 }).afterCondition, 99);
    eq(pipelineValue({ base: 42, condDelta: -5 }).afterCondition, 40);
  });

  // ---- Activation conditions ----
  test('Fortress: 1st half winning = off; 2nd winning = on; 2nd level/losing = off', () => {
    eq(resolve(['fortress'], { half: 1, scoreState: 'ahead' }).tempAdds.tackling, undefined);
    eq(resolve(['fortress'], { half: 2, scoreState: 'ahead' }).tempAdds.tackling, 6);
    eq(resolve(['fortress'], { half: 2, scoreState: 'level' }).tempAdds.tackling, undefined);
    eq(resolve(['fortress'], { half: 2, scoreState: 'behind' }).tempAdds.tackling, undefined);
    eq(resolve(['fortress'], { half: 3, scoreState: 'ahead' }).tempAdds.defensiveEngagement, 6);
  });
  test('Game-changing Pass: 2nd half level/losing = +6; winning or 1st half = off', () => {
    eq(resolve(['game_changing_pass'], { half: 2, scoreState: 'level' }).tempAdds.lowPass, 6);
    eq(resolve(['game_changing_pass'], { half: 2, scoreState: 'behind' }).tempAdds.loftedPass, 6);
    eq(resolve(['game_changing_pass'], { half: 2, scoreState: 'ahead' }).tempAdds.lowPass, undefined);
    eq(resolve(['game_changing_pass'], { half: 1, scoreState: 'behind' }).tempAdds.lowPass, undefined);
  });
  test('Super-sub: starter and 1st-half sub do not qualify; half-time/2nd/extra time do', () => {
    eq(resolve(['super_sub'], { isSubstitute: false }).tempAdds.speed, undefined);
    eq(resolve(['super_sub'], { isSubstitute: true, subEntry: 'first_half' }).tempAdds.speed, undefined);
    eq(resolve(['super_sub'], { isSubstitute: true, subEntry: 'second_half' }).tempAdds.speed, 1);
    eq(resolve(['super_sub'], { isSubstitute: true, subEntry: 'et_second' }).tempAdds.jump, 1);
    eq(resolve(['super_sub'], { isSubstitute: true, subEntry: 'second_half' }).tempAdds.stamina, undefined);
  });
  test('Fortress + Super-sub: 4 defensive stats +7, rest +1', () => {
    const r = resolve(['fortress', 'super_sub'], { half: 2, scoreState: 'ahead', isSubstitute: true, subEntry: 'second_half' });
    for (const a of ['defensiveAwareness', 'tackling', 'aggression', 'defensiveEngagement']) eq(r.tempAdds[a], 7, a);
    eq(r.tempAdds.speed, 1); eq(r.tempAdds.finishing, 1);
    eq(Object.keys(r.tempAdds).length, 25);
    ok(!r.notes.some((n) => n.status === 'hypothesis'), 'documented combination must not be flagged as hypothesis');
  });
  test('Momentum Dribbling: ball holder and x ≥ 18 m', () => {
    eq(resolve(['momentum_dribbling'], { possession: 'self', player: { x: 18, y: 0 } }).tempAdds.speed, 6);
    eq(resolve(['momentum_dribbling'], { possession: 'self', player: { x: 17.9, y: 30 } }).tempAdds.speed, undefined);
    eq(resolve(['momentum_dribbling'], { possession: 'teammate', player: { x: 30, y: 0 } }).tempAdds.speed, undefined);
  });
  test('Attacking Surge: teammate holder, strictly x > 0, IN_PLAY', () => {
    eq(resolve(['attacking_surge'], { possession: 'teammate', player: { x: 0.1, y: 0 } }).tempAdds.acceleration, 3);
    eq(resolve(['attacking_surge'], { possession: 'teammate', player: { x: 0, y: 0 } }).tempAdds.acceleration, undefined);
    eq(resolve(['attacking_surge'], { possession: 'teammate', inPlay: false, player: { x: 10, y: 0 } }).tempAdds.acceleration, undefined);
  });
  test('Momentum + Surge never give +9 in the same check', () => {
    for (const possession of ['self', 'teammate', 'none', 'opponent']) {
      const r = resolve(['momentum_dribbling', 'attacking_surge'], { possession, player: { x: 30, y: 0 } });
      ok((r.tempAdds.speed ?? 0) !== 9, `possession ${possession}`);
    }
  });
  test('GK Directing Defence + GK Spirit Roar: 5 different stats +2 (none +4; Directing = Awareness + Tackling, datamine)', () => {
    const r = resolve([], { role: 'CB', player: { x: -20, y: 0 }, gkDirectingDefence: true, gkSpiritRoar: true, half: 2, scoreState: 'ahead' });
    for (const a of ['defensiveAwareness', 'tackling', 'physicalContact', 'jump', 'acceleration']) eq(r.tempAdds[a], 2, a);
    eq(Object.keys(r.tempAdds).length, 5);
  });
  test('GK Directing Defence: x = −18 yes, −17.9 no; DMF not eligible', () => {
    eq(resolve([], { role: 'LB', player: { x: -18, y: 0 }, gkDirectingDefence: true }).tempAdds.tackling, 2);
    eq(resolve([], { role: 'LB', player: { x: -17.9, y: 0 }, gkDirectingDefence: true }).tempAdds.tackling, undefined);
    eq(resolve([], { role: 'DMF', player: { x: -30, y: 0 }, gkDirectingDefence: true }).tempAdds.tackling, undefined);
  });
  test('GK Spirit Roar: a draw does not qualify', () => {
    eq(resolve([], { role: 'CB', gkSpiritRoar: true, half: 2, scoreState: 'level' }).tempAdds.jump, undefined);
  });
  test('Attack Trigger: the holder does not benefit; a teammate does', () => {
    eq(resolve([], { providerAttackTrigger: true, possession: 'self' }).tempAdds.offensiveAwareness, undefined);
    eq(resolve([], { providerAttackTrigger: true, possession: 'teammate' }).tempAdds.offensiveAwareness, 3);
  });
  test('Shadow Hunt: CB after opponent pass, ball behind, angle < 90°', () => {
    const base = { role: 'CB', possession: 'none', lastContact: 'opponent_pass', player: { x: -10, y: 0 }, ball: { x: -20, y: 0 }, moveAngleToOwnEnd: 30 };
    eq(resolve(['shadow_hunt'], base).tempAdds.speed, 3);
    eq(resolve(['shadow_hunt'], { ...base, moveAngleToOwnEnd: 90 }).tempAdds.speed, undefined);
    eq(resolve(['shadow_hunt'], { ...base, role: 'CMF' }).tempAdds.speed, undefined);
  });

  // ---- Magnetic Feet ----
  test('Magnetic Feet: +2 × min(opponents, 4)', () => {
    const at = (n) => resolve(['magnetic_feet'], { possession: 'self', nearbyOpponentsOverride: n }).tempAdds.dribbling;
    eq(at(0), undefined); eq(at(1), 2); eq(at(2), 4); eq(at(3), 6); eq(at(4), 8); eq(at(7), 8);
  });
  test('Magnetic Feet: 90+8=98; 95+8=99; 99+8=99; thresholds 97/95/93/91', () => {
    eq(pipelineValue({ base: 90, temp: 8 }).ordinary, 98);
    eq(pipelineValue({ base: 95, temp: 8 }).ordinary, 99);
    eq(pipelineValue({ base: 99, temp: 8 }).ordinary, 99);
    eq(pipelineValue({ base: 97, temp: 2 }).capLoss, 0);
    eq(pipelineValue({ base: 91, temp: 8 }).capLoss, 0);
    eq(pipelineValue({ base: 92, temp: 8 }).capLoss, 1);
  });
  test('Magnetic Feet: no effect on Speed, Acceleration or Ball Control', () => {
    const r = resolve(['magnetic_feet'], { possession: 'self', nearbyOpponentsOverride: 4 });
    eq(r.tempAdds.speed, undefined); eq(r.tempAdds.acceleration, undefined); eq(r.tempAdds.ballControl, undefined);
  });
  test('Magnetic Feet: radius 0 < d < 5 (5 m and 0 excluded)', () => {
    const p = { x: 0, y: 0 };
    eq(countNearbyOpponents(p, [{ x: 5, y: 0 }]), 0);
    eq(countNearbyOpponents(p, [{ x: 4.99, y: 0 }]), 1);
    eq(countNearbyOpponents(p, [{ x: 0, y: 0 }]), 0);
    eq(countNearbyOpponents(p, [{ x: 3, y: 3 }, { x: -2, y: 1 }, { x: 10, y: 0 }]), 1); // (-2,1) is in the rear blind spot
    eq(countNearbyOpponents({ ...p, facing: 180 }, [{ x: -2, y: 1 }, { x: 2, y: 0 }]), 1); // facing own goal: front/back swap
  });
  test('Magnetic Feet: a nearby loose ball does not count (must be holder)', () => {
    eq(resolve(['magnetic_feet'], { possession: 'none', nearbyOpponentsOverride: 3 }).tempAdds.dribbling, undefined);
  });

  // ---- Local effective ability ----
  test('Visionary Pass: receiver +6 local (80→86; 99→105), no cap', () => {
    const r = resolve([], { action: 'receive', visionaryMarker: true });
    eq(r.local.attr, 'ballControl'); eq(r.local.bonus, 6);
    eq(pipelineValue({ base: 80, local: 6 }).local, 86);
    eq(pipelineValue({ base: 99, local: 6 }).local, 105);
  });
  test('Visionary Pass: an ordinary trap clears the marker', () => {
    eq(resolve([], { action: 'shot_footed', visionaryMarker: true, markerCleared: true }).local, null);
  });
  test('Phenomenal Finishing: +7 local (80→87; 99→106)', () => {
    const r = resolve(['phenomenal_finishing'], { action: 'shot_footed', specialMotion: true });
    eq(r.local.bonus, 7); eq(r.local.attr, 'finishing');
    eq(pipelineValue({ base: 99, local: 7 }).local, 106);
    eq(pipelineValue({ base: 80, local: 7 }).local, 87);
  });
  test('Phenomenal Finishing: not on headers or without a special motion', () => {
    eq(resolve(['phenomenal_finishing'], { action: 'shot_header', specialMotion: true }).local, null);
    eq(resolve(['phenomenal_finishing'], { action: 'shot_footed', specialMotion: false }).local, null);
  });
  test('Visionary + Phenomenal Finishing: +7 (not +13), documented', () => {
    const r = resolve(['phenomenal_finishing'], { action: 'shot_footed', specialMotion: true, visionaryMarker: true });
    eq(r.local.bonus, 7); eq(r.local.source, 'phenomenal_finishing'); eq(r.local.status, 'documented');
  });
  test('Visionary + Phenomenal Pass: +6 once (not +12)', () => {
    const r = resolve(['phenomenal_pass'], { action: 'pass_ground', specialMotion: true, visionaryMarker: true });
    eq(r.local.bonus, 6); eq(r.local.status, 'documented');
  });
  test('Ordinary passing +5 + Phenomenal Pass: +6 (not +11)', () => {
    const r = resolve(['phenomenal_pass'], { action: 'pass_lofted', specialMotion: true, ordinaryPassing: true });
    eq(r.local.bonus, 6); eq(r.local.attr, 'loftedPass');
  });
  test('Ordinary shooting +5 + Phenomenal Finishing: +7 (not +12)', () => {
    eq(resolve(['phenomenal_finishing'], { action: 'shot_footed', specialMotion: true, ordinaryShooting: true }).local.bonus, 7);
  });
  test('Heading +5 + Bullet Header: 99 → 104 local (Bullet Header adds no Heading)', () => {
    const r = resolve(['ordinary_heading', 'bullet_header'], { action: 'shot_header' });
    eq(r.local.bonus, 5);
    eq(pipelineValue({ base: 99, local: r.local.bonus }).local, 104);
  });
  test('Visionary +6 vs Heading +5 on a header: maximum as HYPOTHESIS (unlisted pair)', () => {
    const r = resolve(['ordinary_heading'], { action: 'shot_header', visionaryMarker: true });
    eq(r.local.bonus, 6); eq(r.local.status, 'hypothesis');
  });
  test('Local bonus does not change permanent stats (separate layer F)', () => {
    const card = flatCard(99, { skills: ['Phenomenal Finishing'], position: 'CF' });
    const res = computePlayer({ card, prog, mech, skillsDB: db, scenario: defaultScenario({ action: 'shot_footed', specialMotion: true }) });
    eq(res.rows.finishing.extended, 99); eq(res.rows.finishing.local, 106);
  });

  // ---- Motion / parameters ----
  test('Bullet Header: retention 90° 0.95→0.9625; ≥135° 0.80→0.85', () => {
    close(bulletHeaderRetention(90, false), 0.95); close(bulletHeaderRetention(90, true), 0.9625);
    close(bulletHeaderRetention(135, false), 0.8); close(bulletHeaderRetention(135, true), 0.85);
    close(bulletHeaderRetention(170, true), 0.85);
  });
  test('Blitz Curler (Curl 80, KP 80): 0° at 10 m; ≈3.868888° at 15/20 m; ≈6.770555° at 25/30 m', () => {
    close(blitzCurlerAngle(10, 80, 80), 0, 1e-6);
    close(blitzCurlerAngle(15, 80, 80), 3.868888, 1e-5);
    close(blitzCurlerAngle(20, 80, 80), 3.868888, 1e-5);
    close(blitzCurlerAngle(25, 80, 80), 6.770555, 1e-5);
    close(blitzCurlerAngle(30, 80, 80), 6.770555, 1e-5);
  });
  test('Blitz Curler: power remap 0.5→0.7; 1→1; activation at ≥50% inclusive', () => {
    close(blitzCurlerPower(0.5), 0.7); close(blitzCurlerPower(1), 1);
    const base = { action: 'controlled_shot', distance: 20, lateralTarget: 2, releaseAngle: 0 };
    ok(resolve(['blitz_curler'], { ...base, shotPower: 0.5 }).motion[0].ok);
    ok(!resolve(['blitz_curler'], { ...base, shotPower: 0.49 }).motion[0].ok);
    ok(!resolve(['blitz_curler'], { ...base, shotPower: 0.8, distance: 35.1 }).motion[0].ok);
  });
  test('Phenomenal Finishing posture: 0.90 at 99; ≈0.946667 at 106; weight 0 at 114', () => {
    close(postureRetention(99), 0.9); close(postureRetention(106), 0.946667, 1e-6); close(postureRetention(114), 1);
  });
  test('Fighting Spirit: fatigue threshold 60→75; captain 70→85', () => {
    eq(fightingSpiritThreshold({}), 60); eq(fightingSpiritThreshold({ fightingSpirit: true }), 75);
    eq(fightingSpiritThreshold({ captain: true }), 70); eq(fightingSpiritThreshold({ captain: true, fightingSpirit: true }), 85);
  });
  test('Low Screamer: power strictly < 50%; 0.4→0.6', () => {
    close(lowScreamerPower(0.4), 0.6);
    ok(resolve(['low_screamer'], { action: 'stunning_shot', shotPower: 0.49 }).motion[0].ok);
    ok(!resolve(['low_screamer'], { action: 'stunning_shot', shotPower: 0.5 }).motion[0].ok);
  });
  test('Edged Crossing: distance 12–32 inclusive; ball < 30 km/h', () => {
    const b = { action: 'cross', ballSpeedBeforeKick: 20 };
    ok(resolve(['edged_crossing'], { ...b, distance: 12 }).motion[0].ok);
    ok(resolve(['edged_crossing'], { ...b, distance: 32 }).motion[0].ok);
    ok(!resolve(['edged_crossing'], { ...b, distance: 32.5 }).motion[0].ok);
    ok(!resolve(['edged_crossing'], { ...b, distance: 20, ballSpeedBeforeKick: 30 }).motion[0].ok);
  });
  test('Motion skills do not write stats', () => {
    const r = resolve(['acceleration_burst', 'long_reach_tackle', 'bullet_header', 'edged_crossing'], { action: 'tackle', possession: 'self', inputAngle: 60 });
    eq(Object.keys(r.tempAdds).length, 0);
  });

  // ---- Full pipeline with condition + manager + skill ----
  test('Full order: a skill does not cross the manager threshold (ref 83 + Fortress)', () => {
    const card = flatCard(83, { skills: ['Fortress'] });
    const res = computePlayer({ card, prog, mech, skillsDB: db, scenario: defaultScenario({ half: 2, scoreState: 'ahead', managerLevel: '89' }) });
    eq(res.rows.tackling.mgrD, 2);
    eq(res.rows.tackling.ordinary, 91);
  });

  // ---- Progression & optimizer (config consistency; table itself is UNVERIFIED) ----
  test('Progression: cumulative cost matches the configured table', () => {
    eq(categoryCost(prog, 4), 4);
    eq(categoryCost(prog, 5), 4 + prog.costByLevel[1].cost);
  });
  test('Optimizer: respects the budget and beats the empty build', () => {
    const card = D.sampleCards.cards[0];
    const weights = weightsFor(roles, card.position, 'auto');
    const score = makeObjective({ card, prog, mech, weights, states: [{ prob: 1, temp: {} }] });
    const res = optimize({ prog, budget: card.progressionPoints, score });
    ok(res.spent <= card.progressionPoints, 'spent > budget');
    ok(res.score >= score({}) - 1e-9, 'worse than empty');
    eq(totalCost(prog, res.allocation), res.spent);
  });
  test('Optimizer: never invests in stats already at 99 (zero marginal value)', () => {
    const card = flatCard(70, { position: 'CB', progressionPoints: 10 });
    for (const a of ['defensiveAwareness', 'tackling', 'aggression', 'defensiveEngagement']) card.stats[a] = 99;
    const weights = { defensiveAwareness: 1, tackling: 1, speed: 0.2 };
    const score = makeObjective({ card, prog, mech, weights, states: [{ prob: 1, temp: {} }] });
    const res = optimize({ prog, budget: 10, score });
    eq(res.allocation.defending, 0);
  });
  test('Optimizer: skill states normalised and Fortress/GCP exclusive', () => {
    const card = flatCard(80, { skills: ['Fortress', 'Game-changing Pass'] });
    const st = skillStates(card, db, roles, { fortress: 0.3, game_changing_pass: 0.4 });
    close(st.reduce((s, x) => s + x.prob, 0), 1);
    ok(!st.some((s) => s.ids.includes('fortress') && s.ids.includes('game_changing_pass')));
  });

  // ---- Import ----
  test('CSV import with eFHUB-style headers and |-separated skills', () => {
    const head = 'id,name,position,overall,progressionPoints,skills,' + ATTRS.join(',');
    const row = 'x1,Prueba,CB,80,10,Fortress|Heading,' + ATTRS.map(() => 70).join(',');
    const { cards, errors } = importText(head + '\n' + row + '\n', 'a.csv');
    eq(errors.length, 0, errors.join('; '));
    eq(cards[0].skills.length, 2); eq(cards[0].stats.tackling, 70);
  });
  test('JSON import rejects out-of-range and missing stats', () => {
    const { errors } = importText(JSON.stringify([{ id: 'a', name: 'A', position: 'CB', stats: { speed: 150 } }]), 'a.json');
    ok(errors.length > 20);
  });
  test('CSV import of scraper output keeps physics, model and max values', () => {
    const head = 'id,name,position,overall,maxOverall,progressionPoints,skills,phys_jumpingHeight,model_armLength,max_speed,sourceUrl,' + ATTRS.join(',');
    const row = 'efhub-1,Test,CF,85,95,42,Fortress,247.8,12,90,https://efhub.com/players/1,' + ATTRS.map(() => 70).join(',');
    const { cards, errors } = importText(head + '\n' + row + '\n', 'x.csv');
    eq(errors.length, 0, errors.join('; '));
    eq(cards[0].physics.jumpingHeight, 247.8); eq(cards[0].model.armLength, 12); eq(cards[0].maxStats.speed, 90);
    eq(cards[0].maxOverall, 95); eq(cards[0].source.method, 'scraper');
  });

  test('CSV import separates card boosters (booster_* columns and names)', () => {
    const head = 'id,name,position,overall,progressionPoints,boosters,boostersSeparated,booster_dribbling,booster_balance,' + ATTRS.join(',');
    const row = 'efhub-2,Best,RWF,89,66,Breakthrough +4|Balance +6,1,4,6,' + ATTRS.map(() => 70).join(',');
    const c = importText(head + '\n' + row + '\n', 'x.csv').cards[0];
    eq(c.boosters.dribbling, 4); eq(c.boosters.balance, 6); eq(c.boosterNames.length, 2); eq(c.boostersSeparated, true);
    // Booster is added after the 99 cap (documented post-cap channel; booster mapping itself is a hypothesis).
    const r = statBreakdown(c, prog, {}, mech, db, { boosters: c.boosters }).dribbling;
    eq(r.extended, 74);
  });

  test('Breakdown: action bonuses (layer F) — PF +7 / PP +6 not capped, max not sum with Heading', () => {
    const card = flatCard(99, { skills: ['Phenomenal Finishing', 'Phenomenal Pass', 'Heading'], position: 'CF' });
    const rows = statBreakdown(card, prog, {}, mech, db, { active: ['phenomenal_finishing', 'phenomenal_pass', 'ordinary_heading'] });
    eq(rows.finishing.extended, 99); eq(rows.finishing.local, 106);
    eq(rows.lowPass.local, 105); eq(rows.heading.local, 104); eq(rows.speed.actionBonus, 0);
  });
  test('Slot-2 booster adds +1 to its four stats on top of the card booster', () => {
    const all = combineBoosters({ finishing: 2 }, "Striker's Instinct", D.boosters);
    eq(all.finishing, 3); eq(all.offensiveAwareness, 1); eq(all.acceleration, 1); eq(all.ballControl, 1);
    eq(Object.keys(combineBoosters({}, null, D.boosters)).length, 0);
  });

  test('No cap breach: Fortress card never trains Defending past 93 (99 − 6)', () => {
    const card = flatCard(86, { skills: ['Fortress'], progressionPoints: 60 });
    const w = { defensiveAwareness: 1, tackling: 1, aggression: 1, defensiveEngagement: 1, speed: 0.1 };
    const base = makeObjective({ card, prog, mech, weights: w, states: [{ prob: 1, temp: {} }] });
    const safe = withNoBreach(base, card, prog, mech, db, {});
    const res = optimize({ prog, budget: 60, score: safe });
    eq(res.allocation.defending, 7); // 86 + 7 = 93; Lv 8 would make 94 + 6 = 100 > 99
    eq(capBreaches(card, prog, res.allocation, mech, db, {}).length, 0);
    ok(capBreaches(card, prog, { defending: 8 }, mech, db, {}).length > 0);
  });
  test('No cap breach accounts for coach (DT) and condition', () => {
    const card = flatCard(86, { skills: ['Fortress'], positionRating: 95 });
    // Condition A (+3 awareness at 95) + coach 89 (+3 at 84–99) + Fortress 6: 86 + 1 → 87+3+3+6 = 99 OK, +2 → 100 breach.
    eq(capBreaches(card, prog, { defending: 1 }, mech, db, { condition: 'A', managerLevel: '89' }).length, 0);
    ok(capBreaches(card, prog, { defending: 2 }, mech, db, { condition: 'A', managerLevel: '89' }).length > 0);
  });

  test('Speed curve: 96–99 adds nothing, past 99 counts again (user meta guidance)', () => {
    const c = curvesFrom(D.breakpoints).speed;
    close(curveValue(90, c), 90); close(curveValue(96, c), 96); close(curveValue(99, c), 96); close(curveValue(101, c), 98);
  });

  // ---- Progression verified on eFHUB (card 110718, 18 Oct 2026) ----
  test('eFHUB check: Shooting 8 + Dribbling 4 + Dexterity 10 + Lower Body 4 + Aerial 4 = 42 points', () => {
    eq(totalCost(prog, { shooting: 8, dribbling: 4, dexterity: 10, lowerBody: 4, aerial: 4 }), 42);
    eq(categoryCost(prog, 16), 40);
  });

  // ---- Build Planner ----
  test('Planner: Fortress card warns when Defending pushes stats above 93', () => {
    const card = flatCard(88, { skills: ['Fortress'], progressionPoints: 40 });
    const ok6 = analyzeCategories(card, prog, { defending: 5 }, db).find((r) => r.id === 'defending');
    eq(ok6.status, 'clipped'); // 88+5 = 93 → next level clips the +6 while active
    const fine = analyzeCategories(card, prog, { defending: 4 }, db).find((r) => r.id === 'defending');
    eq(fine.status, 'ok'); eq(fine.skillStop, 5);
  });
  test('Planner: cannot add levels to a category where every stat is 99', () => {
    const card = flatCard(99, { progressionPoints: 40 });
    const r = analyzeCategories(card, prog, {}, db).find((x) => x.id === 'passing');
    eq(r.status, 'capped'); eq(r.canAdd, false);
  });
  test('Breakdown: base 83 + manager 89 + Fortress → 85 then 91 (article order, manager from reference)', () => {
    const card = flatCard(83, { skills: ['Fortress'] });
    const off = statBreakdown(card, prog, {}, mech, db, { managerLevel: '89' }).tackling;
    eq(off.mgr, 2); eq(off.extended, 85);
    const on = statBreakdown(card, prog, {}, mech, db, { managerLevel: '89', active: ['fortress'] }).tackling;
    eq(on.skill, 6); eq(on.extended, 91); eq(on.capLoss, 0);
  });
  test('Breakdown: Momentum + Surge both toggled still give +6, not +9', () => {
    const card = flatCard(80, { skills: ['Momentum Dribbling', 'Attacking Surge'], position: 'CF' });
    eq(statBreakdown(card, prog, {}, mech, db, { active: ['momentum_dribbling', 'attacking_surge'] }).speed.skill, 6);
  });
  test('Breakdown: Magnetic Feet scales with opponents; cap loss reported', () => {
    const card = flatCard(95, { skills: ['Magnetic Feet'], position: 'CF' });
    const r = statBreakdown(card, prog, {}, mech, db, { active: ['magnetic_feet'], opponents: 4 }).dribbling;
    eq(r.skill, 8); eq(r.ordinary, 99); eq(r.capLoss, 4);
  });
  test('Planner: counts points spent on levels that raised nothing', () => {
    const card = flatCard(97, { progressionPoints: 40 });
    const s = summarize(card, prog, { passing: 4 }, db); // 97→99 after 2 levels; levels 3–4 wasted (1+1)
    eq(s.wastedPoints, 2); eq(s.wastedStats, 4);
  });
  test('Passing/Shooting 90 threshold: reaching 90 adds the reach bonus in the optimizer', () => {
    const c = curvesFrom(D.breakpoints).lowPass;
    close(curveValue(89, c), 89); close(curveValue(90, c), 93); close(curveValue(95, c), 98);
  });
  test('Goals: forward reaches Offensive Awareness 90 when it costs ≤12 dexterity points', () => {
    const card = flatCard(82, { position: 'CF', progressionPoints: 30 });
    const score = makeObjective({ card, prog, mech, weights: weightsFor(roles, 'CF', 'auto'), states: [{ prob: 1, temp: {}, ids: [] }], targets: targetsFor(roles, 'CF') });
    const r = optimize({ prog, budget: 30, score, lookahead: 8 });
    ok(82 + (r.allocation.dexterity ?? 0) >= 90, `dexterity ${r.allocation.dexterity}`);
    const g = score({ dexterity: 8 }, true).goals.map((x) => x.stat);
    ok(g.includes('offensiveAwareness'), 'OA 90 goal met at 8 levels (12 points)');
    ok(!score({ dexterity: 9 }, true).goals.some((x) => x.stat === 'offensiveAwareness'), 'over 12 points the goal no longer counts');
  });
  test('Goals: defenders get acceleration 80 / speed 85 within 8 points', () => {
    const card = flatCard(76, { position: 'CB', progressionPoints: 20 });
    const score = makeObjective({ card, prog, mech, weights: weightsFor(roles, 'CB', 'auto'), states: [{ prob: 1, temp: {}, ids: [] }], targets: targetsFor(roles, 'CB') });
    const g = score({ dexterity: 4, lowerBody: 6 }, true).goals.map((x) => `${x.stat}${x.at}`);
    ok(g.includes('acceleration80') && g.includes('speed80'), g.join(','));
  });
  test('Datamine: action-local ceiling 127; Through Passing = ordinary passing +5', () => {
    eq(pipelineValue({ base: 99, postCap: 20, local: 7 }, mech.caps).local, 126);
    eq(pipelineValue({ base: 99, postCap: 21, local: 9 }, mech.caps).local, 127);
    const tp = db.auxiliarySkills.find((a) => a.id === 'ordinary_passing');
    ok(tp.aliases.includes('Through Passing'), 'alias');
    const card = flatCard(85, { skills: ['Through Passing'], position: 'CMF' });
    const r = statBreakdown(card, prog, {}, mech, db, { active: ['ordinary_passing'] }).lowPass;
    eq(r.actionBonus, 5); eq(r.local, 90); eq(r.extended, 85);
  });
  test('Auto build: forward OA 90 within 12 pts, speed 90–96 with 8–12 pts; rest left free', () => {
    const card = flatCard(82, { position: 'CF', progressionPoints: 60 });
    const r = autoBuild(card, prog, mech, db, roles);
    eq(r.allocation.dexterity, 8); // 82 + 8 = 90 for 12 points
    eq(r.allocation.lowerBody, 8); // 82 + 8 = 90, 12 points
    eq(r.spent, 24); eq(Object.entries(r.allocation).filter(([k, v]) => v && !['dexterity', 'lowerBody'].includes(k)).length, 0);
    const fast = autoBuild(flatCard(90, { position: 'CF', progressionPoints: 60 }), prog, mech, db, roles);
    eq(fast.allocation.lowerBody, 6); // speed 96, not past the 96 ceiling; 8 points for stamina/kicking power
    eq(fast.allocation.dexterity, 0); // OA already 90
  });
  test('Auto build: defender reaches acceleration 80 / speed 85 within 8 points; no rules for CMF', () => {
    const r = autoBuild(flatCard(78, { position: 'CB', progressionPoints: 40 }), prog, mech, db, roles);
    eq(r.allocation.dexterity, 2); // 78 → 80 (85 would cost 9 pts)
    eq(r.allocation.lowerBody, 2); // 78 → 80 (85 needs 7 levels = 10 pts, over 8)
    eq(autoBuild(flatCard(80, { position: 'CMF', progressionPoints: 40 }), prog, mech, db, roles), null);
  });
}
