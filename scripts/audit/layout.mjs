// Throwaway layout audit: drives the dev server through UI states at many viewports and reports overlaps,
// off-screen elements, clipped text and small tap targets. Usage: node scripts/audit/layout.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5199/';
const OUT = process.argv[3] ?? 'qa/layout';
const SHOTS = process.env.SHOTS === '1';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  ['m320', 320, 568], ['m375', 375, 667], ['m390', 390, 844], ['m430', 430, 932],
  ['l667', 667, 375], ['l844', 844, 390], ['l932', 932, 430],
  ['t768', 768, 1024], ['t1024', 1024, 768], ['d1366', 1366, 768], ['d1920', 1920, 1080],
];

const STATES = {
  idle: `() => {}`,
  tools: `() => document.querySelector('.dock-handle')?.click()`,
  fishcard: `() => { const s = __fishbowl.store; s.setState({ selectedFishId: s.getState().game.fish[2].id }); }`,
  shop: `() => __fishbowl.store.getState().openPanel('shop')`,
  breeding: `() => __fishbowl.store.getState().openPanel('breeding')`,
  myfish: `() => __fishbowl.store.getState().openPanel('myfish')`,
  tanks: `() => __fishbowl.store.getState().openPanel('tanks')`,
  settings: `() => __fishbowl.store.getState().openPanel('settings')`,
  feed: `() => __fishbowl.store.getState().setMode('feed')`,
  decorate: `() => __fishbowl.store.getState().setMode('decorate')`,
  decorsel: `() => { const s = __fishbowl.store; s.getState().setMode('decorate'); s.getState().selectDecor(s.getState().game.tanks[0].decor[0].id); }`,
  toasts: `() => { const g = __fishbowl.store.getState(); g.addToast('While you were away (8h): 185 shells waiting on the sand, 2 eggs hatched'); g.addToast('Another toast that is long enough to wrap onto two lines on a phone'); }`,
  onboarding: `() => __fishbowl.store.setState({ onboardingStep: 0 })`,
};

const SEED = `() => {
  const { store, utils } = window.__fishbowl; const now = Date.now();
  const fish = ['danio','guppy','goldfish','betta','angelfish','tetra','koi'].map((s,i)=>utils.makeFish({speciesId:s, stage:'adult', growth: 99999, hunger: 80, happiness: 80, name: 'Fish'+i, bornAt: now, lastDropAt: now}));
  const decor = ['plant_tall','castle','rock','lantern'].map((d,i)=>({ id: 'd'+i, decorId: d, x: 150+i*200, flipped:false, size:'M', depth:'back' }));
  store.getState().loadState(utils.makeState({ fish, tank: { decor }, overrides: { level: 12, shells: 1234, pearls: 7, xp: 100, lastTickAt: now, lastDailyGift: new Date().toISOString().slice(0,10) } }));
  store.setState({ onboardingStep: null });
}`;

const MEASURE = `() => {
  const vw = innerWidth, vh = innerHeight;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const name = (el) => el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 3).join('.');
  // Overlay boxes: fixed/absolute UI that isn't a full-screen layer.
  const boxes = [];
  const add = (el, label) => { if (!vis(el)) return; const r = el.getBoundingClientRect(); boxes.push({ label: label ?? name(el), x: r.x, y: r.y, w: r.width, h: r.height, el }); };
  const sel = ['.hud-bar', '.hud-pearls', '.hud-xpwrap', '.hud-tank', '.hud .icon-btn', '.hud button', '.goal-chip', '.banner', '.toolbar', '.sheet', '.toast', '.dev-toggle', '.ios-hint', '.decor-toolbar', '.tray', '.tip', '.onboarding', '.onboarding-bubble', '.gift-box', '.pair-banner', '.coachmark', '.quick'];
  const seen = new Set();
  for (const s of sel) for (const el of document.querySelectorAll('.app ' + s + ', ' + s)) { if (seen.has(el)) continue; seen.add(el); add(el); }
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w > 4 && h > 4) overlaps.push(a.label + ' × ' + b.label + ' (' + Math.round(w) + 'x' + Math.round(h) + ')');
  }
  const offscreen = boxes.filter((b) => b.x < -2 || b.y < -2 || b.x + b.w > vw + 2 || b.y + b.h > vh + 2).map((b) => b.label + ' [' + Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.w) + 'x' + Math.round(b.h) + ']');
  const clipped = [...document.querySelectorAll('button, .tool, .chip, .badge, .hud-bar, .tab')].filter((el) => vis(el) && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible').map((el) => name(el) + ' "' + (el.textContent || '').trim().slice(0, 20) + '"');
  const small = [...document.querySelectorAll('button, [role=button], a, input, select')].filter((el) => { if (!vis(el)) return false; const r = el.getBoundingClientRect(); return (r.width < 44 || r.height < 44) && !el.closest('.dev-panel') && !el.classList.contains('dev-toggle'); }).map((el) => { const r = el.getBoundingClientRect(); return name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); });
  const hscroll = document.documentElement.scrollWidth > vw + 1;
  return { overlaps, offscreen, clipped: [...new Set(clipped)], small: [...new Set(small)], hscroll };
}`;

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = {};
for (const [vname, w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 900 || h < 500 });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => window.__fishbowl, null, { timeout: 15000 });
  for (const [sname, fn] of Object.entries(STATES)) {
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    await page.waitForFunction(() => window.__fishbowl);
    await page.waitForTimeout(400);
    if (sname !== 'onboarding') await page.evaluate(`(${SEED})()`);
    await page.waitForTimeout(250);
    await page.evaluate(`(${fn})()`);
    await page.waitForTimeout(500);
    report[`${vname}/${sname}`] = await page.evaluate(`(${MEASURE})()`);
    if (SHOTS) await page.screenshot({ path: `${OUT}/${vname}-${sname}.png` });
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
let nO = 0, nOff = 0, nC = 0, nH = 0;
for (const [k, r] of Object.entries(report)) {
  const lines = [...r.overlaps.map((s) => 'OVERLAP ' + s), ...r.offscreen.map((s) => 'OFFSCREEN ' + s), ...r.clipped.map((s) => 'CLIPPED ' + s), ...(r.hscroll ? ['H-SCROLL'] : [])];
  nO += r.overlaps.length; nOff += r.offscreen.length; nC += r.clipped.length; nH += r.hscroll ? 1 : 0;
  if (lines.length) console.log(k + '\n  ' + lines.join('\n  '));
}
const smalls = new Map();
for (const r of Object.values(report)) for (const s of r.small) smalls.set(s.replace(/ \d+x\d+$/, ''), (smalls.get(s.replace(/ \d+x\d+$/, '')) ?? 0) + 1);
console.log(`\nTOTAL overlaps=${nO} offscreen=${nOff} clipped=${nC} hscroll=${nH} smallTargetKinds=${smalls.size}`);
