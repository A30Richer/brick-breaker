/**
 * Level Manager for Brick Breaker Game
 * 
 * Manages level definitions, progression, grid layout building,
 * 2D spatial indexing, and breakable vs indestructible tracking.
 * 
 * Zero external dependencies. Pure standard ES Module.
 */

import { LEVEL_DEFINITIONS, BRICK_TYPES, BRICK_PROPERTIES, getBrickProperty } from './levels.js';

export class LevelManager {
  /**
   * Initializes the LevelManager with an optional array of level definitions.
   * @param {Array} levels Array of level definition objects (defaults to LEVEL_DEFINITIONS)
   */
  constructor(levels = LEVEL_DEFINITIONS) {
    if (!Array.isArray(levels) || levels.length === 0) {
      throw new Error('LevelManager requires a non-empty array of level definitions');
    }
    this.levels = levels;
    this.currentLevelIndex = 0;
  }

  /**
   * Returns the total number of available levels.
   * @returns {number} Level count
   */
  getLevelCount() {
    return this.levels.length;
  }

  /**
   * Returns all level definitions.
   * @returns {Array} Array of level definitions
   */
  getAllLevels() {
    return [...this.levels];
  }

  /**
   * Retrieves a level definition by index or ID.
   * @param {number} [index] 0-based index (defaults to currentLevelIndex)
   * @returns {object} Level definition
   */
  getLevel(index = this.currentLevelIndex) {
    if (typeof index !== 'number' || isNaN(index)) {
      throw new TypeError(`Invalid level index: ${index}`);
    }

    if (index >= 0 && index < this.levels.length) {
      return this.levels[index];
    }

    // Support 1-based ID lookup
    const byId = this.levels.find(lvl => lvl.id === index);
    if (byId) return byId;

    throw new RangeError(`Level index ${index} out of range [0..${this.levels.length - 1}]`);
  }

  /**
   * Returns the current active level index (0-based).
   * @returns {number} Current level index
   */
  getCurrentLevelIndex() {
    return this.currentLevelIndex;
  }

  /**
   * Sets the active level index.
   * @param {number} index 0-based level index
   */
  setCurrentLevelIndex(index) {
    if (typeof index !== 'number' || index < 0 || index >= this.levels.length) {
      throw new RangeError(`Cannot set level index to ${index}. Valid range: [0..${this.levels.length - 1}]`);
    }
    this.currentLevelIndex = index;
  }

  /**
   * Checks whether another level exists after the current one.
   * @returns {boolean} True if next level exists
   */
  hasNextLevel() {
    return this.currentLevelIndex + 1 < this.levels.length;
  }

  /**
   * Advances progression to the next level.
   * @returns {number} New level index, or -1 if the campaign is completed (victory)
   */
  advanceLevel() {
    if (this.hasNextLevel()) {
      this.currentLevelIndex++;
      return this.currentLevelIndex;
    }
    return -1;
  }

  /**
   * Resets progression back to the first level (index 0).
   */
  resetLevelProgression() {
    this.currentLevelIndex = 0;
  }

  /**
   * Builds the brick entities, spatial grid index, brick counts, and corridor geometry
   * for physics and rendering instantiation.
   * 
   * @param {number|object} [indexOrDef] 0-based index or level definition object
   * @param {object} [config] Engine/Arena configuration
   * @returns {object} Grid build result: { level, bricks, grid, counts, chutes, ballInitialSpeed }
   */
  buildGridForLevel(indexOrDef = this.currentLevelIndex, config = {}) {
    let levelDef;
    if (typeof indexOrDef === 'number') {
      levelDef = this.getLevel(indexOrDef);
    } else if (indexOrDef && typeof indexOrDef === 'object' && Array.isArray(indexOrDef.layout)) {
      levelDef = indexOrDef;
    } else {
      levelDef = this.getLevel(this.currentLevelIndex);
    }

    const arenaWidth = config.arena?.width ?? config.width ?? 480;
    const arenaHeight = config.arena?.height ?? config.height ?? 800;
    const cols = levelDef.cols;
    const rows = levelDef.rows;

    const brickWidth = config.brickWidth ?? (arenaWidth / cols);
    const brickHeight = config.brickHeight ?? 11.0;
    const gridOffsetX = config.gridOffsetX ?? 0;
    const gridOffsetY = config.gridOffsetY ?? 40;

    const bricks = [];
    const spatialCells = new Int32Array(cols * rows);
    spatialCells.fill(-1);

    let nextBrickId = 1;
    let breakableCount = 0;
    let indestructibleCount = 0;
    let emptyCount = 0;
    const byType = {};

    for (let r = 0; r < rows; r++) {
      const rowStr = levelDef.layout[r];
      if (!rowStr || rowStr.length < cols) {
        throw new Error(`Level ${levelDef.id || levelDef.name} row ${r} length (${rowStr?.length}) does not match cols (${cols})`);
      }

      for (let c = 0; c < cols; c++) {
        const char = rowStr[c];
        const typeId = parseInt(char, 10);

        if (isNaN(typeId)) {
          throw new Error(`Invalid brick character '${char}' at row ${r}, col ${c}`);
        }

        byType[typeId] = (byType[typeId] || 0) + 1;

        if (typeId === BRICK_TYPES.EMPTY) {
          emptyCount++;
          spatialCells[r * cols + c] = -1;
          continue;
        }

        const props = getBrickProperty(typeId);
        const brickX = gridOffsetX + c * brickWidth;
        const brickY = gridOffsetY + r * brickHeight;

        const brick = {
          id: nextBrickId++,
          col: c,
          row: r,
          x: brickX,
          y: brickY,
          width: brickWidth,
          height: brickHeight,
          type: typeId,
          typeName: props.name,
          hp: props.hp,
          maxHp: props.maxHp,
          score: props.score,
          breakable: props.breakable,
          indestructible: props.indestructible,
          color: props.color,
          damagedColor: props.damagedColor || props.color,
          blastRadius: props.blastRadius || 0,
        };

        if (props.breakable) {
          breakableCount++;
        } else if (props.indestructible) {
          indestructibleCount++;
        }

        bricks.push(brick);
        spatialCells[r * cols + c] = brick.id;
      }
    }

    // Construct 2D spatial grid index for O(1) collision candidate retrieval
    const grid = {
      cols,
      rows,
      cellWidth: brickWidth,
      cellHeight: brickHeight,
      offsetX: gridOffsetX,
      offsetY: gridOffsetY,
      totalWidth: cols * brickWidth,
      totalHeight: rows * brickHeight,
      cells: spatialCells,

      getCellIndex(col, row) {
        if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
        return spatialCells[row * cols + col];
      },

      getBrickAt(col, row, bricksList = bricks) {
        const id = this.getCellIndex(col, row);
        if (id <= 0) return null;
        return bricksList.find(b => b.id === id) || null;
      },

      getCoordsForPoint(x, y) {
        const relX = x - gridOffsetX;
        const relY = y - gridOffsetY;
        if (relX < 0 || relX >= this.totalWidth || relY < 0 || relY >= this.totalHeight) {
          return null;
        }
        const col = Math.floor(relX / brickWidth);
        const row = Math.floor(relY / brickHeight);
        return { col, row };
      },

      getCellsInBoundingBox(minX, minY, maxX, maxY) {
        const colMin = Math.max(0, Math.floor((minX - gridOffsetX) / brickWidth));
        const colMax = Math.min(cols - 1, Math.floor((maxX - gridOffsetX) / brickWidth));
        const rowMin = Math.max(0, Math.floor((minY - gridOffsetY) / brickHeight));
        const rowMax = Math.min(rows - 1, Math.floor((maxY - gridOffsetY) / brickHeight));

        const result = [];
        for (let r = rowMin; r <= rowMax; r++) {
          for (let c = colMin; c <= colMax; c++) {
            const brickId = spatialCells[r * cols + c];
            if (brickId > 0) {
              result.push({ col: c, row: r, brickId });
            }
          }
        }
        return result;
      },
    };

    // Calculate corridor metrics and clearances
    const chutes = [];
    if (levelDef.corridors) {
      for (const corr of levelDef.corridors) {
        if (corr.type === 'VERTICAL' || corr.type === 'VERTICAL_ENTRANCE') {
          chutes.push({
            type: corr.type,
            col: corr.chuteCol,
            startRow: corr.startRow,
            endRow: corr.endRow,
            leftWallCol: corr.leftWallCol,
            rightWallCol: corr.rightWallCol,
            clearWidthPx: brickWidth,
            startX: gridOffsetX + corr.chuteCol * brickWidth,
            startY: gridOffsetY + corr.startRow * brickHeight,
            endY: gridOffsetY + (corr.endRow + 1) * brickHeight,
          });
        } else if (corr.type.startsWith('SWITCHBACK') || corr.type === 'HORIZONTAL') {
          chutes.push({
            type: corr.type,
            row: corr.chuteRow,
            startCol: corr.startCol,
            endCol: corr.endCol,
            topWallRow: corr.topWallRow,
            bottomWallRow: corr.bottomWallRow,
            clearHeightPx: brickHeight,
            startX: gridOffsetX + corr.startCol * brickWidth,
            endX: gridOffsetX + (corr.endCol + 1) * brickWidth,
            startY: gridOffsetY + corr.chuteRow * brickHeight,
          });
        }
      }
    }

    return {
      level: levelDef,
      bricks,
      grid,
      cells: spatialCells,
      counts: {
        totalBricks: bricks.length,
        breakableCount,
        indestructibleCount,
        emptyCount,
        byType,
      },
      chutes,
      ballInitialSpeed: levelDef.ballInitialSpeed || 420,
    };
  }

  /**
   * Evaluates if all breakable bricks in the given brick array have been destroyed.
   * @param {Array} bricks Array of brick entities
   * @returns {boolean} True if level is complete
   */
  isLevelComplete(bricks) {
    if (!Array.isArray(bricks) || bricks.length === 0) return true;
    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      if (b.breakable && b.hp > 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns the count of breakable bricks that still have HP > 0.
   * @param {Array} bricks Array of brick entities
   * @returns {number} Active breakable count
   */
  getRemainingBreakableCount(bricks) {
    if (!Array.isArray(bricks)) return 0;
    let count = 0;
    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      if (b.breakable && b.hp > 0) {
        count++;
      }
    }
    return count;
  }

  /**
   * Calculates total potential score from all breakable bricks in a brick set.
   * @param {Array} bricks Array of brick entities
   * @returns {number} Total breakable score
   */
  getTotalBreakableScore(bricks) {
    if (!Array.isArray(bricks)) return 0;
    let score = 0;
    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      if (b.breakable) {
        score += b.score || 0;
      }
    }
    return score;
  }
}

/**
 * Convenience factory to create a new LevelManager instance.
 * @param {Array} [levels] Optional level definitions
 * @returns {LevelManager}
 */
export function createLevelManager(levels) {
  return new LevelManager(levels);
}

export default LevelManager;
