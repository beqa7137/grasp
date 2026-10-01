/**
 * Sideways overflow a learner sees, run in the page with `page.evaluate(findOverflow)`.
 * - spill: in-flow content wider than an in-flow, overflow-x visible box spills out of it (reported on the innermost such
 *   box). Positioned overlays such as pointer tags and decorations may outgrow their anchor on purpose.
 * - clipped: text cut off by an overflow-x hidden or clip box, unless it ends in an ellipsis or is visually hidden.
 * - past: a box sticks out of its ion-content or the viewport, which also catches overflow to the left.
 * Horizontal scrollers (overflow-x auto or scroll) are intentional and never fail; `scrollers` lists those a keyboard
 * cannot reach or a screen reader cannot name.
 */
export function findOverflow() {
  const SLACK = 1;
  const clips = (cs) => cs.overflowX !== 'visible';
  const scrolls = (cs) => cs.overflowX === 'auto' || cs.overflowX === 'scroll';
  const hiddenText = (el, cs) => el.clientWidth <= 1 || cs.clip !== 'auto' || cs.clipPath !== 'none';
  const focusable = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const selector = (el) => {
    const parts = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.id) {
        parts.unshift(`#${n.id}`);
        break;
      }
      const classes = [...n.classList].filter((c) => !/^(ng-|ion-|sc-|hydrated$|md$|ios$)/.test(c)).slice(0, 2);
      const twins = n.parentElement ? [...n.parentElement.children].filter((s) => s.localName === n.localName) : [];
      parts.unshift(n.localName + classes.map((c) => `.${c}`).join('') + (twins.length > 1 ? `:nth-of-type(${twins.indexOf(n) + 1})` : ''));
      if (n.localName.includes('-') && parts.length > 1) break;
    }
    return parts.join(' > ');
  };

  /**
   * How far in-flow content (text, plus boxes when `boxes`) reaches past el's padding box. Positioned overlays and what a
   * nested clipping box holds do not count.
   */
  const reach = (el, boxes) => {
    const left = el.getBoundingClientRect().left + el.clientLeft;
    const right = left + el.clientWidth;
    const range = document.createRange();
    let worst = 0;
    const measure = (r) => (worst = Math.max(worst, r.right - right, left - r.left));
    const visit = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.data.trim()) {
          range.selectNodeContents(child);
          for (const r of range.getClientRects()) measure(r);
        }
        if (child.nodeType !== Node.ELEMENT_NODE || !child.checkVisibility()) continue;
        const cs = getComputedStyle(child);
        if (cs.position === 'absolute' || cs.position === 'fixed') continue;
        if (boxes && child.getBoundingClientRect().width) measure(child.getBoundingClientRect());
        if (!clips(cs) && !(child instanceof SVGElement)) visit(child);
      }
    };
    visit(el);
    return worst >= SLACK ? Math.round(worst) : 0;
  };

  const viewport = { left: 0, right: document.documentElement.clientWidth };
  const containerOf = (el) => {
    const content = el.closest('ion-content');
    if (!content) return { box: viewport, name: 'viewport' };
    const r = content.getBoundingClientRect();
    return { box: { left: Math.max(r.left, 0), right: Math.min(r.right, viewport.right) }, name: 'ion-content', content };
  };
  const clippedBelow = (el, stop) => {
    for (let n = el.parentElement; n && n !== stop && n !== document.body; n = n.parentElement) if (clips(getComputedStyle(n))) return true;
    return false;
  };

  const findings = [];
  const add = (el, kind, px) => px && findings.push({ el, kind, px });
  const scrollers = [];
  for (const el of document.body.querySelectorAll('*')) {
    if ((el instanceof SVGElement && el.localName !== 'svg') || !el.checkVisibility({ visibilityProperty: true })) continue;
    const cs = getComputedStyle(el);
    const extra = el.scrollWidth - el.clientWidth;
    if (el.clientWidth > 0 && extra >= SLACK && cs.display !== 'inline' && cs.writingMode === 'horizontal-tb') {
      if (scrolls(cs)) {
        const reachable = el.tabIndex >= 0 || !!el.querySelector(focusable);
        const named = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
        if (!reachable || (el.tabIndex >= 0 && !named)) scrollers.push({ selector: selector(el), px: extra, reachable, named });
      } else if (!clips(cs)) {
        if (cs.position !== 'absolute' && cs.position !== 'fixed') add(el, 'spill', reach(el, true));
      } else if (cs.textOverflow !== 'ellipsis' && !hiddenText(el, cs)) {
        add(el, 'clipped', reach(el, false));
      }
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 || cs.position === 'fixed') continue;
    const { box, name, content } = containerOf(el);
    if (r.right <= box.left || r.left >= box.right || clippedBelow(el, content)) continue;
    const px = Math.max(r.right - box.right, box.left - r.left);
    if (px >= SLACK) add(el, `past ${name}`, Math.round(px));
  }

  // One finding per cause: the innermost box content spills from, and the outermost box that sticks out.
  const spills = findings.filter((f) => !f.kind.startsWith('past'));
  const kept = findings.filter((f) =>
    f.kind.startsWith('past') ? !findings.some((o) => o !== f && o.el.contains(f.el)) : !spills.some((o) => o !== f && f.el.contains(o.el)),
  );
  return { overflow: kept.map(({ el, kind, px }) => ({ kind, selector: selector(el), px })), scrollers };
}
