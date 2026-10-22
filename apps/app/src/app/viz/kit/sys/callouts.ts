/** A box in canvas pixels, from its top-left corner. */
export interface PxBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CalloutItem {
  nodeId: string;
  text: string;
}

export interface PlacedCallout extends CalloutItem, PxBox {
  /** Which side of its node it sits on; its stem points back at the node. */
  side: 'below' | 'above';
}

/** The widest a callout grows before it wraps. */
export const CALLOUT_MAX_W = 220;
const GAP = 8;

/** A callout's size for its text at 13px: one line up to the widest, then wrapped lines. */
export function calloutSize(text: string): { w: number; h: number } {
  const natural = text.length * 6.9 + 24;
  return { w: Math.min(CALLOUT_MAX_W, natural), h: 12 + Math.ceil(natural / CALLOUT_MAX_W) * 18 };
}

export interface PlaceOptions {
  /** Boxes a callout must not cover besides the nodes: rps pills, tags, other labels. */
  obstacles?: readonly PxBox[];
  /** The sides tried, in order. */
  sides?: readonly ('below' | 'above')[];
  /** A callout's size for its text. */
  size?: (text: string) => { w: number; h: number };
}

/**
 * Pins one callout per node (REDESIGN.md 4.6), in the order given: under its node, else over it, kept inside the canvas.
 * One that would cover a node, an obstacle or another callout is not pinned; the insights list still holds it.
 */
export function placeCallouts(
  items: readonly CalloutItem[],
  nodes: ReadonlyMap<string, PxBox>,
  area: { w: number; h: number },
  options: PlaceOptions = {},
): PlacedCallout[] {
  const { obstacles = [], sides = ['below', 'above'], size = calloutSize } = options;
  const placed: PlacedCallout[] = [];
  const seen = new Set<string>();
  const blocked = [...nodes.values(), ...obstacles];
  for (const item of items) {
    const node = nodes.get(item.nodeId);
    if (!node || seen.has(item.nodeId)) continue;
    seen.add(item.nodeId);
    const { w, h } = size(item.text);
    const x = Math.min(Math.max(4, node.x + node.w / 2 - w / 2), area.w - 4 - w);
    const spot = sides
      .map((side): PlacedCallout => ({ ...item, x, y: side === 'below' ? node.y + node.h + GAP : node.y - GAP - h, w, h, side }))
      .find((s) => s.y >= 4 && s.y + s.h <= area.h - 4 && blocked.every((n) => !hits(s, n, 4)) && placed.every((p) => !hits(s, p, 4)));
    if (spot) placed.push(spot);
  }
  return placed;
}

export const hits = (a: PxBox, b: PxBox, pad: number) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
