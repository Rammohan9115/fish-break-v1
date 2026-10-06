// Moving the live tank canvas into another document (the Mini Tank window) and back. Written against tiny structural types so
// it can be unit-tested without a DOM.

export interface ChildLike {
  parentNode: ParentLike | null;
  nextSibling: ChildLike | null;
}

export interface ParentLike {
  appendChild(node: ChildLike): unknown;
  insertBefore(node: ChildLike, before: ChildLike | null): unknown;
  contains(node: ChildLike | null): boolean;
}

/**
 * Moves `node` to the end of `target`, remembering where it was. The returned function puts it back in its old place
 * (before the sibling it had, or at the end if that sibling is gone). Calling it twice is harmless.
 */
export function moveNode(node: ChildLike, target: ParentLike): () => void {
  const home = node.parentNode;
  const before = node.nextSibling;
  target.appendChild(node);
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (!home) return;
    home.insertBefore(node, before && home.contains(before) ? before : null);
  };
}
