// Renders one state of mockup.html and prints its collision report: node one.cjs <query> <width> [out.png]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/var/tmp/r41h/node_modules/playwright');
const DIR = __dirname;
const [query = 'state=default', width = '1280', out = 'shots/one.png'] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(DIR) || !fs.existsSync(f)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  fs.mkdirSync(path.join(DIR, 'shots'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell' });
  const w = Number(width);
  const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: w < 600 ? 2 : 1 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message, e.stack?.split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
  await page.goto(`http://127.0.0.1:${server.address().port}/mockup.html?${query}`);
  try {
    await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
    const { issues, stage } = await page.evaluate(() => ({ issues: window.__collisions, stage: window.__stage }));
    console.log(`stage ${stage.W}x${stage.H}: ${issues.length} findings`);
    for (const i of issues.slice(0, 25)) console.log('  ' + i);
  } catch (e) {
    console.log('not ready:', e.message.split('\n')[0]);
  }
  await page.screenshot({ path: path.join(DIR, out), fullPage: true });
  await browser.close();
  server.close();
})();
