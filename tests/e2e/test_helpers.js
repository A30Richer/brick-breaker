/**
 * Shared Test Helpers & Harness for E2E Tests
 * Supports both standalone custom test runner and native `node:test`
 * Pure vanilla ES modules - Zero external dependencies
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Safely imports an ES module from a relative path.
 * Returns null if the module file is not found (allowing graceful progressive testability).
 * Throws on actual syntax/runtime errors inside an existing module.
 *
 * @param {string} relativePath - Path relative to tests/e2e/
 * @returns {Promise<Object|null>}
 */
export async function importSafe(relativePath) {
  try {
    const fullPath = path.resolve(__dirname, relativePath);
    return await import(fullPath);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && err.message.includes(path.basename(relativePath))) {
      return null;
    }
    throw err;
  }
}

// Module cache / loaders
export async function getConfig() {
  return await importSafe('../../src/config.js');
}

export async function getStateModule() {
  return await importSafe('../../src/core/state.js');
}

export async function getPhysicsModule() {
  return await importSafe('../../src/core/physics.js');
}

export async function getLevelsModule() {
  return await importSafe('../../src/core/levels.js');
}

export async function getLevelManagerModule() {
  return await importSafe('../../src/core/level_manager.js');
}

export async function getBotModule() {
  return await importSafe('../../src/core/bot.js');
}

export async function getEngineModule() {
  return await importSafe('../../src/core/engine.js');
}

export async function getRendererModule() {
  return await importSafe('../../src/platform/browser/canvas_renderer.js');
}

export async function getInputManagerModule() {
  return await importSafe('../../src/platform/browser/input_manager.js');
}

export async function getAudioSynthModule() {
  return await importSafe('../../src/platform/browser/audio_synth.js');
}

/**
 * Float / vector approximation assertion.
 */
export function assertApprox(actual, expected, tolerance = 0.02, message = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tolerance,
    `Assertion failed: ${message} (expected ~${expected}, got ${actual}, diff ${diff} > ${tolerance})`
  );
}

/**
 * Value within bounds assertion.
 */
export function assertInBounds(val, min, max, message = '') {
  assert.ok(
    val >= min && val <= max,
    `Assertion failed: ${message} (expected ${val} in [${min}, ${max}])`
  );
}

/**
 * Creates a synthetic level definition for controlled unit and E2E simulation.
 * Includes a central chute (col 7-8) flanked by corridor walls (col 6, 9)
 * and dense surrounding bricks.
 */
export function createSyntheticLevelDef(cols = 16, rows = 12) {
  const layout = [];
  for (let r = 0; r < rows; r++) {
    let rowStr = '';
    for (let c = 0; c < cols; c++) {
      if (c === Math.floor(cols / 2) || c === Math.floor(cols / 2) + 1) {
        // Open central corridor (including vault exit)
        rowStr += '0';
      } else if (c === Math.floor(cols / 2) - 1 || c === Math.floor(cols / 2) + 2) {
        // Indestructible corridor wall
        rowStr += '4';
      } else if (r === 0) {
        // Top vault
        rowStr += (c % 2 === 0 ? '6' : '3'); // Bomb and Titanium
      } else if (r % 3 === 1) {
        rowStr += '2'; // Reinforced
      } else if (r % 4 === 2) {
        rowStr += '5'; // Booster
      } else {
        rowStr += '1'; // Regular breakable
      }
    }
    layout.push(rowStr);
  }

  return {
    id: 99,
    name: 'Synthetic Test Arena',
    cols,
    rows,
    brickWidth: 480 / cols,
    brickHeight: 12,
    layout
  };
}

/**
 * Creates an isolated test level with explicit brick placements in an empty field.
 * @param {Object} brickTypes - Map of "row,col": typeId, e.g. { "0,5": 2 }
 */
export function createIsolatedTestLevel(brickTypes = {}) {
  const rows = 8;
  const cols = 16;
  const layout = Array.from({ length: rows }, () => '0'.repeat(cols));
  for (const [coord, type] of Object.entries(brickTypes)) {
    const [r, c] = coord.split(',').map(Number);
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      const rowChars = layout[r].split('');
      rowChars[c] = String(type);
      layout[r] = rowChars.join('');
    }
  }
  return {
    id: 999,
    name: 'Isolated Test Arena',
    cols,
    rows,
    brickWidth: 30,
    brickHeight: 12,
    ballInitialSpeed: 450,
    layout
  };
}

/**
 * Creates minimal mock Canvas and 2D Context for headless adapter contract verification.
 */
export function createMockCanvas(width = 480, height = 720) {
  const calls = [];
  const ctx = {
    canvas: null,
    save: () => calls.push({ op: 'save' }),
    restore: () => calls.push({ op: 'restore' }),
    beginPath: () => calls.push({ op: 'beginPath' }),
    closePath: () => calls.push({ op: 'closePath' }),
    rect: (x, y, w, h) => calls.push({ op: 'rect', args: [x, y, w, h] }),
    fillRect: (x, y, w, h) => calls.push({ op: 'fillRect', args: [x, y, w, h] }),
    strokeRect: (x, y, w, h) => calls.push({ op: 'strokeRect', args: [x, y, w, h] }),
    clearRect: (x, y, w, h) => calls.push({ op: 'clearRect', args: [x, y, w, h] }),
    arc: (x, y, r, sa, ea) => calls.push({ op: 'arc', args: [x, y, r, sa, ea] }),
    fill: () => calls.push({ op: 'fill' }),
    stroke: () => calls.push({ op: 'stroke' }),
    fillText: (text, x, y) => calls.push({ op: 'fillText', args: [text, x, y] }),
    measureText: (text) => ({ width: text.length * 8 }),
    setTransform: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    createLinearGradient: () => ({
      addColorStop: () => {}
    }),
    createRadialGradient: () => ({
      addColorStop: () => {}
    }),
    shadowBlur: 0,
    shadowColor: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top'
  };

  const canvas = {
    width,
    height,
    style: {},
    getContext: (type) => {
      if (type === '2d') {
        ctx.canvas = canvas;
        return ctx;
      }
      return null;
    },
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width,
      height
    })
  };

  ctx.canvas = canvas;
  return { canvas, ctx, calls };
}

/**
 * Creates minimal mock AudioContext for Web Audio API contract testing.
 */
export function createMockAudioContext() {
  const audioCalls = [];
  return {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: async () => {},
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime: (v, t) => audioCalls.push({ op: 'gain.setValueAtTime', v, t }),
        exponentialRampToValueAtTime: (v, t) => audioCalls.push({ op: 'gain.exponentialRampToValueAtTime', v, t }),
        linearRampToValueAtTime: (v, t) => audioCalls.push({ op: 'gain.linearRampToValueAtTime', v, t })
      },
      connect: () => {}
    }),
    createOscillator: () => ({
      type: 'sine',
      frequency: {
        value: 440,
        setValueAtTime: (v, t) => audioCalls.push({ op: 'osc.setValueAtTime', v, t }),
        exponentialRampToValueAtTime: (v, t) => audioCalls.push({ op: 'osc.exponentialRampToValueAtTime', v, t })
      },
      connect: () => {},
      start: (t) => audioCalls.push({ op: 'osc.start', t }),
      stop: (t) => audioCalls.push({ op: 'osc.stop', t })
    }),
    _calls: audioCalls
  };
}

/**
 * Lightweight test suite builder supporting structured recording,
 * timing, error capture, and runner reporting.
 */
export class TestSuite {
  constructor(name) {
    this.name = name;
    this.tests = [];
  }

  it(description, fn) {
    this.tests.push({ description, fn, skip: false });
  }

  skip(description, reason = 'Skipped') {
    this.tests.push({ description, fn: null, skip: true, reason });
  }

  async run(options = { verbose: false, bail: false }) {
    const results = {
      name: this.name,
      total: this.tests.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      tests: [],
      durationMs: 0
    };

    const startTime = performance.now();

    for (const test of this.tests) {
      if (test.skip) {
        results.skipped++;
        results.tests.push({
          description: test.description,
          status: 'SKIP',
          reason: test.reason
        });
        if (options.verbose) {
          console.log(`  [SKIP] ${test.description} (${test.reason})`);
        }
        continue;
      }

      const testStart = performance.now();
      try {
        await test.fn();
        const duration = Math.round((performance.now() - testStart) * 100) / 100;
        results.passed++;
        results.tests.push({
          description: test.description,
          status: 'PASS',
          durationMs: duration
        });
        if (options.verbose) {
          console.log(`  [PASS] ${test.description} (${duration}ms)`);
        }
      } catch (err) {
        const duration = Math.round((performance.now() - testStart) * 100) / 100;
        results.failed++;
        results.tests.push({
          description: test.description,
          status: 'FAIL',
          error: err.message,
          stack: err.stack,
          durationMs: duration
        });
        console.error(`  [FAIL] ${test.description} (${duration}ms): ${err.message}`);
        if (options.bail) {
          break;
        }
      }
    }

    results.durationMs = Math.round((performance.now() - startTime) * 100) / 100;
    return results;
  }
}
