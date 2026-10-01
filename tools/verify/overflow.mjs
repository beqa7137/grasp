/**
 * Sideways overflow a learner sees, run in the page with `page.evaluate(findOverflow)`. Shadow roots are walked too.
 * - spill: in-flow content wider than an in-flow, overflow-x visible box spills out of it (reported on the innermost such
 *   box). Positioned overlays such as pointer tags and decorations may outgrow their anchor on purpose.
 * - clipped: text, a field, an image, a drawing or a block cut off by an overflow-x hidden or clip box, unless the text
 *   ends in an ellipsis or is visually hidden.
 * - sideways scroll: a box that scrolls sideways although its styles never set overflow-x (overflow-y auto or hidden
 *   turns a visible overflow-x into auto).
 * - past: a box sticks out of its ion-content or the viewport, which also catches overflow to the left.
 * Scrollers whose styles set overflow-x are intentional and never fail; `scrollers` lists those a keyboard cannot reach
 * or a screen reader cannot name.
 */
export function findOverflow() {
  const SLACK = 1;
  const REPLACED = new Set(['img', 'svg', 'canvas', 'video', 'iframe', 'input', 'select', 'textarea', 'button', 'ion-icon']);
  const clips = (cs) => cs.overflowX !== 'visible';
  const scrolls = (cs) => cs.overflowX === 'auto' || cs.overflowX === 'scroll';
  const positioned = (cs) => cs.position === 'absolute' || cs.position === 'fixed';
  const hiddenText = (el, cs) => el.clientWidth <= 1 || cs.clip !== 'auto' || cs.clipPath !== 'none';
  const focusable = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

  /** The parent as rendered: a slotted node's slot, else its parent, crossing out of a shadow root to its host. */
  const up = (n) => n.assignedSlot ?? n.parentElement ?? n.getRootNode().host ?? null;
  const within = (inner, outer) => {
    for (let n = inner; n; n = up(n)) if (n === outer) return true;
    return false;
  };
  /** The nodes rendered inside n: its shadow root's, a slot's assigned nodes (or its fallback), else its children. */
  const rendered = (n) => {
    if (n.shadowRoot) return n.shadowRoot.childNodes;
    if (n.localName === 'slot' && n.assignedNodes().length) return n.assignedNodes();
    return n.childNodes;
  };

  const selector = (el) => {
    let path = '';
    for (let n = el; n && n !== document.body;) {
      if (n.id) return `#${n.id}${path}`;
      const classes = [...n.classList].filter((c) => !/^(ng-|ion-|sc-|hydrated$|md$|ios$)/.test(c)).slice(0, 2);
      const twins = n.parentElement ? [...n.parentElement.children].filter((s) => s.localName === n.localName) : [];
      path = n.localName + classes.map((c) => `.${c}`).join('') + (twins.length > 1 ? `:nth-of-type(${twins.indexOf(n) + 1})` : '') + path;
      if (n.localName.includes('-') && n !== el) break;
      const host = n.parentElement ? null : n.getRootNode().host;
      n = n.parentElement ?? host;
      if (n && n !== document.body) path = (host ? ' >>> ' : ' > ') + path;
    }
    return path;
  };

  /** Whether a style rule that applies to el, or its inline style, sets overflow-x (the overflow shorthand included). */
  const setsOverflowX = (el) => {
    if (el.style.overflowX) return true;
    const scan = (rules) =>
      [...rules].some((r) => {
        try {
          if (r.selectorText && r.style.overflowX && el.matches(r.selectorText)) return true;
        } catch {
          // A selector el.matches cannot parse, such as one with a pseudo-element.
        }
        return r.cssRules ? scan(r.cssRules) : false;
      });
    const root = el.getRootNode();
    return [...root.styleSheets, ...(root.adoptedStyleSheets ?? [])].some((sheet) => {
      try {
        return scan(sheet.cssRules);
      } catch {
        return false;
      }
    });
  };

  /**
   * How far in-flow content reaches past el's padding box: text, plus every box for a spill, or fields, images, drawings
   * and blocks for a clip. Positioned overlays and what a nested clipping box holds do not count.
   */
  const reach = (el, allBoxes) => {
    const left = el.getBoundingClientRect().left + el.clientLeft;
    const right = left + el.clientWidth;
    const range = document.createRange();
    let worst = 0;
    const measure = (r) => (worst = Math.max(worst, r.right - right, left - r.left));
    const visit = (node) => {
      for (const child of rendered(node)) {
        if (child.nodeType === Node.TEXT_NODE && child.data.trim()) {
          range.selectNodeContents(child);
          for (const r of range.getClientRects()) measure(r);
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const cs = getComputedStyle(child);
        // A slot or a display: contents wrapper has no box of its own, so checkVisibility() is false for it.
        if (cs.display === 'contents') visit(child);
        if (cs.display === 'contents' || !child.checkVisibility() || positioned(cs)) continue;
        const box = child.getBoundingClientRect();
        const solid = REPLACED.has(child.localName) || (cs.display !== 'inline' && cs.display !== 'contents');
        if (box.width && (allBoxes || solid)) measure(box);
        if (!clips(cs) && !(child instanceof SVGElement)) visit(child);
      }
    };
    visit(el);
    return worst >= SLACK ? Math.round(worst) : 0;
  };

  const viewport = { left: 0, right: document.documentElement.clientWidth };
  const containerOf = (el) => {
    let content = el;
    while (content && content.localName !== 'ion-content') content = up(content);
    if (!content) return { box: viewport, name: 'viewport' };
    const r = content.getBoundingClientRect();
    return { box: { left: Math.max(r.left, 0), right: Math.min(r.right, viewport.right) }, name: 'ion-content', content };
  };
  const clippedBelow = (el, stop) => {
    for (let n = up(el); n && n !== stop && n !== document.body; n = up(n)) if (clips(getComputedStyle(n))) return true;
    return false;
  };

  const all = [];
  const collect = (root) => {
    for (const el of root.querySelectorAll('*')) {
      all.push(el);
      if (el.shadowRoot) collect(el.shadowRoot);
    }
  };
  collect(document.body);

  const findings = [];
  const add = (el, kind, px) => px && findings.push({ el, kind, px });
  const scrollers = [];
  for (const el of all) {
    if ((el instanceof SVGElement && el.localName !== 'svg') || !el.checkVisibility({ visibilityProperty: true })) continue;
    const cs = getComputedStyle(el);
    const extra = el.scrollWidth - el.clientWidth;
    if (el.clientWidth > 0 && extra >= SLACK && cs.display !== 'inline' && cs.writingMode === 'horizontal-tb') {
      if (scrolls(cs) && !setsOverflowX(el)) {
        add(el, 'sideways scroll', extra);
      } else if (scrolls(cs)) {
        const reachable = el.tabIndex >= 0 || !!el.querySelector(focusable);
        const named = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
        if (!reachable || (el.tabIndex >= 0 && !named)) scrollers.push({ selector: selector(el), px: extra, reachable, named });
      } else if (!clips(cs)) {
        if (!positioned(cs)) add(el, 'spill', reach(el, true));
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
  const kept = findings.filter((f) =>
    f.kind.startsWith('past')
      ? !findings.some((o) => o !== f && within(f.el, o.el))
      : f.kind !== 'spill' || !findings.some((o) => o !== f && o.kind === 'spill' && within(o.el, f.el)),
  );
  return { overflow: kept.map(({ el, kind, px }) => ({ kind, selector: selector(el), px })), scrollers };
}
