import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, GAME_STATUS } from '../src/config.js';
import { createInitialState } from '../src/core/state.js';
import { stepPhysics } from '../src/core/physics.js';

test('multiple side-wall bounces consume the full tick without losing vertical travel', () => {
  const config = {
    ...DEFAULT_CONFIG,
    arena: { width: 20, height: 10000 },
    paddle: { ...DEFAULT_CONFIG.paddle, width: 10, y: 9000 },
    physics: { ...DEFAULT_CONFIG.physics, subSteps: 1, minVerticalSpeedRatio: 0, microJitter: 0 }
  };
  const state = createInitialState(config, { cols: 1, rows: 1, layout: ['1'] });
  state.status = GAME_STATUS.PLAYING;
  Object.assign(state.balls[0], {
    x: 6, y: 500, vx: 600, vy: 150, speed: Math.hypot(600, 150), attachedToPaddle: false
  });
  const events = stepPhysics(state, {}, 0.05, config);
  assert.equal(events.filter(event => event.type === 'WALL_HIT').length, 2);
  assert.ok(Math.abs(state.balls[0].y - 507.5) < 1e-9, 'side walls cannot consume vertical travel');
});

test('the standard 11px horizontal corridor preserves lateral speed across rapid ricochets', () => {
  const state = createInitialState(DEFAULT_CONFIG, {
    cols: 32, rows: 3,
    layout: ['4'.repeat(32), '0'.repeat(32), '4'.repeat(31) + '1']
  });
  state.status = GAME_STATUS.PLAYING;
  Object.assign(state.balls[0], {
    x: 100, y: 56, vx: 200, vy: 700, speed: Math.hypot(200, 700), attachedToPaddle: false
  });
  const events = stepPhysics(state, {}, 0.05, DEFAULT_CONFIG);
  assert.ok(events.filter(event => event.type === 'BRICK_HIT').length >= 10, 'fixture exercises repeated corridor impacts');
  assert.ok(Math.abs(state.balls[0].x - 110) < 1e-9, 'vertical reflections preserve the full horizontal travel');
  assert.ok(Math.abs(Math.hypot(state.balls[0].vx, state.balls[0].vy) - Math.hypot(200, 700)) < 1e-9);
});
