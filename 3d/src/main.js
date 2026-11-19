import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { unlockAudio, setSfxOn, isSfxOn, setBgmOn, isBgmOn, sfx, bgm } from './audio.js';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const MODEL_URLS = {
  kani: new URL('./models/kani.glb', import.meta.url).href,
  car: new URL('./models/car.glb', import.meta.url).href,
  truck: new URL('./models/truck.glb', import.meta.url).href,
  star: new URL('./models/star.glb', import.meta.url).href,
  stage: new URL('./models/stage.glb', import.meta.url).href,
};

const LANES = [-2.4, 0, 2.4];
const GRAVITY = 30;
const JUMP_VELOCITY = 13; // 滞空 約 0.87 秒 / 最高 約 2.8 (トラック 3.2 は越えられない)
const LANE_SPEED = 26; // 横歩きの速さ (単位/秒)
const COUNTDOWN_STEP = 0.65; // カウントダウン 1 つぶんの秒数
const PUPIL_RANGE = 0.05; // 黒目が転がれる半径 (目の中)
const JUMP_BUFFER = 0.14; // 着地直前の入力を受け付ける猶予 (秒)

// 当たり判定 (見た目より少し小さめにして遊びやすくする)
const CRAB = { halfX: 0.6, halfZ: 0.45, height: 1.0 };
const VEHICLE_TYPES = {
  car: { halfX: 0.72, halfZ: 1.45, height: 1.25, colors: [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xf5f5f5, 0x8e24aa, 0xfb8c00, 0x37474f] },
  truck: { halfX: 0.85, halfZ: 2.65, height: 3.2, colors: [0x1565c0, 0x2e7d32, 0xc62828, 0xf9a825, 0x6d4c41] },
};
const STAR_RADIUS = 0.55;

const SPAWN_Z = -95;
const DESPAWN_Z = 18;
const START_SPEED = 14;
const MAX_SPEED = 30;

const SCORE_DODGE = 1;
const SCORE_JUMP = 3;
const SCORE_STAR = 5;

const STORAGE_BEST = 'kani-jump-best';
const STORAGE_MUTED = 'kani-jump-muted'; // 効果音オフ
const STORAGE_BGM_OFF = 'kani-jump-bgm-off';

const THEMES = {
  day: {
    fog: 0xc5e5fc,
    hemiSky: 0xd8ecff, hemiGround: 0x52603e, hemi: 1.45,
    sun: 0xfff1dc, sunI: 2.9,
    lamp: 0,
    env: 0.28,
    fiber: 1,
  },
  night: {
    fog: 0x31417d,
    hemiSky: 0x6170b8, hemiGround: 0x1b1d30, hemi: 0.75,
    sun: 0xa9bcff, sunI: 0.75,
    lamp: 26,
    env: 0.12,
    fiber: 0.45,
  },
};

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const damp = (cur, target, lambda, dt) => THREE.MathUtils.lerp(cur, target, 1 - Math.exp(-lambda * dt));

function storageGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* プライベートモードなどでは保存しない */
  }
}

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/**
 * glTF のシーンを「マテリアルごとに 1 メッシュ」へまとめて描画負荷を下げる。
 * keep に名前のあるノード以下は別グループとして、そのノードの位置を軸に残す。
 */
function bake(root, keep = []) {
  root.updateMatrixWorld(true);
  const out = new THREE.Group();

  const collect = (node, base) => {
    const inv = base.matrixWorld.clone().invert();
    const buckets = new Map();
    node.traverse((o) => {
      if (!o.isMesh) return;
      // keep 対象の子孫はここでは集めない
      for (let p = o; p && p !== node; p = p.parent) if (keep.includes(p.name)) return;
      const g = o.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const mat = o.material;
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat).push(g);
    });
    const group = new THREE.Group();
    for (const [mat, geos] of buckets) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      mesh.name = mat.name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  };

  out.add(collect(root, root));
  for (const name of keep) {
    const node = root.getObjectByName(name);
    if (!node) continue;
    const pivot = collect(node, node);
    pivot.name = name;
    node.matrixWorld.decompose(pivot.position, pivot.quaternion, pivot.scale);
    out.add(pivot);
  }
  return out;
}

// ---------------------------------------------------------------------------
// レンダラー・シーン
// ---------------------------------------------------------------------------

const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  showError('この端末では 3D 表示（WebGL）が使えないため、ゲームを開始できません。');
  throw err;
}
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(THEMES.day.fog, 32, 92);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

// 目玉のドームや車のツヤに映り込む、ぼんやりした室内の光
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const hemi = new THREE.HemisphereLight();
scene.add(hemi);

const sun = new THREE.DirectionalLight();
sun.position.set(9, 22, 12);
sun.target.position.set(0, 0, -12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 34, bottom: -22, near: 1, far: 80 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// 夜にカニを照らす街灯の光
const lampLight = new THREE.PointLight(0xffc77a, 0, 18, 1.6);
lampLight.position.set(0, 5.5, 2.5);
scene.add(lampLight);

function applyTheme() {
  const t = darkQuery.matches ? THEMES.night : THEMES.day;
  scene.fog.color.setHex(t.fog);
  hemi.color.setHex(t.hemiSky);
  hemi.groundColor.setHex(t.hemiGround);
  hemi.intensity = t.hemi;
  sun.color.setHex(t.sun);
  sun.intensity = t.sunI;
  lampLight.intensity = t.lamp;
  scene.environmentIntensity = t.env;
  if (crab.fibers) crab.fibers.material.color.setScalar(t.fiber);
}
darkQuery.addEventListener('change', applyTheme);

// ---------------------------------------------------------------------------
// 素材
// ---------------------------------------------------------------------------

const assets = {};

async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const names = Object.keys(MODEL_URLS);
  let done = 0;
  await Promise.all(
    names.map(async (name) => {
      const gltf = await loader.loadAsync(MODEL_URLS[name]);
      assets[name] = gltf.scene;
      done += 1;
      onProgress(done / names.length);
    }),
  );
}

// ---------------------------------------------------------------------------
// ゲームオブジェクト
// ---------------------------------------------------------------------------

const crab = {
  root: new THREE.Group(), // 位置 (レーン移動・ジャンプ)
  body: null, // 見た目 (傾き・伸び縮み)
  clawR: null,
  clawL: null,
  pupils: [], // 動く目の黒目 { group, p, v, spinDir }
  furShells: [], // 毛の層 { mesh, h, baseY }
  fibers: null, // はみ出した毛羽
  shadow: null, // 足もとの丸い影
  vel: new THREE.Vector2(), // 見た目の速度 (毛と黒目の揺れに使う)
  prevPos: new THREE.Vector2(),
  prevVel: new THREE.Vector2(),
  lane: 1,
  x: 0,
  y: 0,
  vy: 0,
  airborne: false,
  tilt: 0,
  squash: 0,
  jumpBufferedAt: -1,
  spin: 0,
};

const vehicles = [];
const vehiclePool = { car: [], truck: [] };
const stars = [];
const starPool = [];

// ---------------------------------------------------------------------------
// 毛糸のポンポン (ファーシェル: 少しずつ大きい球を重ね、外側ほど毛をまばらにする)
// ---------------------------------------------------------------------------

const POMPOM = { y: 0.62, radius: 0.62, length: 0.12, layers: 20 };

function makeFurTexture(size = 128) {
  // 1 画素 = 毛 1 本。値がその毛の長さ (0〜1)。0 は毛のないすき間
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.random() < 0.88 ? Math.floor(255 * Math.random() ** 0.55) : 0;
    data.set([v, v, v, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 4.5);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function addPompomFur(group) {
  const tex = makeFurTexture();
  const geo = new THREE.SphereGeometry(1, 40, 28);
  const root = new THREE.Color('#cdb661'); // 根元は影になって濃い
  const tip = new THREE.Color('#fcf5c6'); // 毛先は淡いクリーム色
  const fur = new THREE.Group();
  fur.name = 'Fur';
  for (let i = 1; i <= POMPOM.layers; i++) {
    const h = i / POMPOM.layers;
    const mat = new THREE.MeshStandardMaterial({
      color: root.clone().lerp(tip, Math.min(1, h * 1.4)),
      roughness: 1,
      alphaMap: tex,
      alphaTest: h * 0.92, // この長さより短い毛は描かない → 外側ほどまばら
    });
    const shell = new THREE.Mesh(geo, mat);
    shell.scale.setScalar(POMPOM.radius + POMPOM.length * h);
    // 毛先はほんの少し下に垂れる
    shell.position.set(0, POMPOM.y - POMPOM.length * 0.25 * h * h, 0);
    shell.receiveShadow = true;
    fur.add(shell);
    crab.furShells.push({ mesh: shell, h, baseY: shell.position.y });
  }
  fur.add(makeStrayFibers());
  group.add(fur);
}

// 毛玉の表面からはみ出す細い毛羽。写真のように赤い糸くずも少し混ぜる
function makeStrayFibers(count = 380) {
  const pos = new Float32Array(count * 6);
  const col = new Float32Array(count * 6);
  const cream = new THREE.Color('#f7efc4');
  const red = new THREE.Color('#c0262c');
  const dir = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const tip = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    dir.randomDirection();
    tangent.randomDirection().cross(dir).normalize();
    const r = POMPOM.radius + POMPOM.length * rand(0.4, 0.8);
    const len = rand(0.03, 0.08);
    const root = dir.clone().multiplyScalar(r);
    tip.copy(dir).multiplyScalar(0.7).addScaledVector(tangent, 0.3).normalize().multiplyScalar(len).add(root);
    tip.y -= len * 0.25; // 少し垂れる
    pos.set([root.x, root.y + POMPOM.y, root.z, tip.x, tip.y + POMPOM.y, tip.z], i * 6);
    const c = Math.random() < 0.025 ? red : cream;
    const shade = rand(0.9, 1);
    col.set([c.r * shade, c.g * shade, c.b * shade, c.r * shade, c.g * shade, c.b * shade], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }));
  lines.name = 'Fibers';
  crab.fibers = lines;
  return lines;
}

// ---------------------------------------------------------------------------
// 足もとの丸い影と、土ぼこり
// ---------------------------------------------------------------------------

function makeBlobShadow() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  mesh.renderOrder = 1;
  return mesh;
}

const dust = [];
const dustGeo = new THREE.IcosahedronGeometry(0.11, 1);

function spawnDust(x, count, dirX = 0) {
  if (reducedMotionQuery.matches) return;
  for (let i = 0; i < count; i++) {
    let d = dust.find((p) => !p.alive);
    if (!d) {
      const mesh = new THREE.Mesh(dustGeo, new THREE.MeshStandardMaterial({ color: 0xe9e3d6, roughness: 1, transparent: true, depthWrite: false }));
      d = { mesh, vel: new THREE.Vector3(), life: 0, alive: false };
      dust.push(d);
      scene.add(mesh);
    }
    const a = dirX === 0 ? (i / count) * Math.PI * 2 + rand(0.4) : Math.PI / 2 + rand(-0.9, 0.9);
    const speed = rand(1.2, 2.2);
    d.vel.set(Math.cos(a) * speed - dirX * 1.5, rand(0.4, 1.0), Math.sin(a) * speed * 0.6);
    d.mesh.position.set(x + Math.cos(a) * 0.5, 0.12, Math.sin(a) * 0.35);
    d.life = 0;
    d.alive = true;
    d.mesh.visible = true;
  }
}

function updateDust(dt) {
  for (const d of dust) {
    if (!d.alive) continue;
    d.life += dt / 0.45;
    if (d.life >= 1) {
      d.alive = false;
      d.mesh.visible = false;
      continue;
    }
    d.vel.multiplyScalar(Math.exp(-5 * dt));
    d.mesh.position.addScaledVector(d.vel, dt);
    d.mesh.scale.setScalar(0.6 + d.life * 1.1);
    d.mesh.material.opacity = 0.75 * (1 - d.life);
  }
}

function buildWorld() {
  const stage = bake(assets.stage);
  stage.traverse((o) => {
    if (o.isMesh && /Asphalt|RoadPaint|RoadYellow|Grass|Sidewalk/.test(o.name)) o.castShadow = false;
  });
  scene.add(stage);

  const kani = bake(assets.kani, ['ClawPosX', 'ClawNegX', 'PupilPosX', 'PupilNegX']);
  addPompomFur(kani);
  crab.body = kani;
  crab.clawR = kani.getObjectByName('ClawPosX');
  crab.clawL = kani.getObjectByName('ClawNegX');
  crab.pupils = ['PupilNegX', 'PupilPosX'].map((name, i) => ({
    group: kani.getObjectByName(name),
    p: new THREE.Vector2(0, -PUPIL_RANGE),
    v: new THREE.Vector2(),
    spinDir: i === 0 ? 1 : -1,
  }));
  // 目玉のドームは透明なプラスチック
  kani.traverse((o) => {
    if (o.isMesh && o.material.name === 'EyeDome') {
      Object.assign(o.material, { transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.02, metalness: 0 });
      o.castShadow = false;
      o.renderOrder = 3;
    }
  });
  crab.root.add(kani);
  scene.add(crab.root);
  crab.shadow = makeBlobShadow();
  scene.add(crab.shadow);
  applyTheme();

  // 車・★のひな形 (同じジオメトリを使い回す)
  assets.carTemplate = bake(assets.car);
  assets.truckTemplate = bake(assets.truck);
  assets.starTemplate = bake(assets.star);
}

function makeVehicle(type) {
  const pooled = vehiclePool[type].pop();
  if (pooled) return pooled;
  const mesh = (type === 'car' ? assets.carTemplate : assets.truckTemplate).clone(true);
  // 車体色のマテリアルだけ個別に複製して色を変えられるようにする
  const paints = [];
  mesh.traverse((o) => {
    if (o.isMesh && o.material.name.startsWith('Paint')) {
      o.material = o.material.clone();
      paints.push(o.material);
    }
  });
  return { type, mesh, paints };
}

function spawnVehicle(type, lane, z) {
  const v = makeVehicle(type);
  const spec = VEHICLE_TYPES[type];
  const color = spec.colors[Math.floor(rand(spec.colors.length))];
  v.paints.forEach((m) => m.color.setHex(color));
  Object.assign(v, { lane, x: LANES[lane], z, passed: false, over: false, honked: false, bounce: rand(Math.PI * 2) });
  v.mesh.position.set(v.x, 0, z);
  scene.add(v.mesh);
  vehicles.push(v);
}

function releaseVehicle(i) {
  const v = vehicles[i];
  scene.remove(v.mesh);
  vehiclePool[v.type].push(v);
  vehicles.splice(i, 1);
}

function spawnStar(lane, y, z) {
  const s = starPool.pop() || { mesh: assets.starTemplate.clone(true) };
  Object.assign(s, { x: LANES[lane], y, z, taken: false, takenAt: 0, phase: rand(Math.PI * 2) });
  s.mesh.position.set(s.x, y, z);
  s.mesh.scale.setScalar(1);
  s.mesh.visible = true;
  scene.add(s.mesh);
  stars.push(s);
}

function releaseStar(i) {
  const s = stars[i];
  scene.remove(s.mesh);
  starPool.push(s);
  stars.splice(i, 1);
}

function clearTraffic() {
  for (let i = vehicles.length - 1; i >= 0; i--) releaseVehicle(i);
  for (let i = stars.length - 1; i >= 0; i--) releaseStar(i);
}

// ---------------------------------------------------------------------------
// ゲーム状態
// ---------------------------------------------------------------------------

const game = {
  state: 'loading', // loading | title | countdown | playing | paused | dying | over
  countdown: 0,
  countdownShown: -1,
  time: 0, // プレイ経過秒
  clock: 0, // 全体の経過秒 (演出用)
  speed: START_SPEED,
  rowCursor: 0, // 直近に出した列の z
  nextGap: 20,
  score: 0,
  dodged: 0,
  jumped: 0,
  starsTaken: 0,
  speedLevel: 0,
  best: Number(storageGet(STORAGE_BEST, 0)) || 0,
  dyingTime: 0,
  shake: 0,
  ambientTimer: 0,
  hintTimer: 0,
};

const ui = {
  hud: $('hud'),
  score: $('score'),
  bestMini: $('best-mini'),
  bestTitle: $('best-title'),
  bestOver: $('best-over'),
  hint: $('hint'),
  popups: $('popups'),
  title: $('screen-title'),
  pause: $('screen-pause'),
  over: $('screen-over'),
  start: $('btn-start'),
  sound: $('btn-sound'),
  music: $('btn-music'),
  controls: $('controls'),
  countdown: $('countdown'),
};

function showError(message) {
  const el = $('error');
  el.textContent = message;
  el.hidden = false;
}

function showScreen(name) {
  ui.title.hidden = name !== 'title';
  ui.pause.hidden = name !== 'pause';
  ui.over.hidden = name !== 'over';
  // 右上の音ボタンはどの画面でも出す。スコアと一時停止はプレイ中だけ
  ui.hud.dataset.mode = name === 'play' || name === 'pause' ? 'play' : 'menu';
  ui.controls.hidden = name !== 'play';
  const focusTarget = { title: ui.start, pause: $('btn-resume'), over: $('btn-retry') }[name];
  if (focusTarget) focusTarget.focus({ preventScroll: true });
  else canvas.focus({ preventScroll: true });
}

function refreshBest() {
  ui.bestMini.textContent = game.best;
  ui.bestTitle.textContent = game.best;
  ui.bestOver.textContent = game.best;
}

function popup(text, kind = '') {
  const el = document.createElement('div');
  el.className = `popup ${kind}`;
  el.textContent = text;
  ui.popups.appendChild(el);
  setTimeout(() => el.remove(), 1000);
  while (ui.popups.children.length > 3) ui.popups.firstChild.remove();
}

function addScore(points) {
  game.score += points;
  ui.score.textContent = game.score;
  // 数字をぽよんと弾ませる (同じアニメーションを毎回やり直す)
  ui.score.classList.remove('bump');
  void ui.score.offsetWidth;
  ui.score.classList.add('bump');
}

function haptic(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function showCountdown(text, isGo = false) {
  const el = document.createElement('span');
  el.textContent = text;
  if (isGo) el.className = 'go';
  ui.countdown.replaceChildren(el);
  ui.countdown.hidden = false;
}

function resetCrab() {
  Object.assign(crab, { lane: 1, x: 0, y: 0, vy: 0, airborne: false, tilt: 0, squash: 0, jumpBufferedAt: -1, spin: 0 });
  crab.vel.set(0, 0);
  crab.prevPos.set(0, 0);
  crab.prevVel.set(0, 0);
  for (const pu of crab.pupils) {
    pu.p.set(0, -PUPIL_RANGE);
    pu.v.set(0, 0);
  }
  crab.root.position.set(0, 0, 0);
  crab.body.rotation.set(0, 0, 0);
  crab.body.scale.set(1, 1, 1);
  crab.body.position.set(0, 0, 0);
}

function goTitle() {
  game.state = 'title';
  clearTraffic();
  resetCrab();
  game.speed = 11;
  refreshBest();
  showScreen('title');
  bgm.play('title');
}

function startGame() {
  unlockAudio();
  bgm.stop();
  clearTraffic();
  resetCrab();
  Object.assign(game, {
    state: 'countdown', countdown: 0, countdownShown: -1, time: 0, speed: START_SPEED, score: 0, dodged: 0, jumped: 0, starsTaken: 0, speedLevel: 0, shake: 0,
  });
  ui.score.textContent = '0';
  ui.popups.replaceChildren();
  refreshBest();
  // 最初の車がすぐ来るように、手前から列を並べておく
  game.rowCursor = -42;
  spawnRow(game.rowCursor);
  while (game.rowCursor - nextGapDistance() > SPAWN_Z) {
    game.rowCursor -= nextGapDistance();
    spawnRow(game.rowCursor);
  }
  game.nextGap = nextGapDistance();
  showScreen('play');
  ui.hint.hidden = false;
  ui.hint.classList.remove('fade');
  game.hintTimer = 3 * COUNTDOWN_STEP + 3;
}

// 3・2・1・スタート！ (この間は車が止まっている。横歩きだけできる)
function updateCountdown(dt) {
  game.countdown += dt;
  const n = Math.floor(game.countdown / COUNTDOWN_STEP);
  if (n !== game.countdownShown) {
    game.countdownShown = n;
    if (n < 3) {
      showCountdown(String(3 - n));
      sfx.count();
    } else {
      showCountdown('スタート！', true);
      sfx.start();
      bgm.play('play');
      game.state = 'playing';
      setTimeout(() => {
        if (game.state !== 'countdown') ui.countdown.hidden = true;
      }, 700);
    }
  }
  updateCrab(dt);
}

function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  bgm.pause();
  gestures.clear();
  showScreen('pause');
}

function resumeGame() {
  if (game.state !== 'paused') return;
  unlockAudio();
  game.state = 'playing';
  bgm.resume();
  showScreen('play');
}

function crash() {
  game.state = 'dying';
  game.dyingTime = 0;
  game.shake = reducedMotionQuery.matches ? 0 : 0.5;
  ui.controls.hidden = true;
  ui.hint.hidden = true;
  ui.popups.replaceChildren();
  crab.vy = 9;
  crab.airborne = true;
  sfx.crash();
  sfx.gameOver();
  bgm.stop();
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  gestures.clear();
}

function finishGame() {
  game.state = 'over';
  const isNew = game.score > game.best;
  if (isNew) {
    game.best = game.score;
    storageSet(STORAGE_BEST, game.best);
  }
  refreshBest();
  $('final-score').textContent = game.score;
  $('stat-dodged').textContent = game.dodged;
  $('stat-jumped').textContent = game.jumped;
  $('stat-stars').textContent = game.starsTaken;
  $('new-record').hidden = !isNew;
  ui.hint.hidden = true;
  showScreen('over');
}

// ---------------------------------------------------------------------------
// 車の出現パターン
// ---------------------------------------------------------------------------

function nextGapDistance() {
  const t = game.time;
  const gapTime = clamp(1.6 - t * 0.011, 0.85, 1.6) + rand(0.3);
  return game.speed * gapTime;
}

function spawnRow(z) {
  const t = game.time;
  const r = Math.random();
  let count = 1;
  if (t >= 50) count = r < 0.3 ? 3 : r < 0.8 ? 2 : 1;
  else if (t >= 25) count = r < 0.15 ? 3 : r < 0.65 ? 2 : 1;
  else if (t >= 8) count = r < 0.45 ? 2 : 1;

  const truckP = Math.min(0.15 + t * 0.006, 0.45);
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, count);
  const types = lanes.map(() => (Math.random() < truckP ? 'truck' : 'car'));
  // 3 車線ふさがりのときは、必ず飛び越えられる車を 1 台入れる
  if (count === 3 && types.every((ty) => ty === 'truck')) types[0] = 'car';
  if (count === 3 && types.filter((ty) => ty === 'truck').length === 3) types[1] = 'car';

  lanes.forEach((lane, i) => spawnVehicle(types[i], lane, z));

  // ★ : 乗用車の上 (ジャンプで取る) か、空いているレーンに並べる
  if (Math.random() < 0.4) {
    const carLanes = lanes.filter((_, i) => types[i] === 'car');
    const freeLanes = [0, 1, 2].filter((l) => !lanes.includes(l));
    if (carLanes.length && (Math.random() < 0.5 || !freeLanes.length)) {
      spawnStar(carLanes[Math.floor(rand(carLanes.length))], 2.4, z);
    } else if (freeLanes.length) {
      const lane = freeLanes[Math.floor(rand(freeLanes.length))];
      const n = 1 + Math.floor(rand(3));
      for (let k = 0; k < n; k++) spawnStar(lane, 0.75, z + k * 2.6);
    }
  }
}

// タイトル画面: 両端のレーンだけ車が通る
function updateAmbientTraffic(dt) {
  game.ambientTimer -= dt;
  if (game.ambientTimer <= 0) {
    game.ambientTimer = rand(0.9, 2.2);
    const lane = Math.random() < 0.5 ? 0 : 2;
    const recent = vehicles.some((v) => v.lane === lane && v.z < SPAWN_Z + 14);
    if (!recent) spawnVehicle(Math.random() < 0.25 ? 'truck' : 'car', lane, SPAWN_Z);
  }
}

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

function jump() {
  if (game.state !== 'playing') return;
  if (!crab.airborne) {
    crab.vy = JUMP_VELOCITY;
    crab.airborne = true;
    crab.jumpBufferedAt = -1;
    sfx.jump();
    haptic(8);
  } else {
    crab.jumpBufferedAt = game.clock; // 着地したらすぐ跳ぶ
  }
}

function moveLane(dir) {
  if (game.state !== 'playing' && game.state !== 'countdown') return;
  const next = clamp(crab.lane + dir, 0, LANES.length - 1);
  if (next === crab.lane) return;
  crab.lane = next;
  crab.tilt = dir;
  sfx.step();
  if (!crab.airborne) spawnDust(crab.x, 3, dir);
  haptic(6);
}

// 画面下の操作ボタン: 指が触れた瞬間に反応させる (click だと離すまで遅れる)
function bindControl(id, action) {
  const el = $(id);
  const release = () => el.classList.remove('pressed');
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockAudio();
    el.classList.add('pressed');
    action();
  });
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
bindControl('ctl-left', () => moveLane(-1));
bindControl('ctl-right', () => moveLane(1));
bindControl('ctl-jump', jump);

const gestures = new Map();

canvas.addEventListener('pointerdown', (e) => {
  // タイトルではカニをつつくと跳ねる
  if (game.state === 'title' && !crab.airborne) {
    unlockAudio();
    crab.vy = JUMP_VELOCITY * 0.75;
    crab.airborne = true;
    sfx.jump();
    return;
  }
  if (game.state !== 'playing' && game.state !== 'countdown') return;
  e.preventDefault();
  unlockAudio();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* 未対応ブラウザ */
  }
  gestures.set(e.pointerId, { x: e.clientX, y: e.clientY, used: false, jumped: false });
});

canvas.addEventListener('pointermove', (e) => {
  const g = gestures.get(e.pointerId);
  if (!g) return;
  const dx = e.clientX - g.x;
  const dy = e.clientY - g.y;
  const threshold = clamp(Math.min(window.innerWidth, window.innerHeight) * 0.06, 20, 48);
  if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
    moveLane(Math.sign(dx));
    g.x = e.clientX; // 指を離さずに続けて 2 レーン動ける
    g.y = e.clientY;
    g.used = true;
  } else if (-dy > threshold && -dy > Math.abs(dx) && !g.jumped) {
    jump(); // 上スワイプでもジャンプ
    g.jumped = true;
    g.used = true;
  }
});

function endGesture(e) {
  const g = gestures.get(e.pointerId);
  if (!g) return;
  gestures.delete(e.pointerId);
  if (!g.used && e.type === 'pointerup') jump();
}
canvas.addEventListener('pointerup', endGesture);
canvas.addEventListener('pointercancel', endGesture);

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (game.state === 'playing' || game.state === 'countdown') {
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      if (!e.repeat) moveLane(-1);
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      if (!e.repeat) moveLane(1);
    } else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
      if (!e.repeat) jump();
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      pauseGame();
    } else {
      return;
    }
    e.preventDefault();
  } else if (game.state === 'paused' && (k === 'p' || k === 'P' || k === 'Escape')) {
    e.preventDefault();
    resumeGame();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});
window.addEventListener('blur', pauseGame);

ui.start.addEventListener('click', startGame);
$('btn-retry').addEventListener('click', startGame);
$('btn-title').addEventListener('click', goTitle);
$('btn-quit').addEventListener('click', goTitle);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-pause').addEventListener('click', pauseGame);

const ICON_SOUND_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_MUSIC_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V5.5l11-2.5v12"/><circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="15" r="3"/></svg>';
const ICON_MUSIC_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V5.5l11-2.5v12"/><circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="15" r="3"/><path d="M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

// 効果音と BGM は別々にオン・オフできる (設定は端末に保存)
function renderSoundButtons() {
  ui.sound.innerHTML = isSfxOn() ? ICON_SOUND_ON : ICON_SOUND_OFF;
  ui.sound.setAttribute('aria-label', isSfxOn() ? '効果音をオフにする' : '効果音をオンにする');
  ui.sound.classList.toggle('off', !isSfxOn());
  ui.music.innerHTML = isBgmOn() ? ICON_MUSIC_ON : ICON_MUSIC_OFF;
  ui.music.setAttribute('aria-label', isBgmOn() ? 'BGM をオフにする' : 'BGM をオンにする');
  ui.music.classList.toggle('off', !isBgmOn());
}
setSfxOn(storageGet(STORAGE_MUTED, '0') !== '1');
setBgmOn(storageGet(STORAGE_BGM_OFF, '0') !== '1');
renderSoundButtons();
ui.sound.addEventListener('click', () => {
  unlockAudio();
  setSfxOn(!isSfxOn());
  storageSet(STORAGE_MUTED, isSfxOn() ? '0' : '1');
  renderSoundButtons();
  if (isSfxOn()) sfx.step();
});
ui.music.addEventListener('click', () => {
  unlockAudio();
  setBgmOn(!isBgmOn());
  storageSet(STORAGE_BGM_OFF, isBgmOn() ? '0' : '1');
  renderSoundButtons();
});

// ブラウザは最初の操作まで音を出せないので、どこか触ったら音を解禁する (タイトル曲が始まる)
const firstGesture = () => {
  unlockAudio();
  window.removeEventListener('pointerdown', firstGesture, true);
  window.removeEventListener('keydown', firstGesture, true);
};
window.addEventListener('pointerdown', firstGesture, true);
window.addEventListener('keydown', firstGesture, true);

// ---------------------------------------------------------------------------
// 更新
// ---------------------------------------------------------------------------

function updateCrab(dt) {
  const calm = reducedMotionQuery.matches;
  const t = game.clock;

  // 横歩き
  const targetX = LANES[crab.lane];
  const dx = targetX - crab.x;
  const step = LANE_SPEED * dt;
  crab.x = Math.abs(dx) <= step ? targetX : crab.x + Math.sign(dx) * step;
  crab.tilt = damp(crab.tilt, 0, 10, dt);

  // ジャンプ
  if (crab.airborne) {
    crab.vy -= GRAVITY * dt;
    crab.y += crab.vy * dt;
    if (crab.y <= 0) {
      crab.y = 0;
      crab.vy = 0;
      crab.airborne = false;
      crab.squash = 1;
      sfx.land();
      spawnDust(crab.x, 7);
      if (crab.jumpBufferedAt >= 0 && t - crab.jumpBufferedAt <= JUMP_BUFFER) jump();
    }
  }
  crab.squash = damp(crab.squash, 0, 12, dt);

  crab.root.position.set(crab.x, crab.y, 0);

  // 見た目の動き: 着地でつぶれ、上昇中は縦に伸びる
  const body = crab.body;
  const squash = calm ? 0 : crab.squash * 0.2;
  const stretch = calm || !crab.airborne ? 0 : clamp(crab.vy / JUMP_VELOCITY, -0.3, 1) * 0.12;
  body.scale.set(1 + squash * 0.6 - stretch * 0.5, 1 - squash + stretch, 1 + squash * 0.6 - stretch * 0.5);
  body.rotation.z = calm ? 0 : -crab.tilt * 0.22;
  // 横歩きは小さく跳ねながら (見た目だけ。当たり判定は変えない)
  const laneRest = Math.abs(targetX - crab.x) % LANES[2];
  const hop = !calm && !crab.airborne && laneRest > 0.001 ? Math.sin(Math.PI * (1 - laneRest / LANES[2])) * 0.22 : 0;
  const idle = !calm && !crab.airborne && game.state !== 'playing' ? Math.abs(Math.sin(t * 2.2)) * 0.06 : 0;
  body.position.y = hop + idle;

  updateCrabDetails(dt);

  // ハサミ: ジャンプ中はバンザイ、地上では小さく動かす
  const raise = crab.airborne ? 0.75 : calm ? 0 : 0.12 + Math.sin(t * 6) * 0.1;
  const r = damp(crab.clawR.rotation.x, -raise, 14, dt);
  crab.clawR.rotation.set(r * 0.25, 0, -r);
  crab.clawL.rotation.set(r * 0.25, 0, r);
}

/** 毛の揺れ・動く目・足もとの影 */
function updateCrabDetails(dt) {
  if (dt <= 0) return;
  const calm = reducedMotionQuery.matches;
  const px = crab.x;
  const py = crab.y + crab.body.position.y;
  const vx = (px - crab.prevPos.x) / dt;
  const vy = (py - crab.prevPos.y) / dt;
  crab.prevPos.set(px, py);
  const ax = clamp((vx - crab.prevVel.x) / dt, -150, 150);
  const ay = clamp((vy - crab.prevVel.y) / dt, -150, 150);
  crab.prevVel.set(vx, vy);
  crab.vel.set(damp(crab.vel.x, vx, 10, dt), damp(crab.vel.y, vy, 10, dt));

  // 毛は動きに少し遅れてなびく (外側の層ほど大きく)
  const swayX = calm ? 0 : clamp(-crab.vel.x * 0.004, -0.05, 0.05);
  const swayY = calm ? 0 : clamp(-crab.vel.y * 0.004, -0.05, 0.05);
  for (const sh of crab.furShells) {
    sh.mesh.position.x = swayX * sh.h * sh.h;
    sh.mesh.position.y = sh.baseY + swayY * sh.h * sh.h;
  }
  if (crab.fibers) crab.fibers.position.set(swayX * 1.2, swayY * 1.2, 0);

  // 動く目: 黒目は目の中を転がる小さな玉。重力と、カニの加速と逆向きの力を受ける
  for (const pu of crab.pupils) {
    if (game.state === 'dying' || game.state === 'over') {
      // ひかれたら目を回す
      const a = Math.atan2(pu.p.y, pu.p.x) + pu.spinDir * dt * 16;
      pu.p.set(Math.cos(a) * PUPIL_RANGE, Math.sin(a) * PUPIL_RANGE);
    } else {
      // 黒目の重力をカニより弱くしてあるので、跳んでいる間はふわっと上に浮き、着地でストンと落ちる
      const fx = -ax * 0.5;
      const fy = -12 - ay;
      pu.v.x += (fx - pu.v.x * 6) * dt;
      pu.v.y += (fy - pu.v.y * 6) * dt;
      pu.p.addScaledVector(pu.v, dt);
      const len = pu.p.length();
      if (len > PUPIL_RANGE) {
        // ふちに当たったら跳ね返る
        pu.p.multiplyScalar(PUPIL_RANGE / len);
        const n = pu.p.clone().normalize();
        const out = pu.v.dot(n);
        if (out > 0) pu.v.addScaledVector(n, -out * 1.35);
      }
    }
    // glTF にすると Blender のローカル軸が (x, z, -y) になる: 目の面は X と -Z、Y が目の正面方向
    for (const m of pu.group.children) m.position.set(pu.p.x, 0, -pu.p.y);
  }

  // 足もとの丸い影: 高く跳ぶほど小さく薄く
  if (crab.shadow) {
    const k = clamp(crab.y / 3, 0, 0.7);
    crab.shadow.position.x = crab.x;
    crab.shadow.scale.setScalar(1 - k * 0.45);
    crab.shadow.material.opacity = 1 - k;
  }
}

function updateDyingCrab(dt) {
  crab.vy -= GRAVITY * 0.7 * dt;
  crab.y = Math.max(0, crab.y + crab.vy * dt);
  if (crab.y === 0) crab.vy = 0;
  crab.spin = Math.min(Math.PI, crab.spin + dt * 7);
  crab.root.position.set(crab.x, crab.y, 0);
  // 足元を軸にひっくり返るので、裏返った分だけ持ち上げて地面にめり込ませない
  crab.body.rotation.set(0, 0, crab.spin);
  crab.body.position.y = (1 - Math.cos(crab.spin)) * 0.55;
  updateCrabDetails(dt);
}

function updateTraffic(dt, playing) {
  const move = game.speed * dt;

  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    const spec = VEHICLE_TYPES[v.type];
    v.z += move;
    v.mesh.position.set(v.x, Math.abs(Math.sin(game.clock * 9 + v.bounce)) * 0.02, v.z);

    if (playing) {
      const overlapX = Math.abs(v.x - crab.x) < spec.halfX + CRAB.halfX;
      const overlapZ = Math.abs(v.z) < spec.halfZ + CRAB.halfZ;
      if (overlapX && overlapZ) {
        if (crab.y < spec.height) {
          crash();
          return;
        }
        v.over = true; // 真上を飛び越えている
      }
      // 近づいたらクラクション
      if (!v.honked && overlapX && v.z > -14 && v.z < -6 && !crab.airborne) {
        v.honked = true;
        if (Math.random() < 0.35) sfx.horn();
      }
      if (!v.passed && v.z - spec.halfZ > CRAB.halfZ + 0.2) {
        v.passed = true;
        if (v.over) {
          game.jumped += 1;
          addScore(SCORE_JUMP);
          popup(`ナイスジャンプ +${SCORE_JUMP}`);
          sfx.bonus();
        } else {
          game.dodged += 1;
          addScore(SCORE_DODGE);
        }
      }
    }
    if (v.z - spec.halfZ > DESPAWN_Z) releaseVehicle(i);
  }

  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    if (s.taken) {
      const k = (game.clock - s.takenAt) / 0.3;
      s.mesh.scale.setScalar(1 + k * 1.2);
      s.mesh.position.y = s.y + k * 1.2;
      s.mesh.rotation.y += dt * 20;
      if (k >= 1) releaseStar(i);
      continue;
    }
    s.z += move;
    s.mesh.position.set(s.x, s.y + Math.sin(game.clock * 3 + s.phase) * 0.12, s.z);
    s.mesh.rotation.y = game.clock * 3 + s.phase;
    if (playing) {
      const hit =
        Math.abs(s.x - crab.x) < CRAB.halfX + STAR_RADIUS &&
        Math.abs(s.z) < CRAB.halfZ + STAR_RADIUS &&
        s.y + STAR_RADIUS > crab.y &&
        s.y - STAR_RADIUS < crab.y + CRAB.height + 0.3;
      if (hit) {
        s.taken = true;
        s.takenAt = game.clock;
        game.starsTaken += 1;
        addScore(SCORE_STAR);
        popup(`★ +${SCORE_STAR}`, 'star');
        sfx.star();
        continue;
      }
    }
    if (s.z > DESPAWN_Z) releaseStar(i);
  }
}

function updatePlaying(dt) {
  game.time += dt;
  game.speed = Math.min(MAX_SPEED, START_SPEED + game.time * 0.3);
  bgm.setIntensity((game.speed - START_SPEED) / (MAX_SPEED - START_SPEED));

  // 20 秒ごとにスピードアップを知らせる (最高速度に達したら終わり)
  const level = Math.floor(game.time / 20);
  if (level > game.speedLevel) {
    game.speedLevel = level;
    if (game.speed < MAX_SPEED) {
      popup('スピードアップ！', 'speed');
      sfx.speedUp();
    }
  }

  game.rowCursor += game.speed * dt;
  if (game.rowCursor - SPAWN_Z >= game.nextGap) {
    game.rowCursor = SPAWN_Z;
    spawnRow(SPAWN_Z);
    game.nextGap = nextGapDistance();
  }

  if (game.hintTimer > 0) {
    game.hintTimer -= dt;
    if (game.hintTimer <= 0) {
      ui.hint.classList.add('fade');
      setTimeout(() => {
        if (game.hintTimer <= 0) ui.hint.hidden = true;
      }, 700);
    }
  }

  updateCrab(dt);
  updateTraffic(dt, true);
}

// ---------------------------------------------------------------------------
// カメラ
// ---------------------------------------------------------------------------

const camState = { dist: 20, look: 0.5, side: 0, init: false };
const camTarget = new THREE.Vector3();
const titlePanel = document.querySelector('.title-panel');

const CRAB_VIEW = { w: 2.7, h: 1.5 }; // 画面上で確保したいカニの大きさ (単位)

/**
 * カメラの距離とカニを置く画面上の位置を決める。
 * screenX / screenY: カニを置く位置 (NDC。-1 が左端・下端、+1 が右端・上端)
 */
function cameraGoal() {
  const aspect = camera.aspect;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // プレイ中: 3 車線とカニが横幅に収まる距離
  const play = Math.max(4.3 / (tanHalf * aspect), 5.2 / tanHalf);
  if (game.state !== 'title' && game.state !== 'loading') return { dist: play, screenX: 0, screenY: -0.42 };

  // タイトル: パネルとイラストに重ならない場所にカニを大きく映す
  const W = window.innerWidth;
  const H = window.innerHeight;
  // 指定した画面の大きさ (px) にカニが収まる距離
  const fit = (boxW, boxH) => Math.max(
    CRAB_VIEW.h / (2 * tanHalf * (boxH / H)),
    CRAB_VIEW.w / (2 * tanHalf * aspect * (boxW / W)),
  );
  if (aspect >= 1.2) {
    // 横長: パネルは右寄せなので、カニは左側の空いたところへ
    const rect = titlePanel.getBoundingClientRect();
    const freeW = Math.max(rect.left, W * 0.3);
    const centerX = freeW / 2;
    return { dist: clamp(fit(freeW * 0.7, H * 0.45), 5, play), screenX: (centerX / W) * 2 - 1, screenY: 0.05 };
  }
  // 縦長: パネル上端 (イラストのはみ出し分を除く) より上の空間
  const top = titlePanel.getBoundingClientRect().top - 100;
  const freeH = Math.max(top, 90);
  return { dist: clamp(fit(W * 0.75, freeH * 0.8), 5, play), screenX: 0, screenY: 1 - (freeH / 2 / H) * 2 };
}

function updateCamera(dt) {
  const goal = cameraGoal();
  if (!camState.init) {
    camState.dist = goal.dist;
    camState.look = goal.screenY;
    camState.side = goal.screenX;
    camState.init = true;
  }
  camState.dist = damp(camState.dist, goal.dist, 3, dt);
  camState.look = damp(camState.look, goal.screenY, 3, dt);
  camState.side = damp(camState.side, goal.screenX, 3, dt);

  const elev = THREE.MathUtils.degToRad(23);
  camTarget.set(0, 0.7, 0);
  camera.position.set(0, camTarget.y + Math.sin(elev) * camState.dist, Math.cos(elev) * camState.dist);
  camera.lookAt(camTarget);
  // カニが画面の指定した高さに来るよう、カメラを上下に振る
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.rotateX(-Math.atan(camState.look * tanHalf));
  // 左右は投影をずらして寄せる
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (Math.abs(camState.side) > 0.001) camera.setViewOffset(W, H, (-camState.side * W) / 2, 0, W, H);
  else camera.clearViewOffset();

  if (game.shake > 0) {
    game.shake = Math.max(0, game.shake - dt * 1.2);
    camera.position.x += (Math.random() - 0.5) * game.shake;
    camera.position.y += (Math.random() - 0.5) * game.shake;
  }
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// メインループ
// ---------------------------------------------------------------------------

const timer = new THREE.Timer();

function update(dt) {
  if (game.state !== 'paused') game.clock += dt;

  switch (game.state) {
    case 'title':
      updateAmbientTraffic(dt);
      updateTraffic(dt, false);
      updateCrab(dt);
      break;
    case 'countdown':
      updateCountdown(dt);
      break;
    case 'playing':
      updatePlaying(dt);
      break;
    case 'dying':
      game.dyingTime += dt;
      game.speed = damp(game.speed, 0, 5, dt);
      updateTraffic(dt, false);
      updateDyingCrab(dt);
      if (game.dyingTime > 1.4) finishGame();
      break;
    case 'over':
      updateTraffic(dt, false);
      updateCrabDetails(dt); // 目を回し続ける
      break;
    default:
      break;
  }

  if (game.state !== 'paused') {
    updateDust(dt);
    updateCamera(dt);
  }
}

function tick(timestamp) {
  timer.update(timestamp);
  update(Math.min(timer.getDelta(), 1 / 30));
  renderer.render(scene, camera);
}

// 開発時のみ: テストからゲームを早送りできるようにする
if (import.meta.env.DEV) {
  window.__kani = {
    game,
    crab,
    vehicles,
    stars,
    jump,
    moveLane,
    bgm,
    step(seconds, dt = 1 / 60) {
      for (let t = 0; t < seconds; t += dt) update(dt);
    },
  };
}

// ---------------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------------

refreshBest();
showScreen('title');
renderer.setAnimationLoop(tick);

loadAssets((p) => {
  ui.start.textContent = `よみこみ中… ${Math.round(p * 100)}%`;
})
  .then(() => {
    buildWorld();
    goTitle();
    ui.start.disabled = false;
    ui.start.textContent = 'スタート！';
  })
  .catch((err) => {
    console.error(err);
    showError('データの読み込みに失敗しました。通信状況を確認して、ページを再読み込みしてください。');
  });
