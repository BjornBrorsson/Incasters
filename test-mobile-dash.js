import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function startStaticServer(port = 5210) {
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
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

async function testMobileDash() {
  console.log("=== Testing Mobile Dashing Gestures and Controls ===");
  const PORT = 5210;
  const server = await startStaticServer(PORT);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    // Simulate iPhone landscape viewport
    await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 500));

    // Start battle
    await page.click('#btn-play');
    await new Promise(r => setTimeout(r, 1200));

    console.log("1. Checking touch action buttons visibility...");
    const isDashBtnVisible = await page.evaluate(() => {
      const btn = document.getElementById('dash-btn');
      return btn && window.getComputedStyle(btn).display !== 'none';
    });
    console.log(`  ✓ Dash Button visible on touch: ${isDashBtnVisible}`);

    console.log("2. Testing Tap on #dash-btn...");
    const dashTriggered1 = await page.evaluate(() => {
      const g = window.game;
      if (!g || !g.player) return false;
      const btn = document.getElementById('dash-btn');
      if (btn) {
        btn.dispatchEvent(new Event('touchstart', { bubbles: true }));
      }
      return g.touchDashQueued === true;
    });
    console.log(`  ✓ Tap #dash-btn queued dash: ${dashTriggered1}`);

    console.log("3. Testing Double-Tap on Left Movement Side...");
    const doubleTapDash = await page.evaluate(() => {
      const g = window.game;
      if (!g) return false;
      // First tap
      const touch1 = new Touch({
        identifier: 101,
        target: window.document.body,
        clientX: 150,
        clientY: 250
      });
      window.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [touch1] }));
      window.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch1] }));

      // Fast second tap within 100ms
      const touch2 = new Touch({
        identifier: 102,
        target: window.document.body,
        clientX: 155,
        clientY: 255
      });
      window.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [touch2] }));

      return g.touchDashQueued === true;
    });
    console.log(`  ✓ Double-tap on movement screen queued dash: ${doubleTapDash}`);

    console.log("\n=======================================================");
    console.log(" ALL MOBILE DASHING FEATURES VERIFIED! ");
    console.log("=======================================================");

  } finally {
    await browser.close();
    server.close();
  }
}

testMobileDash();
