import { LB_SERVER_SNAPS } from '@grasp/engine';
import { HIT, WIDE_FROM, balancerChartsLayout, balancerLayout, blockCap, perBlock } from './balancer-layout';
import { TAG, overlaps, type Box } from './focus-layout';

const hitBox = (x: number, y: number): Box => ({ x: x - HIT / 2, y: y - HIT / 2, width: HIT, height: HIT });

describe('balancerLayout', () => {
  it('keeps one height per layout whatever the width or fleet size, and breaks into the wide layout at 520px', () => {
    expect(new Set([256, 300, 346, 519].map((w) => balancerLayout(w).height)).size).toBe(1);
    expect(new Set([520, 624, 694, 900].map((w) => balancerLayout(w).height)).size).toBe(1);
    expect(balancerLayout(WIDE_FROM - 1).wide).toBe(false);
    expect(balancerLayout(WIDE_FROM).wide).toBe(true);
  });

  it.each([256, 346, 520, 694, 900])('fits every fleet in the rack it reserves at %ipx, slow server first and tallest', (width) => {
    const L = balancerLayout(width);
    for (const servers of LB_SERVER_SNAPS) {
      const lanes = L.lanes(servers);
      expect(lanes).toHaveLength(servers);
      expect(lanes[0].height).toBeGreaterThanOrEqual(Math.max(...lanes.map((l) => l.height)));
      expect(lanes.at(-1)!.y + lanes.at(-1)!.height / 2).toBeLessThanOrEqual(Math.max(...L.rackBottoms));
      for (const lane of lanes) {
        expect(lane.x0).toBeGreaterThanOrEqual(0);
        expect(lane.serverX + lane.serverW).toBeLessThanOrEqual(width);
        expect(blockCap(lane)).toBeGreaterThanOrEqual(20);
        expect(lane.x1 - lane.x0).toBeLessThanOrEqual(260);
      }
    }
    expect(L.slowPositions.every((x) => x > L.lanes(10)[0].x0 + 20)).toBe(true);
  });

  it.each([256, 320, 346, 520, 694, 1024])("keeps every handle's 44px hit box off every other one at %ipx, at any fleet size", (width) => {
    const L = balancerLayout(width);
    for (const [i, servers] of LB_SERVER_SNAPS.entries()) {
      const slowY = L.lanes(servers)[0].y;
      const boxes: [string, Box[]][] = [
        ['load', L.pipe.loadPositions.map((x) => hitBox(x, L.pipe.y))],
        ['servers', [hitBox(L.rackCross, L.rackHandles[i])]],
        ['slow', L.slowPositions.map((x) => hitBox(x, slowY))],
        ['time', [L.scrub.x0, L.scrub.x1, (L.scrub.x0 + L.scrub.x1) / 2, L.rackCross].map((x) => hitBox(x, L.scrub.y))],
      ];
      for (const [a, as] of boxes)
        for (const [b, bs] of boxes)
          if (a < b) for (const p of as) for (const q of bs) expect(overlaps(p, q), `${a} on ${b} at ${servers} servers`).toBe(false);
    }
  });

  it.each([256, 320, 346, 520, 694])('keeps each "Look here" tag off every text at %ipx', (width) => {
    const L = balancerLayout(width);
    const C = balancerChartsLayout(width);
    expect(L.focus.map((f) => f.id)).toEqual(['fleet', 'slow', 'share']);
    expect(C.focus.map((f) => f.id)).toEqual(['histogram', 'chart']);
    for (const [focus, texts] of [
      [L.focus, L.texts],
      [C.focus, [C.histogram, C.chart]],
    ] as const) {
      for (const f of focus) {
        const tag = { ...f.tag, width: TAG.width, height: TAG.height };
        expect(tag.x).toBeGreaterThanOrEqual(1);
        expect(tag.x + tag.width).toBeLessThanOrEqual(width - 1);
        for (const t of texts) expect(overlaps(tag, t), `${f.id} tag on ${JSON.stringify(t)}`).toBe(false);
      }
    }
  });

  it('fits the charts side by side on a wide stage and stacks them on a narrow one', () => {
    const wide = balancerChartsLayout(694);
    expect(wide.chart.y).toBe(wide.histogram.y);
    expect(wide.chart.x + wide.chart.width).toBeLessThanOrEqual(694);
    const narrow = balancerChartsLayout(320);
    expect(narrow.chart.y).toBeGreaterThan(narrow.histogram.y + narrow.histogram.height);
    expect(narrow.chart.y + narrow.chart.height).toBeLessThanOrEqual(narrow.height);
  });
});

describe('perBlock', () => {
  it('makes a block stand for the fewest requests that fit the longest queue in the lane', () => {
    expect(perBlock(0, 36)).toBe(1);
    expect(perBlock(36, 36)).toBe(1);
    expect(perBlock(37, 36)).toBe(2);
    expect(perBlock(1_379, 36)).toBe(50);
    expect(perBlock(1_379, 50)).toBe(50);
    expect(perBlock(10_000, 36)).toBe(500);
  });
});
