import { describe, expect, it } from 'vitest';
import { DECOR } from '../game/constants';
import { DECOR_ART } from './artConfig';

describe('decor art config', () => {
  it('every decor item has art; sheet items are cut out by a rect', () => {
    for (const id of Object.keys(DECOR) as (keyof typeof DECOR)[]) {
      const art = DECOR_ART[id];
      expect(art, id).toBeDefined();
      const sheet = /elements\/(nature|ruins|village|playful|halloween)\.PNG$/.test(art.file);
      expect(art.rect !== undefined, id).toBe(sheet);
      if (art.rect) {
        const [x, y, w, h] = art.rect;
        expect(x >= 0 && y >= 0 && w > 0 && h > 0, id).toBe(true);
      }
    }
  });

  it('behaviors that need an anchor have one', () => {
    const needs: Record<string, (a: NonNullable<(typeof DECOR_ART)[keyof typeof DECOR_ART]['anchors']>) => unknown> = {
      bubbleRing: (a) => a.mouth,
      giftFlag: (a) => a.flag && a.flagPivot,
      curtain: (a) => a.curtain,
      propeller: (a) => a.propeller,
      nightGlow: (a) => a.glows?.length,
      sparkle: (a) => a.glint?.length,
      eruption: (a) => a.trail?.length,
    };
    for (const [id, art] of Object.entries(DECOR_ART)) {
      for (const b of art.behaviors) {
        const need = needs[b];
        if (need) expect(art.anchors && need(art.anchors), `${id}: ${b}`).toBeTruthy();
      }
    }
  });
});
