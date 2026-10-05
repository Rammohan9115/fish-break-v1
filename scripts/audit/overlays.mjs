// Overlay audit: opens every overlay in e2e/overlays/registry.js on every viewport/zoom in viewports.js, measures it,
// and screenshots it. Usage: node scripts/audit/overlays.mjs [out dir, default qa/overlays/before] [url]
// ONLY=fishcard,shop-fish and VP=d1366x768 narrow the run. Needs a dev server (npm run dev -- --port 5199).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const { OVERLAYS, SEED, RESET, settle } = require('../../e2e/overlays/registry.js');
const { VIEWPORTS } = require('../../e2e/overlays/viewports.js');
const { measureOverlay } = require('../../e2e/overlays/measure.js');

const OUT = process.argv[2] ?? 'qa/overlays/before';
const URL = process.argv[3] ?? 'http://localhost:5199/';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const vps = process.env.VP ? process.env.VP.split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = {};
for (const vp of VIEWPORTS) {
  if (vps && !vps.includes(vp.id)) continue;
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.zoom ?? 1,
    hasTouch: !!vp.touch,
    isMobile: false,
  });
  const page = await ctx.newPage();
  await page.route('http://localhost:54321/**', (route) => route.abort());
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-cleared')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-cleared', '1');
    }
  });
  await page.goto(URL);
  await page.waitForFunction(() => '__fishbowl' in window, null, { timeout: 30000 });
  await page.waitForSelector('.hud');
  await page.evaluate(SEED);
  // The dock starts open during the first tip; tuck it away so it isn't part of the measurement.
  for (const o of OVERLAYS) {
    if (only && !only.includes(o.id)) continue;
    try {
      await page.evaluate(RESET);
      await page.waitForTimeout(150);
      await o.open(page);
      await page.waitForTimeout(300);
      await settle(page);
      const m = await page.evaluate(measureOverlay, { selector: o.selector ?? '.sheet', touch: !!vp.touch });
      results[`${vp.id}/${o.id}`] = { ...m, kind: o.kind, fit: !!o.fit };
      await page.screenshot({ path: `${OUT}/${vp.id}__${o.id}.png` });
    } catch (e) {
      results[`${vp.id}/${o.id}`] = { found: false, error: String(e).slice(0, 160), kind: o.kind, fit: !!o.fit };
    }
  }
  await ctx.close();
  console.log('done', vp.id);
}
await browser.close();
// A narrowed run (ONLY / VP) updates the existing file instead of replacing it.
let merged = results;
if ((only || vps) && fs.existsSync(`${OUT}/metrics.json`)) merged = { ...JSON.parse(fs.readFileSync(`${OUT}/metrics.json`, 'utf8')), ...results };
fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify(merged, null, 1));
console.log('wrote', `${OUT}/metrics.json`, Object.keys(results).length, 'measurements');
