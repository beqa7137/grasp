import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  type Type,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DecimalPipe, NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { Preferences } from '@capacitor/preferences';
import {
  COMPONENTS,
  DEFAULT_OBJECT_SHARE,
  FREE_BUILD_GOALS,
  NODE_SIZE,
  PALETTE,
  TRAFFIC,
  canConnect,
  createNode,
  evaluate,
  fmt,
  getCaseLab,
  getCaseSummary,
  getScenario,
  legacyObjectShare,
  nameObjectShare,
  restoreBoard,
  scenarioVariant,
  simulate,
  type ComponentKind,
  type Design,
  type DesignNode,
  type SavedDesign,
  type Scenario,
  type Workload,
  type WorkloadControls,
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
import { curve } from './edge-path';
import { CanvasGestures } from './canvas-gestures';
import { FREE_BUILD } from './free-build';
import { NodeInspectorComponent } from './node-inspector.component';
import type { DockGoals, LabHost } from './lab-host';
import { labDiagram, nodeLabel, nodeName } from './lab-diagram';
import { CALLOUT_MAX_W } from '../../viz/kit/sys/callouts';
import type { LabTrace } from './lab-trace';
import { LabView, type LabContent } from './lab-view';
import { NodeDrag } from './node-drag';
import { SysEdgeComponent } from '../../viz/kit/sys/sys-edge.component';
import { SysNodeComponent } from '../../viz/kit/sys/sys-node.component';
import { SysSpriteComponent } from '../../viz/kit/sys/sys-sprite.component';
import { BOARD, freeSpot } from './viewport';
import { BackComponent } from '../../ui/back.component';

const W = NODE_SIZE.w;
const H = NODE_SIZE.h;
/** Free Build offers every workload control. */
const FREE_CONTROLS: WorkloadControls = { traffic: TRAFFIC, reads: true, bots: { max: 100_000 }, files: true };
const TOOL_GROUPS: { label: string; kinds: ComponentKind[] }[] = [
  { label: 'Edge', kinds: ['cdn', 'limiter', 'lb'] },
  { label: 'Compute', kinds: ['app', 'worker'] },
  { label: 'Data', kinds: ['cache', 'db', 'replica', 'blob'] },
  { label: 'Async', kinds: ['queue'] },
];
/** Room the Traffic handle and its label take under the client, and a pinned callout under its node, in board units. */
const HANDLE_BOX = { w: 300, h: 44 };
const CALLOUT_BOX = { w: CALLOUT_MAX_W, h: 56 };

@Component({
  selector: 'app-sandbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackComponent,
    DecimalPipe,
    NgTemplateOutlet,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    IonIcon,
    NodeInspectorComponent,
    NgComponentOutlet,
    SysEdgeComponent,
    SysNodeComponent,
    SysSpriteComponent,
  ],
  providers: [AnnouncerService],
  templateUrl: './sandbox.page.html',
  styleUrl: './sandbox.page.scss',
})
export class SandboxPage implements LabHost {
  readonly id = input.required<string>();
  readonly caseId = input<string | undefined>(undefined, { alias: 'case' });
  readonly revisit = input(undefined, {
    transform: (v: string | number | undefined) => (v === undefined || v === '' ? undefined : Number(v)),
  });
  private readonly progress = inject(ProgressService);
  private readonly toasts = inject(ToastController);
  readonly announcer = inject(AnnouncerService);
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('canvas');
  readonly traceLayer = viewChild<ElementRef<SVGGElement>>('traceLayer');
  private readonly inspector = viewChild(NodeInspectorComponent);
  private readonly injector = inject(Injector);
  readonly targetsLabelId = uniqueId('sandbox-targets');

  readonly W = W;
  readonly H = H;
  readonly board = BOARD;
  readonly lab = new LabView(
    () => this.content(),
    () => this.loaded(),
  );
  readonly view = this.lab.view;
  readonly canvasSize = this.lab.size;
  readonly textScale = this.lab.textScale;
  readonly floating = this.lab.floating;
  readonly toolGroups = TOOL_GROUPS.map((g) => ({ label: g.label, tools: g.kinds.map((k) => COMPONENTS[k]) }));
  /** The dock and the canvas overlay, fetched the first time the Lab is desktop-sized, with the trace they show. */
  readonly desk = signal<{ dock: Type<unknown>; overlay: Type<unknown> } | null>(null);
  readonly trace = signal<LabTrace | null>(null);
  readonly deskInputs = { host: this as LabHost };
  readonly gestures = new CanvasGestures(
    this.view,
    () => this.lab.aspect,
    () => this.rect(),
    () => this.onBackground(),
  );
  readonly drag = new NodeDrag({
    nodes: () => this.design().nodes,
    toBoard: (e) => this.toSvg(e),
    moveNode: (id, x, y) => this.updateNode(id, { x, y }),
    connect: (from, to) => void this.connect(from, to),
    tap: (node) => this.selectNode(node),
  });
  readonly palette = PALETTE.map((k) => COMPONENTS[k]);
  readonly specs = COMPONENTS;
  readonly fmt = fmt;

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
      // Case goals come with R28; until then a build has none, and its dock says so.
      goals: { maxP99Ms: Number.POSITIVE_INFINITY, maxErrorRate: 1, maxMonthlyCost: Number.POSITIVE_INFINITY },
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
  private readonly caseLab = computed(() => {
    const id = this.caseId();
    return this.caseBuild() && id ? getCaseLab(id) : undefined;
  });
  /** The workload controls this build declares: every one in Free Build, a case's own, none in a mission. */
  readonly controls = computed<WorkloadControls | null>(() => this.caseLab()?.controls ?? (this.isFree() ? FREE_CONTROLS : null));
  readonly dockGoals = computed<DockGoals>(() => {
    const s = this.scenario();
    if (this.caseBuild() || !s) return { kind: 'none' };
    return this.isFree() ? { kind: 'yours', goals: FREE_BUILD_GOALS } : { kind: 'mission', goals: s.goals };
  });
  /** The traffic the board opened at, kept as a snap of the Traffic handle. */
  private readonly openedRps = signal(0);
  readonly trafficControl = computed(() => {
    const c = this.controls();
    const client = this.design().nodes.find((n) => n.kind === 'client');
    const keep = [this.scenario()?.workload.rps ?? 0, this.openedRps()];
    return c && client ? { id: client.id, range: c.traffic, keep } : null;
  });

  readonly design = signal<Design>({ nodes: [], edges: [] });
  readonly workload = signal<Workload>({ rps: 1000, readRatio: 0.9 });
  readonly result = computed(() => simulate(this.design(), this.workload()));
  /** The share of files the board runs at: the one its workload names, or the one the old rule reads off its stores. */
  private readonly runningShare = computed(() => this.workload().objectShare ?? legacyObjectShare(this.design(), this.result().nodes));
  readonly objectShare = computed(() => this.runningShare() ?? DEFAULT_OBJECT_SHARE);
  readonly objectShareLabel = computed(() => {
    const share = this.runningShare();
    const pct = share === undefined ? '' : `${Math.round(share * 100)}%`;
    if (this.workload().objectShare !== undefined) return pct;
    return share === undefined ? 'old rule' : `old rule (${pct})`;
  });
  readonly checks = computed(() => {
    const s = this.scenario();
    return s && !this.isFree() ? evaluate(s, this.design(), this.result()) : [];
  });
  readonly passed = computed(() => this.checks().length > 0 && this.checks().every((c) => c.pass));

  readonly selectedId = signal<string | null>(null);
  readonly selectedEdge = signal<string | null>(null);
  readonly connectFrom = signal<string | null>(null);
  readonly hintsShown = signal(0);
  readonly celebrated = signal(false);
  private readonly loaded = signal(false);

  readonly selected = computed(() => this.design().nodes.find((n) => n.id === this.selectedId()) ?? null);
  readonly selectedStats = computed(() => {
    const n = this.selected();
    return n ? this.result().nodes[n.id] : null;
  });

  readonly diagram = computed(() => {
    const lab = this.caseLab();
    const roles = lab?.roles ? { glyphs: lab.roles, kinds: new Map(lab.design.nodes.map((n) => [n.id, n.kind])) } : null;
    return labDiagram(this.design(), this.result(), this.workload(), (id) => this.nodeName(id), roles, this.selectedEdge());
  });
  readonly edges = computed(() => this.diagram().edges);
  readonly placedNodes = computed(() => this.diagram().nodes);
  readonly insights = computed(() => this.result().insights);
  readonly canTrace = computed(() => this.design().nodes.length > 1);
  /** What the desktop canvas fits on open: the nodes, their routed edges, the Traffic handle and room for callouts. */
  private readonly content = computed<LabContent>(() => {
    const nodes = this.design().nodes;
    const extra = this.edges().map((e) => {
      const xs = e.points.map((p) => p[0]);
      const ys = e.points.map((p) => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    });
    const labels = [];
    const client = nodes.find((n) => n.id === this.trafficControl()?.id);
    if (client) labels.push({ x: client.x - W / 2, y: client.y + H / 2, ...HANDLE_BOX });
    for (const id of new Set(this.insights().flatMap((i) => (i.nodeId && i.severity !== 'tip' ? [i.nodeId] : [])))) {
      const n = nodes.find((x) => x.id === id);
      if (n) labels.push({ x: n.x - CALLOUT_BOX.w / 2, y: n.y + H / 2, ...CALLOUT_BOX });
    }
    return { nodes, extra, labels };
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
    const d = this.drag.state();
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
      const w = this.workload();
      if (!this.loaded()) return;
      const key = untracked(() => this.storageKey());
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => void Preferences.set({ key, value: JSON.stringify({ design: d, workload: w }) }), 400);
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

    const resize = new ResizeObserver(([entry]) => this.lab.resize(entry.contentRect.width, entry.contentRect.height));
    effect(() => {
      const el = this.svg()?.nativeElement;
      if (el) resize.observe(el);
    });
    effect(() => {
      if (this.loaded()) untracked(() => this.lab.place());
    });
    const unwatch = this.lab.watchLayout();
    let fetching = false;
    effect(() => {
      if (!this.floating() || fetching) return;
      fetching = true;
      void import('./lab-desk').then((m) => {
        this.trace.set(new m.LabTrace());
        this.desk.set({ dock: m.LabDockComponent, overlay: m.LabOverlayComponent });
      });
    });
    effect(() => {
      this.design();
      this.workload();
      untracked(() => this.trace()?.clear());
    });
    // The floating inspector covers the canvas's right edge, so a selection there pans or refits clear of it, and the
    // home view returns once nothing is selected.
    let wasSelected = false;
    effect(() => {
      const box = this.selectionBox();
      if (!this.floating()) return;
      if (box) untracked(() => this.lab.keepClear(box));
      else if (wasSelected) untracked(() => this.lab.fit());
      wasSelected = !!box;
    });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.saveTimer);
      resize.disconnect();
      unwatch();
      this.trace()?.destroy();
    });
    onPageKey((e) => this.onKey(e));
  }

  /** The selected node's or edge's box, which the floating inspector must not cover. */
  private readonly selectionBox = computed(() => {
    const node = this.selected();
    if (node) return { x: node.x - W / 2, y: node.y - H / 2, w: W, h: H };
    const edge = this.edges().find((e) => e.key === this.selectedEdge());
    return edge ? { x: edge.mid[0] - 40, y: edge.mid[1] - 20, w: 80, h: 40 } : null;
  });

  onCanvasDown(e: PointerEvent) {
    this.svg()?.nativeElement.setPointerCapture?.(e.pointerId);
    this.gestures.down(e);
  }

  private rect() {
    return this.svg()!.nativeElement.getBoundingClientRect();
  }

  private async restore(s: Scenario) {
    this.loaded.set(false);
    this.lab.unplace();
    const { value } = await Preferences.get({ key: this.storageKey() });
    const board = restoreBoard(value ? (JSON.parse(value) as SavedDesign) : null, s, this.isFree());
    this.design.set(board.design);
    this.workload.set(board.workload);
    this.openedRps.set(board.workload.rps);
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

  setTraffic(rps: number) {
    this.workload.update((w) => ({ ...w, rps }));
  }

  startTrace() {
    void this.trace()?.start(this.design(), this.result(), this.diagram(), this.traceLayer()?.nativeElement, this.svg()?.nativeElement);
  }

  /** Escape on the canvas (a selected node has focus) closes the inspector, as it does inside it. */
  onCanvasKey(e: KeyboardEvent) {
    if (this.selected() || this.selectedEdge()) this.closeOnEscape(e);
  }

  /** Escape inside the floating inspector closes it and returns focus to its node. */
  closeOnEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape' || this.connectFrom()) return;
    e.preventDefault();
    e.stopPropagation();
    this.closeInspector();
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
    const named = nameObjectShare({ design: this.design(), workload: this.workload() }, pct / 100);
    if (named.design !== this.design()) this.design.set(named.design);
    this.workload.set(named.workload);
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
    return nodeName(this.design().nodes, id);
  }

  nodeLabel(n: DesignNode) {
    const lab = this.caseLab();
    const role = lab?.roles?.[n.id] && lab.design.nodes.some((o) => o.id === n.id && o.kind === n.kind) ? lab.roles[n.id] : undefined;
    return nodeLabel(n, this.nodeName(n.id), role, this.result(), this.workload());
  }

  /**
   * A component can take keyboard focus while off screen on a zoomed-in phone canvas, so the board follows it. A tap
   * also focuses it, but moving the board under a finger that starts a drag would be jarring.
   */
  revealNode(e: FocusEvent, node: DesignNode) {
    if (!(e.target as Element).matches(':focus-visible')) return;
    this.lab.reveal({ x: node.x - W / 2, y: node.y - H / 2, w: W, h: H });
  }

  activateNode(e: Event, node: DesignNode) {
    e.preventDefault();
    if (this.connectFrom()) this.connectTo(node.id);
    else this.selectNode(node);
  }

  /** Selects a node; on desktop, tapping the client also traces a request from it. */
  selectNode(node: DesignNode) {
    this.focusInsight(node.id);
    if (node.kind === 'client' && this.floating()) this.startTrace();
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
    if (from) void this.connect(from, node.id);
    else this.drag.nodeDown(e, node);
  }

  onMove(e: PointerEvent) {
    if (this.gestures.has(e.pointerId)) this.gestures.move(e);
    else this.drag.move(e);
  }

  onCancel(e: PointerEvent) {
    if (this.gestures.has(e.pointerId)) this.gestures.end(e, true);
    else this.drag.cancel();
  }

  onUp(e: PointerEvent) {
    if (this.gestures.has(e.pointerId)) this.gestures.end(e, false);
    else this.drag.up(e);
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
