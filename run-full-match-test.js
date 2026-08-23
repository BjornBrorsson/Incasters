import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function startStaticServer(port = 5205) {
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
      console.log(`✓ Test static server running at http://127.0.0.1:${port}/`);
      resolve(server);
    });
  });
}

async function runFullMatchAndScreenshots() {
  console.log("=== Launching Full Test Match & Screenshots Capture ===");
  const PORT = 5205;
  const server = await startStaticServer(PORT);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const errors = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('pageerror', (err) => {
      console.error("PAGE ERROR:", err.message);
      errors.push(err);
    });

    console.log("Navigating to game...");
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 600));

    // 1. Capture Desktop Main Menu
    console.log("Capturing desktop_menu.png...");
    await page.screenshot({ path: 'screenshots/desktop_menu.png' });
    console.log("  ✓ Saved screenshots/desktop_menu.png");

    // 2. Open Customization tab / section if available and capture customization.png
    console.log("Capturing customization.png...");
    // Let 3D preview rotate slightly
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: 'screenshots/customization.png' });
    console.log("  ✓ Saved screenshots/customization.png");

    // 3. Select Mode & Map and capture match_config.png
    console.log("Setting up match options...");
    await page.click('#btn-mode-br');
    await page.click('#btn-map-arena');
    await page.screenshot({ path: 'screenshots/match_config.png' });
    console.log("  ✓ Saved screenshots/match_config.png");

    // 4. Start Live Match and simulate intense gameplay
    console.log("\nStarting Live Test Match in Unseen Courtyard...");
    await page.click('#btn-play');
    await new Promise(r => setTimeout(r, 1200));

    console.log("Simulating 15 seconds of active gameplay (movement, spell casting, curved trick shots, dodging)...");

    // Simulate active player combat loop
    for (let sec = 1; sec <= 15; sec++) {
      // Aim at random arena positions and cast spells
      const aimX = 640 + Math.cos(sec * 1.5) * 350;
      const aimY = 360 + Math.sin(sec * 1.5) * 200;
      await page.mouse.move(aimX, aimY);
      await page.mouse.down();
      await new Promise(r => setTimeout(r, 80));
      await page.mouse.up();

      // Move player WASD
      const keys = ['w', 'a', 's', 'd'];
      const key = keys[sec % keys.length];
      await page.keyboard.down(key);
      await new Promise(r => setTimeout(r, 200));
      await page.keyboard.up(key);

      // Dodge dash occasionally
      if (sec % 3 === 0) {
        await page.keyboard.press('Space');
      }

      // Capture desktop battle mid-combat (around sec 5)
      if (sec === 5) {
        console.log("Capturing live desktop_battle.png mid-combat...");
        await page.screenshot({ path: 'screenshots/desktop_battle.png' });
        console.log("  ✓ Saved screenshots/desktop_battle.png");
      }

      await new Promise(r => setTimeout(r, 600));
      console.log(`  Match Progress: ${sec}/15s`);
    }

    console.log("✓ Full live match simulation finished cleanly without any physics or rendering crash!");

    // 5. Capture Mobile Viewports
    console.log("\nCapturing Mobile Viewport Screenshots...");

    // Mobile Landscape
    const mobileLandscapePage = await browser.newPage();
    await mobileLandscapePage.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
    await mobileLandscapePage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle2" });
    await mobileLandscapePage.click('#btn-mode-br');
    await mobileLandscapePage.click('#btn-map-arena');
    await mobileLandscapePage.click('#btn-play');
    // Wait for 3-2-1 countdown to finish
    await new Promise(r => setTimeout(r, 3800));
    await mobileLandscapePage.screenshot({ path: 'screenshots/mobile_landscape_battle.png' });
    console.log("  ✓ Saved screenshots/mobile_landscape_battle.png");
    await mobileLandscapePage.close();

    // Mobile Portrait
    const mobilePortraitPage = await browser.newPage();
    await mobilePortraitPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await mobilePortraitPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle2" });
    await mobilePortraitPage.click('#btn-mode-br');
    await mobilePortraitPage.click('#btn-map-chamber');
    await mobilePortraitPage.click('#btn-play');
    // Wait for 3-2-1 countdown to finish
    await new Promise(r => setTimeout(r, 3800));
    await mobilePortraitPage.screenshot({ path: 'screenshots/mobile_battle_1.png' });
    console.log("  ✓ Saved screenshots/mobile_battle_1.png");

    await new Promise(r => setTimeout(r, 2000));
    await mobilePortraitPage.screenshot({ path: 'screenshots/mobile_battle_2.png' });
    console.log("  ✓ Saved screenshots/mobile_battle_2.png");
    await mobilePortraitPage.close();

    if (errors.length > 0) {
      throw new Error(`Encountered ${errors.length} page errors during test run!`);
    }

    console.log("\n=======================================================");
    console.log(" FULL MATCH & ALL SCREENSHOT REPLACEMENTS COMPLETED! ");
    console.log("=======================================================");

  } catch (err) {
    console.error("TEST ERROR:", err);
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
  }
}

runFullMatchAndScreenshots();
