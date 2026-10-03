// In-memory stand-ins for localStorage, window, and document (tests only).
import type { AutosaveEnv } from './save';

export class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

class FakeEventSource {
  private listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, fn: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  dispatch(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

export function fakeEnv() {
  const storage = new MemoryStorage();
  const win = new FakeEventSource();
  const doc = Object.assign(new FakeEventSource(), { visibilityState: 'visible' });
  const env: AutosaveEnv = {
    storage,
    window: win,
    document: doc,
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  };
  return { env, storage, win, doc };
}
