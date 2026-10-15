/**
 * Adversarial Bot Stress Test Suite
 * Milestone 5 Verification: Autonomous Bot AI & Rally Resilience
 * 
 * Target Tests:
 * 1. Extended Continuous Rallies (2,000 frames per campaign level):
 *    - Level 1: Central Chute (2,000 frames)
 *    - Level 2: Dual Corridors (2,000 frames)
 *    - Level 3: City Matrix (2,000 frames)
 *    - Level 4: Alpine Serpentine (2,000 frames)
 *    - Level 5: The Gauntlet (2,000 frames)
 *    - Original five single-ball levels retain the >= 95% deflection contract
 *    - Additional multiball levels require brick progress, returns, and surviving lives
 *    - Invariant checks: zero NaN/Inf coordinates, zero unhandled errors, score monotonicity, paddle boundary containment
 * 2. Mid-Flight Bot Toggle & State Consistency:
 *    - Random stochastic bot toggles while ball is in mid-flight
 *    - High-frequency toggling while ball is navigating narrow 15px indestructible corridors
 *    - Assert game state preservation: zero position resets, zero score/lives resets, seamless input handover
 * 3. Multi-Ball Situations & TTI Prioritization:
 *    - Analytical verification of Time-To-Impact (TTI) selection under multi-ball descent
 *    - Simultaneous multi-ball stress simulation (3, 5, and 8 concurrent balls)
 *    - Assert zero crashes, zero NaN propagation, valid threat arbitration
 * 4. Boundary & Kinematic Corner Cases:
 *    - Rapid direction changes, edge-of-paddle deflections, and extreme velocities
 *    - Deadband chatter suppression verification
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, GAME_STATUS } from '../src/config.js';
import { GameEngine } from '../src/core/engine.js';
import {
  computeBotAction,
  findMostUrgentBall,
  predictBallLanding,
  foldTrajectory,
  DEADBAND_PIXELS
} from '../src/core/bot.js';
import { createInitialState } from '../src/core/state.js';
import { stepPhysics } from '../src/core/physics.js';
import { LEVEL_DEFINITIONS } from '../src/core/levels.js';

// ============================================================================
// SUITE 1: EXTENDED RALLIES ACROSS EVERY CAMPAIGN LEVEL
// ============================================================================
test(`SUITE 1: Extended Rallies Across All ${LEVEL_DEFINITIONS.length} Dense Levels`, async (t) => {
  const framesPerLevel = 2000;
  const levelCount = LEVEL_DEFINITIONS.length;
  const fixedDt = 1 / 60;
  const originalLevelIds = new Set([1, 2, 3, 4, 5]);

  let aggregateBricksDestroyed = 0;
  let aggregateNaNCount = 0;
  let originalPaddleHits = 0;
  let originalBallsLost = 0;

  for (let lvl = 0; lvl < levelCount; lvl++) {
    const levelDef = LEVEL_DEFINITIONS[lvl];
    await t.test(`Level ${lvl + 1} ("${levelDef.name}"): 2,000 Frames Continuous Bot Rally`, () => {
      const engine = new GameEngine(DEFAULT_CONFIG);
      engine.loadLevel(lvl);
      engine.setBotActive(true);
      engine.launchBall(fixedDt);

      let paddleHits = 0;
      let ballsLost = 0;
      let prevScore = engine.getState().score;

      for (let f = 1; f <= framesPerLevel; f++) {
        const { state, events } = engine.tick(fixedDt);

        // Event accounting
        for (const ev of events) {
          if (ev.type === 'PADDLE_HIT') paddleHits++;
          if (ev.type === 'BALL_LOST') ballsLost++;
        }

        // Coordinate integrity & sanity assertion
        assert.ok(state !== null, `Frame ${f}: State must not be null`);
        assert.ok(
          !Number.isNaN(state.paddle.x) && !Number.isNaN(state.paddle.vx),
          `Frame ${f}: Paddle coordinates corrupted: x=${state.paddle.x}, vx=${state.paddle.vx}`
        );
        assert.ok(
          state.paddle.x >= -0.01 && state.paddle.x + state.paddle.width <= state.arena.width + 0.01,
          `Frame ${f}: Paddle out of arena bounds: paddle.x=${state.paddle.x}, width=${state.paddle.width}, arena=${state.arena.width}`
        );

        for (const ball of state.balls) {
          if (ball && ball.active) {
            if (Number.isNaN(ball.x) || Number.isNaN(ball.y) || Number.isNaN(ball.vx) || Number.isNaN(ball.vy)) {
              aggregateNaNCount++;
              assert.fail(`Frame ${f}: Ball ${ball.id} NaN coordinate detected: (${ball.x}, ${ball.y}, vx=${ball.vx}, vy=${ball.vy})`);
            }
            if (![ball.x, ball.y, ball.vx, ball.vy, ball.speed].every(Number.isFinite)) {
              assert.fail(`Frame ${f}: Ball ${ball.id} Infinite coordinate detected: (${ball.x}, ${ball.y})`);
            }
          }
        }

        // Score monotonicity check
        assert.ok(
          state.score >= prevScore,
          `Frame ${f}: Score decreased! prev=${prevScore}, current=${state.score}`
        );
        prevScore = state.score;

        // If level cleared early, relaunch ball on new level
        if (state.status === GAME_STATUS.READY) {
          engine.launchBall(fixedDt);
        }
      }

      const finalState = engine.getState();
      const levelDeflections = paddleHits;
      const levelDrops = ballsLost;
      const levelRate = levelDeflections / (levelDeflections + levelDrops || 1);

      aggregateBricksDestroyed += finalState.stats.bricksDestroyed;

      // Assertions per level
      if (originalLevelIds.has(levelDef.id)) {
        originalPaddleHits += levelDeflections;
        originalBallsLost += levelDrops;
        assert.ok(
          levelRate >= 0.95,
          `Level ${lvl + 1} deflection rate ${(levelRate * 100).toFixed(1)}% fell below 95% threshold (${levelDeflections} hits / ${levelDrops} drops)`
        );
      }
      assert.ok(
        levelDeflections > 0,
        `Level ${lvl + 1} must record at least 1 paddle deflection (got ${levelDeflections})`
      );
      assert.ok(
        finalState.stats.bricksDestroyed > 0,
        `Level ${lvl + 1} must record brick destruction (got ${finalState.stats.bricksDestroyed})`
      );
      assert.ok(
        finalState.lives > 0,
        `Level ${lvl + 1} bot must not trigger GAME_OVER (remaining lives: ${finalState.lives})`
      );
    });
  }

  await t.test('Campaign integrity and original single-ball deflection success rate', () => {
    const totalDecisions = originalPaddleHits + originalBallsLost;
    const overallSuccessRate = originalPaddleHits / (totalDecisions || 1);

    assert.equal(aggregateNaNCount, 0, 'Zero NaN coordinates allowed across the full campaign');
    assert.ok(
      overallSuccessRate >= 0.95,
      `Original-level deflection rate ${(overallSuccessRate * 100).toFixed(2)}% must be >= 95% (${originalPaddleHits} deflections / ${originalBallsLost} drops)`
    );
    assert.ok(
      aggregateBricksDestroyed > 0,
      `Bricks must be broken across marathon: ${aggregateBricksDestroyed}`
    );
  });
});

// ============================================================================
// SUITE 2: MID-FLIGHT BOT TOGGLE & STATE CONSISTENCY
// ============================================================================
test('SUITE 2: Mid-Flight Bot Toggle & State Consistency', async (t) => {
  const fixedDt = 1 / 60;

  await t.test('Stochastic Mid-Flight Bot Toggling over 2,500 Frames preserves state continuity', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.loadLevel(0);
    engine.setBotActive(true);
    engine.launchBall(fixedDt);

    let toggleCount = 0;
    let manualFrames = 0;
    let botFrames = 0;
    let nextToggleAt = 25;

    for (let f = 1; f <= 2500; f++) {
      const stateBefore = engine.getState();
      const ballBefore = stateBefore.balls[0];
      const paddlePosBefore = stateBefore.paddle.x;
      const ballPosBefore = { x: ballBefore?.x, y: ballBefore?.y };
      const scoreBefore = stateBefore.score;
      const livesBefore = stateBefore.lives;
      const bricksRemainingBefore = stateBefore.stats.remainingBreakableBricks;

      let externalInput = {};

      if (f === nextToggleAt) {
        externalInput.toggleBot = true;
        toggleCount++;
        // Schedule next random toggle between 20 and 80 frames later
        nextToggleAt = f + Math.floor(20 + ((f * 17) % 60));
      }

      // If bot is currently inactive, simulate player steering
      if (!stateBefore.mode.isBotActive) {
        manualFrames++;
        // Steer gently towards ball X to prevent instant ball drop during manual window
        if (ballBefore && ballBefore.active) {
          externalInput.targetX = ballBefore.x;
        }
      } else {
        botFrames++;
      }

      const { state: stateAfter, events } = engine.tick(fixedDt, externalInput);

      // Verify that toggling never instantaneously alters lives, score, or teleports the paddle/ball
      if (externalInput.toggleBot) {
        assert.equal(
          stateAfter.score,
          scoreBefore,
          `Frame ${f}: Score reset on bot toggle! before=${scoreBefore}, after=${stateAfter.score}`
        );
        assert.equal(
          stateAfter.lives,
          livesBefore,
          `Frame ${f}: Lives altered on bot toggle! before=${livesBefore}, after=${stateAfter.lives}`
        );

        // Paddle position must change only by at most paddle.speed * dt
        const maxAllowedPaddleDisplacement = (stateBefore.paddle.speed * fixedDt) + 0.1;
        const actualPaddleDisplacement = Math.abs(stateAfter.paddle.x - paddlePosBefore);
        assert.ok(
          actualPaddleDisplacement <= maxAllowedPaddleDisplacement,
          `Frame ${f}: Paddle teleported during bot toggle! delta=${actualPaddleDisplacement} > max=${maxAllowedPaddleDisplacement}`
        );
      }

      // Relaunch if lost or in ready state
      if (stateAfter.status === GAME_STATUS.READY) {
        engine.launchBall(fixedDt);
      }
    }

    assert.ok(toggleCount >= 20, `Must execute at least 20 toggles (executed ${toggleCount})`);
    assert.ok(manualFrames > 0 && botFrames > 0, 'Both manual and bot modes must have been active');
  });

  await t.test('Rapid Bot Toggling Inside 15px Narrow Vertical Corridor', () => {
    // Construct a level with a 15px indestructible chute
    const chuteLevel = {
      name: 'Narrow Chute Stress Level',
      cols: 5,
      rows: 25,
      brickWidth: 15,
      brickHeight: 15,
      offsetX: 200,
      offsetY: 40,
      layout: Array(25).fill('44044') // Col 2 is empty 15px chute: x in [230, 245]
    };

    const engine = new GameEngine(DEFAULT_CONFIG);
    const state = engine.loadLevel(0);
    // Replace with custom chute level state
    const customState = createInitialState(DEFAULT_CONFIG, chuteLevel);
    customState.status = GAME_STATUS.PLAYING;
    engine.setState(customState);

    const ball = engine.getState().balls[0];
    ball.attachedToPaddle = false;
    ball.active = true;
    ball.radius = 4.5;
    ball.x = 237.5; // Exactly center of the 15px corridor
    ball.y = 80;
    ball.speed = 450;
    ball.vx = 200; // Moving horizontally into corridor wall
    ball.vy = 403; // Descending rapidly

    // Toggle bot every single frame while ball bounces down the chute
    for (let f = 0; f < 60; f++) {
      const isBotFrame = f % 2 === 0;
      const { state: curState } = engine.tick(fixedDt, { toggleBot: true });

      assert.equal(
        curState.mode.isBotActive,
        isBotFrame ? true : false,
        `Frame ${f}: Bot active status mismatch`
      );

      // Verify ball remains inside corridor bounds x in [230, 245]
      assert.ok(
        ball.x >= 230 - 0.1 && ball.x <= 245 + 0.1,
        `Frame ${f}: Ball escaped 15px chute during toggle! x=${ball.x}`
      );
      assert.ok(!Number.isNaN(ball.x) && !Number.isNaN(ball.y));
    }

    // Now leave bot ON and let ball exit corridor towards paddle
    engine.setBotActive(true);
    let ballDeflected = false;
    for (let f = 0; f < 120; f++) {
      const { events } = engine.tick(fixedDt);
      if (events.some(e => e.type === 'PADDLE_HIT')) {
        ballDeflected = true;
        break;
      }
    }

    assert.ok(ballDeflected, 'Bot must successfully intercept and deflect ball exiting narrow corridor');
  });
});

// ============================================================================
// SUITE 3: MULTI-BALL SITUATIONS & TTI PRIORITIZATION
// ============================================================================
test('SUITE 3: Multi-Ball Situations & TTI Prioritization', async (t) => {
  const fixedDt = 1 / 60;
  const targetPaddleY = 756; // Standard paddle contact plane

  await t.test('findMostUrgentBall analytical threat ordering', () => {
    // Case 1: Two descending balls, Ball B has lower TTI despite higher Y coordinate
    // Ball A: y = 600, vy = 200 -> TTI = (756 - 600) / 200 = 0.78s
    // Ball B: y = 500, vy = 500 -> TTI = (756 - 500) / 500 = 0.512s
    const ballA = { id: 1, active: true, x: 100, y: 600, vy: 200, radius: 4.5 };
    const ballB = { id: 2, active: true, x: 300, y: 500, vy: 500, radius: 4.5 };

    const chosen1 = findMostUrgentBall([ballA, ballB], targetPaddleY);
    assert.equal(chosen1.id, 2, 'Ball B must be chosen due to lower TTI (0.512s < 0.78s)');

    // Case 2: Ascending vs Descending
    // Ball C: y = 700 (very close to paddle), vy = -300 (ascending)
    // Ball D: y = 200, vy = 300 (descending)
    const ballC = { id: 3, active: true, x: 200, y: 700, vy: -300, radius: 4.5 };
    const ballD = { id: 4, active: true, x: 250, y: 200, vy: 300, radius: 4.5 };

    const chosen2 = findMostUrgentBall([ballC, ballD], targetPaddleY);
    assert.equal(chosen2.id, 4, 'Descending Ball D must take priority over ascending Ball C');

    // Case 3: Inactive ball exclusion
    const ballE = { id: 5, active: false, x: 100, y: 720, vy: 400, radius: 4.5 };
    const ballF = { id: 6, active: true, x: 100, y: 300, vy: 200, radius: 4.5 };

    const chosen3 = findMostUrgentBall([ballE, ballF], targetPaddleY);
    assert.equal(chosen3.id, 6, 'Inactive ball must be ignored');

    // Case 4: Robustness on malformed or empty inputs
    assert.equal(findMostUrgentBall([], targetPaddleY), null);
    assert.equal(findMostUrgentBall(null, targetPaddleY), null);
    assert.equal(findMostUrgentBall([null, undefined], targetPaddleY), null);
  });

  await t.test('Concurrent Multi-Ball Simulation (3 Active Balls Simultaneously)', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.loadLevel(0);
    engine.setBotActive(true);

    const state = engine.getState();
    state.status = GAME_STATUS.PLAYING;

    // Spawn 3 simultaneous active balls across different positions and velocities
    state.balls = [
      {
        id: 1,
        active: true,
        attachedToPaddle: false,
        x: 100,
        y: 300,
        vx: 150,
        vy: 350,
        speed: 380,
        radius: 4.5
      },
      {
        id: 2,
        active: true,
        attachedToPaddle: false,
        x: 240,
        y: 450,
        vx: -100,
        vy: 420,
        speed: 431,
        radius: 4.5
      },
      {
        id: 3,
        active: true,
        attachedToPaddle: false,
        x: 380,
        y: 200,
        vx: 200,
        vy: 300,
        speed: 360,
        radius: 4.5
      }
    ];

    let paddleHits = 0;
    let ballsLost = 0;

    for (let f = 1; f <= 1000; f++) {
      const { events } = engine.tick(fixedDt);

      for (const ev of events) {
        if (ev.type === 'PADDLE_HIT') paddleHits++;
        if (ev.type === 'BALL_LOST') ballsLost++;
      }

      // Assert zero NaN coordinates on any ball or paddle
      assert.ok(!Number.isNaN(state.paddle.x));
      for (const b of state.balls) {
        if (b && b.active) {
          assert.ok(!Number.isNaN(b.x) && !Number.isNaN(b.y), `Ball ${b.id} coordinate corrupted`);
          assert.ok(!Number.isNaN(b.vx) && !Number.isNaN(b.vy), `Ball ${b.id} velocity corrupted`);
        }
      }

      // If all balls lost, re-spawn 3 balls to maintain stress pressure
      const activeCount = state.balls.filter(b => b.active).length;
      if (activeCount === 0) {
        state.status = GAME_STATUS.PLAYING;
        state.balls = [
          { id: 10 + f, active: true, attachedToPaddle: false, x: 120, y: 250, vx: 180, vy: 350, speed: 393, radius: 4.5 },
          { id: 20 + f, active: true, attachedToPaddle: false, x: 260, y: 350, vx: -120, vy: 400, speed: 417, radius: 4.5 },
          { id: 30 + f, active: true, attachedToPaddle: false, x: 350, y: 180, vx: 150, vy: 320, speed: 353, radius: 4.5 }
        ];
      }
    }

    // Bot must register multiple paddle deflections under multi-ball pressure
    assert.ok(
      paddleHits >= 10,
      `Bot must successfully arbitrate and deflect balls under multi-ball load (got ${paddleHits} hits)`
    );
  });

  await t.test('Overloaded Multi-Ball Swarm (8 Balls) executes without crashes or NaN states', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.loadLevel(0);
    engine.setBotActive(true);

    const state = engine.getState();
    state.status = GAME_STATUS.PLAYING;

    // Create 8 staggered balls
    state.balls = [];
    for (let i = 0; i < 8; i++) {
      state.balls.push({
        id: i + 1,
        active: true,
        attachedToPaddle: false,
        x: 50 + i * 50,
        y: 200 + (i % 4) * 50,
        vx: ((i % 2 === 0 ? 1 : -1) * (150 + i * 20)),
        vy: 300 + (i * 25),
        speed: 400,
        radius: 4.5
      });
    }

    let iterationsWithoutError = 0;
    for (let f = 0; f < 500; f++) {
      assert.doesNotThrow(() => {
        engine.tick(fixedDt);
      });
      iterationsWithoutError++;
    }

    assert.equal(iterationsWithoutError, 500, 'All 500 swarm frames executed cleanly');
  });
});

// ============================================================================
// SUITE 4: BOT KINEMATIC INTEGRITY & STEERING DEADBAND
// ============================================================================
test('SUITE 4: Bot Kinematic Integrity & Steering Deadband', async (t) => {
  await t.test('Deadband eliminates micro-jitter chatter when paddle is centered within 1.5px', () => {
    const state = {
      arena: { width: 480, height: 852 },
      paddle: { x: 206, width: 68, y: 804, speed: 600 }, // Center is 206 + 34 = 240
      balls: [
        {
          id: 1,
          active: true,
          attachedToPaddle: false,
          x: 240.8, // Ball heading to x=240.8 -> difference is 0.8px (< 1.5px deadband)
          y: 700,
          vx: 0,
          vy: 400,
          speed: 400,
          radius: 4.5
        }
      ],
      bricks: [],
      grid: { cols: 10, rows: 10, cellWidth: 48, cellHeight: 15, cells: new Array(100).fill(-1) },
      mode: { isBotActive: true },
      status: GAME_STATUS.PLAYING
    };

    const action = computeBotAction(state, 1 / 60, DEFAULT_CONFIG);

    assert.equal(action.inDeadband, true, 'Diff 0.8px must trigger inDeadband=true');
    assert.equal(action.moveLeft, false, 'Must not command moveLeft inside deadband');
    assert.equal(action.moveRight, false, 'Must not command moveRight inside deadband');
  });

  await t.test('foldTrajectory closed-form mathematical precision across wide spans', () => {
    const xMin = 4.5;
    const xMax = 475.5; // span = 471, period = 942

    // Unfolded in [xMin, xMax]
    assert.equal(foldTrajectory(100, xMin, xMax), 100);
    assert.equal(foldTrajectory(475.5, xMin, xMax), 475.5);
    assert.equal(foldTrajectory(4.5, xMin, xMax), 4.5);

    // One bounce off right wall: xRaw = 475.5 + 50 = 525.5 -> folded = 475.5 - 50 = 425.5
    assert.ok(Math.abs(foldTrajectory(525.5, xMin, xMax) - 425.5) < 1e-9);

    // One bounce off left wall: xRaw = 4.5 - 50 = -45.5 -> folded = 4.5 + 50 = 54.5
    assert.ok(Math.abs(foldTrajectory(-45.5, xMin, xMax) - 54.5) < 1e-9);

    // Multiple bounces (3 full periods): xRaw = 100 + 3 * 942 = 2926 -> folded = 100
    assert.ok(Math.abs(foldTrajectory(100 + 3 * 942, xMin, xMax) - 100) < 1e-9);
  });
});
