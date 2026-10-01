// node --test tools/verify/
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from './lib.mjs';
import { findOverflow } from './overflow.mjs';

const page300 = (body) => `<style>
  body { margin: 0; font: 16px/1.4 sans-serif; }
  ion-content { display: block; width: 300px; padding: 0 10px; box-sizing: border-box; }
  .hero { position: relative; }
  .hero::before { content: ''; position: absolute; inset: 0 -10px; background: #eee; }
</style><ion-content>${body}</ion-content>`;

let browser;
let page;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  page = await browser.newPage({ viewport: { width: 400, height: 600 } });
});
after(() => browser.close());

const check = async (body) => {
  await page.setContent(page300(body));
  return page.evaluate(findOverflow);
};

test('a page whose content wraps and fits is clean', async () => {
  const result = await check(`
    <h1 class="hero">A heading long enough to wrap onto a second line</h1>
    <div style="position: relative"><span style="position: absolute; left: -10px; width: 60px">decor</span></div>
    <div style="position: relative; height: 20px"><div style="position: absolute; width: 20px"><span style="white-space: nowrap">a tag wider than its anchor</span></div></div>
    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr))"><span>a few short words</span><span>b</span><span>c</span></div>
    <p style="overflow-wrap: anywhere">averyveryveryveryveryveryverylongtokenwithoutanybreaks</p>
    <p style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis">truncated on purpose with an ellipsis at the end</p>
    <span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">screen reader only text</span>`);
  assert.deepEqual(result, { overflow: [], scrollers: [] });
});

test('a grid wider than its box is reported once, on the box it spills out of', async () => {
  const result = await check(`<div class="widget"><div class="grid" style="display: grid; grid-template-columns: repeat(5, 59px)">
    <i>1</i><i>2</i><i>3</i><i>4</i><i>5</i></div></div>`);
  assert.deepEqual(result.overflow, [{ kind: 'spill', selector: 'ion-content > div.widget > div.grid', px: 15 }]);
});

test('text cut off by a hidden box is reported, without the ellipsis', async () => {
  const result = await check(
    `<div class="tag" style="width: 100px; overflow: hidden; white-space: nowrap">a label that is cut off well before its end</div>`,
  );
  assert.equal(result.overflow.length, 1);
  assert.equal(result.overflow[0].kind, 'clipped');
  assert.equal(result.overflow[0].selector, 'ion-content > div.tag');
  assert.ok(result.overflow[0].px > 100, `${result.overflow[0].px} px`);
});

test('a box pulled past the left edge of ion-content is reported', async () => {
  const result = await check(`<div class="bleed" style="margin-left: -24px">bleeds out to the left</div>`);
  assert.deepEqual(result.overflow, [{ kind: 'past ion-content', selector: 'ion-content > div.bleed', px: 14 }]);
});

test('a horizontal scroller never fails, and is listed only when a keyboard cannot reach it', async () => {
  const wide = '<span style="display: inline-block; width: 600px">wide code line</span>';
  const result = await check(`
    <pre class="plain" style="overflow-x: auto">${wide}</pre>
    <pre class="named" style="overflow-x: auto" tabindex="0" aria-label="Code">${wide}</pre>`);
  assert.deepEqual(result.overflow, []);
  assert.deepEqual(result.scrollers, [{ selector: 'ion-content > pre.plain:nth-of-type(1)', px: 320, reachable: false, named: false }]);
});
