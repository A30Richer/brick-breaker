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

    // DOM UI elements
    this.dom = {
      botToggleBtn: null,
      pauseBtn: null,
      restartBtn: null,
      levelSelect: null,
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

    // Wire user interaction listeners
    this.attachDomEvents();

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
    this.dom.muteBtn = document.getElementById('mute-btn');
    this.dom.muteIcon = document.getElementById('mute-icon');
    this.dom.helpBtn = document.getElementById('help-btn');
    this.dom.closeHelpBtn = document.getElementById('close-help-btn');
    this.dom.dismissHelpBtn = document.getElementById('dismiss-help-btn');
    this.dom.helpModal = document.getElementById('help-modal');
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
        const levelIdx = parseInt(e.target.value, 10);
        if (!isNaN(levelIdx)) {
          this.engine.loadLevel(levelIdx);
          this.syncUI();
        }
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

    // Hotkey for mute (M)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        const isMuted = this.audio.toggleMute();
        if (this.dom.muteIcon) {
          this.dom.muteIcon.textContent = isMuted ? '🔇' : '🔊';
        }
      }
    });

    // Help modal toggles
    const openHelp = () => {
      if (this.dom.helpModal) this.dom.helpModal.classList.remove('hidden');
    };
    const closeHelp = () => {
      if (this.dom.helpModal) this.dom.helpModal.classList.add('hidden');
    };

    if (this.dom.helpBtn) this.dom.helpBtn.addEventListener('click', openHelp);
    if (this.dom.closeHelpBtn) this.dom.closeHelpBtn.addEventListener('click', closeHelp);
    if (this.dom.dismissHelpBtn) this.dom.dismissHelpBtn.addEventListener('click', closeHelp);
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
      if (this.dom.levelSelect.value !== String(state.levelIndex)) {
        this.dom.levelSelect.value = String(state.levelIndex);
      }
    }
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

    // 2. Advance isomorphic game engine
    const { state, events } = this.engine.tick(clampedDt, inputAction);

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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }
}

export default AppShell;
