/**
 * Master E2E Test Suite Runner
 * Discovers and executes all 4 tiers of the systematic verification methodology:
 * - Tier 1: Isolated Feature Contract & Behavior Tests (F1 - F24)
 * - Tier 2: Boundary, Edge, and Corner Case Tests
 * - Tier 3: Pairwise Feature Interaction & Combination Tests
 * - Tier 4: Realistic Full-Game Simulation Scenarios
 *
 * Exits with code 0 (ALL PASS) or code 1 (FAIL).
 * Pure vanilla ES module - Zero external npm dependencies.
 */

import { createTier1Suites } from './tier1_features.test.js';
import { createTier2Suites } from './tier2_boundaries.test.js';
import { createTier3Suites } from './tier3_combinations.test.js';
import { createTier4Suites } from './tier4_scenarios.test.js';

// ANSI color escape codes for terminal formatting
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

/**
 * Parses CLI command-line arguments.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    selectedTier: null,
    verbose: false,
    bail: false
  };

  for (const arg of args) {
    if (arg.startsWith('--tier=')) {
      options.selectedTier = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--bail' || arg === '-b') {
      options.bail = true;
    }
  }

  return options;
}

/**
 * Main Test Runner Entrypoint
 */
async function main() {
  const options = parseArgs();
  const startTime = performance.now();

  console.log(`\n${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}       BRICK BREAKER E2E VERIFICATION SUITE — 4-TIER RUNNER            ${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}\n`);

  const tiers = [
    { number: 1, name: 'Tier 1: Feature Contracts (Isolated Checks)', loader: createTier1Suites },
    { number: 2, name: 'Tier 2: Boundary & Corner Cases (Stress & Limits)', loader: createTier2Suites },
    { number: 3, name: 'Tier 3: Pairwise Feature Combinations', loader: createTier3Suites },
    { number: 4, name: 'Tier 4: Realistic Full-Game Simulation Scenarios', loader: createTier4Suites }
  ];

  const filteredTiers = options.selectedTier
    ? tiers.filter(t => t.number === options.selectedTier)
    : tiers;

  if (filteredTiers.length === 0) {
    console.error(`${RED}Error: Tier ${options.selectedTier} not recognized. Choose 1, 2, 3, or 4.${RESET}`);
    process.exit(1);
  }

  const tierSummaries = [];
  let grandTotal = 0;
  let grandPassed = 0;
  let grandFailed = 0;
  let grandSkipped = 0;
  const failureDetails = [];

  for (const tier of filteredTiers) {
    console.log(`${BOLD}▶ Running ${tier.name}${RESET}`);
    const tierStart = performance.now();
    const suites = await tier.loader();

    let tierTotal = 0;
    let tierPassed = 0;
    let tierFailed = 0;
    let tierSkipped = 0;

    for (const suite of suites) {
      if (options.verbose) {
        console.log(`  ${CYAN}Suite: ${suite.name}${RESET}`);
      }
      const res = await suite.run({ verbose: options.verbose, bail: options.bail });
      tierTotal += res.total;
      tierPassed += res.passed;
      tierFailed += res.failed;
      tierSkipped += res.skipped;

      for (const t of res.tests) {
        if (t.status === 'FAIL') {
          failureDetails.push({
            tier: tier.number,
            suite: suite.name,
            test: t.description,
            error: t.error,
            stack: t.stack
          });
        }
      }

      if (options.bail && tierFailed > 0) {
        break;
      }
    }

    const tierDuration = Math.round((performance.now() - tierStart) * 100) / 100;
    const tierStatusColor = tierFailed > 0 ? RED : (tierSkipped > 0 ? YELLOW : GREEN);
    const tierStatusText = tierFailed > 0 ? 'FAIL' : 'PASS';

    console.log(`  └─ Result: ${tierStatusColor}${BOLD}[${tierStatusText}]${RESET} ` +
      `${tierPassed}/${tierTotal} passed (${tierSkipped} skipped, ${tierFailed} failed) in ${tierDuration}ms\n`);

    tierSummaries.push({
      tier: tier.number,
      name: tier.name,
      total: tierTotal,
      passed: tierPassed,
      failed: tierFailed,
      skipped: tierSkipped,
      durationMs: tierDuration,
      status: tierStatusText
    });

    grandTotal += tierTotal;
    grandPassed += tierPassed;
    grandFailed += tierFailed;
    grandSkipped += tierSkipped;

    if (options.bail && grandFailed > 0) {
      console.log(`${RED}Execution halted due to --bail flag.${RESET}\n`);
      break;
    }
  }

  const grandDuration = Math.round((performance.now() - startTime) * 100) / 100;

  // Print Structured Summary Table
  console.log(`${BOLD}${CYAN}------------------------------------------------------------------------${RESET}`);
  console.log(`${BOLD}                        TIER SUMMARY BREAKDOWN                          ${RESET}`);
  console.log(`${BOLD}${CYAN}------------------------------------------------------------------------${RESET}`);
  console.log(`${BOLD}Tier       Total    Pass    Fail    Skip    Time (ms)   Status${RESET}`);
  console.log(`${GRAY}------------------------------------------------------------------------${RESET}`);

  for (const s of tierSummaries) {
    const statusFormatted = s.status === 'PASS'
      ? `${GREEN}${BOLD}PASS${RESET}`
      : `${RED}${BOLD}FAIL${RESET}`;
    const tCol = `Tier ${s.tier}`.padEnd(10);
    const totCol = String(s.total).padEnd(8);
    const passCol = String(s.passed).padEnd(8);
    const failCol = String(s.failed).padEnd(8);
    const skipCol = String(s.skipped).padEnd(8);
    const timeCol = `${s.durationMs}ms`.padEnd(12);
    console.log(`${tCol} ${totCol} ${passCol} ${failCol} ${skipCol} ${timeCol} ${statusFormatted}`);
  }

  console.log(`${GRAY}------------------------------------------------------------------------${RESET}`);
  console.log(`${BOLD}TOTAL      ${String(grandTotal).padEnd(8)} ${String(grandPassed).padEnd(8)} ${String(grandFailed).padEnd(8)} ${String(grandSkipped).padEnd(8)} ${grandDuration}ms${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);

  // Report Granular Failures if any
  if (failureDetails.length > 0) {
    console.log(`\n${RED}${BOLD}FAILED TESTS SUMMARY (${failureDetails.length}):${RESET}\n`);
    for (const f of failureDetails) {
      console.log(`  ${RED}✖ [Tier ${f.tier}] [${f.suite}] ${f.test}${RESET}`);
      console.log(`    ${GRAY}Error: ${f.error}${RESET}`);
      if (f.stack) {
        const stackLines = f.stack.split('\n').slice(1, 3).join('\n');
        console.log(`    ${GRAY}${stackLines}${RESET}`);
      }
      console.log('');
    }
  }

  // Final Verdict
  if (grandFailed === 0) {
    console.log(`\n${GREEN}${BOLD}✔ ALL VERIFICATION SUITES PASSED! (${grandPassed}/${grandTotal} tests)${RESET}\n`);
    process.exit(0);
  } else {
    console.error(`\n${RED}${BOLD}✘ TEST RUNNER FAILED: ${grandFailed} test(s) failed out of ${grandTotal}.${RESET}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n${RED}Fatal Test Runner Exception:${RESET}`, err);
  process.exit(1);
});
