import { CRAB, MODES, OBSTACLE_SPECS, RANKS, SCORING, SKY_KEYFRAMES } from './config.js';

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
 * Compute interpolated sky/environment palette from continuous cycle progress (0..4, wraps).
 */
export function sampleSkyPalette(cyclePhase) {
  const n = SKY_KEYFRAMES.length;
  const wrapped = ((cyclePhase % n) + n) % n;
  const idx = Math.floor(wrapped);
  const next = (idx + 1) % n;
  const t = wrapped - idx;
  // Smoothstep for gentle transitions
  const s = t * t * (3 - 2 * t);
  const a = SKY_KEYFRAMES[idx];
  const b = SKY_KEYFRAMES[next];
  return {
    name: s < 0.5 ? a.name : b.name,
    phase: wrapped,
    skyTop: lerpColor(a.skyTop, b.skyTop, s),
    skyBot: lerpColor(a.skyBot, b.skyBot, s),
    sunColor: lerpColor(a.sunColor, b.sunColor, s),
    farCity: lerpColor(a.farCity, b.farCity, s),
    midCity: lerpColor(a.midCity, b.midCity, s),
    cloudColor: lerpColor(a.cloudColor, b.cloudColor, s),
    windowAlpha: lerp(a.windowAlpha, b.windowAlpha, s),
    starAlpha: lerp(a.starAlpha, b.starAlpha, s),
    lampGlow: lerp(a.lampGlow, b.lampGlow, s),
    headlightAlpha: lerp(a.headlightAlpha, b.headlightAlpha, s),
  };
}

/**
 * Smoothly scaling speed curve over elapsed time + Rush Wave boost.
 */
export function computeWorldSpeed(elapsed, modeId, isRush, isFever) {
  const mode = MODES[modeId] || MODES.normal;
  // Asymptotic curve: ramps noticeably in the first 75 seconds, never unfair
  const ramp = 1 - Math.exp(-elapsed / 68);
  let speed = mode.startSpeed + (mode.maxSpeed - mode.startSpeed) * ramp;
  if (isRush) speed *= 1.16;
  if (isFever) speed *= 1.2;
  return speed;
}

/**
 * Combo multiplier: 1x up to 5x.
 */
export function computeComboMultiplier(combo) {
  if (combo < 3) return 1;
  if (combo < 7) return 2;
  if (combo < 13) return 3;
  if (combo < 20) return 4;
  return SCORING.maxComboMult;
}

/**
 * Evaluate player rank from final score.
 */
export function evaluateRank(score) {
  for (const r of RANKS) {
    if (score >= r.minScore) return r;
  }
  return RANKS[RANKS.length - 1];
}

/**
 * Return player hitbox in world-relative ground coordinates:
 * y = altitude above ground (0 = standing on road, positive = upward).
 */
export function getCrabHitbox(playerX, playerAltitude) {
  return {
    left: playerX - CRAB.hitW * 0.5,
    right: playerX + CRAB.hitW * 0.5,
    bottom: playerAltitude,
    top: playerAltitude + CRAB.hitH,
  };
}

/**
 * Return obstacle hitbox in the same ground-altitude coordinate space.
 */
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

/**
 * Euclidean clearance distance between two non-overlapping AABBs (0 if overlapping).
 */
export function rectDistance(a, b) {
  const dx = Math.max(0, b.left - a.right, a.left - b.right);
  const dy = Math.max(0, b.bottom - a.top, a.bottom - b.top);
  return Math.hypot(dx, dy);
}

/**
 * Pick a random element using provided rng function (for deterministic tests).
 */
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
    cleared: false,
    jumpedOver: false,
    minClearance: Infinity,
    smashed: false,
    vx: 0,
    vy: 0,
    rot: 0,
    vrot: 0,
  };
}

function makeCollectible(type, x, airY, arcIndex = 0) {
  return {
    id: nextEntityId++,
    type, // 'star' | 'shield' | 'heart'
    x,
    airY,
    radius: type === 'star' ? 16 : 20,
    bobPhase: x * 0.02,
    arcIndex,
    collected: false,
  };
}

/**
 * Generate a fair, engaging pattern of obstacles and collectibles starting at spawnX.
 * Returns { obstacles, collectibles, nextGap } where nextGap is horizontal spacing before next pattern.
 */
export function generatePattern({
  spawnX,
  elapsed,
  speed,
  isRush,
  lives,
  maxLives,
  hasShield,
  rng = Math.random,
}) {
  const obstacles = [];
  const collectibles = [];

  // Difficulty tier 0..3
  const tier = elapsed < 10 ? 0 : elapsed < 26 ? 1 : elapsed < 52 ? 2 : 3;

  // Pool of curated, playtested patterns guaranteed to be jumpable
  const patterns = ['singleCar', 'coneStar'];
  if (tier >= 0) patterns.push('conePair', 'carWithArc');
  if (tier >= 1) patterns.push('truckVault', 'seagullSwoop', 'sportZip');
  if (tier >= 2) patterns.push('coneThenCar', 'carThenBird', 'truckHighStars');
  if (tier >= 3 || isRush) patterns.push('rushStagger', 'sportThenTruck', 'birdPair');

  const chosen = pick(patterns, rng);

  // Scale gap with speed so reaction & landing windows always remain fair
  const speedRatio = clamp(speed / 340, 0.9, 2.0);
  let patternWidth = 120;

  switch (chosen) {
    case 'coneStar': {
      obstacles.push(makeObstacle('cone', spawnX, rng));
      collectibles.push(makeCollectible('star', spawnX + 18, 92, 0));
      collectibles.push(makeCollectible('star', spawnX + 58, 106, 1));
      collectibles.push(makeCollectible('star', spawnX + 98, 86, 2));
      patternWidth = 110;
      break;
    }
    case 'conePair': {
      const gap = Math.round(170 * speedRatio);
      obstacles.push(makeObstacle('cone', spawnX, rng));
      obstacles.push(makeObstacle('cone', spawnX + gap, rng));
      collectibles.push(makeCollectible('star', spawnX + 18, 92, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 18, 92, 1));
      patternWidth = gap + 50;
      break;
    }
    case 'singleCar': {
      obstacles.push(makeObstacle('car', spawnX, rng));
      collectibles.push(makeCollectible('star', spawnX + 54, 108, 0));
      patternWidth = 120;
      break;
    }
    case 'carWithArc': {
      obstacles.push(makeObstacle('car', spawnX, rng));
      // 3-star rainbow arc over the sedan
      collectibles.push(makeCollectible('star', spawnX - 10, 96, 0));
      collectibles.push(makeCollectible('star', spawnX + 54, 128, 1));
      collectibles.push(makeCollectible('star', spawnX + 118, 96, 2));
      patternWidth = 135;
      break;
    }
    case 'sportZip': {
      obstacles.push(makeObstacle('sport', spawnX, rng));
      collectibles.push(makeCollectible('star', spawnX + 35, 114, 0));
      collectibles.push(makeCollectible('star', spawnX + 85, 114, 1));
      patternWidth = 140;
      break;
    }
    case 'truckVault': {
      obstacles.push(makeObstacle('truck', spawnX, rng));
      // Guides player to double-jump nicely over the truck roof!
      collectibles.push(makeCollectible('star', spawnX + 20, 146, 0));
      collectibles.push(makeCollectible('star', spawnX + 84, 184, 1));
      collectibles.push(makeCollectible('star', spawnX + 148, 152, 2));
      patternWidth = 185;
      break;
    }
    case 'truckHighStars': {
      obstacles.push(makeObstacle('truck', spawnX, rng));
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const arcY = 145 + Math.sin(t * Math.PI) * 52;
        collectibles.push(makeCollectible('star', spawnX + 10 + i * 50, arcY, i));
      }
      patternWidth = 195;
      break;
    }
    case 'seagullSwoop': {
      // Low bird: player can stay grounded to duck under, OR double-jump for high stars!
      obstacles.push(makeObstacle('bird', spawnX, rng, 70));
      collectibles.push(makeCollectible('star', spawnX + 24, 150, 0));
      collectibles.push(makeCollectible('star', spawnX + 64, 160, 1));
      patternWidth = 110;
      break;
    }
    case 'coneThenCar': {
      const gap = Math.round(230 * speedRatio);
      obstacles.push(makeObstacle('cone', spawnX, rng));
      obstacles.push(makeObstacle('car', spawnX + gap, rng));
      collectibles.push(makeCollectible('star', spawnX + 18, 94, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 54, 122, 1));
      patternWidth = gap + 125;
      break;
    }
    case 'carThenBird': {
      const gap = Math.round(260 * speedRatio);
      obstacles.push(makeObstacle('car', spawnX, rng));
      obstacles.push(makeObstacle('bird', spawnX + gap, rng, 74));
      collectibles.push(makeCollectible('star', spawnX + 54, 118, 0));
      // Ground star encourages landing quickly (fast-fall!) to slip under the seagull
      collectibles.push(makeCollectible('star', spawnX + gap + 22, 28, 1));
      patternWidth = gap + 80;
      break;
    }
    case 'rushStagger': {
      const gap = Math.round(255 * speedRatio);
      obstacles.push(makeObstacle('car', spawnX, rng));
      obstacles.push(makeObstacle('sport', spawnX + gap, rng));
      collectibles.push(makeCollectible('star', spawnX + 54, 118, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 58, 114, 1));
      patternWidth = gap + 135;
      break;
    }
    case 'sportThenTruck': {
      const gap = Math.round(295 * speedRatio);
      obstacles.push(makeObstacle('sport', spawnX, rng));
      obstacles.push(makeObstacle('truck', spawnX + gap, rng));
      collectibles.push(makeCollectible('star', spawnX + 58, 116, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 84, 186, 1));
      patternWidth = gap + 190;
      break;
    }
    case 'birdPair': {
      const gap = Math.round(210 * speedRatio);
      obstacles.push(makeObstacle('bird', spawnX, rng, 70));
      obstacles.push(makeObstacle('bird', spawnX + gap, rng, 132));
      collectibles.push(makeCollectible('star', spawnX + 22, 26, 0));
      collectibles.push(makeCollectible('star', spawnX + gap + 22, 68, 1));
      patternWidth = gap + 70;
      break;
    }
  }

  // Occasional helpful power-ups placed in safe spots between patterns
  const powerupX = spawnX + patternWidth + Math.round(105 * speedRatio);
  if (lives < maxLives && maxLives > 1 && elapsed > 18 && rng() < 0.085) {
    collectibles.push(makeCollectible('heart', powerupX, 115, 0));
  } else if (!hasShield && elapsed > 12 && rng() < 0.1) {
    collectibles.push(makeCollectible('shield', powerupX, 128, 0));
  }

  // Breathing room before the next pattern (tighter during Rush, still always fair)
  const baseRest = isRush ? 235 : 295;
  const jitter = rng() * (isRush ? 110 : 165);
  const nextGap = patternWidth + (baseRest + jitter) * speedRatio;

  return { obstacles, collectibles, nextGap };
}
