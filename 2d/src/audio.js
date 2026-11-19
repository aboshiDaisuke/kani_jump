const NOTE_FREQ = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98,
};

const STAR_SCALE = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'];

// 32-step (2 bars of 16th/8th) cheerful loops
const TRACKS = {
  title: {
    bpm: 112,
    lead: [
      'E5', null, 'G5', null, 'A5', null, 'G5', 'E5',
      'D5', null, 'E5', null, 'C5', null, null, null,
      'F5', null, 'A5', null, 'G5', null, 'E5', null,
      'D5', 'E5', 'G5', null, 'E5', null, null, null,
    ],
    bass: [
      'C3', null, null, null, 'G3', null, null, null,
      'A3', null, null, null, 'E3', null, null, null,
      'F3', null, null, null, 'C3', null, null, null,
      'G3', null, 'G3', null, 'C3', null, null, null,
    ],
    wave: 'triangle',
    hasDrums: false,
  },
  play: {
    bpm: 136,
    lead: [
      'C5', null, 'E5', 'G5', 'A5', null, 'G5', null,
      'E5', 'G5', 'C6', null, 'A5', null, 'G5', null,
      'F5', null, 'A5', 'G5', 'E5', null, 'C5', null,
      'D5', 'E5', 'G5', 'A5', 'G5', null, null, null,
      'E5', null, 'G5', 'A5', 'C6', null, 'A5', 'G5',
      'E5', null, 'D5', 'E5', 'C5', null, null, null,
      'F5', 'A5', 'G5', 'F5', 'E5', 'G5', 'C6', null,
      'D6', null, 'B5', 'G5', 'C6', null, null, null,
    ],
    bass: [
      'C3', null, 'C3', null, 'G3', null, 'G3', null,
      'A3', null, 'A3', null, 'E3', null, 'G3', null,
      'F3', null, 'F3', null, 'C3', null, 'C3', null,
      'G3', null, 'D3', null, 'G3', null, 'B3', null,
      'C3', null, 'C3', null, 'A3', null, 'A3', null,
      'F3', null, 'G3', null, 'C3', null, 'G3', null,
      'F3', null, 'F3', null, 'C3', null, 'E3', null,
      'G3', null, 'G3', null, 'C3', null, 'G3', null,
    ],
    wave: 'square',
    hasDrums: true,
  },
  fever: {
    bpm: 168,
    lead: [
      'C6', 'G5', 'E5', 'G5', 'C6', 'D6', 'E6', null,
      'D6', 'C6', 'A5', 'G5', 'A5', 'C6', 'D6', null,
      'E6', 'C6', 'A5', 'C6', 'G6', 'E6', 'D6', 'C6',
      'D6', 'E6', 'G6', null, 'E6', null, 'C6', null,
    ],
    bass: [
      'C3', 'C4', 'C3', 'C4', 'G3', 'G3', 'A3', 'B3',
      'F3', 'F3', 'G3', 'G3', 'A3', 'A3', 'B3', 'B3',
      'F3', 'C4', 'F3', 'C4', 'C3', 'G3', 'C3', 'G3',
      'G3', 'D4', 'G3', 'B3', 'C3', 'G3', 'C4', null,
    ],
    wave: 'sawtooth',
    hasDrums: true,
  },
};

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.bgmOn = true;
    this.sfxOn = true;

    this.currentTrack = null;
    this.stepIndex = 0;
    this.tempoMult = 1.0;
    this.timerId = null;
    this.nextNoteTime = 0;
    this.noiseBuffer = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.72;
    this.masterGain.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.bgmOn ? 0.24 : 0;
    this.bgmGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxOn ? 0.55 : 0;
    this.sfxGain.connect(this.masterGain);

    // Precompute short white-noise buffer for percussive drums/whoosh
    const len = Math.floor(this.ctx.sampleRate * 0.2);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    if (this.currentTrack && this.bgmOn && !this.timerId) {
      this._startScheduler();
    }
  }

  setBgmOn(on) {
    this.bgmOn = Boolean(on);
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(this.bgmOn ? 0.24 : 0, this.ctx.currentTime, 0.03);
    }
    if (this.bgmOn && this.currentTrack && this.ctx && !this.timerId) {
      this._startScheduler();
    } else if (!this.bgmOn) {
      this._stopScheduler();
    }
  }

  setSfxOn(on) {
    this.sfxOn = Boolean(on);
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxOn ? 0.55 : 0, this.ctx.currentTime, 0.02);
    }
  }

  setTempoMultiplier(mult) {
    this.tempoMult = Math.max(0.85, Math.min(1.3, mult));
  }

  playTrack(name) {
    if (this.currentTrack === name) return;
    this.currentTrack = name;
    this.stepIndex = 0;
    this._stopScheduler();
    if (name && this.bgmOn && this.ctx) {
      this._startScheduler();
    }
  }

  stopTrack() {
    this.currentTrack = null;
    this._stopScheduler();
  }

  _startScheduler() {
    if (!this.ctx || !this.currentTrack) return;
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    this.timerId = setInterval(() => this._schedule(), 35);
  }

  _stopScheduler() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  _schedule() {
    if (!this.ctx || !this.currentTrack || !this.bgmOn) return;
    if (this.ctx.state !== 'running') return;
    const track = TRACKS[this.currentTrack];
    if (!track) return;

    const bpm = track.bpm * (this.currentTrack === 'play' ? this.tempoMult : 1);
    const stepDur = 60 / bpm / 2; // 8th-note steps

    while (this.nextNoteTime < this.ctx.currentTime + 0.14) {
      const i = this.stepIndex % track.lead.length;
      const t = this.nextNoteTime;

      const leadNote = track.lead[i];
      if (leadNote && NOTE_FREQ[leadNote]) {
        this._bgmTone(NOTE_FREQ[leadNote], t, stepDur * 0.85, track.wave, 0.24);
      }
      const bassNote = track.bass[i];
      if (bassNote && NOTE_FREQ[bassNote]) {
        this._bgmTone(NOTE_FREQ[bassNote], t, stepDur * 0.9, 'triangle', 0.34);
      }
      if (track.hasDrums) {
        if (i % 4 === 0) this._bgmKick(t);
        if (i % 4 === 2) this._bgmHat(t, 0.08);
        else if (i % 2 === 1) this._bgmHat(t, 0.035);
      }

      this.nextNoteTime += stepDur;
      this.stepIndex++;
    }
  }

  _bgmTone(freq, time, dur, type, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  _bgmKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);
    gain.gain.setValueAtTime(0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(time);
    osc.stop(time + 0.11);
  }

  _bgmHat(time, vol) {
    if (!this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    src.start(time);
    src.stop(time + 0.05);
  }

  // ---- Sound Effects ----

  _tone(f0, f1, dur, type = 'sine', vol = 0.35, delay = 0) {
    if (!this.sfxOn || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  jump() {
    this._tone(270, 620, 0.14, 'triangle', 0.42);
    this._tone(360, 740, 0.11, 'sine', 0.22, 0.02);
  }

  doubleJump() {
    this._tone(440, 920, 0.13, 'sine', 0.38);
    this._tone(660, 1240, 0.15, 'triangle', 0.3, 0.045);
  }

  dive() {
    this._tone(520, 170, 0.12, 'triangle', 0.28);
  }

  land() {
    this._tone(130, 58, 0.06, 'sine', 0.24);
  }

  star(streak = 0) {
    const note = STAR_SCALE[streak % STAR_SCALE.length];
    const f = NOTE_FREQ[note];
    this._tone(f, f * 1.01, 0.13, 'triangle', 0.36);
    this._tone(f * 2, f * 2, 0.11, 'sine', 0.18, 0.03);
  }

  jumpOver() {
    this._tone(587.33, 587.33, 0.08, 'triangle', 0.26);
    this._tone(880, 880, 0.12, 'sine', 0.28, 0.055);
  }

  nearMiss() {
    this._tone(783.99, 1174.66, 0.1, 'sine', 0.32);
    this._tone(1046.5, 1567.98, 0.16, 'triangle', 0.28, 0.05);
  }

  shieldUp() {
    this._tone(440, 660, 0.1, 'sine', 0.3);
    this._tone(660, 990, 0.16, 'sine', 0.32, 0.07);
    this._tone(990, 1320, 0.18, 'triangle', 0.22, 0.14);
  }

  shieldBreak() {
    this._tone(620, 180, 0.18, 'sine', 0.38);
    this._tone(420, 90, 0.22, 'triangle', 0.3, 0.04);
  }

  heartUp() {
    this._tone(523.25, 523.25, 0.09, 'sine', 0.32);
    this._tone(659.25, 659.25, 0.09, 'sine', 0.32, 0.07);
    this._tone(783.99, 1046.5, 0.2, 'triangle', 0.35, 0.14);
  }

  signalWarn() {
    // Japanese crosswalk "piyo-piyo" / friendly signal chime
    this._tone(1180, 940, 0.1, 'sine', 0.26);
    this._tone(1180, 940, 0.1, 'sine', 0.26, 0.16);
  }

  feverStart() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((f, i) => {
      this._tone(f, f * 1.02, 0.18, 'triangle', 0.34, i * 0.055);
    });
  }

  smash() {
    this._tone(180, 55, 0.16, 'sawtooth', 0.42);
    this._tone(720, 1280, 0.13, 'triangle', 0.3, 0.03);
  }

  hurt() {
    this._tone(260, 110, 0.22, 'sawtooth', 0.36);
    this._tone(180, 75, 0.25, 'square', 0.25, 0.05);
  }

  countdown(isGo = false) {
    if (isGo) {
      this._tone(783.99, 1046.5, 0.24, 'triangle', 0.4);
    } else {
      this._tone(523.25, 523.25, 0.12, 'triangle', 0.32);
    }
  }

  gameOver() {
    const seq = [523.25, 493.88, 440, 349.23, 329.63];
    seq.forEach((f, i) => {
      this._tone(f, f * 0.96, 0.2, 'triangle', 0.32, i * 0.11);
    });
  }
}

export const sound = new SoundEngine();
