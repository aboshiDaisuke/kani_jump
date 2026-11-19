import { sound } from './audio.js';
import { CRAB, MODES, PHYSICS, SCORING, STORAGE_KEYS } from './config.js';
import {
  clamp,
  computeComboMultiplier,
  computeWorldSpeed,
  evaluateRank,
  generatePattern,
  getCrabHitbox,
  getObstacleHitbox,
  rectDistance,
  rectsOverlap,
  sampleSkyPalette,
} from './logic.js';
import { GameRenderer } from './renderer.js';

const $ = (id) => document.getElementById(id);

function readStorage(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function writeStorage(key, val) {
  try {
    localStorage.setItem(key, String(val));
  } catch {
    // ignore storage quota / private mode
  }
}

// ---- DOM Elements ----
const canvas = $('game-canvas');
const hudEl = $('hud');
const hudScoreEl = $('hud-score');
const hudBestEl = $('hud-best');
const hudZoneEl = $('hud-zone');
const hudHeartsEl = $('hud-hearts');
const hudShieldEl = $('hud-shield');
const hudComboEl = $('hud-combo');
const hudComboNumEl = $('hud-combo-num');
const hudComboMultEl = $('hud-combo-mult');
const hudFeverWrapEl = $('hud-fever-wrap');
const hudFeverFillEl = $('hud-fever-fill');
const hudFeverLabelEl = $('hud-fever-label');

const btnBgm = $('btn-bgm');
const btnSfx = $('btn-sfx');
const btnPause = $('btn-pause');

const bannerEl = $('banner');
const bannerTextEl = $('banner-text');
const countdownEl = $('countdown');
const touchControlsEl = $('touch-controls');
const ctlJump = $('ctl-jump');
const ctlDive = $('ctl-dive');

const screenTitle = $('screen-title');
const screenPause = $('screen-pause');
const screenOver = $('screen-over');

const titleBestEl = $('title-best');
const modeButtons = [ $('mode-normal'), $('mode-challenge') ];

const overRankEl = $('over-rank');
const overHeadingEl = $('over-heading');
const overRankTitleEl = $('over-rank-title');
const overScoreEl = $('over-score');
const overNewRecordEl = $('over-new-record');
const statJumpsEl = $('stat-jumps');
const statNearMissEl = $('stat-nearmiss');
const statStarsEl = $('stat-stars');
const statComboEl = $('stat-combo');
const statSmashEl = $('stat-smash');
const statBestEl = $('stat-best');

// ---- Crab Sprite ----
const crabImg = new Image();
crabImg.src = './images/kani.png';

const renderer = new GameRenderer(canvas, crabImg);

// ---- Persistent Preferences ----
let selectedMode = readStorage(STORAGE_KEYS.mode, 'normal') === 'challenge' ? 'challenge' : 'normal';
let bestScores = {
  normal: Number(readStorage(STORAGE_KEYS.bestNormal, '0')) || 0,
  challenge: Number(readStorage(STORAGE_KEYS.bestChallenge, '0')) || 0,
};
let bgmOn = readStorage(STORAGE_KEYS.bgmOn, '1') !== '0';
let sfxOn = readStorage(STORAGE_KEYS.sfxOn, '1') !== '0';
sound.setBgmOn(bgmOn);
sound.setSfxOn(sfxOn);

// ---- Game State ----
const state = {
  phase: 'title', // 'title' | 'countdown' | 'playing' | 'paused' | 'gameover'
  mode: selectedMode,
  time: 0,
  elapsed: 0,
  scrollDist: 0,
  skyPhase: 0, // 0=day, 1=sunset, 2=night, 3=dawn
  speed: MODES.normal.startSpeed,
  viewW: 800,
  viewH: 520,
  groundY: 415,
  playerX: 150,

  score: 0,
  scoreFloat: 0,
  lives: 3,
  maxLives: 3,
  combo: 0,
  comboTimer: 0,
  maxCombo: 0,
  starStreak: 0,
  starStreakTimer: 0,

  feverGauge: 0, // 0..100
  feverTimer: 0,

  rushState: 'normal', // 'normal' | 'warn' | 'active'
  rushTimer: SCORING.rushInterval,

  countdownTimer: 0,
  countdownStep: 3,
  goTextTimer: 0,

  hitstopTimer: 0,
  shakeMag: 0,
  damageFlash: 0,
  bannerTimer: 0,

  nextSpawnDist: 360,
  obstacles: [],
  collectibles: [],
  particles: [],
  popups: [],
  trail: [],

  stats: {
    jumpsOver: 0,
    nearMisses: 0,
    stars: 0,
    smashes: 0,
  },

  player: {
    altitude: 0,
    vy: 0,
    grounded: true,
    jumpsUsed: 0,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    jumpHeld: false,
    hasShield: false,
    invulnTimer: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    spinVel: 0,
  },
};

function handleResize() {
  const layout = renderer.resize(window.innerWidth, window.innerHeight);
  state.viewW = layout.viewW;
  state.viewH = layout.viewH;
  state.groundY = layout.groundY;
  state.playerX = layout.playerX;
}
window.addEventListener('resize', handleResize);
handleResize();

// ---- UI Helpers ----
function syncSoundButtons() {
  btnBgm.classList.toggle('muted', !bgmOn);
  btnBgm.textContent = bgmOn ? '🎵' : '🔇';
  btnSfx.classList.toggle('muted', !sfxOn);
  btnSfx.textContent = sfxOn ? '🔊' : '🔈';
}

function syncModeButtons() {
  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === selectedMode);
  });
  titleBestEl.textContent = bestScores[selectedMode].toLocaleString();
}

function syncHeartsHud() {
  let html = '';
  for (let i = 0; i < state.maxLives; i++) {
    const alive = i < state.lives;
    html += `<span class="${alive ? '' : 'heart-lost'}">❤️</span>`;
  }
  hudHeartsEl.innerHTML = html;
}

function showBanner(text, duration = 2.4, isFever = false) {
  bannerTextEl.textContent = text;
  bannerEl.classList.toggle('fever', isFever);
  bannerEl.hidden = false;
  bannerEl.style.animation = 'none';
  // force reflow for bounce replay
  void bannerEl.offsetWidth;
  bannerEl.style.animation = '';
  state.bannerTimer = duration;
}

function hideBanner() {
  bannerEl.hidden = true;
  state.bannerTimer = 0;
}

function addPopup(text, x, altitude, color = '#facc15', size = 20) {
  state.popups.push({
    text,
    x,
    altitude,
    vy: 58,
    color,
    size,
    life: 0.95,
    maxLife: 0.95,
  });
}

function spawnParticles(x, altitude, count, opts = {}) {
  const {
    colors = ['#ffffff'],
    speedMin = 40,
    speedMax = 180,
    upMin = 40,
    upMax = 210,
    sizeMin = 3,
    sizeMax = 7,
    lifeMin = 0.25,
    lifeMax = 0.55,
    shape = 'circle',
    gravity = 520,
  } = opts;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const sp = speedMin + Math.random() * (speedMax - speedMin);
    const maxLife = lifeMin + Math.random() * (lifeMax - lifeMin);
    state.particles.push({
      x,
      altitude,
      vx: Math.cos(angle) * sp,
      vy: upMin + Math.random() * (upMax - upMin),
      size: sizeMin + Math.random() * (sizeMax - sizeMin),
      color: colors[Math.floor(Math.random() * colors.length)],
      shape,
      gravity,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 10,
      life: maxLife,
      maxLife,
    });
  }
}

// ---- Scoring & Combo ----
function addBonusScore(basePoints, label, x, altitude, color = '#fde047', feverAdd = 0, bumpCombo = false) {
  if (bumpCombo) {
    state.combo++;
    state.comboTimer = SCORING.comboTimeout;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
  }

  const modeMult = MODES[state.mode].scoreMult;
  const comboMult = computeComboMultiplier(state.combo);
  const rushMult = state.rushState === 'active' ? 1.5 : 1.0;
  const pts = Math.round(basePoints * modeMult * comboMult * rushMult);
  state.scoreFloat += pts;
  state.score = Math.floor(state.scoreFloat);

  if (label) {
    const text = comboMult > 1 ? `${label} +${pts} (×${comboMult})` : `${label} +${pts}`;
    addPopup(text, x, altitude, color, pts >= 80 ? 22 : 18);
  }

  if (feverAdd > 0 && state.feverTimer <= 0) {
    state.feverGauge = clamp(state.feverGauge + feverAdd, 0, 100);
    if (state.feverGauge >= 100) {
      activateFever();
    }
  }
}

function activateFever() {
  state.feverGauge = 100;
  state.feverTimer = SCORING.feverDuration;
  state.shakeMag = Math.max(state.shakeMag, 8);
  sound.feverStart();
  sound.playTrack('fever');
  showBanner('🌈 カニ無双 FEVER!! 車をふきとばせ！', 2.8, true);
  addPopup('FEVER!!', state.playerX + 10, state.player.altitude + 74, '#f472b6', 26);
  spawnParticles(state.playerX, state.player.altitude + 28, 28, {
    colors: ['#f43f5e', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#a855f7'],
    speedMin: 90,
    speedMax: 320,
    upMin: 80,
    upMax: 320,
    sizeMin: 5,
    sizeMax: 10,
    lifeMin: 0.45,
    lifeMax: 0.85,
    shape: 'star',
  });
}

// ---- Actions (Jump & Dive) ----
function executeJump(isDouble) {
  const p = state.player;
  p.grounded = false;
  p.coyoteTimer = 0;
  p.jumpBufferTimer = 0;

  if (!isDouble) {
    p.vy = PHYSICS.jumpVy;
    p.jumpsUsed = 1;
    p.scaleX = 0.8;
    p.scaleY = 1.24;
    p.rotation = -0.1;
    sound.jump();
    spawnParticles(state.playerX, 4, 8, {
      colors: ['#f8fafc', '#cbd5e1'],
      speedMin: 40,
      speedMax: 130,
      upMin: 20,
      upMax: 90,
      sizeMin: 4,
      sizeMax: 7,
      lifeMin: 0.2,
      lifeMax: 0.38,
    });
  } else {
    p.vy = PHYSICS.doubleJumpVy;
    p.jumpsUsed = 2;
    p.scaleX = 0.86;
    p.scaleY = 1.2;
    p.spinVel = 12.5; // Joyful 360° crab flip!
    sound.doubleJump();
    // Bubble ring + ocean sparkles
    state.particles.push({
      x: state.playerX,
      altitude: p.altitude + 8,
      vx: -40,
      vy: -20,
      size: 16,
      color: '#e0f2fe',
      shape: 'ring',
      gravity: 0,
      rot: 0,
      vrot: 0,
      life: 0.32,
      maxLife: 0.32,
    });
    spawnParticles(state.playerX, p.altitude + 10, 12, {
      colors: ['#38bdf8', '#e0f2fe', '#fde047'],
      speedMin: 60,
      speedMax: 190,
      upMin: -20,
      upMax: 140,
      sizeMin: 4,
      sizeMax: 8,
      shape: 'star',
    });
  }
}

function pressJump() {
  sound.init();
  if (state.phase !== 'playing' && state.phase !== 'countdown') return;
  const p = state.player;
  p.jumpHeld = true;
  p.jumpBufferTimer = PHYSICS.jumpBufferTime;
  ctlJump.classList.add('pressed');

  if (p.grounded || p.coyoteTimer > 0) {
    executeJump(false);
  } else if (p.jumpsUsed < 2) {
    executeJump(true);
  }
}

function releaseJump() {
  state.player.jumpHeld = false;
  ctlJump.classList.remove('pressed');
}

function triggerDive() {
  sound.init();
  if (state.phase !== 'playing' && state.phase !== 'countdown') return;
  const p = state.player;
  ctlDive.classList.add('pressed');
  setTimeout(() => ctlDive.classList.remove('pressed'), 120);

  if (!p.grounded && p.vy > PHYSICS.fastFallVy * 0.8) {
    p.vy = PHYSICS.fastFallVy;
    p.scaleX = 0.78;
    p.scaleY = 1.28;
    sound.dive();
    spawnParticles(state.playerX, p.altitude + 30, 6, {
      colors: ['#7dd3fc', '#ffffff'],
      speedMin: 20,
      speedMax: 80,
      upMin: 80,
      upMax: 180,
      sizeMin: 3,
      sizeMax: 6,
      lifeMin: 0.16,
      lifeMax: 0.3,
      gravity: 0,
    });
  }
}

// ---- Lifecycle ----
function resetRun(modeId) {
  state.mode = modeId;
  const cfg = MODES[modeId];
  state.elapsed = 0;
  state.skyPhase = 0;
  state.speed = cfg.startSpeed;
  state.score = 0;
  state.scoreFloat = 0;
  state.lives = cfg.lives;
  state.maxLives = cfg.lives;
  state.combo = 0;
  state.comboTimer = 0;
  state.maxCombo = 0;
  state.starStreak = 0;
  state.starStreakTimer = 0;
  state.feverGauge = 0;
  state.feverTimer = 0;
  state.rushState = 'normal';
  state.rushTimer = SCORING.rushInterval;
  state.hitstopTimer = 0;
  state.shakeMag = 0;
  state.damageFlash = 0;
  state.nextSpawnDist = 420;
  state.obstacles = [];
  state.collectibles = [];
  state.particles = [];
  state.popups = [];
  state.trail = [];
  state.stats = { jumpsOver: 0, nearMisses: 0, stars: 0, smashes: 0 };

  Object.assign(state.player, {
    altitude: 0,
    vy: 0,
    grounded: true,
    jumpsUsed: 0,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    jumpHeld: false,
    hasShield: false,
    invulnTimer: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    spinVel: 0,
  });

  hideBanner();
  syncHeartsHud();
  hudBestEl.textContent = bestScores[modeId].toLocaleString();
  hudShieldEl.hidden = true;
  hudComboEl.hidden = true;
  hudFeverFillEl.style.width = '0%';
  hudFeverWrapEl.classList.remove('active');
}

function setPhase(nextPhase) {
  state.phase = nextPhase;
  hudEl.dataset.phase = nextPhase;

  screenTitle.hidden = nextPhase !== 'title';
  screenPause.hidden = nextPhase !== 'paused';
  screenOver.hidden = nextPhase !== 'gameover';
  btnPause.hidden = nextPhase !== 'playing' && nextPhase !== 'paused';
  touchControlsEl.hidden = nextPhase !== 'playing' && nextPhase !== 'countdown';
  if (nextPhase !== 'countdown') countdownEl.hidden = true;
}

function startGame() {
  sound.init();
  resetRun(selectedMode);
  setPhase('countdown');
  state.countdownTimer = 0.62;
  state.countdownStep = 3;
  showCountdownText('3');
  sound.countdown(false);
  sound.playTrack('play');
}

function showCountdownText(text) {
  countdownEl.textContent = text;
  countdownEl.hidden = false;
  countdownEl.style.animation = 'none';
  void countdownEl.offsetWidth;
  countdownEl.style.animation = '';
}

function pauseGame() {
  if (state.phase !== 'playing') return;
  setPhase('paused');
  sound.stopTrack();
}

function resumeGame() {
  if (state.phase !== 'paused') return;
  sound.init();
  setPhase('playing');
  sound.playTrack(state.feverTimer > 0 ? 'fever' : 'play');
}

function returnToTitle() {
  hideBanner();
  resetRun(selectedMode);
  setPhase('title');
  syncModeButtons();
  sound.playTrack('title');
}

function triggerGameOver() {
  setPhase('gameover');
  sound.stopTrack();
  sound.gameOver();
  hideBanner();

  const finalScore = state.score;
  const prevBest = bestScores[state.mode];
  const isNewRecord = finalScore > prevBest && finalScore > 0;
  if (isNewRecord) {
    bestScores[state.mode] = finalScore;
    writeStorage(
      state.mode === 'challenge' ? STORAGE_KEYS.bestChallenge : STORAGE_KEYS.bestNormal,
      finalScore,
    );
  }

  const rank = evaluateRank(finalScore);
  overRankEl.textContent = rank.grade;
  overRankEl.style.background = `linear-gradient(135deg, ${rank.color}, #ef4444)`;
  overRankTitleEl.textContent = rank.title;
  overHeadingEl.textContent = isNewRecord ? 'すごい！記録こうしん！' : 'おつかれさま！';
  overScoreEl.textContent = finalScore.toLocaleString();
  overNewRecordEl.hidden = !isNewRecord;

  statJumpsEl.textContent = state.stats.jumpsOver;
  statNearMissEl.textContent = state.stats.nearMisses;
  statStarsEl.textContent = state.stats.stars;
  statComboEl.textContent = state.maxCombo;
  statSmashEl.textContent = state.stats.smashes;
  statBestEl.textContent = bestScores[state.mode].toLocaleString();
}

function takeHit(ob) {
  const p = state.player;
  if (p.hasShield) {
    // Bubble shield absorbs the impact!
    p.hasShield = false;
    p.invulnTimer = 1.1;
    hudShieldEl.hidden = true;
    state.hitstopTimer = 0.055;
    state.shakeMag = 9;
    sound.shieldBreak();
    addPopup('バリアガード！', state.playerX, p.altitude + 68, '#38bdf8', 20);
    spawnParticles(state.playerX, p.altitude + 28, 18, {
      colors: ['#38bdf8', '#e0f2fe', '#c084fc'],
      speedMin: 70,
      speedMax: 240,
      upMin: 40,
      upMax: 200,
      sizeMin: 4,
      sizeMax: 8,
    });
    // Knock obstacle harmlessly aside
    ob.smashed = true;
    ob.vx = 220;
    ob.vy = 320;
    ob.vrot = 6;
    return;
  }

  state.lives = Math.max(0, state.lives - 1);
  state.combo = 0;
  state.comboTimer = 0;
  p.invulnTimer = PHYSICS.invulnDuration;
  state.hitstopTimer = 0.08;
  state.shakeMag = 14;
  state.damageFlash = 1.0;
  syncHeartsHud();

  spawnParticles(state.playerX, p.altitude + 26, 20, {
    colors: ['#ef4444', '#facc15', '#ffffff'],
    speedMin: 80,
    speedMax: 260,
    upMin: 60,
    upMax: 240,
    sizeMin: 4,
    sizeMax: 9,
    shape: 'star',
  });

  if (state.lives <= 0) {
    sound.hurt();
    triggerGameOver();
  } else {
    sound.hurt();
    addPopup('いたっ！', state.playerX, p.altitude + 66, '#f87171', 22);
    // Small protective hop
    p.vy = Math.max(p.vy, 380);
    p.grounded = false;
  }
}

// ---- Update Simulation ----
function updatePlayer(dt) {
  const p = state.player;
  if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
  if (p.jumpBufferTimer > 0) p.jumpBufferTimer = Math.max(0, p.jumpBufferTimer - dt);

  if (p.grounded) {
    p.coyoteTimer = PHYSICS.coyoteTime;
  } else {
    p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
  }

  // Gravity (with variable jump height when releasing jump early)
  if (!p.grounded) {
    const gMult = !p.jumpHeld && p.vy > 220 ? PHYSICS.cutGravityMult : 1.0;
    p.vy -= PHYSICS.gravity * gMult * dt;
    p.altitude += p.vy * dt;

    if (p.altitude <= 0) {
      p.altitude = 0;
      p.vy = 0;
      p.grounded = true;
      p.jumpsUsed = 0;
      p.rotation = 0;
      p.spinVel = 0;
      p.scaleX = 1.26;
      p.scaleY = 0.76;
      sound.land();
      spawnParticles(state.playerX, 3, 7, {
        colors: ['#e2e8f0', '#cbd5e1'],
        speedMin: 35,
        speedMax: 120,
        upMin: 15,
        upMax: 80,
        sizeMin: 3,
        sizeMax: 6,
        lifeMin: 0.16,
        lifeMax: 0.32,
      });

      // Execute buffered jump right on touchdown!
      if (p.jumpBufferTimer > 0) {
        executeJump(false);
      }
    }
  }

  // Smooth spring back squash & stretch
  const damp = 1 - Math.exp(-15 * dt);
  p.scaleX += (1 - p.scaleX) * damp;
  p.scaleY += (1 - p.scaleY) * damp;

  // Double jump flip rotation
  if (Math.abs(p.spinVel) > 0.1) {
    p.rotation += p.spinVel * dt;
    if (p.rotation >= Math.PI * 2) {
      p.rotation = 0;
      p.spinVel = 0;
    }
  } else if (!p.grounded) {
    const targetRot = clamp(-p.vy / 2600, -0.22, 0.24);
    p.rotation += (targetRot - p.rotation) * damp;
  } else {
    p.rotation += (0 - p.rotation) * damp;
  }

  // Fever trail history
  if (state.feverTimer > 0) {
    state.trail.push({ x: state.playerX, altitude: p.altitude });
    if (state.trail.length > 8) state.trail.shift();
    for (const tr of state.trail) tr.x -= state.speed * dt * 0.55;
  } else if (state.trail.length > 0) {
    state.trail.length = 0;
  }
}

function updateRushCycle(dt) {
  state.rushTimer -= dt;
  if (state.rushState === 'normal' && state.rushTimer <= 0) {
    state.rushState = 'warn';
    state.rushTimer = SCORING.rushWarnDuration;
    sound.signalWarn();
    showBanner('🚦 信号点滅！まもなくラッシュ！', 2.8, false);
  } else if (state.rushState === 'warn' && state.rushTimer <= 0) {
    state.rushState = 'active';
    state.rushTimer = SCORING.rushDuration;
    sound.signalWarn();
    showBanner('🔥 ラッシュタイム！スコア 1.5倍！', 2.6, false);
  } else if (state.rushState === 'active' && state.rushTimer <= 0) {
    state.rushState = 'normal';
    state.rushTimer = SCORING.rushInterval;
    addBonusScore(SCORING.rushClear, '🚦 ラッシュ突破!', state.playerX + 40, 120, '#4ade80', 18, true);
    sound.jumpOver();
  }
}

function updateWorld(dt) {
  state.time += dt;

  // Decay screen effects
  state.shakeMag = Math.max(0, state.shakeMag - dt * 36);
  state.damageFlash = Math.max(0, state.damageFlash - dt * 3.2);

  if (state.bannerTimer > 0) {
    state.bannerTimer -= dt;
    if (state.bannerTimer <= 0) bannerEl.hidden = true;
  }

  if (state.goTextTimer > 0) {
    state.goTextTimer -= dt;
    if (state.goTextTimer <= 0 && state.phase === 'playing') {
      countdownEl.hidden = true;
    }
  }

  // Particles & Popups animate smoothly in all non-paused phases
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    pt.vy -= pt.gravity * dt;
    pt.x += pt.vx * dt;
    pt.altitude += pt.vy * dt;
    pt.rot += pt.vrot * dt;
    if (pt.altitude < 0 && pt.gravity > 0) {
      pt.altitude = 0;
      pt.vy *= -0.3;
    }
  }

  for (let i = state.popups.length - 1; i >= 0; i--) {
    const pop = state.popups[i];
    pop.life -= dt;
    if (pop.life <= 0) {
      state.popups.splice(i, 1);
      continue;
    }
    pop.altitude += pop.vy * dt;
    pop.vy *= 0.96;
  }

  if (state.phase === 'title') {
    // Gentle scenic scrolling behind Title screen
    state.scrollDist += 110 * dt;
    state.skyPhase = (state.skyPhase + dt / 40) % 4;
    return;
  }

  if (state.phase === 'countdown') {
    state.scrollDist += state.speed * 0.55 * dt;
    updatePlayer(dt);
    state.countdownTimer -= dt;
    if (state.countdownTimer <= 0) {
      state.countdownStep--;
      if (state.countdownStep >= 1) {
        state.countdownTimer = 0.62;
        showCountdownText(String(state.countdownStep));
        sound.countdown(false);
      } else if (state.countdownStep === 0) {
        state.goTextTimer = 0.5;
        showCountdownText('GO!!');
        sound.countdown(true);
        setPhase('playing');
        countdownEl.hidden = false;
      }
    }
    return;
  }

  if (state.phase !== 'playing') {
    return;
  }

  // Hitstop freeze frame for juicy impact feel
  if (state.hitstopTimer > 0) {
    state.hitstopTimer -= dt;
    return;
  }

  state.elapsed += dt;
  state.skyPhase = (state.skyPhase + dt / 32) % 4;

  // Fever timer
  if (state.feverTimer > 0) {
    state.feverTimer -= dt;
    state.feverGauge = clamp((state.feverTimer / SCORING.feverDuration) * 100, 0, 100);
    if (state.feverTimer <= 0) {
      state.feverTimer = 0;
      state.feverGauge = 0;
      state.player.invulnTimer = Math.max(state.player.invulnTimer, 1.0);
      sound.playTrack('play');
    }
  }

  // Combo & star streak timers
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
  }
  if (state.starStreakTimer > 0) {
    state.starStreakTimer -= dt;
    if (state.starStreakTimer <= 0) state.starStreak = 0;
  }

  updateRushCycle(dt);

  const isFever = state.feverTimer > 0;
  const isRush = state.rushState === 'active';
  state.speed = computeWorldSpeed(state.elapsed, state.mode, isRush, isFever);
  sound.setTempoMultiplier(1 + (state.speed - 310) / 1400);

  const stepDist = state.speed * dt;
  state.scrollDist += stepDist;

  // Distance score tick
  const modeMult = MODES[state.mode].scoreMult;
  const rushMult = isRush ? 1.5 : 1.0;
  state.scoreFloat += SCORING.distancePerSec * modeMult * rushMult * dt;
  state.score = Math.floor(state.scoreFloat);

  updatePlayer(dt);

  // Subtle ground scuttle dust
  if (state.player.grounded && Math.random() < dt * 9) {
    spawnParticles(state.playerX - 18, 2, 1, {
      colors: ['rgba(255,255,255,0.75)'],
      speedMin: 15,
      speedMax: 50,
      upMin: 10,
      upMax: 40,
      sizeMin: 2.5,
      sizeMax: 4.5,
      lifeMin: 0.16,
      lifeMax: 0.28,
      gravity: 160,
    });
  }

  // Spawn patterns
  state.nextSpawnDist -= stepDist;
  if (state.nextSpawnDist <= 0) {
    const spawnX = Math.max(state.viewW + 70, state.playerX + 520);
    const pattern = generatePattern({
      spawnX,
      elapsed: state.elapsed,
      speed: state.speed,
      isRush,
      lives: state.lives,
      maxLives: state.maxLives,
      hasShield: state.player.hasShield,
    });
    state.obstacles.push(...pattern.obstacles);
    state.collectibles.push(...pattern.collectibles);
    state.nextSpawnDist = pattern.nextGap;
  }

  const crabBox = getCrabHitbox(state.playerX, state.player.altitude);

  // Update & collide collectibles
  for (let i = state.collectibles.length - 1; i >= 0; i--) {
    const c = state.collectibles[i];
    c.x -= stepDist;
    if (c.x < -80) {
      state.collectibles.splice(i, 1);
      continue;
    }
    if (c.collected) continue;

    const cBox = {
      left: c.x - c.radius,
      right: c.x + c.radius,
      bottom: c.airY - c.radius,
      top: c.airY + c.radius,
    };
    if (rectsOverlap(crabBox, cBox)) {
      c.collected = true;
      if (c.type === 'star') {
        state.stats.stars++;
        state.starStreakTimer = 1.1;
        sound.star(state.starStreak);
        state.starStreak++;
        addBonusScore(SCORING.star, '★', c.x, c.airY + 18, '#fde047', SCORING.feverFromStar, true);
        spawnParticles(c.x, c.airY, 10, {
          colors: ['#fde047', '#fef9c3', '#fb923c'],
          speedMin: 60,
          speedMax: 180,
          upMin: 40,
          upMax: 180,
          sizeMin: 4,
          sizeMax: 8,
          shape: 'star',
        });
      } else if (c.type === 'shield') {
        state.player.hasShield = true;
        hudShieldEl.hidden = false;
        sound.shieldUp();
        addPopup('🫧 バリアGET!', c.x, c.airY + 24, '#38bdf8', 20);
        spawnParticles(c.x, c.airY, 14, {
          colors: ['#38bdf8', '#e0f2fe', '#c084fc'],
          speedMin: 60,
          speedMax: 190,
          upMin: 40,
          upMax: 180,
        });
      } else if (c.type === 'heart') {
        if (state.lives < state.maxLives) {
          state.lives++;
          syncHeartsHud();
          addPopup('❤️ ライフ回復!', c.x, c.airY + 24, '#fb7185', 20);
        } else {
          addBonusScore(100, '❤️ ボーナス', c.x, c.airY + 24, '#fb7185', 20, false);
        }
        sound.heartUp();
        spawnParticles(c.x, c.airY, 14, {
          colors: ['#f43f5e', '#fda4af', '#ffffff'],
          speedMin: 60,
          speedMax: 190,
          upMin: 40,
          upMax: 180,
          shape: 'star',
        });
      }
      state.collectibles.splice(i, 1);
    }
  }

  // Update & collide obstacles
  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    const ob = state.obstacles[i];

    if (ob.smashed) {
      ob.x += ob.vx * dt;
      ob.airY += ob.vy * dt;
      ob.vy -= 1400 * dt;
      ob.rot += ob.vrot * dt;
      if (ob.x > state.viewW + 250 || ob.airY < -200) {
        state.obstacles.splice(i, 1);
      }
      continue;
    }

    ob.x -= stepDist * ob.speedMult;
    ob.wheelPhase -= dt * (state.speed * ob.speedMult) / 14;
    if (ob.x + ob.w < -120) {
      state.obstacles.splice(i, 1);
      continue;
    }

    const obBox = getObstacleHitbox(ob);

    // Track horizontal overlap for jump-over & near-miss scoring
    const horizNear = obBox.left < crabBox.right + 18 && obBox.right > crabBox.left - 18;
    if (horizNear) {
      const dist = rectDistance(crabBox, obBox);
      if (dist < ob.minClearance) ob.minClearance = dist;
      if (crabBox.bottom >= obBox.top - 4 && obBox.left < crabBox.right && obBox.right > crabBox.left) {
        ob.jumpedOver = true;
      }
    }

    // Collision check
    if (rectsOverlap(crabBox, obBox)) {
      if (isFever) {
        // SMASH the vehicle off screen!
        ob.smashed = true;
        ob.vx = 520 + Math.random() * 240;
        ob.vy = 460 + Math.random() * 220;
        ob.vrot = 9 + Math.random() * 6;
        state.stats.smashes++;
        state.hitstopTimer = 0.042;
        state.shakeMag = 11;
        sound.smash();
        addBonusScore(SCORING.smash, '💥 SMASH!', ob.x + ob.w * 0.3, ob.airY + ob.h * 0.7, '#f472b6', 0, true);
        spawnParticles(ob.x + ob.w * 0.3, ob.airY + ob.h * 0.5, 18, {
          colors: ['#f43f5e', '#facc15', '#38bdf8', '#ffffff'],
          speedMin: 120,
          speedMax: 340,
          upMin: 80,
          upMax: 320,
          sizeMin: 5,
          sizeMax: 10,
          shape: 'star',
        });
      } else if (state.player.invulnTimer <= 0) {
        takeHit(ob);
        if (state.phase === 'gameover') return;
      }
      continue;
    }

    // Passed cleanly behind the crab!
    if (!ob.cleared && obBox.right < crabBox.left) {
      ob.cleared = true;
      if (ob.minClearance <= 30 && ob.minClearance > 0) {
        state.stats.nearMisses++;
        if (ob.jumpedOver) state.stats.jumpsOver++;
        sound.nearMiss();
        addBonusScore(
          SCORING.nearMiss,
          '⚡ NEAR MISS!',
          state.playerX + 12,
          state.player.altitude + 68,
          '#38bdf8',
          SCORING.feverFromNearMiss,
          true,
        );
        spawnParticles(state.playerX, state.player.altitude + 20, 10, {
          colors: ['#38bdf8', '#e0f2fe'],
          speedMin: 60,
          speedMax: 180,
          upMin: 20,
          upMax: 140,
          sizeMin: 3,
          sizeMax: 6,
        });
      } else if (ob.jumpedOver) {
        state.stats.jumpsOver++;
        sound.jumpOver();
        addBonusScore(
          SCORING.jumpOver,
          '✨ JUMP!',
          state.playerX + 6,
          state.player.altitude + 62,
          '#4ade80',
          SCORING.feverFromJumpOver,
          true,
        );
      }
    }
  }
}

function updateHud() {
  hudScoreEl.textContent = state.score.toLocaleString();
  const displayBest = Math.max(bestScores[state.mode], state.score);
  hudBestEl.textContent = displayBest.toLocaleString();

  const pal = sampleSkyPalette(state.skyPhase);
  hudZoneEl.textContent = state.rushState === 'active' ? '🔥 ラッシュ中！' : pal.name;

  if (state.combo >= 2 && state.phase === 'playing') {
    hudComboEl.hidden = false;
    hudComboNumEl.textContent = state.combo;
    const mult = computeComboMultiplier(state.combo);
    hudComboMultEl.textContent = mult > 1 ? `×${mult}` : '';
  } else {
    hudComboEl.hidden = true;
  }

  hudFeverFillEl.style.width = `${Math.round(state.feverGauge)}%`;
  const feverActive = state.feverTimer > 0;
  hudFeverWrapEl.classList.toggle('active', feverActive);
  hudFeverLabelEl.textContent = feverActive ? 'FEVER!!' : 'FEVER';
}

// ---- Main Loop ----
let lastTs = 0;
function loop(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;

  updateWorld(dt);
  if (state.phase === 'playing' || state.phase === 'countdown') {
    updateHud();
  }
  renderer.render(state);
  requestAnimationFrame(loop);
}

// ---- Input Wiring ----
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const code = e.code;

  if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
    e.preventDefault();
    if (state.phase === 'title' || state.phase === 'gameover') {
      startGame();
    } else if (state.phase === 'paused') {
      resumeGame();
    } else {
      pressJump();
    }
  } else if (code === 'ArrowDown' || code === 'KeyS') {
    e.preventDefault();
    triggerDive();
  } else if (code === 'KeyP' || code === 'Escape') {
    if (state.phase === 'playing') pauseGame();
    else if (state.phase === 'paused') resumeGame();
  } else if (code === 'KeyM') {
    bgmOn = !bgmOn;
    sound.init();
    sound.setBgmOn(bgmOn);
    writeStorage(STORAGE_KEYS.bgmOn, bgmOn ? '1' : '0');
    syncSoundButtons();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    releaseJump();
  }
});

// Canvas tap & swipe-down support
let touchStartY = null;
canvas.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'playing' && state.phase !== 'countdown') return;
  touchStartY = e.clientY;
  pressJump();
});

canvas.addEventListener('pointermove', (e) => {
  if (touchStartY === null) return;
  if (e.clientY - touchStartY > 36) {
    touchStartY = null;
    triggerDive();
  }
});

window.addEventListener('pointerup', () => {
  touchStartY = null;
  releaseJump();
});
window.addEventListener('pointercancel', () => {
  touchStartY = null;
  releaseJump();
});

// Dedicated mobile action buttons
ctlJump.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  pressJump();
});
ctlJump.addEventListener('pointerup', (e) => {
  e.stopPropagation();
  releaseJump();
});
ctlDive.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  triggerDive();
});

// UI Buttons
modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    sound.init();
    selectedMode = btn.dataset.mode;
    writeStorage(STORAGE_KEYS.mode, selectedMode);
    syncModeButtons();
  });
});

$('btn-start').addEventListener('click', startGame);
$('btn-retry').addEventListener('click', startGame);
$('btn-title').addEventListener('click', returnToTitle);
$('btn-pause').addEventListener('click', () => {
  if (state.phase === 'playing') pauseGame();
  else if (state.phase === 'paused') resumeGame();
});
$('btn-resume').addEventListener('click', resumeGame);
$('btn-restart-pause').addEventListener('click', startGame);
$('btn-quit').addEventListener('click', returnToTitle);

btnBgm.addEventListener('click', () => {
  sound.init();
  bgmOn = !bgmOn;
  sound.setBgmOn(bgmOn);
  writeStorage(STORAGE_KEYS.bgmOn, bgmOn ? '1' : '0');
  syncSoundButtons();
});

btnSfx.addEventListener('click', () => {
  sound.init();
  sfxOn = !sfxOn;
  sound.setSfxOn(sfxOn);
  writeStorage(STORAGE_KEYS.sfxOn, sfxOn ? '1' : '0');
  syncSoundButtons();
});

// Auto-pause when tab loses visibility
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'playing') {
    pauseGame();
  }
});

// Initial setup
const portalBackEl = $('portal-back');
if (portalBackEl && location.pathname.includes('/2d/')) {
  portalBackEl.hidden = false;
}
syncSoundButtons();
syncModeButtons();
setPhase('title');

// Dev & verification hook
window.__kaniDX = {
  state,
  startGame,
  pressJump,
  releaseJump,
  triggerDive,
  activateFever,
  step: (seconds) => {
    const dt = 1 / 60;
    const steps = Math.max(1, Math.round(seconds / dt));
    for (let i = 0; i < steps; i++) updateWorld(dt);
    updateHud();
    renderer.render(state);
  },
};

requestAnimationFrame(loop);
