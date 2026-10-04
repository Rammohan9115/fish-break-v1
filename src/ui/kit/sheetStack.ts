// Open sheets/dialogs, newest last. Esc closes only the topmost one (App asks here first).
const stack: { id: number; close: () => void }[] = [];
let seq = 0;

/** Registers a sheet's close handler; returns the unregister function. */
export function pushSheet(close: () => void): () => void {
  seq += 1;
  const entry = { id: seq, close };
  stack.push(entry);
  return () => {
    const i = stack.findIndex((e) => e.id === entry.id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Closes the topmost sheet. Returns false when none is open. */
export function closeTopSheet(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function openSheetCount(): number {
  return stack.length;
}
