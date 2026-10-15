/**
 * Core Physics Engine for Brick Breaker Web Game
 * Features:
 * - Sub-stepped physics loop (N=8 sub-steps per frame) preventing tunneling
 * - Uniform 2D spatial grid index for O(1) collision queries
 * - Swept circle vs Minkowski-expanded AABB continuous collision detection (CCD)
 * - Exact time of impact (TOI) and positional depenetration
 * - Variable paddle deflection angle mapping u in [-1, 1] -> theta in [-60, +60 deg]
 * - Corridor ricochet with anti-stall (|vy| >= 0.25 * |v|)
 * - Multi-tier brick destruction (Types 1-8), 3x3 Bomb blasts, and multiball
 * - Boundary wall reflections & kill plane triggers
 * Zero external dependencies.
 */

import { DEFAULT_CONFIG, BRICK_TYPES, GAME_STATUS } from '../config.js';

/**
 * Swept Circle vs Axis-Aligned Bounding Box (AABB) Continuous Collision Detection.
 * Models circle of radius r moving from (x0, y0) with displacement (dx, dy)
 * against an AABB [x1, y1, x2, y2].
 *
 * @param {number} x0 - Initial ball center X.
 * @param {number} y0 - Initial ball center Y.
 * @param {number} dx - Displacement X (vx * dt).
 * @param {number} dy - Displacement Y (vy * dt).
 * @param {number} radius - Ball radius.
 * @param {Object} box - Brick/Paddle AABB { x, y, width, height }.
 * @returns {Object|null} Collision info { t, nx, ny, depth, isOverlap } or null.
 */
export function sweptCircleAABB(x0, y0, dx, dy, radius, box) {
  const x1 = box.x;
  const y1 = box.y;
  const x2 = box.x + box.width;
  const y2 = box.y + box.height;

  // 1. Check for immediate overlap at t = 0
  const cx = Math.max(x1, Math.min(x2, x0));
  const cy = Math.max(y1, Math.min(y2, y0));
  const diffX = x0 - cx;
  const diffY = y0 - cy;
  const distSq = diffX * diffX + diffY * diffY;

  if (distSq < radius * radius) {
    const dist = Math.sqrt(distSq);
    let nx = 0;
    let ny = 0;
    let depth = 0;

    if (dist > 1e-6) {
      nx = diffX / dist;
      ny = diffY / dist;
      depth = radius - dist;
    } else {
      // Center is inside box. Determine axis of minimum penetration.
      const dLeft = x0 - x1;
      const dRight = x2 - x0;
      const dTop = y0 - y1;
      const dBottom = y2 - y0;
      const minD = Math.min(dLeft, dRight, dTop, dBottom);

      if (minD === dLeft) {
        nx = -1; ny = 0; depth = radius + dLeft;
      } else if (minD === dRight) {
        nx = 1; ny = 0; depth = radius + dRight;
      } else if (minD === dTop) {
        nx = 0; ny = -1; depth = radius + dTop;
      } else {
        nx = 0; ny = 1; depth = radius + dBottom;
      }
    }
    return { t: 0, nx, ny, depth, isOverlap: true };
  }

  // If no motion and no overlap, no collision possible
  if (dx === 0 && dy === 0) {
    return null;
  }

  // 2. Minkowski-expanded rectangular slab test
  const expMinX = x1 - radius;
  const expMaxX = x2 + radius;
  const expMinY = y1 - radius;
  const expMaxY = y2 + radius;

  let tx1 = -Infinity;
  let tx2 = Infinity;
  if (dx > 0) {
    tx1 = (expMinX - x0) / dx;
    tx2 = (expMaxX - x0) / dx;
  } else if (dx < 0) {
    tx1 = (expMaxX - x0) / dx;
    tx2 = (expMinX - x0) / dx;
  } else {
    if (x0 < expMinX || x0 > expMaxX) return null;
  }

  let ty1 = -Infinity;
  let ty2 = Infinity;
  if (dy > 0) {
    ty1 = (expMinY - y0) / dy;
    ty2 = (expMaxY - y0) / dy;
  } else if (dy < 0) {
    ty1 = (expMaxY - y0) / dy;
    ty2 = (expMinY - y0) / dy;
  } else {
    if (y0 < expMinY || y0 > expMaxY) return null;
  }

  const tEnter = Math.max(tx1, ty1);
  const tExit = Math.min(tx2, ty2);

  // Missed the expanded box or collision is behind/beyond this step
  if (tEnter > tExit || tExit < 0 || tEnter > 1) {
    return null;
  }

  // 3. Resolve exact contact feature (flat edge vs rounded corner)
  const contactT = Math.max(0, tEnter);
  const contactX = x0 + dx * contactT;
  const contactY = y0 + dy * contactT;

  if (tx1 > ty1) {
    // Entered X-slab last -> hit vertical edge or corner
    const nx = dx > 0 ? -1 : 1;
    if (contactY >= y1 && contactY <= y2) {
      // Flat vertical face
      return { t: contactT, nx, ny: 0, depth: 0, isOverlap: false };
    }

    // Near corner: solve quadratic intersection with corner vertex
    const cornerX = dx > 0 ? x1 : x2;
    const cornerY = contactY < y1 ? y1 : y2;
    const cornerHit = intersectRayCircle(x0, y0, dx, dy, cornerX, cornerY, radius);
    if (cornerHit && cornerHit.t <= 1) {
      return cornerHit;
    }
  } else if (ty1 > tx1) {
    // Entered Y-slab last -> hit horizontal edge or corner
    const ny = dy > 0 ? -1 : 1;
    if (contactX >= x1 && contactX <= x2) {
      // Flat horizontal face
      return { t: contactT, nx: 0, ny, depth: 0, isOverlap: false };
    }

    // Near corner: solve quadratic intersection with corner vertex
    const cornerX = contactX < x1 ? x1 : x2;
    const cornerY = dy > 0 ? y1 : y2;
    const cornerHit = intersectRayCircle(x0, y0, dx, dy, cornerX, cornerY, radius);
    if (cornerHit && cornerHit.t <= 1) {
      return cornerHit;
    }
  } else {
    // Exact diagonal corner hit
    const cornerX = dx > 0 ? x1 : x2;
    const cornerY = dy > 0 ? y1 : y2;
    const cornerHit = intersectRayCircle(x0, y0, dx, dy, cornerX, cornerY, radius);
    if (cornerHit && cornerHit.t <= 1) {
      return cornerHit;
    }
  }

  return null;
}

/**
 * Ray vs Circle intersection for exact rounded-corner CCD.
 */
function intersectRayCircle(x0, y0, dx, dy, cx, cy, radius) {
  const ox = x0 - cx;
  const oy = y0 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;

  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - radius * radius;
  const disc = b * b - 4 * a * c;

  if (disc < 0) return null;

  const sqrtDisc = Math.sqrt(disc);
  let t = (-b - sqrtDisc) / (2 * a);

  if (t < 0) {
    t = (-b + sqrtDisc) / (2 * a);
  }

  if (t >= 0 && t <= 1) {
    const hitX = x0 + dx * t;
    const hitY = y0 + dy * t;
    const cnx = hitX - cx;
    const cny = hitY - cy;
    const dist = Math.sqrt(cnx * cnx + cny * cny);
    const nx = dist > 1e-6 ? cnx / dist : 0;
    const ny = dist > 1e-6 ? cny / dist : -1;
    return { t, nx, ny, depth: 0, isOverlap: false };
  }

  return null;
}

/**
 * Queries the uniform 2D spatial grid for candidate bricks overlapping bounds in O(1).
 *
 * @param {Object} grid - Grid metadata { offsetX, offsetY, cellWidth, cellHeight, cols, rows, cells }.
 * @param {Array} bricks - Bricks array.
 * @param {Object} bounds - Bounding box { minX, minY, maxX, maxY }.
 * @returns {Array} Array of candidate active brick references.
 */
export function querySpatialGrid(grid, bricks, bounds) {
  const { offsetX, offsetY, cellWidth, cellHeight, cols, rows, cells } = grid;
  const cMin = Math.max(0, Math.floor((bounds.minX - offsetX) / cellWidth));
  const cMax = Math.min(cols - 1, Math.floor((bounds.maxX - offsetX) / cellWidth));
  const rMin = Math.max(0, Math.floor((bounds.minY - offsetY) / cellHeight));
  const rMax = Math.min(rows - 1, Math.floor((bounds.maxY - offsetY) / cellHeight));

  const candidates = [];
  const seenIds = new Set();

  for (let r = rMin; r <= rMax; r++) {
    const rowOffset = r * cols;
    for (let c = cMin; c <= cMax; c++) {
      const idx = cells[rowOffset + c];
      if (idx !== -1 && idx !== undefined) {
        const brick = bricks[idx];
        if (brick && brick.active && !seenIds.has(brick.id)) {
          seenIds.add(brick.id);
          candidates.push(brick);
        }
      }
    }
  }

  return candidates;
}

/**
 * Calculates variable paddle deflection angle and preserves kinetic velocity.
 * Maps normalized contact offset u in [-1, 1] to theta in [-thetaMax, +thetaMax].
 *
 * @param {number} contactX - Ball contact X coordinate.
 * @param {Object} paddle - Paddle state { x, y, width, height, speed, vx }.
 * @param {number} ballSpeed - Desired kinetic speed magnitude.
 * @param {Object} config - Configuration object.
 * @returns {Object} { vx, vy, offset, angle }.
 */
export function calculatePaddleDeflection(contactX, paddle, ballSpeed, config = DEFAULT_CONFIG) {
  const halfWidth = paddle.width / 2;
  const paddleCenter = paddle.x + halfWidth;
  const rawOffset = (contactX - paddleCenter) / halfWidth;

  // Clamp offset to [-0.95, 0.95] to prevent purely horizontal deflection
  const offset = Math.max(-0.95, Math.min(0.95, rawOffset));
  const maxAngle = config.physics?.maxDeflectionAngle ?? ((60 * Math.PI) / 180);
  const angle = offset * maxAngle;

  let vx = ballSpeed * Math.sin(angle);
  let vy = -ballSpeed * Math.cos(angle); // Deflect upwards

  // Optional momentum transfer from paddle motion
  const momentumTransfer = config.physics?.paddleMomentumTransfer ?? 0.2;
  if (paddle.vx) {
    vx += paddle.vx * momentumTransfer;
    // Re-normalize to preserve exact scalar speed
    const currentSpeed = Math.sqrt(vx * vx + vy * vy);
    if (currentSpeed > 0) {
      vx = (vx / currentSpeed) * ballSpeed;
      vy = (vy / currentSpeed) * ballSpeed;
    }
  }

  // Ensure minimum upward velocity (|vy| >= 0.25 * speed)
  const minVy = ballSpeed * (config.physics?.minVerticalSpeedRatio ?? 0.25);
  if (Math.abs(vy) < minVy) {
    vy = -minVy;
    const remSq = ballSpeed * ballSpeed - vy * vy;
    vx = Math.sign(vx || 1) * Math.sqrt(Math.max(0, remSq));
  }

  return { vx, vy, offset, angle };
}

/**
 * Enforces corridor ricochet anti-stall rule:
 * Guarantees |vy| >= minVerticalSpeedRatio * |v| to prevent endless horizontal ping-pong,
 * and maintains total kinetic scalar velocity.
 *
 * @param {Object} ball - Ball state { vx, vy, speed }.
 * @param {number} minRatio - Ratio threshold (default 0.25).
 * @param {number} microJitter - Horizontal micro jitter (default 0.05).
 */
export function applyAntiStall(ball, minRatio = 0.25, microJitter = 0.05) {
  const currentSpeed = ball.speed || Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (currentSpeed <= 0) return;

  const minVy = currentSpeed * minRatio;
  if (Math.abs(ball.vy) < minVy) {
    const signY = ball.vy !== 0 ? Math.sign(ball.vy) : -1;
    ball.vy = signY * minVy;
    const remSq = currentSpeed * currentSpeed - ball.vy * ball.vy;
    const signX = ball.vx !== 0 ? Math.sign(ball.vx) : 1;
    ball.vx = signX * Math.sqrt(Math.max(0, remSq));
  }

  // Anti-pure-vertical stall micro-jitter
  const minVx = currentSpeed * microJitter;
  if (Math.abs(ball.vx) < minVx) {
    const signX = ball.vx !== 0 ? Math.sign(ball.vx) : 1;
    ball.vx = signX * minVx;
    const remSq = currentSpeed * currentSpeed - ball.vx * ball.vx;
    const signY = ball.vy !== 0 ? Math.sign(ball.vy) : -1;
    ball.vy = signY * Math.sqrt(Math.max(0, remSq));
  }
}

/**
 * Triggers a 3x3 blast from an exploding bomb brick.
 * Destroys all breakable neighbors in row-1..row+1 and col-1..col+1.
 */
function triggerBombExplosion(state, bombBrick, ball, config, pendingBalls, depth = 0) {
  const events = [];
  const { cols, rows, cells } = state.grid;
  const chainDelay = config.physics?.chainDelay ?? DEFAULT_CONFIG.physics.chainDelay ?? 0.07;

  for (let r = bombBrick.row - 1; r <= bombBrick.row + 1; r++) {
    if (r < 0 || r >= rows) continue;
    const rowOffset = r * cols;

    for (let c = bombBrick.col - 1; c <= bombBrick.col + 1; c++) {
      if (c < 0 || c >= cols) continue;
      if (r === bombBrick.row && c === bombBrick.col) continue;

      const idx = cells[rowOffset + c];
      if (idx !== -1 && idx !== undefined) {
        const neighbor = state.bricks[idx];
        if (neighbor && neighbor.active && !neighbor.indestructible) {
          neighbor.active = false;
          neighbor.hp = 0;
          cells[rowOffset + c] = -1;

          state.score += neighbor.points || 0;
          state.stats.bricksDestroyed++;
          state.stats.remainingBreakableBricks--;

          // A bomb caught in the blast detonates a beat later, so long
          // fuses of touching bombs roll across the field as a cascade.
          if (neighbor.type === 6) {
            if (!Array.isArray(state.fuses)) state.fuses = [];
            state.fuses.push({ brickIndex: idx, ballId: ball?.id ?? null, delay: chainDelay, depth: depth + 1 });
          }

          events.push({
            type: 'BRICK_HIT',
            brick: neighbor,
            damage: neighbor.maxHp,
            destroyed: true,
            source: 'BOMB_BLAST'
          });
          events.push(...triggerMultiball(state, neighbor, ball, config, pendingBalls, 'BOMB_BLAST'));
          events.push(...triggerShield(state, neighbor, config));
        }
      }
    }
  }

  return events;
}

/** SHIELD bricks raise (or extend) the energy floor under the paddle. */
function triggerShield(state, brick, config) {
  if (brick.type !== 9) return [];
  const rules = config.rules ?? DEFAULT_CONFIG.rules;
  const seconds = rules.shieldSeconds ?? DEFAULT_CONFIG.rules.shieldSeconds;
  const cap = rules.maxShieldSeconds ?? DEFAULT_CONFIG.rules.maxShieldSeconds;
  state.shield = Math.min(cap, (state.shield || 0) + seconds);
  return [{ type: 'SHIELD_UP', brick, seconds: state.shield }];
}

/** Detonates chained bombs whose fuse delay has elapsed this frame. */
function burnFuses(state, dt, config, pendingBalls) {
  const events = [];
  const due = [];
  const waiting = [];
  for (const fuse of state.fuses) {
    fuse.delay -= dt;
    (fuse.delay <= 0 ? due : waiting).push(fuse);
  }
  state.fuses = waiting;
  for (const fuse of due) {
    const bomb = state.bricks[fuse.brickIndex];
    if (!bomb) continue;
    // +3 bricks in the blast clone a live ball; prefer the one that lit the fuse.
    const source = state.balls.find(ball => ball.id === fuse.ballId && ball.active && !ball.attachedToPaddle)
      ?? state.balls.find(ball => ball.active && !ball.attachedToPaddle)
      ?? pendingBalls[0]
      ?? null;
    events.push({ type: 'BOMB_CHAIN', brick: bomb, depth: fuse.depth });
    events.push(...triggerBombExplosion(state, bomb, source, config, pendingBalls, fuse.depth));
  }
  return events;
}

/**
 * Seeker finish: once only a handful of bricks remain, or nothing has broken
 * for a while, every free ball bends toward the nearest remaining brick.
 * Steering follows a cell distance field that routes around permanent walls,
 * so balls do not grind against a wall that hides their target.
 */
function updateSeeker(state, dt, config) {
  const cfg = config.physics?.seeker === undefined ? DEFAULT_CONFIG.physics.seeker : config.physics.seeker;
  const stats = state.stats;
  if (!cfg || !state.grid?.cells || stats.totalBreakableBricks < cfg.minTotalBricks) return;

  if (!state.seeker) state.seeker = { active: false, stall: 0, lastDestroyed: stats.bricksDestroyed, field: null, fieldAge: 0 };
  const seeker = state.seeker;
  if (stats.bricksDestroyed !== seeker.lastDestroyed) {
    seeker.stall = 0;
    seeker.lastDestroyed = stats.bricksDestroyed;
    seeker.field = null;
  } else {
    seeker.stall += dt;
  }
  const remaining = stats.remainingBreakableBricks;
  const threshold = Math.max(cfg.remainingBricks, stats.totalBreakableBricks * cfg.remainingFraction);
  seeker.active = remaining > 0 && (remaining <= threshold || seeker.stall >= cfg.stallSeconds);
  if (!seeker.active) return;

  const { cols, rows, cellWidth, cellHeight, offsetX, offsetY, cells } = state.grid;
  // Distance field over grid cells plus open virtual rows above (-1) and below (rows).
  seeker.fieldAge += dt;
  if (!seeker.field || seeker.fieldAge > 0.5) {
    const field = new Array((rows + 2) * cols).fill(-1);
    const queue = [];
    const isWall = (r, c) => {
      if (r < 0 || r >= rows) return false;
      const brick = state.bricks[cells[r * cols + c]];
      return Boolean(brick && brick.active && brick.indestructible);
    };
    for (const brick of state.bricks) {
      if (!brick.active || brick.indestructible || brick.hp <= 0) continue;
      const index = (brick.row + 1) * cols + brick.col;
      if (field[index] === -1) {
        field[index] = 0;
        queue.push(index);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      const r = Math.floor(index / cols) - 1;
      const c = index % cols;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < -1 || nr > rows || nc < 0 || nc >= cols || isWall(nr, nc)) continue;
        const next = (nr + 1) * cols + nc;
        if (field[next] !== -1) continue;
        field[next] = field[index] + 1;
        queue.push(next);
      }
    }
    seeker.field = field;
    seeker.fieldAge = 0;
  }

  const field = seeker.field;
  const maxTurn = cfg.turnRate * dt;
  for (const ball of state.balls) {
    if (!ball.active || ball.attachedToPaddle) continue;
    const col = Math.max(0, Math.min(cols - 1, Math.floor((ball.x - offsetX) / cellWidth)));
    const row = Math.max(-1, Math.min(rows, Math.floor((ball.y - offsetY) / cellHeight)));
    const here = field[(row + 1) * cols + col];
    if (here === undefined || here < 0) continue;

    // Aim at the best 8-neighbour (or the target itself when adjacent).
    let best = null;
    let bestDistance = here;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr < -1 || nr > rows || nc < 0 || nc >= cols) continue;
        const distance = field[(nr + 1) * cols + nc];
        if (distance < 0 || distance >= bestDistance) continue;
        // Diagonal moves must not cut a wall corner.
        if (dr && dc && (field[(row + 1 + dr) * cols + col] < 0 || field[(row + 1) * cols + nc] < 0)) continue;
        best = [nr, nc];
        bestDistance = distance;
      }
    }
    if (!best && here > 0) continue;
    const [tr, tc] = best ?? [row, col];
    const tx = offsetX + (tc + 0.5) * cellWidth;
    const ty = offsetY + (tr + 0.5) * cellHeight;
    const desired = Math.atan2(ty - ball.y, tx - ball.x);
    const current = Math.atan2(ball.vy, ball.vx);
    let delta = desired - current;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const turned = current + Math.max(-maxTurn, Math.min(maxTurn, delta));
    const speed = Math.hypot(ball.vx, ball.vy) || ball.speed;
    ball.vx = Math.cos(turned) * speed;
    ball.vy = Math.sin(turned) * speed;
  }
}

/** Allocate monotonically increasing IDs, including restored older snapshots. */
function allocateBallId(state, pendingBalls = []) {
  const highestId = Math.max(0, ...state.balls.map(ball => ball.id || 0), ...pendingBalls.map(ball => ball.id || 0));
  const nextId = Number.isSafeInteger(state.nextBallId) ? state.nextBallId : 1;
  state.nextBallId = Math.max(nextId, highestId + 1) + 1;
  return state.nextBallId - 1;
}

/** Keep a new ball inside the arena and outside solid geometry. */
function findSpawnPosition(state, source) {
  const radius = source.radius;
  const clampPosition = (x, y) => ({
    x: Math.max(radius, Math.min(state.arena.width - radius, x)),
    y: Math.max(radius, Math.min(state.arena.height - radius, y))
  });
  const isFree = position => {
    if (sweptCircleAABB(position.x, position.y, 0, 0, radius, state.paddle)) return false;
    const bounds = {
      minX: position.x - radius, maxX: position.x + radius,
      minY: position.y - radius, maxY: position.y + radius
    };
    return querySpatialGrid(state.grid, state.bricks, bounds).every(brick =>
      !sweptCircleAABB(position.x, position.y, 0, 0, radius, brick));
  };

  const origin = clampPosition(source.x, source.y);
  if (isFree(origin)) return origin;

  // Contact at an adjacent brick corner can leave the source slightly overlapping.
  // Search nearby first, so a spawned ball stays in the same corridor or chamber.
  for (const distance of [radius + 0.1, radius * 2 + 0.1, radius * 4 + 0.1, radius * 8 + 0.1]) {
    for (let direction = 0; direction < 16; direction++) {
      const angle = direction * Math.PI / 8;
      const candidate = clampPosition(origin.x + Math.cos(angle) * distance, origin.y + Math.sin(angle) * distance);
      if (isFree(candidate)) return candidate;
    }
  }

  // The paddle launch position is a safe fallback for normal campaign layouts.
  const fallback = clampPosition(state.paddle.x + state.paddle.width / 2, state.paddle.y - radius - 0.05);
  return isFree(fallback) ? fallback : null;
}

/**
 * Queue new balls until the frame ends. The queue counts toward subsequent powers,
 * but new balls cannot collide or trigger another power during their birth frame.
 */
function triggerMultiball(state, brick, impactBall, config, pendingBalls, source = 'BALL_HIT') {
  if (brick.type !== 7 && brick.type !== 8) return [];

  const activeBalls = [...state.balls, ...pendingBalls].filter(ball => ball.active && !ball.attachedToPaddle);
  const configuredLimit = config.ball?.maxBalls ?? DEFAULT_CONFIG.ball.maxBalls;
  const maxBalls = Number.isFinite(configuredLimit) ? Math.max(1, Math.floor(configuredLimit)) : DEFAULT_CONFIG.ball.maxBalls;
  const requestedCount = brick.type === 7 ? activeBalls.length : 3;
  const spawnCount = Math.min(requestedCount, Math.max(0, maxBalls - activeBalls.length));
  const spawnedIds = [];

  for (let index = 0; index < spawnCount; index++) {
    const template = brick.type === 7 ? activeBalls[index] : impactBall;
    if (!template) continue;
    const position = findSpawnPosition(state, template);
    if (!position) continue;
    const angle = brick.type === 7 ? (index % 2 === 0 ? Math.PI / 6 : -Math.PI / 6) : [-Math.PI / 4, Math.PI / 4, Math.PI / 2][index];
    const direction = Math.atan2(template.vy, template.vx) + angle;
    const speed = template.speed;
    const newBall = {
      ...template,
      ...position,
      id: allocateBallId(state, pendingBalls),
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed,
      active: true,
      attachedToPaddle: false,
      inCorridor: false
    };
    applyAntiStall(newBall, config.physics?.minVerticalSpeedRatio, config.physics?.microJitter);
    pendingBalls.push(newBall);
    spawnedIds.push(newBall.id);
  }

  return [{
    type: 'MULTIBALL',
    powerup: brick.type === 7 ? 'BALL_DOUBLER' : 'EXTRA_BALLS',
    brick,
    source,
    requestedCount,
    spawnedCount: spawnedIds.length,
    activeCount: activeBalls.length + spawnedIds.length,
    ballIds: spawnedIds
  }];
}

/**
 * Advances the simulation by dt seconds using fixed sub-stepping and CCD.
 *
 * @param {Object} state - Pure GameState object.
 * @param {Object} inputAction - Normalized input commands { moveLeft, moveRight, targetX, launchBall }.
 * @param {number} dt - Time delta in seconds (e.g. 1/60).
 * @param {Object} [config] - Optional configuration overrides.
 * @returns {Array} Array of detailed physics and gameplay events.
 */
export function stepPhysics(state, inputAction = {}, dt = 1 / 60, config = DEFAULT_CONFIG) {
  if ([GAME_STATUS.PAUSED, GAME_STATUS.GAME_OVER, GAME_STATUS.VICTORY].includes(state.status)) return [];
  // Clamp dt to avoid spiral of death on background tabs
  const clampedDt = Math.max(0, Math.min(dt, 0.05));
  if (clampedDt <= 0) return [];

  const events = [];
  const pendingBalls = [];
  const physicsCfg = config.physics || DEFAULT_CONFIG.physics;
  const numSubSteps = physicsCfg.subSteps || 8;
  const subDt = clampedDt / numSubSteps;

  const arenaWidth = state.arena.width;
  const arenaHeight = state.arena.height;

  // Handle ball launch from READY state
  if (state.status === GAME_STATUS.READY) {
    if (inputAction.launchBall) {
      state.status = GAME_STATUS.PLAYING;
      for (const ball of state.balls) {
        if (ball.attachedToPaddle) {
          ball.attachedToPaddle = false;
          ball.vy = -ball.speed;
          ball.vx = (state.paddle.vx || 0) * (physicsCfg.paddleMomentumTransfer || 0.2);

          // Apply anti-stall and normalize initial launch velocity
          const initialSpeed = ball.speed;
          const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
          if (currentSpeed > 0) {
            ball.vx = (ball.vx / currentSpeed) * initialSpeed;
            ball.vy = (ball.vy / currentSpeed) * initialSpeed;
          }
          applyAntiStall(ball, physicsCfg.minVerticalSpeedRatio, physicsCfg.microJitter);

          events.push({ type: 'BALL_LAUNCHED', ball });
        }
      }
    }
  }

  // Execute sub-steps
  for (let step = 0; step < numSubSteps; step++) {
    // 1. Paddle movement integration
    updatePaddle(state.paddle, inputAction, subDt, arenaWidth);

    // 2. Ball simulation
    for (const ball of state.balls) {
      if (!ball.active) continue;

      if (ball.attachedToPaddle) {
        // Pin ball to center of paddle
        ball.x = state.paddle.x + state.paddle.width / 2;
        ball.y = state.paddle.y - ball.radius;
        continue;
      }

      // Continuous collision resolution loop within this sub-step
      let remainingT = 1.0; // Fraction of subDt remaining
      let bounces = 0;
      const MAX_BOUNCES = 5;

      while (remainingT > 1e-5 && bounces < MAX_BOUNCES) {
        const stepDt = subDt * remainingT;
        const dx = ball.vx * stepDt;
        const dy = ball.vy * stepDt;

        // Find earliest collision among walls, paddle, and bricks
        let earliestHit = null;
        let hitType = null;
        let hitObject = null;

        // A. Check Arena Boundaries
        // Left wall (x = 0)
        if (dx < 0 && ball.x + dx < ball.radius) {
          const tWall = (ball.radius - ball.x) / dx;
          if (tWall >= 0 && tWall <= 1 && (!earliestHit || tWall < earliestHit.t)) {
            earliestHit = { t: tWall, nx: 1, ny: 0, depth: 0 };
            hitType = 'LEFT_WALL';
          }
        }
        // Right wall (x = arenaWidth)
        if (dx > 0 && ball.x + dx > arenaWidth - ball.radius) {
          const tWall = (arenaWidth - ball.radius - ball.x) / dx;
          if (tWall >= 0 && tWall <= 1 && (!earliestHit || tWall < earliestHit.t)) {
            earliestHit = { t: tWall, nx: -1, ny: 0, depth: 0 };
            hitType = 'RIGHT_WALL';
          }
        }
        // Top wall (y = 0)
        if (dy < 0 && ball.y + dy < ball.radius) {
          const tWall = (ball.radius - ball.y) / dy;
          if (tWall >= 0 && tWall <= 1 && (!earliestHit || tWall < earliestHit.t)) {
            earliestHit = { t: tWall, nx: 0, ny: 1, depth: 0 };
            hitType = 'TOP_WALL';
          }
        }
        // Bottom kill plane (y = arenaHeight)
        if (dy > 0 && ball.y + dy > arenaHeight + ball.radius) {
          const tKill = (arenaHeight + ball.radius - ball.y) / dy;
          if (tKill >= 0 && tKill <= 1 && (!earliestHit || tKill < earliestHit.t)) {
            earliestHit = { t: tKill, nx: 0, ny: -1, depth: 0 };
            hitType = 'KILL_PLANE';
          }
        }

        // Energy floor from a SHIELD brick, just above the kill plane
        if (state.shield > 0 && dy > 0) {
          const shieldY = arenaHeight - (config.rules?.shieldInset ?? DEFAULT_CONFIG.rules.shieldInset) - ball.radius;
          if (ball.y <= shieldY && ball.y + dy > shieldY) {
            const tShield = (shieldY - ball.y) / dy;
            if (tShield >= 0 && tShield <= 1 && (!earliestHit || tShield < earliestHit.t)) {
              earliestHit = { t: tShield, nx: 0, ny: -1, depth: 0 };
              hitType = 'SHIELD';
            }
          }
        }

        // B. Check Paddle Collision
        const paddleBox = {
          x: state.paddle.x,
          y: state.paddle.y,
          width: state.paddle.width,
          height: state.paddle.height
        };
        const paddleHit = sweptCircleAABB(ball.x, ball.y, dx, dy, ball.radius, paddleBox);
        if (paddleHit && paddleHit.t <= 1) {
          // If moving downwards or overlapping paddle top
          if (dy > 0 || paddleHit.isOverlap) {
            if (!earliestHit || paddleHit.t < earliestHit.t) {
              earliestHit = paddleHit;
              hitType = 'PADDLE';
              hitObject = state.paddle;
            }
          }
        }

        // C. Check Spatial Grid Bricks
        const sweptBounds = {
          minX: Math.min(ball.x, ball.x + dx) - ball.radius,
          minY: Math.min(ball.y, ball.y + dy) - ball.radius,
          maxX: Math.max(ball.x, ball.x + dx) + ball.radius,
          maxY: Math.max(ball.y, ball.y + dy) + ball.radius
        };

        const candidates = querySpatialGrid(state.grid, state.bricks, sweptBounds);
        for (const brick of candidates) {
          const brickHit = sweptCircleAABB(ball.x, ball.y, dx, dy, ball.radius, brick);
          if (brickHit && brickHit.t <= 1) {
            if (!earliestHit || brickHit.t < earliestHit.t) {
              earliestHit = brickHit;
              hitType = 'BRICK';
              hitObject = brick;
            }
          }
        }

        // Resolve earliest collision or advance full step
        if (!earliestHit) {
          ball.x += dx;
          ball.y += dy;
          remainingT = 0;
        } else {
          // Advance ball to contact point
          const advanceFraction = Math.max(0, earliestHit.t);
          ball.x += dx * advanceFraction;
          ball.y += dy * advanceFraction;

          if (hitType === 'KILL_PLANE') {
            ball.active = false;
            state.stats.ballsLost++;
            events.push({ type: 'BALL_LOST', ball });
            remainingT = 0;
            break;
          }

          if (hitType === 'LEFT_WALL' || hitType === 'RIGHT_WALL') {
            ball.vx = -ball.vx;
            // Positional depenetration
            ball.x += earliestHit.nx * 0.05;
            applyAntiStall(ball, physicsCfg.minVerticalSpeedRatio, physicsCfg.microJitter);
            state.stats.wallHits++;
            events.push({ type: 'WALL_HIT', wall: hitType, ball });
          } else if (hitType === 'TOP_WALL') {
            ball.vy = -ball.vy;
            ball.y += earliestHit.ny * 0.05;
            applyAntiStall(ball, physicsCfg.minVerticalSpeedRatio, physicsCfg.microJitter);
            state.stats.wallHits++;
            events.push({ type: 'WALL_HIT', wall: hitType, ball });
          } else if (hitType === 'SHIELD') {
            ball.vy = -Math.abs(ball.vy);
            ball.y -= 0.05;
            applyAntiStall(ball, physicsCfg.minVerticalSpeedRatio, physicsCfg.microJitter);
            events.push({ type: 'SHIELD_HIT', ball });
          } else if (hitType === 'PADDLE') {
            // Top deflection calculation
            const defl = calculatePaddleDeflection(ball.x, state.paddle, ball.speed, config);
            ball.vx = defl.vx;
            ball.vy = defl.vy;
            ball.y = state.paddle.y - ball.radius - 0.05;
            state.stats.paddleHits++;
            events.push({
              type: 'PADDLE_HIT',
              ball,
              offset: defl.offset,
              angle: defl.angle
            });
          } else if (hitType === 'BRICK') {
            const brick = hitObject;

            // Reflect velocity based on collision normal
            const dot = ball.vx * earliestHit.nx + ball.vy * earliestHit.ny;
            if (dot < 0) {
              ball.vx -= 2 * dot * earliestHit.nx;
              ball.vy -= 2 * dot * earliestHit.ny;
            }

            // Depenetration along normal
            const depen = (earliestHit.depth || 0) + 0.05;
            ball.x += earliestHit.nx * depen;
            ball.y += earliestHit.ny * depen;

            // Apply corridor anti-stall
            applyAntiStall(ball, physicsCfg.minVerticalSpeedRatio, physicsCfg.microJitter);

            // Handle brick damage & destruction
            const brickEvents = resolveBrickHit(state, brick, ball, config, pendingBalls);
            events.push(...brickEvents);
          }

          // Consume collision fraction from remaining step time
          remainingT -= earliestHit.t;
          bounces++;
        }
      }
    }
  }

  // 2b. Chain reactions advance only while the ball is in play.
  if (state.status === GAME_STATUS.PLAYING && state.fuses?.length) {
    events.push(...burnFuses(state, clampedDt, config, pendingBalls));
  }
  if (state.status === GAME_STATUS.PLAYING && state.shield > 0) {
    state.shield = Math.max(0, state.shield - clampedDt);
    if (state.shield === 0) events.push({ type: 'SHIELD_DOWN' });
  }
  if (state.status === GAME_STATUS.PLAYING) {
    const wasSeeking = Boolean(state.seeker?.active);
    updateSeeker(state, clampedDt, config);
    if (!wasSeeking && state.seeker?.active) events.push({ type: 'SEEKER_ON' });
  }

  // 3. Post-substep lifecycle checks
  // Retire lost balls and append births only after the existing balls finish moving.
  const lostBall = state.balls.find(ball => !ball.active);
  const activeBalls = [...state.balls.filter(ball => ball.active), ...pendingBalls];
  // Life loss & Game Over check if all balls are lost
  if (activeBalls.length === 0 && state.status === GAME_STATUS.PLAYING) {
    state.lives--;
    if (state.lives <= 0) {
      state.status = GAME_STATUS.GAME_OVER;
      events.push({ type: 'GAME_OVER' });
    } else {
      // Re-arm ball onto paddle
      state.status = GAME_STATUS.READY;
      const respawnBall = {
        ...(lostBall || {}),
        id: allocateBallId(state),
        radius: lostBall?.radius ?? config.ball?.radius ?? 4.5,
        speed: lostBall?.speed || config.ball?.speed || 450,
        inCorridor: false
      };
      respawnBall.active = true;
      respawnBall.attachedToPaddle = true;
      respawnBall.vx = 0;
      respawnBall.vy = 0;
      respawnBall.x = state.paddle.x + state.paddle.width / 2;
      respawnBall.y = state.paddle.y - respawnBall.radius;
      activeBalls.push(respawnBall);
      events.push({ type: 'LIFE_LOST', remainingLives: state.lives });
    }
  }
  state.balls = activeBalls;

  // Level Clear check: all breakable bricks destroyed
  if (state.stats.remainingBreakableBricks <= 0 && state.status === GAME_STATUS.PLAYING) {
    state.status = GAME_STATUS.LEVEL_CLEAR;
    events.push({ type: 'LEVEL_CLEAR', levelIndex: state.levelIndex });
  }

  // Update simulation clock
  state.frame++;
  state.time += clampedDt;

  return events;
}

/**
 * Updates paddle position according to input commands with bound clamping.
 */
function updatePaddle(paddle, inputAction, dt, arenaWidth) {
  if (typeof inputAction.targetX === 'number' && Number.isFinite(inputAction.targetX)) {
    const currentCenter = paddle.x + paddle.width / 2;
    const diff = inputAction.targetX - currentCenter;
    const maxMove = paddle.speed * dt;
    const move = Math.max(-maxMove, Math.min(maxMove, diff));
    paddle.x += move;
    paddle.vx = dt > 0 ? move / dt : 0;
  } else if (inputAction.moveLeft && !inputAction.moveRight) {
    const move = -paddle.speed * dt;
    paddle.x += move;
    paddle.vx = -paddle.speed;
  } else if (inputAction.moveRight && !inputAction.moveLeft) {
    const move = paddle.speed * dt;
    paddle.x += move;
    paddle.vx = paddle.speed;
  } else {
    paddle.vx = 0;
  }

  // Clamp paddle to arena boundaries
  if (paddle.x < 0) {
    paddle.x = 0;
    paddle.vx = 0;
  } else if (paddle.x + paddle.width > arenaWidth) {
    paddle.x = arenaWidth - paddle.width;
    paddle.vx = 0;
  }
}

/**
 * Resolves damage, scoring, speed boost, bomb explosions, and destruction for a brick hit.
 */
function resolveBrickHit(state, brick, ball, config, pendingBalls) {
  const events = [];
  if (!brick.active) return events;

  if (brick.indestructible || brick.type === 4) {
    state.stats.corridorHits++;
    events.push({
      type: 'BRICK_HIT',
      brick,
      ball,
      damage: 0,
      destroyed: false,
      indestructible: true
    });
    return events;
  }

  // Damage breakable brick
  brick.hp -= 1;
  const isDestroyed = brick.hp <= 0;

  if (isDestroyed) {
    brick.active = false;
    brick.hp = 0;

    // Remove from spatial grid
    const cellIdx = brick.row * state.grid.cols + brick.col;
    state.grid.cells[cellIdx] = -1;

    state.score += brick.points || 0;
    state.stats.bricksDestroyed++;
    state.stats.remainingBreakableBricks--;

    // Speed increment on hit
    const speedInc = config.ball?.speedIncrementOnHit ?? 1.5;
    const maxSpeed = config.ball?.maxSpeed ?? 750;

    if (brick.type === 5) {
      // Booster brick: 15% speed increase
      const boostFactor = BRICK_TYPES[5]?.speedBoostFactor || 1.15;
      ball.speed = Math.min(maxSpeed, ball.speed * boostFactor);
    } else {
      ball.speed = Math.min(maxSpeed, ball.speed + speedInc);
    }

    // Scale current velocity to new ball.speed
    const curMag = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (curMag > 0) {
      ball.vx = (ball.vx / curMag) * ball.speed;
      ball.vy = (ball.vy / curMag) * ball.speed;
    }

    events.push({
      type: 'BRICK_HIT',
      brick,
      ball,
      damage: 1,
      destroyed: true
    });

    // Bomb brick: trigger 3x3 blast
    if (brick.type === 6) {
      const blastEvents = triggerBombExplosion(state, brick, ball, config, pendingBalls);
      events.push(...blastEvents);
    }
    events.push(...triggerMultiball(state, brick, ball, config, pendingBalls));
    events.push(...triggerShield(state, brick, config));
  } else {
    // Damaged but not yet destroyed
    events.push({
      type: 'BRICK_HIT',
      brick,
      ball,
      damage: 1,
      destroyed: false
    });
  }

  return events;
}
