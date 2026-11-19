export const MODES = {
  normal: {
    id: 'normal',
    label: 'ノーマル',
    desc: 'ハート3つでじっくり挑戦',
    lives: 3,
    scoreMult: 1.0,
    startSpeed: 310,
    maxSpeed: 640,
  },
  challenge: {
    id: 'challenge',
    label: 'チャレンジ',
    desc: '一発勝負・スコア 1.5倍！',
    lives: 1,
    scoreMult: 1.5,
    startSpeed: 350,
    maxSpeed: 720,
  },
};

export const PHYSICS = {
  gravity: 2150,
  cutGravityMult: 2.45,
  jumpVy: 730,
  doubleJumpVy: 665,
  fastFallVy: -940,
  coyoteTime: 0.095,
  jumpBufferTime: 0.15,
  invulnDuration: 1.55,
};

export const CRAB = {
  visualW: 74,
  visualH: 56, // 925:699 aspect ratio (~1.32)
  hitW: 42,
  hitH: 40,
};

export const SCORING = {
  distancePerSec: 12,
  jumpOver: 25,
  nearMiss: 35,
  star: 30,
  smash: 60,
  rushClear: 120,
  comboTimeout: 3.4,
  maxComboMult: 5,
  feverDuration: 7.5,
  feverFromStar: 12,
  feverFromJumpOver: 14,
  feverFromNearMiss: 18,
  rushInterval: 26, // seconds between crosswalk signal rushes
  rushWarnDuration: 3.2,
  rushDuration: 10.0,
};

export const OBSTACLE_SPECS = {
  cone: {
    kind: 'cone',
    w: 36,
    h: 44,
    hitPadX: 6,
    hitPadTop: 6,
    speedMult: 1.0,
    airY: 0,
    canSmash: true,
  },
  car: {
    kind: 'car',
    w: 108,
    h: 58,
    hitPadX: 10,
    hitPadTop: 8,
    speedMult: 1.12,
    airY: 0,
    canSmash: true,
    colors: ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#f8fafc'],
  },
  sport: {
    kind: 'sport',
    w: 118,
    h: 46,
    hitPadX: 10,
    hitPadTop: 7,
    speedMult: 1.32,
    airY: 0,
    canSmash: true,
    colors: ['#f97316', '#06b6d4', '#e11d48', '#eab308', '#6366f1'],
  },
  truck: {
    kind: 'truck',
    w: 168,
    h: 100,
    hitPadX: 12,
    hitPadTop: 10,
    speedMult: 1.04,
    airY: 0,
    canSmash: true,
    colors: ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#475569'],
  },
  bird: {
    kind: 'bird',
    w: 48,
    h: 30,
    hitPadX: 8,
    hitPadTop: 6,
    speedMult: 1.24,
    airY: 70, // Safe to stay on ground underneath, or double-jump over!
    canSmash: true,
  },
};

// Smooth day -> sunset -> night -> dawn cycle palettes
export const SKY_KEYFRAMES = [
  {
    name: '昼の横断歩道',
    skyTop: [72, 168, 248],
    skyBot: [194, 234, 255],
    sunColor: [255, 242, 176],
    farCity: [130, 174, 214],
    midCity: [98, 144, 188],
    windowAlpha: 0.0,
    starAlpha: 0.0,
    lampGlow: 0.0,
    headlightAlpha: 0.0,
    cloudColor: [255, 255, 255],
  },
  {
    name: '夕焼けの帰り道',
    skyTop: [82, 62, 142],
    skyBot: [255, 152, 96],
    sunColor: [255, 196, 108],
    farCity: [118, 78, 122],
    midCity: [78, 52, 92],
    windowAlpha: 0.55,
    starAlpha: 0.25,
    lampGlow: 0.5,
    headlightAlpha: 0.45,
    cloudColor: [255, 204, 178],
  },
  {
    name: '星空のナイトクロス',
    skyTop: [14, 20, 56],
    skyBot: [42, 58, 118],
    sunColor: [242, 246, 255],
    farCity: [28, 38, 76],
    midCity: [19, 27, 56],
    windowAlpha: 0.95,
    starAlpha: 1.0,
    lampGlow: 1.0,
    headlightAlpha: 0.9,
    cloudColor: [84, 102, 156],
  },
  {
    name: '朝焼けのシーサイド',
    skyTop: [56, 108, 186],
    skyBot: [255, 204, 176],
    sunColor: [255, 230, 160],
    farCity: [116, 134, 174],
    midCity: [86, 108, 148],
    windowAlpha: 0.25,
    starAlpha: 0.15,
    lampGlow: 0.25,
    headlightAlpha: 0.2,
    cloudColor: [255, 236, 224],
  },
];

export const RANKS = [
  { minScore: 4500, grade: 'S+', title: '伝説の横断歩道マスター', color: '#facc15' },
  { minScore: 3000, grade: 'S', title: 'マッハポンポンガニ', color: '#fb923c' },
  { minScore: 1800, grade: 'A', title: 'ハサミさばき達人', color: '#38bdf8' },
  { minScore: 900, grade: 'B', title: 'リズム横歩きカニ', color: '#4ade80' },
  { minScore: 350, grade: 'C', title: 'げんきなカニ1号', color: '#c084fc' },
  { minScore: 0, grade: 'D', title: 'おさんぽデビュー', color: '#94a3b8' },
];

export const STORAGE_KEYS = {
  bestNormal: 'kani-dx-best-normal',
  bestChallenge: 'kani-dx-best-challenge',
  bgmOn: 'kani-dx-bgm',
  sfxOn: 'kani-dx-sfx',
  mode: 'kani-dx-mode',
};
