/**
 * Pure GameState Schema, Creation, Cloning, and Serialization
 * Brick Breaker Core
 * Pure ES Module - Zero external dependencies
 */

import { DEFAULT_CONFIG, BRICK_TYPES, GAME_STATUS } from '../config.js';

/**
 * Creates the initial game state from configuration and optional level definition.
 * @param {Object} [customConfig] - Optional configuration overrides.
 * @param {Object} [levelDef] - Optional level definition.
 * @returns {Object} Pure GameState object.
 */
export function createInitialState(customConfig = {}, levelDef = null) {
  const config = {
    ...DEFAULT_CONFIG,
    ...customConfig,
    arena: { ...DEFAULT_CONFIG.arena, ...(customConfig.arena || {}) },
    paddle: { ...DEFAULT_CONFIG.paddle, ...(customConfig.paddle || {}) },
    ball: { ...DEFAULT_CONFIG.ball, ...(customConfig.ball || {}) },
    physics: { ...DEFAULT_CONFIG.physics, ...(customConfig.physics || {}) },
    grid: { ...DEFAULT_CONFIG.grid, ...(customConfig.grid || {}) },
    rules: { ...DEFAULT_CONFIG.rules, ...(customConfig.rules || {}) }
  };

  const arenaWidth = config.arena.width;
  const arenaHeight = config.arena.height;

  // Paddle initial positioning (centered near bottom)
  const paddleWidth = config.paddle.width;
  const paddleHeight = config.paddle.height;
  const paddleX = (arenaWidth - paddleWidth) / 2;
  const paddleY = config.paddle.y ?? (arenaHeight - 48);

  // Ball initial positioning (resting on top of paddle)
  const ballRadius = config.ball.radius;
  const initialBallSpeed = levelDef?.ballInitialSpeed ?? config.ball.speed;

  const balls = [
    {
      id: 1,
      x: paddleX + paddleWidth / 2,
      y: paddleY - ballRadius,
      vx: 0,
      vy: 0,
      radius: ballRadius,
      speed: initialBallSpeed,
      active: true,
      attachedToPaddle: true,
      inCorridor: false
    }
  ];

  // Grid setup
  const cols = levelDef?.cols ?? config.grid.cols;
  const rows = levelDef?.rows ?? config.grid.rows;
  const cellWidth = levelDef?.brickWidth ?? config.grid.brickWidth;
  const cellHeight = levelDef?.brickHeight ?? config.grid.brickHeight;
  const offsetX = levelDef?.offsetX ?? config.grid.offsetX ?? 0;
  const offsetY = levelDef?.offsetY ?? config.grid.offsetY ?? 40;

  const cells = new Array(cols * rows).fill(-1);
  const bricks = [];
  let totalBreakableBricks = 0;

  // Build bricks from level layout if provided
  if (levelDef && Array.isArray(levelDef.layout)) {
    let brickIndex = 0;
    for (let r = 0; r < rows; r++) {
      const rowData = levelDef.layout[r];
      if (!rowData) continue;
      for (let c = 0; c < cols; c++) {
        const rawType = typeof rowData === 'string' ? rowData[c] : rowData[c];
        const typeId = parseInt(rawType, 10);
        if (isNaN(typeId) || typeId === 0) continue;

        const typeDef = BRICK_TYPES[typeId] || BRICK_TYPES[1];
        const isIndestructible = typeDef.hp === Infinity || !typeDef.breakable;
        const hp = isIndestructible ? Infinity : typeDef.hp;

        const tint = levelDef.tints ? parseInt(levelDef.tints[r]?.[c], 36) : NaN;
        const brick = {
          id: brickIndex + 1,
          col: c,
          row: r,
          x: offsetX + c * cellWidth,
          y: offsetY + r * cellHeight,
          width: cellWidth,
          height: cellHeight,
          type: typeId,
          hp: hp,
          maxHp: hp,
          indestructible: isIndestructible,
          points: typeDef.score || 0,
          color: typeDef.color,
          active: true
        };
        if (!Number.isNaN(tint)) brick.tint = tint;

        bricks.push(brick);
        cells[r * cols + c] = brickIndex;
        brickIndex++;

        if (!isIndestructible) {
          totalBreakableBricks++;
        }
      }
    }
  }

  return {
    frame: 0,
    time: 0,
    status: GAME_STATUS.READY,
    score: 0,
    lives: config.rules.initialLives ?? 3,
    levelIndex: levelDef?.id ?? 0,
    levelName: levelDef?.name ?? 'Standard Level',
    theme: levelDef?.theme ?? null,
    map: null,
    arena: {
      width: arenaWidth,
      height: arenaHeight
    },
    paddle: {
      x: paddleX,
      y: paddleY,
      width: paddleWidth,
      height: paddleHeight,
      speed: config.paddle.speed,
      maxSpeed: config.paddle.maxSpeed,
      vx: 0
    },
    balls,
    nextBallId: 2,
    bricks,
    fuses: [],
    shield: 0, // seconds of energy floor left
    grid: {
      cols,
      rows,
      cellWidth,
      cellHeight,
      offsetX,
      offsetY,
      cells
    },
    mode: {
      isBotActive: false
    },
    stats: {
      bricksDestroyed: 0,
      totalBreakableBricks,
      remainingBreakableBricks: totalBreakableBricks,
      paddleHits: 0,
      wallHits: 0,
      corridorHits: 0,
      ballsLost: 0,
      maxCombo: 0,
      currentCombo: 0
    }
  };
}

/**
 * Deep clones the entire GameState so mutations do not leak.
 * @param {Object} state - The state to clone.
 * @returns {Object} Deep copy of the state.
 */
export function cloneState(state) {
  if (!state) return null;
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state));
}

/**
 * Serializes the game state into a JSON string.
 * @param {Object} state - GameState to serialize.
 * @returns {string} Serialized JSON string.
 */
export function serializeState(state) {
  return JSON.stringify(state);
}

/**
 * Deserializes a JSON string back into a GameState object.
 * @param {string|Object} jsonInput - Serialized JSON string or parsed object.
 * @returns {Object} Validated GameState object.
 */
export function deserializeState(jsonInput) {
  if (!jsonInput) {
    throw new Error('deserializeState: Input cannot be empty');
  }
  const parsed = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;

  // Basic structural validation
  if (!parsed.arena || !parsed.paddle || !Array.isArray(parsed.balls) || !Array.isArray(parsed.bricks)) {
    throw new Error('deserializeState: Invalid GameState structure');
  }

  // Ensure grid cells is an array
  if (parsed.grid && Array.isArray(parsed.grid.cells)) {
    parsed.grid.cells = Array.from(parsed.grid.cells);
  }

  return parsed;
}
