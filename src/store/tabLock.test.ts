import { describe, expect, it, vi } from 'vitest';
import { TabLock, type ChannelLike, type LockManagerLike } from './tabLock';

/** A tiny Web Locks stand-in: one named lock, ifAvailable and steal. */
class FakeLocks implements LockManagerLike {
  private holder: { reject: (e: Error) => void } | null = null;
  request(_name: string, options: { ifAvailable?: boolean; steal?: boolean }, callback: (lock: unknown) => Promise<void> | void): Promise<unknown> {
    if (this.holder && options.ifAvailable) return Promise.resolve(callback(null));
    return new Promise((resolve, reject) => {
      this.holder?.reject(new DOMException('stolen', 'AbortError'));
      const mine = { reject };
      this.holder = mine;
      void Promise.resolve(callback({})).then((value) => {
        // The callback finished: the lock is released.
        if (this.holder === mine) this.holder = null;
        resolve(value);
      });
    });
  }
}

class Bus {
  channels: FakeChannel[] = [];
}
class FakeChannel implements ChannelLike {
  private listeners = new Set<(e: { data: unknown }) => void>();
  constructor(private bus: Bus) {
    bus.channels.push(this);
  }
  postMessage(message: unknown): void {
    for (const c of this.bus.channels) if (c !== this) for (const l of c.listeners) l({ data: message });
  }
  addEventListener(_t: 'message', l: (e: { data: unknown }) => void): void {
    this.listeners.add(l);
  }
  removeEventListener(_t: 'message', l: (e: { data: unknown }) => void): void {
    this.listeners.delete(l);
  }
  close(): void {
    this.listeners.clear();
  }
}

function makeTab(locks: LockManagerLike | null, bus: Bus) {
  const log = { flushes: 0, lost: 0 };
  const lock = new TabLock({
    locks,
    openChannel: () => new FakeChannel(bus),
    flush: () => {
      log.flushes += 1;
    },
    onLost: () => {
      log.lost += 1;
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  return { lock, log };
}

describe('TabLock', () => {
  it('releases the lock on dispose, so a remount (React StrictMode) leads again', async () => {
    const locks = new FakeLocks();
    const bus = new Bus();
    const first = makeTab(locks, bus);
    expect(await first.lock.claim()).toBe(true);
    first.lock.dispose();
    await new Promise((r) => setTimeout(r, 0));
    const second = makeTab(locks, bus);
    expect(await second.lock.claim()).toBe(true);
    expect(first.lock.isLeader).toBe(false);
  });

  it('leads when Web Locks are unsupported', async () => {
    const { lock } = makeTab(null, new Bus());
    expect(await lock.claim()).toBe(true);
    expect(lock.isLeader).toBe(true);
  });

  it('a page that reloads just before the old lock is released still leads', async () => {
    const locks = new FakeLocks();
    const bus = new Bus();
    const old = makeTab(locks, bus);
    await old.lock.claim();
    const fresh = makeTab(locks, bus);
    const claiming = fresh.lock.claim();
    setTimeout(() => old.lock.dispose(), 40); // the old page lets go shortly after
    expect(await claiming).toBe(true);
  });

  it('the first tab leads, a second tab becomes a follower', async () => {
    const locks = new FakeLocks();
    const bus = new Bus();
    const a = makeTab(locks, bus);
    const b = makeTab(locks, bus);
    expect(await a.lock.claim()).toBe(true);
    expect(await b.lock.claim()).toBe(false);
    expect(b.lock.isLeader).toBe(false);
  });

  it('"Play here" makes the leader save first, then swaps the roles', async () => {
    const locks = new FakeLocks();
    const bus = new Bus();
    const a = makeTab(locks, bus);
    const b = makeTab(locks, bus);
    await a.lock.claim();
    await b.lock.claim();
    await b.lock.takeOver();
    await new Promise((r) => setTimeout(r, 0));
    expect(b.lock.isLeader).toBe(true);
    expect(a.lock.isLeader).toBe(false);
    expect(a.log.flushes).toBeGreaterThanOrEqual(1); // saved on request (and again as it lost the lock)
    expect(a.log.lost).toBe(1);
    expect(b.log.lost).toBe(0);
  });

  it('takes over after the timeout when the old leader never answers', async () => {
    const locks = new FakeLocks();
    const a = makeTab(locks, new Bus()); // a different bus: nobody hears the handover request
    const b = makeTab(locks, new Bus());
    await a.lock.claim();
    await b.lock.claim(); // (real timers: it looks a few times before giving up)
    vi.useFakeTimers();
    const done = b.lock.takeOver();
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(b.lock.isLeader).toBe(true);
    vi.useRealTimers();
  });
});
