# Incasters - Developer & Agent Guide

This document captures the architecture, codebase responsibilities, build pipelines, and testing procedures for **Incasters**, a 3D isometric curved-shot arena battler built with Three.js, TypeScript, Vite, and Capacitor.

## Tech Stack & Architecture
- **Rendering:** Three.js (WebGLRenderer, custom shaderless low-poly meshes, Orthographic Isometric camera, custom sky dome, and particle systems).
- **Game Engine:** Custom tick-based update loop inside `src/engine/Game.ts`.
- **Physics:** Circle-vs-Circle and Circle-vs-AABB intersection math (`src/engine/Physics.ts`).
- **Entity System:** Base class `Entity` with subclasses `Caster` (player + bots), `Bot` (AI controller), `Projectile`, and `PowerUp`.
- **Game Modes:** Battle Royale (Last Caster Standing with shrinking storm), Team Battle (TDM to 10 kills), and Gold Rush (collect and bank 50 coins to win) (`src/world/GameModes.ts`).
- **Cosmetics & Progression:** Local progression tracking XP/levels, tokens, daily challenges, and shop unlocks persisted to `localStorage` (`src/game/Progression.ts` and `src/game/CharacterConfig.ts`).
- **Platform Portability:** Capacitor (`capacitor.config.ts`) handles wrapping for Android deployment.

## Development & Build Commands

```bash
# 1. Install dependencies
npm install

# 2. Start local Vite development server (port 5173)
npm run dev

# 3. Compile TypeScript & build production assets
npm run build

# 4. Preview production build locally
npm run preview
```

## Running Automated Gametests

We have integrated an automated, headless end-to-end gametesting script (`test-game.js`) that uses `puppeteer-core` to verify the game loop, menus, customization shop, and active battles without needing local admin rights or a manual browser window.

```bash
# Execute the automated gametest
node test-game.js
```

### What the test script verifies:
1. Launches the system's Google Chrome headlessly.
2. Navigates to `http://localhost:5173/`.
3. Verifies Main Menu visibility and clicks to select a custom robe color and wizard hat style.
4. Changes the game mode to **Team Battle** and the arena to **Neon Chamber**.
5. Clicks "START BATTLE" to enter the match.
6. Simulates active gameplay for 10 seconds (transmitting keyboard movement controls and dodge-dashes).
7. Verifies the HUD and leaderboard render correctly and update player stats in real-time.
8. Asserts that **zero uncaught exceptions or JavaScript errors** are thrown.
9. Automatically captures and saves two high-quality PNG screenshots:
   - `menu_screenshot.png`: Main Menu preview.
   - `battle_screenshot.png`: In-game 3D combat preview.

---

## Codebase Map
- `src/main.ts`: Glue code linking the HTML overlays, progression state, character preview renderer, and `Game` instantiation.
- `src/engine/Game.ts`: The main orchestrator of the game loop, render ticks, camera tracking with screen-shake, sound triggers, and collision dispatch.
- `src/engine/Physics.ts`: Pure geometric collision resolution.
- `src/engine/InputManager.ts`: Keyboard, mouse, and Gamepad polling layer.
- `src/entities/Caster.ts`: Wizard avatar representation (draws robes, hats, eye-glow, active spells, and power-up stack multipliers).
- `src/entities/Bot.ts`: Automated bot AI utilizing prediction, dodging vectors, power-up hunting, and curved shooting offsets.
- `src/entities/Projectile.ts`: Flying spell bullets with guiding curve vectors, wall-running tangent glide, pierces, and splits.
- `src/world/Arena.ts`: Arena wall boundaries (AABB) construction, floor grids, and dynamic hazard spawn logic.
- `src/world/GameModes.ts`: Implements rule engines, respawn countdowns, storm boundaries, coin mechanics, and bank zone control.

## Security & Game-Feel Notes
- **Kill-feed XSS hardening:** `src/engine/Fx.ts` constructs kill-feed entries with the DOM API (`textContent` + `appendChild`) and a `sanitizeColor` allow-list instead of `innerHTML` string interpolation, so future custom player names/colours cannot inject markup or rogue CSS.
- **Aim-direction camera lead:** The isometric camera subtly shifts its look-target a few units in the player's aim/facing direction, mirroring the Outcasters camera that "provides more visibility in whichever direction you're facing."
- **Input parity:** Keyboard+mouse, dual-stick gamepad (triggers/face buttons fire, bumpers/B dash, D-pad fallback, rumble haptics), and twin virtual touch joysticks all feed into the same movement/aim/fire pipelines.
