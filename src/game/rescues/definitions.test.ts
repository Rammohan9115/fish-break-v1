import { describe, expect, it } from 'vitest';
import { DECOR, ENCOURAGE_ACTION, FIRST_LEAP_ACTION, GROUP_PHOTO_ACTION, SIT_ACTION, STYLE_OPTIONS } from '../constants';
import { getSpecies } from '../species';
import { RESCUES } from './registry';

// Guards against stories that can never finish because a task points at something that doesn't exist.
const INTERACTIONS = new Set([SIT_ACTION, ENCOURAGE_ACTION, FIRST_LEAP_ACTION, GROUP_PHOTO_ACTION, 'leave_him_be']);

describe('rescue definitions reference real game things', () => {
  for (const r of RESCUES) {
    describe(r.id, () => {
      const tasks = r.stages.flatMap((s) => s.tasks);
      it('species and reward variant exist', () => {
        expect(getSpecies(r.speciesId)).toBeTruthy();
      });
      it('placeDecor ids are real decor', () => {
        for (const t of tasks) if (t.type === 'placeDecor') for (const id of t.decorIds) expect(DECOR[id], id).toBeTruthy();
        for (const t of tasks) if (t.type === 'decorPresent') expect(DECOR[t.decorId], t.decorId).toBeTruthy();
      });
      it('substrate ids are real style options', () => {
        for (const t of tasks) if (t.type === 'changeSubstrate') for (const id of t.substrateIds) expect(STYLE_OPTIONS.some((o) => o.category === 'substrate' && o.id === id), id).toBe(true);
      });
      it('ownSpecies species exist', () => {
        for (const t of tasks) if (t.type === 'ownSpecies') expect(getSpecies(t.speciesId)).toBeTruthy();
      });
      it('interact actions have a handler', () => {
        for (const t of tasks) if (t.type === 'interact') expect(INTERACTIONS.has(t.actionId), t.actionId).toBe(true);
      });
    });
  }
});
