import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function startStaticServer(port = 5200) {
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
      resolve(server);
    });
  });
}

async function capture() {
  const PORT = 5200;
  const server = await startStaticServer(PORT);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 600));

    // Screenshot 1: Main Menu & Customizer
    await page.screenshot({ path: 'screenshot_menu.png' });
    console.log("✓ Saved screenshot_menu.png");

    // Screenshot 2: Unseen Courtyard (Arena map)
    await page.click('#btn-mode-br');
    await page.click('#btn-map-arena');
    await page.click('#btn-play');
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: 'screenshot_courtyard.png' });
    console.log("✓ Saved screenshot_courtyard.png");

    // Return to menu
    await page.evaluate(() => {
      const b = document.getElementById('btn-back-menu');
      if (b) b.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // Screenshot 3: Forbidden Arcanum (Chamber map)
    await page.click('#btn-map-chamber');
    await page.click('#btn-play');
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: 'screenshot_arcanum.png' });
    console.log("✓ Saved screenshot_arcanum.png");

  } finally {
    await browser.close();
    server.close();
  }
}

capture();
