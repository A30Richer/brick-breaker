import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, GAME_STATUS } from '../src/config.js';
import { createInitialState, serializeState, deserializeState } from '../src/core/state.js';
import { stepPhysics } from '../src/core/physics.js';
import { GameEngine } from '../src/core/engine.js';
import { generateMap } from '../src/core/map_generator.js';
import { CanvasRenderer } from '../src/platform/browser/canvas_renderer.js';
import { encodePng, renderContactSheet, renderMapPreview } from '../tools/map_preview.js';

const TEST_CONFIG = {
  ...DEFAULT_CONFIG,
  ball: { ...DEFAULT_CONFIG.ball, speedIncrementOnHit: 0 },
  physics: { ...DEFAULT_CONFIG.physics, subSteps: 1, microJitter: 0 }
};

function makeState(layout) {
  return createInitialState(TEST_CONFIG, {
    cols: layout[0].length,
    rows: layout.length,
    brickWidth: 30,
    brickHeight: 20,
    offsetX: 60,
    offsetY: 100,
    ballInitialSpeed: 520,
    layout
  });
}

function strike(state, brick) {
  const ball = state.balls.find(candidate => candidate.active);
  state.status = GAME_STATUS.PLAYING;
  Object.assign(ball, {
    x: brick.x + brick.width / 2,
    y: brick.y + brick.height + ball.radius + 2,
    vx: 0,
    vy: -ball.speed,
    attachedToPaddle: false
  });
  return stepPhysics(state, {}, 1 / 60, TEST_CONFIG);
}

test('bombs caught in a blast detonate one after another as a chain', () => {
  const state = makeState(['6660000001']);
  const [first, second, third] = state.bricks;
  const events = strike(state, first);
  assert.equal(first.active, false);
  assert.equal(second.active, false, 'the neighbouring bomb breaks in the first blast');
  assert.equal(third.active, true, 'the third bomb waits for the second detonation');
  assert.equal(state.fuses.length, 1);
  assert.equal(events.some(event => event.type === 'BOMB_CHAIN'), false, 'the fuse burns before it explodes');

  const chain = [];
  for (let frame = 0; frame < 30 && state.fuses.length; frame++) {
    chain.push(...stepPhysics(state, {}, 1 / 60, TEST_CONFIG).filter(event => event.type === 'BOMB_CHAIN'));
  }
  assert.deepEqual(chain.map(event => event.depth), [1, 2]);
  assert.equal(third.active, false);
  assert.equal(state.stats.bricksDestroyed, 3);
  assert.equal(state.stats.remainingBreakableBricks, 1);
  assert.equal(state.score, 1200);
  // Fuses are plain data and survive a save/restore.
  assert.doesNotThrow(() => deserializeState(serializeState(state)));
});

test('a shield brick raises an energy floor that returns balls until it expires', () => {
  const state = makeState(['9000000001']);
  const events = strike(state, state.bricks[0]);
  assert.ok(events.some(event => event.type === 'SHIELD_UP' && event.seconds === DEFAULT_CONFIG.rules.shieldSeconds));
  assert.ok(Math.abs(state.shield - DEFAULT_CONFIG.rules.shieldSeconds) < 0.05);

  const ball = state.balls[0];
  Object.assign(ball, { x: 20, y: state.arena.height - 30, vx: 0, vy: 520 });
  const bounce = [];
  for (let frame = 0; frame < 10; frame++) bounce.push(...stepPhysics(state, {}, 1 / 60, TEST_CONFIG));
  assert.ok(bounce.some(event => event.type === 'SHIELD_HIT'));
  assert.equal(bounce.some(event => event.type === 'BALL_LOST'), false);
  assert.ok(ball.active && ball.vy < 0, 'the ball heads back up');

  state.shield = 0.01;
  const down = stepPhysics(state, {}, 1 / 60, TEST_CONFIG);
  assert.ok(down.some(event => event.type === 'SHIELD_DOWN'));
  assert.equal(state.shield, 0);
  Object.assign(ball, { x: 20, y: state.arena.height - 30, vx: 0, vy: 520 });
  const fall = [];
  for (let frame = 0; frame < 10; frame++) fall.push(...stepPhysics(state, {}, 1 / 60, TEST_CONFIG));
  assert.ok(fall.some(event => event.type === 'BALL_LOST'), 'without the shield the ball is lost again');
});

test('seeker mode bends balls toward the last bricks without changing their speed', () => {
  const layout = Array.from({ length: 12 }, () => '1111111111');
  const state = makeState(layout);
  const keep = new Set([0, 1]);
  state.bricks.forEach((brick, index) => {
    if (keep.has(index)) return;
    brick.active = false;
    brick.hp = 0;
    state.grid.cells[brick.row * state.grid.cols + brick.col] = -1;
  });
  state.stats.bricksDestroyed = state.bricks.length - keep.size;
  state.stats.remainingBreakableBricks = keep.size;
  state.status = GAME_STATUS.PLAYING;

  // The remaining bricks sit top-left; send the ball horizontally to the right.
  const ball = state.balls[0];
  Object.assign(ball, { attachedToPaddle: false, x: 300, y: 400, vx: 400, vy: -60 });
  const speed = Math.hypot(ball.vx, ball.vy);
  const before = Math.atan2(ball.vy, ball.vx);
  const events = stepPhysics(state, {}, 1 / 60, TEST_CONFIG);
  assert.ok(events.some(event => event.type === 'SEEKER_ON'));
  assert.equal(state.seeker.active, true);
  const after = Math.atan2(ball.vy, ball.vx);
  assert.ok(after < before, 'the heading turns toward the targets above');
  assert.ok(before - after <= DEFAULT_CONFIG.physics.seeker.turnRate / 60 + 1e-9, 'turning is rate limited');
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - speed) < 1e-9);

  const small = makeState(['1100000000']);
  small.status = GAME_STATUS.PLAYING;
  Object.assign(small.balls[0], { attachedToPaddle: false, x: 300, y: 400, vx: 400, vy: -60 });
  stepPhysics(small, {}, 1 / 60, TEST_CONFIG);
  assert.ok(!small.seeker?.active, 'tiny test layouts are never steered');
});

function recordingCanvas() {
  const fills = new Set();
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return text => ({ width: String(text).length * 7 });
      return () => {};
    },
    set(target, prop, value) {
      if (prop === 'fillStyle') fills.add(value);
      target[prop] = value;
      return true;
    },
  });
  return { canvas: { getContext: () => ctx, width: 480, height: 720 }, fills };
}

test('renderer paints generated themes, shields, seekers, and blasts without errors', () => {
  const { canvas, fills } = recordingCanvas();
  const renderer = new CanvasRenderer(canvas, DEFAULT_CONFIG);
  const engine = new GameEngine(DEFAULT_CONFIG);
  engine.startRandomRun({ seed: 'render-check', difficulty: 'chill' });
  engine.setBotActive(true);
  const seen = new Set();
  for (let frame = 0; frame < 900; frame++) {
    const { state, events } = engine.tick(1 / 60);
    for (const event of events) seen.add(event.type);
    if (frame === 400) {
      state.shield = 3;
      state.seeker = { ...(state.seeker || {}), active: true };
    }
    renderer.render(state, events, 1 / 60);
  }
  const state = engine.getState();
  assert.ok(fills.has(state.theme.background), 'themed background');
  const themed = state.bricks.find(brick => brick.tint !== undefined && brick.type <= 3);
  assert.ok(fills.has(renderer.themeColor(state.theme, themed.tint, themed.maxHp)), 'themed brick fill');
  assert.ok(seen.has('BRICK_HIT') && seen.has('MULTIBALL'));
});

test('map previews encode as valid PNG images', () => {
  const def = generateMap({ seed: 'png-check', difficulty: 'normal' });
  const image = renderMapPreview(def);
  assert.equal(image.width, 480);
  assert.equal(image.height, 40 + 46 * 11 + 20);
  const png = encodePng(image);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 480);
  assert.equal(png.readUInt32BE(20), image.height);
  const sheet = renderContactSheet([def, def, def], { columns: 2, scale: 0.5 });
  assert.ok(sheet.width > 480 && sheet.height > image.height / 2);
});
