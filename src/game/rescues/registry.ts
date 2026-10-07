// Every rescues/<id>.ts that exports `rescue` is picked up here: drop a file in, it shows on the Rescue Board.
import type { RescueDef, RescuePerks } from './types';

const modules = import.meta.glob<{ rescue?: RescueDef }>(['./*.ts', '!./engine.ts', '!./registry.ts', '!./types.ts', '!./*.test.ts'], {
  eager: true,
});

export const RESCUES: RescueDef[] = Object.values(modules)
  .flatMap((m) => (m.rescue ? [m.rescue] : []))
  .sort((a, b) => a.estDays - b.estDays || a.id.localeCompare(b.id));

export function getRescue(id: string): RescueDef | undefined {
  return RESCUES.find((r) => r.id === id);
}

/** Perks of a recovered rescue animal (empty while recovering or for ordinary fish). */
export function perksOf(fish: { rescue?: { caseId: string; recovering: boolean } }): RescuePerks {
  if (!fish.rescue || fish.rescue.recovering) return {};
  return getRescue(fish.rescue.caseId)?.rewards.perks ?? {};
}
