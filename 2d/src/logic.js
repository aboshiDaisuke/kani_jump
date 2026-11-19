import { CRAB, MODES, OBSTACLE_SPECS, RANKS, SCORING, STAGES } from './config.js';

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpColor(c1, c2, t) {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

export function rgb(c, alpha = 1) {
  if (alpha >= 1) return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

/**
 * Smoothly blend between two stage palettes (stageProgress: 0..3+, clamps cleanly at Stage 4).
 */
export function sampleStagePalette(stageBlend) {
  const maxIdx = STAGES.length - 1;
  const clamped = clamp(stageBlend, 0, maxIdx);
  const idx = Math.floor(clamped);
  const next = Math.min(maxIdx, idx + 1);
  const t = clamped - idx;
  const s = t * t * (3 - 2 * t);
  const a = STAGES[idx];
  const b = STAGES[next];
  return {
    stageIndex: Math.round(clamped),
    code: s < 0.5 ? a.code : b.code,
    name: s < 0.5 ? a.name : b.name,
    ambient: s < 0.5 ? a.ambient : b.ambient,
    phase: clamped,
    skyTop: lerpColor(a.skyTop, b.skyTop, s),
    skyMid: lerpColor(a.skyMid, b.skyMid, s),
    skyBot: lerpColor(a.skyBot, b.skyBot, s),
    oceanTop: lerpColor(a.oceanTop, b.oceanTop, s),
    oceanBot: lerpColor(a.oceanBot, b.oceanBot, s),
    mountain: lerpColor(a.mountain, b.mountain, s),
    farCity: lerpColor(a.farCity, b.farCity, s),
    midCity: lerpColor(a.midCity, b.midCity, s),
    sunColor: lerpColor(a.sunColor, b.sunColor, s),
    cloudTop: lerpColor(a.cloudTop, b.cloudTop, s),
    cloudShade: lerpColor(a.cloudShade, b.cloudShade, s),
    roadTop: lerpColor(a.roadTop, b.roadTop, s),
    roadBot: lerpColor(a.roadBot, b.roadBot, s),
    windowAlpha: lerp(a.windowAlpha, b.windowAlpha, s),
    starAlpha: lerp(a.starAlpha, b.starAlpha, s),
    lampGlow: lerp(a.lampGlow, b.lampGlow, s),
    headlightAlpha: lerp(a.headlightAlpha, b.headlightAlpha, s),
    auroraAlpha: lerp(a.auroraAlpha, b.auroraAlpha, s),
  };
}

export function computeWorldSpeed(elapsed, modeId, stageIndex, isRush, isFever) {
  const mode = MODES[modeId] || MODES.normal;
  const stageBonus = stageIndex * 28;
  const ramp = 1 - Math.exp(-elapsed / 64);
  let speed = Math.min(mode.maxSpeed, mode.startSpeed + stageBonus + (mode.maxSpeed - mode.startSpeed) * ramp);
  if (isRush) speed *= 1.15;
  if (isFever) speed *= 1.22;
  return speed;
}

export function computeComboMultiplier(combo) {
  if (combo < 3) return 1;
  if (combo < 7) return 2;
  if (combo < 13) return 3;
  if (combo < 20) return 4;
  return SCORING.maxComboMult;
}

export function evaluateRank(score) {
  for (const r of RANKS) {
    if (score >= r.minScore) return r;
  }
  return RANKS[RANKS.length - 1];
}

export function getCrabHitbox(playerX, playerAltitude) {
  return {
    left: playerX - CRAB.hitW * 0.5,
    right: playerX + CRAB.hitW * 0.5,
    bottom: playerAltitude,
    top: playerAltitude + CRAB.hitH,
  };
}

export function getObstacleHitbox(ob) {
  const spec = OBSTACLE_SPECS[ob.kind];
  return {
    left: ob.x + spec.hitPadX,
    right: ob.x + ob.w - spec.hitPadX,
    bottom: ob.airY,
    top: ob.airY + ob.h - spec.hitPadTop,
  };
}

export function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}

export function rectDistance(a, b) {
  const dx = Math.max(0, b.left - a.right, a.left - b.right);
  const dy = Math.max(0, b.bottom - a.top, a.bottom - b.top);
  return Math.hypot(dx, dy);
}

/**
 * Determine if an overlapping player is cleanly stomping the roof of an obstacle (or hitting a spring).
 */
export function isStompBounce(prevAltitude, vy, obBox, ob) {
  const spec = OBSTACLE_SPECS[ob.kind];
  if (!spec || !spec.stompable) return false;
  if (spec.isSpring) return true;
  // Falling or diving onto the top 24px of the obstacle roof
  return vy <= 60 && prevAltitude >= obBox.top - 24;
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

let nextEntityId = 1;

function makeObstacle(kind, x, rng, airYOverride = null) {
  const spec = OBSTACLE_SPECS[kind];
  const color = spec.colors ? pick(spec.colors, rng) : '#ffffff';
  return {
    id: nextEntityId++,
    kind,
    x,
    w: spec.w,
    h: spec.h,
    airY: airYOverride !== null ? airYOverride : spec.airY,
    speedMult: spec.speedMult,
    color,
    wheelPhase: rng() * Math.PI * 2,
    wingPhase: rng() * Math.PI * 2,
    squash: 0, // roof bounce compression animation!
    cleared: false,
    jumpedOver: false,
    bounced: false,
    minClearance: Infinity,
    smashed: false,
    telegraphDone: false,
    vx: 0,
    vy: 0,
    rot: 0,
    vrot: 0,
  };
}

function makeCollectible(type, x, airY, arcIndex = 0) {
  return {
    id: nextEntityId++,
    type,
    x,
    airY,
    radius: type === 'star' ? 16 : 20,
    bobPhase: x * 0.02,
    arcIndex,
    collected: false,
  };
}

/**
 * Curated, rhythm-tested commercial pattern generator with springboard sky routes & stomp chains.
 */
export function generatePattern({
  spawnX,
  elapsed,
  speed,
  stageIndex = 0,
  isRush = false,
  lives = 3,
  maxLives = 3,
  hasShield = false,
  shieldUpgradeLv = 0,
  rng = Math.random,
}) {
  const obstacles = [];
  const collectibles = [];

  const tier = Math.min(3, stageIndex + (elapsed > 22 ? 1 : 0));
  const speedRatio = clamp(speed / 340, 0.92, 2.05);

  const patterns = ['singleCar', 'taxiArc', 'conePair', 'springSkyRoute'];
  if (tier >= 0) patterns.push('stompChain', 'seagullSwoop');
  if (tier >= 1) patterns.push('truckVault', 'sportZip', 'coneThenCar', 'carThenBird');
  if (tier >= 2) patterns.push('busVault', 'stompTriple', 'sportThenTruck', 'springOverBus');
  if (tier >= 3 || isRush) patterns.push('rushStagger', 'birdPair', 'sportDouble');

  const chosen = pick(patterns, rng);
  let patternWidth = 130;

  switch (chosen) {
    case 'singleCar': {
      obstacles.push(makeObstacle('car', spawnX, rng));
      collectibles.push(makeCollectible('star', spawnX + 20, 102, 0));
      collectibles.push(makeCollectible('star', spawnX + 56, 126, 1));
      collectibles.push(makeCollectible('star', spawnX + 92, 102, 2));
      patternWidth = 130;
      break;
    }
    case 'taxiArc': {
      obstacles.push(makeObstacle('taxi', spawnX, rng));
      collectibles.push(makeCollectible('star', spawnX - 8, 96, 0));
      collectibles.push(makeCollectible('star', spawnX + 56, 134, 1));
      collectibles.push(makeCollectible('star', spawnX + 120, 96, 2));
      patternWidth = 140;
      break;
    }
    case 'conePair': {
      const gap = Math.round(175 * speedRatio);
      obstacles.push(makeObstacle('cone', spawnX, rng));
      obstacles.push(makeObstacle('cone', spawnX + gap, rng));
      collectibles.push(makeCollectible('star', spawnX + 18, 92, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 18, 92, 1));
      patternWidth = gap + 54;
      break;
    }
    case 'springSkyRoute': {
      // Beach-ball trampoline launches crab into a golden star sky trail!
      obstacles.push(makeObstacle('spring', spawnX, rng));
      // Safe car underneath the high sky arc so bouncing feels thrilling!
      obstacles.push(makeObstacle('car', spawnX + Math.round(180 * speedRatio), rng));
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const sx = spawnX + 60 + i * Math.round(52 * speedRatio);
        const sy = 155 + Math.sin(t * Math.PI) * 105;
        collectibles.push(makeCollectible('star', sx, sy, i));
      }
      patternWidth = Math.round(370 * speedRatio);
      break;
    }
    case 'springOverBus': {
      obstacles.push(makeObstacle('spring', spawnX, rng));
      obstacles.push(makeObstacle('bus', spawnX + Math.round(145 * speedRatio), rng));
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const sx = spawnX + 65 + i * Math.round(62 * speedRatio);
        const sy = 175 + Math.sin(t * Math.PI) * 95;
        collectibles.push(makeCollectible('star', sx, sy, i));
      }
      patternWidth = Math.round(390 * speedRatio);
      break;
    }
    case 'stompChain': {
      // Two sedans spaced perfectly for roof-to-roof stomp bouncing!
      const gap = Math.round(240 * speedRatio);
      obstacles.push(makeObstacle('car', spawnX, rng));
      obstacles.push(makeObstacle('taxi', spawnX + gap, rng));
      collectibles.push(makeCollectible('star', spawnX + 56, 118, 0));
      collectibles.push(makeCollectible('star', spawnX + Math.round(gap * 0.5) + 42, 152, 1));
      collectibles.push(makeCollectible('star', spawnX + gap + 56, 118, 2));
      patternWidth = gap + 135;
      break;
    }
    case 'stompTriple': {
      const gap = Math.round(225 * speedRatio);
      obstacles.push(makeObstacle('car', spawnX, rng));
      obstacles.push(makeObstacle('taxi', spawnX + gap, rng));
      obstacles.push(makeObstacle('car', spawnX + gap * 2, rng));
      collectibles.push(makeCollectible('star', spawnX + 56, 120, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 56, 136, 1));
      collectibles.push(makeCollectible('star', spawnX + gap * 2 + 56, 120, 2));
      patternWidth = gap * 2 + 130;
      break;
    }
    case 'seagullSwoop': {
      obstacles.push(makeObstacle('bird', spawnX, rng, 70));
      collectibles.push(makeCollectible('star', spawnX + 25, 154, 0));
      collectibles.push(makeCollectible('star', spawnX + 68, 162, 1));
      patternWidth = 115;
      break;
    }
    case 'truckVault': {
      obstacles.push(makeObstacle('truck', spawnX, rng));
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        collectibles.push(makeCollectible('star', spawnX + 12 + i * 50, 150 + Math.sin(t * Math.PI) * 52, i));
      }
      patternWidth = 195;
      break;
    }
    case 'busVault': {
      obstacles.push(makeObstacle('bus', spawnX, rng));
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        collectibles.push(makeCollectible('star', spawnX + 14 + i * 46, 156 + Math.sin(t * Math.PI) * 58, i));
      }
      patternWidth = 225;
      break;
    }
    case 'sportZip': {
      obstacles.push(makeObstacle('sport', spawnX, rng));
      collectibles.push(makeCollectible('star', spawnX + 40, 118, 0));
      collectibles.push(makeCollectible('star', spawnX + 92, 118, 1));
      patternWidth = 145;
      break;
    }
    case 'coneThenCar': {
      const gap = Math.round(235 * speedRatio);
      obstacles.push(makeObstacle('cone', spawnX, rng));
      obstacles.push(makeObstacle('car', spawnX + gap, rng));
      collectibles.push(makeCollectible('star', spawnX + 18, 96, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 56, 124, 1));
      patternWidth = gap + 130;
      break;
    }
    case 'carThenBird': {
      const gap = Math.round(265 * speedRatio);
      obstacles.push(makeObstacle('car', spawnX, rng));
      obstacles.push(makeObstacle('bird', spawnX + gap, rng, 72));
      collectibles.push(makeCollectible('star', spawnX + 56, 120, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 22, 28, 1));
      patternWidth = gap + 85;
      break;
    }
    case 'rushStagger': {
      const gap = Math.round(260 * speedRatio);
      obstacles.push(makeObstacle('taxi', spawnX, rng));
      obstacles.push(makeObstacle('sport', spawnX + gap, rng));
      collectibles.push(makeCollectible('star', spawnX + 56, 122, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 60, 116, 1));
      patternWidth = gap + 145;
      break;
    }
    case 'sportThenTruck': {
      const gap = Math.round(305 * speedRatio);
      obstacles.push(makeObstacle('sport', spawnX, rng));
      obstacles.push(makeObstacle('truck', spawnX + gap, rng));
      collectibles.push(makeCollectible('star', spawnX + 60, 118, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 86, 188, 1));
      patternWidth = gap + 195;
      break;
    }
    case 'birdPair': {
      const gap = Math.round(215 * speedRatio);
      obstacles.push(makeObstacle('bird', spawnX, rng, 70));
      obstacles.push(makeObstacle('bird', spawnX + gap, rng, 134));
      collectibles.push(makeCollectible('star', spawnX + 24, 26, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 24, 68, 1));
      patternWidth = gap + 75;
      break;
    }
    case 'sportDouble': {
      const gap = Math.round(285 * speedRatio);
      obstacles.push(makeObstacle('sport', spawnX, rng));
      obstacles.push(makeObstacle('sport', spawnX + gap, rng));
      collectibles.push(makeCollectible('star', spawnX + 60, 120, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 60, 120, 1));
      patternWidth = gap + 145;
      break;
    }
  }

  // Power-ups in safe resting windows
  const powerupX = spawnX + patternWidth + Math.round(105 * speedRatio);
  const shieldChance = shieldUpgradeLv >= 2 ? 0.16 : 0.1;
  if (lives < maxLives && maxLives > 1 && elapsed > 16 && rng() < 0.09) {
    collectibles.push(makeCollectible('heart', powerupX, 118, 0));
  } else if (!hasShield && elapsed > 10 && rng() < shieldChance) {
    collectibles.push(makeCollectible('shield', powerupX, 130, 0));
  }

  const baseRest = isRush ? 230 : 290;
  const jitter = rng() * (isRush ? 100 : 155);
  const nextGap = patternWidth + (baseRest + jitter) * speedRatio;

  return { obstacles, collectibles, nextGap };
}
