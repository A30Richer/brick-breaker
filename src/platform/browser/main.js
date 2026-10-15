/**
 * Browser Entry Point & Main Game Loop (Milestone 4 - Features F18, F19, F20, F21)
 * Wires GameEngine, InputManager, CanvasRenderer, and AudioSynth.
 * Runs 60 FPS requestAnimationFrame loop with clamped delta-time.
 *
 * Pure ES Module - Zero external dependencies.
 */

import { DEFAULT_CONFIG, GAME_STATUS } from '../../config.js';
import { GameEngine } from '../../core/engine.js';
import { CanvasRenderer } from './canvas_renderer.js';
import { InputManager } from './input_manager.js';
import { AudioSynth } from './audio_synth.js';
import { makeSeedCode } from '../../core/rng.js';
import { DIFFICULTY_NAMES, DIFFICULTY_PROFILES } from '../../core/map_generator.js';

const SEEN_MAPS_KEY = 'brickBreaker.seenMaps';
const SEEN_MAPS_LIMIT = 400;
const FIXED_DT = 1 / 60;

export class AppShell {
  constructor() {
    this.canvas = null;
    this.engine = null;
    this.renderer = null;
    this.input = null;
    this.audio = null;
    this.lastTimestamp = 0;
    this.isRunning = false;
    this.animationFrameId = null;
    // ?fixed=1 steps the simulation in exact 1/60 s ticks so a seeded run
    // replays identically to the headless autoplay (for recording).
    this.fixedStep = false;
    this.accumulator = 0;
    this.lastMapFingerprint = null;
    this.helpPausedGame = false;
    this.helpPreviousFocus = null;

    // DOM UI elements
    this.dom = {
      botToggleBtn: null,
      pauseBtn: null,
      restartBtn: null,
      levelSelect: null,
      newMapBtn: null,
      muteBtn: null,
      muteIcon: null,
      helpBtn: null,
      closeHelpBtn: null,
      dismissHelpBtn: null,
      helpModal: null
    };

    // Auto-bound loop
    this.loop = this.loop.bind(this);
  }

  /**
   * Initializes all subsystems and starts the game loop.
   */
  init() {
    if (typeof document === 'undefined') return;

    this.canvas = document.getElementById('game-canvas');
    if (!this.canvas) {
      console.warn('AppShell: #game-canvas element not found');
      return;
    }

    // Ensure internal coordinate dimensions match config arena
    this.canvas.width = DEFAULT_CONFIG.arena.width;
    this.canvas.height = DEFAULT_CONFIG.arena.height;

    // Initialize core engine and adapters
    this.engine = new GameEngine(DEFAULT_CONFIG);
    this.renderer = new CanvasRenderer(this.canvas, DEFAULT_CONFIG);
    this.input = new InputManager(this.canvas, window);
    this.audio = new AudioSynth();

    // Cache DOM elements
    this.cacheDomElements();
    this.populateLevelSelect();

    // Wire user interaction listeners
    this.attachDomEvents();
    this.applyUrlOptions();

    // Sync initial UI
    this.syncUI();

    // Start requestAnimationFrame loop
    this.start();
  }

  cacheDomElements() {
    this.dom.botToggleBtn = document.getElementById('bot-toggle-btn');
    this.dom.pauseBtn = document.getElementById('pause-btn');
    this.dom.restartBtn = document.getElementById('restart-btn');
    this.dom.levelSelect = document.getElementById('level-select');
    this.dom.newMapBtn = document.getElementById('new-map-btn');
    this.dom.muteBtn = document.getElementById('mute-btn');
    this.dom.muteIcon = document.getElementById('mute-icon');
    this.dom.helpBtn = document.getElementById('help-btn');
    this.dom.closeHelpBtn = document.getElementById('close-help-btn');
    this.dom.dismissHelpBtn = document.getElementById('dismiss-help-btn');
    this.dom.helpModal = document.getElementById('help-modal');
  }

  populateLevelSelect() {
    if (!this.dom.levelSelect) return;
    const options = [];
    for (let index = 0; index < this.engine.levelManager.getLevelCount(); index++) {
      const level = this.engine.levelManager.getLevel(index);
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `L${index + 1}: ${level.name}`;
      option.title = level.subtitle || level.description || level.name;
      options.push(option);
    }
    const randomGroup = document.createElement('optgroup');
    randomGroup.label = 'Random maps (endless)';
    for (const key of DIFFICULTY_NAMES) {
      const option = document.createElement('option');
      option.value = `random:${key}`;
      option.textContent = `🎲 Random · ${DIFFICULTY_PROFILES[key].label}`;
      randomGroup.append(option);
    }
    this.dom.levelSelect.replaceChildren(...options, randomGroup);
  }

  /** Reads ?seed=&difficulty=&bot=1&fixed=1&level= so runs can be shared and recorded. */
  applyUrlOptions() {
    const params = new URLSearchParams(window.location.search);
    this.fixedStep = params.get('fixed') === '1';
    const level = parseInt(params.get('level'), 10);
    if (params.has('seed') || params.has('random') || params.has('difficulty')) {
      this.startRandom(params.get('difficulty') || 'normal', params.get('seed') || undefined);
    } else if (Number.isInteger(level) && level >= 1 && level <= this.engine.levelManager.getLevelCount()) {
      this.engine.loadLevel(level - 1);
    }
    if (params.get('bot') === '1') this.engine.setBotActive(true);
  }

  loadSeenMaps() {
    try {
      const stored = JSON.parse(window.localStorage?.getItem(SEEN_MAPS_KEY) || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }

  rememberMap(fingerprint) {
    try {
      const seen = this.loadSeenMaps().filter(item => item !== fingerprint);
      seen.push(fingerprint);
      window.localStorage?.setItem(SEEN_MAPS_KEY, JSON.stringify(seen.slice(-SEEN_MAPS_LIMIT)));
    } catch {
      // Storage may be unavailable (private mode); maps still never repeat within a run.
    }
  }

  /**
   * Starts an endless generated run. Without an explicit seed, maps already
   * played on this device are skipped; a shared ?seed= replays exactly.
   */
  startRandom(difficulty = 'normal', seed) {
    const avoid = seed === undefined ? this.loadSeenMaps() : [];
    this.engine.startRandomRun({ seed: seed ?? makeSeedCode(), difficulty, avoid });
  }

  /** Skips to a fresh generated map (starting a run when on the campaign). */
  newRandomMap() {
    if (this.engine.isRandomRun()) this.engine.nextRandomMap();
    else this.startRandom('normal');
  }

  /** Remembers each generated map and keeps ?seed= in the address bar for replay. */
  trackGeneratedMap(state) {
    const map = state?.map;
    if (!map) {
      const params = new URLSearchParams(window.location.search);
      const level = String((state?.levelIndex ?? 0) + 1);
      if (this.lastMapFingerprint || params.has('seed') || params.has('random') || params.has('difficulty') ||
          (params.has('level') && params.get('level') !== level)) {
        params.delete('seed');
        params.delete('random');
        params.delete('difficulty');
        params.set('level', level);
        window.history?.replaceState?.(null, '', `${window.location.pathname}?${params}`);
      }
      this.lastMapFingerprint = null;
      return;
    }
    if (map.fingerprint === this.lastMapFingerprint) return;
    this.lastMapFingerprint = map.fingerprint;
    this.rememberMap(map.fingerprint);
    if (map.runSeed && window.history?.replaceState) {
      const params = new URLSearchParams(window.location.search);
      params.set('seed', map.runSeed);
      params.set('difficulty', map.difficultyKey || 'normal');
      params.delete('level');
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    }
  }

  attachDomEvents() {
    // Unlock Web Audio on first user interaction
    const unlockAudio = () => {
      if (this.audio) this.audio.initContext();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    // Bot toggle button
    if (this.dom.botToggleBtn) {
      this.dom.botToggleBtn.addEventListener('click', () => {
        unlockAudio();
        this.engine.toggleBot();
        this.syncUI();
      });
    }

    // Pause button
    if (this.dom.pauseBtn) {
      this.dom.pauseBtn.addEventListener('click', () => {
        unlockAudio();
        this.engine.togglePause();
        this.syncUI();
      });
    }

    // Restart button
    if (this.dom.restartBtn) {
      this.dom.restartBtn.addEventListener('click', () => {
        unlockAudio();
        this.engine.restartLevel();
        this.syncUI();
      });
    }

    // Level selector dropdown
    if (this.dom.levelSelect) {
      this.dom.levelSelect.addEventListener('change', (e) => {
        unlockAudio();
        const value = String(e.target.value);
        if (value.startsWith('random:')) {
          this.startRandom(value.slice('random:'.length));
          this.syncUI();
          return;
        }
        const levelIdx = parseInt(value, 10);
        if (!isNaN(levelIdx)) {
          this.engine.loadLevel(levelIdx);
          this.syncUI();
        }
      });
    }

    // New random map button
    if (this.dom.newMapBtn) {
      this.dom.newMapBtn.addEventListener('click', () => {
        unlockAudio();
        this.newRandomMap();
        this.syncUI();
      });
    }

    // Sound mute toggle
    if (this.dom.muteBtn) {
      this.dom.muteBtn.addEventListener('click', () => {
        unlockAudio();
        const isMuted = this.audio.toggleMute();
        if (this.dom.muteIcon) {
          this.dom.muteIcon.textContent = isMuted ? '🔇' : '🔊';
        }
      });
    }

    // Hotkeys for mute (M) and a new random map (N)
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      if (e.key === 'n' || e.key === 'N') {
        this.newRandomMap();
        this.syncUI();
      }
      if (e.key === 'm' || e.key === 'M') {
        const isMuted = this.audio.toggleMute();
        if (this.dom.muteIcon) {
          this.dom.muteIcon.textContent = isMuted ? '🔇' : '🔊';
        }
      }
    });

    // Help modal toggles
    const openHelp = () => {
      if (!this.dom.helpModal || !this.dom.helpModal.classList.contains('hidden')) return;
      this.helpPreviousFocus = document.activeElement;
      this.helpPausedGame = this.engine.getState().status === GAME_STATUS.PLAYING;
      if (this.helpPausedGame) this.engine.togglePause();
      this.input?.reset();
      this.dom.helpModal.classList.remove('hidden');
      this.dom.closeHelpBtn?.focus();
      this.syncUI();
    };
    const closeHelp = () => {
      if (!this.dom.helpModal || this.dom.helpModal.classList.contains('hidden')) return;
      this.dom.helpModal.classList.add('hidden');
      this.input?.reset();
      if (this.helpPausedGame && this.engine.getState().status === GAME_STATUS.PAUSED) this.engine.togglePause();
      this.helpPausedGame = false;
      this.helpPreviousFocus?.focus?.();
      this.helpPreviousFocus = null;
      this.syncUI();
    };

    // Read the guide without advancing the game or triggering shortcuts behind it.
    window.addEventListener('keydown', e => {
      if (!this.dom.helpModal || this.dom.helpModal.classList.contains('hidden')) return;
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        closeHelp();
      } else if (e.key === 'Tab') {
        const first = this.dom.closeHelpBtn;
        const last = this.dom.dismissHelpBtn;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }, true);

    if (this.dom.helpBtn) this.dom.helpBtn.addEventListener('click', openHelp);
    if (this.dom.closeHelpBtn) this.dom.closeHelpBtn.addEventListener('click', closeHelp);
    if (this.dom.dismissHelpBtn) this.dom.dismissHelpBtn.addEventListener('click', closeHelp);
    this.dom.helpModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeHelp);
  }

  /**
   * Synchronizes DOM toolbar buttons with current GameEngine state.
   */
  syncUI() {
    const state = this.engine?.getState();
    if (!state) return;

    // Bot toggle button status
    if (this.dom.botToggleBtn) {
      const isBot = Boolean(state.mode?.isBotActive);
      this.dom.botToggleBtn.classList.toggle('active', isBot);
      const textSpan = this.dom.botToggleBtn.querySelector('.btn-text');
      if (textSpan) {
        textSpan.textContent = isBot ? 'AI BOT [B]: ON' : 'AI BOT [B]: OFF';
      }
    }

    // Pause button status
    if (this.dom.pauseBtn) {
      const isPaused = state.status === GAME_STATUS.PAUSED;
      const textSpan = this.dom.pauseBtn.querySelector('.btn-text');
      if (textSpan) {
        textSpan.textContent = isPaused ? 'RESUME' : 'PAUSE';
      }
    }

    // Level selector dropdown sync
    if (this.dom.levelSelect && typeof state.levelIndex === 'number') {
      const value = state.map ? `random:${state.map.difficultyKey || 'normal'}` : String(state.levelIndex);
      if (this.dom.levelSelect.value !== value) {
        this.dom.levelSelect.value = value;
      }
    }
    this.trackGeneratedMap(state);
  }

  /**
   * Starts the animation loop.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTimestamp = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  /**
   * Stops the animation loop.
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Main game loop running at up to 60 FPS.
   * Clamps delta-time to <= 0.05s to prevent large leaps when browser tabs are unfocused.
   */
  loop(timestamp) {
    if (!this.isRunning) return;

    const dtSeconds = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    // Delta-time clamping (<= 0.05s / 50ms)
    const clampedDt = Math.max(0.001, Math.min(dtSeconds, 0.05));

    // 1. Poll normalized inputs
    const inputAction = this.input ? this.input.pollAction() : {};

    // 2. Advance isomorphic game engine (exact 1/60 ticks when ?fixed=1)
    let state;
    let events;
    if (this.dom.helpModal && !this.dom.helpModal.classList.contains('hidden')) {
      this.input?.reset();
      this.accumulator = 0;
      state = this.engine.getState();
      events = [];
    } else if (this.fixedStep) {
      this.accumulator = Math.min(this.accumulator + clampedDt, FIXED_DT * 4);
      events = [];
      let input = inputAction;
      let result = { state: this.engine.getState(), events: [] };
      while (this.accumulator >= FIXED_DT - 1e-9) {
        result = this.engine.tick(FIXED_DT, input);
        events.push(...result.events);
        // Steering persists; one-shot commands apply to the first tick only.
        input = { ...inputAction, launchBall: false, toggleBot: false, togglePause: false, restart: false };
        this.accumulator -= FIXED_DT;
      }
      state = result.state;
    } else {
      ({ state, events } = this.engine.tick(clampedDt, inputAction));
    }

    // 3. Trigger procedural sound effects
    if (this.audio && events && events.length > 0) {
      this.audio.handleEvents(events);
    }

    // 4. Render frame
    if (this.renderer && state) {
      this.renderer.render(state, events, clampedDt);
    }

    // 5. Sync DOM UI (e.g. if level transitioned, bot mode toggled via hotkey, etc.)
    this.syncUI();

    // 6. Schedule next frame
    this.animationFrameId = requestAnimationFrame(this.loop);
  }
}

// Automatically bootstrap when executed in browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const app = new AppShell();
  // Automation handle (recorders, scripted demos): window.brickBreaker.engine.startRandomRun({ seed })
  window.brickBreaker = app;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }
}

export default AppShell;
