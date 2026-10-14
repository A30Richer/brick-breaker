# Test Infrastructure & E2E Testing Framework

## 1. Test Philosophy & 4-Tier Opaque-Box Methodology

The Brick Breaker verification suite employs a systematic **4-tier opaque-box testing methodology** designed for high-performance, isomorphic simulation engines with zero external npm runtime dependencies:

```
+-----------------------------------------------------------------------------+
|                      TIER 4: FULL GAMEPLAY SCENARIOS                        |
|  - 3,000-Frame Autonomous Bot Rally Scenario (Zero Drops, Level 1 & 2)      |
|  - Level Clear & Progression Lifecycle (Level 1 -> 5 Campaign)              |
|  - Game Over, High Score Recording, & Restart Flow                          |
|  - Pause State Freeze & Deterministic Resume                                |
|  - Dynamic Ball Multi-Ricochet & Bomb Chain Reaction Progression            |
+-----------------------------------------------------------------------------+
                                       ▲
+-----------------------------------------------------------------------------+
|                    TIER 3: PAIRWISE FEATURE COMBINATIONS                    |
|  - Corridor Anti-Stall Ricochet + Multi-Tier Brick Destruction              |
|  - Paddle Slice Velocity Transfer + Extreme Contact Deflection Angle        |
|  - Autonomous Bot AI Steering + Real-Time Mid-Flight Bot Toggle             |
|  - Fast Ball Speed Acceleration + Dense Spatial Grid Multi-Hit              |
|  - Bomb Explosive Blast + Indestructible Guide Rail Resistance              |
+-----------------------------------------------------------------------------+
                                       ▲
+-----------------------------------------------------------------------------+
|                     TIER 2: BOUNDARIES & CORNER CASES                       |
|  - Extreme contact offsets (u = -1.0, +1.0) & acute deflection angles       |
|  - Maximum ball speed capping (v_max = 750 px/s) & speed normalization      |
|  - Delta-time spikes (dt = 0.05s clamp on tab unfocus)                      |
|  - Zero-life threshold & instant GAME_OVER state enforcement                |
|  - Arena boundary wall clipping prevention at outer borders                 |
|  - Rapid multi-bounce ricochet inside narrow 1-cell corridor shafts         |
+-----------------------------------------------------------------------------+
                                       ▲
+-----------------------------------------------------------------------------+
|                    TIER 1: ISOLATED FEATURE CHECKS (HAPPY PATH)             |
|  - State Creation, Cloning, Serialization, and Deserialization              |
|  - Sub-stepped Physics Loop (N = 8 sub-steps per frame)                     |
|  - Swept Circle vs AABB Continuous Collision Detection (CCD)                |
|  - Variable Paddle Deflection Angle Mapping & Speed Scalar Preservation     |
|  - Corridor Ricochet & Minimum Vertical Velocity Anti-Stall (|vy| >= 0.2*|v|)|
|  - Multi-Tier Brick Health, Durability, and Score Values                    |
|  - Level Definition Loading & Dense Spatial Grid Generation (5 Levels)      |
|  - Autonomous Bot Trajectory Raycasting & Kinematic Intercept Steering      |
|  - Game Engine Lifecycle State Machine Transitions                          |
|  - Platform Adapter Interfaces (CanvasRenderer, InputManager, AudioSynth)   |
+-----------------------------------------------------------------------------+
```

### Guiding Principles:
1. **Opaque-Box Contract Testing**: Tests interact strictly through public interfaces specified in `PROJECT.md` (`createInitialState`, `stepPhysics`, `computeBotAction`, `GameEngine`, `LevelManager`).
2. **Zero Runtime / Build Dependencies**: Pure native ES modules and Node.js standard library (`node:assert`, `node:test`). No Babel, Webpack, Vitest, or Jest required.
3. **Isomorphic Core Decoupling**: Core modules run natively in standard Node.js (>=20.0.0) without DOM or Canvas. Browser platform adapters are verified through decoupled interface contracts and minimal mocking.
4. **Deterministic Reproducibility**: Physics and AI simulations are driven with fixed time steps ($\Delta t = 1/60\text{ s}$), ensuring bit-identical reproducibility across runs.
5. **Progressive Testability & Resilient Loader**: Tests support modular progressive verification, inspecting exported APIs when modules are implemented and reporting clear tier-by-tier execution logs.

---

## 2. Feature Inventory (F1 to F25) & Coverage Mapping

| Feature ID | Feature Name | Tier 1 (Features) | Tier 2 (Boundaries) | Tier 3 (Combinations) | Tier 4 (Scenarios) | Verification Anchor |
|:---:|:---|:---:|:---:|:---:|:---:|:---|
| **F1** | Core Game State & Serialization | `T1.1.1` - `T1.1.5` | `T2.1.1` - `T2.1.3` | `T3.1` | `T4.1`, `T4.4` | `src/core/state.js` |
| **F2** | Sub-stepped Physics Loop | `T1.2.1` - `T1.2.5` | `T2.2.1` - `T2.2.3` | `T3.2` | `T4.2` | `src/core/physics.js` |
| **F3** | Continuous Collision Detection (CCD) & Spatial Grid | `T1.3.1` - `T1.3.5` | `T2.3.1` - `T2.3.4` | `T3.3` | `T4.2`, `T4.5` | `src/core/physics.js` |
| **F4** | Variable Paddle Deflection | `T1.4.1` - `T1.4.5` | `T2.4.1` - `T2.4.4` | `T3.4` | `T4.2` | `src/core/physics.js` |
| **F5** | Corridor Ricochet & Anti-Stall | `T1.5.1` - `T1.5.5` | `T2.5.1` - `T2.5.4` | `T3.1`, `T3.5` | `T4.1`, `T4.2` | `src/core/physics.js` |
| **F6** | Multi-Tier Brick Destruction | `T1.6.1` - `T1.6.5` | `T2.6.1` - `T2.6.3` | `T3.1`, `T3.5` | `T4.1`, `T4.3` | `src/core/physics.js` |
| **F7** | Level 1: Central Chute | `T1.7.1` - `T1.7.5` | `T2.7.1` - `T2.7.2` | `T3.5` | `T4.1`, `T4.2` | `src/core/levels.js` |
| **F8** | Level 2: Dual Corridors | `T1.8.1` - `T1.8.5` | `T2.7.3` | `T3.5` | `T4.2`, `T4.3` | `src/core/levels.js` |
| **F9** | Level 3: City Matrix | `T1.9.1` - `T1.9.5` | `T2.7.4` | `T3.5` | `T4.3` | `src/core/levels.js` |
| **F10** | Level 4: Alpine Serpentine | `T1.10.1` - `T1.10.5` | `T2.7.5` | `T3.5` | `T4.3` | `src/core/levels.js` |
| **F11** | Level 5: The Gauntlet | `T1.11.1` - `T1.11.5` | `T2.7.6` | `T3.5` | `T4.3` | `src/core/levels.js` |
| **F12** | Level Manager & Progression | `T1.12.1` - `T1.12.5` | `T2.8.1` - `T2.8.3` | `T3.6` | `T4.1`, `T4.3` | `src/core/level_manager.js` |
| **F13** | Autonomous Bot Trajectory Raycaster | `T1.13.1` - `T1.13.5` | `T2.9.1` - `T2.9.3` | `T3.4` | `T4.2` | `src/core/bot.js` |
| **F14** | Bot Kinematic Intercept Steering | `T1.14.1` - `T1.14.5` | `T2.9.4` - `T2.9.6` | `T3.4`, `T3.7` | `T4.2` | `src/core/bot.js` |
| **F15** | Bot Toggle & Seamless Switching | `T1.15.1` - `T1.15.5` | `T2.10.1` - `T2.10.2`| `T3.7` | `T4.2` | `src/core/bot.js`, `engine.js` |
| **F16** | Game State Machine & Lifecycle | `T1.16.1` - `T1.16.5` | `T2.11.1` - `T2.11.4`| `T3.6`, `T3.8` | `T4.1`, `T4.4` | `src/core/engine.js` |
| **F17** | Decoupled Headless Simulation | `T1.17.1` - `T1.17.5` | `T2.12.1` - `T2.12.2`| `T3.2` | `T4.2` | `src/core/engine.js` |
| **F18** | HTML5 Canvas 2D Renderer Contract | `T1.18.1` - `T1.18.5` | `T2.13.1` - `T2.13.2`| `T3.9` | `T4.5` | `src/platform/browser/canvas_renderer.js` |
| **F19** | Browser Input & Touch Manager Contract | `T1.19.1` - `T1.19.5` | `T2.14.1` - `T2.14.3`| `T3.10` | `T4.5` | `src/platform/browser/input_manager.js` |
| **F20** | Procedural Web Audio Synth Contract | `T1.20.1` - `T1.20.5` | `T2.15.1` - `T2.15.2`| `T3.11` | `T4.5` | `src/platform/browser/audio_synth.js` |
| **F21** | Responsive Web App Shell Structure | `T1.21.1` - `T1.21.5` | `T2.16.1` - `T2.16.2`| `T3.12` | `T4.5` | `index.html`, `style.css` |
| **F22** | E2E Test Suite (Tiers 1-4) | Metatest (`test_runner.js`) | Metatest | Metatest | Metatest | `tests/e2e/test_runner.js` |
| **F23** | Level Integrity Validator Execution | `T1.23.1` - `T1.23.3` | `T2.7.1` - `T2.7.6` | `T3.5` | `T4.3` | `tests/level_validator.js` |
| **F24** | 3,000-Frame Bot Rally Benchmark | `T1.24.1` - `T1.24.3` | `T2.9.1` - `T2.9.6` | `T3.4`, `T3.7` | `T4.2` | `tests/bot_rally_benchmark.js` |
| **F25** | Full Integration & Verification | Runner Summary | Runner Summary | Runner Summary | Runner Summary | All suites passing |

---

## 3. Test Runner Invocation

### 3.1 Primary Master Runner
Run all 4 tiers with formatted color output, timing metrics, and exit status:
```bash
node tests/e2e/test_runner.js
```
Options:
- `--tier=1` : Run only Tier 1 feature tests
- `--tier=2` : Run only Tier 2 boundary tests
- `--tier=3` : Run only Tier 3 combination tests
- `--tier=4` : Run only Tier 4 scenario tests
- `--verbose` : Print granular test assertion details
- `--bail` : Stop execution on first failure

### 3.2 Native Node.js Test Runner
Run individual tier test files using Node's built-in test runner:
```bash
node --test tests/e2e/*.test.js
```

### 3.3 Exit Codes
- **0 (PASS)**: All executed test cases passed with zero errors.
- **1 (FAIL)**: One or more assertions failed or unhandled exceptions occurred.

---

## 4. Coverage Thresholds & Quality Gates

| Metric | Target Minimum | Invalidation Criteria |
|---|:---:|---|
| **Tier 1 Feature Tests** | $\ge 5$ tests per feature group | Any missing feature category or facade assertion |
| **Tier 2 Boundary Tests** | $\ge 5$ tests per boundary group | Missing extreme value checks ($\delta = \pm 1.0$, $v_{max}$, $dt$ clamp) |
| **Tier 3 Combination Tests** | $\ge 10$ interaction suites | Missing cross-module coupling checks |
| **Tier 4 Scenario Tests** | $\ge 5$ end-to-end full flows | Drop in 3,000-frame rally, failed level progression |
| **Overall Pass Rate** | **100%** | Any assertion failure triggers Exit Code 1 |
| **Execution Time** | $< 5.0\text{ seconds}$ total | Slow loops or inefficient collision broadphases |

---

## 5. Test Implementation File Map
- `tests/e2e/test_runner.js`: Master orchestrator, CLI parser, reporting formatter, exit code handler.
- `tests/e2e/tier1_features.test.js`: Feature-by-feature isolated happy path tests covering F1 through F21, F23, F24.
- `tests/e2e/tier2_boundaries.test.js`: Edge cases, numerical stability, extremes, null inputs, and boundary traps.
- `tests/e2e/tier3_combinations.test.js`: Cross-cutting multi-feature interactions.
- `tests/e2e/tier4_scenarios.test.js`: Realistic multi-step end-to-end game simulations.
