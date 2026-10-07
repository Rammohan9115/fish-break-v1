/* global window, document, performance, console */
// Trailer capture: virtual clock + seeded RNG. Injected by scripts/trailer/record.ts with page.addInitScript BEFORE the
// game's own scripts run, so every timer, animation frame and clock read the game makes goes through this file.
// Nothing here ships: the game never imports it, and the capture hooks (src/dev/capture.ts) exist only in `vite` dev.
//
// Virtual time only moves when `__vclock.step(ms)` is called, so a slow screenshot can never cause a dropped frame.
(() => {
  if (window.__vclock) return;
  window.__name = (f) => f; // esbuild/tsx keepNames helper, used when scene functions are serialized into the page
  const real = {
    setTimeout: window.setTimeout.bind(window),
    Date,
    now: performance.now.bind(performance),
  };
  const cfg = window.__VCLOCK_CONFIG || {};
  const wallStart = cfg.wallStart || real.Date.now();
  const perfBase = 1000;
  let t = 0; // virtual ms since page start
  let seq = 0;
  const timers = new Map(); // id -> { id, due, fn, args, every, order }
  let rafQueue = [];
  let rafId = 0;
  const hooks = []; // run once per step, before animation frames fire: (ms, t) => void

  const vNow = () => wallStart + Math.floor(t);
  const vPerf = () => perfBase + t;

  // ---- Date ----
  const RealDate = real.Date;
  class VDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(vNow());
      else super(...args);
    }
    static now() {
      return vNow();
    }
  }
  window.Date = VDate;
  performance.now = vPerf;

  // ---- timers ----
  const addTimer = (fn, delay, args, every) => {
    const d = Math.max(0, Number(delay) || 0);
    const id = ++seq;
    timers.set(id, { id, due: t + d, fn, args, every: every ? Math.max(1, d) : 0, order: id });
    return id;
  };
  window.setTimeout = (fn, delay, ...args) => addTimer(typeof fn === 'function' ? fn : () => {}, delay, args, false);
  window.setInterval = (fn, delay, ...args) => addTimer(typeof fn === 'function' ? fn : () => {}, delay, args, true);
  window.clearTimeout = (id) => void timers.delete(id);
  window.clearInterval = (id) => void timers.delete(id);
  window.requestAnimationFrame = (cb) => {
    rafQueue.push({ id: ++rafId, cb });
    return rafId;
  };
  window.cancelAnimationFrame = (id) => {
    rafQueue = rafQueue.filter((r) => r.id !== id);
  };
  window.requestIdleCallback = (cb) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 10 }), 1);
  window.cancelIdleCallback = (id) => window.clearTimeout(id);

  // ---- seeded RNG (mulberry32) ----
  let rngState = (cfg.seed ?? 20261007) >>> 0;
  const rng = () => {
    rngState = (rngState + 0x6d2b79f5) >>> 0;
    let x = rngState;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rng;

  // CSS animations/transitions run on the compositor's real clock; drive them from virtual time too.
  const driveAnimations = (ms) => {
    if (!document.getAnimations) return;
    for (const a of document.getAnimations()) {
      if (!a.__v) {
        a.__v = true;
        a.pause();
        a.currentTime = 0;
      }
      a.currentTime = (Number(a.currentTime) || 0) + ms;
    }
  };

  const runDueTimers = (target) => {
    for (;;) {
      let next = null;
      for (const tm of timers.values()) {
        if (tm.due <= target && (!next || tm.due < next.due || (tm.due === next.due && tm.order < next.order))) next = tm;
      }
      if (!next) break;
      t = Math.max(t, next.due);
      if (next.every) {
        next.due += next.every;
        next.order = ++seq;
      } else timers.delete(next.id);
      try {
        next.fn(...next.args);
      } catch (e) {
        console.error('[vclock] timer error', e);
      }
    }
  };

  const realTick = () => new Promise((r) => real.setTimeout(r, 0));

  window.__vclock = {
    get now() {
      return t;
    },
    hooks,
    realSetTimeout: real.setTimeout,
    realWait: (ms) => new Promise((r) => real.setTimeout(r, ms)),
    /** Advance virtual time by `ms`, firing due timers, tween hooks, then exactly one animation-frame batch. */
    async step(ms) {
      const target = t + ms;
      runDueTimers(target);
      t = target;
      for (const h of hooks) h(ms, t);
      driveAnimations(ms);
      const queue = rafQueue;
      rafQueue = [];
      for (const r of queue) {
        try {
          r.cb(vPerf());
        } catch (e) {
          console.error('[vclock] raf error', e);
        }
      }
      // Let React flush and images/fonts settle before the screenshot.
      await realTick();
    },
    /** Step several frames without screenshots (loading, settling). */
    async run(ms, dt = 1000 / 60) {
      for (let done = 0; done < ms; done += dt) await this.step(Math.min(dt, ms - done));
    },
    seed(n) {
      rngState = n >>> 0;
    },
  };
})();
