// Usage: node qa/compact/shoot.cjs <before|after> [display]  (dev server on :5198 must be running)
// Screenshots six surfaces at three viewports; reports content (scroll) height, min font size and overlaps.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const tag = process.argv[2] || 'before';
const display = process.argv[3]; // optional: 'compact' | 'comfortable' (after the setting exists)
const VPS = [[375, 667], [390, 844], [1440, 900]];
const SURFACES = {
  fishcard: { open: (s) => s.selectFish(s.game.fish[0].id), root: '.fishcard' },
  shop: { open: (s) => s.openPanel('shop', 'fish'), root: '[role=dialog]' },
  myfish: { open: (s) => s.openPanel('myfish'), root: '[role=dialog]' },
  breeding: { open: (s) => s.openBreeding(), root: '[role=dialog]' },
  settings: { open: (s) => s.openPanel('settings'), root: '[role=dialog]' },
  decorate: { open: (s) => s.setMode('decorate'), root: '.decor-shelf' },
  decorbox: { open: (s) => s.setMode('decorate'), root: '.decor-window', click: /Box|Pieces|Decor/ },
};
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const out = {};
  fs.mkdirSync(`qa/compact/${tag}`, { recursive: true });
  for (const [w, h] of VPS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500 });
    const page = await ctx.newPage();
    await page.route('http://localhost:54321/**', (r) => r.abort());
    await page.addInitScript(() => { if (!sessionStorage.getItem('c')) { localStorage.clear(); sessionStorage.setItem('c', '1'); } });
    await page.goto('http://localhost:5198/');
    await page.waitForFunction(() => '__fishbowl' in window, null, { timeout: 20000 });
    await page.evaluate(`(() => {
      const { store, utils } = window.__fishbowl; const now = Date.now();
      const sp = ['danio','guppy','goldfish','goldfish','tetra','clownfish','angelfish','jellyfish'];
      const fish = sp.map((s, i) => utils.makeFish({ speciesId: s, stage: 'adult', growth: 99999, hunger: 60, happiness: 90, name: 'Fish' + i, bornAt: now - 1e7, lastDropAt: now, lastBredAt: null }));
      const decor = ['plant_tall','castle','rock'].map((d, i) => ({ id: 'd' + i, decorId: d, x: 200 + i * 250, flipped: false, size: 'M', z: 0.5 }));
      store.getState().loadState(utils.makeState({ fish, tank: { decor }, overrides: { level: 14, shells: 2000, pearls: 7, lastTickAt: now, lastDailyGift: new Date().toISOString().slice(0, 10) } }));
      store.setState({ onboardingStep: null });
    })()`);
    if (display) await page.evaluate((d) => window.__fishbowl.store.getState().setDisplay?.(d), display);
    await page.waitForTimeout(500);
    for (const [name, s] of Object.entries(SURFACES)) {
      await page.evaluate(() => { const st = window.__fishbowl.store.getState(); st.openPanel(null); st.selectFish(null); st.setMode('look'); });
      await page.waitForTimeout(250);
      await page.evaluate(`(${s.open.toString()})(window.__fishbowl.store.getState())`);
      await page.waitForTimeout(700);
      if (s.click) { await page.getByRole('button', { name: s.click }).first().click().catch(() => {}); await page.waitForTimeout(500); }
      const m = await page.evaluate((sel) => {
        const roots = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0);
        const root = roots[roots.length - 1];
        if (!root) return null;
        let best = root;
        for (const e of root.querySelectorAll('*')) {
          const o = getComputedStyle(e).overflowY;
          if ((o === 'auto' || o === 'scroll') && e.scrollHeight > best.scrollHeight) best = e;
        }
        const small = [];
        const els = [...root.querySelectorAll('*')];
        for (const e of els) {
          if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const fs = parseFloat(getComputedStyle(e).fontSize);
          if (fs < 12) small.push(`${e.className || e.tagName}:${fs}`);
        }
        // overlap check among sibling interactive elements
        const btns = [...root.querySelectorAll('button,a,input,[role=tab]')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
        let overlaps = 0;
        for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
          const a = btns[i], b = btns[j];
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 2 && oy > 2) overlaps++;
        }
        const r = root.getBoundingClientRect();
        // natural content height: let the scroll body size itself
        const saved = best.style.cssText;
        best.style.cssText += ';height:auto;max-height:none;flex:none;overflow:visible';
        const natural = best === root ? root.scrollHeight : best.getBoundingClientRect().height;
        best.style.cssText = saved;
        return { cls: String(root.className).slice(0, 40), content: Math.round(natural), scroll: best.scrollHeight, panelH: Math.round(r.height), small: [...new Set(small)].slice(0, 6), overlaps };
      }, s.root);
      out[`${name}@${w}x${h}`] = m;
      await page.screenshot({ path: `qa/compact/${tag}/${name}-${w}x${h}.png` });
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`qa/compact/${tag}.json`, JSON.stringify(out, null, 2));
  for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
})();
