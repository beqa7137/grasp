import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { Preferences } from '@capacitor/preferences';
import {
  COMPONENTS,
  DEFAULT_OBJECT_SHARE,
  PALETTE,
  canConnect,
  createNode,
  evaluate,
  fmt,
  getCaseLab,
  getCaseSummary,
  getScenario,
  migrateSavedDesign,
  scenarioVariant,
  simulate,
  type ComponentKind,
  type Design,
  type DesignNode,
  type SavedDesign,
  type Scenario,
  type Workload,
} from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  add,
  alertCircle,
  bulbOutline,
  checkmarkCircle,
  closeCircleOutline,
  informationCircle,
  refresh,
  remove,
  scanOutline,
  trashOutline,
  trophy,
  warning,
} from 'ionicons/icons';
import { AnnouncerService } from '../../core/announcer.service';
import { refocusAfterRender } from '../../core/focus';
import { haptic } from '../../core/haptics';
import { onPageKey } from '../../core/on-page-key';
import { ProgressService } from '../../core/progress.service';
import { uniqueId } from '../../core/unique-id';
import { curve, edgePath } from './edge-path';
import { FREE_BUILD } from './free-build';
import { NodeInspectorComponent } from './node-inspector.component';
import {
  BOARD,
  type Point,
  type ViewBox,
  clampView,
  fitView,
  freeSpot,
  initialView,
  panBy,
  reveal,
  sameView,
  toBoard,
  zoomAt,
} from './viewport';

const W = 132;
const H = 70;
const VIEW_W = BOARD.w;
const VIEW_H = BOARD.h;
const ZOOM_STEP = 1.35;
/** Screen pixels a background drag must travel before it pans instead of counting as a tap. */
const PAN_SLOP_PX = 6;

type Gesture =
  | { kind: 'pan'; id: number; start: Point; view: ViewBox; moved: boolean }
  | { kind: 'pinch'; ids: [number, number]; distance: number; mid: Point; view: ViewBox };

type Drag =
  | { kind: 'move'; id: string; dx: number; dy: number; startX: number; startY: number; moved: boolean }
  | { kind: 'link'; from: string; x: number; y: number };

@Component({
  selector: 'app-sandbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon, NodeInspectorComponent],
  providers: [AnnouncerService],
  templateUrl: './sandbox.page.html',
  styleUrl: './sandbox.page.scss',
})
export class SandboxPage {
  readonly id = input.required<string>();
  readonly caseId = input<string | undefined>(undefined, { alias: 'case' });
  readonly revisit = input(undefined, {
    transform: (v: string | number | undefined) => (v === undefined || v === '' ? undefined : Number(v)),
  });
  private readonly progress = inject(ProgressService);
  private readonly toasts = inject(ToastController);
  readonly announcer = inject(AnnouncerService);
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('canvas');
  private readonly inspector = viewChild(NodeInspectorComponent);
  private readonly injector = inject(Injector);
  readonly targetsLabelId = uniqueId('sandbox-targets');

  readonly W = W;
  readonly H = H;
  readonly board = BOARD;
  readonly view = signal<ViewBox>(fitView(BOARD.h / BOARD.w));
  readonly viewBox = computed(() => {
    const v = this.view();
    return `${v.x} ${v.y} ${v.w} ${v.h}`;
  });
  readonly zoomedIn = computed(() => !sameView(this.view(), fitView(this.aspect)));
  private aspect = BOARD.h / BOARD.w;
  private placedView = false;
  private canvasWidth = 0;
  private readonly pointers = new Map<number, Point>();
  private gesture: Gesture | null = null;
  readonly palette = PALETTE.map((k) => COMPONENTS[k]);
  readonly specs = COMPONENTS;
  readonly fmt = fmt;
  readonly defaultObjectShare = DEFAULT_OBJECT_SHARE;

  /** A case study's reference build, opened as a free build under the load the case estimates. */
  protected readonly caseBuild = computed<Scenario | undefined>(() => {
    const id = this.caseId();
    const lab = id ? getCaseLab(id) : undefined;
    const title = id ? getCaseSummary(id)?.title : undefined;
    if (!lab || !title) return undefined;
    return {
      ...FREE_BUILD,
      title: `${title} build`,
      tagline: `The reference design from the ${title} case study.`,
      brief: `The ${title} case study's design at ${fmt(lab.workload.rps)} requests per second. Push the traffic up, kill a node, and see what gives first.`,
      starter: lab.design,
      workload: lab.workload,
    };
  });

  readonly scenario = computed<Scenario | undefined>(() => {
    if (this.id() === FREE_BUILD.id) return this.caseBuild() ?? FREE_BUILD;
    const n = this.revisit();
    return n ? scenarioVariant(this.id(), n) : getScenario(this.id());
  });
  readonly storageKey = computed(() =>
    this.caseBuild() ? `grasp.design.case.${this.caseId()}` : `grasp.design.${this.id()}${this.revisit() ? `.r${this.revisit()}` : ''}`,
  );
  readonly isFree = computed(() => this.id() === FREE_BUILD.id);

  readonly design = signal<Design>({ nodes: [], edges: [] });
  readonly workload = signal<Workload>({ rps: 1000, readRatio: 0.9 });
  readonly result = computed(() => simulate(this.design(), this.workload()));
  readonly checks = computed(() => {
    const s = this.scenario();
    return s && !this.isFree() ? evaluate(s, this.design(), this.result()) : [];
  });
  readonly passed = computed(() => this.checks().length > 0 && this.checks().every((c) => c.pass));

  readonly selectedId = signal<string | null>(null);
  readonly selectedEdge = signal<string | null>(null);
  readonly connectFrom = signal<string | null>(null);
  readonly drag = signal<Drag | null>(null);
  readonly hintsShown = signal(0);
  readonly celebrated = signal(false);
  private readonly loaded = signal(false);

  readonly selected = computed(() => this.design().nodes.find((n) => n.id === this.selectedId()) ?? null);
  readonly selectedStats = computed(() => {
    const n = this.selected();
    return n ? this.result().nodes[n.id] : null;
  });

  readonly edges = computed(() => {
    const byId = new Map(this.design().nodes.map((n) => [n.id, n]));
    return this.design().edges.flatMap((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) return [];
      const key = `${e.from}->${e.to}`;
      const rps = this.result().edges[key] ?? 0;
      const status = this.result().nodes[b.id]?.status ?? 'idle';
      return [
        {
          key,
          from: e.from,
          to: e.to,
          d: edgePath(a, b, { w: W, h: H }, BOARD.h),
          rps,
          status,
          width: 1.5 + Math.log10(rps + 1) * 0.9,
          dur: rps > 0 ? Math.max(0.35, 3.2 - Math.log10(rps + 1) * 0.55) : 0,
        },
      ];
    });
  });

  readonly outgoing = computed(() =>
    this.edges()
      .filter((e) => e.from === this.selectedId())
      .map((e) => ({ key: e.key, name: this.nodeName(e.to), rps: e.rps })),
  );
  /** Where the component being connected can send traffic, for choosing without a pointer. */
  readonly connectTargets = computed(() => {
    const from = this.connectFrom();
    const design = this.design();
    return from ? design.nodes.filter((n) => canConnect(design, from, n.id).ok).map((n) => ({ id: n.id, name: this.nodeName(n.id) })) : [];
  });

  readonly linkPreview = computed(() => {
    const d = this.drag();
    if (d?.kind !== 'link') return null;
    const from = this.design().nodes.find((n) => n.id === d.from);
    return from ? curve(from.x + W / 2, from.y, d.x, d.y) : null;
  });

  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    addIcons({
      add,
      remove,
      refresh,
      trashOutline,
      checkmarkCircle,
      closeCircleOutline,
      alertCircle,
      warning,
      informationCircle,
      bulbOutline,
      trophy,
      scanOutline,
    });

    effect(() => {
      const s = this.scenario();
      if (!s) return;
      untracked(() => void this.restore(s));
    });

    effect(() => {
      const d = this.design();
      if (!this.loaded()) return;
      const key = untracked(() => this.storageKey());
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(
        () => void Preferences.set({ key, value: JSON.stringify({ design: d, workload: untracked(() => this.workload()) }) }),
        400,
      );
    });

    effect(() => {
      if (!this.passed() || untracked(() => this.celebrated())) return;
      this.celebrated.set(true);
      void haptic.success();
      const s = untracked(() => this.scenario())!;
      const cost = untracked(() => this.result().metrics.monthlyCost);
      const mission = untracked(() => this.progress.state().missions[s.id]);
      const variant = s.revisit?.number;
      const counts = variant ? mission?.revisitsDone === variant - 1 : !mission || cost < mission.bestCost;
      if (counts)
        void this.progress.record({ type: 'scenario.completed', scenarioId: s.id, monthlyCost: cost, ...(variant ? { variant } : {}) });
    });

    const resize = new ResizeObserver(([entry]) => this.onResize(entry.contentRect.width, entry.contentRect.height));
    effect(() => {
      const el = this.svg()?.nativeElement;
      if (el) resize.observe(el);
    });
    effect(() => {
      if (this.loaded()) untracked(() => this.placeView());
    });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.saveTimer);
      resize.disconnect();
    });
    onPageKey((e) => this.onKey(e));
  }

  private onResize(width: number, height: number) {
    if (!width || !height) return;
    this.aspect = height / width;
    this.canvasWidth = width;
    if (!this.placedView) {
      this.placeView();
      return;
    }
    const v = this.view();
    const w = v.w;
    const h = w * this.aspect;
    this.view.set(clampView({ x: v.x, y: v.y + (v.h - h) / 2, w, h }, this.aspect));
  }

  /** Opens each design at a sensible zoom once both the design and the canvas size are known. */
  private placeView() {
    if (this.placedView || !this.loaded() || !this.canvasWidth) return;
    this.placedView = true;
    this.view.set(initialView(this.aspect, this.canvasWidth, this.design().nodes));
  }

  zoom(direction: 1 | -1) {
    const v = this.view();
    this.view.set(zoomAt(v, { x: v.x + v.w / 2, y: v.y + v.h / 2 }, direction > 0 ? 1 / ZOOM_STEP : ZOOM_STEP, this.aspect));
  }

  fitBoard() {
    this.view.set(fitView(this.aspect));
  }

  onWheel(e: WheelEvent) {
    // Trackpad pinches arrive as ctrl+wheel; a plain wheel keeps scrolling the page.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = Math.min(1.25, Math.max(0.8, Math.exp(e.deltaY * 0.005)));
    this.view.set(zoomAt(this.view(), toBoard(this.view(), this.rect(), { x: e.clientX, y: e.clientY }), factor, this.aspect));
  }

  onCanvasDown(e: PointerEvent) {
    this.svg()?.nativeElement.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.startGesture();
  }

  private startGesture() {
    const [a, b] = [...this.pointers.entries()];
    if (a && b) {
      this.gesture = {
        kind: 'pinch',
        ids: [a[0], b[0]],
        distance: Math.max(1, Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y)),
        mid: { x: (a[1].x + b[1].x) / 2, y: (a[1].y + b[1].y) / 2 },
        view: this.view(),
      };
    } else if (a) {
      this.gesture = { kind: 'pan', id: a[0], start: a[1], view: this.view(), moved: false };
    } else {
      this.gesture = null;
    }
  }

  private moveGesture() {
    const g = this.gesture;
    if (!g) return;
    const rect = this.rect();
    if (g.kind === 'pan') {
      const p = this.pointers.get(g.id);
      if (!p) return;
      g.moved ||= Math.hypot(p.x - g.start.x, p.y - g.start.y) > PAN_SLOP_PX;
      if (!g.moved) return;
      const scale = g.view.w / rect.width;
      this.view.set(panBy(g.view, (g.start.x - p.x) * scale, (g.start.y - p.y) * scale, this.aspect));
      return;
    }
    const a = this.pointers.get(g.ids[0]);
    const b = this.pointers.get(g.ids[1]);
    if (!a || !b) return;
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoomed = zoomAt(g.view, toBoard(g.view, rect, g.mid), g.distance / distance, this.aspect);
    const scale = zoomed.w / rect.width;
    this.view.set(panBy(zoomed, (g.mid.x - mid.x) * scale, (g.mid.y - mid.y) * scale, this.aspect));
  }

  private endPointer(e: PointerEvent, cancelled: boolean) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!cancelled && g?.kind === 'pan' && !g.moved && this.pointers.size === 0) this.onBackground();
    // Lifting one finger of a pinch continues as a pan with the other.
    this.startGesture();
    if (this.gesture?.kind === 'pan') this.gesture.moved = true;
  }

  private rect() {
    return this.svg()!.nativeElement.getBoundingClientRect();
  }

  private async restore(s: Scenario) {
    this.loaded.set(false);
    this.placedView = false;
    const { value } = await Preferences.get({ key: this.storageKey() });
    const saved = value ? migrateSavedDesign(JSON.parse(value) as SavedDesign) : null;
    this.design.set(saved?.design ?? structuredClone(s.starter));
    this.workload.set(this.isFree() && saved ? saved.workload : s.workload);
    this.celebrated.set(false);
    this.hintsShown.set(0);
    this.clearSelection();
    this.loaded.set(true);
  }

  resetDesign() {
    const s = this.scenario();
    if (!s) return;
    this.design.set(structuredClone(s.starter));
    this.workload.set(s.workload);
    this.celebrated.set(false);
    this.clearSelection();
  }

  clearSelection() {
    this.selectedId.set(null);
    this.selectedEdge.set(null);
    this.connectFrom.set(null);
  }

  addComponent(kind: ComponentKind) {
    const d = this.design();
    const v = this.view();
    // Where the learner is looking, but never on top of another component.
    const { x, y } = freeSpot(d.nodes, { x: v.x + v.w / 2, y: v.y + v.h / 2 }, { w: W, h: H });
    const node = createNode(d, kind, x, y);
    this.patch((draft) => draft.nodes.push(node));
    this.selectedId.set(node.id);
    this.selectedEdge.set(null);
    this.announce(`Added ${this.nodeName(node.id)}`);
    void haptic.tap();
  }

  updateNode(id: string, change: Partial<DesignNode>) {
    this.patch((draft) => {
      const n = draft.nodes.find((x) => x.id === id);
      if (n) Object.assign(n, change);
    });
  }

  stepInstances(n: DesignNode, delta: number) {
    const max = COMPONENTS[n.kind].maxInstances;
    const instances = Math.min(max, Math.max(1, n.instances + delta));
    this.updateNode(n.id, { instances, failed: Math.min(n.failed ?? 0, instances) });
    this.announceSelected();
    void haptic.tap();
  }

  failInstance(n: DesignNode) {
    this.updateNode(n.id, { failed: Math.min(n.instances, (n.failed ?? 0) + 1) });
    this.announceSelected();
    refocusAfterRender(this.injector, () => (this.inspector()?.killButton() ?? this.inspector()?.recoverButton())?.nativeElement);
    void haptic.error();
  }

  recover(n: DesignNode) {
    this.updateNode(n.id, { failed: 0 });
    this.announceSelected();
    refocusAfterRender(this.injector, () => this.inspector()?.killButton()?.nativeElement);
  }

  deleteNode(id: string) {
    const name = this.nodeName(id);
    this.patch((draft) => {
      draft.nodes = draft.nodes.filter((n) => n.id !== id);
      draft.edges = draft.edges.filter((e) => e.from !== id && e.to !== id);
    });
    this.clearSelection();
    this.announce(`Removed ${name}`);
    refocusAfterRender(this.injector, () => this.svg()?.nativeElement);
  }

  deleteEdge(key: string) {
    const edge = this.edges().find((e) => e.key === key);
    this.patch((draft) => {
      draft.edges = draft.edges.filter((e) => `${e.from}->${e.to}` !== key);
    });
    this.selectedEdge.set(null);
    if (edge) this.announce(`Removed the connection from ${this.nodeName(edge.from)} to ${this.nodeName(edge.to)}`);
    refocusAfterRender(this.injector, () => this.inspector()?.connectButton()?.nativeElement ?? this.nodeElement(edge?.from));
  }

  closeInspector() {
    const node = this.selectedId() ?? this.edges().find((e) => e.key === this.selectedEdge())?.from;
    this.clearSelection();
    refocusAfterRender(this.injector, () => this.nodeElement(node));
  }

  startConnect(id: string) {
    this.connectFrom.set(id);
    const list = () => this.inspector()?.targets()?.nativeElement;
    refocusAfterRender(this.injector, () => list()?.querySelector('button') ?? list(), this.inspector()?.connectButton()?.nativeElement);
  }

  cancelConnect() {
    this.connectFrom.set(null);
    refocusAfterRender(this.injector, () => this.inspector()?.connectButton()?.nativeElement);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !this.connectFrom()) return;
    e.preventDefault();
    this.cancelConnect();
  }

  setRps(sliderValue: number) {
    this.workload.update((w) => ({ ...w, rps: Math.round(10 ** sliderValue / 100) * 100 }));
  }

  setReadRatio(pct: number) {
    this.workload.update((w) => ({ ...w, readRatio: pct / 100 }));
  }

  setBotRps(rps: number) {
    this.workload.update((w) => ({ ...w, botRps: rps }));
  }

  setObjectShare(pct: number) {
    this.workload.update((w) => ({ ...w, objectShare: pct / 100 }));
  }

  showHint() {
    this.hintsShown.update((n) => Math.min(n + 1, this.scenario()?.hints.length ?? 0));
  }

  focusInsight(nodeId?: string) {
    if (!nodeId) return;
    this.selectedId.set(nodeId);
    this.selectedEdge.set(null);
  }

  nodeName(id: string) {
    const nodes = this.design().nodes;
    const node = nodes.find((n) => n.id === id);
    if (!node) return id;
    if (node.label) return node.label;
    const same = nodes.filter((n) => n.kind === node.kind && !n.label);
    const short = COMPONENTS[node.kind].short;
    return same.length > 1 ? `${short} ${same.indexOf(node) + 1}` : short;
  }

  nodeLabel(n: DesignNode) {
    const spec = COMPONENTS[n.kind];
    const name = spec.name === spec.short ? this.nodeName(n.id) : `${this.nodeName(n.id)}, ${spec.name}`;
    if (n.kind === 'client') {
      const reads = Math.round(this.workload().readRatio * 100);
      return `${name}, ${fmt(this.result().metrics.offeredRps)} requests per second, ${reads}% reads`;
    }
    const unit = n.kind === 'db' ? 'shard' : 'instance';
    const size = `${n.instances} ${unit}${n.instances === 1 ? '' : 's'}${n.failed ? `, ${n.failed} down` : ''}`;
    const st = this.result().nodes[n.id];
    const load = st?.status === 'down' ? 'down' : `${this.utilPct(n.id)}% utilized, ${Math.round(st?.latencyMs ?? 0)} ms`;
    return `${name}, ${size}, ${load}`;
  }

  /**
   * A component can take keyboard focus while off screen on a zoomed-in phone canvas, so the board follows it. A tap
   * also focuses it, but moving the board under a finger that starts a drag would be jarring.
   */
  revealNode(e: FocusEvent, node: DesignNode) {
    if (!(e.target as Element).matches(':focus-visible')) return;
    this.view.set(reveal(this.view(), { x: node.x - W / 2, y: node.y - H / 2, w: W, h: H }, this.aspect));
  }

  activateNode(e: Event, node: DesignNode) {
    e.preventDefault();
    if (this.connectFrom()) this.connectTo(node.id);
    else this.focusInsight(node.id);
  }

  connectTo(to: string) {
    const from = this.connectFrom();
    if (from) void this.connect(from, to);
  }

  private async connect(from: string, to: string) {
    const check = canConnect(this.design(), from, to);
    this.connectFrom.set(null);
    refocusAfterRender(this.injector, () => this.inspector()?.connectButton()?.nativeElement);
    if (!check.ok) {
      void haptic.error();
      const toast = await this.toasts.create({ message: check.reason, duration: 2200, position: 'top', cssClass: 'g-toast' });
      await toast.present();
      return;
    }
    this.patch((draft) => draft.edges.push({ from, to }));
    this.announce(`Connected ${this.nodeName(from)} to ${this.nodeName(to)}`);
    void haptic.tap();
  }

  onNodeDown(e: PointerEvent, node: DesignNode) {
    e.stopPropagation();
    const from = this.connectFrom();
    if (from) {
      void this.connect(from, node.id);
      return;
    }
    const p = this.toSvg(e);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    this.drag.set({ kind: 'move', id: node.id, dx: p.x - node.x, dy: p.y - node.y, startX: p.x, startY: p.y, moved: false });
  }

  onPortDown(e: PointerEvent, node: DesignNode) {
    e.stopPropagation();
    const p = this.toSvg(e);
    this.drag.set({ kind: 'link', from: node.id, x: p.x, y: p.y });
  }

  onMove(e: PointerEvent) {
    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.moveGesture();
      return;
    }
    const d = this.drag();
    if (!d) return;
    const p = this.toSvg(e);
    if (d.kind === 'link') {
      this.drag.set({ ...d, x: p.x, y: p.y });
      return;
    }
    const moved = d.moved || Math.hypot(p.x - d.startX, p.y - d.startY) > 4;
    if (moved !== d.moved) this.drag.set({ ...d, moved });
    if (!moved) return;
    const x = clamp(p.x - d.dx, W / 2, VIEW_W - W / 2);
    const y = clamp(p.y - d.dy, H / 2, VIEW_H - H / 2);
    this.patch((draft) => {
      const n = draft.nodes.find((node) => node.id === d.id);
      if (n) {
        n.x = Math.round(x);
        n.y = Math.round(y);
      }
    });
  }

  onCancel(e: PointerEvent) {
    if (this.pointers.has(e.pointerId)) this.endPointer(e, true);
    else this.drag.set(null);
  }

  onUp(e: PointerEvent) {
    if (this.pointers.has(e.pointerId)) {
      this.endPointer(e, false);
      return;
    }
    const d = this.drag();
    this.drag.set(null);
    if (!d) return;
    if (d.kind === 'move' && !d.moved) {
      this.selectedId.set(d.id);
      this.selectedEdge.set(null);
      return;
    }
    if (d.kind === 'link') {
      const p = this.toSvg(e);
      const target = this.design().nodes.find((n) => Math.abs(n.x - p.x) <= W / 2 && Math.abs(n.y - p.y) <= H / 2);
      if (target) void this.connect(d.from, target.id);
    }
  }

  onBackground() {
    this.clearSelection();
  }

  onEdgeClick(e: Event, key: string) {
    e.stopPropagation();
    this.selectedEdge.set(key);
    this.selectedId.set(null);
  }

  log(value: number) {
    return Math.log10(value);
  }

  utilPct(id: string) {
    return Math.round(Math.min(9.99, this.result().nodes[id]?.utilization ?? 0) * 100);
  }

  private nodeElement(id: string | null | undefined) {
    return id ? this.svg()?.nativeElement.querySelector<SVGElement>(`[data-node="${CSS.escape(id)}"]`) : null;
  }

  private announce(action: string) {
    const checks = this.checks();
    const met = checks.filter((c) => c.pass).length;
    this.announcer.announce(checks.length ? `${action}. ${met} of ${checks.length} goals met.` : `${action}.`);
  }

  private announceSelected() {
    this.announce(this.nodeLabel(this.selected()!));
  }

  private patch(mutate: (draft: Design) => void) {
    const draft = structuredClone(this.design());
    mutate(draft);
    this.design.set(draft);
  }

  private toSvg(e: PointerEvent) {
    const svg = this.svg()!.nativeElement;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: pt.x, y: pt.y };
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
