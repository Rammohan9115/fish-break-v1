// Overlays that must pass the matrix on every screen (e2e/overlays.spec.ts). Grows as each phase migrates more of them;
// anything in registry.js but not here is still measured and reported by scripts/audit/overlays.mjs.
// Still to migrate (Phase 3, the card / popover redesign): fishcard, decorcard.
const { OVERLAYS } = require('./registry.js');

const NOT_YET = ['fishcard', 'decorcard'];
const ENFORCED = OVERLAYS.map((o) => o.id).filter((id) => !NOT_YET.includes(id));
module.exports = { ENFORCED };
