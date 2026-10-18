// Match scenario model. Coordinates in metres: x along the attacking direction
// (0 = halfway line, +52.56 = opponent goal line), y lateral (0 = centre).

export function defaultScenario(overrides = {}) {
  return {
    half: 1,                 // 1 = first half, 2 = second, 3 = extra time 1, 4 = extra time 2
    scoreState: 'level',     // ahead | level | behind
    isSubstitute: false,
    subEntry: 'second_half', // first_half | second_half | et_first | et_second
    inPlay: true,
    possession: 'self',      // self | teammate | opponent | none
    role: 'CB',
    player: { x: 0, y: 0 },
    ball: { x: 0, y: 0 },
    opponents: [],
    nearbyOpponentsOverride: null,
    action: 'none',
    lastContact: 'none',     // opponent_pass | teammate_pass | other | none
    moveAngleToOwnEnd: 45,
    passGet: false,
    ballHigher: false,
    ballOrigin: 'open_play', // open_play | set_piece
    storedPointInOwnBox: false,
    providerAttackTrigger: false,
    gkDirectingDefence: false,
    gkSpiritRoar: false,
    visionaryMarker: false,
    markerCleared: false,
    specialMotion: false,
    shotPower: 0.4,
    distance: 20,
    ballSpeedBeforeKick: 20,
    lateralTarget: 2,
    releaseAngle: 0,
    inputAngle: 45,
    headerDirectionDiff: 90,
    curlFromCard: true,
    isCaptain: false,
    staminaConsumed: 50,
    attacking: true,
    condition: 'C',
    managerLevel: 'none',    // none | 89
    ordinaryPassing: false,
    ordinaryShooting: false,
    ...overrides,
  };
}

export function inBox(p, pitch) {
  return p.x <= -pitch.boxFrontFromHalfway && Math.abs(p.y) <= pitch.boxHalfWidth;
}

export function countNearbyOpponents(player, opponents) {
  // Article: horizontal distance strictly between 0 and 5 (boundary excluded).
  return opponents.filter((o) => {
    const d = Math.hypot(o.x - player.x, o.y - player.y);
    return d > 0 && d < 5;
  }).length;
}

// Flattens a scenario into the fact map read by activation predicates.
export function deriveFacts(s, pitch) {
  const nearby = s.nearbyOpponentsOverride ?? countNearbyOpponents(s.player, s.opponents);
  return {
    ...s,
    x: s.player.x,
    y: s.player.y,
    inOwnBox: inBox(s.player, pitch),
    ballInOwnBox: inBox(s.ball, pitch),
    ballCloserToOwnGoal: s.ball.x < s.player.x,
    inOppHalf: s.player.x > 0,
    zone: s.player.x > 0 ? 'attack' : 'defence',
    nearbyOpponents: nearby,
  };
}

export const ACTIONS = {
  none: 'None / general state',
  receive: 'Receive (first touch)',
  pass_ground: 'Ground pass',
  pass_lofted: 'Lofted pass',
  shot_footed: 'Footed shot',
  stunning_shot: 'Stunning shot',
  controlled_shot: 'Controlled shot',
  shot_header: 'Header',
  cross: 'Cross',
  dribble: 'Dribble',
  tackle: 'Tackle',
  chase: 'Chase loose ball',
  off_ball: 'Off-ball run',
};
