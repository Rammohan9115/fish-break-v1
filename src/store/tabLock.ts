// Single-writer across tabs. Two tabs each run their own sim and autosave, so whichever saved last would erase the
// other's progress. The first tab takes a Web Lock and leads; later tabs are followers (their save is locked and the
// UI asks "Play here?"). Taking over asks the leader to save first (BroadcastChannel), then steals the lock.
// Where Web Locks don't exist everyone is a leader (the old behavior).
import { TAB_CLAIM_RETRIES, TAB_CLAIM_RETRY_MS, TAB_HANDOVER_TIMEOUT_MS, TAB_LOCK_NAME } from '../game/constants';

export interface LockManagerLike {
  request(name: string, options: { ifAvailable?: boolean; steal?: boolean }, callback: (lock: unknown) => Promise<void> | void): Promise<unknown>;
}

export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (e: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (e: { data: unknown }) => void): void;
  close(): void;
}

export interface TabLockHooks {
  locks: LockManagerLike | null;
  openChannel: () => ChannelLike | null;
  /** Save now: called when another tab asks to take over, and just before this tab stops leading. */
  flush: () => void;
  /** This tab stopped leading (another tab took over). */
  onLost: () => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

type Message = { type: 'handover' } | { type: 'flushed' };

const isMessage = (v: unknown): v is Message => typeof v === 'object' && v !== null && 'type' in v;

export class TabLock {
  private channel: ChannelLike | null = null;
  private leading = false;
  private disposed = false;
  /** Lets go of the Web Lock this tab holds (resolves the promise the browser is waiting on). */
  private release: (() => void) | null = null;
  private readonly onMessage = (e: { data: unknown }) => {
    if (!isMessage(e.data) || e.data.type !== 'handover' || !this.leading) return;
    this.hooks.flush();
    this.channel?.postMessage({ type: 'flushed' } satisfies Message);
  };

  constructor(private readonly hooks: TabLockHooks) {}

  get isLeader(): boolean {
    return this.leading;
  }

  /** Tries to become the leader. Resolves true if this tab leads (always, where locks are unsupported). */
  async claim(): Promise<boolean> {
    this.channel ??= this.hooks.openChannel();
    this.channel?.addEventListener('message', this.onMessage);
    if (!this.hooks.locks) return this.lead();
    // A page that just reloaded (or a React StrictMode remount) can ask a moment before the old page's lock is
    // released, so look a few times before concluding that another tab really is playing.
    for (let attempt = 0; attempt <= TAB_CLAIM_RETRIES; attempt++) {
      if (this.disposed) return false;
      if (await this.acquire({ ifAvailable: true })) return true;
      if (attempt < TAB_CLAIM_RETRIES) await new Promise<void>((resolve) => this.hooks.setTimeout(resolve, TAB_CLAIM_RETRY_MS));
    }
    return false;
  }

  /** "Play here": the current leader saves, then this tab takes the lock. Resolves once this tab leads. */
  async takeOver(): Promise<void> {
    if (!this.hooks.locks) return;
    await this.requestFlush();
    await this.acquire({ steal: true });
  }

  dispose(): void {
    this.disposed = true;
    this.leading = false;
    // Without this the lock stays held until the page closes: a remount (React StrictMode, hot reload) would then
    // wrongly see "another tab" and lock itself out.
    this.release?.();
    this.release = null;
    this.channel?.removeEventListener('message', this.onMessage);
    this.channel?.close();
    this.channel = null;
  }

  private lead(): boolean {
    this.leading = true;
    return true;
  }

  /** Holds the lock until the page closes or another tab steals it. */
  private acquire(options: { ifAvailable?: boolean; steal?: boolean }): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      void this.hooks.locks!
        .request(TAB_LOCK_NAME, options, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          if (this.disposed) {
            resolve(false);
            return undefined;
          }
          this.lead();
          resolve(true);
          // Held until the page closes, another tab steals it, or dispose() releases it.
          return new Promise<void>((done) => {
            this.release = done;
          });
        })
        .catch(() => {
          // Stolen: the browser rejects the held request.
          if (this.leading && !this.disposed) {
            this.leading = false;
            this.hooks.flush();
            this.hooks.onLost();
          }
        });
    });
  }

  /** Asks the leader to save and waits (briefly) for its answer so the new leader loads fresh data. */
  private requestFlush(): Promise<void> {
    const channel = this.channel;
    if (!channel) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        this.hooks.clearTimeout(timer);
        channel.removeEventListener('message', listener);
        resolve();
      };
      const listener = (e: { data: unknown }) => {
        if (isMessage(e.data) && e.data.type === 'flushed') done();
      };
      const timer = this.hooks.setTimeout(done, TAB_HANDOVER_TIMEOUT_MS);
      channel.addEventListener('message', listener);
      channel.postMessage({ type: 'handover' } satisfies Message);
    });
  }
}

/** The real browser plumbing. */
export function browserTabLockHooks(flush: () => void, onLost: () => void): TabLockHooks {
  const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? (navigator.locks as unknown as LockManagerLike) : null;
  return {
    locks,
    // Without Web Locks nobody ever hands over, so no channel is needed either.
    openChannel: () => (locks && typeof BroadcastChannel !== 'undefined' ? (new BroadcastChannel(TAB_LOCK_NAME) as unknown as ChannelLike) : null),
    flush,
    onLost,
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (h) => window.clearTimeout(h as number),
  };
}
