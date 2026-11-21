import { FAILOVER_STOP_SHARE, RELIABILITY_PARTS, type ReliabilityScenario, type YearMoment } from '@grasp/engine';
import { Draw, pick, r1, sampleLine, tw, xGlyph } from './latency-draw';
import { copyName } from './reliability-words';

/** One part of the chain at a moment: which copies are down, which carries the request, and where the request stops. */
export interface PartState {
  down: ReadonlySet<number>;
  /** The copy the request goes through, or -1. */
  serving: number;
  /** The request stops before this part (or, in a failover's first beat, at the dead copy). */
  cut: boolean;
  cutAt: number;
  /** The copy traffic is moving to in a failover's first beat. */
  next: number;
  /** The request reaches this part: no part before it stopped it. */
  reached: boolean;
  /** An optional part is down and the request takes the bypass. */
  bypass: boolean;
}

/** The chain at a moment: every copy up when there is none (between a play's holds, the band claims nothing). */
export function bandState(m: ReliabilityScenario, moment: YearMoment | null, into: number): PartState[] {
  let failed = false;
  return m.parts.map((p) => {
    const st = { down: new Set<number>(), serving: 0, cut: false, cutAt: -1, next: -1, reached: !failed, bypass: false };
    if (moment && moment.part === p.id) {
      const kind = moment.kind === 'bypassed' ? moment.cause : moment.kind;
      if (kind === 'outage' || (moment.kind === 'bypassed' && kind === 'failover')) {
        st.down.add(0);
        st.serving = -1;
        st.cut = true;
      } else if (kind === 'shared') {
        for (let i = 0; i < p.copies; i++) st.down.add(i);
        st.serving = -1;
        st.cut = true;
      } else if (kind === 'failover') {
        st.down.add(0);
        if (into < FAILOVER_STOP_SHARE) {
          // The first beat: requests still go to the dead copy, so the path runs to its box and stops there.
          st.serving = -1;
          st.cut = true;
          st.cutAt = 0;
          st.next = 1;
        } else st.serving = 1;
      } else {
        st.down.add(moment.copy);
        st.serving = moment.copy === 0 ? 1 : 0;
      }
    }
    if (st.cut && p.optional) Object.assign(st, { cut: false, cutAt: -1, bypass: true });
    if (st.cut) failed = true;
    return st;
  });
}

export interface ChainGeometry {
  /** The chain's axis, where the request travels. */
  ay: number;
  bottom: number;
  /** Where the bypass's right leg lands on the lead-out, and the outcome ring's left edge. */
  bypassX: number | null;
  outcomeX0: number;
  outcome: 'hidden' | 'none' | 'fails' | 'served';
}

/**
 * The chain at one moment, a reliability block diagram: parts left to right, each its copies stacked about the axis
 * with a bus each side, wires along the axis, the request's path through the copy in use, a stop bar where it cannot
 * pass, and the outcome. An optional part has a bypass wire in parallel with it. Three copies and the bypass lane are
 * always reserved, so the chain's height depends on the stage's width only.
 */
export function drawChain(
  D: Draw,
  m: ReliabilityScenario,
  o: { top: number; P: number; wide: boolean; hidden: boolean; neutral: boolean; moment: YearMoment | null; into: number },
): ChainGeometry {
  const { top: y, P, wide, hidden } = o;
  const W = D.W;
  const bh = wide ? 26 : 22;
  const gap = 6;
  const namesY = y + 12;
  const laneY = y + 22;
  const stackTop = y + 30;
  const stackH = 3 * bh + 2 * gap;
  const ay = stackTop + stackH / 2;
  const leadIn = wide ? 56 : 12;
  const outW = wide ? 60 : 26;
  const linkW = wide ? 30 : 9;
  const cx0 = P + leadIn;
  const cx1 = W - P - outW;
  const cw = (cx1 - cx0 - 3 * linkW) / 4;
  const bus = wide ? 12 : 5;
  const legOut = wide ? 4 : 3;
  const colX = (i: number) => cx0 + i * (cw + linkW);
  const copyY = (n: number, i: number) => (n === 1 ? ay : n === 2 ? ay + (i - 0.5) * (bh + gap) : ay + (i - 1) * (bh + gap));
  const band = bandState(m, hidden ? null : o.moment, o.into);
  const longNames = RELIABILITY_PARTS.every((p) => tw(p.name, 'capB') <= cw + linkW - 6);
  const fullNames = cw - 2 * bus - 22 >= Math.max(...RELIABILITY_PARTS.map((p) => tw(copyName(p.id, 2), 'mono')));
  const fails = band.some((b) => b.cut);
  let wires = 0;
  const wire = (x1: number, y1: number, x2: number, y2: number) => {
    D.add('links', `wire-${wires++}`, { k: 'line', cls: 'wire', x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2), owner: 'wire' });
    D.link(sampleLine(x1, y1, x2, y2), 'wire');
  };
  let paths = 0;
  const pathSeg = (pts: readonly (readonly [number, number])[]) =>
    D.add('marks', `path-${paths++}`, {
      k: 'path',
      cls: 'path',
      owner: 'wire',
      d: pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(''),
    });
  const startX = P + (wide ? 4 : 2);
  if (wide) D.text('request-word', startX - 2, ay - 9, [['request', 'small']], { owner: 'wire' });
  wire(startX, ay, colX(0), ay);
  D.add('dots', 'start', { k: 'circle', cls: `start-dot${hidden ? ' hidden' : ''}`, cx: startX, cy: r1(ay), r: 3.5 });
  let alive = !hidden;
  let pathPts: [number, number][] = [[startX, ay]];
  const flush = () => {
    if (pathPts.length > 1) pathSeg(pathPts);
    pathPts = [];
  };
  let bypassX: number | null = null;
  m.parts.forEach((p, i) => {
    const st = band[i];
    const x = colX(i);
    const xb0 = x + bus;
    const xb1 = x + cw - bus;
    const ys = Array.from({ length: p.copies }, (_, k) => copyY(p.copies, k));
    D.text(`name-${p.id}`, x + cw / 2, namesY, [[longNames ? p.name : p.short, 'capB', p.optional ? 'muted' : '']], {
      anchor: 'middle',
      owner: `name-${p.id}`,
    });
    if (p.copies > 1) {
      wire(x, ys[0], x, ys[ys.length - 1]);
      wire(x + cw, ys[0], x + cw, ys[ys.length - 1]);
    }
    for (const yy of ys) {
      wire(x, yy, xb0, yy);
      wire(xb1, yy, x + cw, yy);
    }
    if (i < 3) wire(x + cw, ay, colX(i + 1), ay);
    if (p.optional) {
      // A part made optional is a part in parallel with a wire: the bypass, its right leg on the lead-out.
      const bx0 = x - linkW / 2;
      const bx1 = x + cw + legOut;
      D.add('links', 'bypass', {
        k: 'path',
        cls: st.bypass && alive ? 'path' : 'wire',
        owner: 'wire bypass',
        d: `M${r1(bx0)} ${r1(ay)}V${laneY + 5}Q${r1(bx0)} ${laneY} ${r1(bx0 + 5)} ${laneY}H${r1(bx1 - 5)}Q${r1(bx1)} ${laneY} ${r1(bx1)} ${laneY + 5}V${r1(ay)}`,
      });
      D.link(
        [...sampleLine(bx0, ay, bx0, laneY), ...sampleLine(bx0, laneY, bx1, laneY), ...sampleLine(bx1, laneY, bx1, ay)],
        'wire bypass',
      );
      bypassX = bx1;
    }
    ys.forEach((yy, k) => {
      const down = !hidden && st.down.has(k);
      const serving = alive && st.reached && st.serving === k && !st.bypass;
      const next = alive && st.next === k;
      const own = `box-${p.id}-${k}`;
      D.add('marks', own, {
        k: 'rect',
        cls: `box${down ? ' down' : serving ? ' serving' : next ? ' next' : ''}`,
        x: r1(xb0),
        y: r1(yy - bh / 2),
        w: r1(xb1 - xb0),
        h: bh,
        rx: 6,
      });
      D.mark({ x0: xb0, x1: xb1, y0: yy - bh / 2, y1: yy + bh / 2 }, own);
      const label = fullNames ? copyName(p.id, k) : String(k + 1);
      // A label's halo matches its ground: the hatch's sunken fill, nothing on the soft "next" tint.
      if (down) {
        xGlyph(D, `x-${p.id}-${k}`, xb1 - 11, yy, own, 3.5);
        D.text(`copy-${p.id}-${k}`, xb0 + (xb1 - xb0 - 16) / 2, yy + 4, [[label, 'mono', 'muted']], {
          anchor: 'middle',
          owner: own,
          cls: 'on-sunken',
        });
      } else
        D.text(`copy-${p.id}-${k}`, (xb0 + xb1) / 2, yy + 4, [[label, 'mono']], {
          anchor: 'middle',
          owner: own,
          cls: next ? 'on-chip' : 'on-box',
        });
    });
    if (!alive || !st.reached) return;
    if (st.bypass) {
      pathPts.push([x - linkW / 2, ay]);
      flush();
      pathPts = [[x + cw + legOut, ay]];
    } else if (st.cut) {
      const yy = st.cutAt >= 0 ? ys[st.cutAt] : ay;
      const sx = st.cutAt >= 0 ? xb0 - 3 : x - (wide ? 9 : 4);
      if (st.cutAt >= 0) pathPts.push([x, ay], [x, yy]);
      pathPts.push([sx - 2.5, yy]);
      flush();
      D.add('dots', `stop-${p.id}`, { k: 'rect', cls: 'stop', x: r1(sx - 1.75), y: r1(yy - 8), w: 3.5, h: 16, rx: 1 });
      D.mark({ x0: sx - 3, x1: sx + 3, y0: yy - 9, y1: yy + 9 }, 'cut');
      alive = false;
    } else {
      const yy = ys[st.serving];
      pathPts.push([x, ay], [x, yy], [xb0, yy]);
      flush();
      pathPts = [
        [xb1, yy],
        [x + cw, yy],
        [x + cw, ay],
      ];
    }
  });
  const endX = W - P - (wide ? outW - 18 : 9);
  wire(colX(3) + cw, ay, endX - 9, ay);
  if (alive) {
    pathPts.push([endX - 9, ay]);
    flush();
  }
  const outcome: ChainGeometry['outcome'] = hidden ? 'hidden' : o.neutral ? 'none' : fails ? 'fails' : 'served';
  D.add('dots', 'outcome', { k: 'circle', cls: `outcome ${outcome}`, cx: r1(endX), cy: r1(ay), r: 8 });
  if (outcome === 'hidden') D.text('outcome-q', endX, ay + 4, [['?', 'smallB', 'muted']], { anchor: 'middle', owner: 'outcome' });
  else if (outcome === 'fails') {
    D.add('dots', 'outcome-x', {
      k: 'path',
      cls: 'xmark',
      d: `M${r1(endX - 3.5)} ${r1(ay - 3.5)}l7 7M${r1(endX + 3.5)} ${r1(ay - 3.5)}l-7 7`,
    });
    if (wide) D.text('outcome-word', endX + 13, ay + 4, [['fails', 'smallB', 'bad']], { owner: 'outcome' });
  } else if (outcome === 'served') {
    D.add('dots', 'outcome-check', { k: 'path', cls: 'ok-mark', d: `M${r1(endX - 4)} ${r1(ay + 0.3)}l2.8 2.8 5-5.6` });
    if (wide) D.text('outcome-word', endX + 13, ay + 4, [['served', 'smallB', 'ok-ink']], { owner: 'outcome' });
  }
  D.mark({ x0: endX - 9, x1: endX + 9, y0: ay - 9, y1: ay + 9 }, 'outcome');
  const opt = m.parts.findIndex((p) => p.optional);
  if (opt >= 0) {
    // The bypass lane is always named.
    const word = pick(['optional', 'opt.'], (t) => tw(t, 'small') <= cw - 4) ?? 'opt.';
    D.text('lane-word', colX(opt) + cw / 2, laneY + 4, [[word, 'small']], { anchor: 'middle', owner: 'wire bypass', ground: true });
  }
  return { ay, bottom: stackTop + stackH, bypassX, outcomeX0: endX - 8, outcome };
}
