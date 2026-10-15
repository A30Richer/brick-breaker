import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_DEFINITIONS, BRICK_TYPES } from '../src/core/levels.js';
import { LevelManager } from '../src/core/level_manager.js';
import { analyzeBallClearance } from './level_validator.js';

test('new bot challenge maps keep every breakable reachable with real ball clearance', async t => {
  const manager = new LevelManager();
  assert.equal(manager.getLevelCount(), 10);
  const layouts = new Set();
  for (let index = 5; index < manager.getLevelCount(); index++) {
    await t.test(LEVEL_DEFINITIONS[index].name, () => {
      const built = manager.buildGridForLevel(index);
      const result = analyzeBallClearance(built);
      assert.deepEqual(result.unreachableBricks, [], 'permanent walls must not seal any armor');
      assert.deepEqual(result.unreachableCorridorPoints, [], 'corridor centerlines must be open and accessible');
      assert.ok(built.counts.breakableCount >= 800);
      const armor = built.bricks.reduce((sum, brick) => sum + (brick.breakable ? brick.hp : 0), 0);
      assert.ok(armor / built.counts.breakableCount >= 2.5, 'new maps should require sustained multi-hit clearing');
      for (const type of [BRICK_TYPES.BALL_DOUBLER, BRICK_TYPES.EXTRA_BALLS]) {
        assert.ok(built.bricks.some(brick => brick.type === type && brick.row === built.level.rows - 1), 'both powers must be exposed at the entrance');
        assert.ok(built.bricks.some(brick => brick.type === type && brick.row < built.level.rows - 10), 'both powers must also be embedded in the interior');
      }
      layouts.add(built.level.layout.join('\n'));
    });
  }
  assert.equal(layouts.size, 5, 'all five additions have distinct geometry');
});

function vaultWithDoor(gapWidth) {
  const brick = { id: 1, row: 1, col: 1, x: 55, y: 50, width: 10, height: 10, breakable: true };
  const walls = [
    { x: 20, y: 20, width: 80, height: 10 },
    { x: 20, y: 30, width: 10, height: 70 },
    { x: 90, y: 30, width: 10, height: 70 },
    { x: 20, y: 90, width: 40 - gapWidth / 2, height: 10 },
    { x: 60 + gapWidth / 2, y: 90, width: 40 - gapWidth / 2, height: 10 },
  ].map(wall => ({ ...wall, indestructible: true, breakable: false }));
  return {
    bricks: [brick, ...walls],
    grid: { totalWidth: 120, totalHeight: 100, offsetY: 10 },
    // Decorative corridor metadata cannot override the real wall geometry.
    chutes: [{ clearWidthPx: 15 }],
  };
}

const SMALL_ARENA = { arena: { width: 120, height: 140 }, ballRadius: 4.5 };

test('clearance validator rejects sealed vaults and gaps smaller than the ball diameter', () => {
  for (const gap of [0, 8]) {
    const result = analyzeBallClearance(vaultWithDoor(gap), SMALL_ARENA);
    assert.deepEqual(result.unreachableBricks, [{ id: 1, row: 1, col: 1 }], `a ${gap}px gate cannot admit a 9px ball`);
  }
});

test('clearance validator accepts a traversable gate into a walled vault', () => {
  assert.deepEqual(analyzeBallClearance(vaultWithDoor(15), SMALL_ARENA).unreachableBricks, []);
});

test('clearance validator also rejects permanently sealed empty corridors', () => {
  const built = vaultWithDoor(0);
  built.bricks = built.bricks.filter(brick => brick.indestructible);
  Object.assign(built.grid, { offsetX: 0, cellWidth: 10, cellHeight: 10 });
  built.chutes = [{ type: 'VERTICAL', col: 5, startRow: 4, endRow: 6 }];
  const result = analyzeBallClearance(built, SMALL_ARENA);
  assert.deepEqual(result.unreachableBricks, []);
  assert.equal(result.unreachableCorridorPoints.length, 3, 'an empty shaft still needs a physical entry');
});
