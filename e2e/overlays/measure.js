// Runs inside the page (self-contained: Playwright serialises it). Measures one open overlay.
// Returns plain numbers/booleans so the audit script and the spec can both judge them.
function measureOverlay({ selector, touch }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const roots = [...document.querySelectorAll(selector)].filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none';
  });
  // The top-most matching overlay (the last in DOM order is the one on top for stacked dialogs).
  const root = roots[roots.length - 1];
  if (!root) return { found: false };
  const r = root.getBoundingClientRect();
  const insideViewport = r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1;

  // Tank coverage: share of the screen the overlay covers, and the width of tank left uncovered next to it.
  const covX = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
  const covY = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const coveredArea = (covX * covY) / (vw * vh);
  // For a right-docked panel the visible tank is what's left of it; otherwise the full width.
  const dockedRight = r.right >= vw - 24 && covY >= vh * 0.6 && r.left > vw * 0.3;
  const tankWidthVisible = dockedRight ? Math.max(0, r.left) / vw : 1;

  const body = root.querySelector('.sheet-body') || (root.classList.contains('sheet-body') ? root : null);
  const scrollOverflow = body ? Math.max(0, body.scrollHeight - body.clientHeight) : 0;
  const head = root.querySelector('.sheet-head');
  const foot = root.querySelector('.sheet-foot');
  const visible = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return b.top >= -1 && b.bottom <= vh + 1 && b.height > 0;
  };

  // Interactive targets inside the overlay.
  const min = touch ? 44 : 32;
  // Compact density (the default on small phones) keeps buttons at 44px through a hit area, but text fields,
  // inline links and guide dots may be 36px / 32px tall (decided: compact stays the default).
  const compact = document.querySelector('.app')?.getAttribute('data-density') === 'compact' || document.documentElement.dataset.display === 'compact';
  const minFor = (el) => (!compact || !touch ? min : el.matches('a[href]') ? 32 : el.matches('input, select, textarea, .guide-dot') ? 36 : min);
  const targets = [...root.querySelectorAll('button, [role=button], [role=radio], [role=tab], a[href], input:not([type=hidden]), select, textarea')]
    .filter((el) => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const hiddenInput = (b.width < 4 || b.height < 4) && !el.closest('label');
      return !hiddenInput && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' && !el.closest('[aria-hidden=true]') && (b.width > 0 || el.closest('label'));
    })
    .map((el) => {
      // A visually hidden control (a switch's checkbox) is operated through its label: judge that box instead.
      const own = el.getBoundingClientRect();
      const label = own.width < 4 || own.height < 4 ? el.closest('label') : null;
      if (label && (label.getBoundingClientRect().width === 0 || label.getBoundingClientRect().height === 0)) return null; // folded away
      return { el: label || el, b: (label || el).getBoundingClientRect() };
    })
    .filter(Boolean);
  // Compact controls keep a 44px touch target through an invisible ::after hit area (kit.css), so judge the larger of the two.
  const hitSize = (el, b) => {
    const a = getComputedStyle(el, '::after');
    const grow = a.content !== 'none' && a.position === 'absolute';
    return { w: Math.max(b.width, grow ? parseFloat(a.width) || 0 : 0), h: Math.max(b.height, grow ? parseFloat(a.height) || 0 : 0) };
  };
  const small = targets
    .map((t) => ({ ...t, hit: hitSize(t.el, t.b) }))
    .filter(({ el, hit }) => Math.min(hit.w, hit.h) < minFor(el) - 0.5)
    .map(({ el, hit }) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} ${Math.round(hit.w)}x${Math.round(hit.h)}`);
  const overlapping = [];
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i];
      const c = targets[j];
      if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
      const w = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left);
      const h = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
      if (w > 3 && h > 3) overlapping.push(`${a.el.textContent?.trim().slice(0, 12)} × ${c.el.textContent?.trim().slice(0, 12)}`);
    }
  }

  // Smallest text and text that is cut off without an ellipsis.
  let minFont = Infinity;
  let clipped = 0;
  const clippedSamples = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent || !n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const b = el.getBoundingClientRect();
    // Screen-reader-only text (1px boxes) isn't visible text.
    if (b.width <= 2 || b.height <= 2) continue;
    minFont = Math.min(minFont, parseFloat(cs.fontSize));
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis' && !(cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) {
      clipped++;
      if (clippedSamples.length < 3) clippedSamples.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} "${n.textContent.trim().slice(0, 18)}" ${el.scrollWidth}>${el.clientWidth}`);
    }
  }

  return {
    found: true,
    vw,
    vh,
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    insideViewport,
    heightShare: +(r.height / vh).toFixed(2),
    widthShare: +(r.width / vw).toFixed(2),
    coveredArea: +coveredArea.toFixed(2),
    dockedRight,
    tankWidthVisible: +tankWidthVisible.toFixed(2),
    hasBody: !!body,
    scrollOverflow,
    headVisible: visible(head),
    footVisible: visible(foot),
    smallTargets: small,
    overlappingTargets: overlapping,
    minFont: Number.isFinite(minFont) ? minFont : null,
    clippedText: clipped,
    clippedSamples,
  };
}

module.exports = { measureOverlay };
