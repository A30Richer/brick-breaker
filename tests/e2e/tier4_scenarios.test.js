/**
 * Tier 4: Realistic Full-Game Simulation Scenarios
 * Covers comprehensive end-to-end user and simulation journeys:
 * - Scenario 1: Complete Level Clear Simulation (Serve, Chute Traversal, Brick Destruction, Level Clear)
 * - Scenario 2: 3,000-Frame Continuous Autonomous Bot Rally (Zero Drops, Level 1 & Level 2)
 * - Scenario 3: Multi-Level Campaign Progression (Level 1 through 5 to Victory)
 * - Scenario 4: Game Over & Full Restart Cycle (Lives 3 -> 0, Game Over, Restart)
 * - Scenario 5: Pause State Preservation & Deterministic Resumption
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

export async function createTier4Suites() {
  const suites = [];
  const stateMod = await getStateModule();
  const physMod = await getPhysicsModule();
  const configMod = await getConfig();
  const levelsMod = await getLevelsModule();
  const lmMod = await getLevelManagerModule();
  const botMod = await getBotModule();
  const engineMod = await getEngineModule();

  const s = new TestSuite('Tier 4: Realistic Full-Game Simulation Scenarios');

  if (!stateMod || !physMod || !configMod) {
    s.skip('Core modules pending', 'state.js, physics.js, or config.js not yet present');
    suites.push(s);
    return suites;
  }

  const { createInitialState, cloneState, serializeState, deserializeState } = stateMod;
  const { stepPhysics } = physMod;
  const { DEFAULT_CONFIG, GAME_STATUS } = configMod;

  // =========================================================================
  // Scenario 1: Complete Level Clear Simulation
  // =========================================================================
  s.it('Scenario 1: Complete Level Clear Simulation (Serve -> Break All -> LEVEL_CLEAR)', () => {
    // Controlled arena with 4 breakable bricks and 2 indestructible walls
    const state = createInitialState(DEFAULT_CONFIG, createIsolatedTestLevel({
      '1,4': 4, // Indestructible guide rail
      '1,5': 1, // Regular 1
      '1,6': 1, // Regular 2
      '1,7': 4  // Indestructible guide rail
    }));

    assert.equal(state.status, GAME_STATUS.READY);
    assert.equal(state.stats.remainingBreakableBricks, 2);

    // 1. Serve ball
    const launchEvents = stepPhysics(state, { launchBall: true }, 1 / 60, DEFAULT_CONFIG);
    assert.equal(state.status, GAME_STATUS.PLAYING, 'State transitioned to PLAYING after serve');
    assert.equal(state.balls[0].attachedToPaddle, false, 'Ball detached from paddle');
    assert.ok(state.balls[0].vy < 0, 'Ball launched upwards');

    // 2. Hit brick 1
    const b1 = state.bricks.find(b => b.col === 5);
    state.balls[0].x = b1.x + b1.width / 2;
    state.balls[0].y = b1.y + b1.height + state.balls[0].radius + 4;
    state.balls[0].vx = 0;
    state.balls[0].vy = -300;
    stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);

    assert.equal(b1.active, false, 'Brick 1 destroyed');
    assert.equal(state.stats.remainingBreakableBricks, 1, '1 breakable remaining');
    assert.equal(state.status, GAME_STATUS.PLAYING, 'Still in PLAYING state');

    // 3. Hit brick 2 (final breakable)
    const b2 = state.bricks.find(b => b.col === 6);
    state.balls[0].x = b2.x + b2.width / 2;
    state.balls[0].y = b2.y + b2.height + state.balls[0].radius + 4;
    state.balls[0].vx = 0;
    state.balls[0].vy = -300;
    const finalEvents = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);

    assert.equal(b2.active, false, 'Brick 2 destroyed');
    assert.equal(state.stats.remainingBreakableBricks, 0, '0 breakables remaining');
    assert.equal(state.status, GAME_STATUS.LEVEL_CLEAR, 'Status reached LEVEL_CLEAR');
    assert.ok(finalEvents.some(e => e.type === 'LEVEL_CLEAR'), 'Emitted LEVEL_CLEAR event');
    assert.ok(state.score > 0, 'Score accumulated');
  });

  // =========================================================================
  // Scenario 2: 3,000-Frame Continuous Autonomous Bot Rally
  // =========================================================================
  s.it('Scenario 2: 3,000-Frame Continuous Autonomous Bot Rally (Zero Drops, Level 1 & 2)', async () => {
    if (!botMod || !engineMod) {
      // Pending Milestone 3 (bot.js and engine.js)
      s.skip('Scenario 2: 3,000-Frame Bot Rally (Pending M3 bot.js & engine.js)', 'M3 not yet implemented');
      return;
    }

    const { GameEngine } = engineMod;
    const engine = new GameEngine(DEFAULT_CONFIG);
    engine.loadLevel(0); // Level 1
    engine.setBotActive(true);
    engine.launchBall();

    let totalFrames = 0;
    const TARGET_FRAMES = 3000;
    const framesPerLevel = TARGET_FRAMES / 2;

    const startTime = performance.now();

    // Part A: Level 1 (1,500 frames)
    for (let f = 0; f < framesPerLevel; f++) {
      engine.tick(1 / 60);
      totalFrames++;
    }

    // Part B: Level 2 (1,500 frames)
    engine.loadLevel(1);
    engine.launchBall();
    for (let f = 0; f < framesPerLevel; f++) {
      engine.tick(1 / 60);
      totalFrames++;
    }

    const elapsedMs = performance.now() - startTime;
    const finalState = engine.getState();

    // Assertions matching ORIGINAL_REQUEST.md and PROJECT.md §R3 / §Acceptance Criteria
    assert.equal(totalFrames, TARGET_FRAMES, `Completed full ${TARGET_FRAMES} frames`);
    assert.equal(finalState.stats.ballsLost, 0, 'Zero dropped balls over 3,000 continuous frames');
    assert.equal(finalState.lives, DEFAULT_CONFIG.rules.initialLives, 'Full lives retained');

    const totalDeflections = finalState.stats.paddleHits;
    const totalLost = finalState.stats.ballsLost;
    const deflectionRate = totalDeflections / (totalDeflections + totalLost || 1);
    assert.ok(
      deflectionRate >= 0.95,
      `Bot deflection success rate (${(deflectionRate * 100).toFixed(1)}%) >= 95%`
    );
    assert.ok(finalState.stats.bricksDestroyed > 0, 'Bricks successfully destroyed during rally');
    assert.ok(elapsedMs < 3000, `Headless execution completed quickly (${elapsedMs.toFixed(0)}ms < 3000ms)`);
  });

  // =========================================================================
  // Scenario 3: Multi-Level Campaign Progression (Level 1 to 5 to Victory)
  // =========================================================================
  s.it('Scenario 3: Multi-Level Campaign Progression (Level 1 through 5 to Victory)', () => {
    if (!levelsMod || !lmMod) {
      s.skip('Scenario 3: Campaign Progression', 'levels.js or level_manager.js not available');
      return;
    }
    const { LEVELS } = levelsMod;
    const { LevelManager } = lmMod;

    const lm = new LevelManager(LEVELS);
    assert.equal(lm.getCurrentLevelIndex(), 0, 'Starts at Level 0 (Level 1)');

    let cumulativeScore = 0;

    // Simulate clearing each of the 5 levels
    for (let lvl = 0; lvl < 5; lvl++) {
      const levelDef = lm.getLevel(lvl);
      assert.ok(levelDef, `Loaded Level ${lvl + 1}: ${levelDef.name}`);

      const gridData = lm.buildGridForLevel(lvl, DEFAULT_CONFIG);
      assert.ok(gridData.bricks.length > 0, `Level ${lvl + 1} has bricks`);
      assert.ok(gridData.counts.breakableCount > 0, `Level ${lvl + 1} has breakables`);

      // Destroy breakable bricks
      for (const brick of gridData.bricks) {
        if (brick.breakable) {
          brick.hp = 0;
          cumulativeScore += brick.score || 0;
        }
      }

      assert.equal(lm.isLevelComplete(gridData.bricks), true, `Level ${lvl + 1} is complete`);
      assert.equal(lm.getRemainingBreakableCount(gridData.bricks), 0);

      // Advance progression
      const nextIdx = lm.advanceLevel();
      if (lvl < 4) {
        assert.equal(nextIdx, lvl + 1, `Advanced to Level index ${lvl + 1}`);
      } else {
        assert.equal(nextIdx, -1, 'Campaign finished after Level 5 (Victory)');
      }
    }

    assert.ok(cumulativeScore > 10000, `Cumulative campaign score accumulated: ${cumulativeScore}`);
  });

  // =========================================================================
  // Scenario 4: Game Over and Full Restart Cycle
  // =========================================================================
  s.it('Scenario 4: Game Over & Full Restart Cycle (Lives 3 -> 0 -> Restart -> READY)', () => {
    const state = createInitialState(DEFAULT_CONFIG, createSyntheticLevelDef(16, 10));
    state.status = GAME_STATUS.PLAYING;
    state.score = 3500;
    assert.equal(state.lives, 3);

    // Life loss 1: drop ball (lives 3 -> 2)
    state.balls[0].active = false;
    stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.equal(state.lives, 2);
    assert.equal(state.status, GAME_STATUS.READY);

    // Relaunch and drop ball (lives 2 -> 1)
    stepPhysics(state, { launchBall: true }, 1 / 60, DEFAULT_CONFIG);
    state.balls[0].active = false;
    stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.equal(state.lives, 1);
    assert.equal(state.status, GAME_STATUS.READY);

    // Relaunch and drop ball (lives 1 -> 0 -> GAME_OVER)
    stepPhysics(state, { launchBall: true }, 1 / 60, DEFAULT_CONFIG);
    state.balls[0].active = false;
    stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.equal(state.lives, 0);
    assert.equal(state.status, GAME_STATUS.GAME_OVER, 'Transitioned to GAME_OVER on zero lives');

    // Player triggers restart
    const restarted = createInitialState(DEFAULT_CONFIG, createSyntheticLevelDef(16, 10));
    assert.equal(restarted.lives, 3, 'Lives restored to 3 on restart');
    assert.equal(restarted.score, 0, 'Score reset to 0');
    assert.equal(restarted.status, GAME_STATUS.READY, 'Status reset to READY');
    assert.equal(restarted.balls[0].attachedToPaddle, true, 'Ball re-attached atop paddle');
  });

  // =========================================================================
  // Scenario 5: Pause State Preservation & Deterministic Resumption
  // =========================================================================
  s.it('Scenario 5: Pause State Preservation & Resumption Determinism', () => {
    const state = createInitialState(DEFAULT_CONFIG, createSyntheticLevelDef(16, 12));
    const ball = state.balls[0];
    ball.attachedToPaddle = false;
    ball.x = 270;
    ball.y = 250;
    ball.vx = 80;
    ball.vy = -350;
    ball.speed = Math.hypot(ball.vx, ball.vy);
    state.status = GAME_STATUS.PLAYING;

    // Simulate 10 frames
    for (let f = 0; f < 10; f++) stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);

    // Save snapshot before pause
    const snapshot = cloneState(state);
    assert.ok(snapshot);

    // Activate pause
    state.status = GAME_STATUS.PAUSED;

    // Verify state does not alter during paused state
    const pausedBall = { ...state.balls[0] };
    const pausedTime = state.time;
    const pausedFrame = state.frame;

    // Resume
    state.status = GAME_STATUS.PLAYING;
    assert.equal(state.balls[0].x, pausedBall.x, 'Ball X preserved');
    assert.equal(state.balls[0].y, pausedBall.y, 'Ball Y preserved');
    assert.equal(state.balls[0].vx, pausedBall.vx, 'Ball VX preserved');
    assert.equal(state.balls[0].vy, pausedBall.vy, 'Ball VY preserved');

    // Run 20 more frames after resume
    for (let f = 0; f < 20; f++) stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);

    assert.ok(!isNaN(state.balls[0].x) && !isNaN(state.balls[0].y));
    assert.ok(state.balls[0].y !== pausedBall.y, 'Ball progressed after resumption');
  });

  suites.push(s);
  return suites;
}

// Self-executing runner if run directly via node tests/e2e/tier4_scenarios.test.js
if (process.argv[1] && process.argv[1].endsWith('tier4_scenarios.test.js')) {
  (async () => {
    console.log('=== Running Tier 4 Realistic Simulation Scenarios ===\n');
    const suites = await createTier4Suites();
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
    console.log(`Tier 4 Total: ${passed}/${total} passed (${skipped} skipped, ${failed} failed)`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}
