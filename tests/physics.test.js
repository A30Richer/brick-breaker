/**
 * Physics & GameState Test Suite
 * Brick Breaker Core
 * Zero external dependencies - uses Node.js native test runner
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, BRICK_TYPES, GAME_STATUS } from '../src/config.js';
import {
  createInitialState,
  cloneState,
  serializeState,
  deserializeState
} from '../src/core/state.js';
import {
  sweptCircleAABB,
  querySpatialGrid,
  calculatePaddleDeflection,
  applyAntiStall,
  stepPhysics
} from '../src/core/physics.js';

test('F1: GameState Initialization & Schema', async (t) => {
  await t.test('createInitialState creates valid default state structure', () => {
    const state = createInitialState(DEFAULT_CONFIG);

    assert.equal(state.frame, 0);
    assert.equal(state.time, 0);
    assert.equal(state.status, GAME_STATUS.READY);
    assert.equal(state.score, 0);
    assert.equal(state.lives, 3);
    assert.ok(state.arena.width === 480);
    assert.ok(state.arena.height === 720);
    assert.ok(state.paddle.width === 68);
    assert.equal(state.balls.length, 1);
    assert.equal(state.balls[0].attachedToPaddle, true);
    assert.equal(state.balls[0].active, true);
    assert.ok(Array.isArray(state.bricks));
    assert.ok(Array.isArray(state.grid.cells));
  });

  await t.test('createInitialState correctly parses level layouts and brick types', () => {
    const mockLevel = {
      id: 1,
      name: 'Test Chute',
      cols: 4,
      rows: 3,
      brickWidth: 15,
      brickHeight: 11,
      layout: [
        '1234',
        '0560',
        '4124'
      ]
    };

    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    assert.equal(state.levelIndex, 1);
    assert.equal(state.levelName, 'Test Chute');
    assert.equal(state.grid.cols, 4);
    assert.equal(state.grid.rows, 3);

    // Layout has:
    // Row 0: 1 (Regular, 1hp), 2 (Reinforced, 2hp), 3 (Titanium, 3hp), 4 (Indestructible)
    // Row 1: 0 (Empty), 5 (Booster, 1hp), 6 (Bomb, 1hp), 0 (Empty)
    // Row 2: 4 (Indestructible), 1 (Regular, 1hp), 2 (Reinforced, 2hp), 4 (Indestructible)
    // Total non-zero bricks: 4 + 2 + 4 = 10 bricks.
    // Indestructible (type 4): 3 bricks.
    // Breakable bricks: 7 bricks.
    assert.equal(state.bricks.length, 10);
    assert.equal(state.stats.totalBreakableBricks, 7);
    assert.equal(state.stats.remainingBreakableBricks, 7);

    // Verify spatial grid mapping
    // Row 0, Col 0 should map to first brick (type 1)
    const idx00 = state.grid.cells[0 * 4 + 0];
    assert.notEqual(idx00, -1);
    assert.equal(state.bricks[idx00].type, 1);
    assert.equal(state.bricks[idx00].hp, 1);

    // Row 1, Col 0 is '0' (empty), should be -1
    const idx10 = state.grid.cells[1 * 4 + 0];
    assert.equal(idx10, -1);
  });
});

test('F1: GameState Deep Cloning & Serialization', async (t) => {
  await t.test('cloneState creates completely independent deep copy', () => {
    const original = createInitialState(DEFAULT_CONFIG, {
      cols: 2,
      rows: 1,
      brickWidth: 20,
      brickHeight: 10,
      layout: ['12']
    });

    const clone = cloneState(original);
    assert.deepEqual(clone, original);

    // Mutate clone
    clone.score = 999;
    clone.balls[0].x = 123;
    clone.paddle.vx = 456;
    clone.bricks[0].hp = 0;
    clone.grid.cells[0] = -1;

    // Verify original is untouched
    assert.equal(original.score, 0);
    assert.notEqual(original.balls[0].x, 123);
    assert.notEqual(original.paddle.vx, 456);
    assert.equal(original.bricks[0].hp, 1);
    assert.notEqual(original.grid.cells[0], -1);
  });

  await t.test('serializeState and deserializeState roundtrip cleanly', () => {
    const original = createInitialState(DEFAULT_CONFIG, {
      cols: 2,
      rows: 2,
      brickWidth: 20,
      brickHeight: 10,
      layout: ['14', '06']
    });
    original.score = 500;
    original.status = GAME_STATUS.PLAYING;

    const jsonStr = serializeState(original);
    assert.equal(typeof jsonStr, 'string');

    const restored = deserializeState(jsonStr);
    assert.equal(restored.score, 500);
    assert.equal(restored.status, GAME_STATUS.PLAYING);
    assert.equal(restored.bricks.length, original.bricks.length);
    assert.equal(restored.grid.cols, 2);
    assert.equal(restored.grid.rows, 2);
  });

  await t.test('deserializeState rejects invalid payloads', () => {
    assert.throws(() => deserializeState(''), /Input cannot be empty/);
    assert.throws(() => deserializeState('{}'), /Invalid GameState structure/);
  });
});

test('F3: Uniform 2D Spatial Grid Collision Broadphase', async (t) => {
  await t.test('spatial grid returns O(1) candidate bricks overlapping query box', () => {
    const mockLevel = {
      cols: 10,
      rows: 10,
      brickWidth: 20,
      brickHeight: 10,
      offsetX: 0,
      offsetY: 0,
      layout: [
        '1000000000',
        '0000000000',
        '0001000000',
        '0000000000',
        '0000000000',
        '0000000000',
        '0000000000',
        '0000000000',
        '0000000000',
        '0000000001'
      ]
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);

    // Query empty region [100, 100, 120, 120] -> should return 0 candidates
    const emptyCandidates = querySpatialGrid(state.grid, state.bricks, {
      minX: 100,
      minY: 100,
      maxX: 120,
      maxY: 120
    });
    assert.equal(emptyCandidates.length, 0);

    // Query region overlapping brick at row 2, col 3:
    // Brick bounds: x in [60, 80], y in [20, 30]
    const hitCandidates = querySpatialGrid(state.grid, state.bricks, {
      minX: 55,
      minY: 15,
      maxX: 75,
      maxY: 25
    });
    assert.equal(hitCandidates.length, 1);
    assert.equal(hitCandidates[0].row, 2);
    assert.equal(hitCandidates[0].col, 3);
  });
});

test('F2 & F3: Continuous Collision Detection & High-Speed Anti-Tunneling', async (t) => {
  await t.test('sweptCircleAABB detects exact TOI for ray traveling toward AABB', () => {
    const box = { x: 50, y: 50, width: 20, height: 20 };
    // Ball moving right from x=20 toward box left edge (x=50) with radius 5
    // Hit occurs when ball center reaches x = 50 - 5 = 45.
    // Distance = 45 - 20 = 25.
    // With dx = 100, t should be 25 / 100 = 0.25.
    const hit = sweptCircleAABB(20, 60, 100, 0, 5, box);
    assert.ok(hit !== null);
    assert.ok(Math.abs(hit.t - 0.25) < 1e-4);
    assert.equal(hit.nx, -1);
    assert.equal(hit.ny, 0);
  });

  await t.test('High-speed anti-tunneling at 25 px/tick (1,500 px/s) against 15px wall', () => {
    // 25 px/tick at 60 FPS is 1500 px/s.
    // Wall brick thickness is 15px.
    // Without CCD / sub-stepping, the ball would jump 25px in one tick, skipping right through the 15px wall!
    const mockLevel = {
      cols: 8,
      rows: 1,
      brickWidth: 15,
      brickHeight: 30,
      offsetX: 0,
      offsetY: 0,
      layout: ['00000400'] // Wall is at col 5: x in [75, 90]
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;

    // Position ball at x = 60, y = 15, moving right at vx = 1500 px/s (25 px/tick at dt = 1/60)
    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.radius = 4.5;
    ball.x = 60;
    ball.y = 15;
    ball.vx = 1500;
    ball.vy = 0;
    ball.speed = 1500;

    const dt = 1 / 60; // 0.016667s -> displacement = 25 px
    const events = stepPhysics(state, {}, dt, {
      ...DEFAULT_CONFIG,
      physics: { ...DEFAULT_CONFIG.physics, subSteps: 8 }
    });

    // Verify ball collided with brick and did NOT tunnel through to x > 90
    assert.ok(ball.x <= 75, `Ball x (${ball.x}) must remain before wall edge x=75`);
    assert.ok(ball.vx < 0, `Ball vx (${ball.vx}) must have reflected to negative`);
    const hitEvent = events.find(e => e.type === 'BRICK_HIT');
    assert.ok(hitEvent, 'A BRICK_HIT event must be registered');
    assert.equal(hitEvent.brick.type, 4); // Indestructible wall
  });
});

test('F4: Variable Paddle Deflection Angle Mapping', async (t) => {
  const paddle = { x: 100, y: 600, width: 80, height: 12, speed: 1000, vx: 0 };
  const ballSpeed = 450;

  await t.test('Center hit (offset = 0) deflects straight up (0 degrees)', () => {
    const centerDefl = calculatePaddleDeflection(140, paddle, ballSpeed, DEFAULT_CONFIG);
    assert.ok(Math.abs(centerDefl.offset) < 0.01);
    assert.ok(Math.abs(centerDefl.angle) < 0.01);
    assert.ok(Math.abs(centerDefl.vx) < 5);
    assert.ok(centerDefl.vy < 0);
    // Preserves kinetic speed
    const totalSpeed = Math.sqrt(centerDefl.vx * centerDefl.vx + centerDefl.vy * centerDefl.vy);
    assert.ok(Math.abs(totalSpeed - ballSpeed) < 1e-3);
  });

  await t.test('Right hit (offset > 0) deflects to the right (angle > 0, vx > 0)', () => {
    const rightDefl = calculatePaddleDeflection(160, paddle, ballSpeed, DEFAULT_CONFIG);
    assert.ok(rightDefl.offset > 0);
    assert.ok(rightDefl.angle > 0);
    assert.ok(rightDefl.vx > 0);
    assert.ok(rightDefl.vy < 0);
    const totalSpeed = Math.sqrt(rightDefl.vx * rightDefl.vx + rightDefl.vy * rightDefl.vy);
    assert.ok(Math.abs(totalSpeed - ballSpeed) < 1e-3);
  });

  await t.test('Left hit (offset < 0) deflects to the left (angle < 0, vx < 0)', () => {
    const leftDefl = calculatePaddleDeflection(120, paddle, ballSpeed, DEFAULT_CONFIG);
    assert.ok(leftDefl.offset < 0);
    assert.ok(leftDefl.angle < 0);
    assert.ok(leftDefl.vx < 0);
    assert.ok(leftDefl.vy < 0);
    const totalSpeed = Math.sqrt(leftDefl.vx * leftDefl.vx + leftDefl.vy * leftDefl.vy);
    assert.ok(Math.abs(totalSpeed - ballSpeed) < 1e-3);
  });

  await t.test('Paddle momentum transfer alters horizontal velocity', () => {
    const movingPaddle = { ...paddle, vx: 500 };
    const deflMoving = calculatePaddleDeflection(140, movingPaddle, ballSpeed, DEFAULT_CONFIG);
    assert.ok(deflMoving.vx > 0, 'Moving right paddle transfers positive momentum');
    const totalSpeed = Math.sqrt(deflMoving.vx * deflMoving.vx + deflMoving.vy * deflMoving.vy);
    assert.ok(Math.abs(totalSpeed - ballSpeed) < 1e-3);
  });

  await t.test('stepPhysics with targetX: NaN leaves state.paddle.x finite and unaffected', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const initialPaddleX = state.paddle.x;
    assert.ok(Number.isFinite(initialPaddleX));

    stepPhysics(state, { targetX: NaN }, 1 / 60);

    assert.ok(Number.isFinite(state.paddle.x), 'state.paddle.x must remain finite');
    assert.equal(state.paddle.x, initialPaddleX, 'state.paddle.x must remain unaffected');
  });
});

test('F5: Corridor Ricochet & Anti-Stall Clamping', async (t) => {
  await t.test('applyAntiStall enforces |vy| >= 0.25 * |v| when vertical speed drops near zero', () => {
    const speed = 400;
    // Ball with nearly pure horizontal velocity
    const ball = { vx: 399.9, vy: 1.0, speed };
    applyAntiStall(ball, 0.25, 0.05);

    const minExpectedVy = 0.25 * speed; // 100
    assert.ok(
      Math.abs(ball.vy) >= minExpectedVy,
      `|vy| (${Math.abs(ball.vy)}) must be >= ${minExpectedVy}`
    );

    // Total speed scalar must be conserved
    const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    assert.ok(
      Math.abs(currentSpeed - speed) < 1e-3,
      `Scalar speed (${currentSpeed}) must be preserved to (${speed})`
    );
  });

  await t.test('applyAntiStall injects micro-jitter if horizontal speed drops near zero', () => {
    const speed = 400;
    // Ball with pure vertical velocity
    const ball = { vx: 0.0, vy: -400.0, speed };
    applyAntiStall(ball, 0.25, 0.05);

    const minExpectedVx = 0.05 * speed; // 20
    assert.ok(
      Math.abs(ball.vx) >= minExpectedVx,
      `|vx| (${Math.abs(ball.vx)}) must be >= ${minExpectedVx}`
    );

    const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    assert.ok(Math.abs(currentSpeed - speed) < 1e-3);
  });
});

test('F6: Multi-Tier Brick Destruction & Bomb 3x3 Blast Radius', async (t) => {
  await t.test('Type 1 (Regular, 1 HP) shatters on single hit', () => {
    const mockLevel = {
      cols: 1,
      rows: 1,
      brickWidth: 20,
      brickHeight: 20,
      offsetX: 50,
      offsetY: 50,
      layout: ['1']
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;

    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.x = 60;
    ball.y = 78;
    ball.vx = 0;
    ball.vy = -300;

    const events = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    const brickHit = events.find(e => e.type === 'BRICK_HIT');
    assert.ok(brickHit);
    assert.equal(brickHit.destroyed, true);
    assert.equal(state.bricks[0].active, false);
    assert.equal(state.bricks[0].hp, 0);
    assert.equal(state.stats.bricksDestroyed, 1);
    assert.equal(state.stats.remainingBreakableBricks, 0);
  });

  await t.test('Type 2 (Reinforced, 2 HP) requires 2 hits to destroy', () => {
    const mockLevel = {
      cols: 1,
      rows: 1,
      brickWidth: 20,
      brickHeight: 20,
      offsetX: 50,
      offsetY: 50,
      layout: ['2']
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;

    const ball = state.balls[0];
    ball.attachedToPaddle = false;

    // Hit 1
    ball.x = 60;
    ball.y = 78;
    ball.vx = 0;
    ball.vy = -300;
    const events1 = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    const hit1 = events1.find(e => e.type === 'BRICK_HIT');
    assert.ok(hit1);
    assert.equal(hit1.destroyed, false);
    assert.equal(state.bricks[0].active, true);
    assert.equal(state.bricks[0].hp, 1);

    // Hit 2
    ball.x = 60;
    ball.y = 78;
    ball.vx = 0;
    ball.vy = -300;
    const events2 = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    const hit2 = events2.find(e => e.type === 'BRICK_HIT');
    assert.ok(hit2);
    assert.equal(hit2.destroyed, true);
    assert.equal(state.bricks[0].active, false);
    assert.equal(state.bricks[0].hp, 0);
  });

  await t.test('Type 3 (Titanium, 3 HP) requires 3 hits to destroy', () => {
    const mockLevel = {
      cols: 1,
      rows: 1,
      brickWidth: 20,
      brickHeight: 20,
      offsetX: 50,
      offsetY: 50,
      layout: ['3']
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;
    const ball = state.balls[0];
    ball.attachedToPaddle = false;

    // Hit 1
    ball.x = 60; ball.y = 78; ball.vx = 0; ball.vy = -300;
    stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.equal(state.bricks[0].hp, 2);

    // Hit 2
    ball.x = 60; ball.y = 78; ball.vx = 0; ball.vy = -300;
    stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.equal(state.bricks[0].hp, 1);

    // Hit 3
    ball.x = 60; ball.y = 78; ball.vx = 0; ball.vy = -300;
    stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.equal(state.bricks[0].hp, 0);
    assert.equal(state.bricks[0].active, false);
  });

  await t.test('Type 4 (Indestructible Corridor Wall) never takes damage or breaks', () => {
    const mockLevel = {
      cols: 1,
      rows: 1,
      brickWidth: 20,
      brickHeight: 20,
      offsetX: 50,
      offsetY: 50,
      layout: ['4']
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;
    const ball = state.balls[0];
    ball.attachedToPaddle = false;

    // Hit 5 times
    for (let i = 0; i < 5; i++) {
      ball.x = 60; ball.y = 78; ball.vx = 0; ball.vy = -300;
      const events = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      const hit = events.find(e => e.type === 'BRICK_HIT');
      assert.ok(hit);
      assert.equal(hit.damage, 0);
      assert.equal(hit.destroyed, false);
      assert.equal(hit.indestructible, true);
    }
    assert.equal(state.bricks[0].active, true);
    assert.equal(state.stats.corridorHits, 5);
    assert.equal(state.stats.bricksDestroyed, 0);
  });

  await t.test('Type 5 (Booster) increases ball speed by 15%', () => {
    const mockLevel = {
      cols: 1,
      rows: 1,
      brickWidth: 20,
      brickHeight: 20,
      offsetX: 50,
      offsetY: 50,
      layout: ['5']
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;
    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.speed = 400;
    ball.x = 60; ball.y = 80; ball.vx = 0; ball.vy = -400;

    const events = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    const hit = events.find(e => e.type === 'BRICK_HIT');
    assert.ok(hit);
    assert.equal(hit.destroyed, true);
    // Speed should have increased by 15% (400 * 1.15 = 460)
    assert.ok(Math.abs(ball.speed - 460) < 1.0);
  });

  await t.test('Type 6 (Bomb) shatters surrounding 3x3 breakable bricks', () => {
    // 3x3 layout with bomb in the center
    // 1 1 1
    // 1 6 1
    // 1 1 1
    const mockLevel = {
      cols: 3,
      rows: 3,
      brickWidth: 20,
      brickHeight: 20,
      offsetX: 50,
      offsetY: 50,
      layout: [
        '111',
        '161',
        '111'
      ]
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;
    assert.equal(state.stats.totalBreakableBricks, 9);

    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    // Aim directly at the bomb (row 1, col 1: x in [70, 90], y in [70, 90])
    ball.x = 80; ball.y = 100; ball.vx = 0; ball.vy = -300;

    const events = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    const bombHit = events.find(e => e.type === 'BRICK_HIT' && e.brick.type === 6);
    assert.ok(bombHit);
    assert.equal(bombHit.destroyed, true);

    // All 9 bricks in 3x3 should be destroyed!
    assert.equal(state.stats.bricksDestroyed, 9);
    assert.equal(state.stats.remainingBreakableBricks, 0);
    assert.equal(state.status, GAME_STATUS.LEVEL_CLEAR);
  });
});

test('Boundary Walls & Bottom Kill Plane', async (t) => {
  await t.test('Left, Right, Top walls reflect velocity cleanly', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    state.status = GAME_STATUS.PLAYING;
    const ball = state.balls[0];
    ball.attachedToPaddle = false;

    // Hit left wall
    ball.x = 6; ball.y = 100; ball.vx = -400; ball.vy = 200;
    const eventsLeft = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.ok(ball.vx > 0, 'Ball vx must reflect to positive');
    assert.ok(eventsLeft.some(e => e.type === 'WALL_HIT' && e.wall === 'LEFT_WALL'));

    // Hit top wall
    ball.x = 100; ball.y = 6; ball.vx = 200; ball.vy = -400;
    const eventsTop = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.ok(ball.vy > 0, 'Ball vy must reflect to positive');
    assert.ok(eventsTop.some(e => e.type === 'WALL_HIT' && e.wall === 'TOP_WALL'));

    // Hit right wall
    ball.x = state.arena.width - 6; ball.y = 100; ball.vx = 400; ball.vy = 200;
    const eventsRight = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.ok(ball.vx < 0, 'Ball vx must reflect to negative');
    assert.ok(eventsRight.some(e => e.type === 'WALL_HIT' && e.wall === 'RIGHT_WALL'));
  });

  await t.test('Ball falling below kill plane emits BALL_LOST and handles lives decrement', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    state.status = GAME_STATUS.PLAYING;
    state.lives = 3;
    const ball = state.balls[0];
    ball.attachedToPaddle = false;

    // Position ball near bottom edge traveling downward
    ball.x = 200;
    ball.y = state.arena.height - 2;
    ball.vx = 0;
    ball.vy = 400;

    const events = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.ok(events.some(e => e.type === 'BALL_LOST'));
    assert.equal(state.lives, 2);
    assert.equal(state.status, GAME_STATUS.READY);
    assert.equal(state.balls[0].attachedToPaddle, true);
  });
});
