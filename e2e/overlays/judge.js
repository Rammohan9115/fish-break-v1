// What "correct" means for a measured overlay (see measure.js). The same rules drive the report grid and the e2e matrix.
const MIN_FONT = 12;
const MIN_TANK_VISIBLE = 0.55;
// The tank-share rule applies to docks (the Decorate tray) on screens wide enough to share.
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
  // A dock (the Decorate tray) is used WITH the tank, so on a wide screen at least 55% of the width stays visible. Browse windows
  // (Shop, Settings…) are big on purpose; they only have to sit fully inside the screen.
  if (m.kind === 'dock' && m.vw >= TANK_RULE_MIN_WIDTH && 1 - m.widthShare < MIN_TANK_VISIBLE) fails.push('tank');
  return fails;
}

module.exports = { judge, MIN_FONT, MIN_TANK_VISIBLE };
