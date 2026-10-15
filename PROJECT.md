# Project: Brick Breaker Web Game

## Architecture
A decoupled, isomorphic architecture with zero external build/npm dependencies:
1. **Isomorphic Core (`src/core/`)**: Pure standard vanilla ES modules completely isolated from the browser DOM, window, Canvas, and Node globals. All core physics, state, levels, and bot logic execute natively both in modern browsers and headlessly in Node.js >= 20.
2. **Simulation & Data Flow**:
   - `GameState` is a plain, serializable JavaScript object capturing frame, status, paddle, balls, brick grid, score, lives, and statistics.
   - `PhysicsEngine` advances the simulation via fixed sub-stepping (8 sub-steps per frame), swept circle-AABB continuous collision detection (CCD), uniform 2D spatial grid indexing, variable paddle angle deflection, and anti-stall corridor velocity clamping.
   - `BotController` executes analytical trajectory raycasting with folded reflection math and obstacle lookahead to steer the paddle with >=95% deflection accuracy.
   - `GameEngine` coordinates the state machine (`READY`, `PLAYING`, `PAUSED`, `LEVEL_CLEAR`, `GAME_OVER`, `VICTORY`), input action integration, and event dispatch.
3. **Platform Adapters (`src/platform/browser/`)**:
   - `CanvasRenderer`: High-performance 2D Canvas rendering matching TikTok vertical portrait aspect ratio (9:16), neon glowing effects, particle bursts, and HUD.
   - `InputManager`: Captures Keyboard (Arrows/WASD, Space, B, P, R) and Mouse/Touch events into normalized `InputAction` structures.
   - `AudioSynth`: Procedural Web Audio API sound generator (zero audio asset files).
   - `main.js`: Browser entry point wiring the loop with `requestAnimationFrame`.
4. **Verification Track (`tests/`)**:
   - Headless 3,000-frame Bot Rally Benchmark (`tests/bot_rally_benchmark.js`).
   - Level Integrity Validator (`tests/level_validator.js`).
   - Unit tests for physics, CCD, and state machine (`tests/physics.test.js`, `tests/engine.test.js`).
   - E2E Test Suite (`tests/e2e/`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Core Game State & Serialization | Plain serializable GameState schema, clone, serialize, and deserialize methods | M1 | Survey (explorer_2, spec_miner_1) |
| F2 | Sub-stepped Physics Loop | Subdivides tick into 8 micro-steps to prevent tunneling at high velocities | M1 | Survey (all) |
| F3 | Continuous Collision Detection (CCD) & Spatial Grid | Swept circle vs Minkowski AABB and uniform 2D grid index for O(1) collision queries | M1 | Survey (all) |
| F4 | Variable Paddle Deflection | Maps contact offset u in [-1, 1] to deflection angle theta up to 60 deg with speed preservation | M1 | Survey (all) |
| F5 | Corridor Ricochet & Anti-Stall | Rapid chute reflections with minimum vertical speed enforcement (|vy| >= 0.2*|v|) | M1 | Survey (all) |
| F6 | Multi-Tier Brick Destruction | Normal, Reinforced (2-hit), Titanium (3-hit), Indestructible Chute Wall, Booster, Bomb, plus extension types ×2 and +3 | M1 + Extension | `src/config.js`, `src/core/physics.js` |
| F7 | Level 1: Central Chute | TikTok reference match: dense 32x44 matrix with central indestructible chute | M2 | Survey (spec_miner_1, explorer_3) |
| F8 | Level 2: Dual Corridors | Twin vertical chutes flanking a reinforced central bastion | M2 | Survey (spec_miner_1, explorer_3) |
| F9 | Level 3: City Matrix | Intersecting vertical and horizontal express shafts dividing field into 9 blocks | M2 | Survey (spec_miner_1, explorer_3) |
| F10 | Level 4: Alpine Serpentine | Zig-zag switchback tunnel across 3 tiers of dense matrix | M2 | Survey (spec_miner_1, explorer_3) |
| F11 | Level 5: The Gauntlet | Triple micro-chutes with fortified core and 1,200+ breakable bricks | M2 | Survey (spec_miner_1, explorer_3) |
| F12 | Level Manager & Progression | Grid generation, level loading, brick counts, transition on clearing breakables | M2 | Survey (all) |
| F13 | Autonomous Bot Trajectory Raycaster | Predictive forward raycaster with folded arena boundary reflections | M3 | Survey (all) |
| F14 | Bot Kinematic Intercept Steering | Proportional steering at max speed with deadband to eliminate chatter (>=95% deflection) | M3 | Survey (all) |
| F15 | Bot Toggle & Seamless Switching | Hotkey 'B' and UI toggle without resetting ball, paddle, or game state | M3 | Survey (all) |
| F16 | Game State Machine & Lifecycle | State transitions: READY, PLAYING, PAUSED, LEVEL_CLEAR, GAME_OVER, VICTORY | M3 | Survey (all) |
| F17 | Decoupled Headless Simulation | GameEngine.tick(dt, input) callable without DOM/Canvas dependencies | M3 | Survey (all) |
| F18 | HTML5 Canvas 2D Renderer | Crisp 60 FPS portrait rendering, particle bursts, neon palette, HUD overlays | M4 | Survey (explorer_2, spec_miner_1) |
| F19 | Browser Input & Touch Manager | Keyboard (WASD/Arrows/Space/B/P/R) and Mouse/Touch tracking | M4 | Survey (explorer_2, spec_miner_1) |
| F20 | Procedural Web Audio Synth | Zero-asset Web Audio API sound synthesis for bounces, breaks, and fanfares | M4 | Survey (all) |
| F21 | Responsive Web Application Shell | index.html and style.css providing mobile 9:16 aspect container and UI overlays | M4 | Survey (all) |
| F22 | E2E Test Suite (Tiers 1-4) | Comprehensive opaque-box test suite (Tier 1-4) covering all features | E2E_TEST | Survey & Methodology |
| F23 | Level Integrity Validator | Structural checks for all ten maps plus actual ball-clearance reachability for the five challenge maps | M5 + Extension | `tests/level_validator.js` |
| F24 | 3,000-Frame Bot Rally Benchmark | Headless benchmark running 3,000 frames on Levels 1 & 2 asserting 0 drops and >=95% deflection | M5 | Survey (all) |
| F25 | Full Integration & Verification | 100% pass of unit tests, benchmarks, and E2E test suite | M5 | Survey & Pattern |
| F26 | Bot Challenge Campaign | Five additional armored maps (L6–L10), with radius-aware wall reachability validation and dynamic browser selection | Extension | `src/core/levels.js`, `tests/level_validator.js` |
| F27 | ×2 and +3 Multiball | Brick types 7/8 activate on direct or bomb destruction; unique IDs, deferred births, configurable 32-ball cap, and last-ball life accounting | Extension | `src/config.js`, `src/core/physics.js`, `tests/multiball.test.js` |
| F28 | Multiball Presentation & Campaign Verification | Distinct brick glyphs/colors, live ball count, powerup notices/audio, ten-map bot smoke benchmark, dynamic final-level tests | Extension | `src/platform/browser/`, `tests/bot_campaign_benchmark.js` |
| F29 | Seeded Procedural Maps | 14 motifs x 3 symmetries x 9 structures, bombs/powerups/shields, palettes with per-cell tints; connectivity repair plus clearance validation; deterministic by seed | Random Maps | `src/core/map_generator.js`, `src/core/rng.js`, `src/core/map_theme.js`, `src/core/clearance.js` |
| F30 | Endless Random Runs | `MapSequence` never repeats a fingerprint and avoids recent motifs/palettes/recipes; engine generates the next map on clear; browser menu, N hotkey, `?seed=&difficulty=&bot=&fixed=` | Random Maps | `src/core/engine.js`, `src/platform/browser/main.js` |
| F31 | Chain Bombs, Shield Bricks, Seeker Finish | Delayed bomb cascades (fuses in state), brick type 9 energy floor, wall-aware homing on the last bricks or after a stall | Random Maps | `src/core/physics.js`, `src/config.js` |
| F32 | Themed Rendering & Juice | Palette bricks shaded by armor, brick pop, blast rings, screen shake, shield floor, seeker balls, progress bar, map title card, audio voice budget | Random Maps | `src/platform/browser/` |
| F33 | Headless Autoplay & Map Lab | `simulateLevel` bot runs, PNG previews, CLI with clear-time vetting and cross-run history, generated-map benchmark | Random Maps | `src/core/autoplay.js`, `tools/`, `tests/generated_maps_benchmark.js` |

## Milestones
The milestones below record the original five-map release. F26–F28 describe the ten-map and multiball extension; current validation commands are in README.md.

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Physics & State Engine | F1, F2, F3, F4, F5, F6 (`src/core/state.js`, `src/core/physics.js`, `src/config.js`, `package.json`) | none | DONE (31/31 physics unit tests pass) |
| M2 | Dense Level Suite & Manager | F7, F8, F9, F10, F11, F12 (`src/core/levels.js`, `src/core/level_manager.js`) | none | DONE (37,562 assertions pass in validator) |
| M3 | Autonomous Bot & GameEngine | F13, F14, F15, F16, F17 (`src/core/bot.js`, `src/core/engine.js`) | M1, M2 | DONE (34/34 engine tests pass, 113/113 total unit tests pass) |
| M4 | Browser Platform & UI Shell | F18, F19, F20, F21 (`src/platform/browser/*`, `index.html`, `style.css`) | M3 | DONE (HTML5 Canvas 2D + Web Audio synth + HUD) |
| E2E | E2E Testing Suite Track | F22 (`tests/e2e/*`, `TEST_INFRA.md`, `TEST_READY.md`) | none (opaque-box) | DONE (93/93 tests pass across 4 tiers) |
| M5 | Verification & E2E Acceptance | F23, F24, F25 (`tests/bot_rally_benchmark.js`, `tests/level_validator.js`, 100% E2E test pass) | M4, E2E | DONE (3,000 frames simulated, 0 drops, 100% deflection, gate PASS) |

## Interface Contracts

### GameState Data Schema (`src/core/state.js`)
```javascript
export function createInitialState(config, levelDef);
export function cloneState(state);
export function serializeState(state);
export function deserializeState(jsonStr);
```

### Physics Engine (`src/core/physics.js`)
```javascript
export function stepPhysics(state, inputAction, dt, config);
// Returns array of events: [{ type: 'BRICK_HIT', brick, ball }, { type: 'PADDLE_HIT', ball }, { type: 'BALL_LOST', ball }, ...]
```

### Level Manager (`src/core/level_manager.js`)
```javascript
export class LevelManager {
  constructor(levels);
  getLevel(index);
  getLevelCount();
  buildGridForLevel(index, config);
}
```

### Bot Controller (`src/core/bot.js`)
```javascript
export function computeBotAction(state, dt, config);
// Returns InputAction: { moveLeft, moveRight, targetX, launchBall, toggleBot, togglePause, restart }
```

### Game Engine (`src/core/engine.js`)
```javascript
export class GameEngine {
  constructor(config);
  loadLevel(index);
  restartLevel();
  restartGame();
  togglePause();
  toggleBot();
  setBotActive(bool);
  launchBall();
  tick(dt, externalInput); // Returns { state, events }
  getState();
}
```

## Code Layout
```
/root/teamwork_projects/brick_breaker/
├── package.json
├── index.html
├── style.css
├── src/
│   ├── config.js
│   ├── core/
│   │   ├── state.js
│   │   ├── physics.js
│   │   ├── levels.js
│   │   ├── level_manager.js
│   │   ├── bot.js
│   │   └── engine.js
│   └── platform/
│       └── browser/
│           ├── main.js
│           ├── canvas_renderer.js
│           ├── input_manager.js
│           └── audio_synth.js
├── tests/
│   ├── physics.test.js
│   ├── engine.test.js
│   ├── level_validator.js
│   ├── bot_rally_benchmark.js
│   └── e2e/
│       ├── test_runner.js
│       ├── tier1_features.test.js
│       ├── tier2_boundaries.test.js
│       ├── tier3_combinations.test.js
│       └── tier4_scenarios.test.js
├── PROJECT.md
├── TEST_INFRA.md
└── TEST_READY.md
```
