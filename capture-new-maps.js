import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function startStaticServer(port = 5230) {
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
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
      console.log(`✓ Static server running at http://127.0.0.1:${port}/`);
      resolve(server);
    });
  });
}

async function capture() {
  const PORT = 5230;
  const server = await startStaticServer(PORT);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 600));

    // 1. Capture expanded Customization Menu
    console.log("Capturing Customization Screen...");
    await page.evaluate(() => {
      const customizer = document.querySelector('.customizer-container');
      if (customizer) customizer.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'screenshots/customization.png' });

    // 2. Capture Astral Observatory Map Match
    console.log("Capturing Astral Observatory Match...");
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.click('#btn-map-observatory');
    await page.click('#btn-play');
    await new Promise(r => setTimeout(r, 4200));
    // Simulate some bot movement, spell casting, and power-up inventory
    await page.evaluate(() => {
      const g = window.game;
      if (g && g.player) {
        g.player.powerups.set('BOUNCE', 2);
        g.player.powerupSlotsOrder.push('BOUNCE');
        g.player.powerups.set('SPLIT', 1);
        g.player.powerupSlotsOrder.push('SPLIT');
        g.casters.forEach((c, idx) => {
          if (idx > 0) {
            c.vx = (Math.random() - 0.5) * 2.5;
            c.vy = (Math.random() - 0.5) * 2.5;
          }
        });
      }
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'screenshots/screenshot_observatory.png' });

    // Return to menu
    await page.evaluate(() => {
      const backBtn = document.getElementById('btn-back-menu');
      if (backBtn) backBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // 3. Capture Alchemist's Undercroft (Catacombs) Match
    console.log("Capturing Alchemist's Undercroft Match...");
    await page.click('#btn-map-catacombs');
    await page.click('#btn-play');
    await new Promise(r => setTimeout(r, 4200));
    await page.evaluate(() => {
      const g = window.game;
      if (g && g.player) {
        g.player.powerups.set('HASTE', 1);
        g.player.powerupSlotsOrder.push('HASTE');
        g.player.powerups.set('SHIELD', 1);
        g.player.powerupSlotsOrder.push('SHIELD');
        g.casters.forEach((c, idx) => {
          if (idx > 0) {
            c.vx = (Math.random() - 0.5) * 2.5;
            c.vy = (Math.random() - 0.5) * 2.5;
          }
        });
      }
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'screenshots/screenshot_catacombs.png' });
    await page.screenshot({ path: 'screenshots/desktop_battle.png' });

    console.log("✓ All new map and customization screenshots saved!");
  } finally {
    await browser.close();
    server.close();
  }
}

capture();
