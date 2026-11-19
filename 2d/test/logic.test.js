import test from 'node:test';
import assert from 'node:assert/strict';
import { CRAB, MODES, OBSTACLE_SPECS, PHYSICS, STAGES } from '../src/config.js';
import {
  computeComboMultiplier,
  computeWorldSpeed,
  evaluateRank,
  generatePattern,
  getCrabHitbox,
  getObstacleHitbox,
  isStompBounce,
  rectDistance,
  rectsOverlap,
  sampleStagePalette,
} from '../src/logic.js';
import {
  buyOrEquipCosmetic,
  buyUpgrade,
  createDefaultMeta,
  evaluateMissions,
  getUpgradeValue,
} from '../src/meta.js';

function seededRng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test('single jump clears sedan/taxi and double jump clears truck/bus', () => {
  const singlePeak = (PHYSICS.jumpVy ** 2) / (2 * PHYSICS.gravity);
  const doublePeak = singlePeak + (PHYSICS.doubleJumpVy ** 2) / (2 * PHYSICS.gravity);
  const carHitHeight = OBSTACLE_SPECS.car.h - OBSTACLE_SPECS.car.hitPadTop;
  const busHitHeight = OBSTACLE_SPECS.bus.h - OBSTACLE_SPECS.bus.hitPadTop;

  assert.ok(singlePeak > carHitHeight + 30);
  assert.ok(doublePeak > busHitHeight + 80);
});

test('stomp bounce triggers when falling onto car roof or hitting springboard, not side hit', () => {
  const car = { kind: 'car', x: 100, w: OBSTACLE_SPECS.car.w, h: OBSTACLE_SPECS.car.h, airY: 0 };
  const carBox = getObstacleHitbox(car);
  assert.equal(isStompBounce(carBox.top + 8, -320, carBox, car), true);
  assert.equal(isStompBounce(5, 0, carBox, car), false);

  const spring = { kind: 'spring', x: 100, w: OBSTACLE_SPECS.spring.w, h: OBSTACLE_SPECS.spring.h, airY: 0 };
  const springBox = getObstacleHitbox(spring);
  assert.equal(isStompBounce(0, 0, springBox, spring), true);
});

test('grounded crab passes safely under seagull with near-miss margin', () => {
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
  assert.ok(gap >= 15 && gap <= 35);
});

test('speed scales across stages, rush, and fever', () => {
  const s0 = computeWorldSpeed(0, 'normal', 0, false, false);
  const sStage2 = computeWorldSpeed(25, 'normal', 1, false, false);
  const sRush = computeWorldSpeed(25, 'normal', 1, true, false);
  const sFever = computeWorldSpeed(25, 'normal', 1, false, true);

  assert.equal(s0, MODES.normal.startSpeed);
  assert.ok(sStage2 > s0);
  assert.ok(sRush > sStage2);
  assert.ok(sFever > sStage2);
});

test('pattern generator produces fair non-overlapping formations across all 4 stages', () => {
  const rng = seededRng(2026);
  for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex++) {
    for (let i = 0; i < 30; i++) {
      const pat = generatePattern({
        spawnX: 850,
        elapsed: stageIndex * 35 + i,
        speed: computeWorldSpeed(stageIndex * 35, 'normal', stageIndex, i % 4 === 0, false),
        stageIndex,
        isRush: i % 4 === 0,
        lives: 2,
        maxLives: 3,
        hasShield: false,
        shieldUpgradeLv: 1,
        rng,
      });
      assert.ok(pat.obstacles.length >= 1 && pat.obstacles.length <= 3);
      assert.ok(pat.nextGap >= 240);
      for (let j = 0; j < pat.obstacles.length - 1; j++) {
        const a = pat.obstacles[j];
        const b = pat.obstacles[j + 1];
        assert.ok(b.x > a.x + a.w, `Overlap in stage ${stageIndex}`);
      }
    }
  }
});

test('stage palettes blend smoothly across all 4 biomes including Aurora', () => {
  const s1 = sampleStagePalette(0);
  const s2 = sampleStagePalette(1);
  const s3 = sampleStagePalette(2);
  const s4 = sampleStagePalette(3);
  assert.equal(s1.starAlpha, 0);
  assert.equal(s2.ambient, 'embers');
  assert.equal(s3.starAlpha, 1);
  assert.equal(s4.auroraAlpha, 1);
  assert.equal(CRAB.hitW < CRAB.visualW, true);
});

test('meta shop cosmetics, upgrades, and mission rewards work end-to-end', () => {
  const meta = createDefaultMeta();
  assert.equal(buyOrEquipCosmetic(meta, 'crown').ok, false);

  meta.bankStars = 1000;
  const buyCrown = buyOrEquipCosmetic(meta, 'crown');
  assert.equal(buyCrown.ok, true);
  assert.equal(buyCrown.action, 'bought');
  assert.equal(meta.equippedCosmetic, 'crown');
  assert.equal(meta.bankStars, 350);

  const up = buyUpgrade(meta, 'magnet');
  assert.equal(up.ok, true);
  assert.equal(getUpgradeValue(meta, 'magnet'), 95);

  const beforeBank = meta.bankStars;
  const done = evaluateMissions(meta, { stars: 20, bounces: 4, nearMisses: 0 });
  assert.equal(done.length, 2);
  assert.ok(meta.bankStars > beforeBank);
  assert.equal(meta.activeMissions.length, 3);
});

test('combo multiplier and rank grades', () => {
  assert.equal(computeComboMultiplier(1), 1);
  assert.equal(computeComboMultiplier(5), 2);
  assert.equal(computeComboMultiplier(25), 5);
  assert.equal(evaluateRank(6500).grade, 'S+');
});
