// While the save is "locked" nothing may write it (local autosave or cloud push):
//  - 'newer'     the save on this device came from a newer version of the game (e.g. after a rollback). It stays
//                untouched until the player reloads into the right version.
//  - 'other-tab' another tab is the leader (see tabLock.ts); two tabs writing the same save would overwrite each other.
import { create } from 'zustand';

export type SaveLockReason = 'newer' | 'other-tab';

export const useSaveLock = create<{ reason: SaveLockReason | null }>()(() => ({ reason: null }));

export const isSaveLocked = (): boolean => useSaveLock.getState().reason !== null;

export function setSaveLock(reason: SaveLockReason | null): void {
  useSaveLock.setState({ reason });
}
