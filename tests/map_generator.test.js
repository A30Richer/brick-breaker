import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, GAME_STATUS } from '../src/config.js';
import { GameEngine } from '../src/core/engine.js';
import { LevelManager } from '../src/core/level_manager.js';
import { BRICK_TYPES } from '../src/core/levels.js';
import { THEME_COLOR_COUNT } from '../src/core/map_theme.js';
import { createRng, makeSeedCode } from '../src/core/rng.js';
import {
  DIFFICULTY_NAMES, MAP_COLS, MAP_ROWS, MapSequence, generateMap, validateGeneratedMap,
} from '../src/core/map_generator.js';
import { simulateLevel } from '../src/core/autoplay.js';
import { analyzeBallClearance } from './level_validator.js';

const SEEDS_PER_DIFFICULTY = 30;

test('seeded rng is deterministic and seed codes are well formed', () => {
  const a = createRng('same-seed');
  const b = createRng('same-seed');
  const c = createRng('other-seed');
  const drawsA = Array.from({ length: 8 }, () => a.next());
  assert.deepEqual(drawsA, Array.from({ length: 8 }, () => b.next()));
  assert.notDeepEqual(drawsA, Array.from({ length: 8 }, () => c.next()));
  assert.match(makeSeedCode(), /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.equal(makeSeedCode(createRng(1)), makeSeedCode(createRng(1)));
});

test('the same seed and difficulty always rebuild the identical map', () => {
  for (const difficulty of DIFFICULTY_NAMES) {
    const first = generateMap({ seed: 'replay-me', difficulty });
    const second = generateMap({ seed: 'replay-me', difficulty });
    assert.deepEqual(second.layout, first.layout);
    assert.deepEqual(second.tints, first.tints);
    assert.deepEqual(second.theme, first.theme);
    assert.equal(second.name, first.name);
    assert.equal(second.fingerprint, first.fingerprint);
  }
});

test('generated maps are well formed, playable, and never seal a brick', () => {
  const fingerprints = new Set();
  const motifs = new Set();
  for (const difficulty of DIFFICULTY_NAMES) {
    for (let i = 0; i < SEEDS_PER_DIFFICULTY; i++) {
      const def = generateMap({ seed: `suite-${i}`, difficulty });
      const label = `${difficulty} ${def.seed}`;
      assert.equal(def.generated, true);
      assert.equal(def.cols, MAP_COLS);
      assert.equal(def.rows, MAP_ROWS);
      assert.equal(def.layout.length, MAP_ROWS, label);
      assert.equal(def.tints.length, MAP_ROWS, label);
      for (let r = 0; r < MAP_ROWS; r++) {
        assert.match(def.layout[r], /^[0-9]{32}$/, `${label} row ${r}`);
        for (const ch of def.tints[r]) assert.ok(parseInt(ch, 36) < THEME_COLOR_COUNT, `${label} tint ${ch}`);
      }
      assert.equal(def.theme.colors.length, THEME_COLOR_COUNT);
      assert.ok(def.stats.doublers >= 1 && def.stats.extraBalls >= 1, `${label} has x2 and +3 bricks`);
      assert.ok(def.stats.shields >= 1, `${label} has a shield brick`);
      assert.ok(def.ballInitialSpeed >= 400 && def.ballInitialSpeed <= 600, label);

      const verdict = validateGeneratedMap(def);
      assert.ok(verdict.ok, `${label}: ${verdict.problems.join(', ')}`);
      const built = new LevelManager([def]).buildGridForLevel(def, { arena: { width: 480, height: 720 } });
      const clearance = analyzeBallClearance(built);
      assert.deepEqual(clearance.unreachableBricks, [], `${label} keeps every brick reachable`);
      assert.deepEqual(clearance.unreachableCorridorPoints, [], `${label} keeps every lane open`);
      for (const brick of built.bricks) assert.ok(brick.y + brick.height <= 560, `${label} leaves the paddle zone clear`);

      fingerprints.add(def.fingerprint);
      motifs.add(def.recipe.motif);
    }
  }
  assert.equal(fingerprints.size, SEEDS_PER_DIFFICULTY * DIFFICULTY_NAMES.length, 'every seed produced a distinct layout');
  assert.ok(motifs.size >= 10, `motif variety (${motifs.size})`);
});

test('a map sequence never repeats a layout and keeps neighbours visibly different', () => {
  const run = new MapSequence({ seed: 'endless', difficulty: 'normal' });
  const maps = Array.from({ length: 14 }, () => run.next());
  assert.equal(new Set(maps.map(map => map.fingerprint)).size, maps.length);
  maps.forEach((map, index) => {
    assert.equal(map.runIndex, index + 1);
    assert.equal(map.runSeed, 'endless');
    const recent = maps.slice(Math.max(0, index - 3), index);
    assert.ok(recent.every(other => other.recipe.motif !== map.recipe.motif), `map ${index + 1} repeats a recent motif`);
    if (index > 0) assert.notEqual(map.recipe.palette, maps[index - 1].recipe.palette, `map ${index + 1} repeats the palette`);
  });

  const replay = new MapSequence({ seed: 'endless', difficulty: 'normal' });
  assert.deepEqual(maps.slice(0, 5).map(map => map.fingerprint), Array.from({ length: 5 }, () => replay.next().fingerprint));

  const avoiding = new MapSequence({ seed: 'endless', difficulty: 'normal', avoid: [maps[0].fingerprint] });
  assert.notEqual(avoiding.next().fingerprint, maps[0].fingerprint, 'already played maps are skipped');
});

test('engine random runs generate the next map on clear instead of ending in victory', () => {
  const engine = new GameEngine(DEFAULT_CONFIG);
  const first = engine.startRandomRun({ seed: 'engine-run', difficulty: 'chill' });
  assert.equal(engine.isRandomRun(), true);
  assert.equal(first.map.runIndex, 1);
  assert.equal(first.map.runSeed, 'engine-run');
  assert.ok(first.theme?.colors?.length, 'theme travels with the state');
  assert.ok(first.bricks.some(brick => brick.tint !== undefined), 'bricks carry palette indices');
  const firstFingerprint = first.map.fingerprint;

  // Restarting replays the same generated map.
  first.score = 1234;
  assert.equal(engine.restartLevel().map.fingerprint, firstFingerprint);

  // Clear the field and let the engine advance.
  const state = engine.getState();
  state.score = 5000;
  state.status = GAME_STATUS.PLAYING;
  for (const brick of state.bricks) {
    if (brick.indestructible) continue;
    brick.active = false;
    brick.hp = 0;
  }
  state.grid.cells.fill(-1);
  state.stats.remainingBreakableBricks = 0;
  Object.assign(state.balls[0], { attachedToPaddle: false, x: 240, y: 600, vx: 0, vy: -400 });
  let result = engine.tick(1 / 60);
  assert.equal(result.state.status, GAME_STATUS.LEVEL_CLEAR);
  assert.equal(result.events.some(event => event.type === 'VICTORY'), false);
  result = engine.tick(1 / 60);
  assert.ok(result.events.some(event => event.type === 'MAP_GENERATED'));
  assert.equal(result.state.status, GAME_STATUS.READY);
  assert.equal(result.state.map.runIndex, 2);
  assert.notEqual(result.state.map.fingerprint, firstFingerprint);
  assert.equal(result.state.score, 5000, 'score carries into the next generated map');

  assert.equal(engine.restartGame().map.fingerprint, firstFingerprint, 'restartGame replays the run from map 1');
  assert.equal(engine.getState().score, 0);

  engine.loadLevel(0);
  assert.equal(engine.isRandomRun(), false);
  assert.equal(engine.getState().map, null);
});

test('the bot makes real progress on a generated map in headless autoplay', () => {
  const def = generateMap({ seed: 'autoplay-check', difficulty: 'chill' });
  const run = simulateLevel(def, { maxSeconds: 60 });
  assert.equal(run.gameOver, false);
  assert.ok(run.percent >= 25, `cleared ${run.percent}% in 60 s`);
  assert.ok(run.maxBalls > 1, 'multiball kicked in');
  assert.ok(run.paddleHits > 0);
  assert.equal(run.totalBricks, def.stats.breakables);
  assert.ok(BRICK_TYPES.SHIELD === 9);
});
