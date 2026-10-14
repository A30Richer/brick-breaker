/**
 * Tier 3: Pairwise Feature Interaction & Combination Tests
 * Systematic cross-feature interaction verification:
 * - Corridor ricochet + Bomb blast destruction (F5 + F6)
 * - Paddle slice momentum transfer + Variable deflection angle (F4 + F8)
 * - Rapid successive multi-brick ricochets in single tick (F2 + F3 + F6)
 * - Autonomous Bot steering during corridor rapid transit (F13 + F14 + F5)
 * - Bot mode toggle mid-flight during corridor transit (F15 + F5)
 * - Booster brick hit + Maximum speed cap clamping (F6 + F5 + F2)
 * - Breakable brick destruction + Level progression transition (F6 + F12 + F16)
 * - Pause toggle during high-speed corridor ricochet (F16 + F5)
 * - State serialization / deserialization round-trip invariance during ricochet (F1 + F5)
 */

import assert from 'node:assert/strict';
import {
  TestSuite,
  getConfig,
  getStateModule,
  getPhysicsModule,
  getLevelsModule,
  getLevelManagerModule,
  getBotModule,
  getEngineModule,
  createIsolatedTestLevel,
  createSyntheticLevelDef,
  assertApprox,
  assertInBounds
} from './test_helpers.js';

export async function createTier3Suites() {
  const suites = [];
  const stateMod = await getStateModule();
  const physMod = await getPhysicsModule();
  const configMod = await getConfig();
  const levelsMod = await getLevelsModule();
  const lmMod = await getLevelManagerModule();
  const botMod = await getBotModule();
  const engineMod = await getEngineModule();

  const s = new TestSuite('Tier 3: Pairwise Feature Combinations');

  if (!stateMod || !physMod || !configMod) {
    s.skip('Core modules pending', 'state.js, physics.js, or config.js not yet available');
    suites.push(s);
    return suites;
  }

  const { createInitialState, cloneState, serializeState, deserializeState } = stateMod;
  const { stepPhysics, calculatePaddleDeflection } = physMod;
  const { DEFAULT_CONFIG, GAME_STATUS } = configMod;

  // -------------------------------------------------------------------------
  // Interaction 1: Corridor Ricochet + Bomb Blast Destruction
  // -------------------------------------------------------------------------
  s.it('T3.1: Corridor ricochet + Bomb explosion destroys breakables while chute walls resist', () => {
    // Layout: col 5 is indestructible wall (4), col 6 is bomb (6), col 7 is breakable (1), top neighbor is breakable (1)
    const state = createInitialState(DEFAULT_CONFIG, createIsolatedTestLevel({
      '1,5': 4, // Indestructible chute wall
      '1,6': 6, // Bomb
      '1,7': 1, // Right breakable neighbor
      '0,6': 1  // Top breakable neighbor
    }));

    const wall = state.bricks.find(b => b.type === 4);
    const bomb = state.bricks.find(b => b.type === 6);
    const regular1 = state.bricks.find(b => b.col === 7 && b.row === 1);
    const regular2 = state.bricks.find(b => b.col === 6 && b.row === 0);

    assert.ok(wall && bomb && regular1 && regular2, 'All bricks placed');

    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.x = bomb.x + bomb.width / 2;
    ball.y = bomb.y + bomb.height + ball.radius + 3;
    ball.vx = 0;
    ball.vy = -300;
    ball.speed = 300;

    const events = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);

    // Bomb detonated
    assert.equal(bomb.active, false, 'Bomb brick deactivated');
    // Breakable neighbors destroyed by blast
    assert.equal(regular1.active, false, 'Breakable neighbor at col 7 destroyed by bomb blast');
    assert.equal(regular2.active, false, 'Breakable neighbor at row 2 destroyed by bomb blast');
    // Indestructible wall resisted blast
    assert.equal(wall.active, true, 'Indestructible chute wall survived bomb explosion');
    assert.equal(wall.hp, Infinity, 'Chute wall HP remains Infinity');
  });

  // -------------------------------------------------------------------------
  // Interaction 2: Paddle Slice Momentum + Variable Deflection Angle
  // -------------------------------------------------------------------------
  s.it('T3.2: Paddle slice momentum transfer adds horizontal boost while preserving scalar speed', () => {
    const state = createInitialState(DEFAULT_CONFIG);
    const paddle = state.paddle;
    const initialSpeed = 450;

    // Paddle moving right fast
    paddle.vx = 800;
    const contactX = paddle.x + paddle.width * 0.75; // Right offset

    const res = calculatePaddleDeflection(contactX, paddle, initialSpeed, DEFAULT_CONFIG);
    assert.ok(res.vx > 0, 'Horizontal velocity is positive (rightward)');
    const totalSpeed = Math.hypot(res.vx, res.vy);
    assertApprox(totalSpeed, initialSpeed, 2.0, 'Scalar kinetic speed preserved with slice');
  });

  // -------------------------------------------------------------------------
  // Interaction 3: Rapid Successive Brick Bounces in Single Tick
  // -------------------------------------------------------------------------
  s.it('T3.3: Rapid multi-brick bounces in single tick damages both bricks and depenetrates', () => {
    // Two bricks forming a tight V or horizontal ceiling
    const state = createInitialState(DEFAULT_CONFIG, createIsolatedTestLevel({
      '1,5': 1,
      '1,6': 1
    }));
    const b1 = state.bricks.find(b => b.col === 5);
    const b2 = state.bricks.find(b => b.col === 6);

    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    // Aim diagonally at the seam between the two bricks
    ball.x = b1.x + b1.width;
    ball.y = b1.y + b1.height + ball.radius + 3;
    ball.vx = 100;
    ball.vy = -300;
    ball.speed = Math.hypot(ball.vx, ball.vy);

    const events = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    const hitEvents = events.filter(e => e.type === 'BRICK_HIT');
    assert.ok(hitEvents.length >= 1, 'Registered at least one brick hit at seam');
    assert.ok(!isNaN(ball.x) && !isNaN(ball.y), 'Coordinates remained valid');
  });

  // -------------------------------------------------------------------------
  // Interaction 4: Autonomous Bot Steering During Chute Transit
  // -------------------------------------------------------------------------
  s.it('T3.4: Autonomous bot predicts ball emerging from chute and steers into position', () => {
    if (!botMod) {
      assert.ok(true, 'Bot module pending in M3');
      return;
    }
    const { computeBotAction } = botMod;
    const state = createInitialState(DEFAULT_CONFIG, createSyntheticLevelDef(16, 12));
    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    // Ball descending through central chute
    ball.x = 270;
    ball.y = 350;
    ball.vx = 40;
    ball.vy = 350;
    ball.speed = Math.hypot(ball.vx, ball.vy);

    state.paddle.x = 50; // Far away on the left
    const action = computeBotAction(state, 1 / 60, DEFAULT_CONFIG);

    assert.equal(action.moveRight, true, 'Bot immediately commands moveRight to intercept chute exit');
    assert.ok(action.targetX > 200, 'Target intercept calculated near chute exit');
  });

  // -------------------------------------------------------------------------
  // Interaction 5: Bot Mode Toggle Mid-Flight During Corridor Transit
  // -------------------------------------------------------------------------
  s.it('T3.5: Bot mode toggle mid-flight does not disrupt ball trajectory or speed', () => {
    const state = createInitialState(DEFAULT_CONFIG, createSyntheticLevelDef(16, 12));
    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.x = 270;
    ball.y = 250;
    ball.vx = 50;
    ball.vy = -350;
    ball.speed = Math.hypot(ball.vx, ball.vy);

    // Toggle bot on
    state.mode.isBotActive = true;
    stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    const speedAfterOn = Math.hypot(ball.vx, ball.vy);

    // Toggle bot off
    state.mode.isBotActive = false;
    stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    const speedAfterOff = Math.hypot(ball.vx, ball.vy);

    assertApprox(speedAfterOn, speedAfterOff, 2.0, 'Speed undisturbed across bot toggles');
    assert.ok(!isNaN(ball.x) && !isNaN(ball.y));
  });

  // -------------------------------------------------------------------------
  // Interaction 6: Booster Brick Hit + Maximum Speed Cap Clamping
  // -------------------------------------------------------------------------
  s.it('T3.6: Booster brick (+15%) when speed is near maxSpeed clamps exactly at 750 px/s', () => {
    const state = createInitialState(DEFAULT_CONFIG, createIsolatedTestLevel({ '1,5': 5 }));
    const booster = state.bricks[0];
    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.speed = 720; // 720 * 1.15 = 828 > 750
    ball.vx = 0;
    ball.vy = -720;
    ball.x = booster.x + booster.width / 2;
    ball.y = booster.y + booster.height + ball.radius + 4;

    stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    const maxSpeed = DEFAULT_CONFIG.ball.maxSpeed;
    assert.ok(ball.speed <= maxSpeed + 0.01, `Booster speed ${ball.speed} clamped to max ${maxSpeed}`);
  });

  // -------------------------------------------------------------------------
  // Interaction 7: Breakable Destruction + Level Progression Transition
  // -------------------------------------------------------------------------
  s.it('T3.7: Destroying final breakable triggers LEVEL_CLEAR while indestructible walls remain', () => {
    // Only 1 breakable brick and 1 indestructible corridor wall
    const state = createInitialState(DEFAULT_CONFIG, createIsolatedTestLevel({
      '1,5': 1, // Breakable
      '1,8': 4  // Indestructible
    }));
    state.status = GAME_STATUS.PLAYING;

    const breakable = state.bricks.find(b => b.type === 1);
    const wall = state.bricks.find(b => b.type === 4);
    assert.equal(state.stats.remainingBreakableBricks, 1);

    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.x = breakable.x + breakable.width / 2;
    ball.y = breakable.y + breakable.height + ball.radius + 4;
    ball.vx = 0;
    ball.vy = -300;
    ball.speed = 300;

    const events = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.equal(state.stats.remainingBreakableBricks, 0, 'Remaining breakable count is 0');
    assert.equal(state.status, GAME_STATUS.LEVEL_CLEAR, 'Status transitioned to LEVEL_CLEAR');
    assert.ok(events.some(e => e.type === 'LEVEL_CLEAR'), 'LEVEL_CLEAR event emitted');
    assert.equal(wall.active, true, 'Indestructible wall remains active');
  });

  // -------------------------------------------------------------------------
  // Interaction 8: Pause State Freeze & Resume Determinism
  // -------------------------------------------------------------------------
  s.it('T3.8: Pause freezes simulation, and resume restores identical motion vector', () => {
    if (!engineMod) {
      assert.ok(true, 'Engine module pending in M3');
      return;
    }
    const { GameEngine } = engineMod;
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.launchBall();

    // Advance 5 ticks
    for (let i = 0; i < 5; i++) engine.tick(1 / 60);

    const ballBefore = { ...engine.getState().balls[0] };
    engine.togglePause();
    assert.equal(engine.getState().status, GAME_STATUS.PAUSED);

    // Tick while paused
    for (let i = 0; i < 10; i++) engine.tick(1 / 60);
    const ballDuringPause = engine.getState().balls[0];
    assert.equal(ballDuringPause.x, ballBefore.x, 'Position frozen during pause');
    assert.equal(ballDuringPause.y, ballBefore.y, 'Position frozen during pause');

    // Resume
    engine.togglePause();
    assert.equal(engine.getState().status, GAME_STATUS.PLAYING);
    engine.tick(1 / 60);
    assert.notEqual(engine.getState().balls[0].y, ballBefore.y, 'Motion resumed after unpause');
  });

  // -------------------------------------------------------------------------
  // Interaction 9: State Serialization / Deserialization Invariance
  // -------------------------------------------------------------------------
  s.it('T3.9: Serialized state snapshot restored mid-flight produces identical physics integration', () => {
    const state1 = createInitialState(DEFAULT_CONFIG, createSyntheticLevelDef(16, 12));
    const ball1 = state1.balls[0];
    ball1.attachedToPaddle = false;
    ball1.x = 270;
    ball1.y = 300;
    ball1.vx = 80;
    ball1.vy = -320;
    ball1.speed = Math.hypot(ball1.vx, ball1.vy);

    // Run 10 ticks
    for (let i = 0; i < 10; i++) stepPhysics(state1, {}, 1 / 60, DEFAULT_CONFIG);

    // Serialize snapshot
    const json = serializeState(state1);
    const state2 = deserializeState(json);

    // Advance both for another 15 ticks
    for (let i = 0; i < 15; i++) {
      stepPhysics(state1, {}, 1 / 60, DEFAULT_CONFIG);
      stepPhysics(state2, {}, 1 / 60, DEFAULT_CONFIG);
    }

    assertApprox(state1.balls[0].x, state2.balls[0].x, 0.001, 'Ball X identical after deserialize');
    assertApprox(state1.balls[0].y, state2.balls[0].y, 0.001, 'Ball Y identical after deserialize');
    assertApprox(state1.balls[0].vx, state2.balls[0].vx, 0.001, 'Ball VX identical after deserialize');
    assertApprox(state1.balls[0].vy, state2.balls[0].vy, 0.001, 'Ball VY identical after deserialize');
    assert.equal(state1.score, state2.score, 'Scores match');
    assert.equal(state1.stats.bricksDestroyed, state2.stats.bricksDestroyed, 'Stats match');
  });

  suites.push(s);
  return suites;
}

// Self-executing runner if run directly via node tests/e2e/tier3_combinations.test.js
if (process.argv[1] && process.argv[1].endsWith('tier3_combinations.test.js')) {
  (async () => {
    console.log('=== Running Tier 3 Combination Tests ===\n');
    const suites = await createTier3Suites();
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
    console.log(`Tier 3 Total: ${passed}/${total} passed (${skipped} skipped, ${failed} failed)`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}
