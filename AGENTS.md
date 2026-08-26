# Incasters - Developer & Agent Guide

This document captures the architecture, codebase responsibilities, build pipelines, and testing procedures for **Incasters**, a 3D isometric curved-shot arena battler built with Three.js, TypeScript, Vite, and Capacitor.

## Tech Stack & Architecture
- **Rendering:** Three.js (WebGLRenderer, custom shaderless low-poly meshes, Orthographic Isometric camera, custom sky dome, and particle systems).
- **Game Engine:** Custom tick-based update loop inside `src/engine/Game.ts`.
- **Physics:** Circle-vs-Circle and Circle-vs-AABB intersection math (`src/engine/Physics.ts`).
- **Entity System:** Base class `Entity` with subclasses `Caster` (player + bots), `Bot` (AI controller), `Projectile`, and `PowerUp`.
- **Game Modes:** Battle Royale (Last Caster Standing with shrinking storm), Team Battle (TDM to 10 kills), and Gold Rush (collect and bank 50 coins to win) (`src/world/GameModes.ts`).
- **Cosmetics & Progression:** Local progression tracking XP/levels, tokens, daily/weekly challenges, and shop unlocks persisted to `localStorage` (`src/game/Progression.ts` and `src/game/CharacterConfig.ts`).
- **Difficulty System:** Four bot AI difficulty presets (Easy/Normal/Hard/Insane) tuning speed, fire rate, aim error, dodge chance, aggression, and health (`src/game/Difficulty.ts`).
- **LAN Multiplayer:** Host-authoritative WebSocket server (`server/lan-server.js`) with client networking layer (`src/net/LanClient.ts`). Host runs the full simulation and broadcasts state at 20 Hz; clients send input and render snapshots.
- **Platform Portability:** Capacitor (`capacitor.config.ts`) handles wrapping for Android deployment.

## Development & Build Commands

```bash
# 1. Install dependencies
npm install

# 2. Start local Vite development server (port 5173)
npm run dev

# 3. Compile TypeScript & build production assets
npm run build

# 4. Run full test suite (Unit tests + 10-module Automated Quality Assurance Suite)
npm test

# 5. Run only Node TS unit tests (Physics, Progression, AI Difficulty, Trials, Networking)
npm run test:unit

# 6. Run headless Automated Quality Assurance Suite (Full 10 modules + 60fps benchmark)
npm run test:cert

# 7. Start the LAN multiplayer WebSocket server (port 7070)
npm run lan-server
```

## Automated Quality Assurance & Testing Architecture

Incasters features a comprehensive testing architecture composed of two complementary layers:

### 1. Isolated Unit Test Suite (`test/unit/` - `npm run test:unit`)
- Fast TypeScript/Node unit test runners verifying mathematical invariants, entity schemas, and core game logic in isolation without browser overhead:
  - `physics.test.ts`: Screen-to-world isometric projections, circle-vs-circle and circle-vs-AABB intersections, bounce reflection angles.
  - `difficulty.test.ts`: Bot AI scaling multipliers (Easy/Normal/Hard/Insane) and corrupted storage fallback.
  - `progression.test.ts`: XP level curves, token reward economy, daily/weekly challenges, Trickshot star counts.
  - `trials.test.ts`: Structural integrity of all 11 stages (Stages 0 to 10), par shot targets, obstacles, and moving target dummies.
  - `character-config.test.ts`: Robes, hats, bursts, weapons catalog validation and local storage schema resilience.
  - `networking.test.ts`: Room code generation, sanitization, and P2P peer descriptors.

### 2. Automated Quality Assurance Suite (`test/cert/` - `npm run test:cert`)
A 10-module headless quality assurance runner (`test/cert/certification-suite.js`) using `puppeteer-core` with cross-platform Chrome/Chromium discovery (`test/cert/browser-launcher.js`) and software WebGL (SwiftShader):
- **Module 1 - Cold Boot & Assets:** Measures cold start boot time, verifies Web Audio synth initialization, and guarantees 0 network 404s.
- **Module 2 - UI & Modals:** Tests all sub-modal open/close cycles (Shop, Trials, Challenges, Multiplayer) and ensures mobile touch HUD controls are hidden in menus.
- **Module 3 - Game Modes:** End-to-end simulation across Battle Royale (shrinking storm + spectator mode), Team Battle (4v4 scoring + respawns), Gold Rush (coin spawning & vault banking), King of the Cauldron (zone capture & hill points), and all 11 Trickshot Trial stages.
- **Module 4 - Arenas & Hazards:** Renders and verifies all 5 arenas (Courtyard, Colosseum, Chamber, Observatory, Catacombs) with interactive hazard objects.
- **Module 5 - Combat Physics & Fusions:** Simulates real-time curved projectile steering, dodge-dashes, and invulnerability cooldowns.
- **Module 6 - Bot AI Matrix:** Validates live instantiation and parameter application for all 4 difficulty levels.
- **Module 7 - Multiplayer:** Verifies LAN WebSocket panels and P2P WebRTC room code generation and lobby readiness.
- **Module 8 - Options & WebGL Resilience:** Tests audio muting on focus/blur, HUD scale DOM persistence, and WebGL Context Lost / Restored resilience.
- **Module 9 - Multi-Viewport Matrix:** Renders and validates 16:9, 21:9 Ultrawide, 4:3 Tablet, 19.5:9 Mobile Landscape, and 9:19.5 Mobile Portrait viewports.
- **Module 10 - Performance & Leak Audit:** 60 FPS combat simulation benchmark, 99th percentile frame times, and 5 consecutive match cycle creation/disposal memory leak audit.

Outputs structured reports to `certification-report.json`, `certification-report.md`, and visual proof screenshots in `screenshots/cert/`.

### 3. GitHub Actions CI/CD Quality Gate
Every push to `main`, pull request, or release tag runs `certification-quality-gate` on `ubuntu-latest` before any Android APK, Windows portable EXE, or Firebase Web builds are triggered. A failure in any unit test or certification module instantly halts the pipeline, preventing broken releases.

---

## Codebase Map
- `src/main.ts`: Glue code linking the HTML overlays, progression state, character preview renderer, and `Game` instantiation.
- `src/engine/Game.ts`: The main orchestrator of the game loop, render ticks, camera tracking with screen-shake, sound triggers, and collision dispatch.
- `src/engine/AimVisualizer.ts`: 3D real-time trajectory aim guide, ground targeting reticle, and curved projectile guidance beam visualizer.
- `src/engine/Physics.ts`: Pure geometric collision resolution and isometric screen-to-world coordinate transforms (`screenToWorldIso`, `screenAngleToWorldIso`).
- `src/engine/InputManager.ts`: Keyboard, mouse, and Gamepad polling layer.
- `src/entities/Caster.ts`: Wizard avatar representation (draws robes, hats, eye-glow, active spells, and power-up stack multipliers).
- `src/entities/Bot.ts`: Automated bot AI utilizing prediction, dodging vectors, power-up hunting, and curved shooting offsets.
- `src/entities/Projectile.ts`: Flying spell bullets with guiding curve vectors, wall-running tangent glide, pierces, and splits.
- `src/world/Arena.ts`: Arena wall boundaries (AABB) construction, floor grids, and dynamic hazard spawn logic.
- `src/world/GameModes.ts`: Implements rule engines, respawn countdowns, storm boundaries, coin mechanics, and bank zone control.
- `src/game/Difficulty.ts`: Four difficulty presets (Easy/Normal/Hard/Insane) that tune bot AI parameters. Persisted to `localStorage`.
- `src/net/LanClient.ts`: WebSocket client and lightweight state renderer for LAN multiplayer. Includes `ClientGameRenderer` for client-side rendering without local simulation.
- `server/lan-server.js`: Standalone WebSocket server for LAN multiplayer matchmaking and message routing.
- `.github/workflows/build-apk.yml`: Automated CI/CD GitHub Actions workflow running tests/certification and building/releasing Android APK, Windows EXE, and Firebase Web Hosting builds on push to main or release tags.

## Security & Game-Feel Notes
- **Isometric Aiming & Movement Parity:** Screen-space touch joysticks, keyboard WASD, and gamepad sticks are transformed into isometric simulation coordinates via `screenToWorldIso()`, eliminating the 45° rotation offset and making controls directly track what players see on their screens.
- **3D Trajectory Aim Guide & Aim Assist:** Real-time dashed laser guide and landing reticle projected onto the 3D ground, with subtle magnetic aim assist for touch screens and controllers.
- **Kill-feed XSS hardening:** `src/engine/Fx.ts` constructs kill-feed entries with the DOM API (`textContent` + `appendChild`) and a `sanitizeColor` allow-list instead of `innerHTML` string interpolation, so future custom player names/colours cannot inject markup or rogue CSS.
- **Aim-direction camera lead:** The isometric camera subtly shifts its look-target a few units in the player's aim/facing direction, mirroring the Outcasters camera that "provides more visibility in whichever direction you're facing."
- **Input parity:** Keyboard+mouse, dual-stick gamepad (triggers/face buttons fire, bumpers/B dash, D-pad fallback, rumble haptics), and twin virtual touch joysticks all feed into the same movement/aim/fire pipelines.
