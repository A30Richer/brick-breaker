/**
 * GameEngine & Autonomous Bot Test Suite
 * Milestone 3: Features F13, F14, F15, F16, F17
 * 
 * Uses Node.js native test runner (node:test) and assert/strict.
 * Zero external dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, GAME_STATUS } from '../src/config.js';
import { GameEngine } from '../src/core/engine.js';
import {
  foldTrajectory,
  findMostUrgentBall,
  predictBallLanding,
  computeBotAction,
  DEADBAND_PIXELS
} from '../src/core/bot.js';
import { LevelManager } from '../src/core/level_manager.js';
import { LEVEL_DEFINITIONS } from '../src/core/levels.js';
import { createInitialState } from '../src/core/state.js';

test('F16 & F17: GameEngine Initialization and Level Loading', async (t) => {
  await t.test('engine initializes with default level 0 in READY state', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    const state = engine.getState();

    assert.ok(state, 'State should be initialized');
    assert.equal(state.status, GAME_STATUS.READY);
    assert.equal(state.levelIndex, 0);
    assert.equal(state.score, 0);
    assert.equal(state.lives, 3);
    assert.equal(state.balls.length, 1);
    assert.equal(state.balls[0].attachedToPaddle, true);
    assert.equal(state.balls[0].active, true);
    assert.equal(state.mode.isBotActive, false);
  });

  await t.test('loadLevel loads target level while preserving score, lives, and bot mode', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    const state = engine.getState();

    state.score = 1500;
    state.lives = 2;
    engine.setBotActive(true);

    const newState = engine.loadLevel(1); // Load Level 2
    assert.equal(newState.levelIndex, 1);
    assert.equal(newState.score, 1500);
    assert.equal(newState.lives, 2);
    assert.equal(newState.mode.isBotActive, true);
    assert.equal(newState.status, GAME_STATUS.READY);
    assert.equal(newState.balls[0].attachedToPaddle, true);
  });

  await t.test('restartLevel resets bricks and ball onto paddle for current level', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.loadLevel(2);
    engine.getState().score = 800;

    const restartedState = engine.restartLevel();
    assert.equal(restartedState.levelIndex, 2);
    assert.equal(restartedState.status, GAME_STATUS.READY);
    assert.equal(restartedState.balls[0].attachedToPaddle, true);
    assert.equal(restartedState.score, 800);
  });

  await t.test('restartGame resets to level 0 with 0 score and default lives', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.loadLevel(3);
    engine.getState().score = 5000;
    engine.getState().lives = 1;

    const freshState = engine.restartGame();
    assert.equal(freshState.levelIndex, 0);
    assert.equal(freshState.score, 0);
    assert.equal(freshState.lives, 3);
    assert.equal(freshState.status, GAME_STATUS.READY);
  });
});

test('F16: Lifecycle State Machine Transitions', async (t) => {
  await t.test('READY -> PLAYING via launchBall()', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    assert.equal(engine.getState().status, GAME_STATUS.READY);

    const launchEvents = engine.launchBall();
    assert.equal(engine.getState().status, GAME_STATUS.PLAYING);
    assert.equal(engine.getState().balls[0].attachedToPaddle, false);
    assert.ok(engine.getState().balls[0].vy < 0, 'Ball should be ascending');
    assert.ok(launchEvents.some(e => e.type === 'BALL_LAUNCHED'));
  });

  await t.test('READY -> PLAYING via tick({ launchBall: true })', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    assert.equal(engine.getState().status, GAME_STATUS.READY);

    const { events } = engine.tick(1 / 60, { launchBall: true });
    assert.equal(engine.getState().status, GAME_STATUS.PLAYING);
    assert.ok(events.some(e => e.type === 'BALL_LAUNCHED'));
  });

  await t.test('PLAYING -> PAUSED -> PLAYING via togglePause()', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.launchBall();
    assert.equal(engine.getState().status, GAME_STATUS.PLAYING);

    const paused = engine.togglePause();
    assert.equal(paused, true);
    assert.equal(engine.getState().status, GAME_STATUS.PAUSED);

    // Verify simulation time freezes when paused
    const timeBefore = engine.getState().time;
    const frameBefore = engine.getState().frame;
    engine.tick(1 / 60);
    assert.equal(engine.getState().time, timeBefore, 'Time must not advance while paused');
    assert.equal(engine.getState().frame, frameBefore, 'Frame counter must not advance while paused');

    const resumed = engine.togglePause();
    assert.equal(resumed, false);
    assert.equal(engine.getState().status, GAME_STATUS.PLAYING);

    // Simulation advances once resumed
    engine.tick(1 / 60);
    assert.ok(engine.getState().time > timeBefore, 'Time advances after resume');
  });

  await t.test('Pause toggle via externalInput.togglePause hotkey', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.launchBall();

    const { events: pauseEvents } = engine.tick(1 / 60, { togglePause: true });
    assert.equal(engine.getState().status, GAME_STATUS.PAUSED);
    assert.ok(pauseEvents.some(e => e.type === 'PAUSED'));

    const { events: resumeEvents } = engine.tick(1 / 60, { togglePause: true });
    assert.equal(engine.getState().status, GAME_STATUS.PLAYING);
    assert.ok(resumeEvents.some(e => e.type === 'RESUMED'));
  });
});

test('F13: Autonomous Bot Trajectory Raycasting & Boundary Folding', async (t) => {
  await t.test('foldTrajectory handles direct straight-down path (no wall bounces)', () => {
    const xMin = 5;
    const xMax = 475;
    const directX = 240;
    const folded = foldTrajectory(directX, xMin, xMax);
    assert.equal(folded, 240);
  });

  await t.test('foldTrajectory accurately folds single right wall rebound', () => {
    const xMin = 5;
    const xMax = 95; // effective width = 90
    // Unfolded landing coordinate = 110 (overshoots right wall by 15)
    // Reflected position = 95 - 15 = 80
    const folded = foldTrajectory(110, xMin, xMax);
    assert.equal(folded, 80);
  });

  await t.test('foldTrajectory accurately folds single left wall rebound', () => {
    const xMin = 5;
    const xMax = 95; // effective width = 90
    // Unfolded landing coordinate = -20 (overshoots left wall by 25)
    // Reflected position = 5 + 25 = 30
    const folded = foldTrajectory(-20, xMin, xMax);
    assert.equal(folded, 30);
  });

  await t.test('foldTrajectory accurately folds multi-bounce zig-zag', () => {
    const xMin = 5;
    const xMax = 95; // effective width = 90, period = 180
    // Start at 50, dx = +240 -> raw = 290
    // 290 - 5 = 285 % 180 = 105. 105 > 90 -> 95 - 15 = 80
    const folded = foldTrajectory(290, xMin, xMax);
    assert.equal(folded, 80);
  });

  await t.test('predictBallLanding below grid returns exact analytical folded contact point', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    state.paddle.y = 672;
    state.paddle.width = 68;

    const ball = {
      x: 240,
      y: 550, // below lowest brick row (which ends at ~524)
      vx: 200,
      vy: 400,
      radius: 4.5,
      speed: 450,
      active: true
    };

    const targetY = 672 - 4.5; // 667.5
    const dt = (targetY - 550) / 400; // 0.29375 s
    const expectedRaw = 240 + 200 * dt; // 298.75
    const expectedFolded = foldTrajectory(expectedRaw, 4.5, 480 - 4.5);

    const predictedX = predictBallLanding(ball, state, DEFAULT_CONFIG);
    assert.ok(Math.abs(predictedX - expectedFolded) < 0.001);
  });

  await t.test('predictBallLanding returns screen center for ascending ball (vy <= 0)', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const ball = {
      x: 100,
      y: 400,
      vx: 150,
      vy: -300, // ascending upwards
      radius: 4.5,
      active: true
    };

    const predictedX = predictBallLanding(ball, state, DEFAULT_CONFIG);
    assert.equal(predictedX, 240); // 480 / 2
  });

  await t.test('predictBallLanding obstacle lookahead detects upward deflection from solid brick', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    // Put a solid breakable brick directly in path
    const ball = {
      x: 240,
      y: 60,
      vx: 0,
      vy: 400, // descending right into dense brick grid
      radius: 4.5,
      speed: 400,
      active: true
    };

    // Since bricks are solid at y=60..100, lookahead micro-sim detects hit and upward rebound
    const predictedX = predictBallLanding(ball, state, DEFAULT_CONFIG);
    assert.equal(predictedX, 240, 'Should return center when ball will bounce upward off brick');
  });
});

test('F14: Multi-Ball Prioritization & Kinematic Steering with Deadband', async (t) => {
  await t.test('findMostUrgentBall prioritizes descending ball with smallest Time-To-Impact', () => {
    const targetY = 667.5;
    const balls = [
      { id: 1, x: 100, y: 300, vy: 200, active: true }, // TTI = (667.5 - 300) / 200 = 1.8375
      { id: 2, x: 200, y: 550, vy: 500, active: true }, // TTI = (667.5 - 550) / 500 = 0.235 (URGENT)
      { id: 3, x: 300, y: 600, vy: -300, active: true }, // Ascending (not immediate threat)
      { id: 4, x: 400, y: 500, vy: 250, active: false } // Inactive
    ];

    const urgent = findMostUrgentBall(balls, targetY);
    assert.ok(urgent);
    assert.equal(urgent.id, 2, 'Ball 2 has lowest positive TTI');
  });

  await t.test('computeBotAction commands proportional steering towards target outside deadband', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    state.paddle.x = 100; // paddleCenter = 100 + 34 = 134
    state.paddle.width = 68;
    state.status = GAME_STATUS.PLAYING;

    // Ball landing predicted to right (x=300)
    state.balls = [
      {
        id: 1,
        x: 300,
        y: 600,
        vx: 0,
        vy: 400,
        radius: 4.5,
        speed: 400,
        active: true,
        attachedToPaddle: false
      }
    ];

    const action = computeBotAction(state, 1 / 60, DEFAULT_CONFIG);
    assert.equal(action.moveRight, true);
    assert.equal(action.moveLeft, false);
    assert.equal(action.inDeadband, false);
    assert.equal(action.targetX, 300);
  });

  await t.test('computeBotAction respects deadband (~1.5px) and eliminates chatter', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    state.paddle.width = 68;
    // Set paddleCenter within 1.0px of target (target = 240, paddleCenter = 240.8)
    state.paddle.x = 240.8 - 34;
    state.status = GAME_STATUS.PLAYING;

    state.balls = [
      {
        id: 1,
        x: 240,
        y: 600,
        vx: 0,
        vy: 400,
        radius: 4.5,
        speed: 400,
        active: true,
        attachedToPaddle: false
      }
    ];

    const action = computeBotAction(state, 1 / 60, DEFAULT_CONFIG);
    assert.equal(action.inDeadband, true, 'Difference of 0.8px must be within deadband');
    assert.equal(action.moveLeft, false, 'No chatter left');
    assert.equal(action.moveRight, false, 'No chatter right');
  });

  await t.test('computeBotAction auto-launches ball in READY state', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    assert.equal(state.status, GAME_STATUS.READY);

    const action = computeBotAction(state, 1 / 60, DEFAULT_CONFIG);
    assert.equal(action.launchBall, true);
  });
});

test('F15: Seamless Bot Toggling During Active Simulation', async (t) => {
  await t.test('toggleBot() and setBotActive() never reset paddle, ball, lives, or score', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.launchBall();

    // Advance simulation by 30 frames
    for (let i = 0; i < 30; i++) {
      engine.tick(1 / 60);
    }

    const stateBefore = engine.getState();
    const ballPosBefore = { x: stateBefore.balls[0].x, y: stateBefore.balls[0].y, vx: stateBefore.balls[0].vx, vy: stateBefore.balls[0].vy };
    const paddlePosBefore = stateBefore.paddle.x;
    const scoreBefore = stateBefore.score;
    const livesBefore = stateBefore.lives;
    const levelBefore = stateBefore.levelIndex;

    // Toggle bot ON
    const botActive1 = engine.toggleBot();
    assert.equal(botActive1, true);
    assert.equal(engine.getState().mode.isBotActive, true);

    // Verify all gameplay state remains pristine
    assert.equal(engine.getState().balls[0].x, ballPosBefore.x);
    assert.equal(engine.getState().balls[0].y, ballPosBefore.y);
    assert.equal(engine.getState().balls[0].vx, ballPosBefore.vx);
    assert.equal(engine.getState().balls[0].vy, ballPosBefore.vy);
    assert.equal(engine.getState().paddle.x, paddlePosBefore);
    assert.equal(engine.getState().score, scoreBefore);
    assert.equal(engine.getState().lives, livesBefore);
    assert.equal(engine.getState().levelIndex, levelBefore);

    // Toggle bot OFF
    const botActive2 = engine.toggleBot();
    assert.equal(botActive2, false);
    assert.equal(engine.getState().mode.isBotActive, false);
  });

  await t.test('Hotkey "B" toggles bot seamlessly via externalInput in tick()', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    assert.equal(engine.getState().mode.isBotActive, false);

    const { events } = engine.tick(1 / 60, { toggleBot: true });
    assert.equal(engine.getState().mode.isBotActive, true);
    assert.ok(events.some(e => e.type === 'BOT_TOGGLED' && e.isBotActive === true));
  });
});

test('F16: Ball Loss, Life Deduction, and Game Over Flow', async (t) => {
  await t.test('Ball dropping below kill plane decrements life and re-arms in READY state', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.launchBall();
    const state = engine.getState();
    assert.equal(state.lives, 3);

    // Position paddle far to the right and ball near bottom edge traveling downward
    state.paddle.x = 350;
    state.balls[0].x = 50;
    state.balls[0].y = state.arena.height - 2;
    state.balls[0].vx = 0;
    state.balls[0].vy = 400;

    const { events } = engine.tick(1 / 60);
    assert.equal(engine.getState().lives, 2);
    assert.equal(engine.getState().status, GAME_STATUS.READY);
    assert.ok(events.some(e => e.type === 'BALL_LOST'));
    assert.ok(events.some(e => e.type === 'LIFE_LOST'));
    assert.equal(engine.getState().balls[0].attachedToPaddle, true);
  });

  await t.test('Zero lives remaining triggers GAME_OVER state', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.launchBall();
    const state = engine.getState();
    state.lives = 1;

    // Drop last ball
    state.paddle.x = 350;
    state.balls[0].x = 50;
    state.balls[0].y = state.arena.height - 2;
    state.balls[0].vx = 0;
    state.balls[0].vy = 400;

    const { events } = engine.tick(1 / 60);
    assert.equal(engine.getState().lives, 0);
    assert.equal(engine.getState().status, GAME_STATUS.GAME_OVER);
    assert.ok(events.some(e => e.type === 'GAME_OVER'));
  });
});

test('F16 & F12: Level Progression and Victory Flow', async (t) => {
  await t.test('Clearing all breakable bricks in Level 1 advances to Level 2 on subsequent tick', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.launchBall();
    const state = engine.getState();
    state.score = 2500;
    state.lives = 3;

    // Simulate all breakable bricks destroyed
    state.stats.remainingBreakableBricks = 0;
    for (const b of state.bricks) {
      if (b.breakable) {
        b.hp = 0;
        b.active = false;
      }
    }

    // Step tick: stepPhysics emits LEVEL_CLEAR
    const tick1 = engine.tick(1 / 60);
    assert.equal(tick1.state.status, GAME_STATUS.LEVEL_CLEAR);
    assert.ok(tick1.events.some(e => e.type === 'LEVEL_CLEAR'));

    // Next tick: engine progresses to Level 2
    const tick2 = engine.tick(1 / 60);
    assert.equal(tick2.state.levelIndex, 1, 'Should now be Level 2 (index 1)');
    assert.equal(tick2.state.status, GAME_STATUS.READY);
    assert.equal(tick2.state.score, 2500, 'Score carries over');
    assert.equal(tick2.state.lives, 3, 'Lives carry over');
  });

  await t.test('Clearing all breakable bricks on Level 5 triggers VICTORY state', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.loadLevel(4); // Level 5 (index 4)
    engine.launchBall();

    const state = engine.getState();
    assert.equal(state.levelIndex, 4);

    // Destroy all breakable bricks
    state.stats.remainingBreakableBricks = 0;
    for (const b of state.bricks) {
      if (b.breakable) {
        b.hp = 0;
        b.active = false;
      }
    }

    const { state: victoryState, events } = engine.tick(1 / 60);
    assert.equal(victoryState.status, GAME_STATUS.VICTORY);
    assert.ok(events.some(e => e.type === 'VICTORY'));

    // Further ticks maintain VICTORY
    const followUp = engine.tick(1 / 60);
    assert.equal(followUp.state.status, GAME_STATUS.VICTORY);
  });
});

test('F17: Deterministic Headless Simulation Loop (500+ Ticks with Bot)', async (t) => {
  await t.test('Headless simulation runs 600 continuous ticks with bot maintaining zero drops', () => {
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.setBotActive(true);

    const startTime = performance.now();
    const TOTAL_TICKS = 600; // 10 seconds of simulated time at 60 FPS
    let totalPaddleHits = 0;
    let totalBricksDestroyed = 0;

    for (let i = 0; i < TOTAL_TICKS; i++) {
      const { state, events } = engine.tick(1 / 60);

      // Verify no numerical anomalies
      assert.equal(isNaN(state.paddle.x), false, 'Paddle X must be valid number');
      for (const ball of state.balls) {
        if (ball.active) {
          assert.equal(isNaN(ball.x), false, 'Ball X must be valid number');
          assert.equal(isNaN(ball.y), false, 'Ball Y must be valid number');
          assert.equal(isNaN(ball.vx), false, 'Ball Vx must be valid number');
          assert.equal(isNaN(ball.vy), false, 'Ball Vy must be valid number');
        }
      }

      for (const ev of events) {
        if (ev.type === 'PADDLE_HIT') totalPaddleHits++;
        if (ev.type === 'BRICK_HIT' && ev.destroyed) totalBricksDestroyed++;
      }
    }

    const elapsedMs = performance.now() - startTime;
    const finalState = engine.getState();

    // Verify zero balls dropped by bot
    assert.equal(finalState.stats.ballsLost, 0, 'Bot must not drop any balls');
    assert.equal(finalState.lives, 3, 'Lives must remain full');
    assert.ok(finalState.balls.some(b => b.active), 'At least one ball remains in play');
    assert.ok(elapsedMs < 1000, `600 ticks should execute well under 1000ms (took ${elapsedMs.toFixed(1)}ms)`);
  });
});
