/**
 * Automated Level Integrity Validator Script
 * 
 * Verifies all 10 high-density levels:
 * - Grid dimensions (32-36 cols x 44-50 rows)
 * - Breakable brick density (>=800 breakables per level, Level 5 >=1,200)
 * - Corridor chute geometry and minimum clearance (>= 2 * ballRadius + 2px)
 * - Indestructible corridor wall configuration
 * - Paddle / ball bottom spawn zone clearance
 * - Spatial grid indexing integrity and progression state logic
 * - New-map reachability using actual ball clearance around permanent walls
 * 
 * Exits with code 0 on SUCCESS, 1 on failure.
 */

import { LEVEL_DEFINITIONS, BRICK_TYPES, BRICK_PROPERTIES } from '../src/core/levels.js';
import { LevelManager } from '../src/core/level_manager.js';
import { analyzeBallClearance as analyzeCoreBallClearance } from '../src/core/clearance.js';
import { pathToFileURL } from 'node:url';

const CONFIG = {
  arena: { width: 480, height: 800 },
  ballRadius: 4.5,
  paddleHeight: 12,
  paddleY: 740,
  spawnClearanceThresholdY: 560, // Above paddle area
  gridOffsetY: 40,
  brickHeight: 11.0,
};

/**
 * Validator entry point for the shared core analysis (see src/core/clearance.js).
 * Defaults to the validator's 480x800 arena and 4.5 px ball.
 */
export function analyzeBallClearance(built, config = CONFIG) {
  return analyzeCoreBallClearance(built, config);
}

let passedAssertions = 0;
let failedAssertions = 0;
const failureMessages = [];

function assert(condition, message) {
  if (condition) {
    passedAssertions++;
  } else {
    failedAssertions++;
    failureMessages.push(message);
    console.error(`  ❌ FAIL: ${message}`);
  }
}

function runLevelIntegrityValidator() {
  console.log('='.repeat(70));
  console.log('BRICK BREAKER — LEVEL INTEGRITY VALIDATOR');
  console.log('='.repeat(70));

  const levelManager = new LevelManager(LEVEL_DEFINITIONS);
  const totalLevels = levelManager.getLevelCount();

  assert(totalLevels === 10, `Expected 10 levels, found ${totalLevels}`);
  console.log(`\nFound ${totalLevels} pre-crafted levels in LevelManager.\n`);

  const minClearWidthRequired = 2 * CONFIG.ballRadius + 2; // e.g. 2 * 4.5 + 2 = 11.0px
  const reportRows = [];

  for (let i = 0; i < totalLevels; i++) {
    const failuresBeforeLevel = failedAssertions;
    const levelDef = levelManager.getLevel(i);
    const built = levelManager.buildGridForLevel(i, CONFIG);
    const levelNum = i + 1;

    console.log(`Testing Level ${levelNum}: "${levelDef.name}" (${levelDef.subtitle || ''})`);

    // 1. Grid Dimensions Check
    const cols = levelDef.cols;
    const rows = levelDef.rows;
    assert(cols >= 32 && cols <= 36, `Level ${levelNum} cols (${cols}) must be in [32..36]`);
    assert(rows >= 44 && rows <= 50, `Level ${levelNum} rows (${rows}) must be in [44..50]`);
    assert(levelDef.layout.length === rows, `Level ${levelNum} layout rows count (${levelDef.layout.length}) matches rows (${rows})`);

    for (let r = 0; r < rows; r++) {
      const rowStr = levelDef.layout[r];
      assert(rowStr.length === cols, `Level ${levelNum} row ${r} length (${rowStr.length}) matches cols (${cols})`);
      for (let c = 0; c < cols; c++) {
        const char = rowStr[c];
        const val = parseInt(char, 10);
        assert(BRICK_PROPERTIES[val] !== undefined, `Level ${levelNum} char '${char}' at (${r},${c}) is a valid brick type`);
      }
    }

    // 2. Breakable Brick Density Check
    const breakables = built.counts.breakableCount;
    const indestructibles = built.counts.indestructibleCount;
    const emptyCells = built.counts.emptyCount;
    const totalCells = cols * rows;

    assert(breakables >= 800, `Level ${levelNum} breakables (${breakables}) must be >= 800`);
    if (levelNum === 5) {
      assert(breakables >= 1200, `Level 5 breakables (${breakables}) must be >= 1,200`);
    }

    // 3. Indestructible Corridor Walls Check
    assert(indestructibles > 0, `Level ${levelNum} must have indestructible corridor walls, found ${indestructibles}`);
    for (const brick of built.bricks) {
      if (brick.type === BRICK_TYPES.CORRIDOR_WALL) {
        assert(brick.indestructible === true, `Indestructible brick ID ${brick.id} must have indestructible: true`);
        assert(brick.breakable === false, `Indestructible brick ID ${brick.id} must have breakable: false`);
        assert(brick.hp === Infinity, `Indestructible brick ID ${brick.id} must have hp: Infinity`);
      }
    }

    // 4. Narrow Corridor Chute Clearance Check
    assert(built.chutes.length > 0, `Level ${levelNum} must define/contain corridor chutes, found ${built.chutes.length}`);
    for (const chute of built.chutes) {
      if (chute.clearWidthPx !== undefined) {
        assert(
          chute.clearWidthPx >= minClearWidthRequired,
          `Level ${levelNum} chute at col ${chute.col} clear width (${chute.clearWidthPx}px) must be >= ${minClearWidthRequired}px (2 * ballRadius + 2px)`
        );
      }
      if (chute.clearHeightPx !== undefined) {
        assert(
          chute.clearHeightPx >= minClearWidthRequired,
          `Level ${levelNum} switchback chute at row ${chute.row} clear height (${chute.clearHeightPx}px) must be >= ${minClearWidthRequired}px`
        );
      }
    }

    // 5. Paddle / Ball Spawn Zone Clearance Check
    for (const brick of built.bricks) {
      const brickBottom = brick.y + brick.height;
      assert(
        brickBottom <= CONFIG.spawnClearanceThresholdY,
        `Level ${levelNum} brick ${brick.id} bottom (${brickBottom}px) exceeds spawn clearance threshold (${CONFIG.spawnClearanceThresholdY}px)`
      );
      assert(
        brickBottom < CONFIG.paddleY - 50,
        `Level ${levelNum} brick ${brick.id} bottom (${brickBottom}px) must remain well above paddle Y (${CONFIG.paddleY}px)`
      );
    }

    // 6. Spatial Grid Index Lookup Verification
    for (const brick of built.bricks) {
      const indexedId = built.grid.getCellIndex(brick.col, brick.row);
      assert(indexedId === brick.id, `Grid cell (${brick.col}, ${brick.row}) must map to brick ID ${brick.id}, got ${indexedId}`);
      const fetchedBrick = built.grid.getBrickAt(brick.col, brick.row, built.bricks);
      assert(fetchedBrick && fetchedBrick.id === brick.id, `grid.getBrickAt(${brick.col}, ${brick.row}) matches brick ID ${brick.id}`);
    }

    // 7. Level-Specific Topology Checks
    if (levelNum === 1) {
      // Level 1: Central vertical chute at col 16 flanked by walls at cols 15 & 17
      const chute1 = built.chutes.find(c => c.col === 16);
      assert(chute1 !== undefined, 'Level 1 has central chute at col 16');
      assert(chute1.leftWallCol === 15 && chute1.rightWallCol === 17, 'Level 1 chute flanked by indestructible walls at cols 15 & 17');
      // Vault has bombs and titanium bricks
      const hasBomb = built.bricks.some(b => b.row <= 3 && b.type === BRICK_TYPES.BOMB);
      const hasTitanium = built.bricks.some(b => b.row <= 3 && b.type === BRICK_TYPES.TITANIUM);
      assert(hasBomb, 'Level 1 top vault contains BOMB bricks');
      assert(hasTitanium, 'Level 1 top vault contains TITANIUM bricks');
    } else if (levelNum === 2) {
      // Level 2: Twin chutes at cols 7 and 24
      const chuteA = built.chutes.find(c => c.col === 7);
      const chuteB = built.chutes.find(c => c.col === 24);
      assert(chuteA && chuteB, 'Level 2 has twin chutes at cols 7 & 24');
      // Central fortress (cols 9-22)
      const centralFortress = built.bricks.filter(b => b.col >= 9 && b.col <= 22 && (b.type === BRICK_TYPES.REINFORCED || b.type === BRICK_TYPES.TITANIUM));
      assert(centralFortress.length > 200, `Level 2 central fortress has >200 reinforced/titanium bricks, found ${centralFortress.length}`);
    } else if (levelNum === 3) {
      // Level 3: Intersecting vertical & horizontal shafts
      const vShafts = built.chutes.filter(c => c.type === 'VERTICAL');
      const hShafts = built.chutes.filter(c => c.type === 'HORIZONTAL');
      assert(vShafts.length >= 2, `Level 3 has at least 2 vertical expressways, found ${vShafts.length}`);
      assert(hShafts.length >= 2, `Level 3 has at least 2 horizontal avenues, found ${hShafts.length}`);
    } else if (levelNum === 4) {
      // Level 4: 3-tier switchbacks
      const switchbacks = built.chutes.filter(c => c.type.startsWith('SWITCHBACK'));
      assert(switchbacks.length === 3, `Level 4 has 3 switchback tiers, found ${switchbacks.length}`);
    } else if (levelNum === 5) {
      // Level 5: Triple micro-chutes & bomb core
      assert(built.chutes.length === 3, `Level 5 has triple micro-chutes, found ${built.chutes.length}`);
      const bombCore = built.bricks.filter(b => b.row >= 6 && b.row <= 14 && b.col >= 10 && b.col <= 22 && b.type === BRICK_TYPES.BOMB);
      assert(bombCore.length >= 6, `Level 5 has inner explosive bomb core (>=6 bombs), found ${bombCore.length}`);
    } else {
      const armorHp = built.bricks.reduce((sum, brick) => sum + (brick.breakable ? brick.hp : 0), 0);
      assert(armorHp / breakables >= 2.5, `Level ${levelNum} average armor must be >= 2.5 HP, found ${(armorHp / breakables).toFixed(2)}`);
      for (const type of [BRICK_TYPES.BALL_DOUBLER, BRICK_TYPES.EXTRA_BALLS]) {
        assert(built.counts.byType[type] >= 3, `Level ${levelNum} needs >=3 bricks of powerup type ${type}`);
        assert(built.bricks.some(brick => brick.type === type && brick.row >= rows - 3), `Level ${levelNum} exposes powerup type ${type} near the entry`);
        assert(built.bricks.some(brick => brick.type === type && brick.row < rows - 10), `Level ${levelNum} embeds powerup type ${type} in its interior`);
      }
      const clearance = analyzeBallClearance(built, CONFIG);
      assert(clearance.unreachableBricks.length === 0, `Level ${levelNum} has ${clearance.unreachableBricks.length} permanently unreachable bricks: ${JSON.stringify(clearance.unreachableBricks.slice(0, 12))}`);
      assert(clearance.unreachableCorridorPoints.length === 0, `Level ${levelNum} has blocked/unreachable corridor points: ${JSON.stringify(clearance.unreachableCorridorPoints.slice(0, 12))}`);
      console.log(`  Ball-clearance flood: ${clearance.reachableSamples} reachable center samples; ${clearance.unreachableBricks.length} sealed breakables; ${clearance.unreachableCorridorPoints.length} blocked corridor points.`);
    }

    reportRows.push({
      level: `L${levelNum}: ${levelDef.name}`,
      dimensions: `${cols}x${rows}`,
      breakables,
      indestructibles,
      emptyCells,
      chutesCount: built.chutes.length,
      chuteWidth: `${built.grid.cellWidth.toFixed(1)}px`,
      status: failedAssertions === failuresBeforeLevel ? 'PASS' : 'FAIL',
    });

    console.log(`  ${failedAssertions === failuresBeforeLevel ? '✓ Passed' : '❌ Failed'}: ${breakables} breakables, ${indestructibles} walls, ${built.chutes.length} chutes.`);
  }

  // 8. Level Progression Engine Test
  console.log('\nTesting Level Progression State Logic...');
  levelManager.resetLevelProgression();
  assert(levelManager.getCurrentLevelIndex() === 0, 'Initial level index is 0');

  for (let i = 0; i < totalLevels - 1; i++) {
    assert(levelManager.hasNextLevel() === true, `hasNextLevel() is true at level ${i}`);
    const nextIdx = levelManager.advanceLevel();
    assert(nextIdx === i + 1, `advanceLevel() returns next index ${i + 1}`);
  }

  assert(levelManager.getCurrentLevelIndex() === totalLevels - 1, `Currently at final level (index ${totalLevels - 1})`);
  assert(levelManager.hasNextLevel() === false, 'hasNextLevel() is false at final level');
  const victoryIdx = levelManager.advanceLevel();
  assert(victoryIdx === -1, 'advanceLevel() at final level returns -1 (VICTORY)');

  // 9. Completion Check Helper Test
  const mockBricks = [
    { breakable: true, hp: 1 },
    { breakable: false, hp: Infinity },
    { breakable: true, hp: 0 },
  ];
  assert(levelManager.isLevelComplete(mockBricks) === false, 'isLevelComplete returns false when breakable hp > 0');
  mockBricks[0].hp = 0;
  assert(levelManager.isLevelComplete(mockBricks) === true, 'isLevelComplete returns true when all breakable hp == 0');

  // Print Summary Table
  console.log('\n' + '='.repeat(70));
  console.log('LEVEL INTEGRITY VALIDATION SUMMARY METRICS');
  console.log('='.repeat(70));
  console.table(reportRows);

  console.log(`\nTotal Assertions Checked: ${passedAssertions + failedAssertions}`);
  console.log(`Passed: ${passedAssertions}`);
  console.log(`Failed: ${failedAssertions}`);

  if (failedAssertions > 0) {
    console.error('\nFAILURES ENCOUNTERED:');
    failureMessages.forEach((msg, idx) => console.error(`${idx + 1}. ${msg}`));
    process.exit(1);
  } else {
    console.log('\n✅ ALL LEVEL INTEGRITY CHECKS PASSED WITH ZERO ERRORS.\n');
    process.exit(0);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLevelIntegrityValidator();
}
