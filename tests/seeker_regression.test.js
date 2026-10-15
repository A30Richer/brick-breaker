import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, GAME_STATUS } from '../src/config.js';
import { createInitialState } from '../src/core/state.js';
import { stepPhysics } from '../src/core/physics.js';

const collisionTypes = new Set(['BRICK_HIT', 'WALL_HIT', 'PADDLE_HIT', 'SHIELD_HIT']);
const optionalAssist = {
  ...DEFAULT_CONFIG,
  physics: { ...DEFAULT_CONFIG.physics, seeker: {} }
};

function orbitFixture({ clearOthers = true, targetType = 1 } = {}) {
  const layout = Array.from({ length: 44 }, () => '0'.repeat(32));
  for (let row = 0; row < 3; row++) layout[row] = '1'.repeat(32);
  layout[3] = '111' + '0'.repeat(29);
  layout[20] = '0'.repeat(16) + targetType + '0'.repeat(15);
  const state = createInitialState(DEFAULT_CONFIG, { cols: 32, rows: 44, layout });
  const target = state.bricks.at(-1);
  if (clearOthers) {
    for (const brick of state.bricks) {
      if (brick === target) continue;
      brick.active = false;
      brick.hp = 0;
      state.grid.cells[brick.row * state.grid.cols + brick.col] = -1;
    }
    state.stats.bricksDestroyed = 99;
    state.stats.remainingBreakableBricks = 1;
  }
  state.status = GAME_STATUS.PLAYING;
  Object.assign(state.balls[0], {
    x: 350, y: 265.5, vx: 0, vy: -450, speed: 450, attachedToPaddle: false
  });
  return { state, target };
}

test('the former circular-orbit fixture travels straight with the default physics', () => {
  const { state } = orbitFixture();
  const ball = state.balls[0];
  for (let frame = 0; frame < 30; frame++) {
    const events = stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
    assert.equal(events.some(event => collisionTypes.has(event.type)), false);
    assert.equal(events.some(event => event.type === 'SEEKER_ON'), false);
    assert.equal(ball.vx, 0);
    assert.equal(ball.vy, -450);
  }
  assert.equal(ball.x, 350);
  assert.ok(Math.abs(ball.y - 40.5) < 1e-9);
});

test('even explicitly enabled aim assistance never turns a ball between collisions', () => {
  const { state } = orbitFixture();
  let freeFlightFrames = 0;
  let collisionFrames = 0;
  for (let frame = 0; frame < 1200 && state.status === GAME_STATUS.PLAYING; frame++) {
    const before = new Map(state.balls.map(ball => [ball.id, { vx: ball.vx, vy: ball.vy }]));
    const events = stepPhysics(state, {}, 1 / 60, optionalAssist);
    const collided = new Set(events.filter(event => collisionTypes.has(event.type)).map(event => event.ball?.id));
    for (const ball of state.balls) {
      const previous = before.get(ball.id);
      if (!previous || !ball.active || ball.attachedToPaddle) continue;
      if (collided.has(ball.id)) {
        collisionFrames++;
      } else {
        freeFlightFrames++;
        assert.equal(ball.vx, previous.vx, `frame ${frame}: horizontal velocity changes only on contact`);
        assert.equal(ball.vy, previous.vy, `frame ${frame}: vertical velocity changes only on contact`);
      }
    }
  }
  assert.ok(freeFlightFrames >= 30);
  assert.ok(collisionFrames > 0);
  assert.notEqual(state.status, GAME_STATUS.GAME_OVER);
});

test('hitting reinforced armor resets the stall timer before optional assistance activates', () => {
  const { state, target } = orbitFixture({ clearOthers: false, targetType: 2 });
  state.seeker = { active: false, stall: 6.99, lastDestroyed: 0 };
  Object.assign(state.balls[0], {
    x: target.x + target.width / 2,
    y: target.y + target.height + state.balls[0].radius + 1
  });
  const events = stepPhysics(state, {}, 1 / 60, optionalAssist);
  assert.ok(events.some(event => event.type === 'BRICK_HIT' && event.brick === target && !event.destroyed));
  assert.equal(target.hp, 1);
  assert.equal(state.stats.bricksDestroyed, 0);
  assert.equal(state.seeker.stall, 0);
  assert.equal(state.seeker.active, false);
  assert.equal(events.some(event => event.type === 'SEEKER_ON'), false);
});

test('restoring an old seeking snapshot cannot keep steering or display active when disabled', () => {
  const { state } = orbitFixture();
  state.seeker = { active: true, stall: 20, lastDestroyed: 99 };
  const ball = state.balls[0];
  stepPhysics(state, {}, 1 / 60, DEFAULT_CONFIG);
  assert.equal(state.seeker.active, false);
  assert.equal(ball.vx, 0);
  assert.equal(ball.vy, -450);
});
