import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, GAME_STATUS } from '../src/config.js';
import { createInitialState, cloneState, serializeState, deserializeState } from '../src/core/state.js';
import { stepPhysics } from '../src/core/physics.js';
import { GameEngine } from '../src/core/engine.js';

const CONFIG = {
  ...DEFAULT_CONFIG,
  ball: { ...DEFAULT_CONFIG.ball, speedIncrementOnHit: 0 },
  physics: { ...DEFAULT_CONFIG.physics, subSteps: 1, microJitter: 0, seeker: null }
};

function fixture(layout = ['70000001'], config = CONFIG) {
  const state = createInitialState(config, {
    cols: layout[0].length, rows: layout.length,
    brickWidth: 24, brickHeight: 12, offsetX: 40, offsetY: 80,
    layout
  });
  state.status = GAME_STATUS.PLAYING;
  safeBall(state);
  return state;
}

function safeBall(state) {
  Object.assign(state.balls[0], { x: 400, y: 600, vx: 0, vy: -100, speed: 100, attachedToPaddle: false });
}

function hit(state, brick, config = CONFIG) {
  Object.assign(state.balls[0], {
    x: brick.x + brick.width / 2,
    y: brick.y + brick.height + state.balls[0].radius + 1,
    vx: 0, vy: -450, speed: 450
  });
  return stepPhysics(state, {}, 1 / 60, config);
}

function drop(state, type, overrides = {}) {
  const pickup = {
    id: state.nextPickupId++, type,
    x: state.paddle.x + state.paddle.width / 2,
    y: state.paddle.y - 20,
    ...DEFAULT_CONFIG.pickups,
    vy: DEFAULT_CONFIG.pickups.fallSpeed,
    active: true,
    ...overrides
  };
  delete pickup.fallSpeed;
  delete pickup.maxPickups;
  state.pickups.push(pickup);
  return pickup;
}

test('special bricks release visible falling capsules; their effects require a real paddle catch', () => {
  for (const type of [7, 8, 9]) {
    const state = fixture([`${type}0000001`]);
    const brick = state.bricks[0];
    const hitEvents = hit(state, brick);
    assert.equal(state.score, type === 9 ? 300 : 350);
    assert.equal(state.balls.length, 1);
    assert.equal(state.shield, 0);
    assert.equal(hitEvents.some(event => ['MULTIBALL', 'SHIELD_UP'].includes(event.type)), false);
    assert.equal(state.pickups.length, 1);
    const pickup = state.pickups[0];
    assert.equal(pickup.type, type);
    assert.equal(pickup.x, brick.x + brick.width / 2);
    assert.equal(pickup.width, 24);
    assert.equal(pickup.height, 14);
    assert.equal(pickup.vy, 140);
    assert.equal(pickup.brickId, brick.id);
    assert.equal(pickup.source, 'BALL_HIT');
    assert.ok(pickup.y > brick.y + brick.height / 2, 'the released capsule starts falling');

    safeBall(state);
    state.paddle.x = pickup.x - state.paddle.width / 2;
    const caught = [];
    for (let frame = 0; frame < 300 && state.pickups.length; frame++) {
      caught.push(...stepPhysics(state, {}, 1 / 60, CONFIG));
    }
    assert.equal(state.pickups.length, 0);
    assert.equal(caught.filter(event => event.type === 'PICKUP_COLLECTED').length, 1);
    assert.equal(caught.filter(event => event.type === 'PICKUP_MISSED').length, 0);
    assert.equal(caught.find(event => event.type === 'PICKUP_COLLECTED').powerup, ['BALL_DOUBLER', 'EXTRA_BALLS', 'SHIELD'][type - 7]);
    if (type === 9) {
      assert.ok(state.shield > 8.9);
      assert.equal(caught.filter(event => event.type === 'SHIELD_UP').length, 1);
    } else {
      assert.equal(state.balls.length, type === 7 ? 2 : 4);
      assert.equal(caught.find(event => event.type === 'MULTIBALL').source, 'PICKUP');
    }
  }
});

test('capsules outside paddle reach fall out of the arena without activating or accumulating', () => {
  const state = fixture();
  state.paddle.x = 0;
  const pickup = drop(state, 9, { x: 400, y: state.paddle.y - 8 });
  const events = [];
  for (let frame = 0; frame < 35; frame++) events.push(...stepPhysics(state, {}, 1 / 60, CONFIG));
  assert.equal(state.pickups.length, 0);
  assert.equal(pickup.active, false);
  assert.equal(state.shield, 0);
  assert.equal(events.filter(event => event.type === 'PICKUP_MISSED').length, 1);
  assert.equal(events.some(event => event.type === 'PICKUP_COLLECTED'), false);
});

test('fast falling capsules use swept contact and cannot tunnel through the paddle', () => {
  for (const subSteps of [1, 8]) {
    const config = { ...CONFIG, physics: { ...CONFIG.physics, subSteps } };
    const state = fixture(['10000001'], config);
    const pickup = drop(state, 9, { y: 400, vy: 10000 });
    const events = stepPhysics(state, {}, 0.05, config);
    assert.equal(events.filter(event => event.type === 'PICKUP_COLLECTED').length, 1);
    assert.equal(events.some(event => event.type === 'PICKUP_MISSED'), false);
    assert.ok(Math.abs(pickup.y + pickup.height / 2 - state.paddle.y) < 1e-9);
    assert.ok(state.shield > 0);
  }
});

test('paddle movement is interpolated at contact instead of testing only its final position', () => {
  const state = fixture(['10000001']);
  state.paddle.x = 0;
  state.paddle.speed = 4000;
  drop(state, 9, { x: 120, y: 640, vy: 1000 });
  const events = stepPhysics(state, { targetX: 234 }, 0.05, CONFIG);
  assert.equal(state.paddle.x, 200);
  assert.ok(events.some(event => event.type === 'PICKUP_COLLECTED'), 'moving paddle crosses under the capsule before moving past it');

  const late = fixture(['10000001']);
  late.paddle.x = 0;
  late.paddle.speed = 4000;
  drop(late, 9, { x: 220, y: 664, vy: 1000 });
  const lateEvents = stepPhysics(late, { targetX: 234 }, 0.05, CONFIG);
  assert.equal(late.paddle.x, 200);
  assert.equal(lateEvents.some(event => event.type === 'PICKUP_COLLECTED'), false, 'ending under a capsule after it passed the paddle does not collect it');
  assert.equal(late.shield, 0);
});

test('direct and delayed bomb blasts release each neighboring special brick once', () => {
  const state = fixture(['67000001']);
  const events = hit(state, state.bricks[0]);
  assert.equal(events.filter(event => event.type === 'PICKUP_SPAWNED').length, 1);
  assert.equal(state.pickups[0].type, 7);
  assert.equal(state.pickups[0].source, 'BOMB_BLAST');
  assert.equal(state.balls.length, 1);
  assert.equal(state.shield, 0);
  // The second bomb's blast reaches a shield beside it after its fuse burns.
  const delayed = fixture(['66900001']);
  const delayedEvents = hit(delayed, delayed.bricks[0]);
  safeBall(delayed);
  for (let frame = 0; frame < 20; frame++) delayedEvents.push(...stepPhysics(delayed, {}, 1 / 60, CONFIG));
  assert.equal(delayedEvents.filter(event => event.type === 'BOMB_CHAIN').length, 1);
  assert.equal(delayedEvents.filter(event => event.type === 'PICKUP_SPAWNED').length, 1);
  assert.equal(delayed.pickups.length, 1);
  assert.equal(delayed.pickups[0].type, 9);
  assert.equal(delayed.pickups[0].source, 'BOMB_BLAST');
  assert.equal(delayed.shield, 0);
  assert.equal(delayedEvents.some(event => event.type === 'SHIELD_UP'), false);
});

test('pause freezes capsule positions and collection through engine and direct physics', () => {
  const engine = new GameEngine(CONFIG);
  const state = fixture(['10000001']);
  drop(state, 8);
  engine.setState(state);
  engine.togglePause();
  const paused = cloneState(state);
  engine.tick(1 / 60);
  stepPhysics(state, {}, 1 / 60, CONFIG);
  assert.deepEqual(state, paused);
  engine.togglePause();
  engine.tick(1 / 60);
  assert.ok(state.pickups[0].y > paused.pickups[0].y);
});

test('last-ball loss clears falling bonuses and shields without collecting a stale capsule', () => {
  for (const lives of [1, 3]) {
    const state = fixture(['10000001']);
    state.lives = lives;
    state.shield = 4;
    drop(state, 8, { y: state.paddle.y - 8 });
    // A ball already below the shield crosses the kill plane in this tick.
    Object.assign(state.balls[0], { x: 30, y: 722, vx: 0, vy: 450, speed: 450 });
    const events = stepPhysics(state, {}, 1 / 60, CONFIG);
    assert.equal(state.pickups.length, 0);
    assert.equal(state.shield, 0);
    assert.equal(state.lives, lives - 1);
    assert.equal(events.some(event => event.type === 'PICKUP_COLLECTED'), false);
    assert.equal(events.some(event => event.type === 'MULTIBALL'), false);
    assert.equal(state.status, lives === 1 ? GAME_STATUS.GAME_OVER : GAME_STATUS.READY);
  }
});

test('fresh maps, level restarts, and game restarts clear falling bonuses and reset their IDs', () => {
  const engine = new GameEngine(CONFIG);
  drop(engine.state, 7);
  engine.state.shield = 3;
  engine.restartLevel();
  assert.deepEqual(engine.state.pickups, []);
  assert.equal(engine.state.nextPickupId, 1);
  assert.equal(engine.state.shield, 0);
  drop(engine.state, 8);
  engine.loadLevel(1);
  assert.deepEqual(engine.state.pickups, []);
  assert.equal(engine.state.nextPickupId, 1);
  drop(engine.state, 9);
  engine.restartGame();
  assert.deepEqual(engine.state.pickups, []);
});

test('save/restore preserves falling bonuses, counters, and deterministic collection', () => {
  const state = fixture(['10000001']);
  drop(state, 8, { y: state.paddle.y - 8 });
  const restored = deserializeState(serializeState(state));
  assert.deepEqual(restored, state);
  const first = stepPhysics(state, {}, 1 / 60, CONFIG);
  const second = stepPhysics(restored, {}, 1 / 60, CONFIG);
  assert.deepEqual(restored, state);
  assert.deepEqual(second, first);
  assert.equal(state.balls.length, 4);
  assert.equal(state.pickups.length, 0);
});

test('legacy snapshots gain deterministic drop IDs and partial config retains pickup defaults', () => {
  const engine = new GameEngine({ pickups: { fallSpeed: 200 } });
  assert.equal(engine.config.pickups.width, 24);
  assert.equal(engine.config.pickups.fallSpeed, 200);
  const state = fixture(['78000001']);
  delete state.pickups;
  delete state.nextPickupId;
  const first = hit(state, state.bricks[0]);
  assert.equal(first.find(event => event.type === 'PICKUP_SPAWNED').pickup.id, 1);
  const second = hit(state, state.bricks[1]);
  assert.equal(second.find(event => event.type === 'PICKUP_SPAWNED').pickup.id, 2);
  assert.equal(state.nextPickupId, 3);
});

test('drop caps bound simultaneous capsules without changing brick score or allowing duplicate drops', () => {
  const config = { ...CONFIG, pickups: { ...DEFAULT_CONFIG.pickups, maxPickups: 1 } };
  const state = fixture(['78000001'], config);
  hit(state, state.bricks[0], config);
  const repeated = hit(state, state.bricks[0], config);
  assert.equal(repeated.some(event => event.type === 'PICKUP_SPAWNED'), false);
  hit(state, state.bricks[1], config);
  assert.equal(state.pickups.length, 1);
  assert.equal(state.score, 700);
  assert.equal(state.stats.bricksDestroyed, 2);
});
