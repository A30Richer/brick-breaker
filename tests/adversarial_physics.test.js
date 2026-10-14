/**
 * Adversarial Physics & Anti-Tunneling Stress Test Suite
 * Brick Breaker Core
 *
 * Empirical Challenger Verification Harness:
 * 1. Extreme ball velocities (25 px/tick to 60+ px/tick) against 15px bricks & narrow corridors
 * 2. Corner hits, simultaneous multi-brick overlaps, and diagonal grazing
 * 3. Corridor anti-stall marathon: verify |vy| >= 0.25*|v| across thousands of ricochets
 * 4. Paddle deflection at extreme offsets (u = -1.0, 0, +1.0, |u| > 1.0) and high paddle velocities
 * 5. High-speed plunging anti-tunneling against paddle
 * 6. Kinetic energy and scalar velocity conservation over long simulations
 * 7. Fuzz testing: 20,000 randomized trials on CCD, anti-stall, and paddle math
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, BRICK_TYPES, GAME_STATUS } from '../src/config.js';
import { createInitialState } from '../src/core/state.js';
import {
  sweptCircleAABB,
  querySpatialGrid,
  calculatePaddleDeflection,
  applyAntiStall,
  stepPhysics
} from '../src/core/physics.js';

test('CHALLENGE 1: Extreme Velocity Anti-Tunneling against 15px Bricks', async (t) => {
  // Test velocities from 25 px/tick (1,500 px/s) up to 60 px/tick (3,600 px/s)
  const testVelocitiesPxPerTick = [25, 35, 45, 50, 60];

  for (const pxPerTick of testVelocitiesPxPerTick) {
    await t.test(`Ball at extreme velocity ${pxPerTick} px/tick (${pxPerTick * 60} px/s) does not tunnel through 15px wall`, () => {
      // Wall thickness is 15px (col 6: x in [90, 105])
      const mockLevel = {
        cols: 12,
        rows: 1,
        brickWidth: 15,
        brickHeight: 30,
        offsetX: 0,
        offsetY: 0,
        layout: ['000000400000'] // Wall is at col 6: x in [90, 105]
      };
      const state = createInitialState(DEFAULT_CONFIG, mockLevel);
      state.status = GAME_STATUS.PLAYING;

      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.radius = 4.5;
      // Start 10px before the wall: x = 90 - 4.5 - 10 = 75.5
      ball.x = 75.5;
      ball.y = 15;
      const speed = pxPerTick * 60; // speed in px/s for dt = 1/60
      ball.vx = speed;
      ball.vy = 0;
      ball.speed = speed;

      const dt = 1 / 60;
      const events = stepPhysics(state, {}, dt, DEFAULT_CONFIG);

      // Invariant 1: Ball must NEVER penetrate deeper than the wall left boundary (x <= 90)
      assert.ok(
        ball.x <= 90,
        `Ball tunneled! ball.x=${ball.x} exceeded wall edge x=90 at ${pxPerTick} px/tick`
      );

      // Invariant 2: Velocity must reflect leftward (vx < 0)
      assert.ok(
        ball.vx < 0,
        `Ball vx (${ball.vx}) failed to reflect at ${pxPerTick} px/tick`
      );

      // Invariant 3: Hit event must be emitted
      const hit = events.find(e => e.type === 'BRICK_HIT');
      assert.ok(hit, `Expected BRICK_HIT event at ${pxPerTick} px/tick`);
      assert.equal(hit.brick.type, 4);
    });
  }
});

test('CHALLENGE 1B: Narrow Corridor Crossing at Extreme Speed', async (t) => {
  await t.test('Ball fired diagonally across 15px chute at 50 px/tick rebounds without tunneling', () => {
    // Left wall: col 4 (x: 60..75)
    // Chute: col 5 (x: 75..90, width 15px)
    // Right wall: col 6 (x: 90..105)
    const mockLevel = {
      cols: 10,
      rows: 1,
      brickWidth: 15,
      brickHeight: 50,
      offsetX: 0,
      offsetY: 0,
      layout: ['0000404000']
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;

    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.radius = 4.5;
    // Inside corridor at x = 80, moving right at 3,000 px/s (50 px/tick)
    ball.x = 80;
    ball.y = 25;
    const speed = 3000;
    ball.vx = speed * 0.9;
    ball.vy = speed * 0.4358;
    ball.speed = speed;

    const dt = 1 / 60;
    const events = stepPhysics(state, {}, dt, DEFAULT_CONFIG);

    // Ball must rebound off right wall (x: 90..105) and stay within or rebound to left
    assert.ok(ball.x <= 90, `Ball x (${ball.x}) must not tunnel into right wall (x >= 90)`);
    assert.ok(ball.vx < 0, 'Ball must reflect to negative vx');
    const hit = events.find(e => e.type === 'BRICK_HIT');
    assert.ok(hit, 'Corridor wall hit detected');
  });
});

test('CHALLENGE 2: Corner Hits, Multi-Brick Overlaps, and Diagonal Grazing', async (t) => {
  await t.test('Exact 45-degree corner hit resolves with diagonal normal and outward reflection', () => {
    const box = { x: 100, y: 100, width: 20, height: 20 };
    // Ball moving diagonally towards top-left corner (100, 100) from (80, 80)
    const radius = 5;
    // Travel along vector (1, 1)
    const dx = 40;
    const dy = 40;
    const hit = sweptCircleAABB(80, 80, dx, dy, radius, box);

    assert.ok(hit !== null, 'Corner collision must be detected');
    assert.ok(hit.t > 0 && hit.t < 1, `Hit t (${hit.t}) must be within step`);
    // Outward normal from top-left corner must have negative x and negative y components
    assert.ok(hit.nx < -0.5, `Corner normal nx (${hit.nx}) must point outward (-x)`);
    assert.ok(hit.ny < -0.5, `Corner normal ny (${hit.ny}) must point outward (-y)`);
    // Unit normal check
    const len = Math.sqrt(hit.nx * hit.nx + hit.ny * hit.ny);
    assert.ok(Math.abs(len - 1.0) < 1e-4, 'Normal must be normalized');
  });

  await t.test('2x2 Brick Vertex convergence does not cause deadlock or NaN', () => {
    // 2x2 grid of bricks meeting at vertex (30, 22)
    const mockLevel = {
      cols: 2,
      rows: 2,
      brickWidth: 15,
      brickHeight: 11,
      offsetX: 15,
      offsetY: 11,
      layout: [
        '44',
        '44'
      ]
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;

    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.radius = 4.5;
    // Approaching intersection vertex (30, 22) from outside (bottom-right: 35, 27) moving (-100, -100)
    ball.x = 35;
    ball.y = 27;
    ball.vx = -300;
    ball.vy = -300;
    ball.speed = Math.sqrt(300 * 300 + 300 * 300);

    const dt = 1 / 60;
    const events = stepPhysics(state, {}, dt, DEFAULT_CONFIG);

    assert.ok(!isNaN(ball.x) && !isNaN(ball.y), 'Coordinates must not be NaN');
    assert.ok(!isNaN(ball.vx) && !isNaN(ball.vy), 'Velocities must not be NaN');
    assert.ok(events.length > 0, 'Collision registered with brick corner');
  });

  await t.test('Simultaneous multi-brick overlap at t=0 depenetrates without exception', () => {
    const mockLevel = {
      cols: 2,
      rows: 1,
      brickWidth: 15,
      brickHeight: 11,
      offsetX: 10,
      offsetY: 10,
      layout: ['44']
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;

    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.radius = 4.5;
    // Force ball directly on the seam between col 0 (10..25) and col 1 (25..40)
    ball.x = 25.0;
    ball.y = 15.5;
    ball.vx = 0;
    ball.vy = 200;
    ball.speed = 200;

    // Step physics with initial overlap
    assert.doesNotThrow(() => {
      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    });

    assert.ok(!isNaN(ball.x) && !isNaN(ball.y));
    assert.ok(!isNaN(ball.vx) && !isNaN(ball.vy));
  });

  await t.test('Grazing on flat vertical face: near miss vs grazing hit accuracy', () => {
    const box = { x: 50, y: 50, width: 20, height: 20 };
    const radius = 5;

    // Ray moving along y=60 toward x=50.
    // Near miss: stops at x = 44.99 (distance to x=50 is 5.01 > 5)
    const miss = sweptCircleAABB(30, 60, 14.99, 0, radius, box);
    assert.equal(miss, null, 'Distance 5.01 with radius 5 must miss');

    // Grazing hit: reaches x = 45.01 (distance to x=50 is 4.99 < 5)
    const hit = sweptCircleAABB(30, 60, 15.01, 0, radius, box);
    assert.ok(hit !== null, 'Distance 4.99 with radius 5 must hit');
    assert.equal(hit.nx, -1, 'Must hit flat vertical face with nx = -1');
    assert.equal(hit.ny, 0);
  });

  await t.test('Corner vertex grazing solves exact quadratic intersection', () => {
    const box = { x: 50, y: 50, width: 20, height: 20 };
    const radius = 5;

    // Ray passing vertically along x = 45.01 from y = 30 to y = 70.
    // Hits corner vertex (50, 50) at y ~ 49.684.
    const cornerHit = sweptCircleAABB(45.01, 30, 0, 40, radius, box);
    assert.ok(cornerHit !== null, 'Must detect corner intersection');
    assert.ok(Math.abs(cornerHit.nx - (-0.998)) < 1e-3, 'Corner normal nx matches quadratic solution');
    assert.ok(cornerHit.ny < 0, 'Corner normal ny points upward');
  });
});

test('CHALLENGE 3: Corridor Anti-Stall Marathon (2,000 Ticks)', async (t) => {
  await t.test('Ball in narrow 15px vertical chute never stalls horizontally and preserves |vy| >= 0.25*|v|', () => {
    // Create a 15px chute capped at top and bottom:
    // Left column: col 0 (x: 0..15) Indestructible Wall (4)
    // Chute: col 1 (x: 15..30, width 15) Empty (0)
    // Right column: col 2 (x: 30..45) Indestructible Wall (4)
    // Top cap (row 0): 444, Bottom cap (row 24): 444
    const rows = 25;
    const cols = 3;
    const layout = [];
    for (let r = 0; r < rows; r++) {
      if (r === 0 || r === rows - 1) layout.push('444');
      else layout.push('404');
    }

    const mockLevel = {
      cols,
      rows,
      brickWidth: 15,
      brickHeight: 15,
      offsetX: 0,
      offsetY: 0,
      layout
    };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;

    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.radius = 4.5;
    // Place inside chute at x = 22.5, y = 150
    ball.x = 22.5;
    ball.y = 150;

    // Start with nearly pure horizontal velocity to aggressively challenge anti-stall
    const speed = 450;
    ball.speed = speed;
    ball.vx = 449.9;
    ball.vy = 0.5; // |vy| / speed = 0.0011 << 0.25 threshold

    const minAllowedVyRatio = DEFAULT_CONFIG.physics.minVerticalSpeedRatio || 0.25;
    const minAllowedVy = speed * minAllowedVyRatio;

    let totalWallHits = 0;

    // Run 2,000 simulation ticks
    for (let tick = 0; tick < 2000; tick++) {
      const events = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      totalWallHits += events.filter(e => e.type === 'BRICK_HIT').length;

      // Invariant 1: Ball must stay confined between left wall (x >= 15) and right wall (x <= 30)
      assert.ok(
        ball.x >= 15 - 0.1 && ball.x <= 30 + 0.1,
        `Tick ${tick}: Ball escaped corridor! ball.x=${ball.x}`
      );

      // Invariant 2: Ball vertical velocity must strictly adhere to anti-stall clamping
      assert.ok(
        Math.abs(ball.vy) >= minAllowedVy - 1e-3,
        `Tick ${tick}: Anti-stall violation! |vy|=${Math.abs(ball.vy)} < minAllowedVy=${minAllowedVy}`
      );

      // Invariant 3: Total kinetic scalar speed must be preserved
      const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      assert.ok(
        Math.abs(currentSpeed - speed) < 1e-2,
        `Tick ${tick}: Speed drift! currentSpeed=${currentSpeed}, expected=${speed}`
      );

      // Invariant 4: No NaN coordinates or velocities
      assert.ok(!isNaN(ball.x) && !isNaN(ball.y));
      assert.ok(!isNaN(ball.vx) && !isNaN(ball.vy));
    }

    // Invariant 5: Ball must have ricocheted extensively (> 1000 wall bounces)
    assert.ok(totalWallHits > 1000, `Expected rapid ricochets in narrow chute, got ${totalWallHits}`);
  });
});

test('CHALLENGE 4: Paddle Deflection at Extreme Offsets & High Velocity', async (t) => {
  const paddle = { x: 100, y: 600, width: 80, height: 12, speed: 1000, vx: 0 };
  const ballSpeed = 450;
  const maxAngle = DEFAULT_CONFIG.physics.maxDeflectionAngle; // 60 deg = ~1.047 rad

  await t.test('Paddle deflection at u = 0.0 (exact center) reflects strictly upward', () => {
    const res = calculatePaddleDeflection(140, paddle, ballSpeed, DEFAULT_CONFIG);
    assert.ok(Math.abs(res.offset) < 1e-4);
    assert.ok(Math.abs(res.angle) < 1e-4);
    assert.ok(Math.abs(res.vx) < 1e-4);
    assert.ok(Math.abs(res.vy - (-ballSpeed)) < 1e-4);
  });

  await t.test('Paddle deflection at u = -1.0 (exact left tip) clamps correctly with preserved speed', () => {
    const res = calculatePaddleDeflection(100, paddle, ballSpeed, DEFAULT_CONFIG);
    assert.ok(res.offset <= -0.95);
    assert.ok(res.vx < 0);
    assert.ok(res.vy < 0);
    assert.ok(Math.abs(res.angle) <= maxAngle + 0.01);
    const speed = Math.sqrt(res.vx * res.vx + res.vy * res.vy);
    assert.ok(Math.abs(speed - ballSpeed) < 1e-3);
  });

  await t.test('Paddle deflection at u = +1.0 (exact right tip) clamps correctly with preserved speed', () => {
    const res = calculatePaddleDeflection(180, paddle, ballSpeed, DEFAULT_CONFIG);
    assert.ok(res.offset >= 0.95);
    assert.ok(res.vx > 0);
    assert.ok(res.vy < 0);
    assert.ok(res.angle <= maxAngle + 0.01);
    const speed = Math.sqrt(res.vx * res.vx + res.vy * res.vy);
    assert.ok(Math.abs(speed - ballSpeed) < 1e-3);
  });

  await t.test('Extreme overshoot (|u| = 2.0) clamps to safe limits without NaN or sign reversal', () => {
    const leftOvershoot = calculatePaddleDeflection(60, paddle, ballSpeed, DEFAULT_CONFIG);
    assert.ok(!isNaN(leftOvershoot.vx) && !isNaN(leftOvershoot.vy));
    assert.ok(leftOvershoot.vx < 0);
    assert.ok(leftOvershoot.vy < 0);

    const rightOvershoot = calculatePaddleDeflection(220, paddle, ballSpeed, DEFAULT_CONFIG);
    assert.ok(!isNaN(rightOvershoot.vx) && !isNaN(rightOvershoot.vy));
    assert.ok(rightOvershoot.vx > 0);
    assert.ok(rightOvershoot.vy < 0);
  });

  await t.test('High velocity paddle motion (vx = +1200 px/s) maintains upward deflection and speed normalization', () => {
    const fastPaddle = { ...paddle, vx: 1200 };
    const res = calculatePaddleDeflection(140, fastPaddle, ballSpeed, DEFAULT_CONFIG);
    assert.ok(res.vx > 0, 'Momentum transferred to the right');
    assert.ok(res.vy < 0, 'Must deflect upward');
    const speed = Math.sqrt(res.vx * res.vx + res.vy * res.vy);
    assert.ok(Math.abs(speed - ballSpeed) < 1e-3, 'Scalar ball speed strictly preserved');
    // Enforces |vy| >= 0.25 * speed
    assert.ok(Math.abs(res.vy) >= 0.25 * ballSpeed);
  });

  await t.test('Hyper-velocity paddle (vx = 5,000 px/s) does not blow up ball speed', () => {
    const hyperPaddle = { ...paddle, vx: 5000 };
    const res = calculatePaddleDeflection(140, hyperPaddle, ballSpeed, DEFAULT_CONFIG);
    const speed = Math.sqrt(res.vx * res.vx + res.vy * res.vy);
    assert.ok(Math.abs(speed - ballSpeed) < 1e-3, 'Speed normalized despite hyper-velocity paddle');
    assert.ok(res.vy < 0);
  });
});

test('CHALLENGE 5: High-Speed Plunging Anti-Tunneling against Paddle', async (t) => {
  await t.test('Ball plunging at 50 px/tick (3,000 px/s) directly at paddle triggers PADDLE_HIT without tunneling', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    state.status = GAME_STATUS.PLAYING;

    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.radius = 4.5;

    // Paddle is at y = 672, height = 12
    // Place ball at y = 650, moving down at vy = 3,000 px/s (50 px/tick at 60 FPS)
    // In one tick (dt=1/60), displacement is +50 px -> would reach y = 700 (passed through paddle!)
    ball.x = state.paddle.x + state.paddle.width / 2;
    ball.y = 650;
    ball.vx = 0;
    ball.vy = 3000;
    ball.speed = 3000;

    const dt = 1 / 60;
    const events = stepPhysics(state, {}, dt, DEFAULT_CONFIG);

    const hit = events.find(e => e.type === 'PADDLE_HIT');
    assert.ok(hit, 'High-speed plunge must trigger PADDLE_HIT event');
    assert.ok(ball.y <= state.paddle.y, `Ball y (${ball.y}) must be above paddle y (${state.paddle.y})`);
    assert.ok(ball.vy < 0, `Ball vy (${ball.vy}) must have reflected upward`);
  });
});

test('CHALLENGE 6: Kinetic Energy & Speed Conservation over 2,000 Bounces in Enclosed Chamber', async (t) => {
  await t.test('Ball ricocheting in indestructible room preserves exact scalar speed without drift', () => {
    // 15x15 enclosed room of indestructible bricks (4s on perimeter, 0s inside)
    const rows = 15;
    const cols = 15;
    const layout = [];
    for (let r = 0; r < rows; r++) {
      if (r === 0 || r === rows - 1) {
        layout.push('4'.repeat(cols));
      } else {
        layout.push('4' + '0'.repeat(cols - 2) + '4');
      }
    }
    const mockLevel = { cols, rows, brickWidth: 15, brickHeight: 15, offsetX: 0, offsetY: 0, layout };
    const state = createInitialState(DEFAULT_CONFIG, mockLevel);
    state.status = GAME_STATUS.PLAYING;

    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.radius = 4.5;
    ball.x = 100;
    ball.y = 100;
    const targetSpeed = 450;
    ball.speed = targetSpeed;
    ball.vx = 300;
    ball.vy = 335.41;

    let brickBounces = 0;
    for (let i = 0; i < 2000; i++) {
      const events = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      brickBounces += events.filter(e => e.type === 'BRICK_HIT').length;

      const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      assert.ok(
        Math.abs(currentSpeed - targetSpeed) < 1e-2,
        `Speed drifted to ${currentSpeed} at frame ${i}`
      );
      assert.ok(!isNaN(ball.x) && !isNaN(ball.y));
    }

    assert.ok(brickBounces > 50, `Expected brick bounces, got ${brickBounces}`);
  });
});

test('CHALLENGE 7: Randomized Fuzz Testing (20,000 Invariant Trials)', async (t) => {
  await t.test('20,000 sweptCircleAABB trials maintain mathematical invariants', () => {
    for (let i = 0; i < 20000; i++) {
      const box = {
        x: (Math.random() - 0.5) * 500,
        y: (Math.random() - 0.5) * 500,
        width: 10 + Math.random() * 50,
        height: 10 + Math.random() * 50
      };
      const radius = 2 + Math.random() * 10;
      const x0 = box.x + (Math.random() - 0.5) * 200;
      const y0 = box.y + (Math.random() - 0.5) * 200;
      const dx = (Math.random() - 0.5) * 200;
      const dy = (Math.random() - 0.5) * 200;

      const hit = sweptCircleAABB(x0, y0, dx, dy, radius, box);
      if (hit) {
        assert.ok(!isNaN(hit.t) && !isNaN(hit.nx) && !isNaN(hit.ny));
        assert.ok(hit.t >= 0 && hit.t <= 1);
        const normLen = Math.sqrt(hit.nx * hit.nx + hit.ny * hit.ny);
        assert.ok(Math.abs(normLen - 1.0) < 1e-3);
      }
    }
  });

  await t.test('20,000 calculatePaddleDeflection trials maintain speed and upward invariants', () => {
    for (let i = 0; i < 20000; i++) {
      const contactX = (Math.random() - 0.5) * 2000;
      const paddle = {
        x: (Math.random() - 0.5) * 1000,
        width: 20 + Math.random() * 200,
        vx: (Math.random() - 0.5) * 10000
      };
      const ballSpeed = 10 + Math.random() * 5000;
      const res = calculatePaddleDeflection(contactX, paddle, ballSpeed, DEFAULT_CONFIG);

      assert.ok(!isNaN(res.vx) && !isNaN(res.vy));
      assert.ok(res.vy < 0, 'Vertical velocity must be strictly upward (vy < 0)');
      const speed = Math.sqrt(res.vx * res.vx + res.vy * res.vy);
      assert.ok(Math.abs(speed - ballSpeed) < 1e-2, 'Speed strictly conserved');
      const minVy = ballSpeed * 0.25;
      assert.ok(Math.abs(res.vy) >= minVy - 1e-4, '|vy| >= 0.25*speed');
    }
  });

  await t.test('20,000 applyAntiStall trials guarantee |vy| >= 0.25*|v| with zero speed drift', () => {
    for (let i = 0; i < 20000; i++) {
      const speed = 10 + Math.random() * 5000;
      const theta = Math.random() * 2 * Math.PI;
      const ball = {
        vx: speed * Math.cos(theta),
        vy: speed * Math.sin(theta),
        speed
      };

      applyAntiStall(ball, 0.25, 0.05);

      assert.ok(!isNaN(ball.vx) && !isNaN(ball.vy));
      const curSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      assert.ok(Math.abs(curSpeed - speed) < 1e-2, 'Scalar speed preserved');
      const minVy = speed * 0.25;
      assert.ok(Math.abs(ball.vy) >= minVy - 1e-4, '|vy| >= 0.25*speed enforced');
    }
  });
});
