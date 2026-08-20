# 🧙‍♂️ Incasters

[![Build & Release Android + Windows](https://github.com/BjornBrorsson/Incasters/actions/workflows/build-apk.yml/badge.svg)](https://github.com/BjornBrorsson/Incasters/actions/workflows/build-apk.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r160+-black.svg)](https://threejs.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-7.x-119EFF.svg)](https://capacitorjs.com/)

> **Incasters** is a fast-paced 3D isometric arena battler and curved-shot shooter inspired by the Stadia-exclusive *Outcasters*. Battle against intelligent bots or local friends in vibrant neon arenas, curving your magical spells in mid-air around walls and hazards!

---

## ✨ Features

### 🔮 Dynamic Curved-Shot Mechanics
- **Mid-Air Projectile Steering:** Bend and curve fireballs around corners and solid obstacles in real-time.
- **3D Trajectory Aim Guide:** Glowing laser guide and landing reticle projected onto the 3D ground.
- **Smart Aim Assist:** Gentle magnetic lock for smooth, responsive twin-stick combat on mobile and gamepads.

### 🎮 Game Modes
- 👑 **Battle Royale (Last Caster Standing):** Outlast all other wizards as the shrinking Ring of Doom closes in.
- ⚔️ **Team Battle (4v4 TDM):** Team deathmatch with high-contrast red vs. blue robes; first to 10 kills wins.
- 🪙 **Gold Rush:** Collect glowing gold coins across the arena and bank them in the central portal (first to 50 coins wins).

### 🏟️ Interactive Arenas & Hazards
- **3 Distinct Maps:**
  - *Neon Arena* (Medium balanced arena)
  - *The Colosseum* (Sprawling large arena)
  - *Neon Chamber* (Fast-paced compact layout)
- **Dynamic Mechanics:** Sliding neon gates, jump pads for aerial launches, shooting statue hazards, and reflective bounce barriers.

### ⚡ Power-Up Stacking System
Combine and stack multiple spells to create wild projectile builds:
- 💥 **Split:** Breaks your shot into a multi-projectile spread fan.
- 🔁 **Bounce:** Projectiles ricochet off walls and obstacles.
- 🎯 **Pierce:** Punches straight through enemy casters.
- 🏃 **Haste:** Drastically increases spell velocity and fire rate.
- 🛡️ **Shield:** Summons an arcane energy sphere to absorb incoming damage.
- ❄️ **Freeze:** Chills targets on impact, slowing their movement speed.
- 🌀 **Wall-Run:** Fireballs hug and glide along perimeter walls.

### 🎨 7-Part Wizard Customizer
Customize your caster with real-time 3D preview in the main menu:
- **Robe & Spell Colors:** Neon Pink, Cyan, Sage, Arcane Gold, Violet, and more.
- **Eye Glow & Hair Styles:** Glowing neon eyes and customizable hair.
- **Hats & Facegear:** Wizard Hat, Top Hat, Crown, Horns, Glasses, Monocle, Beard, and Masks.
- **Weapons:** Arcane Staff, Wand, Broadsword, and Scythe.

### 🤖 Adaptive AI & Bot Difficulty
Four difficulty presets that tune aim error, prediction, dodging reflexes, and power-up hunting:
- **Easy** (Relaxed practice)
- **Normal** (Balanced casual play)
- **Hard** (Competitive dodging & shot curving)
- **Insane** (Relentless flanking & near-instant reflexes)

### 🌐 LAN Multiplayer
- Host-authoritative WebSocket architecture (`server/lan-server.js`).
- Host simulates full 3D physics and broadcasts snapshots at 20 Hz; clients send inputs and interpolate state.

---

## 🕹️ Controls

| Action | Keyboard & Mouse | Gamepad / Controller | Mobile Touch |
| :--- | :--- | :--- | :--- |
| **Move** | `W` `A` `S` `D` / Arrow Keys | Left Analog Stick / D-Pad | Left Virtual Joystick |
| **Aim** | Mouse Cursor | Right Analog Stick | Right Virtual Joystick |
| **Cast Spell** | Left Mouse Click | `RT` / `LT` / `A` Button | Dedicated Fire Button / Right Stick Drag |
| **Curve Shot** | Move Cursor / `Q` `E` | Right Stick Direction | Drag Right Stick |
| **Dodge Dash** | `Spacebar` | `B` Button / `RB` / `LB` | Dedicated Dash Button / Dash Circle |

---

## 🛠️ Tech Stack & Architecture

- **Rendering Engine:** [Three.js](https://threejs.org/) (Custom shaderless low-poly meshes, Orthographic Isometric camera, particle systems, dynamic shadows).
- **Language & Tooling:** TypeScript 5, Vite 8, CSS3 glassmorphism.
- **Physics Engine:** Custom 2D simulation layer with isometric 3D projection (`Physics.ts`), Circle-vs-Circle and Circle-vs-AABB intersections.
- **Mobile Shell:** [Capacitor](https://capacitorjs.com/) for native Android packaging.
- **Desktop Shell:** [Electron](https://www.electronjs.org/) for the portable Windows build.
- **Automated Testing:** Headless E2E gametest suite using [Puppeteer Core](https://pptr.dev/).
- **CI/CD:** Parallel GitHub Actions builds publish the Windows EXE and Android APK to the same release post.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 22 or higher recommended)
- [npm](https://www.npmjs.com/)

### 1. Installation
```bash
git clone https://github.com/BjornBrorsson/Incasters.git
cd Incasters
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:5173/` to start playing immediately.

### 3. Production Web Build
```bash
npm run build
npm run preview
```

### 4. Run the LAN Multiplayer Server
```bash
npm run lan-server
```
Starts the local WebSocket game host on port `7070`.

### 5. Automated E2E Gametests
Run the headless game simulation to verify the render loop, HUD, menus, and bot AI:
```bash
node test-game.js
```

---

## � Android & Windows Release Builds

The repository includes an automated GitHub Actions CI/CD workflow that compiles and publishes both the **Android APK** and the **Windows portable EXE** to the same GitHub Release on every push to `main` or tag creation.

### Download Prebuilt Binaries

1. Visit the [Releases](https://github.com/BjornBrorsson/Incasters/releases) page.
2. Pick the latest release.
3. Download the assets you need:
   - `Incasters-Android.apk` — install on any Android device.
   - `Incasters-Windows-x64.exe` — portable Windows x64 executable; no installation required.

> **Windows SmartScreen note:** The Windows build is currently unsigned, so Windows Defender / SmartScreen may show a warning the first time you run it. Choose **More info → Run anyway** to start the game.

### Build Windows Locally

To produce the portable Windows executable on your own machine:

```bash
npm install
npm run desktop:build
```

The output file is created at `release/windows/Incasters-0.0.0-Windows-x64.exe` and can be run directly or renamed to `Incasters-Windows-x64.exe`.

### Build Android Locally

```bash
# 1. Build web distribution
npm run build

# 2. Sync web assets with Capacitor
npx cap sync android

# 3. Compile debug APK using Gradle
cd android
./gradlew assembleDebug
```

The output APK will be generated at `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 📂 Project Structure

```
Incasters/
├── .github/workflows/    # CI/CD GitHub Actions APK build workflow
├── android/              # Native Android wrapper project (Capacitor)
├── server/
│   └── lan-server.js     # Standalone WebSocket LAN multiplayer server
├── src/
│   ├── engine/
│   │   ├── AimVisualizer.ts # 3D Trajectory guide & ground reticle
│   │   ├── Audio.ts         # Web Audio synthesizer SFX & BGM
│   │   ├── Fx.ts            # Floating damage numbers, kill-feed & announcer
│   │   ├── Game.ts          # Core tick loop, camera follow, and entity manager
│   │   ├── InputManager.ts  # Keyboard, mouse & gamepad polling
│   │   ├── Physics.ts       # Circle/AABB collisions & isometric transforms
│   │   └── Theme.ts         # Sky dome & neon palette definitions
│   ├── entities/
│   │   ├── Bot.ts           # AI controller (dodging, aiming, curving)
│   │   ├── Caster.ts        # Wizard avatar meshes, robes, hats & weapons
│   │   ├── Entity.ts        # Base physics entity
│   │   ├── PowerUp.ts       # Pickups (Shield, Freeze, Bounce, Split, etc.)
│   │   └── Projectile.ts    # Flying spell physics & wall-running glide
│   ├── game/
│   │   ├── CharacterConfig.ts # 7-part customization presets & options
│   │   ├── Difficulty.ts      # Bot AI difficulty configurations
│   │   └── Progression.ts     # XP, levels, challenges & shop persistence
│   ├── net/
│   │   └── LanClient.ts     # WebSocket network client & state renderer
│   ├── world/
│   │   ├── Arena.ts         # Map layouts, doors, bounce pads & spawners
│   │   └── GameModes.ts     # Battle Royale, Team Battle, and Gold Rush rules
│   ├── main.ts              # Entry point & menu UI state
│   └── style.css            # Responsive neon glassmorphism stylesheet
├── test-game.js             # Headless E2E Puppeteer gametest
├── index.html               # Main HTML markup & HUD overlays
└── package.json
```

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
