import { sound } from './audio.js';
import {
  COSMETICS,
  MISSION_POOL,
  MODES,
  OBSTACLE_SPECS,
  PHYSICS,
  SCORING,
  STAGES,
  STORAGE_KEYS,
  UPGRADES,
} from './config.js';
import {
  clamp,
  computeComboMultiplier,
  computeWorldSpeed,
  evaluateRank,
  generatePattern,
  getCrabHitbox,
  getObstacleHitbox,
  isStompBounce,
  rectDistance,
  rectsOverlap,
} from './logic.js';
import {
  buyOrEquipCosmetic,
  buyUpgrade,
  evaluateMissions,
  getMissionDef,
  getUpgradeValue,
  loadMeta,
  saveMeta,
} from './meta.js';
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
    // ignore private mode
  }
}

// ---- DOM Elements ----
const canvas = $('game-canvas');
const hudEl = $('hud');
const hudScoreEl = $('hud-score');
const hudBestEl = $('hud-best');
const hudStarsEl = $('hud-stars');
const hudStageEl = $('hud-stage');
const hudStageFillEl = $('hud-stage-fill');
const hudHeartsEl = $('hud-hearts');
const hudShieldEl = $('hud-shield');
const hudComboEl = $('hud-combo');
const hudComboNumEl = $('hud-combo-num');
const hudComboMultEl = $('hud-combo-mult');
const hudFeverWrapEl = $('hud-fever-wrap');
const hudFeverFillEl = $('hud-fever-fill');
const hudFeverLabelEl = $('hud-fever-label');
const hudBankStarsEl = $('hud-bank-stars');

const btnBgm = $('btn-bgm');
const btnSfx = $('btn-sfx');
const btnPause = $('btn-pause');

const bannerEl = $('banner');
const bannerTextEl = $('banner-text');
const toastEl = $('mission-toast');
const toastTitleEl = $('toast-title');
const toastSubEl = $('toast-sub');
const countdownEl = $('countdown');
const touchControlsEl = $('touch-controls');
const ctlJump = $('ctl-jump');
const ctlDive = $('ctl-dive');

const screenTitle = $('screen-title');
const screenShop = $('screen-shop');
const screenMissions = $('screen-missions');
const screenStages = $('screen-stages');
const screenPause = $('screen-pause');
const screenOver = $('screen-over');

const titleBestEl = $('title-best');
const titleStarsEl = $('title-stars');
const btnStageLabelEl = $('btn-stage-label');
const modeButtons = [$('mode-normal'), $('mode-challenge')];

const shopBankEl = $('shop-bank');
const tabCosmetics = $('tab-cosmetics');
const tabUpgrades = $('tab-upgrades');
const shopCosmeticsList = $('shop-cosmetics-list');
const shopUpgradesList = $('shop-upgrades-list');

const missionsProgressEl = $('missions-progress');
const missionsListEl = $('missions-list');
const stagesUnlockedBadgeEl = $('stages-unlocked-badge');
const stagesListEl = $('stages-list');

const overRankEl = $('over-rank');
const overHeadingEl = $('over-heading');
const overRankTitleEl = $('over-rank-title');
const overScoreEl = $('over-score');
const overNewRecordEl = $('over-new-record');
const overEarnedStarsEl = $('over-earned-stars');
const statStageEl = $('stat-stage');
const statBouncesEl = $('stat-bounces');
const statNearMissEl = $('stat-nearmiss');
const statStarsEl = $('stat-stars');
const statComboEl = $('stat-combo');
const statSmashEl = $('stat-smash');

// ---- Crab Sprite ----
const crabImg = new Image();
crabImg.src = './images/kani.png';

const renderer = new GameRenderer(canvas, crabImg);

// ---- Persistent Preferences & Meta ----
const meta = loadMeta();
let selectedMode = readStorage(STORAGE_KEYS.mode, 'normal') === 'challenge' ? 'challenge' : 'normal';
let selectedStartStage = 0;
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
  equippedCosmetic: meta.equippedCosmetic,
  time: 0,
  elapsed: 0,
  scrollDist: 0,
  stageIndex: 0,
  stageBlend: 0,
  stageMeters: 0,
  speed: MODES.normal.startSpeed,
  viewW: 800,
  viewH: 520,
  groundY: 415,
  playerX: 150,
  camY: 0,

  score: 0,
  scoreFloat: 0,
  lives: 3,
  maxLives: 3,
  combo: 0,
  comboTimer: 0,
  maxCombo: 0,
  starStreak: 0,
  starStreakTimer: 0,

  feverGauge: 0,
  feverTimer: 0,

  rushState: 'normal',
  rushTimer: SCORING.rushInterval,

  countdownTimer: 0,
  countdownStep: 3,
  goTextTimer: 0,

  hitstopTimer: 0,
  shakeMag: 0,
  damageFlash: 0,
  celebrationFlash: 0,
  bannerTimer: 0,
  toastTimer: 0,

  nextSpawnDist: 380,
  obstacles: [],
  collectibles: [],
  particles: [],
  popups: [],
  trail: [],

  stats: {
    jumpsOver: 0,
    bounces: 0,
    springs: 0,
    nearMisses: 0,
    stars: 0,
    smashes: 0,
    stageReached: 1,
    missionBonusStars: 0,
  },

  player: {
    altitude: 0,
    prevAltitude: 0,
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

// ---- UI Sync ----
function syncSoundButtons() {
  btnBgm.classList.toggle('muted', !bgmOn);
  btnBgm.textContent = bgmOn ? '🎵' : '🔇';
  btnSfx.classList.toggle('muted', !sfxOn);
  btnSfx.textContent = sfxOn ? '🔊' : '🔈';
}

function syncBankUi() {
  hudBankStarsEl.textContent = meta.bankStars.toLocaleString();
  titleStarsEl.textContent = meta.bankStars.toLocaleString();
  shopBankEl.textContent = meta.bankStars.toLocaleString();
  state.equippedCosmetic = meta.equippedCosmetic;
}

function syncModeButtons() {
  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === selectedMode);
  });
  titleBestEl.textContent = bestScores[selectedMode].toLocaleString();
  btnStageLabelEl.textContent = STAGES[selectedStartStage].code;
  syncBankUi();
}

function syncHeartsHud() {
  let html = '';
  for (let i = 0; i < state.maxLives; i++) {
    const alive = i < state.lives;
    html += `<span class="${alive ? '' : 'heart-lost'}">❤️</span>`;
  }
  hudHeartsEl.innerHTML = html;
}

function showBanner(text, duration = 2.5, variant = '') {
  bannerTextEl.textContent = text;
  bannerEl.classList.toggle('fever', variant === 'fever');
  bannerEl.classList.toggle('stage', variant === 'stage');
  bannerEl.hidden = false;
  bannerEl.style.animation = 'none';
  void bannerEl.offsetWidth;
  bannerEl.style.animation = '';
  state.bannerTimer = duration;
}

function hideBanner() {
  bannerEl.hidden = true;
  state.bannerTimer = 0;
}

function showMissionToast(mission) {
  toastTitleEl.textContent = `🏆 ミッション達成！ +${mission.reward}★`;
  toastSubEl.textContent = mission.text;
  toastEl.hidden = false;
  toastEl.style.animation = 'none';
  void toastEl.offsetWidth;
  toastEl.style.animation = '';
  state.toastTimer = 3.2;
}

function addPopup(text, x, altitude, color = '#facc15', size = 20) {
  state.popups.push({
    text,
    x,
    altitude,
    vy: 60,
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

// ---- Modals Rendering (Shop, Missions, Stages) ----
let shopReturnTarget = 'title';

function renderShop() {
  syncBankUi();
  shopCosmeticsList.innerHTML = '';
  for (const item of COSMETICS) {
    const owned = meta.ownedCosmetics.includes(item.id);
    const equipped = meta.equippedCosmetic === item.id;
    const canAfford = meta.bankStars >= item.price;

    const row = document.createElement('div');
    row.className = `shop-item ${equipped ? 'equipped' : ''}`;
    row.innerHTML = `
      <div class="item-icon">${item.icon}</div>
      <div class="item-info">
        <strong>${item.name}</strong>
        <small>${item.desc}</small>
      </div>
    `;
    const btn = document.createElement('button');
    btn.type = 'button';
    if (equipped) {
      btn.className = 'buy-btn equipped';
      btn.textContent = 'そうび中';
    } else if (owned) {
      btn.className = 'buy-btn owned';
      btn.textContent = 'そうびする';
    } else {
      btn.className = `buy-btn ${canAfford ? '' : 'disabled'}`;
      btn.textContent = `★ ${item.price}`;
      btn.disabled = !canAfford;
    }
    btn.addEventListener('click', () => {
      sound.init();
      const res = buyOrEquipCosmetic(meta, item.id);
      if (res.ok) {
        saveMeta(meta);
        if (res.action === 'bought') sound.shopBuy();
        else sound.uiClick();
        renderShop();
      }
    });
    row.appendChild(btn);
    shopCosmeticsList.appendChild(row);
  }

  shopUpgradesList.innerHTML = '';
  for (const up of UPGRADES) {
    const lv = meta.upgrades[up.id] || 0;
    const maxed = lv >= up.maxLevel;
    const price = maxed ? 0 : up.prices[lv];
    const canAfford = !maxed && meta.bankStars >= price;

    const pips = Array.from({ length: up.maxLevel }, (_, i) =>
      `<span class="lv-pip ${i < lv ? 'on' : ''}"></span>`
    ).join('');

    const row = document.createElement('div');
    row.className = 'shop-item';
    row.innerHTML = `
      <div class="item-icon">${up.icon}</div>
      <div class="item-info">
        <strong>${up.name} <span style="color:#ea580c">Lv.${lv}/${up.maxLevel}</span></strong>
        <small>${up.desc}</small>
        <div class="lv-pips">${pips}</div>
      </div>
    `;
    const btn = document.createElement('button');
    btn.type = 'button';
    if (maxed) {
      btn.className = 'buy-btn equipped';
      btn.textContent = 'MAX';
      btn.disabled = true;
    } else {
      btn.className = `buy-btn ${canAfford ? '' : 'disabled'}`;
      btn.textContent = `★ ${price}`;
      btn.disabled = !canAfford;
      btn.addEventListener('click', () => {
        sound.init();
        const res = buyUpgrade(meta, up.id);
        if (res.ok) {
          saveMeta(meta);
          sound.shopBuy();
          renderShop();
        }
      });
    }
    row.appendChild(btn);
    shopUpgradesList.appendChild(row);
  }
}

function renderMissions() {
  missionsProgressEl.textContent = `達成 ${meta.completedMissions.length} / ${MISSION_POOL.length}`;
  missionsListEl.innerHTML = '';
  if (meta.activeMissions.length === 0) {
    missionsListEl.innerHTML = `
      <div class="mission-item">
        <div class="item-icon">👑</div>
        <div class="item-info">
          <strong>全ミッション完全制覇！！</strong>
          <small>おめでとう！きみは真の横断歩道レジェンドだ！</small>
        </div>
      </div>`;
    return;
  }
  for (const id of meta.activeMissions) {
    const m = getMissionDef(id);
    if (!m) continue;
    const row = document.createElement('div');
    row.className = 'mission-item';
    row.innerHTML = `
      <div class="item-icon">🎯</div>
      <div class="item-info">
        <strong>${m.text}</strong>
        <small>プレイ中に達成で即時ボーナス</small>
      </div>
      <div class="mission-reward">+${m.reward}★</div>
    `;
    missionsListEl.appendChild(row);
  }
}

function renderStages() {
  stagesUnlockedBadgeEl.textContent = `開放 ${meta.unlockedStage + 1} / ${STAGES.length}`;
  stagesListEl.innerHTML = '';
  for (const st of STAGES) {
    const unlocked = st.id <= meta.unlockedStage;
    const selected = st.id === selectedStartStage;
    const row = document.createElement('div');
    row.className = `stage-item ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`;
    row.innerHTML = `
      <div class="item-icon">${['☀️', '🌇', '🌃', '🌌'][st.id]}</div>
      <div class="item-info">
        <strong>${st.code}：${st.name}</strong>
        <small>${unlocked ? st.subtitle : '前のステージをクリアして解放'}</small>
      </div>
    `;
    const btn = document.createElement('button');
    btn.type = 'button';
    if (!unlocked) {
      btn.className = 'buy-btn disabled';
      btn.textContent = '🔒 未開放';
      btn.disabled = true;
    } else if (selected) {
      btn.className = 'buy-btn equipped';
      btn.textContent = '選択中';
    } else {
      btn.className = 'buy-btn owned';
      btn.textContent = 'えらぶ';
      btn.addEventListener('click', () => {
        sound.init();
        sound.uiClick();
        selectedStartStage = st.id;
        state.stageBlend = st.id;
        syncModeButtons();
        renderStages();
      });
    }
    row.appendChild(btn);
    stagesListEl.appendChild(row);
  }
}

function openShop(from = 'title') {
  sound.init();
  sound.uiClick();
  shopReturnTarget = from;
  renderShop();
  screenTitle.hidden = true;
  screenOver.hidden = true;
  screenShop.hidden = false;
}

function closeShop() {
  sound.uiClick();
  screenShop.hidden = true;
  if (shopReturnTarget === 'gameover') {
    screenOver.hidden = false;
  } else {
    screenTitle.hidden = false;
    syncModeButtons();
  }
}

// ---- Scoring, Missions & Fever ----
function checkMissionsNow() {
  const metrics = {
    stars: state.stats.stars,
    bounces: state.stats.bounces,
    nearMisses: state.stats.nearMisses,
    springs: state.stats.springs,
    smashes: state.stats.smashes,
    maxCombo: state.maxCombo,
    stageReached: state.stats.stageReached,
    score: state.score,
  };
  const completed = evaluateMissions(meta, metrics);
  if (completed.length > 0) {
    saveMeta(meta);
    syncBankUi();
    sound.missionComplete();
    for (const m of completed) {
      state.stats.missionBonusStars += m.reward;
      showMissionToast(m);
    }
  }
}

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
    addPopup(text, x, altitude, color, pts >= 90 ? 22 : 18);
  }

  if (feverAdd > 0 && state.feverTimer <= 0) {
    state.feverGauge = clamp(state.feverGauge + feverAdd, 0, 100);
    if (state.feverGauge >= 100) {
      activateFever();
    }
  }
}

function activateFever() {
  const dur = getUpgradeValue(meta, 'fever') || SCORING.baseFeverDuration;
  state.feverGauge = 100;
  state.feverTimer = dur;
  state.shakeMag = Math.max(state.shakeMag, 9);
  sound.feverStart();
  sound.playTrack('fever');
  showBanner('🌈 カニ無双 FEVER!! 車をふきとばせ！', 2.8, 'fever');
  addPopup('FEVER!!', state.playerX + 10, state.player.altitude + 76, '#f472b6', 26);
  spawnParticles(state.playerX, state.player.altitude + 28, 30, {
    colors: ['#f43f5e', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#a855f7'],
    speedMin: 90,
    speedMax: 330,
    upMin: 80,
    upMax: 330,
    sizeMin: 5,
    sizeMax: 10,
    lifeMin: 0.45,
    lifeMax: 0.85,
    shape: 'star',
  });
}

function advanceStage() {
  const nextIdx = Math.min(STAGES.length - 1, state.stageIndex + 1);
  state.stageMeters = 0;

  if (nextIdx > state.stageIndex) {
    state.stageIndex = nextIdx;
    state.stats.stageReached = Math.max(state.stats.stageReached, state.stageIndex + 1);
    if (state.stageIndex > meta.unlockedStage) {
      meta.unlockedStage = state.stageIndex;
      saveMeta(meta);
    }
  }

  const st = STAGES[state.stageIndex];
  state.celebrationFlash = 1.0;
  state.shakeMag = Math.max(state.shakeMag, 7);
  sound.stageClear();
  if (state.feverTimer <= 0) {
    sound.playTrack(st.bgm);
  }
  addBonusScore(SCORING.stageClear, '🎊 STAGE CLEAR!', state.playerX + 40, 145, '#fde047', 24, true);
  showBanner(`✨ ${st.code}：${st.name} 突入！`, 3.0, 'stage');

  // Shield Lv.3 restores bubble shield on stage clear!
  if (getUpgradeValue(meta, 'shield') >= 3 && !state.player.hasShield) {
    state.player.hasShield = true;
    hudShieldEl.hidden = false;
    addPopup('🫧 バリア復活!', state.playerX, state.player.altitude + 92, '#38bdf8', 19);
  }

  spawnParticles(state.playerX + 80, 120, 32, {
    colors: ['#facc15', '#38bdf8', '#f472b6', '#4ade80', '#ffffff'],
    speedMin: 100,
    speedMax: 340,
    upMin: 80,
    upMax: 320,
    sizeMin: 5,
    sizeMax: 10,
    lifeMin: 0.5,
    lifeMax: 0.95,
    shape: 'star',
  });
  checkMissionsNow();
}

// ---- Actions ----
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
    p.spinVel = 12.8;
    sound.doubleJump();
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
    p.scaleX = 0.76;
    p.scaleY = 1.3;
    sound.dive();
    spawnParticles(state.playerX, p.altitude + 30, 7, {
      colors: ['#7dd3fc', '#ffffff'],
      speedMin: 20,
      speedMax: 85,
      upMin: 80,
      upMax: 190,
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
  state.stageIndex = selectedStartStage;
  state.stageBlend = selectedStartStage;
  state.stageMeters = 0;
  state.speed = cfg.startSpeed + selectedStartStage * 24;
  state.camY = 0;
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
  state.celebrationFlash = 0;
  state.goTextTimer = 0;
  state.nextSpawnDist = 420;
  state.obstacles = [];
  state.collectibles = [];
  state.particles = [];
  state.popups = [];
  state.trail = [];
  state.stats = {
    jumpsOver: 0,
    bounces: 0,
    springs: 0,
    nearMisses: 0,
    stars: 0,
    smashes: 0,
    stageReached: selectedStartStage + 1,
    missionBonusStars: 0,
  };

  const startWithShield = getUpgradeValue(meta, 'shield') >= 1;
  Object.assign(state.player, {
    altitude: 0,
    prevAltitude: 0,
    vy: 0,
    grounded: true,
    jumpsUsed: 0,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    jumpHeld: false,
    hasShield: startWithShield,
    invulnTimer: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    spinVel: 0,
  });

  hideBanner();
  toastEl.hidden = true;
  syncHeartsHud();
  syncBankUi();
  hudBestEl.textContent = bestScores[modeId].toLocaleString();
  hudStarsEl.textContent = '0';
  hudShieldEl.hidden = !startWithShield;
  hudComboEl.hidden = true;
  hudFeverFillEl.style.width = '0%';
  hudFeverWrapEl.classList.remove('active');
}

function setPhase(nextPhase) {
  state.phase = nextPhase;
  hudEl.dataset.phase = nextPhase;

  screenTitle.hidden = nextPhase !== 'title';
  screenShop.hidden = true;
  screenMissions.hidden = true;
  screenStages.hidden = true;
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
  state.countdownTimer = 0.58;
  state.countdownStep = 3;
  showCountdownText('3');
  sound.countdown(false);
  sound.playTrack(STAGES[state.stageIndex].bgm);
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
  sound.playTrack(state.feverTimer > 0 ? 'fever' : STAGES[state.stageIndex].bgm);
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

  // Bank collected stars & lifetime stats!
  const earnedStars = state.stats.stars;
  meta.bankStars += earnedStars;
  meta.lifetime.runs++;
  meta.lifetime.totalStars += earnedStars;
  meta.lifetime.totalBounces += state.stats.bounces;
  meta.lifetime.totalSmashes += state.stats.smashes;
  saveMeta(meta);
  syncBankUi();

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
  const totalBanked = earnedStars + state.stats.missionBonusStars;
  overEarnedStarsEl.textContent = `★ +${totalBanked.toLocaleString()} 獲得！`;

  statStageEl.textContent = `STAGE ${state.stats.stageReached}`;
  statBouncesEl.textContent = state.stats.bounces;
  statNearMissEl.textContent = state.stats.nearMisses;
  statStarsEl.textContent = state.stats.stars;
  statComboEl.textContent = state.maxCombo;
  statSmashEl.textContent = state.stats.smashes;
}

function takeHit(ob) {
  const p = state.player;
  if (p.hasShield) {
    p.hasShield = false;
    p.invulnTimer = 1.1;
    hudShieldEl.hidden = true;
    state.hitstopTimer = 0.055;
    state.shakeMag = 9;
    sound.shieldBreak();
    addPopup('🫧 バリアガード!', state.playerX, p.altitude + 68, '#38bdf8', 20);
    spawnParticles(state.playerX, p.altitude + 28, 18, {
      colors: ['#38bdf8', '#e0f2fe', '#c084fc'],
      speedMin: 70,
      speedMax: 240,
      upMin: 40,
      upMax: 200,
      sizeMin: 4,
      sizeMax: 8,
    });
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
    p.vy = Math.max(p.vy, 380);
    p.grounded = false;
  }
}

// ---- Update Simulation ----
function updatePlayer(dt) {
  const p = state.player;
  p.prevAltitude = p.altitude;
  if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
  if (p.jumpBufferTimer > 0) p.jumpBufferTimer = Math.max(0, p.jumpBufferTimer - dt);

  if (p.grounded) {
    p.coyoteTimer = PHYSICS.coyoteTime;
  } else {
    p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
  }

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

      if (p.jumpBufferTimer > 0) {
        executeJump(false);
      }
    }
  }

  const damp = 1 - Math.exp(-15 * dt);
  p.scaleX += (1 - p.scaleX) * damp;
  p.scaleY += (1 - p.scaleY) * damp;

  if (Math.abs(p.spinVel) > 0.1) {
    p.rotation += p.spinVel * dt;
    if (p.rotation >= Math.PI * 2) {
      p.rotation = 0;
      p.spinVel = 0;
    }
  } else if (!p.grounded) {
    const targetRot = clamp(-p.vy / 2600, -0.24, 0.26);
    p.rotation += (targetRot - p.rotation) * damp;
  } else {
    p.rotation += (0 - p.rotation) * damp;
  }

  // Smooth vertical camera pan upward when flying high on springboard sky routes!
  const targetCamY = p.altitude > 130 ? clamp((p.altitude - 130) * 0.52, 0, 118) : 0;
  state.camY += (targetCamY - state.camY) * (1 - Math.exp(-7 * dt));

  if (state.feverTimer > 0) {
    state.trail.push({ x: state.playerX, altitude: p.altitude });
    if (state.trail.length > 9) state.trail.shift();
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
    showBanner('🚦 信号点滅！まもなくラッシュ！', 2.8);
  } else if (state.rushState === 'warn' && state.rushTimer <= 0) {
    state.rushState = 'active';
    state.rushTimer = SCORING.rushDuration;
    sound.signalWarn();
    showBanner('🔥 ラッシュタイム！スコア 1.5倍！', 2.6);
  } else if (state.rushState === 'active' && state.rushTimer <= 0) {
    state.rushState = 'normal';
    state.rushTimer = SCORING.rushInterval;
    addBonusScore(SCORING.rushClear, '🚦 ラッシュ突破!', state.playerX + 40, 125, '#4ade80', 20, true);
    sound.jumpOver();
  }
}

function updateWorld(dt) {
  state.time += dt;
  state.shakeMag = Math.max(0, state.shakeMag - dt * 36);
  state.damageFlash = Math.max(0, state.damageFlash - dt * 3.2);
  state.celebrationFlash = Math.max(0, state.celebrationFlash - dt * 2.2);

  if (state.bannerTimer > 0) {
    state.bannerTimer -= dt;
    if (state.bannerTimer <= 0) bannerEl.hidden = true;
  }
  if (state.toastTimer > 0) {
    state.toastTimer -= dt;
    if (state.toastTimer <= 0) toastEl.hidden = true;
  }
  if (state.goTextTimer > 0) {
    state.goTextTimer -= dt;
    if (state.goTextTimer <= 0 && state.phase === 'playing') {
      countdownEl.hidden = true;
    }
  }

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
    state.scrollDist += 115 * dt;
    // Gently preview selected start stage in the live diorama behind title
    state.stageBlend += (selectedStartStage - state.stageBlend) * (1 - Math.exp(-3.5 * dt));
    return;
  }

  if (state.phase === 'countdown') {
    state.scrollDist += state.speed * 0.55 * dt;
    updatePlayer(dt);
    state.countdownTimer -= dt;
    if (state.countdownTimer <= 0) {
      state.countdownStep--;
      if (state.countdownStep >= 1) {
        state.countdownTimer = 0.58;
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

  if (state.phase !== 'playing') return;

  if (state.hitstopTimer > 0) {
    state.hitstopTimer -= dt;
    return;
  }

  state.elapsed += dt;
  // Smooth biome visual blend toward current stageIndex
  state.stageBlend += (state.stageIndex - state.stageBlend) * (1 - Math.exp(-0.9 * dt));

  if (state.feverTimer > 0) {
    const feverMax = getUpgradeValue(meta, 'fever') || SCORING.baseFeverDuration;
    state.feverTimer -= dt;
    state.feverGauge = clamp((state.feverTimer / feverMax) * 100, 0, 100);
    if (state.feverTimer <= 0) {
      state.feverTimer = 0;
      state.feverGauge = 0;
      state.player.invulnTimer = Math.max(state.player.invulnTimer, 1.0);
      sound.playTrack(STAGES[state.stageIndex].bgm);
    }
  }

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
  state.speed = computeWorldSpeed(state.elapsed, state.mode, state.stageIndex, isRush, isFever);
  sound.setTempoMultiplier(1 + (state.speed - 320) / 1450);

  const stepDist = state.speed * dt;
  state.scrollDist += stepDist;
  state.stageMeters += stepDist / 26;
  if (state.stageMeters >= SCORING.stageLengthMeters) {
    advanceStage();
  }

  const modeMult = MODES[state.mode].scoreMult;
  const rushMult = isRush ? 1.5 : 1.0;
  state.scoreFloat += SCORING.distancePerSec * modeMult * rushMult * dt;
  state.score = Math.floor(state.scoreFloat);

  updatePlayer(dt);

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
    const spawnX = Math.max(state.viewW + 90, state.playerX + 540);
    const pattern = generatePattern({
      spawnX,
      elapsed: state.elapsed,
      speed: state.speed,
      stageIndex: state.stageIndex,
      isRush,
      lives: state.lives,
      maxLives: state.maxLives,
      hasShield: state.player.hasShield,
      shieldUpgradeLv: meta.upgrades.shield || 0,
    });
    state.obstacles.push(...pattern.obstacles);
    state.collectibles.push(...pattern.collectibles);
    state.nextSpawnDist = pattern.nextGap;
  }

  const crabBox = getCrabHitbox(state.playerX, state.player.altitude);
  const magnetRadius = getUpgradeValue(meta, 'magnet');
  const crabCenterY = state.player.altitude + 24;

  // Collectibles (+ Star Magnet attraction!)
  for (let i = state.collectibles.length - 1; i >= 0; i--) {
    const c = state.collectibles[i];
    c.x -= stepDist;
    if (c.x < -80) {
      state.collectibles.splice(i, 1);
      continue;
    }
    if (c.collected) continue;

    if (c.type === 'star' && magnetRadius > 0) {
      const dx = state.playerX - c.x;
      const dy = crabCenterY - c.airY;
      const dist = Math.hypot(dx, dy);
      if (dist < magnetRadius && dist > 1) {
        const pull = (1 - dist / magnetRadius) * 620 * dt;
        c.x += (dx / dist) * pull;
        c.airY += (dy / dist) * pull;
      }
    }

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
        checkMissionsNow();
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
          addBonusScore(120, '❤️ ボーナス', c.x, c.airY + 24, '#fb7185', 20, false);
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

  // Obstacles (+ Springboard, Stomp Bounce, Telegraph & Smash!)
  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    const ob = state.obstacles[i];

    if (ob.squash > 0) ob.squash = Math.max(0, ob.squash - dt * 5.2);

    if (ob.smashed) {
      ob.x += ob.vx * dt;
      ob.airY += ob.vy * dt;
      ob.vy -= 1400 * dt;
      ob.rot += ob.vrot * dt;
      if (ob.x > state.viewW + 260 || ob.airY < -200) {
        state.obstacles.splice(i, 1);
      }
      continue;
    }

    ob.x -= stepDist * ob.speedMult;
    ob.wheelPhase -= (dt * state.speed * ob.speedMult) / 14;

    // Danger telegraph audio cue right before fast hazard enters viewport
    const spec = OBSTACLE_SPECS[ob.kind];
    if (spec.telegraph && !ob.telegraphDone && ob.x < state.viewW + 210 && ob.x > state.viewW) {
      ob.telegraphDone = true;
      sound.telegraph();
    }

    if (ob.x + ob.w < -140) {
      state.obstacles.splice(i, 1);
      continue;
    }

    const obBox = getObstacleHitbox(ob);

    // Track horizontal proximity
    const horizNear = obBox.left < crabBox.right + 18 && obBox.right > crabBox.left - 18;
    if (horizNear && !spec.isSpring) {
      const dist = rectDistance(crabBox, obBox);
      if (dist < ob.minClearance) ob.minClearance = dist;
      if (crabBox.bottom >= obBox.top - 4 && obBox.left < crabBox.right && obBox.right > crabBox.left) {
        ob.jumpedOver = true;
      }
    }

    if (rectsOverlap(crabBox, obBox)) {
      // 1. Beach-Ball Springboard!
      if (spec.isSpring) {
        if (!ob.bounced) {
          ob.bounced = true;
          ob.squash = 1.0;
          const p = state.player;
          p.altitude = Math.max(p.altitude, obBox.top + 2);
          p.vy = PHYSICS.springBounceVy;
          p.grounded = false;
          p.jumpsUsed = 0; // Fresh double jump mid-air!
          p.scaleX = 0.74;
          p.scaleY = 1.32;
          p.spinVel = 14;
          state.stats.springs++;
          state.shakeMag = Math.max(state.shakeMag, 6);
          sound.springLaunch();
          addBonusScore(SCORING.stompBounce, '🚀 SKY JUMP!', state.playerX + 10, p.altitude + 68, '#38bdf8', 16, true);
          state.particles.push({
            x: ob.x + ob.w * 0.5,
            altitude: ob.h,
            vx: -30,
            vy: 0,
            size: 22,
            color: '#facc15',
            shape: 'ring',
            gravity: 0,
            rot: 0,
            vrot: 0,
            life: 0.38,
            maxLife: 0.38,
          });
          spawnParticles(ob.x + ob.w * 0.5, ob.h, 16, {
            colors: ['#f43f5e', '#facc15', '#38bdf8', '#ffffff'],
            speedMin: 80,
            speedMax: 240,
            upMin: 80,
            upMax: 260,
            sizeMin: 4,
            sizeMax: 9,
            shape: 'star',
          });
          checkMissionsNow();
        }
        continue;
      }

      // 2. Fever Smash!
      if (isFever) {
        ob.smashed = true;
        ob.vx = 540 + Math.random() * 240;
        ob.vy = 470 + Math.random() * 220;
        ob.vrot = 9 + Math.random() * 6;
        state.stats.smashes++;
        state.hitstopTimer = 0.04;
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
        checkMissionsNow();
        continue;
      }

      // 3. Heroic Roof Stomp Bounce!
      if (!ob.bounced && isStompBounce(state.player.prevAltitude, state.player.vy, obBox, ob)) {
        ob.bounced = true;
        ob.cleared = true;
        ob.squash = 1.0;
        const p = state.player;
        p.altitude = obBox.top + 3;
        p.vy = PHYSICS.stompBounceVy;
        p.grounded = false;
        p.jumpsUsed = 0; // Rewards skilled play with a fresh double jump!
        p.scaleX = 1.28;
        p.scaleY = 0.74;
        p.spinVel = 11.5;
        state.stats.bounces++;
        state.hitstopTimer = 0.036;
        state.shakeMag = Math.max(state.shakeMag, 6.5);
        sound.stompBounce();
        addBonusScore(
          SCORING.stompBounce,
          '⚡ BOUNCE!',
          state.playerX + 8,
          p.altitude + 68,
          '#fb923c',
          SCORING.feverFromBounce,
          true,
        );
        state.particles.push({
          x: state.playerX,
          altitude: obBox.top + 4,
          vx: -40,
          vy: 0,
          size: 20,
          color: '#fef08a',
          shape: 'ring',
          gravity: 0,
          rot: 0,
          vrot: 0,
          life: 0.32,
          maxLife: 0.32,
        });
        spawnParticles(state.playerX, obBox.top + 4, 14, {
          colors: ['#facc15', '#fb923c', '#ffffff'],
          speedMin: 70,
          speedMax: 220,
          upMin: 60,
          upMax: 220,
          sizeMin: 4,
          sizeMax: 8,
          shape: 'star',
        });
        checkMissionsNow();
        continue;
      }

      // 4. Otherwise take hit (if not invulnerable)
      if (state.player.invulnTimer <= 0 && !ob.bounced) {
        takeHit(ob);
        if (state.phase === 'gameover') return;
      }
      continue;
    }

    // Passed cleanly behind the crab!
    if (!ob.cleared && !spec.isSpring && obBox.right < crabBox.left) {
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
        checkMissionsNow();
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
        checkMissionsNow();
      }
    }
  }
}

function updateHud() {
  hudScoreEl.textContent = state.score.toLocaleString();
  hudBestEl.textContent = Math.max(bestScores[state.mode], state.score).toLocaleString();
  hudStarsEl.textContent = state.stats.stars.toLocaleString();

  const st = STAGES[state.stageIndex];
  hudStageEl.textContent = state.rushState === 'active'
    ? `🔥 ${st.code} ラッシュ中！`
    : `${st.code} ${st.name}`;
  const pct = clamp((state.stageMeters / SCORING.stageLengthMeters) * 100, 0, 100);
  hudStageFillEl.style.width = `${pct.toFixed(1)}%`;

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
function isModalOpen() {
  return !screenShop.hidden || !screenMissions.hidden || !screenStages.hidden;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const code = e.code;

  if (code === 'Escape') {
    if (!screenShop.hidden) { closeShop(); return; }
    if (!screenMissions.hidden) { screenMissions.hidden = true; screenTitle.hidden = false; return; }
    if (!screenStages.hidden) { screenStages.hidden = true; screenTitle.hidden = false; return; }
  }

  if (isModalOpen()) return;

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

// Title & Modal Buttons
modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    sound.init();
    sound.uiClick();
    selectedMode = btn.dataset.mode;
    writeStorage(STORAGE_KEYS.mode, selectedMode);
    syncModeButtons();
  });
});

$('btn-open-shop').addEventListener('click', () => openShop('title'));
$('btn-over-shop').addEventListener('click', () => openShop('gameover'));
$('btn-close-shop').addEventListener('click', closeShop);

tabCosmetics.addEventListener('click', () => {
  sound.uiClick();
  tabCosmetics.classList.add('active');
  tabUpgrades.classList.remove('active');
  shopCosmeticsList.hidden = false;
  shopUpgradesList.hidden = true;
});

tabUpgrades.addEventListener('click', () => {
  sound.uiClick();
  tabUpgrades.classList.add('active');
  tabCosmetics.classList.remove('active');
  shopCosmeticsList.hidden = true;
  shopUpgradesList.hidden = false;
});

$('btn-open-missions').addEventListener('click', () => {
  sound.init();
  sound.uiClick();
  renderMissions();
  screenTitle.hidden = true;
  screenMissions.hidden = false;
});
$('btn-close-missions').addEventListener('click', () => {
  sound.uiClick();
  screenMissions.hidden = true;
  screenTitle.hidden = false;
});

$('btn-open-stages').addEventListener('click', () => {
  sound.init();
  sound.uiClick();
  renderStages();
  screenTitle.hidden = true;
  screenStages.hidden = false;
});
$('btn-close-stages').addEventListener('click', () => {
  sound.uiClick();
  screenStages.hidden = true;
  screenTitle.hidden = false;
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

window.__kaniDX = {
  state,
  meta,
  startGame,
  pressJump,
  releaseJump,
  triggerDive,
  activateFever,
  advanceStage,
  step: (seconds) => {
    const dt = 1 / 60;
    const steps = Math.max(1, Math.round(seconds / dt));
    for (let i = 0; i < steps; i++) updateWorld(dt);
    updateHud();
    renderer.render(state);
  },
};

requestAnimationFrame(loop);
