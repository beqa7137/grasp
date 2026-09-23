import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { Preferences } from '@capacitor/preferences';
import {
  COMPONENTS,
  PALETTE,
  canConnect,
  createNode,
  evaluate,
  fmt,
  getScenario,
  scenarioVariant,
  simulate,
  type ComponentKind,
  type Design,
  type DesignNode,
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
  flash,
  gitCommitOutline,
  informationCircle,
  refresh,
  remove,
  skullOutline,
  trashOutline,
  trophy,
  warning,
} from 'ionicons/icons';
import { haptic } from '../../core/haptics';
import { ProgressService } from '../../core/progress.service';
import { FREE_BUILD } from './free-build';

const W = 132;
const H = 70;
const VIEW_W = 900;
const VIEW_H = 480;

type Drag =
  | { kind: 'move'; id: string; dx: number; dy: number; startX: number; startY: number; moved: boolean }
  | { kind: 'link'; from: string; x: number; y: number };

@Component({
  selector: 'app-sandbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon],
  templateUrl: './sandbox.page.html',
  styleUrl: './sandbox.page.scss',
})
export class SandboxPage {
  readonly id = input.required<string>();
  readonly revisit = input(undefined, { transform: (v: string | number | undefined) => (v === undefined || v === '' ? undefined : Number(v)) });
  private readonly progress = inject(ProgressService);
  private readonly toasts = inject(ToastController);
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('canvas');

  readonly W = W;
  readonly H = H;
  readonly viewBox = `0 0 ${VIEW_W} ${VIEW_H}`;
  readonly palette = PALETTE.map((k) => COMPONENTS[k]);
  readonly specs = COMPONENTS;
  readonly fmt = fmt;

  readonly scenario = computed<Scenario | undefined>(() => {
    if (this.id() === FREE_BUILD.id) return FREE_BUILD;
    const n = this.revisit();
    return n ? scenarioVariant(this.id(), n) : getScenario(this.id());
  });
  readonly storageKey = computed(() => `grasp.design.${this.id()}${this.revisit() ? `.r${this.revisit()}` : ''}`);
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
      return [{ key, from: e.from, to: e.to, d: curve(a.x + W / 2, a.y, b.x - W / 2, b.y), rps, status, width: 1.5 + Math.log10(rps + 1) * 0.9, dur: rps > 0 ? Math.max(0.35, 3.2 - Math.log10(rps + 1) * 0.55) : 0 }];
    });
  });

  readonly linkPreview = computed(() => {
    const d = this.drag();
    if (d?.kind !== 'link') return null;
    const from = this.design().nodes.find((n) => n.id === d.from);
    return from ? curve(from.x + W / 2, from.y, d.x, d.y) : null;
  });

  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    addIcons({ add, remove, refresh, trashOutline, skullOutline, gitCommitOutline, checkmarkCircle, closeCircleOutline, alertCircle, warning, informationCircle, bulbOutline, trophy, flash });

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
      this.saveTimer = setTimeout(() => void Preferences.set({ key, value: JSON.stringify({ design: d, workload: untracked(() => this.workload()) }) }), 400);
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
      if (counts) void this.progress.record({ type: 'scenario.completed', scenarioId: s.id, monthlyCost: cost, ...(variant ? { variant } : {}) });
    });

    inject(DestroyRef).onDestroy(() => clearTimeout(this.saveTimer));
  }

  private async restore(s: Scenario) {
    this.loaded.set(false);
    const { value } = await Preferences.get({ key: this.storageKey() });
    const saved = value ? (JSON.parse(value) as { design: Design; workload: Workload }) : null;
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
    const count = d.nodes.length;
    const node = createNode(d, kind, 420 + ((count * 53) % 260), 70 + ((count * 97) % 340));
    this.patch((draft) => draft.nodes.push(node));
    this.selectedId.set(node.id);
    this.selectedEdge.set(null);
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
    void haptic.tap();
  }

  failInstance(n: DesignNode) {
    this.updateNode(n.id, { failed: Math.min(n.instances, (n.failed ?? 0) + 1) });
    void haptic.error();
  }

  deleteNode(id: string) {
    this.patch((draft) => {
      draft.nodes = draft.nodes.filter((n) => n.id !== id);
      draft.edges = draft.edges.filter((e) => e.from !== id && e.to !== id);
    });
    this.clearSelection();
  }

  deleteEdge(key: string) {
    this.patch((draft) => {
      draft.edges = draft.edges.filter((e) => `${e.from}->${e.to}` !== key);
    });
    this.selectedEdge.set(null);
  }

  setRps(sliderValue: number) {
    this.workload.update((w) => ({ ...w, rps: Math.round(10 ** sliderValue / 100) * 100 }));
  }

  setReadRatio(pct: number) {
    this.workload.update((w) => ({ ...w, readRatio: pct / 100 }));
  }

  showHint() {
    this.hintsShown.update((n) => Math.min(n + 1, this.scenario()?.hints.length ?? 0));
  }

  focusInsight(nodeId?: string) {
    if (!nodeId) return;
    this.selectedId.set(nodeId);
    this.selectedEdge.set(null);
  }

  private async connect(from: string, to: string) {
    const check = canConnect(this.design(), from, to);
    this.connectFrom.set(null);
    if (!check.ok) {
      void haptic.error();
      const toast = await this.toasts.create({ message: check.reason, duration: 2200, position: 'top', cssClass: 'g-toast' });
      await toast.present();
      return;
    }
    this.patch((draft) => draft.edges.push({ from, to }));
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
      const n = draft.nodes.find((x) => x.id === d.id);
      if (n) {
        n.x = Math.round(x);
        n.y = Math.round(y);
      }
    });
  }

  onUp(e: PointerEvent) {
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

function curve(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
