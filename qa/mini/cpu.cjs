// CPU of the whole Chrome instance (all its processes, GPU included) while the tank runs normally vs. floating in the Mini Tank.
const { chromium } = require('@playwright/test');
const { execSync } = require('child_process');
const perProc = () => {
  const out = execSync("ps -axo pid=,time=,command=", { maxBuffer: 1 << 24 }).toString().split('\n');
  const m = new Map();
  for (const line of out) {
    if (!line.includes('playwright_chromiumdev_profile')) continue;
    const x = line.trim().match(/^(\d+)\s+(\d+):(\d+\.\d+)\s+(.*)$/);
    if (!x) continue;
    const type = (x[4].match(/--type=([\w-]+)/) || [, 'browser'])[1];
    m.set(x[1], { sec: +x[2] * 60 + +x[3], type });
  }
  return m;
};
const cpuSeconds = () => {
  const out = execSync("ps -axo pid=,time=,command=", { maxBuffer: 1 << 24 }).toString().split('\n');
  let total = 0;
  for (const line of out) {
    if (!line.includes('playwright_chromiumdev_profile')) continue;
    const m = line.trim().match(/^(\d+)\s+(\d+):(\d+\.\d+)/);
    if (m) total += +m[2] * 60 + +m[3];
  }
  return total;
};
const measure = async (label, ms) => {
  const a = cpuSeconds(); const t = Date.now(); const before = perProc();
  await new Promise((r) => setTimeout(r, ms));
  const after = perProc(); const byType = {};
  for (const [pid, v] of after) { const d = v.sec - (before.get(pid)?.sec ?? 0); byType[v.type] = (byType[v.type] || 0) + d; }
  console.log('   by process type (% core):', Object.entries(byType).map(([k, v]) => k + '=' + (v / (ms / 1000) * 100).toFixed(0)).join(' '));
  const pct = ((cpuSeconds() - a) / ((Date.now() - t) / 1000)) * 100;
  console.log(label.padEnd(34), pct.toFixed(1) + '% of one core');
  return pct;
};
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  await page.route('http://localhost:54321/**', (r) => r.abort());
  await page.goto('http://localhost:5198/');
  await page.waitForFunction(() => '__fishbowl' in window, null, { timeout: 20000 });
  await page.evaluate(`(() => { const { store, utils } = window.__fishbowl; const now = Date.now();
    const sp = ['danio','guppy','goldfish','goldfish','tetra','tetra','clownfish','angelfish','jellyfish','guppy'];
    const fish = sp.map((s,i)=>utils.makeFish({speciesId:s,stage:'adult',growth:99999,hunger:80,happiness:90,name:'F'+i,bornAt:now-1e7,lastDropAt:now,lastBredAt:null}));
    store.getState().loadState(utils.makeState({fish, overrides:{level:14,shells:2000,lastTickAt:now,lastDailyGift:new Date().toISOString().slice(0,10)}})); store.setState({onboardingStep:null}); })()`);
  await page.waitForTimeout(8000); // let quality probing settle
  const results = {};
  results.normal = await measure('Normal tab (1200x800, 60fps)', 15000);
  await page.keyboard.press('p');
  await page.waitForTimeout(4000);
  const pip = ctx.pages().find((p) => p !== page);
  await pip.setViewportSize({ width: 400, height: 260 });
  await pip.waitForTimeout(2000);
  results.pip = await measure('Mini Tank 400x260 (30fps, low)', 15000);
  await pip.setViewportSize({ width: 800, height: 500 });
  await pip.waitForTimeout(2000);
  results.pip800 = await measure('Mini Tank 800x500 (30fps, low)', 15000);
  await page.keyboard.press('p');
  await page.waitForTimeout(3000);
  results.after = await measure('Back in main tab (1200x800)', 15000);
  console.log('JSON', JSON.stringify(results));
  await browser.close();
})();
