/**
 * Procedural Web Audio API Synthesizer (Milestone 4 - Feature F20)
 * Generates all sound effects dynamically via oscillators and gain envelopes.
 * Zero external audio files or mp3/wav assets.
 * Gracefully handles browser user gesture autoplay restrictions.
 *
 * Pure ES Module - Zero external dependencies.
 */

export class AudioSynth {
  /**
   * @param {Object} [options] - Optional settings (muted, masterVolume).
   */
  constructor(options = {}) {
    this.muted = Boolean(options.muted);
    this.volume = options.masterVolume ?? 0.25;
    this.ctx = null;
    this.masterGain = null;

    // Lazy initialization on first user gesture
    this.initialized = false;
  }

  /**
   * Initializes or resumes the Web Audio context.
   */
  initContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    if (typeof window === 'undefined') {
      return null; // Headless environment
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    try {
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Toggles sound mute on or off.
   * @returns {boolean} New mute state.
   */
  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Sets mute state.
   * @param {boolean} isMuted
   */
  setMuted(isMuted) {
    this.muted = Boolean(isMuted);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Returns current mute status.
   * @returns {boolean}
   */
  isMuted() {
    return this.muted;
  }

  /**
   * Helper to schedule an oscillator tone with envelope.
   */
  playTone(freqStart, freqEnd, duration, type = 'sine', peakGain = 1.0) {
    const ctx = this.initContext();
    if (!ctx || this.muted) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), now + duration);
      }

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch {
      // Ignore audio synthesis errors on locked audio devices
    }
  }

  /**
   * Paddle deflection: clean crisp high-speed chime (sine wave 480Hz -> 640Hz).
   */
  playPaddleHit() {
    this.playTone(480, 640, 0.08, 'triangle', 0.8);
  }

  /**
   * Brick hit or destruction sound.
   * @param {Object} [brick] - Brick metadata.
   */
  playBrickHit(brick) {
    if (!brick) {
      this.playTone(320, 160, 0.06, 'sine', 0.7);
      return;
    }

    if (brick.type === 4 || brick.indestructible) {
      // Metallic corridor wall ricochet
      this.playMetallicRicochet();
    } else if (brick.type === 6) {
      // Bomb explosion
      this.playBombExplosion();
    } else if (brick.type === 5) {
      // Speed booster chime
      this.playBooster();
    } else if (brick.type === 3) {
      // Titanium brick: punchy hit
      this.playTone(400, 200, 0.07, 'triangle', 0.9);
    } else {
      // Standard / Reinforced brick hit
      const pitch = 300 + (brick.row || 0) * 8;
      this.playTone(pitch, pitch * 0.7, 0.06, 'sine', 0.8);
    }
  }

  /**
   * Metallic corridor wall ricochet: sharp metallic ping (1500Hz -> 1200Hz).
   */
  playMetallicRicochet() {
    this.playTone(1500, 1100, 0.07, 'sine', 0.5);
  }

  /**
   * Arena wall bounce ping (800Hz -> 600Hz).
   */
  playWallBounce() {
    this.playTone(820, 680, 0.05, 'triangle', 0.4);
  }

  /**
   * Bomb explosion boom: low frequency descending rumble.
   */
  playBombExplosion() {
    this.playTone(120, 30, 0.35, 'sawtooth', 1.0);
  }

  /**
   * Speed booster chime: rising sparkle.
   */
  playBooster() {
    this.playTone(580, 1160, 0.16, 'triangle', 0.8);
  }

  playMultiball() {
    this.playTone(660, 1320, 0.18, 'triangle', 0.7);
    this.playTone(880, 1760, 0.24, 'sine', 0.5);
  }

  /**
   * Ball launch sound.
   */
  playBallLaunch() {
    this.playTone(280, 560, 0.12, 'sine', 0.6);
  }

  /**
   * Ball lost / life decremented: sad descending buzz.
   */
  playBallLost() {
    this.playTone(240, 80, 0.35, 'sawtooth', 0.9);
  }

  /**
   * Level clear fanfare: 4-note ascending flourish.
   */
  playLevelClear() {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, freq * 1.02, 0.15, 'triangle', 0.8);
      }, idx * 120);
    });
  }

  /**
   * Victory jingle: celebratory multi-note fanfare.
   */
  playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, freq * 1.05, 0.22, 'triangle', 0.9);
      }, idx * 140);
    });
  }

  /**
   * Ingests engine / physics events and triggers procedural sounds.
   * @param {Array} events - Event list from stepPhysics / GameEngine.
   */
  handleEvents(events) {
    if (!Array.isArray(events)) return;
    // Per-frame voice budget: a 32-ball swarm or a bomb cascade would
    // otherwise stack dozens of oscillators into one loud click.
    const budget = { brick: 4, bomb: 1, wall: 2, shield: 1, lost: 1 };
    const spend = key => (budget[key] > 0 ? budget[key]-- > 0 : false);
    for (const ev of events) {
      if (!ev) continue;
      switch (ev.type) {
        case 'PADDLE_HIT':
          this.playPaddleHit();
          break;
        case 'BRICK_HIT':
          if (ev.brick?.type === 6 ? spend('bomb') : spend('brick')) this.playBrickHit(ev.brick);
          break;
        case 'BOMB_CHAIN':
          if (spend('bomb')) this.playBombExplosion();
          break;
        case 'WALL_HIT':
          if (spend('wall')) this.playWallBounce();
          break;
        case 'SHIELD_UP':
          this.playTone(520, 1040, 0.22, 'triangle', 0.7);
          break;
        case 'SHIELD_HIT':
          if (spend('shield')) this.playTone(880, 660, 0.05, 'sine', 0.35);
          break;
        case 'SEEKER_ON':
          this.playTone(700, 1400, 0.25, 'sine', 0.5);
          break;
        case 'BALL_LAUNCHED':
          this.playBallLaunch();
          break;
        case 'MULTIBALL':
          if (ev.spawnedCount > 0) this.playMultiball();
          break;
        case 'BALL_LOST':
        case 'LIFE_LOST':
          if (spend('lost')) this.playBallLost();
          break;
        case 'LEVEL_CLEAR':
          this.playLevelClear();
          break;
        case 'VICTORY':
          this.playVictory();
          break;
        default:
          break;
      }
    }
  }
}
