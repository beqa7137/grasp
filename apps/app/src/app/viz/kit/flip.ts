import type { MotionService } from './motion.service';

/** A keyed element and its box, relative to the element that holds the keyed ones. */
export interface Placed {
  el: HTMLElement;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The boxes of `root`'s elements with a `data-key`, relative to `root`, so scrolling the view between two readings moves
 * nothing. Read before a step's DOM update and again after it, the difference is what FLIP plays back.
 */
export function placeKeyed(root: HTMLElement | undefined): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  if (!root) return placed;
  const origin = root.getBoundingClientRect();
  for (const el of root.querySelectorAll<HTMLElement>('[data-key]')) {
    const box = el.getBoundingClientRect();
    placed.set(el.dataset['key']!, { el, left: box.left - origin.left, top: box.top - origin.top, width: box.width, height: box.height });
  }
  return placed;
}

export interface FlipTiming {
  duration: number;
  delay: number;
  easing: string;
}

/**
 * Plays each kept element from where it was to where it is, on `transform` only. `stretch` also scales an element whose
 * width changed (a window bracket), from its left edge.
 */
export function flip(
  motion: MotionService,
  before: Map<string, Placed>,
  after: Map<string, Placed>,
  timing: FlipTiming,
  stretch = false,
): void {
  for (const [key, now] of after) {
    const was = before.get(key);
    if (!was) continue;
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    const sx = stretch && now.width > 0 ? was.width / now.width : 1;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01) continue;
    if (stretch) now.el.style.transformOrigin = 'left center';
    motion.animate(now.el, [{ transform: `translate(${dx}px, ${dy}px) scaleX(${sx})` }, { transform: 'none' }], timing);
  }
}

/** Fades in the elements that are new in this step, rising a little into place. */
export function enter(motion: MotionService, before: Map<string, Placed>, after: Map<string, Placed>, timing: FlipTiming): void {
  for (const [key, now] of after)
    if (!before.has(key))
      motion.animate(
        now.el,
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'none' },
        ],
        timing,
      );
}

/**
 * Plays out the elements that left: each is put back where it was, in `layer`, and fades while moving by `toward`, then
 * goes. The others have already closed the gap, so the copy is drawn over them, never in the flow.
 */
export function leave(
  motion: MotionService,
  before: Map<string, Placed>,
  after: Map<string, Placed>,
  layer: HTMLElement,
  timing: FlipTiming,
  toward: { x: number; y: number },
): void {
  for (const [key, was] of before) {
    if (after.has(key)) continue;
    const copy = was.el.cloneNode(true) as HTMLElement;
    copy.removeAttribute('data-key');
    copy.classList.add('leaving');
    copy.setAttribute('aria-hidden', 'true');
    Object.assign(copy.style, {
      position: 'absolute',
      left: `${was.left}px`,
      top: `${was.top}px`,
      width: `${was.width}px`,
      height: `${was.height}px`,
      margin: '0',
      pointerEvents: 'none',
    });
    layer.append(copy);
    const animation = motion.animate(
      copy,
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: `translate(${toward.x}px, ${toward.y}px)` },
      ],
      { ...timing, fill: 'forwards' },
    );
    removeWith(animation, copy);
  }
}

/** Removes a temporary element once its animation ends, or at once when it did not start. */
function removeWith(animation: Animation | null, el: Element): void {
  if (!animation) return el.remove();
  animation.addEventListener('finish', () => el.remove());
  animation.addEventListener('cancel', () => el.remove());
}

/** Styles for `land`'s copies, for each view that lands values: the old value over the new one, and the ring. */
export const LANDING = `
  .landing-old {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .landing-ring {
    position: absolute;
    inset: -3px;
    border: 2px solid var(--g-state-current);
    border-radius: inherit;
    pointer-events: none;
  }
`;

/**
 * Lands a written value (REDESIGN.md 3.5): the old value slides up and fades, the new one settles in from below, and a
 * ring fades around the cell.
 */
export function land(motion: MotionService, cell: HTMLElement, value: HTMLElement, old: string, timing: FlipTiming): void {
  // Copies of the value, rather than new elements, so they carry the view's scoped style attribute.
  const copy = (className: string, text: string) => {
    const el = value.cloneNode(false) as HTMLElement;
    el.className = className;
    el.textContent = text;
    el.setAttribute('aria-hidden', 'true');
    el.removeAttribute('data-key');
    cell.append(el);
    return el;
  };
  const half = { ...timing, duration: timing.duration / 2 };
  if (old) {
    const ghost = copy(`${value.className} landing-old`, old);
    const out = motion.animate(
      ghost,
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(-60%)' },
      ],
      { ...half, fill: 'forwards' },
    );
    removeWith(out, ghost);
  }
  motion.animate(
    value,
    [
      { opacity: 0, transform: 'translateY(60%)' },
      { opacity: 1, transform: 'none' },
    ],
    { ...half, delay: timing.delay + half.duration },
  );
  const ring = copy('landing-ring', '');
  const glow = motion.animate(
    ring,
    [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(1.12)' },
    ],
    { ...timing, fill: 'forwards' },
  );
  removeWith(glow, ring);
}
