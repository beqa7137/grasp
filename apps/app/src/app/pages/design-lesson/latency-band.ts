import { sampleAt, type LatencySample, type LatencyScenario, type SampledRequest } from '@grasp/engine';
import { Draw, dot, pick, r1, tw } from './latency-draw';
import { queueForms, sampleTime, type Hid } from './latency-words';

/** Where the band draws: what a play redraws at each moment, without placing anything. */
export interface Band {
  W: number;
  pad: number;
  c: number;
  up: number;
  split: boolean;
  hidden: boolean;
  /** The servers' boxes' left edge and width, and the exit stub's length. */
  xs: number;
  sw: number;
  exitW: number;
  /** Each server's box top and its ring's center. */
  boxes: { y: number; ry: number; rx: number }[];
  bh: number;
  ring: number;
  /** The request in service: a dot in its server's ring. */
  serveR: number;
  dotR: number;
  pitch: number;
  /** The shared lane's fork, the router's diamond and where each server's own lane starts. */
  xf: number;
  ymid: number;
  xr: number;
  xl0: number;
  labelY: number;
  qRoom: number;
  bottom: number;
}

/**
 * The band's moment: its label, the waiting dots by request (oldest at the head of each line, then a "+N" chip where
 * the line passes its room), each server's ring with the request in service, and "idle". At rest (`now` null) the
 * request first in line says how long it has waited.
 */
export function drawBand(
  D: Draw,
  b: Band,
  m: LatencyScenario,
  smp: LatencySample | null,
  hid: Hid,
  t: number,
  now: { rate: number } | null,
): { idle: number[]; lines: number[] } {
  const at = smp ? sampleAt(smp, t) : { waiting: [] as SampledRequest[], serving: [] as SampledRequest[] };
  const forms = queueForms(m, smp, hid, now ? at.waiting.length : null);
  D.text(
    'queue-label',
    b.pad,
    b.labelY,
    [[pick(forms, (f) => tw(f, 'label') <= b.qRoom) ?? forms[forms.length - 1], 'label', hid.sample ? 'muted' : '']],
    { owner: 'qlabel' },
  );
  const lanes = b.split ? Array.from({ length: b.up }, (_, i) => at.waiting.filter((r) => r.server === i)) : [at.waiting];
  lanes.forEach((list, i) => {
    const head = laneHead(b, b.split ? i : -1);
    queueDots(D, b, list, head.x, head.y, b.split ? b.xl0 + 6 : b.pad + 8, b.split ? `queue q${i}` : 'queue', now);
  });
  if (smp && !now && at.waiting.length) {
    const rest = smp.rest;
    const k = b.split && rest.kind === 'idle' ? rest.line! : lanes.reduce((best, l, i) => (l.length > lanes[best].length ? i : best), 0);
    const first = lanes[k][0];
    const head = laneHead(b, b.split ? k : -1);
    const waited = sampleTime(Math.max(0, t - first.arrive));
    for (const words of [`first in line: waiting ${waited} so far`, `first in line: ${waited}`, `first: ${waited}`])
      if (
        D.place(
          'head-note',
          [
            [head.x + b.dotR, head.y - b.dotR - 7, 'end'],
            [head.x + b.dotR, head.y + b.dotR + 14, 'end'],
          ],
          [[words, 'small', 'wait-ink']],
          { owner: 'queue', ground: true, minX: b.pad, maxX: b.xs - 4, optional: true },
        )
      )
        break;
  }
  const idle: number[] = [];
  b.boxes.forEach((box, i) => {
    if (i >= b.up) return;
    const name = `S${i + 1}`;
    const r = at.serving.find((q) => q.server === i);
    if (r) {
      const screen = now ? (r.leave - r.start) * now.rate : Infinity;
      const p = screen < 120 ? 1 : Math.max(0.02, Math.min(0.999, (t - r.start) / (r.leave - r.start)));
      D.add('marks', `arc-${i}`, { k: 'path', cls: 'ring-arc', d: arc(box.rx, box.ry, b.ring, p) });
      dot(D, `req-${r.id}`, box.rx, box.ry, b.serveR, 'serve', name, !!now);
    } else if (smp) {
      idle.push(i);
      if (b.xs + 9 + tw(name, 'nameS') + 6 + tw('idle', 'small') <= box.rx - b.ring - 5)
        D.text(`srv-${i}-idle`, box.rx - b.ring - 5, box.ry + 4, [['idle', 'small', 'muted']], {
          owner: name,
          anchor: 'end',
          cls: 'on-box',
        });
    }
  });
  return { idle, lines: lanes.map((l) => l.length) };
}

/** A ring's progress `p` (0 to 1) as an arc from the top, clockwise; a whole ring at 1. */
function arc(cx: number, cy: number, r: number, p: number): string {
  if (p >= 1) return `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx} ${cy + r}A${r} ${r} 0 1 1 ${cx} ${cy - r}`;
  const ang = p * 2 * Math.PI;
  return `M${cx} ${cy - r}A${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${r1(cx + r * Math.sin(ang))} ${r1(cy - r * Math.cos(ang))}`;
}

/** Where a line's head waits: before the fork for one shared queue, before server `i`'s box for a queue each. */
export function laneHead(b: Band, i: number): { x: number; y: number } {
  return i < 0 ? { x: b.xf - 10, y: b.ymid } : { x: b.xs - 10, y: b.boxes[i].ry };
}

/** A line of waiting dots from its head leftward, and a "+N" chip, its own width counted, where it passes the room. */
function queueDots(
  D: Draw,
  b: Band,
  list: readonly SampledRequest[],
  xHead: number,
  yq: number,
  xTail: number,
  owner: string,
  now: { rate: number } | null,
) {
  const { pitch, dotR } = b;
  const cap = Math.max(1, Math.floor((xHead - xTail) / pitch) + 1);
  let shown = list.length;
  if (list.length > cap)
    for (shown = cap - 1; shown > 0; shown--) {
      const cw = tw(`+${list.length - shown}`, 'mono') + 10;
      if (xHead - shown * pitch + dotR - 2 - cw >= xTail - dotR) break;
    }
  list.slice(0, shown).forEach((r, k) => dot(D, `req-${r.id}`, xHead - k * pitch, yq, dotR, 'wait', owner, !!now));
  if (list.length > shown) {
    const more = `+${list.length - shown}`;
    const cw = tw(more, 'mono') + 10;
    const cx1 = xHead - shown * pitch + dotR - 2;
    const ch = 2 * dotR + 4;
    D.add('marks', `chip-${owner}`, { k: 'rect', cls: 'chip', x: r1(cx1 - cw), y: yq - ch / 2, w: cw, h: ch, rx: ch / 2 });
    D.mark({ x0: cx1 - cw, x1: cx1, y0: yq - ch / 2, y1: yq + ch / 2 }, owner);
    D.text(`more-${owner}`, cx1 - cw / 2, yq + 4, [[more, 'mono', 'ink']], {
      owner: `${owner} lane`,
      anchor: 'middle',
      cls: 'on-chip',
      ground: true,
    });
  }
}

/** The request that left last before the moment drawn, in words: its own waiting and work, where there is room. */
export function drawReceipt(D: Draw, b: Band, smp: LatencySample, t: number) {
  const last = smp.reqs.filter((r) => r.leave <= t).reduce<SampledRequest | null>((a, r) => (!a || r.leave > a.leave ? r : a), null);
  if (!last) return;
  const waited = last.start - last.arrive;
  const work = sampleTime(last.leave - last.start);
  const words =
    waited < 0.005
      ? [`Just left: no wait, then ${work} of work`, `Just left: no wait, ${work}`]
      : [`Just left: waited ${sampleTime(waited)}, then ${work} of work`, `Just left: waited ${sampleTime(waited)}, worked ${work}`];
  const t2 = pick(words, (w) => tw(w, 'small') <= b.xf - b.pad - 12);
  if (t2) D.place('receipt', [[b.pad, b.bottom - 6]], [[t2, 'small', 'muted']], { owner: 'receipt', optional: true });
}
