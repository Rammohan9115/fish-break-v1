const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  ctx.on('page', (p) => logs.push('NEW PAGE ' + p.url()));
  await page.route('http://localhost:54321/**', (r) => r.abort());
  await page.goto('http://localhost:5198/');
  await page.waitForFunction(() => '__fishbowl' in window, null, { timeout: 20000 });
  await page.evaluate(`(() => { const { store, utils } = window.__fishbowl; const now = Date.now();
    const fish = ['danio','guppy','goldfish'].map((s,i)=>utils.makeFish({speciesId:s,stage:'adult',growth:99999,hunger:60,happiness:90,name:'F'+i,bornAt:now-1e7,lastDropAt:now,lastBredAt:null}));
    store.getState().loadState(utils.makeState({fish, overrides:{level:14,shells:2000,lastTickAt:now,lastDailyGift:new Date().toISOString().slice(0,10)}})); store.setState({onboardingStep:null}); })()`);
  await page.waitForTimeout(800);
  console.log('support', await page.evaluate(() => 'documentPictureInPicture' in window));
  await page.keyboard.press('t');
  await page.waitForTimeout(500);
  const btn = page.getByRole('button', { name: /Mini Tank/ }).first();
  console.log('button count', await page.getByRole('button', { name: /Mini Tank/ }).count());
  await btn.click();
  await page.waitForTimeout(2500);
  console.log('placeholder', await page.locator('.mini-placeholder').count(), 'pages', ctx.pages().map((p) => p.url()));
  await page.screenshot({ path: 'qa/mini/main-while-floating.png' });
  for (const p of ctx.pages()) { if (p !== page) { await p.screenshot({ path: 'qa/mini/pip.png' }).catch((e) => console.log('pip shot fail', e.message)); } }
  console.log(logs.slice(0, 20).join('\n'));
  await browser.close();
})();
