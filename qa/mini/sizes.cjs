const { chromium } = require('@playwright/test');
const fs = require('fs');
const shot = async (ctx, p, file) => { const s = await ctx.newCDPSession(p); const r = await s.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); };
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  await page.route('http://localhost:54321/**', (r) => r.abort());
  await page.goto('http://localhost:5198/');
  await page.waitForFunction(() => '__fishbowl' in window, null, { timeout: 20000 });
  await page.evaluate(`(() => { const { store, utils } = window.__fishbowl; const now = Date.now();
    const fish = ['danio','guppy','goldfish','tetra'].map((s,i)=>utils.makeFish({speciesId:s,stage:'adult',growth:99999,hunger:30,happiness:90,name:'F'+i,bornAt:now-1e7,lastDropAt:now,lastBredAt:null}));
    store.getState().loadState(utils.makeState({fish, overrides:{level:14,shells:2000,lastTickAt:now,lastDailyGift:new Date().toISOString().slice(0,10)}})); store.setState({onboardingStep:null}); })()`);
  await page.waitForTimeout(600);
  await page.keyboard.press('p');
  await page.waitForTimeout(2000);
  const pip = ctx.pages().find((p) => p !== page);
  for (const [w, h] of [[300, 200], [400, 260], [800, 500]]) {
    await pip.setViewportSize({ width: w, height: h });
    await pip.waitForTimeout(600);
    await pip.mouse.move(40, 40);
    await pip.waitForTimeout(500);
    const m = await pip.evaluate(() => {
      const c = document.querySelector('canvas'); const bar = document.querySelector('.mini-bar'); const r = bar.getBoundingClientRect();
      const fs = [...bar.querySelectorAll('*')].map((e) => parseFloat(getComputedStyle(e).fontSize));
      const btns = [...bar.querySelectorAll('button,.mini-shells')].map((e) => e.getBoundingClientRect());
      let ov = 0; for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) { const a = btns[i], b = btns[j]; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) ov++; }
      return { canvasPx: [c.width, c.height], barH: Math.round(r.height), barRight: Math.round(Math.max(...btns.map((b) => b.right))), minFont: Math.min(...fs), overlaps: ov };
    });
    console.log(w + 'x' + h, JSON.stringify(m));
    await shot(ctx, pip, `qa/mini/size-${w}x${h}.png`);
  }
  await browser.close();
})();
