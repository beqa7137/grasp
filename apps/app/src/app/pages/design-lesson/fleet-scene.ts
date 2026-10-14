/*
 * The Load Balancing fleet's moving parts, painted on a canvas with no DOM: in a worker on an `OffscreenCanvas`, or on
 * the page where a browser has none. Nothing here may touch `document` or `window`.
 */

export type Pt = readonly [number, number];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Room at a lane's start for its count, inside the lane's background. */
export const COUNT_W = 44;

/** A lane as the canvas draws it: where its queue runs (newest at `x0`, the server's door at `x1`) and its server box. */
export interface FleetLane {
  y: number;
  height: number;
  x0: number;
  x1: number;
  serverX: number;
  serverW: number;
  /** The server box's left edge: the slow server's box grows left with its slowdown. */
  boxX: number;
  /** Blocks the lane has room for. */
  cap: number;
  /** The server's name, or '' where the lane has no room for it. */
  name: string;
}

/** The theme's colours and the label font, read on the page. */
export interface FleetColors {
  current: string;
  currentSoft: string;
  considering: string;
  consideringSoft: string;
  critical: string;
  stage: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  font: string;
}

export interface FleetState {
  /** The part of the stage the canvas covers, and the pixel density to paint at. */
  box: Box;
  dpr: number;
  lanes: FleetLane[];
  /** How a request reaches each lane, ending at the lane's door. */
  links: Pt[][];
  /** Requests in flight on each server at each sample of the run. */
  queues: number[][] | null;
  /** In flight at the dispatch "Watch it choose" shows, in place of the run's. */
  override: number[] | null;
  /** Where the replay is, as a fractional sample index. */
  t: number;
  /** Requests one block stands for. */
  perBlock: number;
  /** The first lane's server is slower than the rest, or sent more than it can keep up with. */
  slow: boolean;
  bad: boolean;
  /** The servers the policy picked, in order: the dots follow them. */
  picks: number[] | null;
  /** Dots flow while motion is allowed, the stage is in view and no pick is shown. */
  flow: boolean;
  colors: FleetColors | null;
}

export type FleetUpdate = Partial<FleetState>;

type Ctx = OffscreenCanvasRenderingContext2D;
interface Surface {
  width: number;
  height: number;
  getContext(kind: '2d'): unknown;
}

const DOT_EVERY_MS = 70;
const DOT_MS = 640;
/** How often the live dot count goes back to the page (a test hook), at most. */
const COUNT_EVERY_MS = 300;

/** How many blocks a lane's waiting requests take; the one in service is on the server itself. */
export const waitingBlocks = (inFlight: number, perBlock: number, cap: number) =>
  Math.min(cap, Math.ceil(Math.max(0, inFlight - 1) / perBlock));

/** Where a lane's queue ends, so a dot joins its back. */
export const queueTail = (lane: FleetLane, inFlight: number, perBlock: number) =>
  lane.x1 - waitingBlocks(inFlight, perBlock, lane.cap) * ((lane.x1 - lane.x0) / lane.cap);

/** Where a dot is `progress` (0 to 1) along a path, at an even speed. */
export function along(path: readonly Pt[], progress: number): Pt {
  const legs = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  let left = Math.min(1, Math.max(0, progress)) * legs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < legs.length; i++) {
    if (left <= legs[i] || i === legs.length - 1) {
      const f = legs[i] ? Math.min(1, left / legs[i]) : 1;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f];
    }
    left -= legs[i];
  }
  return path[path.length - 1];
}

/** In flight on each server at a fractional sample, between the two samples either side of it. */
export function queuesAt(queues: readonly (readonly number[])[], t: number): number[] {
  const at = Math.min(queues.length - 1, Math.max(0, t));
  const [a, b] = [queues[Math.floor(at)], queues[Math.ceil(at)]];
  const f = at - Math.floor(at);
  return a.map((q, i) => Math.round(q + (b[i] - q) * f));
}

/**
 * Paints the fleet: the links from the balancer, each lane, its waiting requests as blocks, each server and whether it
 * is busy, its name, and the request dots. It paints when its state changes, and every frame while dots flow; `frame` asks for the next frame.
 */
export class FleetScene {
  private readonly ctx: Ctx | null;
  private state: FleetState = {
    box: { x: 0, y: 0, width: 0, height: 0 },
    dpr: 1,
    lanes: [],
    links: [],
    queues: null,
    override: null,
    t: 0,
    perBlock: 1,
    slow: false,
    bad: false,
    picks: null,
    flow: false,
    colors: null,
  };
  private dots: { path: readonly Pt[]; born: number; slow: boolean }[] = [];
  private elapsed = 0;
  private last = 0;
  private sent = 0;
  private pending = false;
  private stopped = false;
  private counted = -1;
  private countedAt = 0;

  constructor(
    private readonly surface: Surface,
    private readonly frame: (paint: (now: number) => void) => void,
    private readonly onDots: (live: number) => void = () => undefined,
  ) {
    this.ctx = surface.getContext('2d') as Ctx | null;
  }

  update(u: FleetUpdate) {
    const resized =
      (u.box && JSON.stringify(u.box) !== JSON.stringify(this.state.box)) || (u.dpr !== undefined && u.dpr !== this.state.dpr);
    if (u.flow && !this.state.flow) this.last = 0;
    if (u.flow === false) this.dots = [];
    this.state = { ...this.state, ...u };
    if (resized) {
      const { box, dpr } = this.state;
      this.surface.width = Math.round(box.width * dpr);
      this.surface.height = Math.round(box.height * dpr);
    }
    this.schedule();
  }

  stop() {
    this.stopped = true;
  }

  private schedule() {
    if (this.pending || this.stopped) return;
    this.pending = true;
    this.frame((now) => {
      this.pending = false;
      this.paint(now);
      if (this.state.flow) this.schedule();
    });
  }

  private lanesNow(): number[] {
    const { override, queues, lanes, t } = this.state;
    if (override && override.length === lanes.length) return override;
    if (!queues?.length || queues[0].length !== lanes.length) return lanes.map(() => 0);
    return queuesAt(queues, t);
  }

  private paint(now: number) {
    const ctx = this.ctx;
    const s = this.state;
    const c = s.colors;
    if (!ctx || !c) return;
    const inFlight = this.lanesNow();
    if (s.flow) this.flowDots(now, inFlight);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.surface.width, this.surface.height);
    ctx.setTransform(s.dpr, 0, 0, s.dpr, -s.box.x * s.dpr, -s.box.y * s.dpr);
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const link of s.links) link.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    s.lanes.forEach((lane, i) => {
      const first = i === 0;
      const [line, soft] =
        first && s.bad ? [c.critical, c.critical] : first && s.slow ? [c.considering, c.consideringSoft] : [c.current, c.currentSoft];
      const top = lane.y - lane.height / 2 + 1;
      const height = lane.height - 2;
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = c.text;
      ctx.fillRect(lane.x0 - COUNT_W, top, lane.boxX - lane.x0 + COUNT_W, height);
      ctx.globalAlpha = 1;

      const n = waitingBlocks(inFlight[i], s.perBlock, lane.cap);
      const step = (lane.x1 - lane.x0) / lane.cap;
      const h = Math.min(18, lane.height - 3);
      const y = lane.y - h / 2;
      ctx.fillStyle = soft;
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (let k = 0; k < n; k++) {
        const x = lane.x1 - (k + 1) * step + 0.5;
        ctx.fillRect(x, y, step - 1, h);
        if (step >= 4) ctx.strokeRect(x + 0.5, y + 0.5, step - 2, h - 1);
      }

      const boxW = lane.serverX + lane.serverW - lane.boxX;
      ctx.fillStyle = c.surface;
      ctx.fillRect(lane.boxX, top, boxW, height);
      if (inFlight[i] > 0) {
        ctx.fillStyle = soft;
        ctx.fillRect(lane.boxX, top, boxW, height);
      }
      ctx.strokeStyle = c.text;
      ctx.lineWidth = first && s.slow ? 1.75 : 1.25;
      ctx.strokeRect(lane.boxX + 0.5, top + 0.5, boxW - 1, height - 1);
      if (lane.name) {
        ctx.font = c.font;
        ctx.textAlign = 'center';
        ctx.fillStyle = first ? c.text : c.muted;
        // S1's name keeps right of its box's left edge, where the slow handle sits.
        ctx.fillText(lane.name, lane.serverX + (first ? 20 : 15), lane.y + 4);
      }
    });
    for (const dot of this.dots) {
      const [x, y] = along(dot.path, (this.elapsed - dot.born) / DOT_MS);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = dot.slow ? c.considering : c.current;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = c.stage;
      ctx.stroke();
    }
    if (this.dots.length !== this.counted && (now - this.countedAt > COUNT_EVERY_MS || !this.dots.length)) {
      this.counted = this.dots.length;
      this.countedAt = now;
      this.onDots(this.counted);
    }
  }

  /** Sends a dot to each server the policy picked, in its own order, to the back of that server's queue. */
  private flowDots(now: number, inFlight: readonly number[]) {
    // A frame long after the last (a hidden tab, a paused flow) moves the clock on by one frame, not by the gap.
    this.elapsed += this.last ? Math.min(50, now - this.last) : 0;
    this.last = now;
    const { picks, links, lanes, perBlock, override } = this.state;
    if (!picks?.length || override) {
      this.sent = Math.ceil(this.elapsed / DOT_EVERY_MS);
    } else {
      for (; this.sent * DOT_EVERY_MS <= this.elapsed; this.sent++) {
        const server = picks[this.sent % picks.length];
        const [path, lane] = [links[server], lanes[server]];
        if (!path || !lane) continue;
        const end: Pt = [Math.max(lane.x0, queueTail(lane, inFlight[server], perBlock) - 4), lane.y];
        this.dots.push({ path: [...path.slice(0, -1), end], born: this.sent * DOT_EVERY_MS, slow: server === 0 && this.state.slow });
      }
    }
    this.dots = this.dots.filter((d) => this.elapsed - d.born <= DOT_MS);
  }
}
