/**
 * High-Density Level Catalog for Brick Breaker Game
 * 
 * Features 5 distinct, pre-crafted dense levels inspired by the TikTok viral reference image:
 * - Level 1: "The Central Chute" (Exact reference video match)
 * - Level 2: "Dual Corridors & Twin Bastions"
 * - Level 3: "The City Matrix"
 * - Level 4: "The Alpine Serpentine"
 * - Level 5: "The Gauntlet"
 * 
 * Zero external dependencies. Pure standard ES Module.
 */

export const BRICK_TYPES = Object.freeze({
  EMPTY: 0,
  REGULAR: 1,
  REINFORCED: 2,
  TITANIUM: 3,
  CORRIDOR_WALL: 4,
  BOOSTER: 5,
  BOMB: 6,
});

export const BRICK_PROPERTIES = Object.freeze({
  [BRICK_TYPES.EMPTY]: Object.freeze({
    type: BRICK_TYPES.EMPTY,
    name: 'EMPTY',
    hp: 0,
    maxHp: 0,
    score: 0,
    breakable: false,
    indestructible: false,
    color: 'transparent',
    char: '0',
  }),
  [BRICK_TYPES.REGULAR]: Object.freeze({
    type: BRICK_TYPES.REGULAR,
    name: 'REGULAR',
    hp: 1,
    maxHp: 1,
    score: 100,
    breakable: true,
    indestructible: false,
    color: '#F59E0B', // Amber Gold
    damagedColor: '#FBBF24',
    char: '1',
  }),
  [BRICK_TYPES.REINFORCED]: Object.freeze({
    type: BRICK_TYPES.REINFORCED,
    name: 'REINFORCED',
    hp: 2,
    maxHp: 2,
    score: 250,
    breakable: true,
    indestructible: false,
    color: '#EA580C', // Deep Orange
    damagedColor: '#F59E0B',
    char: '2',
  }),
  [BRICK_TYPES.TITANIUM]: Object.freeze({
    type: BRICK_TYPES.TITANIUM,
    name: 'TITANIUM',
    hp: 3,
    maxHp: 3,
    score: 500,
    breakable: true,
    indestructible: false,
    color: '#DC2626', // Crimson
    damagedColor: '#F87171',
    char: '3',
  }),
  [BRICK_TYPES.CORRIDOR_WALL]: Object.freeze({
    type: BRICK_TYPES.CORRIDOR_WALL,
    name: 'CORRIDOR_WALL',
    hp: Infinity,
    maxHp: Infinity,
    score: 0,
    breakable: false,
    indestructible: true,
    color: '#334155', // Dark Slate
    borderColor: '#94A3B8', // Silver
    char: '4',
  }),
  [BRICK_TYPES.BOOSTER]: Object.freeze({
    type: BRICK_TYPES.BOOSTER,
    name: 'BOOSTER',
    hp: 1,
    maxHp: 1,
    score: 300,
    breakable: true,
    indestructible: false,
    color: '#06B6D4', // Electric Cyan
    char: '5',
  }),
  [BRICK_TYPES.BOMB]: Object.freeze({
    type: BRICK_TYPES.BOMB,
    name: 'BOMB',
    hp: 1,
    maxHp: 1,
    score: 400,
    breakable: true,
    indestructible: false,
    blastRadius: 1, // 3x3 destruction area
    color: '#A855F7', // Neon Purple
    char: '6',
  }),
});

/**
 * Builds Level 1: "The Central Chute"
 * Exact reference video match:
 * - 32 columns x 46 rows.
 * - Indestructible corridor walls at columns 15 and 17.
 * - Open vertical chute at column 16 running down the center.
 * - Top vault containing bombs, titanium bricks, and open rebound pocket.
 * - Dense amber breakable matrices (>800 breakables).
 */
function createLevel1Layout() {
  const cols = 32;
  const rows = 46;
  const layout = [];

  for (let r = 0; r < rows; r++) {
    const row = new Array(cols).fill('1');

    if (r === 0 || r === 1) {
      // Top vault ceiling: bomb clusters and titanium armor
      for (let c = 0; c < cols; c++) {
        if (c % 5 === 0) row[c] = '6'; // Bomb
        else if (c % 2 === 0) row[c] = '3'; // Titanium
        else row[c] = '2'; // Reinforced
      }
    } else if (r === 2 || r === 3) {
      // Top vault open chamber: allows ball to exit chute and ricochet behind the grid
      for (let c = 0; c < cols; c++) {
        if (c >= 13 && c <= 18) row[c] = '0'; // Open chamber
        else if (c % 4 === 0) row[c] = '6'; // Bombs in chamber corners
        else if (c % 2 === 0) row[c] = '3';
        else row[c] = '2';
      }
    } else if (r >= 4 && r <= 43) {
      // Main body: central vertical chute split
      for (let c = 0; c < cols; c++) {
        if (c === 15 || c === 17) {
          row[c] = '4'; // Indestructible corridor wall
        } else if (c === 16) {
          row[c] = '0'; // Open central chute
        } else if (r % 6 === 0 && c % 4 === 0) {
          row[c] = '2'; // Reinforced accent
        } else if (r % 8 === 0 && (c === 8 || c === 24)) {
          row[c] = '5'; // Booster
        } else if (r % 12 === 0 && (c === 5 || c === 27)) {
          row[c] = '6'; // Embedded bomb
        } else {
          row[c] = '1'; // Amber regular breakable
        }
      }
    } else {
      // Bottom threshold rows 44-45: chute funnel entrance
      for (let c = 0; c < cols; c++) {
        if (c === 16) row[c] = '0'; // Chute opening
        else if (c === 15 || c === 17) row[c] = '4'; // Entrance guides
        else row[c] = '1';
      }
    }

    layout.push(row.join(''));
  }

  return layout;
}

/**
 * Builds Level 2: "Dual Corridors & Twin Bastions"
 * - 32 columns x 46 rows.
 * - Twin vertical chutes at columns 7 and 24.
 * - Flanked by indestructible walls (cols 6 & 8 for Chute A, cols 23 & 25 for Chute B).
 * - Fortified central fortress (cols 9-22) packed with reinforced, titanium, and bomb core.
 * - Fast-clearing lateral wings (cols 0-5 and 26-31).
 */
function createLevel2Layout() {
  const cols = 32;
  const rows = 46;
  const layout = [];

  for (let r = 0; r < rows; r++) {
    const row = new Array(cols).fill('1');

    if (r <= 2) {
      // Top vault connecting both chutes across the top
      for (let c = 0; c < cols; c++) {
        if (c === 7 || c === 24) row[c] = '0'; // Chute exits
        else if (c % 4 === 0) row[c] = '6'; // Bomb clusters
        else if (c % 2 === 0) row[c] = '3'; // Titanium
        else row[c] = '2'; // Reinforced
      }
    } else if (r === 3) {
      // Top bypass gallery
      for (let c = 0; c < cols; c++) {
        if ((c >= 6 && c <= 8) || (c >= 23 && c <= 25)) row[c] = '0';
        else row[c] = '3';
      }
    } else {
      // Rows 4 to 45
      for (let c = 0; c < cols; c++) {
        if (c === 6 || c === 8 || c === 23 || c === 25) {
          row[c] = '4'; // Indestructible corridor walls
        } else if (c === 7 || c === 24) {
          row[c] = '0'; // Open vertical chutes
        } else if (c >= 9 && c <= 22) {
          // Central Bastion
          if (r >= 15 && r <= 25 && c >= 14 && c <= 17) {
            row[c] = (c === 15 || c === 16) ? '6' : '3'; // Inner Bomb & Titanium core
          } else if ((r + c) % 3 === 0) {
            row[c] = '3'; // Titanium
          } else {
            row[c] = '2'; // Reinforced
          }
        } else {
          // Lateral wings (cols 0-5, 26-31)
          if (r % 7 === 0 && (c === 2 || c === 29)) row[c] = '5'; // Booster
          else if (r % 9 === 0 && (c === 1 || c === 30)) row[c] = '6'; // Bomb
          else row[c] = '1'; // Regular
        }
      }
    }

    layout.push(row.join(''));
  }

  return layout;
}

/**
 * Builds Level 3: "The City Matrix"
 * - 32 columns x 46 rows.
 * - Intersecting vertical expressways (cols 10 and 21).
 * - Intersecting horizontal avenues (rows 15 and 30).
 * - 4 open junction plazas with indestructible corner deflection bumpers.
 * - 9 isolated mega-blocks packed with dense breakables.
 */
function createLevel3Layout() {
  const cols = 32;
  const rows = 46;
  const layout = [];
  const vShafts = [10, 21];
  const hAvenues = [15, 30];

  for (let r = 0; r < rows; r++) {
    const row = new Array(cols).fill('1');

    for (let c = 0; c < cols; c++) {
      const isVShaft = (c === 10 || c === 21);
      const isVWall = (c === 9 || c === 11 || c === 20 || c === 22);
      const isHAvenue = (r === 15 || r === 30);
      const isHWall = (r === 14 || r === 16 || r === 29 || r === 31);

      const nearV = vShafts.some(vc => Math.abs(c - vc) <= 1);
      const nearH = hAvenues.some(hr => Math.abs(r - hr) <= 1);

      if (nearV && nearH) {
        // 3x3 Junction Plaza
        if (isVShaft || isHAvenue) {
          row[c] = '0'; // Open intersection crossway
        } else {
          row[c] = '4'; // Corner deflection post
        }
      } else if (isVShaft) {
        row[c] = '0'; // Open vertical expressway
      } else if (isHAvenue) {
        row[c] = '0'; // Open horizontal avenue
      } else if (isVWall || isHWall) {
        row[c] = '4'; // Corridor wall
      } else {
        // Sector breakable matrices
        if (r <= 5 && (c === 15 || c === 16)) row[c] = '6'; // Vault bomb
        else if ((r + c) % 5 === 0) row[c] = '2'; // Reinforced
        else if ((r * c) % 11 === 0) row[c] = '3'; // Titanium
        else if (r % 7 === 0 && c % 6 === 0) row[c] = '5'; // Booster
        else row[c] = '1'; // Regular
      }
    }

    layout.push(row.join(''));
  }

  return layout;
}

/**
 * Builds Level 4: "The Alpine Serpentine"
 * - 32 columns x 46 rows.
 * - 3-tier zig-zag switchback tunnel traversing back and forth.
 * - 180-degree turnaround pockets on arena flanks.
 * - Vertical bottom entrance at col 16 leading to Tier 1.
 * - Exit at top right leading into top vault chamber.
 */
function createLevel4Layout() {
  const cols = 32;
  const rows = 46;
  const layout = [];

  for (let r = 0; r < rows; r++) {
    const row = new Array(cols).fill('1');

    for (let c = 0; c < cols; c++) {
      // 1. Bottom Entrance: Col 16 open, cols 15 & 17 walls (rows 35-45)
      if (r >= 35 && r <= 45) {
        if (c === 16) { row[c] = '0'; continue; }
        if (c === 15 || c === 17) { row[c] = '4'; continue; }
      }

      // 2. Tier 1 (lower track): Row 34 open (cols 2..29), Rows 33 & 35 walls (cols 2..28)
      if (r === 34 && c >= 2 && c <= 29) { row[c] = '0'; continue; }
      if ((r === 33 || r === 35) && c >= 2 && c <= 28) { row[c] = '4'; continue; }

      // 3. Right Turnaround Pocket 1 (between Tier 1 and Tier 2): Cols 29..30, Rows 23..34
      if (r >= 23 && r <= 34 && (c === 29 || c === 30)) { row[c] = '0'; continue; }
      if (r >= 23 && r <= 34 && (c === 28 || c === 31)) { row[c] = '4'; continue; }

      // 4. Tier 2 (middle track): Row 22 open (cols 2..29), Rows 21 & 23 walls (cols 3..29)
      if (r === 22 && c >= 2 && c <= 29) { row[c] = '0'; continue; }
      if ((r === 21 || r === 23) && c >= 3 && c <= 29) { row[c] = '4'; continue; }

      // 5. Left Turnaround Pocket 2 (between Tier 2 and Tier 3): Cols 1..2, Rows 11..22
      if (r >= 11 && r <= 22 && (c === 1 || c === 2)) { row[c] = '0'; continue; }
      if (r >= 11 && r <= 22 && (c === 0 || c === 3)) { row[c] = '4'; continue; }

      // 6. Tier 3 (upper track): Row 10 open (cols 2..29), Rows 9 & 11 walls (cols 2..28)
      if (r === 10 && c >= 2 && c <= 29) { row[c] = '0'; continue; }
      if ((r === 9 || r === 11) && c >= 2 && c <= 28) { row[c] = '4'; continue; }

      // 7. Right Exit into Top Vault: Cols 29..30, Rows 2..10
      if (r >= 2 && r <= 10 && (c === 29 || c === 30)) { row[c] = '0'; continue; }
      if (r >= 2 && r <= 10 && (c === 28 || c === 31)) { row[c] = '4'; continue; }

      // 8. Top Vault Open Chamber (Rows 1-3, Cols 10-22)
      if (r >= 1 && r <= 3 && c >= 10 && c <= 22) { row[c] = '0'; continue; }

      // Sector breakable bricks
      if (r <= 3) {
        row[c] = (c % 3 === 0) ? '6' : '3'; // Bombs and Titanium in vault
      } else if (r >= 12 && r <= 20) {
        row[c] = (c % 4 === 0) ? '2' : ((c % 7 === 0) ? '5' : '1');
      } else if (r >= 24 && r <= 32) {
        row[c] = (c % 5 === 0) ? '6' : ((c % 3 === 0) ? '2' : '1');
      } else {
        row[c] = (c % 4 === 0) ? '2' : '1';
      }
    }

    layout.push(row.join(''));
  }

  return layout;
}

/**
 * Builds Level 5: "The Gauntlet"
 * - 32 columns x 46 rows.
 * - Triple micro-chutes at columns 6, 16, and 25.
 * - Heavy ablative armor (crimson titanium, deep orange reinforced).
 * - Massive inner explosive core with 8+ bombs.
 * - Over 1,200 breakable bricks.
 */
function createLevel5Layout() {
  const cols = 32;
  const rows = 46;
  const layout = [];
  const chutes = [6, 16, 25];

  for (let r = 0; r < rows; r++) {
    const row = new Array(cols).fill('1');

    for (let c = 0; c < cols; c++) {
      // Triple micro-chutes from row 18 to 44
      const chuteIndex = chutes.findIndex(ch => Math.abs(c - ch) <= 1);
      if (r >= 18 && r <= 44 && chuteIndex !== -1) {
        if (c === chutes[chuteIndex]) {
          row[c] = '0'; // Open micro-chute
        } else {
          row[c] = '4'; // Indestructible chute wall
        }
        continue;
      }
      if (r === 45 && chutes.includes(c)) {
        row[c] = '0'; // Open funnel mouth
        continue;
      }

      // Inner Core (rows 6 to 14, cols 10 to 22)
      if (r >= 6 && r <= 14 && c >= 10 && c <= 22) {
        if ((r === 9 || r === 10 || r === 11) && (c >= 12 && c <= 19)) {
          row[c] = '6'; // Explosive Bomb Core!
        } else if ((r + c) % 2 === 0) {
          row[c] = '5'; // Booster
        } else {
          row[c] = '3'; // Titanium
        }
      } else if (r <= 17) {
        // Upper heavy armor
        if (r % 3 === 0) row[c] = '3'; // Titanium
        else if (r % 2 === 0) row[c] = '2'; // Reinforced
        else row[c] = '1';
      } else if (r <= 35) {
        // Middle ablative armor
        if ((r + c) % 4 === 0) row[c] = '2';
        else if (r % 6 === 0 && (c === 2 || c === 29)) row[c] = '5';
        else row[c] = '1';
      } else {
        // Outer breakables
        row[c] = '1';
      }
    }

    layout.push(row.join(''));
  }

  return layout;
}

export const LEVEL_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 1,
    name: 'The Central Chute',
    subtitle: 'TikTok Viral Reference Match',
    description: 'A monolithic amber breakable grid split by a central vertical chute lined with indestructible corridor walls at cols 15 & 17, with an open chute at col 16 and a top vault filled with bombs and titanium bricks.',
    cols: 32,
    rows: 46,
    ballInitialSpeed: 420,
    corridors: Object.freeze([
      Object.freeze({
        type: 'VERTICAL',
        chuteCol: 16,
        leftWallCol: 15,
        rightWallCol: 17,
        startRow: 4,
        endRow: 45,
      }),
    ]),
    vault: Object.freeze({
      startRow: 0,
      endRow: 3,
      chamberCols: Object.freeze([13, 14, 15, 16, 17, 18]),
    }),
    layout: Object.freeze(createLevel1Layout()),
  }),
  Object.freeze({
    id: 2,
    name: 'Dual Corridors & Twin Bastions',
    subtitle: 'Twin Chutes Flanking a Fortified Core',
    description: 'Twin vertical chutes at cols 7 and 24 flanked by indestructible walls, surrounding a fortified central fortress with reinforced and titanium armor and fast-clearing outer wings.',
    cols: 32,
    rows: 46,
    ballInitialSpeed: 440,
    corridors: Object.freeze([
      Object.freeze({
        type: 'VERTICAL',
        chuteCol: 7,
        leftWallCol: 6,
        rightWallCol: 8,
        startRow: 4,
        endRow: 45,
      }),
      Object.freeze({
        type: 'VERTICAL',
        chuteCol: 24,
        leftWallCol: 23,
        rightWallCol: 25,
        startRow: 4,
        endRow: 45,
      }),
    ]),
    layout: Object.freeze(createLevel2Layout()),
  }),
  Object.freeze({
    id: 3,
    name: 'The City Matrix',
    subtitle: 'Crossroads & Plaza Grid',
    description: 'Intersecting vertical and horizontal express shafts dividing the dense field into 9 isolated mega-blocks with 4 open junction plazas and indestructible corner deflection bumpers.',
    cols: 32,
    rows: 46,
    ballInitialSpeed: 460,
    corridors: Object.freeze([
      Object.freeze({
        type: 'VERTICAL',
        chuteCol: 10,
        leftWallCol: 9,
        rightWallCol: 11,
        startRow: 0,
        endRow: 45,
      }),
      Object.freeze({
        type: 'VERTICAL',
        chuteCol: 21,
        leftWallCol: 20,
        rightWallCol: 22,
        startRow: 0,
        endRow: 45,
      }),
      Object.freeze({
        type: 'HORIZONTAL',
        chuteRow: 15,
        topWallRow: 14,
        bottomWallRow: 16,
        startCol: 0,
        endCol: 31,
      }),
      Object.freeze({
        type: 'HORIZONTAL',
        chuteRow: 30,
        topWallRow: 29,
        bottomWallRow: 31,
        startCol: 0,
        endCol: 31,
      }),
    ]),
    layout: Object.freeze(createLevel3Layout()),
  }),
  Object.freeze({
    id: 4,
    name: 'The Alpine Serpentine',
    subtitle: '3-Tier Switchback Rollercoaster',
    description: 'A 3-tier zig-zag switchback tunnel traversing back and forth with 180-degree turnaround pockets on the arena flanks, leading from a bottom entrance up to the top vault.',
    cols: 32,
    rows: 46,
    ballInitialSpeed: 480,
    corridors: Object.freeze([
      Object.freeze({
        type: 'VERTICAL_ENTRANCE',
        chuteCol: 16,
        leftWallCol: 15,
        rightWallCol: 17,
        startRow: 35,
        endRow: 45,
      }),
      Object.freeze({
        type: 'SWITCHBACK_TIER_1',
        chuteRow: 34,
        topWallRow: 33,
        bottomWallRow: 35,
        startCol: 2,
        endCol: 29,
      }),
      Object.freeze({
        type: 'SWITCHBACK_TIER_2',
        chuteRow: 22,
        topWallRow: 21,
        bottomWallRow: 23,
        startCol: 2,
        endCol: 29,
      }),
      Object.freeze({
        type: 'SWITCHBACK_TIER_3',
        chuteRow: 10,
        topWallRow: 9,
        bottomWallRow: 11,
        startCol: 2,
        endCol: 29,
      }),
    ]),
    layout: Object.freeze(createLevel4Layout()),
  }),
  Object.freeze({
    id: 5,
    name: 'The Gauntlet',
    subtitle: '1,200+ Breakables & Bomb Core',
    description: 'The ultimate density challenge featuring triple micro-chutes, heavy ablative armor, an inner explosive bomb core, and over 1,200 breakable bricks.',
    cols: 32,
    rows: 46,
    ballInitialSpeed: 500,
    corridors: Object.freeze([
      Object.freeze({
        type: 'VERTICAL',
        chuteCol: 6,
        leftWallCol: 5,
        rightWallCol: 7,
        startRow: 18,
        endRow: 45,
      }),
      Object.freeze({
        type: 'VERTICAL',
        chuteCol: 16,
        leftWallCol: 15,
        rightWallCol: 17,
        startRow: 18,
        endRow: 45,
      }),
      Object.freeze({
        type: 'VERTICAL',
        chuteCol: 25,
        leftWallCol: 24,
        rightWallCol: 26,
        startRow: 18,
        endRow: 45,
      }),
    ]),
    layout: Object.freeze(createLevel5Layout()),
  }),
]);

export const LEVELS = LEVEL_DEFINITIONS;
export default LEVEL_DEFINITIONS;

/**
 * Retrieves a level definition by 0-based index or 1-based id.
 * @param {number} indexOrId 0-based index or 1-based ID
 * @returns {object} Level definition object
 */
export function getLevelDefinition(indexOrId) {
  if (typeof indexOrId !== 'number' || isNaN(indexOrId)) {
    throw new TypeError(`Invalid level index/id: ${indexOrId}`);
  }
  // Try 0-based index first
  if (indexOrId >= 0 && indexOrId < LEVEL_DEFINITIONS.length) {
    return LEVEL_DEFINITIONS[indexOrId];
  }
  // Try 1-based id next
  const byId = LEVEL_DEFINITIONS.find(lvl => lvl.id === indexOrId);
  if (byId) return byId;

  throw new RangeError(`Level ${indexOrId} out of range [0..${LEVEL_DEFINITIONS.length - 1}]`);
}

/**
 * Returns property metadata for a given brick type.
 * @param {number} type Brick type ID (0..6)
 * @returns {object} Brick properties
 */
export function getBrickProperty(type) {
  const prop = BRICK_PROPERTIES[type];
  if (!prop) {
    throw new Error(`Unknown brick type: ${type}`);
  }
  return prop;
}
