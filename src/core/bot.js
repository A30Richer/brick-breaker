/**
 * Autonomous Bot Controller for Brick Breaker Game
 * 
 * Features:
 * - Analytical forward trajectory raycasting with modular arithmetic boundary folding
 * - Headless obstacle lookahead micro-simulation against solid bricks in state.grid
 * - Proportional steering towards predicted intercept with deadband (~1.5px) to eliminate high-frequency chatter
 * - Multi-ball threat prioritization using Time-To-Impact (TTI)
 * - Idle centering: smoothly guides paddle towards screen center when ball is ascending (vy <= 0)
 * - Auto-launch ball when in READY state
 * 
 * Pure ES Module - Zero external dependencies.
 */

import { DEFAULT_CONFIG, GAME_STATUS } from '../config.js';

export const DEADBAND_PIXELS = 1.5;

/**
 * Folds an unfolded horizontal coordinate across left and right arena reflection walls
 * using closed-form periodic modular arithmetic.
 *
 * @param {number} xRaw - Projected unconstrained horizontal coordinate.
 * @param {number} xMin - Left reflection boundary (typically ball.radius).
 * @param {number} xMax - Right reflection boundary (typically arenaWidth - ball.radius).
 * @returns {number} Exact folded intercept position in [xMin, xMax].
 */
export function foldTrajectory(xRaw, xMin, xMax) {
  const span = xMax - xMin;
  if (span <= 0) return xMin;

  const period = 2 * span;
  let rel = (xRaw - xMin) % period;
  if (rel < 0) {
    rel += period;
  }

  if (rel <= span) {
    return xMin + rel;
  } else {
    return xMax - (rel - span);
  }
}

/**
 * Evaluates candidate active balls and selects the most urgent threat based on Time-To-Impact (TTI).
 * Descending balls (vy > 0) with smallest positive TTI take precedence.
 *
 * @param {Array} balls - Array of ball state objects.
 * @param {number} targetY - Paddle intercept plane Y coordinate.
 * @returns {Object|null} Most urgent ball reference or null.
 */
export function findMostUrgentBall(balls, targetY) {
  if (!Array.isArray(balls) || balls.length === 0) return null;

  const activeBalls = balls.filter(b => b && b.active);
  if (activeBalls.length === 0) return null;

  // Filter descending balls that have not yet passed the paddle contact plane
  const descending = activeBalls.filter(b => b.vy > 0 && b.y < targetY);
  if (descending.length === 0) {
    // If no balls descending towards paddle, return lowest active ball or first active ball
    return activeBalls.reduce((lowest, b) => (b.y > lowest.y ? b : lowest), activeBalls[0]);
  }

  let mostUrgent = descending[0];
  let minTTI = (targetY - mostUrgent.y) / mostUrgent.vy;

  for (let i = 1; i < descending.length; i++) {
    const b = descending[i];
    const tti = (targetY - b.y) / b.vy;
    if (tti < minTTI) {
      minTTI = tti;
      mostUrgent = b;
    }
  }

  return mostUrgent;
}

/**
 * Predicts the landing X coordinate of a ball at the paddle intercept plane.
 * Incorporates modular arithmetic boundary reflections and obstacle lookahead micro-simulation.
 *
 * @param {Object} ball - Ball state { x, y, vx, vy, radius, speed }.
 * @param {Object} state - GameState reference.
 * @param {Object} [config] - System configuration.
 * @returns {number} Predicted X contact coordinate at paddle plane.
 */
export function predictBallLanding(ball, state, config = DEFAULT_CONFIG) {
  if (!ball) {
    return (state?.arena?.width ?? DEFAULT_CONFIG.arena.width) / 2;
  }

  const arenaWidth = state?.arena?.width ?? DEFAULT_CONFIG.arena.width;
  const arenaHeight = state?.arena?.height ?? DEFAULT_CONFIG.arena.height;
  const paddle = state?.paddle || DEFAULT_CONFIG.paddle;
  const ballRadius = ball.radius || config.ball?.radius || 4.5;
  const targetY = (paddle.y ?? (arenaHeight - 48)) - ballRadius;

  // 1. If ball is moving upwards or stationary (vy <= 0), idle center stance
  if (ball.vy <= 0) {
    return arenaWidth / 2;
  }

  // 2. If already at or below target plane, return current clamped X
  if (ball.y >= targetY) {
    return Math.max(ballRadius, Math.min(arenaWidth - ballRadius, ball.x));
  }

  const xMin = ballRadius;
  const xMax = arenaWidth - ballRadius;

  // Grid bounds for obstacle lookahead
  const grid = state?.grid;
  const gridOffsetY = grid?.offsetY ?? 40;
  const gridRows = grid?.rows ?? 0;
  const gridCellHeight = grid?.cellHeight ?? 11;
  const gridBottom = gridOffsetY + gridRows * gridCellHeight;

  // If ball is already clear below the grid or no active bricks remain,
  // execute analytical folded raycasting directly in O(1)
  if (ball.y >= gridBottom || !state?.bricks || state.bricks.length === 0) {
    const timeToTarget = (targetY - ball.y) / ball.vy;
    const xRaw = ball.x + ball.vx * timeToTarget;
    return foldTrajectory(xRaw, xMin, xMax);
  }

  // 3. Obstacle lookahead micro-simulation through the brick field
  let simX = ball.x;
  let simY = ball.y;
  let simVx = ball.vx;
  let simVy = ball.vy;

  const cellWidth = grid.cellWidth ?? 15;
  const cellHeight = grid.cellHeight ?? 11;
  const gridOffsetX = grid.offsetX ?? 0;
  const cols = grid.cols ?? 32;
  const rows = grid.rows ?? 44;

  const speed = Math.sqrt(simVx * simVx + simVy * simVy) || ball.speed || 450;
  const stepDist = Math.min(cellHeight * 0.5, 4.0);
  const simDt = stepDist / speed;
  const maxSteps = 300;

  let steps = 0;
  while (simY < targetY && steps < maxSteps) {
    // If the ball has cleared below the lowest brick row, apply analytical fold for remainder
    if (simY >= gridBottom && simVy > 0) {
      const remainingT = (targetY - simY) / simVy;
      const xRaw = simX + simVx * remainingT;
      return foldTrajectory(xRaw, xMin, xMax);
    }

    const timeToPlane = (targetY - simY) / simVy;
    const dt = Math.min(simDt, timeToPlane > 0 ? timeToPlane : simDt);

    simX += simVx * dt;
    simY += simVy * dt;

    // Arena lateral wall reflections
    if (simX <= xMin) {
      simX = xMin + (xMin - simX);
      simVx = Math.abs(simVx);
    } else if (simX >= xMax) {
      simX = xMax - (simX - xMax);
      simVx = -Math.abs(simVx);
    }

    // Brick grid lookahead collision query
    if (simY >= gridOffsetY && simY <= gridBottom && grid.cells) {
      const c = Math.floor((simX - gridOffsetX) / cellWidth);
      const r = Math.floor((simY - gridOffsetY) / cellHeight);

      if (c >= 0 && c < cols && r >= 0 && r < rows) {
        const cellIdx = grid.cells[r * cols + c];
        if (cellIdx !== -1 && cellIdx !== undefined) {
          const brick = state.bricks[cellIdx] || state.bricks.find(b => b.id === cellIdx);
          if (brick && brick.active && brick.hp > 0) {
            // Indestructible corridor wall: ball reflects laterally and continues descending
            if (brick.indestructible || brick.type === 4) {
              simVx = -simVx;
              simX += Math.sign(simVx) * 0.5;
            } else {
              // Descending ball strikes top of breakable brick and rebounds upwards
              simVy = -Math.abs(simVy);
              // Since ball bounced away, it is not an immediate descending threat
              return arenaWidth / 2;
            }
          }
        }
      }
    }

    // If ball reflected upwards, return idle center
    if (simVy <= 0) {
      return arenaWidth / 2;
    }

    steps++;
  }

  return foldTrajectory(simX, xMin, xMax);
}

/**
 * Computes autonomous bot action for the current simulation frame.
 *
 * @param {Object} state - Pure GameState object.
 * @param {number} [dt] - Frame delta time in seconds (default 1/60).
 * @param {Object} [config] - System configuration.
 * @returns {Object} InputAction { moveLeft, moveRight, targetX, launchBall, toggleBot, togglePause, restart }.
 */
export function computeBotAction(state, dt = 1 / 60, config = DEFAULT_CONFIG) {
  if (!state) {
    return {
      moveLeft: false,
      moveRight: false,
      targetX: null,
      launchBall: false,
      toggleBot: false,
      togglePause: false,
      restart: false
    };
  }

  const arenaWidth = state.arena?.width ?? DEFAULT_CONFIG.arena.width;
  const arenaHeight = state.arena?.height ?? DEFAULT_CONFIG.arena.height;
  const paddle = state.paddle || DEFAULT_CONFIG.paddle;
  const halfPaddle = (paddle.width || 68) / 2;
  const paddleCenter = paddle.x + halfPaddle;
  const ballRadius = config.ball?.radius ?? DEFAULT_CONFIG.ball.radius;
  const targetY = (paddle.y ?? (arenaHeight - 48)) - ballRadius;

  // Auto-launch ball when in READY state or if any ball is attached to paddle
  let launchBall = false;
  if (state.status === GAME_STATUS.READY || state.status === 'READY') {
    launchBall = true;
  } else if (Array.isArray(state.balls) && state.balls.some(b => b && b.active && b.attachedToPaddle)) {
    launchBall = true;
  }

  // Multi-ball threat prioritization using TTI
  const targetBall = findMostUrgentBall(state.balls, targetY);

  let targetX = arenaWidth / 2; // Default idle center

  if (targetBall) {
    if (targetBall.attachedToPaddle) {
      targetX = paddleCenter;
    } else if (targetBall.vy > 0) {
      // Descending ball: predict exact landing intercept
      const predicted = predictBallLanding(targetBall, state, config);
      // Clamp targetX so paddle body stays completely inside arena borders
      targetX = Math.max(halfPaddle, Math.min(arenaWidth - halfPaddle, predicted));
    } else {
      // Ascending ball (vy <= 0): idle centering towards screen center
      targetX = arenaWidth / 2;
    }
  }

  // Proportional steering with deadband (~1.5px) to eliminate high-frequency chatter
  const diff = targetX - paddleCenter;
  const inDeadband = Math.abs(diff) <= DEADBAND_PIXELS;

  const moveLeft = !inDeadband && diff < 0;
  const moveRight = !inDeadband && diff > 0;

  return {
    moveLeft,
    moveRight,
    targetX,
    inDeadband,
    launchBall,
    toggleBot: false,
    togglePause: false,
    restart: false
  };
}

export default {
  DEADBAND_PIXELS,
  foldTrajectory,
  findMostUrgentBall,
  predictBallLanding,
  computeBotAction
};
