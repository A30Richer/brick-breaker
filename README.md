# 🧱 Brick Breaker — Chute & Corridor Arcade

A lightweight, high-performance Brick Breaker web game built with **Pure HTML5 Canvas and Vanilla JavaScript (Zero Runtime Dependencies)**. Featuring dense, challenging level designs with narrow vertical corridors inspired by viral satisfying brick-breaker gameplay, paired with an autonomous predictive AI bot.

---

## 🌟 Key Features

- **🎮 Satisfying Corridor Gameplay**: Balls penetrate narrow 15px vertical/horizontal chutes flanked by indestructible slate walls, triggering rapid, high-speed ricochets that clear dense brick vaults.
- **🤖 Autonomous AI Bot (Hotkey: `B`)**: Built-in predictive bot using analytical trajectory raycasting, modular wall reflection folding, and obstacle lookahead micro-simulation. Achieves a **100% deflection rate** across 3,000+ benchmark frames.
- **⚡ Ultra Lightweight & High Performance**: 60 FPS silky smooth gameplay in modern browsers with zero third-party npm runtime dependencies. Headless simulation throughput exceeds **14,000 FPS**.
- **🔊 Procedural Web Audio API**: Dynamic retro sound synthesizer generating sound effects for wall bounces, brick destruction, chute ricochets, bomb explosions, and victory fanfares without external audio files.
- **💥 Multi-Tier Brick Physics**:
  - **Amber (1 Hit)**: Standard breakable brick.
  - **Orange (2 Hits)**: Reinforced brick.
  - **Crimson (3 Hits)**: Titanium armor brick.
  - **Slate (Indestructible)**: Guide rails and corridor walls.
  - **Cyan (+15% Speed)**: Speed booster trigger.
  - **Purple (Bomb)**: 3x3 explosive blast radius.
- **☁️ Cloud & Colab Ready**: Clean decoupled architecture separating game simulation/physics state from canvas rendering, making it straightforward to run headless on Google Colab or connect automated gameplay recorders.

---

## 🕹️ Controls & Hotkeys

| Action | Control / Hotkey |
|---|---|
| **Steer Paddle** | Mouse slide, Touch drag, <kbd>←</kbd> / <kbd>→</kbd>, or <kbd>A</kbd> / <kbd>D</kbd> |
| **Launch Ball** | <kbd>Space</kbd>, Mouse Click, or Tap Screen |
| **Toggle AI Bot** | <kbd>B</kbd> or Click **AI BOT** button |
| **Pause / Resume** | <kbd>P</kbd> or <kbd>Esc</kbd> |
| **Restart Level** | <kbd>R</kbd> |
| **Mute / Unmute** | <kbd>M</kbd> |
| **Select Level** | Dropdown menu (L1 to L5) |

---

## 🗺️ Levels & Level Design

1. **Level 1: The Central Chute**: Matches the reference video layout with a narrow central vertical shaft leading into a massive top brick vault.
2. **Level 2: Dual Corridors & Twin Bastions**: Twin vertical express chutes flanking a heavily fortified center stronghold.
3. **Level 3: The City Matrix**: A dense grid of intersecting vertical and horizontal shafts connecting four major junction plazas.
4. **Level 4: The Alpine Serpentine**: A challenging 3-tier S-curve switchback tunnel with 180° turnaround pockets.
5. **Level 5: The Gauntlet**: Triple micro-chutes, heavy ablative titanium plating, and core bomb pockets.

---

## 🚀 Quick Start

### 1. Direct Browser Play
Simply open `index.html` in any modern web browser:
```bash
# On Linux / macOS / Windows
open index.html   # or xdg-open index.html
```

### 2. Local HTTP Server
Run a lightweight local HTTP server (using Python or Node):
```bash
# Using Python 3
python3 -m http.server 8080

# Or using Node http-server / serve
npx serve .
```
Then navigate to `http://localhost:8080` in your browser.

---

## 🧪 Testing & Verification

The project includes an extensive test suite with zero test dependencies:

```bash
# 1. Run the 3,000-Frame Autonomous Bot Rally Benchmark
node tests/bot_rally_benchmark.js

# 2. Run the Level Integrity Validator (37,500+ geometric assertions)
node tests/level_validator.js

# 3. Run all Unit & Adversarial Physics Tests (113 tests)
node --test tests/*.test.js

# 4. Run the 4-Tier E2E Test Suite (93 tests)
node tests/e2e/test_runner.js
```

---

## 📁 Project Structure

```
brick_breaker/
├── index.html                 # Main web arcade interface
├── style.css                  # Responsive arcade styling & dark theme
├── package.json               # Project metadata & test script
├── README.md                  # Project documentation
├── src/
│   ├── config.js              # Global physics and game constants
│   ├── core/
│   │   ├── bot.js             # Autonomous trajectory raycasting bot
│   │   ├── engine.js          # Isomorphic decoupled game engine
│   │   ├── level_manager.js   # Level progression and state tracking
│   │   ├── levels.js          # High-density level matrices (L1–L5)
│   │   ├── physics.js         # Continuous collision detection (CCD) & math
│   │   └── state.js           # Immutable state management & serialization
│   └── platform/
│       └── browser/
│           ├── audio_synth.js     # Web Audio API sound generator
│           ├── canvas_renderer.js # 60 FPS HTML5 Canvas renderer
│           ├── input_manager.js   # Keyboard, mouse, touch handler
│           └── main.js            # Browser entry point
└── tests/                     # Comprehensive test & benchmark suites
```

---

## 📄 License
MIT License
