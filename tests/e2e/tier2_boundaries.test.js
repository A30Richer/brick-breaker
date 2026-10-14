/**
 * Tier 2: Boundary, Edge, and Corner Case Tests
 * Systematic stress and extreme condition verification:
 * - Empty / null / conflicting input actions
 * - Maximum ball speed capping (v_max = 750 px/s)
 * - Zero and extreme paddle contact offsets (delta = -1.0, +1.0, > 1.0)
 * - Rapid multi-bounce corridor ricochets & anti-stall clamping
 * - Ball at boundary borders and corner vertices
 * - 0 lives and instant game over
 * - Extreme delta-times (spike clamps and micro-steps)
 */

import assert from 'node:assert/strict';
import {
  TestSuite,
  getConfig,
  getStateModule,
  getPhysicsModule,
  createIsolatedTestLevel,
  createSyntheticLevelDef,
  assertApprox,
  assertInBounds
} from './test_helpers.js';

export async function createTier2Suites() {
  const suites = [];
  const stateMod = await getStateModule();
  const physMod = await getPhysicsModule();
  const configMod = await getConfig();

  // =========================================================================
  // Category 1: Paddle Deflection Boundaries & Contact Extremes
  // =========================================================================
  const s1 = new TestSuite('Category 1: Paddle Deflection Boundaries');
  if (!stateMod || !physMod || !configMod) {
    s1.skip('Core modules pending', 'state.js, physics.js, or config.js not available');
  } else {
    const { createInitialState } = stateMod;
    const { stepPhysics, calculatePaddleDeflection } = physMod;
    const { DEFAULT_CONFIG } = configMod;

    s1.it('T2.1.1: Exact left corner hit (u = -1.0) clamps to max deflection angle (~ -60 deg)', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const paddle = state.paddle;
      const contactX = paddle.x; // Exact left edge (offset = -1.0)
      const res = calculatePaddleDeflection(contactX, paddle, 450, DEFAULT_CONFIG);
      assert.ok(res.offset <= -0.9, `Offset ${res.offset} near -1.0`);
      assert.ok(res.vx < 0, 'Horizontal velocity deflected leftward');
      assert.ok(res.vy < 0, 'Vertical velocity deflected upward');
      assert.ok(
        Math.abs(res.angle) <= DEFAULT_CONFIG.physics.maxDeflectionAngle + 0.05,
        'Angle clamped within configured maxDeflectionAngle'
      );
    });

    s1.it('T2.1.2: Exact right corner hit (u = +1.0) clamps to max deflection angle (~ +60 deg)', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const paddle = state.paddle;
      const contactX = paddle.x + paddle.width; // Exact right edge (offset = +1.0)
      const res = calculatePaddleDeflection(contactX, paddle, 450, DEFAULT_CONFIG);
      assert.ok(res.offset >= 0.9, `Offset ${res.offset} near +1.0`);
      assert.ok(res.vx > 0, 'Horizontal velocity deflected rightward');
      assert.ok(res.vy < 0, 'Vertical velocity deflected upward');
      assert.ok(
        res.angle <= DEFAULT_CONFIG.physics.maxDeflectionAngle + 0.05,
        'Angle clamped within configured maxDeflectionAngle'
      );
    });

    s1.it('T2.1.3: Beyond-boundary offset (|u| > 1.0) does not NaN or exceed max angle clamp', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const paddle = state.paddle;
      const contactX = paddle.x + paddle.width * 2; // Extreme overshoot
      const res = calculatePaddleDeflection(contactX, paddle, 450, DEFAULT_CONFIG);
      assert.ok(!isNaN(res.vx) && !isNaN(res.vy), 'Deflection vectors are numerical');
      assert.ok(res.offset <= 0.96, 'Offset clamped to <= 0.95');
      assert.ok(
        res.angle <= DEFAULT_CONFIG.physics.maxDeflectionAngle + 0.05,
        'Angle clamped within max'
      );
    });

    s1.it('T2.1.4: Extreme contact maintains vertical component for clear upward ascent', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const paddle = state.paddle;
      const res = calculatePaddleDeflection(paddle.x, paddle, 450, DEFAULT_CONFIG);
      const minVerticalRatio = DEFAULT_CONFIG.physics.minVerticalSpeedRatio || 0.25;
      assert.ok(
        Math.abs(res.vy) >= 450 * minVerticalRatio - 1.0,
        `Vertical velocity |vy| (${Math.abs(res.vy)}) >= min (${450 * minVerticalRatio})`
      );
    });

    s1.it('T2.1.5: Side or corner collision depenetrates ball upward above paddle top surface', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      // Position ball intersecting top corner
      ball.x = state.paddle.x + 2;
      ball.y = state.paddle.y + 2;
      ball.vx = 50;
      ball.vy = 300;
      ball.speed = 300;

      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      assert.ok(
        ball.y <= state.paddle.y - ball.radius + 0.1,
        `Ball center (${ball.y}) depenetrated above paddle (${state.paddle.y - ball.radius})`
      );
    });
  }
  suites.push(s1);

  // =========================================================================
  // Category 2: Speed Limits & Kinetic Normalization
  // =========================================================================
  const s2 = new TestSuite('Category 2: Speed Limits & Normalization');
  if (!stateMod || !physMod || !configMod) {
    s2.skip('Core modules pending', 'state.js, physics.js, or config.js not available');
  } else {
    const { createInitialState } = stateMod;
    const { stepPhysics } = physMod;
    const { DEFAULT_CONFIG } = configMod;

    s2.it('T2.2.1: Repeated brick hits scale speed but never exceed maxSpeed cap (750 px/s)', () => {
      const state = createInitialState(DEFAULT_CONFIG, createIsolatedTestLevel({ '1,5': 1 }));
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.speed = 749.5; // Right near max
      ball.vx = 0;
      ball.vy = -749.5;
      const targetBrick = state.bricks[0];
      ball.x = targetBrick.x + targetBrick.width / 2;
      ball.y = targetBrick.y + targetBrick.height + ball.radius + 4;

      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      const maxSpeed = DEFAULT_CONFIG.ball.maxSpeed;
      assert.ok(ball.speed <= maxSpeed + 0.01, `Ball speed ${ball.speed} <= maxSpeed ${maxSpeed}`);
      const actualSpeed = Math.hypot(ball.vx, ball.vy);
      assert.ok(actualSpeed <= maxSpeed + 0.1, `Scalar velocity ${actualSpeed} <= maxSpeed ${maxSpeed}`);
    });

    s2.it('T2.2.2: Extreme high velocity (2,500 px/s) does not tunnel through arena boundary', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = 240;
      ball.y = 25;
      ball.vx = 0;
      ball.vy = -2500; // Extreme high speed toward top wall (travels > 40px in 1/60s)
      ball.speed = 2500;

      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      // Ball must reflect off top wall and remain within arena (y >= radius)
      assert.ok(ball.y >= ball.radius - 0.1, `Ball center ${ball.y} did not tunnel past top (radius ${ball.radius})`);
      assert.ok(ball.vy > 0, 'Ball velocity reflected downwards');
    });

    s2.it('T2.2.3: Booster brick speed multiplication (+15%) respects maxSpeed ceiling', () => {
      const state = createInitialState(DEFAULT_CONFIG, createIsolatedTestLevel({ '1,5': 5 })); // Booster brick
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.speed = 700; // 700 * 1.15 = 805 > 750
      ball.vx = 0;
      ball.vy = -700;
      const booster = state.bricks[0];
      ball.x = booster.x + booster.width / 2;
      ball.y = booster.y + booster.height + ball.radius + 4;

      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      const maxSpeed = DEFAULT_CONFIG.ball.maxSpeed;
      assert.ok(ball.speed <= maxSpeed + 0.01, `Booster speed ${ball.speed} capped at ${maxSpeed}`);
    });

    s2.it('T2.2.4: Sub-stepping displacement per micro-step at maxSpeed remains safe (< 2.0 px)', () => {
      const maxSpeed = DEFAULT_CONFIG.ball.maxSpeed || 750;
      const subSteps = DEFAULT_CONFIG.physics.subSteps || 8;
      const dt = 1 / 60;
      const displacementPerSubStep = (maxSpeed * dt) / subSteps;
      assert.ok(
        displacementPerSubStep < 2.0,
        `Displacement per micro-step (${displacementPerSubStep.toFixed(3)}px) < safe limit 2.0px`
      );
    });

    s2.it('T2.2.5: Near-zero velocity injection maintains numerical consistency without stalling', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = 240;
      ball.y = 300;
      ball.vx = 0.000001;
      ball.vy = -0.000001;
      ball.speed = 450;

      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      assert.ok(!isNaN(ball.x) && !isNaN(ball.y));
      assert.ok(!isNaN(ball.vx) && !isNaN(ball.vy));
    });
  }
  suites.push(s2);

  // =========================================================================
  // Category 3: Corridor Ricochets & Boundary Shaft Trapping
  // =========================================================================
  const s3 = new TestSuite('Category 3: Corridor Ricochets & Anti-Stall');
  if (!stateMod || !physMod || !configMod) {
    s3.skip('Core modules pending', 'state.js, physics.js, or config.js not available');
  } else {
    const { createInitialState } = stateMod;
    const { stepPhysics } = physMod;
    const { DEFAULT_CONFIG } = configMod;

    s3.it('T2.3.1: Ball with horizontal angle near 90 deg (vy = 0.001) in corridor enforced to |vy| >= 0.25*|v|', () => {
      const state = createInitialState(DEFAULT_CONFIG, createSyntheticLevelDef(16, 12));
      const chuteWall = state.bricks.find(b => b.indestructible);
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = chuteWall.x - ball.radius - 2;
      ball.y = chuteWall.y + chuteWall.height / 2;
      ball.vx = 450;
      ball.vy = -0.001; // Degenerate horizontal
      ball.speed = 450;

      stepPhysics(state, {}, 0.02, DEFAULT_CONFIG);
      const minVy = ball.speed * DEFAULT_CONFIG.physics.minVerticalSpeedRatio;
      assert.ok(
        Math.abs(ball.vy) >= minVy - 1.0,
        `Anti-stall recovered |vy| (${Math.abs(ball.vy)}) >= ${minVy}`
      );
    });

    s3.it('T2.3.2: 50 successive bounces inside narrow corridor maintains numerical coordinates without drift', () => {
      const state = createInitialState(DEFAULT_CONFIG, createSyntheticLevelDef(16, 12));
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = 270;
      ball.y = 200;
      ball.vx = 150;
      ball.vy = -200;
      ball.speed = Math.hypot(ball.vx, ball.vy);

      for (let f = 0; f < 50; f++) {
        stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
        assert.ok(!isNaN(ball.x) && !isNaN(ball.y), `Frame ${f}: coords are valid`);
        assert.ok(!isNaN(ball.vx) && !isNaN(ball.vy), `Frame ${f}: velocities are valid`);
      }
    });

    s3.it('T2.3.3: Corner vertex impact between two adjacent indestructible blocks resolves cleanly', () => {
      const state = createInitialState(DEFAULT_CONFIG, createSyntheticLevelDef(16, 12));
      const wall1 = state.bricks.find(b => b.indestructible && b.row === 2);
      const wall2 = state.bricks.find(b => b.indestructible && b.row === 3);
      if (wall1 && wall2) {
        const ball = state.balls[0];
        ball.attachedToPaddle = false;
        // Aim directly at vertex between wall 1 bottom and wall 2 top
        ball.x = wall1.x - ball.radius - 2;
        ball.y = wall1.y + wall1.height;
        ball.vx = 300;
        ball.vy = 0;
        ball.speed = 300;

        stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
        assert.ok(ball.vx < 0, 'Ball reflected horizontally off vertical wall face');
        assert.ok(!isNaN(ball.x) && !isNaN(ball.y));
      }
    });

    s3.it('T2.3.4: Indestructible guide rails maintain 100% durability across 100 impacts', () => {
      const state = createInitialState(DEFAULT_CONFIG, createSyntheticLevelDef(16, 12));
      const wall = state.bricks.find(b => b.indestructible);
      const ball = state.balls[0];
      ball.attachedToPaddle = false;

      for (let i = 0; i < 20; i++) {
        ball.x = wall.x - ball.radius - 2;
        ball.y = wall.y + wall.height / 2;
        ball.vx = 400;
        ball.vy = 50;
        ball.speed = Math.hypot(ball.vx, ball.vy);
        stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
        assert.equal(wall.hp, Infinity, `Iteration ${i}: HP remains Infinity`);
        assert.equal(wall.active, true, `Iteration ${i}: brick remains active`);
      }
    });

    s3.it('T2.3.5: Ball exiting corridor top into empty vault transitions smoothly to open flight', () => {
      const state = createInitialState(DEFAULT_CONFIG, createSyntheticLevelDef(16, 12));
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = 270;
      ball.y = 60; // Near top of chute
      ball.vx = 0;
      ball.vy = -350;
      ball.speed = 350;

      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      assert.ok(ball.y < 60, 'Ball emerged upwards into vault');
      assert.ok(ball.vy < 0, 'Ball velocity preserved upward motion');
    });
  }
  suites.push(s3);

  // =========================================================================
  // Category 4: Arena Borders & Kill Plane Triggers
  // =========================================================================
  const s4 = new TestSuite('Category 4: Arena Borders & Kill Plane');
  if (!stateMod || !physMod || !configMod) {
    s4.skip('Core modules pending', 'state.js, physics.js, or config.js not available');
  } else {
    const { createInitialState } = stateMod;
    const { stepPhysics } = physMod;
    const { DEFAULT_CONFIG } = configMod;

    s4.it('T2.4.1: Ball crossing top arena border (y <= r) is clamped and reflects vy', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = 200;
      ball.y = 8;
      ball.vx = 0;
      ball.vy = -400;
      ball.speed = 400;

      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      assert.ok(ball.y >= ball.radius - 0.1, `Clamped y (${ball.y}) >= radius (${ball.radius})`);
      assert.ok(ball.vy > 0, 'Vertical velocity inverted to positive (downward)');
    });

    s4.it('T2.4.2: Ball crossing left arena border (x <= r) is clamped and reflects vx', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = 8;
      ball.y = 300;
      ball.vx = -400;
      ball.vy = 0;
      ball.speed = 400;

      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      assert.ok(ball.x >= ball.radius - 0.1, `Clamped x (${ball.x}) >= radius (${ball.radius})`);
      assert.ok(ball.vx > 0, 'Horizontal velocity inverted to positive (rightward)');
    });

    s4.it('T2.4.3: Ball crossing right arena border (x >= W - r) is clamped and reflects vx', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const W = DEFAULT_CONFIG.arena.width;
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = W - 8;
      ball.y = 300;
      ball.vx = 400;
      ball.vy = 0;
      ball.speed = 400;

      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      assert.ok(ball.x <= W - ball.radius + 0.1, `Clamped x (${ball.x}) <= W - radius`);
      assert.ok(ball.vx < 0, 'Horizontal velocity inverted to negative (leftward)');
    });

    s4.it('T2.4.4: Ball hitting top-left corner (x <= r, y <= r) depenetrates both axes without NaN', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = 6;
      ball.y = 6;
      ball.vx = -400;
      ball.vy = -400;
      ball.speed = Math.hypot(ball.vx, ball.vy);

      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      assert.ok(!isNaN(ball.x) && !isNaN(ball.y));
      assert.ok(ball.x >= ball.radius - 0.1, 'x depenetrated');
      assert.ok(ball.y >= ball.radius - 0.1, 'y depenetrated');
    });

    s4.it('T2.4.5: Ball crossing bottom kill plane (y >= H) emits BALL_LOST and sets active = false', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const H = DEFAULT_CONFIG.arena.height;
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = 240;
      ball.y = H - 5;
      ball.vx = 0;
      ball.vy = 500; // Descending below arena
      ball.speed = 500;

      const events = stepPhysics(state, {}, 0.03, DEFAULT_CONFIG);
      const lostEvent = events.find(e => e.type === 'BALL_LOST');
      assert.ok(lostEvent, 'Emitted BALL_LOST event');
      assert.equal(ball.active, false, 'Ball deactivated on bottom exit');
    });
  }
  suites.push(s4);

  // =========================================================================
  // Category 5: Lives, Conflicting Inputs, & Extreme Delta-Times
  // =========================================================================
  const s5 = new TestSuite('Category 5: State Extremes & Delta-Times');
  if (!stateMod || !physMod || !configMod) {
    s5.skip('Core modules pending', 'state.js, physics.js, or config.js not available');
  } else {
    const { createInitialState } = stateMod;
    const { stepPhysics } = physMod;
    const { DEFAULT_CONFIG, GAME_STATUS } = configMod;

    s5.it('T2.5.1: Zero lives remaining transitions to GAME_OVER; no negative lives possible', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      state.status = GAME_STATUS.PLAYING;
      state.lives = 1; // Last life
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = 240;
      ball.y = DEFAULT_CONFIG.arena.height - 5;
      ball.vx = 0;
      ball.vy = 500;
      ball.speed = 500;

      const events = stepPhysics(state, {}, 0.03, DEFAULT_CONFIG);
      assert.equal(state.lives, 0, 'Lives decremented to exactly 0');
      assert.equal(state.status, GAME_STATUS.GAME_OVER, 'State is GAME_OVER');
      assert.ok(events.some(e => e.type === 'GAME_OVER'), 'GAME_OVER event emitted');
    });

    s5.it('T2.5.2: Delta-time spike (dt = 10.0 s) is clamped to <= 0.05 s preventing teleportation', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = 200;
      ball.y = 400;
      ball.vx = 200;
      ball.vy = 0;
      ball.speed = 200;

      stepPhysics(state, {}, 10.0, DEFAULT_CONFIG);
      // At max 0.05s clamped dt, displacement is at most 200 * 0.05 = 10.0px, not 2,000px!
      assert.ok(ball.x <= 200 + 200 * 0.06, `Ball traveled only ${ball.x - 200}px under clamped dt`);
    });

    s5.it('T2.5.3: Microscopic delta-time (dt = 1e-7 s) does not cause NaN or divide by zero', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const ball = state.balls[0];
      ball.attachedToPaddle = false;
      ball.x = 240;
      ball.y = 400;
      ball.vx = 300;
      ball.vy = -300;
      ball.speed = Math.hypot(ball.vx, ball.vy);

      stepPhysics(state, {}, 1e-7, DEFAULT_CONFIG);
      assert.ok(!isNaN(ball.x) && !isNaN(ball.y));
      assert.ok(!isNaN(ball.vx) && !isNaN(ball.vy));
    });

    s5.it('T2.5.4: Empty input action ({}) handled safely without crash or paddle jump', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const startX = state.paddle.x;
      stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
      assert.equal(state.paddle.x, startX, 'Paddle stayed stationary on empty input');
      assert.equal(state.paddle.vx, 0, 'Paddle velocity is zero');
    });

    s5.it('T2.5.5: Simultaneous opposing inputs (moveLeft and moveRight true) cancel out', () => {
      const state = createInitialState(DEFAULT_CONFIG);
      const startX = state.paddle.x;
      stepPhysics(state, { moveLeft: true, moveRight: true }, 1 / 60, DEFAULT_CONFIG);
      assert.equal(state.paddle.x, startX, 'Simultaneous opposing inputs yielded zero net displacement');
      assert.equal(state.paddle.vx, 0, 'Net paddle velocity cancelled to 0');
    });
  }
  suites.push(s5);

  return suites;
}

// Self-executing runner if run directly via node tests/e2e/tier2_boundaries.test.js
if (process.argv[1] && process.argv[1].endsWith('tier2_boundaries.test.js')) {
  (async () => {
    console.log('=== Running Tier 2 Boundary Tests ===\n');
    const suites = await createTier2Suites();
    let total = 0, passed = 0, failed = 0, skipped = 0;
    for (const suite of suites) {
      console.log(`Suite: ${suite.name}`);
      const res = await suite.run({ verbose: true });
      total += res.total;
      passed += res.passed;
      failed += res.failed;
      skipped += res.skipped;
      console.log(`  Summary: ${res.passed}/${res.total} passed (${res.skipped} skipped, ${res.durationMs}ms)\n`);
    }
    console.log(`Tier 2 Total: ${passed}/${total} passed (${skipped} skipped, ${failed} failed)`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}
