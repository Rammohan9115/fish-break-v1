const { chromium } = require('@playwright/test');
const fs = require('fs');
const shot = async (ctx, p, file) => {
  const s = await ctx.newCDPSession(p);
  const r = await s.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
};
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  await page.route('http://localhost:54321/**', (r) => r.abort());
  await page.goto('http://localhost:5198/');
  await page.waitForFunction(() => '__fishbowl' in window, null, { timeout: 20000 });
  await page.evaluate(`(() => { const { store, utils } = window.__fishbowl; const now = Date.now();
    const fish = ['danio','guppy','goldfish','tetra'].map((s,i)=>utils.makeFish({speciesId:s,stage:'adult',growth:99999,hunger:30,happiness:90,name:'F'+i,bornAt:now-1e7,lastDropAt:now,lastBredAt:null}));
    store.getState().loadState(utils.makeState({fish, overrides:{level:14,shells:2000,lastTickAt:now,lastDailyGift:new Date().toISOString().slice(0,10)}})); store.setState({onboardingStep:null}); })()`);
  await page.waitForTimeout(800);
  await page.keyboard.press('p'); // keyboard shortcut = user activation
  await page.waitForTimeout(2500);
  const pip = ctx.pages().find((p) => p !== page);
  if (!pip) { console.log('NO PIP'); console.log(logs); await browser.close(); return; }
  const info = () => pip.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { win: [innerWidth, innerHeight], canvasCss: [Math.round(r.width), Math.round(r.height)], canvasPx: [c.width, c.height], dpr: devicePixelRatio, bar: getComputedStyle(document.querySelector('.mini-bar')).opacity, sheets: document.styleSheets.length, font: getComputedStyle(document.body).fontFamily.slice(0, 30) }; });
  console.log('open', JSON.stringify(await info()));
  console.log('main canvas count (should be 0):', await page.locator('canvas').count());
  await shot(ctx, pip, 'qa/mini/pip-idle.png');
  // hover → bar
  await pip.mouse.move(200, 120);
  await pip.waitForTimeout(500);
  console.log('bar opacity on hover', (await info()).bar);
  await shot(ctx, pip, 'qa/mini/pip-hover.png');
  // Feed toggle and drop food
  await pip.getByRole('button', { name: /Feed/ }).click();
  const mode = () => page.evaluate(() => window.__fishbowl.store.getState().mode);
  const pellets = () => page.evaluate(() => { const g = window.__fishbowl.store.getState().game; return g.tanks.find(t => t.id === g.activeTankId).pellets.length; });
  console.log('mode after Feed click', await mode());
  await pip.mouse.click(200, 150);
  await pip.waitForTimeout(300);
  console.log('pellets after tap in PiP', await pellets());
  // tap a fish in look mode -> hint
  await pip.getByRole('button', { name: /Feed/ }).click();
  console.log('mode back to', await mode());
  // press-and-hold petting somewhere: find a fish position via renderer
  const pos = await page.evaluate(() => { const g = window.__fishbowl.store.getState().game; const r = window.__fishbowl.renderer(); const f = g.fish[0]; return r.fishScreenPoint(f.id); });
  console.log('fish point (client in PiP)', JSON.stringify(pos));
  if (pos) {
    await pip.mouse.move(pos.x, pos.y);
    await pip.mouse.down();
    await pip.waitForTimeout(600);
    const pet = await page.evaluate(() => window.__fishbowl.store.getState().petProgress ?? null);
    console.log('petProgress while holding', JSON.stringify(pet));
    await pip.mouse.up();
    await pip.mouse.click(pos.x, pos.y);
    await pip.waitForTimeout(300);
    console.log('hint visible after fish tap', await pip.locator('.mini-hint').count());
  }
  // resize the PiP window via CDP window bounds
  const s = await ctx.newCDPSession(pip);
  const { windowId } = await s.send('Browser.getWindowForTarget');
  for (const [w, h] of [[300, 200], [800, 500]]) {
    await s.send('Browser.setWindowBounds', { windowId, bounds: { width: w, height: h } });
    await pip.waitForTimeout(700);
    console.log('resized', w, h, JSON.stringify(await info()));
    await shot(ctx, pip, `qa/mini/pip-${w}x${h}.png`);
  }
  await page.screenshot({ path: 'qa/mini/main-while-floating.png' });
  // Back to game
  await pip.mouse.move(100, 100);
  await pip.getByRole('button', { name: /Back to game/ }).click();
  await page.waitForTimeout(1200);
  console.log('after back: pages', ctx.pages().length, 'main canvas', await page.locator('canvas').count(), 'placeholder', await page.locator('.mini-placeholder').count());
  console.log('main canvas size', await page.evaluate(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), c.width, c.height]; }));
  await page.screenshot({ path: 'qa/mini/main-after.png' });
  // reopen then close with window close (✕ equivalent)
  await page.keyboard.press('p');
  await page.waitForTimeout(2000);
  const pip2 = ctx.pages().find((p) => p !== page);
  console.log('reopened', !!pip2);
  await pip2.close();
  await page.waitForTimeout(1000);
  console.log('after ✕: main canvas', await page.locator('canvas').count(), 'placeholder', await page.locator('.mini-placeholder').count());
  console.log(logs.join('\n') || 'no page errors');
  await browser.close();
})();
