const NOTE_FREQ = {
  A2: 110.0, B2: 123.47,
  C3: 130.81, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, G3: 196.0, Ab3: 207.65, A3: 220.0, Bb3: 233.08, B3: 246.94,
  C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, G4: 392.0, Ab4: 415.3, A4: 440.0, Bb4: 466.16, B4: 493.88,
  C5: 523.25, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, G5: 783.99, Ab5: 830.61, A5: 880.0, Bb5: 932.33, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98,
};

const STAR_SCALE = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'];

const TRACKS = {
  title: {
    bpm: 112,
    lead: [
      'E5', null, 'G5', null, 'A5', null, 'G5', 'E5',
      'D5', null, 'E5', null, 'C5', null, null, null,
      'F5', null, 'A5', null, 'G5', null, 'E5', null,
      'D5', 'E5', 'G5', null, 'E5', null, null, null,
    ],
    harmony: [
      'C4', null, null, null, 'E4', null, null, null,
      'B3', null, null, null, 'G3', null, null, null,
      'A3', null, null, null, 'C4', null, null, null,
      'B3', null, 'D4', null, 'C4', null, null, null,
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
    bpm: 138,
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
    harmony: [
      'G4', null, null, 'E4', null, null, 'E4', null,
      'C4', null, 'G4', null, 'E4', null, null, null,
      'C4', null, 'F4', null, 'C4', null, null, null,
      'B3', null, 'D4', null, 'D4', null, null, null,
      'C4', null, 'E4', null, 'G4', null, 'E4', null,
      'C4', null, 'B3', null, 'G3', null, null, null,
      'C4', null, 'D4', null, 'C4', null, 'G4', null,
      'G4', null, 'F4', null, 'E4', null, null, null,
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
  sunset: {
    bpm: 132,
    lead: [
      'A5', null, 'G5', 'E5', 'D5', null, 'E5', null,
      'G5', null, 'A5', 'C6', 'A5', null, null, null,
      'F5', null, 'G5', 'A5', 'G5', null, 'E5', 'D5',
      'E5', null, 'G5', null, 'A5', null, null, null,
    ],
    harmony: [
      'E4', null, null, 'C4', 'A3', null, 'C4', null,
      'D4', null, 'E4', null, 'E4', null, null, null,
      'C4', null, 'D4', null, 'C4', null, 'B3', null,
      'C4', null, 'D4', null, 'E4', null, null, null,
    ],
    bass: [
      'F3', null, 'F3', 'C3', 'G3', null, 'G3', null,
      'E3', null, 'E3', 'G3', 'A3', null, 'E3', null,
      'D3', null, 'D3', 'A3', 'G3', null, 'D3', null,
      'C3', null, 'E3', null, 'A3', null, 'G3', null,
    ],
    wave: 'triangle',
    hasDrums: true,
  },
  night: {
    bpm: 146,
    lead: [
      'C5', 'Eb5', 'G5', null, 'Bb5', null, 'G5', 'F5',
      'Eb5', null, 'G5', 'F5', 'Eb5', 'D5', 'C5', null,
      'Ab5', null, 'G5', 'F5', 'G5', null, 'Eb5', null,
      'F5', 'G5', 'Bb5', null, 'C6', null, null, null,
    ],
    harmony: [
      'G4', null, 'Eb4', null, 'G4', null, 'D4', null,
      'C4', null, 'Eb4', null, 'C4', null, null, null,
      'Eb4', null, 'D4', null, 'Eb4', null, 'C4', null,
      'D4', null, 'F4', null, 'G4', null, null, null,
    ],
    bass: [
      'C3', 'C3', 'C4', 'C3', 'Bb3', 'Bb3', 'G3', 'G3',
      'Ab3', 'Ab3', 'Ab3', 'G3', 'F3', 'F3', 'G3', 'G3',
      'Ab3', 'Ab3', 'Eb3', 'Eb3', 'G3', 'G3', 'C3', 'C3',
      'F3', 'F3', 'G3', 'G3', 'C3', 'G3', 'C4', null,
    ],
    wave: 'sawtooth',
    hasDrums: true,
  },
  fever: {
    bpm: 170,
    lead: [
      'C6', 'G5', 'E5', 'G5', 'C6', 'D6', 'E6', null,
      'D6', 'C6', 'A5', 'G5', 'A5', 'C6', 'D6', null,
      'E6', 'C6', 'A5', 'C6', 'G6', 'E6', 'D6', 'C6',
      'D6', 'E6', 'G6', null, 'E6', null, 'C6', null,
    ],
    harmony: [
      'E5', null, 'C5', null, 'E5', null, 'G5', null,
      'F5', null, 'D5', null, 'F5', null, 'A5', null,
      'A5', null, 'F5', null, 'G5', null, 'E5', null,
      'G5', null, 'B5', null, 'G5', null, 'E5', null,
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
    this.bgmGain.gain.value = this.bgmOn ? 0.22 : 0;
    this.bgmGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxOn ? 0.56 : 0;
    this.sfxGain.connect(this.masterGain);

    const len = Math.floor(this.ctx.sampleRate * 0.24);
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
      this.bgmGain.gain.setTargetAtTime(this.bgmOn ? 0.22 : 0, this.ctx.currentTime, 0.03);
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
      this.sfxGain.gain.setTargetAtTime(this.sfxOn ? 0.56 : 0, this.ctx.currentTime, 0.02);
    }
  }

  setTempoMultiplier(mult) {
    this.tempoMult = Math.max(0.85, Math.min(1.28, mult));
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

    const adaptive = this.currentTrack !== 'title' && this.currentTrack !== 'fever';
    const bpm = track.bpm * (adaptive ? this.tempoMult : 1);
    const stepDur = 60 / bpm / 2;

    while (this.nextNoteTime < this.ctx.currentTime + 0.14) {
      const i = this.stepIndex % track.lead.length;
      const t = this.nextNoteTime;

      const leadNote = track.lead[i];
      if (leadNote && NOTE_FREQ[leadNote]) {
        this._bgmTone(NOTE_FREQ[leadNote], t, stepDur * 0.85, track.wave, 0.2);
      }
      const harmNote = track.harmony && track.harmony[i];
      if (harmNote && NOTE_FREQ[harmNote]) {
        this._bgmTone(NOTE_FREQ[harmNote], t, stepDur * 0.9, 'triangle', 0.13);
      }
      const bassNote = track.bass[i];
      if (bassNote && NOTE_FREQ[bassNote]) {
        this._bgmTone(NOTE_FREQ[bassNote], t, stepDur * 0.9, 'triangle', 0.34);
      }
      if (track.hasDrums) {
        if (i % 4 === 0) this._bgmKick(t);
        if (i % 8 === 4) this._bgmSnare(t);
        if (i % 2 === 1) this._bgmHat(t, 0.04);
      }

      this.nextNoteTime += stepDur;
      this.stepIndex++;
    }
  }

  _bgmTone(freq, time, dur, type, vol) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = type === 'sawtooth' ? 2400 : 4200;
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  _bgmKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);
    gain.gain.setValueAtTime(0.46, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(time);
    osc.stop(time + 0.11);
  }

  _bgmSnare(time) {
    if (!this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    src.start(time);
    src.stop(time + 0.1);
  }

  _bgmHat(time, vol) {
    if (!this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6800;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    src.start(time);
    src.stop(time + 0.045);
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

  uiClick() {
    this._tone(660, 880, 0.05, 'triangle', 0.22);
  }

  jump() {
    this._tone(280, 640, 0.13, 'triangle', 0.42);
    this._tone(380, 760, 0.11, 'sine', 0.22, 0.02);
  }

  doubleJump() {
    this._tone(460, 960, 0.13, 'sine', 0.38);
    this._tone(680, 1280, 0.15, 'triangle', 0.3, 0.045);
  }

  dive() {
    this._tone(540, 165, 0.12, 'triangle', 0.28);
  }

  land() {
    this._tone(135, 58, 0.06, 'sine', 0.24);
  }

  stompBounce() {
    this._tone(190, 620, 0.14, 'triangle', 0.44);
    this._tone(523.25, 1046.5, 0.16, 'sine', 0.34, 0.04);
  }

  springLaunch() {
    this._tone(240, 1180, 0.26, 'triangle', 0.44);
    this._tone(480, 1560, 0.22, 'sine', 0.28, 0.05);
  }

  telegraph() {
    this._tone(980, 980, 0.06, 'square', 0.14);
    this._tone(1280, 1280, 0.07, 'square', 0.14, 0.08);
  }

  star(streak = 0) {
    const note = STAR_SCALE[streak % STAR_SCALE.length];
    const f = NOTE_FREQ[note];
    this._tone(f, f * 1.01, 0.13, 'triangle', 0.36);
    this._tone(f * 2, f * 2, 0.11, 'sine', 0.18, 0.03);
  }

  jumpOver() {
    this._tone(587.33, 587.33, 0.08, 'triangle', 0.25);
    this._tone(880, 880, 0.12, 'sine', 0.26, 0.05);
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
    this._tone(1180, 940, 0.1, 'sine', 0.26);
    this._tone(1180, 940, 0.1, 'sine', 0.26, 0.16);
  }

  feverStart() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((f, i) => {
      this._tone(f, f * 1.02, 0.18, 'triangle', 0.35, i * 0.055);
    });
  }

  stageClear() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5];
    notes.forEach((f, i) => {
      this._tone(f, f * 1.01, i === 5 ? 0.35 : 0.14, 'triangle', 0.36, i * 0.08);
    });
  }

  missionComplete() {
    [659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
      this._tone(f, f, 0.15, 'sine', 0.3, i * 0.065);
    });
  }

  shopBuy() {
    [587.33, 880, 1174.66].forEach((f, i) => {
      this._tone(f, f * 1.02, 0.16, 'triangle', 0.32, i * 0.06);
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
