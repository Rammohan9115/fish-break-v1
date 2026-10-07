// Trailer recorder: drives the game in Chromium on a virtual clock and screenshots every frame.
//   npx tsx scripts/trailer/record.ts [--layout wide|tall|both] [--scenes hook,reveal] [--fps 60] [--every N] [--out trailer/frames]
// `--every N` keeps one screenshot in N (fast preview; the game still steps every frame). Output: <out>/<layout>/<scene>/%05d.png
import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_NAME, OVERLAP_FRAMES, URL_TEXT, scenes, type Layout, type Scene } from './scenes';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const FPS = Number(arg('fps', '60'));
const EVERY = Number(arg('every', '1'));
const OUT = path.resolve(ROOT, arg('out', 'trailer/frames'));
const PORT = Number(arg('port', '5198'));
const BASE = `http://localhost:${PORT}`;
const LAYOUTS: Layout[] = arg('layout', 'both') === 'both' ? ['wide', 'tall'] : [arg('layout', 'wide') as Layout];
const ONLY = arg('scenes', '').split(',').filter(Boolean);
const SIZE: Record<Layout, { width: number; height: number }> = { wide: { width: 1920, height: 1080 }, tall: { width: 1080, height: 1920 } };

async function serverUp(): Promise<boolean> {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

/** Uses a dev server already on the port (npm run dev / test:e2e) or starts one for this run. */
async function ensureServer(): Promise<ChildProcess | null> {
  if (await serverUp()) return null;
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    // Never let the capture run touch the real cloud project: no Supabase keys, no analytics key.
    env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_ANALYTICS_KEY: '' },
  });
  for (let i = 0; i < 120; i++) {
    if (await serverUp()) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error('dev server did not start');
}

async function launch(): Promise<Browser> {
  const common = { args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--hide-scrollbars', '--mute-audio'] };
  try {
    return await chromium.launch({ channel: 'chrome', ...common });
  } catch {
    return await chromium.launch(common);
  }
}

async function openPage(browser: Browser, layout: Layout): Promise<Page> {
  const ctx = await browser.newContext({ viewport: SIZE[layout], deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn('  [page error]', e.message));
  // Only the local dev server: no cloud saves, no analytics, nothing external.
  await page.route((u) => u.hostname !== 'localhost', (r) => r.abort());
  await page.addInitScript({ content: fs.readFileSync(path.join(ROOT, 'scripts/trailer/inject.js'), 'utf8') });
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto(BASE + '/?capture=1');
  const ready = () => page.evaluate(() => !!((window as never as { __fishbowl?: { capture?: unknown } }).__fishbowl?.capture) && !!document.querySelector('.hud'));
  for (let i = 0; i < 1500 && !(await ready()); i++) {
    await page.evaluate(() => (window as never as { __vclock: { step(n: number): void } }).__vclock.step(16.7));
    await page.waitForTimeout(15);
  }
  await page.evaluate(() => document.fonts.ready);
  return page;
}

const cueSrc = (fn: unknown) => String(fn).replaceAll('__NAME__', GAME_NAME).replaceAll('__URL__', URL_TEXT);

async function recordScene(browser: Browser, layout: Layout, scene: Scene): Promise<void> {
  const page = await openPage(browser, layout);
  const dir = path.join(OUT, layout, scene.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const dt = 1000 / FPS;
  const spec = scene.spec(layout);
  // Set the scene up, let fish settle into swimming, then pin the fish that need a starting spot.
  await page.evaluate(
    ([s]) => {
      const c = (window as never as { __fishbowl: { capture: CaptureApi } }).__fishbowl.capture;
      c.prepare();
      (window as never as { __ids: unknown }).__ids = c.load(s as never);
    },
    [spec] as const,
  );
  await page.evaluate(() => (window as never as { __vclock: { step(n: number): void } }).__vclock.step(16.7));
  await page.evaluate(() => {
    const c = (window as never as { __fishbowl: { capture: CaptureApi }; __ids: never }).__fishbowl.capture;
    c.settle((window as never as { __ids: never }).__ids);
  });
  const warmFrames = Math.round(((scene.warmup ?? 1500) / 1000) * FPS);
  const total = Math.round(scene.dur * FPS) + OVERLAP_FRAMES;
  const cues = [...scene.cues].sort((a, b) => a.at - b.at).map((q) => ({ at: q.at, src: cueSrc(q.run) }));
  if (scene.caption) {
    cues.push({ at: 150, src: `(c, L) => c.caption.show(${JSON.stringify(scene.caption)}, L, ${JSON.stringify(scene.captionPos ?? 'bottom')})` });
    cues.sort((a, b) => a.at - b.at);
  }
  let next = 0;
  // Warm-up frames (negative time) are stepped but not saved; cues with a negative `at` fire during them.
  for (let i = -warmFrames; i < total; i++) {
    const t = i * dt;
    const due: string[] = [];
    while (next < cues.length && cues[next]!.at <= t + 0.001) due.push(cues[next++]!.src);
    await page.evaluate(
      async ([srcs, L, step]) => {
        const c = (window as never as { __fishbowl: { capture: CaptureApi } }).__fishbowl.capture;
        for (const s of srcs as string[]) (0, eval)(`(${s})`)(c, L);
        await c.step(step as number);
      },
      [due, layout, dt] as const,
    );
    if (due.length) await page.evaluate(() => (window as never as { __vclock: { realWait(n: number): Promise<void> } }).__vclock.realWait(25));
    if (i >= 0 && i % EVERY === 0) await page.screenshot({ path: path.join(dir, `${String(i + 1).padStart(5, '0')}.png`), type: 'png', animations: 'allow', caret: 'initial' });
  }
  await page.context().close();
}

type CaptureApi = import('../../src/dev/capture').CaptureApi;

async function main() {
  const server = await ensureServer();
  const browser = await launch();
  try {
    const list = scenes.filter((s) => !ONLY.length || ONLY.includes(s.id));
    for (const layout of LAYOUTS) {
      for (const scene of list) {
        const t0 = Date.now();
        await recordScene(browser, layout, scene);
        console.log(`[${layout}] ${scene.id}: ${(Date.now() - t0) / 1000}s`);
      }
    }
  } finally {
    await browser.close();
    server?.kill();
  }
  void GAME_NAME;
  void URL_TEXT;
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
