import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, GAME_STATUS } from '../src/config.js';
import { computeBotAction, findSafePickupTarget } from '../src/core/bot.js';
import { GameEngine } from '../src/core/engine.js';
import { LevelManager } from '../src/core/level_manager.js';

function scenario() {
  return {
    status: GAME_STATUS.PLAYING,
    arena: { width: 480, height: 720 },
    paddle: { x: 206, y: 672, width: 68, height: 12, speed: 1000, vx: 0 },
    balls: [{ id: 1, x: 240, y: 300, vx: 0, vy: -450, radius: 4.5, speed: 450, active: true, attachedToPaddle: false }],
    bricks: [],
    grid: { rows: 0, offsetY: 40 },
    pickups: [{ id: 1, type: 8, x: 80, y: 650, width: 24, height: 14, vy: 140, active: true }],
  };
}

test('the bot pursues a reachable bonus while its ball is safely ascending', () => {
  const state = scenario();
  const action = computeBotAction(state);
  assert.ok(action.targetX < 240, 'steer left toward the falling bonus');
  assert.equal(action.moveLeft, true);
  assert.equal(findSafePickupTarget(state).pickupId, 1);
});

test('bonus pursuit uses paddle overlap and keeps the paddle inside the arena', () => {
  const state = scenario();
  Object.assign(state.pickups[0], { x: 480, y: 640 });
  const target = computeBotAction(state).targetX;
  assert.ok(target <= 446, 'the entire paddle remains in the arena');
  assert.ok(target + 34 > 468, 'paddle overlaps the visible edge of the capsule');
  assert.ok(target < 480, 'catching does not require reaching the capsule center');
});

test('the bot ignores a missed capsule below the paddle', () => {
  const state = scenario();
  state.pickups[0].y = 700;
  assert.equal(findSafePickupTarget(state), null);
  assert.equal(computeBotAction(state).targetX, 240);
});

test('the bot ignores a capsule it cannot reach before it passes', () => {
  const state = scenario();
  Object.assign(state.pickups[0], { x: 460, y: 680 });
  assert.equal(findSafePickupTarget(state), null);
  assert.equal(computeBotAction(state).targetX, 240);
});

test('an imminent descending ball takes priority over a nearby capsule', () => {
  const state = scenario();
  Object.assign(state.balls[0], { x: 60, y: 640, vy: 450 });
  Object.assign(state.pickups[0], { x: 240, y: 665 });
  assert.equal(findSafePickupTarget(state), null);
  assert.equal(computeBotAction(state).targetX, 60);
});

test('the bot can collect and return before a descending ball arrives', () => {
  const state = scenario();
  Object.assign(state.balls[0], { x: 240, y: 500, vy: 450 });
  Object.assign(state.pickups[0], { x: 400, y: 645 });
  assert.equal(findSafePickupTarget(state).pickupId, 1);
  assert.ok(computeBotAction(state).targetX > 240);
});

test('a reachable capsule is rejected if the trip back would miss the ball', () => {
  const state = scenario();
  Object.assign(state.balls[0], { x: 240, y: 540, vy: 450 });
  Object.assign(state.pickups[0], { x: 400, y: 645 });
  assert.equal(findSafePickupTarget(state), null);
  assert.equal(computeBotAction(state).targetX, 240);
});

test('ascending balls near a possible brick bounce do not grant an unlimited safe window', () => {
  const state = scenario();
  state.balls[0].y = 600;
  assert.equal(findSafePickupTarget(state), null);
});

test('pickup pursuit checks the urgent ball in a swarm, not only the first ball', () => {
  const state = scenario();
  state.balls.push({ ...state.balls[0], id: 2, x: 70, y: 645, vy: 450 });
  assert.equal(findSafePickupTarget(state), null);
  assert.equal(computeBotAction(state).targetX, 70);
});

test('pursuit rejects a detour that cannot return to a second descending threat', () => {
  const state = scenario();
  Object.assign(state.balls[0], { x: 400, y: 400, vy: 450 });
  state.balls.push({ ...state.balls[0], id: 2, x: 60, y: 510, vy: 450 });
  Object.assign(state.pickups[0], { x: 400, y: 645 });
  assert.equal(findSafePickupTarget(state), null);
  assert.equal(computeBotAction(state).targetX, 60);
});

test('catch feasibility uses the actual paddle speed', () => {
  const state = scenario();
  Object.assign(state.pickups[0], { x: 400, y: 645 });
  assert.ok(findSafePickupTarget(state));
  state.paddle.speed = 200;
  assert.equal(findSafePickupTarget(state), null);
});

test('inactive and invalid drops do not distract the bot from an eligible bonus', () => {
  const state = scenario();
  state.pickups.unshift(
    { ...state.pickups[0], id: 2, active: false },
    { ...state.pickups[0], id: 3, x: NaN },
    { ...state.pickups[0], id: 4, vy: -140 },
  );
  assert.equal(findSafePickupTarget(state).pickupId, 1);
});

test('legacy snapshots without pickups retain existing ball steering and auto launch', () => {
  const state = scenario();
  delete state.pickups;
  Object.assign(state.balls[0], { x: 350, y: 600, vy: 450 });
  assert.equal(computeBotAction(state).targetX, 350);
  state.status = GAME_STATUS.READY;
  state.balls[0].attachedToPaddle = true;
  assert.equal(computeBotAction(state).launchBall, true);
});

function gameplay() {
  const level = { id: 1, name: 'Pickup training', cols: 32, rows: 1, layout: ['1' + '0'.repeat(31)] };
  const config = { ...DEFAULT_CONFIG, physics: { ...DEFAULT_CONFIG.physics, seeker: null } };
  const engine = new GameEngine(config, new LevelManager([level]));
  engine.setBotActive(true);
  engine.getState().status = GAME_STATUS.PLAYING;
  return engine;
}

test('real bot play collects a falling bonus through the paddle and keeps the ball alive', () => {
  const engine = gameplay();
  const state = engine.getState();
  Object.assign(state.balls[0], { attachedToPaddle: false, x: 240, y: 300, vx: 100, vy: -440, speed: Math.hypot(100, 440) });
  state.pickups = [{ id: 501, type: 8, x: 400, y: 640, width: 24, height: 14, vy: 140, active: true }];
  const events = [];
  for (let frame = 0; frame < 60; frame++) events.push(...engine.tick(1 / 60).events);
  assert.ok(events.some(event => event.type === 'PICKUP_COLLECTED' && event.pickup.id === 501));
  assert.ok(events.some(event => event.type === 'MULTIBALL' && event.spawnedCount === 3));
  assert.equal(events.filter(event => event.type === 'BALL_LOST').length, 0);
});

test('real bot play saves its last ball instead of crossing the arena for a bonus', () => {
  const engine = gameplay();
  const state = engine.getState();
  state.lives = 1;
  state.paddle.x = 76;
  Object.assign(state.balls[0], { attachedToPaddle: false, x: 70, y: 640, vx: 0, vy: 450, speed: 450 });
  state.pickups = [{ id: 502, type: 8, x: 430, y: 650, width: 24, height: 14, vy: 140, active: true }];
  const events = [];
  for (let frame = 0; frame < 30; frame++) events.push(...engine.tick(1 / 60).events);
  assert.ok(events.some(event => event.type === 'PADDLE_HIT'));
  assert.ok(!events.some(event => event.type === 'PICKUP_COLLECTED'));
  assert.ok(!events.some(event => event.type === 'BALL_LOST'));
  assert.equal(engine.getState().lives, 1);
});
