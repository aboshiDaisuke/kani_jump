// 効果音と BGM (どちらも WebAudio で合成するので音声ファイルは不要)

let ctx = null;
let master = null;
let sfxBus = null;
let bgmBus = null;
let noiseBuffer = null;
let sfxOn = true;
let bgmOn = true;

const SFX_VOLUME = 0.5;
const BGM_VOLUME = 0.28;

/** ユーザー操作の中で呼ぶ (ブラウザの自動再生制限を解除する) */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxOn ? SFX_VOLUME : 0;
    sfxBus.connect(master);
    // BGM はやわらかくするため高音を少し削る
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 4200;
    bgmBus = ctx.createGain();
    bgmBus.gain.value = bgmOn ? BGM_VOLUME : 0;
    bgmBus.connect(soften).connect(master);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  bgm.kick();
}

// タブを裏に回したら音を止める
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else ctx.resume();
});

export function setSfxOn(value) {
  sfxOn = value;
  if (sfxBus) sfxBus.gain.setTargetAtTime(sfxOn ? SFX_VOLUME : 0, ctx.currentTime, 0.02);
}

export function isSfxOn() {
  return sfxOn;
}

export function setBgmOn(value) {
  bgmOn = value;
  if (bgmBus) bgmBus.gain.setTargetAtTime(bgmOn ? BGM_VOLUME : 0, ctx.currentTime, 0.05);
}

export function isBgmOn() {
  return bgmOn;
}

// ---------------------------------------------------------------------------
// 音の部品
// ---------------------------------------------------------------------------

function tone({ type = 'sine', from, to = from, dur = 0.15, vol = 0.4, delay = 0, at, bus = sfxBus }) {
  if (!ctx) return;
  const t = at ?? ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(vol * 0.6, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ dur = 0.4, vol = 0.5, type = 'lowpass', freq = 800, sweepTo, at, bus = sfxBus }) {
  if (!ctx) return;
  const t = at ?? ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(bus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

// ---------------------------------------------------------------------------
// 効果音
// ---------------------------------------------------------------------------

export const sfx = {
  jump: () => tone({ type: 'square', from: 330, to: 880, dur: 0.18, vol: 0.18 }),
  step: () => tone({ type: 'triangle', from: 520, to: 380, dur: 0.06, vol: 0.25 }),
  land: () => tone({ type: 'sine', from: 180, to: 90, dur: 0.08, vol: 0.3 }),
  star: () => {
    tone({ type: 'triangle', from: 988, dur: 0.09, vol: 0.25 });
    tone({ type: 'triangle', from: 1319, dur: 0.16, vol: 0.25, delay: 0.07 });
  },
  bonus: () => {
    tone({ type: 'square', from: 660, dur: 0.07, vol: 0.12 });
    tone({ type: 'square', from: 880, dur: 0.12, vol: 0.12, delay: 0.06 });
  },
  horn: () => {
    tone({ type: 'sawtooth', from: 392, dur: 0.22, vol: 0.08 });
    tone({ type: 'sawtooth', from: 494, dur: 0.22, vol: 0.06 });
  },
  crash: () => {
    noise({ dur: 0.6, vol: 0.7, freq: 2400, sweepTo: 120 });
    tone({ type: 'sawtooth', from: 220, to: 55, dur: 0.5, vol: 0.25 });
  },
  start: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', from: f, dur: 0.1, vol: 0.12, delay: i * 0.08 }));
  },
  count: () => tone({ type: 'square', from: 660, dur: 0.12, vol: 0.14 }),
  speedUp: () => {
    tone({ type: 'triangle', from: 600, to: 1200, dur: 0.25, vol: 0.15 });
  },
  // ゲームオーバーの「ちゃんちゃーん…」
  gameOver: () => {
    [392, 370, 349, 330].forEach((f, i) =>
      tone({ type: 'square', from: f, to: i === 3 ? f * 0.94 : f, dur: i === 3 ? 0.7 : 0.2, vol: 0.12, delay: 0.45 + i * 0.22 }),
    );
  },
};

// ---------------------------------------------------------------------------
// BGM (チップチューン風のシーケンサー)
// ---------------------------------------------------------------------------

const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midiOf = (name) => {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  return NOTE_INDEX[m[1]] + (Number(m[2]) + 1) * 12;
};
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/**
 * 1 小節 = 8 分音符 8 つ。音名・「~」(のばす)・「-」(休み) を空白区切りで並べる。
 * 16 分刻みのイベント配列 [{ step, midi, len }] に変換する。
 */
function parseMelody(text) {
  const tokens = text.trim().split(/\s+/);
  const events = [];
  tokens.forEach((tok, i) => {
    if (tok === '~' || tok === '-') return;
    let len = 1;
    while (tokens[i + len] === '~') len += 1;
    events.push({ step: i * 2, midi: midiOf(tok), len: len * 2 });
  });
  return events;
}

const TRACKS = {
  // タイトル: ゆったり (F メジャー)
  title: {
    bpm: 104,
    lead: { type: 'triangle', vol: 0.32, octave: 0 },
    bass: { type: 'sine', vol: 0.4 },
    drums: 'soft',
    bars: [
      { root: 'F2', chord: ['A4', 'C5', 'F5'], melody: 'A5 ~ C6 ~ A5 G5 F5 ~' },
      { root: 'D2', chord: ['A4', 'D5', 'F5'], melody: 'D5 ~ F5 ~ A5 ~ G5 ~' },
      { root: 'A#1', chord: ['A#4', 'D5', 'F5'], melody: 'D5 F5 A#5 ~ A5 G5 F5 ~' },
      { root: 'C2', chord: ['G4', 'C5', 'E5'], melody: 'E5 ~ G5 ~ C6 ~ - -' },
      { root: 'F2', chord: ['A4', 'C5', 'F5'], melody: 'A5 ~ C6 ~ D6 C6 A5 ~' },
      { root: 'D2', chord: ['A4', 'D5', 'F5'], melody: 'F5 ~ A5 ~ G5 ~ F5 ~' },
      { root: 'A#1', chord: ['A#4', 'D5', 'F5'], melody: 'D5 ~ F5 G5 A5 ~ C6 ~' },
      { root: 'C2', chord: ['G4', 'C5', 'E5'], melody: 'G5 ~ E5 ~ F5 ~ - -' },
    ],
  },
  // プレイ中: 元気よく (C メジャー)
  play: {
    bpm: 148,
    lead: { type: 'square', vol: 0.16, octave: 0 },
    bass: { type: 'triangle', vol: 0.5 },
    drums: 'full',
    bars: [
      { root: 'C2', chord: ['E4', 'G4', 'C5'], melody: 'E5 G5 C6 G5 A5 G5 E5 ~' },
      { root: 'A1', chord: ['E4', 'A4', 'C5'], melody: 'C5 E5 A5 E5 G5 E5 C5 ~' },
      { root: 'F1', chord: ['F4', 'A4', 'C5'], melody: 'F5 A5 C6 A5 D6 C6 A5 G5' },
      { root: 'G1', chord: ['D4', 'G4', 'B4'], melody: 'B4 D5 G5 ~ F5 E5 D5 -' },
      { root: 'C2', chord: ['E4', 'G4', 'C5'], melody: 'E5 G5 C6 G5 E6 D6 C6 ~' },
      { root: 'A1', chord: ['E4', 'A4', 'C5'], melody: 'A5 C6 E6 C6 B5 A5 G5 ~' },
      { root: 'F1', chord: ['F4', 'A4', 'C5'], melody: 'F5 A5 C6 F6 E6 D6 C6 A5' },
      { root: 'G1', chord: ['D4', 'G4', 'B4'], melody: 'G5 ~ B5 ~ D6 ~ G5 -' },
    ],
  },
};

for (const track of Object.values(TRACKS)) {
  track.bars = track.bars.map((b) => ({
    root: midiOf(b.root),
    chord: b.chord.map(midiOf),
    melody: parseMelody(b.melody),
  }));
}

const LOOKAHEAD = 0.12; // 何秒先まで予約するか

export const bgm = {
  track: null, // 鳴らしたい曲の名前
  playing: false,
  step: 0,
  nextTime: 0,
  tempo: 1, // テンポ倍率
  timer: null,

  /** 曲を最初から鳴らす (音が解禁される前なら、解禁されたときに始まる) */
  play(name) {
    this.track = name;
    this.step = 0;
    this.tempo = 1;
    this.playing = true;
    if (ctx) this.nextTime = ctx.currentTime + 0.06;
    this.kick();
  },

  stop() {
    this.playing = false;
    this.track = null;
  },

  pause() {
    this.playing = false;
  },

  resume() {
    if (!this.track) return;
    this.playing = true;
    if (ctx) this.nextTime = ctx.currentTime + 0.06;
    this.kick();
  },

  /** 0〜1。ゲームのスピードに合わせて最大 1.18 倍まで速くする */
  setIntensity(x) {
    this.tempo = 1 + Math.min(Math.max(x, 0), 1) * 0.18;
  },

  kick() {
    if (!ctx || this.timer) return;
    this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.06);
    this.timer = setInterval(() => this.tick(), 25);
  },

  tick() {
    if (!ctx || !this.playing || !this.track || ctx.state !== 'running') return;
    const track = TRACKS[this.track];
    const stepDur = 60 / (track.bpm * this.tempo) / 4;
    // 裏に回っていたなどで遅れたら、まとめて鳴らさず今から再開する
    if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      playStep(track, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % (track.bars.length * 16);
    }
  },
};

function playStep(track, step, t, stepDur) {
  const bar = track.bars[Math.floor(step / 16)];
  const s = step % 16;
  const out = { at: t, bus: bgmBus };

  // メロディ
  for (const ev of bar.melody) {
    if (ev.step === s) {
      tone({ ...out, type: track.lead.type, from: hz(ev.midi + track.lead.octave), dur: ev.len * stepDur * 0.95, vol: track.lead.vol });
    }
  }

  if (track.drums === 'full') {
    // ベース: 8 分でオクターブを行き来する
    if (s % 2 === 0) {
      const midi = bar.root + (s % 4 === 2 ? 12 : 0);
      tone({ ...out, type: track.bass.type, from: hz(midi), dur: stepDur * 1.8, vol: track.bass.vol });
    }
    // 裏拍のコード (ズンチャッ)
    if (s % 4 === 2) {
      for (const n of bar.chord) tone({ ...out, type: 'square', from: hz(n), dur: stepDur * 0.9, vol: 0.035 });
    }
    // ドラム
    if (s === 0 || s === 8 || s === 10) tone({ ...out, type: 'sine', from: 150, to: 45, dur: 0.14, vol: 0.7 });
    if (s === 4 || s === 12) noise({ ...out, dur: 0.12, vol: 0.32, type: 'highpass', freq: 1400 });
    if (s % 2 === 0) noise({ ...out, dur: 0.03, vol: s % 4 === 2 ? 0.14 : 0.07, type: 'highpass', freq: 7000 });
  } else {
    // ゆったり: 4 分のベースと、軽いアルペジオ
    if (s % 4 === 0) tone({ ...out, type: track.bass.type, from: hz(bar.root + (s === 8 ? 7 : 0)), dur: stepDur * 3.5, vol: track.bass.vol });
    if (s % 2 === 0) {
      const n = bar.chord[(s / 2) % bar.chord.length];
      tone({ ...out, type: 'sine', from: hz(n), dur: stepDur * 1.6, vol: 0.06 });
    }
    if (s % 4 === 2) noise({ ...out, dur: 0.025, vol: 0.05, type: 'highpass', freq: 8000 });
  }
}
