import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, GAME_STATUS } from '../src/config.js';
import { createInitialState, cloneState, serializeState, deserializeState } from '../src/core/state.js';
import { stepPhysics, sweptCircleAABB } from '../src/core/physics.js';
import { GameEngine } from '../src/core/engine.js';

const TEST_CONFIG = {
  ...DEFAULT_CONFIG,
  ball: { ...DEFAULT_CONFIG.ball, speedIncrementOnHit: 0 },
  physics: { ...DEFAULT_CONFIG.physics, subSteps: 1, microJitter: 0 }
};

function makeState(layout = ['7000000001']) {
  return createInitialState(TEST_CONFIG, {
    cols: 10,
    rows: layout.length,
    brickWidth: 30,
    brickHeight: 20,
    offsetX: 60,
    offsetY: 100,
    ballInitialSpeed: 520,
    layout
  });
}

function strike(state, brick, config = TEST_CONFIG) {
  const ball = state.balls.find(candidate => candidate.active);
  state.status = GAME_STATUS.PLAYING;
  Object.assign(ball, {
    x: brick.x + brick.width / 2,
    y: brick.y + brick.height + ball.radius + 2,
    vx: 0,
    vy: -ball.speed,
    attachedToPaddle: false
  });
  return stepPhysics(state, {}, 1 / 60, config);
}

function assertHealthyBalls(state) {
  assert.equal(new Set(state.balls.map(ball => ball.id)).size, state.balls.length);
  for (const ball of state.balls) {
    assert.equal(ball.active, true);
    assert.equal(ball.attachedToPaddle, false);
    assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.y));
    assert.ok(Number.isFinite(ball.vx) && Number.isFinite(ball.vy));
    assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - ball.speed) < 1e-9);
    assert.ok(ball.x >= ball.radius && ball.x <= state.arena.width - ball.radius);
    assert.ok(ball.y >= ball.radius && ball.y <= state.arena.height - ball.radius);
  }
}

test('x2 destroys its brick once, doubles 1 to 2, and preserves speed with a distinct direction', () => {
  const state = makeState();
  const powerBrick = state.bricks.find(brick => brick.type === 7);
  assert.equal(powerBrick.hp, 1);
  assert.equal(powerBrick.points, 350);

  const events = strike(state, powerBrick);
  assert.equal(state.balls.length, 2);
  assert.equal(powerBrick.active, false);
  assert.equal(state.score, 350);
  assert.equal(state.stats.bricksDestroyed, 1);
  const event = events.find(event => event.type === 'MULTIBALL');
  assert.equal(event.powerup, 'BALL_DOUBLER');
  assert.equal(event.spawnedCount, 1);
  assert.equal(event.activeCount, 2);
  assert.deepEqual(event.ballIds, [2]);
  assert.equal(state.nextBallId, 3);
  assert.equal(state.balls[0].speed, 520);
  assert.equal(state.balls[1].speed, 520);
  assert.notEqual(state.balls[0].vx, state.balls[1].vx);
  assertHealthyBalls(state);

  // New balls stay at their spawn position for this tick; they start moving next tick.
  assert.ok(Math.abs(state.balls[1].y - (powerBrick.y + powerBrick.height + state.balls[1].radius + 0.05)) < 1e-9);
  assert.ok(state.balls[0].y > state.balls[1].y);
  const nextEvents = strike(state, powerBrick);
  assert.equal(state.balls.length, 2);
  assert.equal(state.score, 350);
  assert.equal(nextEvents.some(event => event.type === 'MULTIBALL'), false);
});

test('x2 doubles two existing balls to four without changing the original velocities', () => {
  const state = makeState();
  const secondBall = {
    ...state.balls[0], id: 2, x: 300, y: 400,
    vx: 180, vy: -240, speed: 300, attachedToPaddle: false
  };
  state.balls.push(secondBall);
  const events = strike(state, state.bricks.find(brick => brick.type === 7));
  assert.equal(state.balls.length, 4);
  assert.equal(secondBall.vx, 180);
  assert.equal(secondBall.vy, -240);
  assert.equal(state.balls.find(ball => ball.id === 4).speed, 300);
  assert.deepEqual(events.find(event => event.type === 'MULTIBALL').ballIds, [3, 4]);
  assertHealthyBalls(state);
});

test('+3 adds exactly three balls whether one or two balls were already active', () => {
  for (const initialCount of [1, 2]) {
    const state = makeState(['8000000001']);
    if (initialCount === 2) {
      state.balls.push({ ...state.balls[0], id: 2, x: 300, y: 400, vx: 100, vy: -300, speed: Math.hypot(100, 300), attachedToPaddle: false });
    }
    const events = strike(state, state.bricks.find(brick => brick.type === 8));
    assert.equal(state.balls.length, initialCount + 3);
    const event = events.find(event => event.type === 'MULTIBALL');
    assert.equal(event.powerup, 'EXTRA_BALLS');
    assert.equal(event.spawnedCount, 3);
    assert.equal(event.activeCount, initialCount + 3);
    const spawned = state.balls.filter(ball => event.ballIds.includes(ball.id));
    assert.equal(new Set(spawned.map(ball => `${ball.vx.toFixed(5)},${ball.vy.toFixed(5)}`)).size, 3);
    assertHealthyBalls(state);
  }
});

test('both powers obey the configurable limit, including a full default 32-ball pool', () => {
  for (const type of [7, 8]) {
    const state = makeState([`${type}000000001`]);
    state.balls.push({ ...state.balls[0], id: 2, x: 300, y: 400, vx: 200, vy: -300, speed: Math.hypot(200, 300), attachedToPaddle: false });
    const cappedConfig = { ...TEST_CONFIG, ball: { ...TEST_CONFIG.ball, maxBalls: 3 } };
    const events = strike(state, state.bricks.find(brick => brick.type === type), cappedConfig);
    assert.equal(state.balls.length, 3);
    assert.equal(events.find(event => event.type === 'MULTIBALL').spawnedCount, 1);
    assertHealthyBalls(state);
  }

  const state = makeState(['8000000001']);
  for (let id = 2; id <= DEFAULT_CONFIG.ball.maxBalls; id++) {
    state.balls.push({ ...state.balls[0], id, x: 240, y: 400, vx: 100, vy: -300, speed: Math.hypot(100, 300), attachedToPaddle: false });
  }
  const events = strike(state, state.bricks.find(brick => brick.type === 8));
  assert.equal(state.balls.length, 32);
  assert.equal(events.find(event => event.type === 'MULTIBALL').spawnedCount, 0);
  assert.equal(state.stats.bricksDestroyed, 1);
});

test('bomb destruction activates neighboring powers once and counts pending births in x2', () => {
  const state = makeState(['0870000001', '4600000000', '0000000000']);
  const events = strike(state, state.bricks.find(brick => brick.type === 6));
  const powers = events.filter(event => event.type === 'MULTIBALL');
  assert.deepEqual(powers.map(event => event.powerup), ['EXTRA_BALLS', 'BALL_DOUBLER']);
  assert.deepEqual(powers.map(event => event.spawnedCount), [3, 4]);
  assert.deepEqual(powers.map(event => event.activeCount), [4, 8]);
  assert.ok(powers.every(event => event.source === 'BOMB_BLAST'));
  assert.equal(state.balls.length, 8);
  assert.equal(state.stats.bricksDestroyed, 3);
  assert.equal(state.stats.remainingBreakableBricks, 1);
  assert.equal(state.score, 1100);
  assert.equal(state.bricks.find(brick => brick.type === 4).active, true);
  assertHealthyBalls(state);
  for (const ball of state.balls.slice(1)) {
    assert.ok(state.bricks.filter(brick => brick.active).every(brick => !sweptCircleAABB(ball.x, ball.y, 0, 0, ball.radius, brick)));
  }
  const followingEvents = stepPhysics(state, {}, 1 / 60, TEST_CONFIG);
  assert.equal(followingEvents.some(event => event.type === 'MULTIBALL'), false);
  assert.equal(state.balls.length, 8);
});

test('newborn balls cannot destroy a nearby power and recursively spawn during the same tick', () => {
  const state = makeState(['7000000001', '0800000000']);
  const nearbyPower = state.bricks.find(brick => brick.type === 8);
  const events = strike(state, state.bricks.find(brick => brick.type === 7));
  assert.equal(events.filter(event => event.type === 'MULTIBALL').length, 1);
  assert.equal(state.balls.length, 2);
  assert.equal(nearbyPower.active, true);
});

test('loss removes inactive balls, costs a life only after the last ball, and respawns one ball', () => {
  const state = makeState(['8000000001']);
  strike(state, state.bricks.find(brick => brick.type === 8));
  const retire = ball => Object.assign(ball, { x: 30, y: state.arena.height - 2, vx: 0, vy: 520 });
  retire(state.balls[1]);
  const firstEvents = stepPhysics(state, {}, 1 / 60, TEST_CONFIG);
  assert.equal(state.balls.length, 3);
  assert.equal(state.lives, 3);
  assert.equal(state.stats.ballsLost, 1);
  assert.equal(firstEvents.some(event => event.type === 'LIFE_LOST'), false);
  const highestOldId = state.nextBallId - 1;
  state.balls.forEach(retire);
  const finalEvents = stepPhysics(state, {}, 1 / 60, TEST_CONFIG);
  assert.equal(state.balls.length, 1);
  assert.equal(state.balls[0].active, true);
  assert.equal(state.balls[0].attachedToPaddle, true);
  assert.ok(state.balls[0].id > highestOldId);
  assert.equal(state.balls[0].vx, 0);
  assert.equal(state.balls[0].vy, 0);
  assert.equal(state.status, GAME_STATUS.READY);
  assert.equal(state.lives, 2);
  assert.equal(state.stats.ballsLost, 4);
  assert.equal(finalEvents.filter(event => event.type === 'LIFE_LOST').length, 1);
});

test('losing a swarm with one life remaining emits one GAME_OVER and leaves no inactive buildup', () => {
  const state = makeState(['8000000001']);
  strike(state, state.bricks.find(brick => brick.type === 8));
  state.lives = 1;
  state.balls.forEach(ball => Object.assign(ball, { x: 30, y: state.arena.height - 2, vx: 0, vy: 520 }));
  const events = stepPhysics(state, {}, 1 / 60, TEST_CONFIG);
  assert.equal(state.balls.length, 0);
  assert.equal(state.lives, 0);
  assert.equal(state.status, GAME_STATUS.GAME_OVER);
  assert.equal(events.filter(event => event.type === 'GAME_OVER').length, 1);
  assert.deepEqual(stepPhysics(state, {}, 1 / 60, TEST_CONFIG), []);
  assert.equal(state.lives, 0);
});

test('pause freezes an active swarm through both engine and direct physics calls', () => {
  const engine = new GameEngine(TEST_CONFIG);
  const state = makeState(['8000000001']);
  strike(state, state.bricks.find(brick => brick.type === 8));
  engine.setState(state);
  engine.togglePause();
  const snapshot = cloneState(state);
  assert.deepEqual(engine.tick(1 / 60).events, []);
  assert.deepEqual(stepPhysics(state, {}, 1 / 60, TEST_CONFIG), []);
  assert.deepEqual(state, snapshot);
  engine.togglePause();
  engine.tick(1 / 60);
  assert.ok(state.frame > snapshot.frame);
});

test('serialization preserves the swarm and ID counter for deterministic subsequent powers', () => {
  const state = makeState(['8007000001']);
  strike(state, state.bricks.find(brick => brick.type === 8));
  const restored = deserializeState(serializeState(state));
  assert.deepEqual(restored, state);
  const originalEvents = strike(state, state.bricks.find(brick => brick.type === 7));
  const restoredEvents = strike(restored, restored.bricks.find(brick => brick.type === 7));
  assert.deepEqual(restored, state);
  assert.deepEqual(restoredEvents, originalEvents);
  assert.equal(state.balls.length, 8);
  assert.deepEqual(originalEvents.find(event => event.type === 'MULTIBALL').ballIds, [5, 6, 7, 8]);
});

test('older snapshots without an ID counter still allocate IDs above existing balls', () => {
  const state = makeState();
  delete state.nextBallId;
  state.balls[0].id = 17;
  const events = strike(state, state.bricks.find(brick => brick.type === 7));
  assert.deepEqual(events.find(event => event.type === 'MULTIBALL').ballIds, [18]);
  assert.equal(state.nextBallId, 19);
});
