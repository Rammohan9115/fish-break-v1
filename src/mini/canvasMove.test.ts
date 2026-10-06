import { describe, expect, it } from 'vitest';
import { moveNode, type ChildLike, type ParentLike } from './canvasMove';

/** A minimal fake DOM node: just enough tree to check where a node ends up. */
class Fake implements ChildLike, ParentLike {
  parentNode: Fake | null = null;
  children: Fake[] = [];
  constructor(readonly name: string) {}
  get nextSibling(): Fake | null {
    const siblings = this.parentNode?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  private detach(node: Fake): void {
    node.parentNode?.children.splice(node.parentNode.children.indexOf(node), 1);
    node.parentNode = null;
  }
  appendChild(node: Fake): void {
    this.detach(node);
    this.children.push(node);
    node.parentNode = this;
  }
  insertBefore(node: Fake, before: Fake | null): void {
    this.detach(node);
    const at = before ? this.children.indexOf(before) : -1;
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
    node.parentNode = this;
  }
  contains(node: ChildLike | null): boolean {
    return node !== null && this.children.includes(node as Fake);
  }
}

const setup = () => {
  const main = new Fake('main');
  const canvas = new Fake('canvas');
  const gift = new Fake('gift');
  main.appendChild(canvas);
  main.appendChild(gift);
  return { main, canvas, gift, pip: new Fake('pip') };
};

describe('moveNode', () => {
  it('moves the canvas into the other document and back to its old place', () => {
    const { main, canvas, gift, pip } = setup();
    const restore = moveNode(canvas, pip);
    expect(canvas.parentNode).toBe(pip);
    expect(main.children).toEqual([gift]);
    restore();
    expect(canvas.parentNode).toBe(main);
    expect(main.children).toEqual([canvas, gift]);
  });

  it('restoring twice does nothing the second time', () => {
    const { main, canvas, pip } = setup();
    const restore = moveNode(canvas, pip);
    restore();
    pip.appendChild(canvas); // something else moved it again
    restore();
    expect(canvas.parentNode).toBe(pip);
    expect(main.children).not.toContain(canvas);
  });

  it('appends when the old next sibling is gone', () => {
    const { main, canvas, gift, pip } = setup();
    const restore = moveNode(canvas, pip);
    main.children.splice(main.children.indexOf(gift), 1);
    restore();
    expect(main.children).toEqual([canvas]);
  });
});
