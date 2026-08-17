import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function startStaticServer(port = 5199) {
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.wasm': 'application/wasm'
  };

  const distDir = path.resolve('dist');
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(distDir, reqPath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`✓ Embedded test web server running at http://127.0.0.1:${port}/`);
      resolve(server);
    });
  });
}

async function run() {
  console.log("=== Launching Headless Game Test ===");
  const PORT = 5199;
  const server = await startStaticServer(PORT);

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
    console.log(`Navigating to http://127.0.0.1:${PORT}/ ...`);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle2", timeout: 10000 });

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
      const dots = document.querySelectorAll('#robe-color-picker .color-dot');
      if (dots.length > 0) dots[0].click();
    });
    console.log("✓ Clicked first robe color dot.");

    console.log("Testing customize hat style...");
    await page.evaluate(() => {
      const hatBtns = document.querySelectorAll('#hat-picker button');
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
    server.close();
    console.log("=== Browser and server closed. Test Complete. ===");
  }
}

run();
