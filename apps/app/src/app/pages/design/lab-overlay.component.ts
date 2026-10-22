import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { COMPONENTS, NODE_SIZE, fmt, type Insight, type WorkloadControls } from '@grasp/engine';
import { hits, placeCallouts, type PxBox } from '../../viz/kit/sys/callouts';
import { pillWidth } from '../../viz/kit/sys/sys-edge.component';
import { HandleComponent } from '../../viz/kit/handle.component';
import type { LabHost } from './lab-host';
import { msText } from './lab-trace';

/** Traffic snaps: 1, 2 and 5 of each power of ten. */
const SNAPS = [1, 2, 5].flatMap((m) => [100, 1_000, 10_000, 100_000, 1_000_000].map((p) => m * p)).sort((a, b) => a - b);
/** The traffic handle's track, in px. */
const TRACK_PX = 200;
/** Severities worth pinning to a node; tips stay in the list. */
const PINNED: Insight['severity'][] = ['critical', 'warning'];
/** A hop label's size at 11px: "+16 ms". */
const hopSize = (text: string) => ({ w: text.length * 6.6 + 12, h: 20 });

/** The traffic values a build offers: 1-2-5 snaps within its range, plus its own default and the load it opened at. */
export function trafficSnaps(range: WorkloadControls['traffic'], keep: readonly number[]): number[] {
  const inRange = (v: number) => v >= range.min && v <= range.max;
  return [...new Set([...SNAPS.filter(inRange), ...keep.filter(inRange)])].sort((a, b) => a - b);
}

/**
 * An insight's title as a callout on its node: a node the learner or the case named is called by its name ("Control
 * plane running hot"), not its kind's ("App Servers running hot").
 */
export function calloutText(title: string, kindName: string, name: string, short: string): string {
  return name === short || !title.includes(kindName) ? title : title.replace(kindName, name);
}

/**
 * What the desktop canvas lays over its drawing in screen pixels, so text stays legible at any zoom: the Traffic handle
 * on the client (REDESIGN.md principle 4), the callouts pinned to their nodes, and a trace's hop times and summary. Each
 * label keeps off the nodes, the rps pills and tags, the edges and the labels placed before it.
 */
@Component({
  selector: 'app-lab-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HandleComponent],
  template: `
    @for (c of callouts(); track c.nodeId) {
      <button
        class="callout"
        [class]="c.side"
        [attr.data-severity]="c.severity"
        [style.left.px]="c.x"
        [style.top.px]="c.y"
        [style.width.px]="c.w"
        (click)="host().focusInsight(c.nodeId)"
      >
        <span class="visually-hidden">{{ c.severity === 'critical' ? 'Critical:' : 'Warning:' }} </span>{{ c.text }}
      </button>
    }
    @for (h of hopLabels(); track h.nodeId) {
      <span class="hop" [class.net]="h.net" aria-hidden="true" [style.left.px]="h.x" [style.top.px]="h.y">{{ h.text }}</span>
    }
    @if (summary(); as t) {
      <p class="trace-summary">
        <span role="status">{{ t }}</span>
        <button class="g-btn ghost icon" (click)="host().trace()?.clear()" aria-label="Clear the trace">×</button>
      </p>
    }
    @if (traffic(); as t) {
      <span class="track" aria-hidden="true" [style.left.px]="t.positions[0]" [style.top.px]="t.cross" [style.width.px]="track"></span>
      <span class="track-label" aria-hidden="true" [style.left.px]="t.positions[0] + track + 16" [style.top.px]="t.cross - 8">Traffic</span>
      <g-handle
        [values]="t.values"
        [value]="rps()"
        (valueChange)="host().setTraffic($event)"
        [positions]="t.positions"
        [cross]="t.cross"
        label="Traffic"
        [valuetext]="valuetext()"
      />
    }
  `,
  styleUrl: './lab-overlay.component.scss',
})
export class LabOverlayComponent {
  readonly host = input.required<LabHost>();
  readonly rps = computed(() => this.host().workload().rps);
  readonly track = TRACK_PX;

  private readonly scale = computed(() => this.host().canvasSize().w / this.host().view().w);
  private readonly px = (x: number, y: number) => {
    const v = this.host().view();
    return { x: (x - v.x) * this.scale(), y: (y - v.y) * this.scale() };
  };

  /** Each node's box on screen. */
  private readonly boxes = computed(
    () =>
      new Map<string, PxBox>(
        this.host()
          .placedNodes()
          .map((n) => {
            const p = this.px(n.x - NODE_SIZE.w / 2, n.y - NODE_SIZE.h / 2);
            return [n.id, { ...p, w: NODE_SIZE.w * this.scale(), h: NODE_SIZE.h * this.scale() }];
          }),
      ),
  );

  /** What labels keep off besides the nodes: every edge's segments, the pinned pills and tags, and the Traffic handle. */
  private readonly obstacles = computed(() => {
    const s = this.scale();
    const grow = this.host().textScale();
    const out: PxBox[] = [];
    for (const e of this.host().edges()) {
      for (let i = 1; i < e.points.length; i++) {
        const a = this.px(e.points[i - 1][0], e.points[i - 1][1]);
        const b = this.px(e.points[i][0], e.points[i][1]);
        out.push({ x: Math.min(a.x, b.x) - 3, y: Math.min(a.y, b.y) - 3, w: Math.abs(a.x - b.x) + 6, h: Math.abs(a.y - b.y) + 6 });
      }
      const mid = this.px(e.mid[0], e.mid[1]);
      if (e.pill) {
        const w = pillWidth(`${fmt(e.rps)} rps`) * grow * s;
        out.push({ x: mid.x - w / 2, y: mid.y - 10 * grow * s, w, h: 20 * grow * s });
      }
      if (e.tag || e.droppedRps > 0) out.push({ x: mid.x - 60 * s, y: mid.y + 10 * s, w: 120 * s, h: 30 * grow * s });
    }
    const handle = this.trafficBox();
    if (handle) out.push(handle);
    return out;
  });

  readonly callouts = computed(() => {
    const severity = new Map<string, Insight['severity']>();
    const nodes = new Map(
      this.host()
        .placedNodes()
        .map((n) => [n.id, n]),
    );
    const items = this.host()
      .insights()
      .flatMap((i) => {
        const node = i.nodeId ? nodes.get(i.nodeId) : undefined;
        if (!node || !PINNED.includes(i.severity) || severity.has(node.id)) return [];
        severity.set(node.id, i.severity);
        const spec = COMPONENTS[node.kind];
        return [{ nodeId: node.id, text: calloutText(i.title, spec.name, this.host().nodeName(node.id), spec.short) }];
      });
    return placeCallouts(items, this.boxes(), this.host().canvasSize(), { obstacles: this.obstacles() }).map((c) => ({
      ...c,
      severity: severity.get(c.nodeId)!,
    }));
  });

  /** The time spent in each node the traced dot has reached, and the network time into it where that is a ms or more. */
  readonly hopLabels = computed(() => {
    const trace = this.host().trace();
    const hops = trace?.hops()?.slice(1, trace.reached()) ?? [];
    const placedFirst = [...this.obstacles(), ...this.callouts()];
    const nodeItems = hops.map((h) => ({ nodeId: h.id, text: msText(h.nodeMs) }));
    const nodeLabels = placeCallouts(nodeItems, this.boxes(), this.host().canvasSize(), {
      obstacles: placedFirst,
      sides: ['above', 'below'],
      size: hopSize,
    }).map((l) => ({ nodeId: l.nodeId, text: l.text, x: l.x, y: l.y, net: false }));
    const edges = this.host().edges();
    const netLabels = hops.flatMap((h, i) => {
      const from = i === 0 ? trace!.hops()![0].id : hops[i - 1].id;
      const edge = edges.find((e) => e.from === from && e.to === h.id);
      if (!edge || h.networkMs < 1) return [];
      const mid = this.px(edge.mid[0], edge.mid[1]);
      const { w, h: height } = hopSize(`+${msText(h.networkMs)}`);
      const box = { x: mid.x - w / 2, y: mid.y - height - 12, w, h: height };
      if ([...placedFirst, ...nodeLabels.map((l) => ({ ...l, ...hopSize(l.text) }))].some((o) => hits(box, o, 2))) return [];
      return [{ nodeId: `${h.id} net`, text: `+${msText(h.networkMs)}`, x: box.x, y: box.y, net: true }];
    });
    return [...nodeLabels, ...netLabels];
  });

  readonly summary = computed(
    () =>
      this.host()
        .trace()
        ?.summary((id) => this.host().nodeName(id)) ?? null,
  );

  private readonly trafficBox = computed<PxBox | null>(() => {
    const t = this.traffic();
    return t ? { x: t.positions[0] - 22, y: t.cross - 22, w: TRACK_PX + 80, h: 44 } : null;
  });

  readonly traffic = computed(() => {
    const client = this.host().trafficControl();
    const box = client && this.boxes().get(client.id);
    if (!client || !box) return null;
    const values = trafficSnaps(client.range, [...client.keep, this.rps()]);
    const step = TRACK_PX / Math.max(1, values.length - 1);
    return { values, positions: values.map((_, i) => box.x + i * step), cross: box.y + box.h + 14 };
  });

  readonly valuetext = computed(() => `${fmt(this.rps())} requests per second`);
}
