/**
 * Smoke every campaign map with the real autonomous controller at 60 FPS.
 * Reports multiball losses separately from life losses; extra balls can be
 * sacrificed while the remaining balls continue making progress.
 * Run: node tests/bot_campaign_benchmark.js [frames-per-level]
 */

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, GAME_STATUS } from '../src/config.js';
import { GameEngine } from '../src/core/engine.js';
import { BRICK_TYPES, LEVEL_DEFINITIONS } from '../src/core/levels.js';

export function runBotCampaignBenchmark({ framesPerLevel = 10000, quiet = false } = {}) {
  assert.ok(Number.isInteger(framesPerLevel) && framesPerLevel > 0, 'Frame budget must be a positive integer');
  const started = performance.now();
  const results = [];
  const failures = [];

  for (let levelIndex = 0; levelIndex < LEVEL_DEFINITIONS.length; levelIndex++) {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.loadLevel(levelIndex);
    engine.setBotActive(true);
    const startingBricks = engine.getState().stats.remainingBreakableBricks;
    const metrics = {
      level: levelIndex + 1,
      name: LEVEL_DEFINITIONS[levelIndex].name,
      frames: 0,
      paddleHits: 0,
      bricksDestroyed: 0,
      ballsLost: 0,
      livesLost: 0,
      maxBalls: 1,
      powerups: {},
      status: GAME_STATUS.READY,
    };
    let previousScore = 0;

    try {
      for (let frame = 0; frame < framesPerLevel; frame++) {
        const { state, events } = engine.tick(1 / 60);
        metrics.frames++;
        metrics.status = state.status;
        metrics.bricksDestroyed = state.stats.bricksDestroyed;
        metrics.maxBalls = Math.max(metrics.maxBalls, state.balls.filter(ball => ball.active).length);

        for (const event of events) {
          if (event.type === 'PADDLE_HIT') metrics.paddleHits++;
          if (event.type === 'BALL_LOST') metrics.ballsLost++;
          if (event.type === 'LIFE_LOST' || event.type === 'GAME_OVER') metrics.livesLost++;
          if (event.type === 'MULTIBALL') {
            const kind = event.kind ?? event.powerup ?? 'multiball';
            metrics.powerups[kind] = (metrics.powerups[kind] ?? 0) + 1;
          }
        }

        assert.ok(Number.isFinite(state.paddle.x) && Number.isFinite(state.paddle.vx), `Frame ${frame}: paddle stays finite`);
        assert.ok(state.paddle.x >= -0.01 && state.paddle.x + state.paddle.width <= state.arena.width + 0.01, `Frame ${frame}: paddle stays inside arena`);
        assert.ok(state.score >= previousScore, `Frame ${frame}: score stays monotonic`);
        previousScore = state.score;
        assert.ok(state.lives >= 0 && state.lives <= DEFAULT_CONFIG.rules.initialLives, `Frame ${frame}: lives stay within bounds`);
        const activeBalls = state.balls.filter(ball => ball.active);
        if (DEFAULT_CONFIG.ball.maxBalls) {
          assert.ok(activeBalls.length <= DEFAULT_CONFIG.ball.maxBalls, `Frame ${frame}: multiball respects its cap`);
        }
        for (const ball of activeBalls) {
          for (const property of ['x', 'y', 'vx', 'vy', 'speed']) {
            assert.ok(Number.isFinite(ball[property]), `Frame ${frame}: ball ${ball.id} ${property} stays finite`);
          }
        }
        const actualRemaining = state.bricks.filter(brick => brick.active && !brick.indestructible && brick.hp > 0).length;
        assert.equal(state.stats.remainingBreakableBricks, actualRemaining, `Frame ${frame}: remaining brick count matches the field`);
        assert.equal(startingBricks - actualRemaining, metrics.bricksDestroyed, `Frame ${frame}: destruction stats match the field`);

        // Stop before advancing into another map so each row measures one map.
        if ([GAME_STATUS.LEVEL_CLEAR, GAME_STATUS.VICTORY, GAME_STATUS.GAME_OVER].includes(state.status)) break;
      }
      assert.ok(metrics.bricksDestroyed > 0, 'Bot destroys bricks on this map');
      assert.ok(metrics.paddleHits > 0, 'Bot successfully returns balls on this map');
      assert.notEqual(metrics.status, GAME_STATUS.GAME_OVER, 'Bot keeps at least one life during this map smoke run');
      if (framesPerLevel >= 10000) {
        for (const kind of ['BALL_DOUBLER', 'EXTRA_BALLS']) {
          const hasPower = LEVEL_DEFINITIONS[levelIndex].layout.some(row => row.includes(String(BRICK_TYPES[kind])));
          if (hasPower) assert.ok(metrics.powerups[kind] > 0, `Bot naturally activates ${kind} on this map`);
        }
      }
    } catch (error) {
      failures.push({ level: metrics.level, name: metrics.name, message: error.message });
    }
    results.push(metrics);
  }

  const durationMs = performance.now() - started;
  if (!quiet) {
    console.table(results.map(result => ({ ...result, powerups: JSON.stringify(result.powerups) })));
    console.log(`Simulated ${results.reduce((sum, result) => sum + result.frames, 0)} frames across ${results.length} maps in ${durationMs.toFixed(1)}ms.`);
    for (const failure of failures) console.error(`Level ${failure.level} (${failure.name}): ${failure.message}`);
    console.log(failures.length ? `FAIL: ${failures.length} map checks failed.` : 'PASS: every map has finite simulation, brick progress, paddle returns, and surviving lives.');
  }
  return { success: failures.length === 0, results, failures, durationMs };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const framesPerLevel = process.argv[2] === undefined ? 10000 : Number(process.argv[2]);
    process.exitCode = runBotCampaignBenchmark({ framesPerLevel }).success ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
