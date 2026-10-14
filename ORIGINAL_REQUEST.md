# Original User Request

## Initial Request — 2026-10-14T13:22:57Z

A lightweight, high-performance Brick Breaker web game featuring dense and challenging level designs with narrow vertical corridors (TikTok-style satisfying gameplay), playable manually and with an autonomous bot paddle that tracks and deflects balls accurately.

Working directory: ~/teamwork_projects/brick_breaker
Integrity mode: development

## Requirements

### R1. Core Game Engine & Physics (Web Canvas)
Implement a self-contained, lightweight Brick Breaker game in HTML5 Canvas and vanilla JavaScript. The game must feature continuous real-time physics, paddle movement (keyboard/mouse), ball trajectory reflection with variable angle deflection depending on paddle contact point, collision detection against bricks and walls, brick destruction, and game state management (lives, score, level progression, game over / victory).

### R2. Dense Level Design with Narrow Chutes & Corridors
Create a suite of diverse, high-difficulty levels featuring dense brick grids punctuated by narrow vertical/horizontal shafts and chokepoints (matching the reference video style). When a ball penetrates a narrow corridor, it must ricochet rapidly to clear paths in a satisfying manner. Include a level selector and progression system.

### R3. Automated Bot Player Mode
Provide an automated bot player that predicts ball landing positions and steers the paddle to maintain continuous rallies. The bot must handle multi-angle bounces from narrow corridors and support toggling between manual player mode and bot auto-play mode via a simple UI control or hotkey.

### R4. Lightweight & Modular Architecture
Keep the codebase minimal with zero external build dependencies or heavy libraries. Maintain clean separation between the game simulation state, physics, rendering, and input/bot control so that the game state can easily be serialized, tested headlessly, or extended in future iterations (such as gameplay recording or cloud execution).

## Verification Resources

- **Automated Bot Rally Benchmark**: A headless or in-browser automated verification test that simulates 3,000 game frames with the bot active on Level 1 and Level 2, ensuring zero dropped balls and successful brick destruction.
- **Level Integrity Validator**: A test script verifying that all level definitions load correctly, contain valid brick layouts with defined corridor gaps, and initialize without runtime exceptions.

## Acceptance Criteria

### Engine & Visuals
- [ ] Game runs in standard modern web browsers via a local web server or file URL at a consistent 60 FPS without memory leaks.
- [ ] Ball collision physics with paddle, borders, and bricks function reliably without the ball clipping through objects or getting stuck inside brick grids.

### Levels & Difficulty
- [ ] At least 5 distinct, pre-crafted dense levels featuring narrow corridors and high brick density inspired by the reference image.
- [ ] Level progression correctly transitions to the next level upon clearing all breakable bricks, and displays a victory screen upon completing all levels.

### Autonomous Bot
- [ ] Bot auto-play mode can be toggled on/off at any time during gameplay without resetting the game state.
- [ ] Bot achieves at least 95% deflection success rate over a continuous 3-minute rally across standard dense levels.

### Code Quality & Portability
- [ ] Entire game is pure client-side HTML, CSS, and vanilla JavaScript with zero third-party npm runtime dependencies.
- [ ] Game state and tick logic are decoupled from rendering, enabling headless simulation execution for verification tests.
