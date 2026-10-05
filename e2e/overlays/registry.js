// Every overlay the game can show, and how to open it (through the dev hooks `window.__fishbowl`). Adding an overlay
// to the game means adding it here: the overlay matrix (e2e/overlays.spec.ts and scripts/audit/overlays.mjs) then checks
// it on every screen. `kind` is what it should become (dialog, panel, card, popover, banner, coach, toast).
// `fit: true` = fit budget: its body must not need scrolling.

/** Seeds a mid-game tank with everything the overlays need (adult pairs, decor, nursery baby). */
const SEED = `(() => {
  const { store, utils } = window.__fishbowl; const now = Date.now();
  const mk = (s, i) => utils.makeFish({ speciesId: s, stage: 'adult', growth: 99999, hunger: 80, happiness: 90, name: 'Fish' + i, bornAt: now - 1e7, lastDropAt: now, lastBredAt: null });
  const fish = ['danio', 'guppy', 'goldfish', 'goldfish', 'tetra', 'betta'].map(mk);
  const decor = ['plant_tall', 'castle', 'rock'].map((d, i) => ({ id: 'd' + i, decorId: d, x: 200 + i * 250, flipped: false, size: 'M', z: 0.5 }));
  const baby = { ...utils.makeFish({ speciesId: 'guppy', stage: 'baby', growth: 0, name: 'Pip', bornAt: now }), tankId: '' };
  const g = utils.makeState({ fish, tank: { decor }, overrides: { level: 12, shells: 2000, pearls: 7, lastTickAt: now, lastDailyGift: new Date().toISOString().slice(0, 10), nursery: [baby] } });
  store.getState().loadState(g);
  store.setState({ onboardingStep: null, guideOpen: false });
})()`;

/** Closes everything so the next overlay starts clean. */
const RESET = `(() => {
  const s = window.__fishbowl.store;
  s.getState().cancelPairing?.();
  s.getState().cancelTry?.();
  s.setState({ panel: null, mode: 'look', selectedFishId: null, selectedDecorId: null, quickFishId: null, pairSheet: null,
    pairingFishId: null, guideOpen: false, pendingLevelUps: [], breakSession: null, onboardingStep: null, toasts: [], tryDecor: null });
  window.__fishbowl.cloud.setState({ conflict: null });
  window.__fishbowl.saveLock.setState({ reason: null });
  window.__fishbowl.pwa.setState({ needRefresh: false });
})()`;

const st = (expr) => `(() => { const s = window.__fishbowl.store; const g = s.getState(); ${expr} })()`;
const openWith = (expr) => (page) => page.evaluate(st(expr));

const clickText = async (page, name) => {
  await page.getByRole('button', { name }).first().click();
};

const OVERLAYS = [
  // ---- cards / popovers (non-blocking, anchored to something in the tank)
  { id: 'fishcard', kind: 'card', fit: true, selector: '.fishcard', open: openWith('s.setState({ selectedFishId: g.game.fish[2].id });') },
  { id: 'quick-actions', kind: 'popover', fit: true, selector: '.quick', open: openWith('g.showQuickActions(g.game.fish[2].id);') },
  { id: 'decorcard', kind: 'card', fit: true, selector: '.decorcard', open: openWith('g.selectDecor(g.game.tanks[0].decor[0].id);') },
  { id: 'decor-toolbar', kind: 'popover', fit: true, selector: '.decor-tools', open: openWith("g.setMode('decorate'); s.getState().selectDecor(g.game.tanks[0].decor[0].id);") },
  // ---- panels
  { id: 'shop-fish', kind: 'panel', selector: '.shop', open: openWith("g.openPanel('shop', 'fish');") },
  { id: 'shop-food', kind: 'panel', selector: '.shop', open: openWith("g.openPanel('shop', 'food');") },
  { id: 'shop-decor', kind: 'panel', selector: '.shop', open: openWith("g.openPanel('shop', 'decor');") },
  { id: 'shop-styles', kind: 'panel', selector: '.shop', open: openWith("g.openPanel('shop', 'styles');") },
  { id: 'shop-tanks', kind: 'panel', selector: '.shop', open: openWith("g.openPanel('shop', 'tanks');") },
  { id: 'breeding-pairs', kind: 'panel', selector: '.sheet', open: openWith("g.openBreeding('pairs');") },
  { id: 'breeding-nursery', kind: 'panel', selector: '.sheet', open: openWith("g.openBreeding('nursery');") },
  { id: 'myfish', kind: 'panel', selector: '.myfish', open: openWith("g.openPanel('myfish');") },
  { id: 'tanks', kind: 'panel', selector: '.sheet', open: openWith("g.openPanel('tanks');") },
  { id: 'settings', kind: 'panel', selector: '.settings', open: openWith("g.openPanel('settings');") },
  { id: 'settings-login', kind: 'panel', selector: '.settings', open: async (page) => { await page.evaluate(st("g.openPanel('settings');")); await clickText(page, /Save progress/); } },
  { id: 'decor-tray-box', kind: 'panel', selector: '.decor-tray', open: openWith("g.setMode('decorate'); s.setState({ trayTab: 'box' });") },
  { id: 'decor-tray-layouts', kind: 'panel', selector: '.decor-tray', open: openWith("g.setMode('decorate'); s.setState({ trayTab: 'layouts' });") },
  { id: 'decor-tray-style', kind: 'panel', selector: '.decor-tray', open: openWith("g.setMode('decorate'); s.setState({ trayTab: 'style' });") },
  // ---- dialogs (fit budget: never scroll)
  { id: 'levelup', kind: 'dialog', fit: true, selector: '.levelup', open: openWith('s.setState({ pendingLevelUps: [13] });') },
  { id: 'pair-confirm', kind: 'dialog', fit: true, selector: '.sheet', open: openWith('const gf = g.game.fish.filter((f) => f.speciesId === "goldfish"); g.startPairing(gf[0].id, gf[1].id);') },
  { id: 'breeding-guide', kind: 'dialog', fit: true, selector: '.guide', open: openWith('s.setState({ guideOpen: true });') },
  { id: 'break-setup', kind: 'dialog', fit: true, selector: '.sheet', open: openWith("g.openPanel('break');") },
  { id: 'confirm-sell-fish', kind: 'dialog', fit: true, selector: '.confirm', open: async (page) => { await page.evaluate(st('s.setState({ selectedFishId: g.game.fish[2].id });')); await clickText(page, /More actions/); await clickText(page, /^Sell for/); } },
  { id: 'confirm-reset', kind: 'dialog', fit: true, selector: '.confirm', open: async (page) => {
      await page.evaluate(st("g.openPanel('settings');"));
      // Settings remembers its login view between openings (a known quirk): go back to the main view first.
      const later = page.getByRole('button', { name: 'Maybe later' });
      if (await later.isVisible().catch(() => false)) await later.click();
      await clickText(page, /Reset game/);
    } },
  { id: 'update-prompt', kind: 'dialog', fit: true, selector: '.confirm', open: (page) => page.evaluate('window.__fishbowl.pwa.setState({ needRefresh: true })') },
  { id: 'save-lock', kind: 'dialog', fit: true, selector: '.confirm', open: (page) => page.evaluate("window.__fishbowl.saveLock.setState({ reason: 'other-tab' })") },
  { id: 'cloud-conflict', kind: 'dialog', fit: true, selector: '.conflict', open: (page) => page.evaluate('(() => { const g = window.__fishbowl.store.getState().game; window.__fishbowl.cloud.setState({ conflict: { local: g, cloud: { ...g, level: g.level + 2, shells: g.shells + 500 }, cloudUpdatedAt: "2026-10-05T10:00:00Z" } }); })()') },
  { id: 'daily-gift', kind: 'dialog', fit: true, selector: '.gift-reveal', open: async (page) => { await page.evaluate(st("s.setState({ game: { ...g.game, lastDailyGift: '2000-01-01' } });")); await page.getByRole('button', { name: 'Open your daily gift' }).dispatchEvent('click'); } },
  // ---- guidance
  { id: 'coachmark', kind: 'coach', fit: true, selector: '.coachmark', open: openWith('s.setState({ onboardingStep: 1 });') },
  { id: 'toasts', kind: 'toast', fit: true, selector: '.toast', open: openWith("g.addToast('While you were away (8h): 185 shells waiting on the sand, 2 eggs hatched'); g.addToast('Another one that is long enough to wrap');") },
  { id: 'try-it-banner', kind: 'banner', fit: true, selector: '.banner', open: openWith("g.startTry('rock');") },
];

/** Waits (at most 600ms) for the overlay's entrance animation to finish, so geometry is measured at rest. Long-running ones (the gift card fades out after 3s) are not waited for. */
const settle = (page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || !a.effect || a.effect.getComputedTiming().iterations === Infinity), null, { timeout: 600 }).catch(() => undefined);

module.exports = { OVERLAYS, SEED, RESET, settle };
