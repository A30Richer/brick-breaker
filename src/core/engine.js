/**
 * GameEngine - Pure Isomorphic Simulation Coordinator
 * 
 * Features:
 * - Decoupled isomorphic architecture runnable in both Node.js and Browser environments
 * - Finite state machine managing full game lifecycle:
 *   READY -> PLAYING -> PAUSED -> LEVEL_CLEAR -> GAME_OVER -> VICTORY
 * - Multi-level progression and catalog management via LevelManager
 * - Seamless autonomous bot AI integration and toggling without state resets
 * - Deterministic headless tick simulation for benchmarking and testing
 * 
 * Pure ES Module - Zero external dependencies.
 */

import { DEFAULT_CONFIG, GAME_STATUS } from '../config.js';
import { createInitialState } from './state.js';
import { stepPhysics } from './physics.js';
import { computeBotAction } from './bot.js';
import { LevelManager } from './level_manager.js';
import { LEVEL_DEFINITIONS } from './levels.js';
import { MapSequence } from './map_generator.js';

export class GameEngine {
  /**
   * Initializes the GameEngine with optional configuration and level manager.
   *
   * @param {Object} [config] - System configuration overrides.
   * @param {LevelManager} [levelManager] - Optional custom LevelManager instance.
   */
  constructor(config = DEFAULT_CONFIG, levelManager = null) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      arena: { ...DEFAULT_CONFIG.arena, ...(config?.arena || {}) },
      paddle: { ...DEFAULT_CONFIG.paddle, ...(config?.paddle || {}) },
      ball: { ...DEFAULT_CONFIG.ball, ...(config?.ball || {}) },
      physics: { ...DEFAULT_CONFIG.physics, ...(config?.physics || {}) },
      grid: { ...DEFAULT_CONFIG.grid, ...(config?.grid || {}) },
      rules: { ...DEFAULT_CONFIG.rules, ...(config?.rules || {}) }
    };

    this.levelManager = levelManager || new LevelManager(LEVEL_DEFINITIONS);
    this.state = null;
    this.currentLevelIndex = 0;
    this.currentLevelDef = null;
    this.randomRun = null; // MapSequence while an endless procedural run is active

    // Load initial level (Level 1 / index 0)
    this.loadLevel(0);
  }

  /**
   * Loads a specific level by 0-based index.
   * Preserves score, lives, and bot activation state across level transitions.
   *
   * @param {number} [index] - 0-based level index (defaults to 0).
   * @returns {Object} Newly initialized GameState.
   */
  loadLevel(index = 0) {
    const levelDef = this.levelManager.getLevel(index);
    this.levelManager.setCurrentLevelIndex(index);
    this.randomRun = null;
    return this.applyLevelDefinition(levelDef, index);
  }

  /**
   * Builds a fresh GameState for any level definition (campaign or generated),
   * carrying score, lives, and bot mode over unless overridden.
   */
  applyLevelDefinition(levelDef, index, { score, lives } = {}) {
    this.currentLevelIndex = index;
    this.currentLevelDef = levelDef;

    const prevScore = score ?? this.state?.score ?? 0;
    const prevLives = lives ?? this.state?.lives ?? (this.config.rules?.initialLives ?? 3);
    const isBotActive = this.state?.mode?.isBotActive ?? false;

    this.state = createInitialState(this.config, levelDef);
    this.state.score = prevScore;
    this.state.lives = prevLives;
    this.state.mode.isBotActive = isBotActive;
    this.state.levelIndex = index;
    this.state.levelName = levelDef.name || `Level ${index + 1}`;
    labelLevel(this.state, levelDef);

    return this.state;
  }

  /**
   * Starts an endless run of procedurally generated maps.
   * Clearing a map generates the next one instead of advancing the campaign.
   *
   * @param {Object} [options] - { seed, difficulty: 'chill'|'normal'|'hard', avoid: fingerprints[] }.
   * @returns {Object} GameState of the first generated map.
   */
  startRandomRun({ seed, difficulty = 'normal', avoid = [] } = {}) {
    this.randomRun = new MapSequence({ seed, difficulty, avoid });
    const levelDef = this.randomRun.next();
    return this.applyLevelDefinition(levelDef, levelDef.runIndex - 1, {
      score: 0,
      lives: this.config.rules?.initialLives ?? 3
    });
  }

  /**
   * Generates and loads the next map of the active random run (starting one if needed).
   * @returns {Object} GameState of the new map.
   */
  nextRandomMap() {
    if (!this.randomRun) return this.startRandomRun();
    const levelDef = this.randomRun.next();
    return this.applyLevelDefinition(levelDef, levelDef.runIndex - 1);
  }

  /** @returns {boolean} True while an endless procedural run is active. */
  isRandomRun() {
    return this.randomRun !== null;
  }

  /**
   * Restarts the current active level.
   * Resets balls, paddle, and bricks to READY state while preserving current score and lives.
   *
   * @returns {Object} Reset GameState.
   */
  restartLevel() {
    const isBotActive = this.state?.mode?.isBotActive ?? false;
    const currentScore = this.state?.score ?? 0;
    const currentLives = this.state?.lives > 0 ? this.state.lives : (this.config.rules?.initialLives ?? 3);

    const levelDef = this.currentLevelDef ?? this.levelManager.getLevel(this.currentLevelIndex);
    this.state = createInitialState(this.config, levelDef);
    this.state.mode.isBotActive = isBotActive;
    this.state.score = currentScore;
    this.state.lives = currentLives;
    this.state.levelIndex = this.currentLevelIndex;
    this.state.levelName = levelDef.name || `Level ${this.currentLevelIndex + 1}`;
    labelLevel(this.state, levelDef);

    return this.state;
  }

  /**
   * Resets the entire game back to Level 1 with 0 score and default initial lives.
   *
   * @returns {Object} Fresh initial GameState.
   */
  restartGame() {
    if (this.randomRun) {
      // Replay the same run from its first map with a fresh score.
      return this.startRandomRun({ seed: this.randomRun.seed, difficulty: this.randomRun.difficulty });
    }
    this.levelManager.resetLevelProgression();
    this.currentLevelIndex = 0;
    const isBotActive = this.state?.mode?.isBotActive ?? false;

    const levelDef = this.levelManager.getLevel(0);
    this.currentLevelDef = levelDef;
    this.state = createInitialState(this.config, levelDef);
    this.state.mode.isBotActive = isBotActive;
    this.state.score = 0;
    this.state.lives = this.config.rules?.initialLives ?? 3;
    this.state.levelIndex = 0;
    this.state.levelName = levelDef.name || 'Level 1';
    labelLevel(this.state, levelDef);

    return this.state;
  }

  /**
   * Advances progression to the next level in the campaign.
   * If all levels are complete, transitions to VICTORY state.
   *
   * @returns {Object} Updated GameState.
   */
  nextLevel() {
    if (this.randomRun) return this.nextRandomMap();
    if (this.levelManager.hasNextLevel()) {
      const nextIdx = this.levelManager.advanceLevel();
      return this.loadLevel(nextIdx);
    } else {
      if (this.state) {
        this.state.status = GAME_STATUS.VICTORY;
      }
      return this.state;
    }
  }

  /**
   * Toggles pause state between PLAYING and PAUSED.
   *
   * @returns {boolean} True if paused, false if unpaused or ignored.
   */
  togglePause() {
    if (!this.state) return false;

    if (this.state.status === GAME_STATUS.PLAYING) {
      this.state.status = GAME_STATUS.PAUSED;
      return true;
    } else if (this.state.status === GAME_STATUS.PAUSED) {
      this.state.status = GAME_STATUS.PLAYING;
      return false;
    }

    return false;
  }

  /**
   * Seamlessly toggles autonomous bot player mode on or off.
   * Never resets paddle position, ball position, lives, score, or level progression.
   *
   * @returns {boolean} New bot active state.
   */
  toggleBot() {
    if (!this.state) return false;
    this.state.mode.isBotActive = !this.state.mode.isBotActive;
    return this.state.mode.isBotActive;
  }

  /**
   * Explicitly sets autonomous bot player mode active or inactive.
   * Never resets simulation or game progress.
   *
   * @param {boolean} active - Desired bot active state.
   */
  setBotActive(active) {
    if (!this.state) return;
    this.state.mode.isBotActive = Boolean(active);
  }

  /**
   * Launches the ball from the paddle when in READY state.
   *
   * @returns {Array} Events generated by the launch.
   */
  launchBall(dt = 1 / 60) {
    if (!this.state) return [];
    if (this.state.status === GAME_STATUS.READY) {
      return stepPhysics(this.state, { launchBall: true }, dt, this.config);
    }
    return [];
  }

  /**
   * Returns the current GameState snapshot.
   *
   * @returns {Object|null} GameState reference.
   */
  getState() {
    return this.state;
  }

  /**
   * Injects or restores an external GameState snapshot.
   *
   * @param {Object} state - GameState to restore.
   */
  setState(state) {
    if (!state || typeof state !== 'object') {
      throw new TypeError('setState: Invalid GameState object');
    }
    this.state = state;
    if (typeof state.levelIndex === 'number' && state.levelIndex >= 0) {
      this.currentLevelIndex = state.levelIndex;
      try {
        this.levelManager.setCurrentLevelIndex(state.levelIndex);
      } catch {
        // Handle custom level indices
      }
    }
  }

  /**
   * Advances simulation by dt seconds.
   * Integrates inputs, bot decision-making, physics sub-stepping, and state transitions.
   *
   * @param {number} [dt] - Delta time in seconds (default 1/60).
   * @param {Object} [externalInput] - External input action or hotkey signals.
   * @returns {Object} { state: GameState, events: Array }
   */
  tick(dt = 1 / 60, externalInput = {}) {
    if (!this.state) {
      return { state: null, events: [] };
    }

    const events = [];

    // 1. Process hotkey / meta commands
    if (externalInput.toggleBot || externalInput.key === 'b' || externalInput.key === 'B') {
      const active = this.toggleBot();
      events.push({ type: 'BOT_TOGGLED', isBotActive: active });
    }

    if (externalInput.togglePause || externalInput.key === 'p' || externalInput.key === 'P' || externalInput.key === 'Escape') {
      const isPaused = this.togglePause();
      events.push({ type: isPaused ? 'PAUSED' : 'RESUMED' });
    }

    if (externalInput.restart || externalInput.key === 'r' || externalInput.key === 'R') {
      this.restartLevel();
      events.push({ type: 'LEVEL_RESTARTED', levelIndex: this.currentLevelIndex });
      return { state: this.state, events };
    }

    // 2. If simulation is paused, freeze physics and return
    if (this.state.status === GAME_STATUS.PAUSED) {
      return { state: this.state, events };
    }

    // 3. If in terminal state (GAME_OVER or VICTORY), do not advance simulation
    if (this.state.status === GAME_STATUS.GAME_OVER || this.state.status === GAME_STATUS.VICTORY) {
      return { state: this.state, events };
    }

    // 4. If in LEVEL_CLEAR state, progress to next level (or victory)
    if (this.state.status === GAME_STATUS.LEVEL_CLEAR) {
      if (this.randomRun) {
        this.nextRandomMap();
        events.push({ type: 'LEVEL_ADVANCED', levelIndex: this.currentLevelIndex });
        events.push({ type: 'MAP_GENERATED', map: this.state.map });
        return { state: this.state, events };
      }
      if (this.levelManager.hasNextLevel()) {
        const nextIdx = this.levelManager.advanceLevel();
        this.loadLevel(nextIdx);
        events.push({ type: 'LEVEL_ADVANCED', levelIndex: nextIdx });
        return { state: this.state, events };
      } else {
        this.state.status = GAME_STATUS.VICTORY;
        events.push({ type: 'VICTORY' });
        return { state: this.state, events };
      }
    }

    // 5. Determine effective input action (Bot AI vs External Input)
    let inputAction;
    if (this.state.mode.isBotActive) {
      const botAction = computeBotAction(this.state, dt, this.config);

      // Manual player steering overrides bot if actively commanded
      const hasPlayerMove = externalInput.moveLeft || externalInput.moveRight;
      const hasPlayerTarget = externalInput.targetX !== undefined && externalInput.targetX !== null;

      inputAction = {
        moveLeft: hasPlayerMove ? Boolean(externalInput.moveLeft) : botAction.moveLeft,
        moveRight: hasPlayerMove ? Boolean(externalInput.moveRight) : botAction.moveRight,
        targetX: hasPlayerTarget ? externalInput.targetX : (hasPlayerMove ? null : botAction.targetX),
        launchBall: Boolean(externalInput.launchBall || externalInput.key === ' ' || botAction.launchBall)
      };
    } else {
      inputAction = {
        moveLeft: Boolean(externalInput.moveLeft),
        moveRight: Boolean(externalInput.moveRight),
        targetX: externalInput.targetX !== undefined ? externalInput.targetX : null,
        launchBall: Boolean(externalInput.launchBall || externalInput.key === ' ')
      };
    }

    // 6. Step physics with continuous collision detection
    const physicsEvents = stepPhysics(this.state, inputAction, dt, this.config);
    events.push(...physicsEvents);

    // 7. Post-physics level progression & victory evaluation (random runs never end)
    if (this.state.status === GAME_STATUS.LEVEL_CLEAR && !this.randomRun) {
      if (!this.levelManager.hasNextLevel() || this.currentLevelIndex >= this.levelManager.getLevelCount() - 1) {
        this.state.status = GAME_STATUS.VICTORY;
        events.push({ type: 'VICTORY' });
      }
    }

    return { state: this.state, events };
  }
}

/** Copies display labels (and the generated-map summary) onto a fresh GameState. */
function labelLevel(state, levelDef) {
  state.levelSubtitle = levelDef.subtitle || '';
  state.levelDifficulty = levelDef.difficulty || '';
  state.map = levelDef.generated ? describeGeneratedMap(levelDef) : null;
}

/** Small serializable summary of a generated map, kept on GameState for HUD/recording. */
function describeGeneratedMap(levelDef) {
  return {
    seed: levelDef.seed,
    runSeed: levelDef.runSeed ?? null,
    runIndex: levelDef.runIndex ?? null,
    name: levelDef.name,
    subtitle: levelDef.subtitle,
    difficulty: levelDef.difficulty,
    difficultyKey: levelDef.difficultyKey,
    fingerprint: levelDef.fingerprint,
    signature: levelDef.signature
  };
}

export default GameEngine;
