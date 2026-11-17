// Renders several states of mockup.html into one contact sheet, cropped to the widget's stage column, and prints each
// state's collision report: node sheet.cjs <width> <out.png> <query> [<query> ...]   (add --page for the whole page)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/var/tmp/r41h/node_modules/playwright');
const DIR = __dirname;
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const whole = process.argv.includes('--page');
const [width, out, ...queries] = args;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(DIR) || !fs.existsSync(f)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync(path.join(DIR, 'shots/tmp'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell' });
  const w = Number(width);
  const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: w < 600 ? 2 : 1 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message, (e.stack ?? '').split('\n').slice(1, 3).join(' ')));
  const files = [];
  for (const [i, q] of queries.entries()) {
    await page.goto(`${base}/mockup.html?${q}`);
    try {
      await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
      const { issues, stage } = await page.evaluate(() => ({ issues: window.__collisions, stage: window.__stage }));
      console.log(`${q}: stage ${stage.W}x${stage.H}: ${issues.length} findings`);
      for (const s of issues.slice(0, 10)) console.log('    ' + s);
    } catch (e) {
      console.log(`${q}: not ready`);
    }
    const file = `shots/tmp/s${i}.png`;
    if (whole) await page.screenshot({ path: path.join(DIR, file), fullPage: true });
    else await (await page.$(w >= 1000 ? '.main' : '.widget')).screenshot({ path: path.join(DIR, file) });
    files.push(file);
  }
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const cell = Math.floor(1600 / queries.length) - 8;
  await sheet.setContent(`<body style="margin:0;background:#888;display:flex;gap:8px;align-items:flex-start">${files.map((f) => `<img src="${base}/${f}?${Date.now()}" style="width:${cell}px"/>`).join('')}</body>`);
  await sheet.waitForFunction(() => [...document.images].every((i) => i.complete));
  await sheet.screenshot({ path: path.join(DIR, out), fullPage: true });
  await browser.close();
  server.close();
})();
