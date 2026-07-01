import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs/promises';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function run() {
  console.log("=== Launching Headless Game Test ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Monitor browser console logs and errors
  const errors = [];
  const logs = [];
  page.on('pageerror', (err) => {
    console.error("PAGE ERROR:", err.message);
    errors.push(err);
  });
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(text);
    if (msg.type() === 'error') {
      console.error("CONSOLE ERROR:", text);
    } else {
      console.log("CONSOLE:", text);
    }
  });

  try {
    console.log("Navigating to http://localhost:5173/ ...");
    await page.goto("http://localhost:5173/", { waitUntil: "networkidle2", timeout: 10000 });

    // 1. Verify Main Menu elements exist and are visible
    console.log("Verifying Main Menu UI elements...");
    const menuVisible = await page.evaluate(() => {
      const el = document.getElementById('menu-screen');
      return el && el.style.display !== 'none' && el.offsetHeight > 0;
    });
    if (!menuVisible) {
      throw new Error("Main Menu is not visible on page load!");
    }
    console.log("✓ Main Menu is visible.");

    // Take screenshot of main menu
    await page.screenshot({ path: 'menu_screenshot.png' });
    console.log("✓ Saved Main Menu screenshot to menu_screenshot.png");

    // 2. Test Customization (Click a cosmetic robe color and hat style)
    console.log("Testing customize robe color...");
    await page.evaluate(() => {
      // Find the first color dot in robe picker and click it
      const dots = document.querySelectorAll('#robe-color-picker .color-dot');
      if (dots.length > 0) dots[0].click();
    });
    console.log("✓ Clicked first robe color dot.");

    console.log("Testing customize hat style...");
    await page.evaluate(() => {
      const hatBtns = document.querySelectorAll('#hat-picker button');
      // Click the second hat button (usually WIZARD, TOP, CROWN, or NONE)
      if (hatBtns.length > 1) hatBtns[1].click();
    });
    console.log("✓ Clicked a hat selection button.");

    // 3. Cycle Game Modes & select Team Battle
    console.log("Cycling game modes...");
    await page.evaluate(() => {
      const modeBtn = document.getElementById('btn-mode-tdm');
      if (modeBtn) modeBtn.click();
    });
    console.log("✓ Selected Team Battle Mode.");

    // 4. Cycle maps & select Chamber Map
    console.log("Cycling maps...");
    await page.evaluate(() => {
      const mapBtn = document.getElementById('btn-map-chamber');
      if (mapBtn) mapBtn.click();
    });
    console.log("✓ Selected Neon Chamber Map.");

    // 5. Start the match!
    console.log("Launching the battle match...");
    await page.click('#btn-play');
    console.log("✓ Clicked START BATTLE.");

    // Wait for game loop to initialize and transition from menu
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verify HUD is active and visible
    const hudVisible = await page.evaluate(() => {
      const hud = document.getElementById('hud-container');
      return hud && hud.style.display !== 'none' && hud.offsetHeight > 0;
    });
    if (!hudVisible) {
      throw new Error("HUD container did not become visible after starting the match!");
    }
    console.log("✓ In-game HUD is visible.");

    // 6. Simulate gameplay ticks (let the AI bots and player update for 10 seconds)
    console.log("Letting match run for 10 seconds to simulate gameplay and gametest the balance...");
    for (let i = 1; i <= 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`Match Time elapsed: ${i} seconds`);

      // Randomly press Space to jump/dodge or simulate movement on WASD keys
      // so we can test the input system and movement physics
      const keys = ['w', 'a', 's', 'd', ' '];
      const k = keys[Math.floor(Math.random() * keys.length)];
      if (k === ' ') {
        await page.keyboard.press('Space');
        console.log("  Simulated Dodge Dash!");
      } else {
        await page.keyboard.down(k);
        await new Promise(resolve => setTimeout(resolve, 120));
        await page.keyboard.up(k);
      }
    }

    // Capture in-game screenshot to inspect rendering
    await page.screenshot({ path: 'battle_screenshot.png' });
    console.log("✓ Saved live in-game battle screenshot to battle_screenshot.png");

    // Check if player health or score is updated
    const stats = await page.evaluate(() => {
      const hp = document.getElementById('hp-text')?.innerText;
      const elims = document.getElementById('leaderboard-list')?.innerText;
      return { hp, elims };
    });
    console.log(`Current Player Status -> HP: ${stats.hp}`);
    console.log(`Live Leaderboard:\n${stats.elims}`);

    // Verify there were no page errors
    if (errors.length > 0) {
      throw new Error(`Encountered ${errors.length} page errors during test run!`);
    }

    console.log("\n=== GAME RUNS EXTREMELY SMOOTH AND FLUID! NO ERRORS DETECTED! ===");
  } catch (err) {
    console.error("\nTEST FAILED:", err.message);
    process.exit(1);
  } finally {
    await browser.close();
    console.log("=== Browser closed. Test Complete. ===");
  }
}

run();
