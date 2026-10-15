/**
 * Bot clear-rate benchmark for procedurally generated maps.
 * Generates `maps` seeds per difficulty, lets the bot play each headlessly,
 * and reports how many it clears and how fast. Fails only on broken runs
 * (game over, no progress), since clear time is a tuning signal.
 * Run: node tests/generated_maps_benchmark.js [maps-per-difficulty] [max-seconds]
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIFFICULTY_NAMES, generateMap } from '../src/core/map_generator.js';
import { simulateLevel } from '../src/core/autoplay.js';

export function runGeneratedMapsBenchmark({ maps = 12, maxSeconds = 240, quiet = false } = {}) {
  const summary = [];
  const failures = [];
  for (const difficulty of DIFFICULTY_NAMES) {
    const runs = [];
    for (let i = 0; i < maps; i++) {
      const def = generateMap({ seed: `bench-${i}`, difficulty });
      const run = simulateLevel(def, { maxSeconds });
      runs.push(run);
      if (run.gameOver) failures.push(`${difficulty} ${def.seed}: game over`);
      if (run.bricksDestroyed === 0) failures.push(`${difficulty} ${def.seed}: no bricks destroyed`);
    }
    const cleared = runs.filter(run => run.cleared).map(run => run.seconds).sort((a, b) => a - b);
    const percents = runs.map(run => run.percent).sort((a, b) => a - b);
    summary.push({
      difficulty,
      maps,
      cleared: `${cleared.length}/${maps}`,
      medianClearSec: cleared.length ? cleared[Math.floor(cleared.length / 2)] : '-',
      fastestSec: cleared[0] ?? '-',
      medianPercent: percents[Math.floor(maps / 2)],
      peakBalls: Math.max(...runs.map(run => run.maxBalls)),
      longestChain: Math.max(...runs.map(run => run.longestChain)),
    });
  }
  if (!quiet) {
    console.table(summary);
    for (const failure of failures) console.error(failure);
    console.log(failures.length ? `FAIL: ${failures.length} broken runs.` : `PASS: every generated map ran cleanly (budget ${maxSeconds}s).`);
  }
  return { success: failures.length === 0, summary, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const maps = process.argv[2] === undefined ? 12 : Number(process.argv[2]);
  const maxSeconds = process.argv[3] === undefined ? 240 : Number(process.argv[3]);
  process.exitCode = runGeneratedMapsBenchmark({ maps, maxSeconds }).success ? 0 : 1;
}
