import test from 'node:test';
import assert from 'node:assert/strict';
import { CRAB, MODES, OBSTACLE_SPECS, PHYSICS } from '../src/config.js';
import {
  computeComboMultiplier,
  computeWorldSpeed,
  evaluateRank,
  generatePattern,
  getCrabHitbox,
  getObstacleHitbox,
  rectDistance,
  rectsOverlap,
  sampleSkyPalette,
} from '../src/logic.js';

function seededRng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test('single jump clears sedan car and double jump clears delivery truck', () => {
  const singlePeak = (PHYSICS.jumpVy ** 2) / (2 * PHYSICS.gravity);
  const doublePeak = singlePeak + (PHYSICS.doubleJumpVy ** 2) / (2 * PHYSICS.gravity);
  const carHitHeight = OBSTACLE_SPECS.car.h - OBSTACLE_SPECS.car.hitPadTop;
  const truckHitHeight = OBSTACLE_SPECS.truck.h - OBSTACLE_SPECS.truck.hitPadTop;

  assert.ok(singlePeak > carHitHeight + 30, `singlePeak=${singlePeak} should easily clear car=${carHitHeight}`);
  assert.ok(doublePeak > truckHitHeight + 80, `doublePeak=${doublePeak} should easily clear truck=${truckHitHeight}`);
});

test('grounded crab safely passes under low seagull', () => {
  const crab = getCrabHitbox(150, 0);
  const bird = getObstacleHitbox({
    kind: 'bird',
    x: 130,
    w: OBSTACLE_SPECS.bird.w,
    h: OBSTACLE_SPECS.bird.h,
    airY: OBSTACLE_SPECS.bird.airY,
  });
  assert.equal(rectsOverlap(crab, bird), false);
  const gap = rectDistance(crab, bird);
  assert.ok(gap >= 15 && gap <= 35, `Expected thrilling near-miss clearance, got ${gap}`);
});

test('collision and near-miss distance calculations are accurate', () => {
  const crab = getCrabHitbox(150, 0);
  const carOverlap = getObstacleHitbox({
    kind: 'car',
    x: 120,
    w: OBSTACLE_SPECS.car.w,
    h: OBSTACLE_SPECS.car.h,
    airY: 0,
  });
  assert.equal(rectsOverlap(crab, carOverlap), true);
  assert.equal(rectDistance(crab, carOverlap), 0);

  const crabAbove = getCrabHitbox(150, 65);
  assert.equal(rectsOverlap(crabAbove, carOverlap), false);
  assert.equal(rectDistance(crabAbove, carOverlap), 15);
});

test('speed scales smoothly and respects rush/fever multipliers', () => {
  const s0 = computeWorldSpeed(0, 'normal', false, false);
  const s60 = computeWorldSpeed(60, 'normal', false, false);
  const sRush = computeWorldSpeed(60, 'normal', true, false);
  const sFever = computeWorldSpeed(60, 'normal', false, true);

  assert.equal(s0, MODES.normal.startSpeed);
  assert.ok(s60 > s0 && s60 < MODES.normal.maxSpeed);
  assert.ok(sRush > s60);
  assert.ok(sFever > s60);
});

test('pattern generator produces fair spaced patterns across all difficulty tiers', () => {
  const rng = seededRng(2026);
  for (const elapsed of [2, 15, 35, 70]) {
    for (let i = 0; i < 30; i++) {
      const pat = generatePattern({
        spawnX: 800,
        elapsed,
        speed: computeWorldSpeed(elapsed, 'normal', i % 4 === 0, false),
        isRush: i % 4 === 0,
        lives: 2,
        maxLives: 3,
        hasShield: false,
        rng,
      });
      assert.ok(pat.obstacles.length >= 1 && pat.obstacles.length <= 2);
      assert.ok(pat.nextGap >= 240, `nextGap=${pat.nextGap} too tight`);
      if (pat.obstacles.length === 2) {
        const [a, b] = pat.obstacles;
        assert.ok(b.x > a.x + a.w, 'Two obstacles in a pattern must not overlap');
      }
    }
  }
});

test('combo multiplier and rank evaluation', () => {
  assert.equal(computeComboMultiplier(0), 1);
  assert.equal(computeComboMultiplier(3), 2);
  assert.equal(computeComboMultiplier(8), 3);
  assert.equal(computeComboMultiplier(15), 4);
  assert.equal(computeComboMultiplier(25), 5);

  assert.equal(evaluateRank(0).grade, 'D');
  assert.equal(evaluateRank(1900).grade, 'A');
  assert.equal(evaluateRank(5000).grade, 'S+');
});

test('sky palette smoothly interpolates across day-sunset-night-dawn', () => {
  const day = sampleSkyPalette(0);
  const night = sampleSkyPalette(2);
  const mid = sampleSkyPalette(1.5);
  assert.equal(day.starAlpha, 0);
  assert.equal(night.starAlpha, 1);
  assert.ok(mid.starAlpha > 0.25 && mid.starAlpha < 1);
  assert.equal(CRAB.hitW < CRAB.visualW, true);
});
