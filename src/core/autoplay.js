/**
 * Headless autoplay: lets the bot play one level definition at a fixed
 * frame rate and reports how the run went. Used to vet generated maps
 * before rendering them (e.g. "clears in under 90 s with a big swarm").
 *
 * Pure ES Module - Zero external dependencies.
 */

import { DEFAULT_CONFIG, GAME_STATUS } from '../config.js';
import { GameEngine } from './engine.js';
import { LevelManager } from './level_manager.js';

/**
 * @param {Object} levelDef - Campaign or generated level definition.
 * @param {Object} [options]
 * @param {number} [options.maxSeconds] - Simulated time budget.
 * @param {number} [options.fps] - Fixed tick rate.
 * @param {Object} [options.config] - Engine config overrides.
 * @param {Function} [options.onFrame] - Optional (state, events, frame) hook, e.g. a recorder.
 * @returns {Object} Run summary.
 */
export function simulateLevel(levelDef, { maxSeconds = 180, fps = 60, config = DEFAULT_CONFIG, onFrame = null } = {}) {
  const engine = new GameEngine(config, new LevelManager([levelDef]));
  engine.setBotActive(true);
  const dt = 1 / fps;
  const maxFrames = Math.ceil(maxSeconds * fps);
  const total = engine.getState().stats.totalBreakableBricks;
  const summary = {
    cleared: false,
    gameOver: false,
    frames: 0,
    seconds: 0,
    totalBricks: total,
    bricksDestroyed: 0,
    percent: 0,
    maxBalls: 1,
    ballsLost: 0,
    livesLost: 0,
    paddleHits: 0,
    multiballs: 0,
    shields: 0,
    chainBlasts: 0,
    longestChain: 0,
    halfClearSeconds: null,
  };

  for (let frame = 0; frame < maxFrames; frame++) {
    const { state, events } = engine.tick(dt);
    summary.frames++;
    for (const event of events) {
      if (event.type === 'BALL_LOST') summary.ballsLost++;
      else if (event.type === 'LIFE_LOST' || event.type === 'GAME_OVER') summary.livesLost++;
      else if (event.type === 'PADDLE_HIT') summary.paddleHits++;
      else if (event.type === 'MULTIBALL' && event.spawnedCount > 0) summary.multiballs++;
      else if (event.type === 'SHIELD_UP') summary.shields++;
      else if (event.type === 'BOMB_CHAIN') {
        summary.chainBlasts++;
        summary.longestChain = Math.max(summary.longestChain, event.depth || 0);
      }
    }
    const activeBalls = state.balls.filter(ball => ball.active).length;
    summary.maxBalls = Math.max(summary.maxBalls, activeBalls);
    summary.bricksDestroyed = state.stats.bricksDestroyed;
    if (summary.halfClearSeconds === null && summary.bricksDestroyed * 2 >= total) {
      summary.halfClearSeconds = +(summary.frames / fps).toFixed(2);
    }
    if (onFrame) onFrame(state, events, frame);

    if (state.status === GAME_STATUS.LEVEL_CLEAR || state.status === GAME_STATUS.VICTORY) {
      summary.cleared = true;
      break;
    }
    if (state.status === GAME_STATUS.GAME_OVER) {
      summary.gameOver = true;
      break;
    }
  }

  summary.seconds = +(summary.frames / fps).toFixed(2);
  summary.percent = total ? +((100 * summary.bricksDestroyed) / total).toFixed(1) : 100;
  return summary;
}

export default simulateLevel;
