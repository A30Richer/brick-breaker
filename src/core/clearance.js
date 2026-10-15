/**
 * Ball-clearance reachability analysis shared by the level validator and the
 * procedural map generator.
 *
 * Pure ES Module - Zero external dependencies.
 */

/**
 * Flood ball-center space after breakable armor has been removed. Permanent
 * rectangles are inflated by the ball radius, including rounded corners.
 * A half-sample padding makes each flood edge safe between sampled points.
 * Every brick must have an outside impact position reachable from below.
 * This rejects permanent seals and passages thinner than the ball, rather
 * than relying on the decorative corridor metadata or cell adjacency.
 * It proves geometric access, not that a particular bot wins every rally.
 */
export function analyzeBallClearance(built, config = {}) {
  const radius = config.ballRadius ?? config.ball?.radius ?? 4.5;
  const arenaWidth = config.arena?.width ?? built.grid.totalWidth;
  const arenaHeight = config.arena?.height ?? built.grid.offsetY + built.grid.totalHeight + radius * 3;
  const step = 1;
  const paddedRadius = radius + step / 2;
  const maxY = Math.min(arenaHeight - radius, built.grid.offsetY + built.grid.totalHeight + radius + step);
  const cols = Math.floor((arenaWidth - 2 * radius) / step) + 1;
  const rows = Math.floor((maxY - radius) / step) + 1;
  const blocked = new Uint8Array(cols * rows);
  const reachable = new Uint8Array(cols * rows);
  const queue = new Int32Array(cols * rows);

  function bounds(brick, margin) {
    return {
      left: Math.max(0, Math.ceil((brick.x - margin - radius) / step)),
      right: Math.min(cols - 1, Math.floor((brick.x + brick.width + margin - radius) / step)),
      top: Math.max(0, Math.ceil((brick.y - margin - radius) / step)),
      bottom: Math.min(rows - 1, Math.floor((brick.y + brick.height + margin - radius) / step)),
    };
  }

  function rectangleDistanceSquared(x, y, brick) {
    const dx = Math.max(brick.x - x, 0, x - brick.x - brick.width);
    const dy = Math.max(brick.y - y, 0, y - brick.y - brick.height);
    return dx * dx + dy * dy;
  }

  for (const wall of built.bricks.filter(brick => brick.indestructible)) {
    const area = bounds(wall, paddedRadius);
    for (let row = area.top; row <= area.bottom; row++) {
      for (let col = area.left; col <= area.right; col++) {
        const distance = rectangleDistanceSquared(radius + col * step, radius + row * step, wall);
        if (distance < paddedRadius * paddedRadius) blocked[row * cols + col] = 1;
      }
    }
  }

  let head = 0;
  let tail = 0;
  function visit(index) {
    if (blocked[index] || reachable[index]) return;
    reachable[index] = 1;
    queue[tail++] = index;
  }
  for (let col = 0; col < cols; col++) visit((rows - 1) * cols + col);
  while (head < tail) {
    const index = queue[head++];
    const col = index % cols;
    if (col > 0) visit(index - 1);
    if (col + 1 < cols) visit(index + 1);
    if (index >= cols) visit(index - cols);
    if (index + cols < reachable.length) visit(index + cols);
  }

  const unreachableBricks = [];
  for (const brick of built.bricks.filter(candidate => candidate.breakable)) {
    const area = bounds(brick, radius);
    let canHit = false;
    for (let row = area.top; row <= area.bottom && !canHit; row++) {
      for (let col = area.left; col <= area.right; col++) {
        if (!reachable[row * cols + col]) continue;
        const distance = rectangleDistanceSquared(radius + col * step, radius + row * step, brick);
        if (distance > 0 && distance <= radius * radius) {
          canHit = true;
          break;
        }
      }
    }
    if (!canHit) unreachableBricks.push({ id: brick.id, row: brick.row, col: brick.col });
  }
  const unreachableCorridorPoints = [];
  function checkCorridorPoint(x, y, chute, cell) {
    const col = Math.round((x - radius) / step);
    const row = Math.round((y - radius) / step);
    if (col < 0 || col >= cols || row < 0 || row >= rows || !reachable[row * cols + col]) {
      unreachableCorridorPoints.push({ type: chute.type, ...cell });
    }
  }
  for (const chute of built.chutes ?? []) {
    if (chute.col !== undefined && chute.startRow !== undefined && chute.endRow !== undefined) {
      for (let row = chute.startRow; row <= chute.endRow; row++) {
        checkCorridorPoint(
          built.grid.offsetX + (chute.col + 0.5) * built.grid.cellWidth,
          built.grid.offsetY + (row + 0.5) * built.grid.cellHeight,
          chute, { row, col: chute.col },
        );
      }
    } else if (chute.row !== undefined && chute.startCol !== undefined && chute.endCol !== undefined) {
      for (let col = chute.startCol; col <= chute.endCol; col++) {
        checkCorridorPoint(
          built.grid.offsetX + (col + 0.5) * built.grid.cellWidth,
          built.grid.offsetY + (chute.row + 0.5) * built.grid.cellHeight,
          chute, { row: chute.row, col },
        );
      }
    }
  }
  return { unreachableBricks, unreachableCorridorPoints, reachableSamples: tail, sampleStepPx: step };
}
