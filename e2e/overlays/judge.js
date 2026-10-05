// What "correct" means for a measured overlay (see measure.js). The same rules drive the report grid and the e2e matrix.
const MIN_FONT = 12;
const MIN_TANK_VISIBLE = 0.55;
// The side-panel tank-share rule applies where a docked panel is the layout (not on landscape phones, where the
// screen is too small to share).
const TANK_RULE_MIN_WIDTH = 800;

/** Returns a list of short failure codes (empty = pass). */
function judge(m) {
  if (!m || !m.found) return ['not-found'];
  const fails = [];
  if (!m.insideViewport) fails.push('outside');
  if (m.fit && m.scrollOverflow > 0) fails.push('fit');
  if (m.headVisible === false) fails.push('head');
  if (m.footVisible === false) fails.push('foot');
  if (m.smallTargets.length > 0) fails.push('targets');
  if (m.overlappingTargets.length > 0) fails.push('overlap');
  if (m.minFont !== null && m.minFont < MIN_FONT) fails.push('font');
  if (m.clippedText > 0) fails.push('clipped');
  // A panel on a wide screen must leave the tank usable: at least 55% of the width stays visible (docked or centred).
  if (m.kind === 'panel' && m.vw >= TANK_RULE_MIN_WIDTH && 1 - m.widthShare < MIN_TANK_VISIBLE) fails.push('tank');
  return fails;
}

module.exports = { judge, MIN_FONT, MIN_TANK_VISIBLE };
