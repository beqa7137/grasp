import { linear } from '../../viz/kit/sparkline.component';
import { TAG, overlaps } from './focus-layout';
import { placeEventLabels } from '../../viz/kit/timeline-layout';
import { TIMELINE } from '../../viz/kit/timeline.component';
import { HIT } from './balancer-layout';
import { REPLICA_LANES, replicaGutter, replicaLayout } from './replica-layout';

const picture = (width: number) => ({
  x: linear(0, 3000, 16 + replicaGutter(width), width - 32),
  events: [
    { lane: 'you', at: 0, n: 1, tone: 'current' as const, label: 'write' },
    { lane: 'replica', at: 800, n: 2, tone: 'final' as const, label: 'applies it, 800 ms' },
    { lane: 'you', at: 300, n: 3, tone: 'current' as const, label: 'read, 300 ms' },
  ],
  messages: [{ id: 'r', from: { lane: 'primary', at: 0 }, to: { lane: 'replica', at: 800 }, tone: 'considering' as const }],
  spans: [{ lane: 'replica', from: 0, to: 800, tone: 'muted' as const, label: 'without your write' }],
  pin: 1000,
  staleFrom: 0,
  staleTo: 800,
  readout: [
    'Your read at 300 ms returns',
    'the old value',
    'from the replica, which applies it at 800 ms',
    'Your reads every 250 ms (dots): 4 of 13 stale',
  ],
});

describe('replicaLayout', () => {
  it("keeps every handle's 44px hit box off the others: each moves along its own lane, a lane apart", () => {
    const lanes = { lag: 'replica', read: 'you', pin: 'primary' };
    const ys = Object.values(lanes).map((lane) => REPLICA_LANES.findIndex((l) => l.id === lane) * TIMELINE.lane);
    for (const [i, a] of ys.entries()) for (const b of ys.slice(i + 1)) expect(Math.abs(a - b)).toBeGreaterThanOrEqual(HIT);
  });

  it.each([320, 694])('grows an outline to take in any label it would cut at %ipx', (width) => {
    const p = { ...picture(width), staleFrom: 300, staleTo: 1200 };
    const L = replicaLayout(width, p);
    const lineY = (lane: string) => REPLICA_LANES.findIndex((l) => l.id === lane) * TIMELINE.lane + TIMELINE.row.line;
    const labels = placeEventLabels(p.events, {
      lanes: REPLICA_LANES,
      x: p.x,
      laneY: lineY,
      messages: p.messages,
      width: width - 16,
      pad: TIMELINE.pad,
      row: TIMELINE.row,
      gutter: L.gutter,
      large: L.large,
    }).map((e) => ({ x: e.labelX + 8, y: e.labelY - 4, width: e.labelWidth, height: 16 }));
    for (const f of L.focus.filter((o) => o.id === 'window' || o.id === 'band'))
      for (const l of labels.filter((b) => overlaps(b, f)))
        expect(f.x <= l.x && f.x + f.width >= l.x + l.width, `${f.id} cuts a label`).toBe(true);
  });

  it('keeps one height for a width, whatever the settings, with more legend lines when narrow', () => {
    const wide = replicaLayout(694, picture(694));
    expect(replicaLayout(694, { ...picture(694), pin: 3000 }).height).toBe(wide.height);
    expect(replicaLayout(256, picture(256)).legendLines).toBeGreaterThan(wide.legendLines);
  });

  it.each([256, 320, 346, 694])('keeps each outline inside the stage at %ipx', (width) => {
    const L = replicaLayout(width, picture(width));
    expect(L.focus.map((f) => f.id)).toEqual(['replica', 'read', 'band', 'window']);
    for (const f of L.focus) {
      expect(f.x).toBeGreaterThanOrEqual(1);
      expect(f.x + f.width).toBeLessThanOrEqual(width - 1);
      expect(f.y + f.height).toBeLessThanOrEqual(L.height - 1);
      const tag = { ...f.tag, width: TAG.width, height: TAG.height };
      expect(tag.x + tag.width).toBeLessThanOrEqual(width - 1);
      expect(overlaps(tag, { x: L.readout.x, y: L.readout.y, width: Math.min(width - L.readout.x - 8, 290), height: 74 }), f.id).toBe(
        false,
      );
    }
  });
});
