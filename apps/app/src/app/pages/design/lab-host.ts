import type { Signal } from '@angular/core';
import type { Insight, ScenarioGoals, SimResult, Workload, WorkloadControls } from '@grasp/engine';
import type { SysEdgeView } from '../../viz/kit/sys/sys-edge.component';
import type { PlacedNode } from './lab-diagram';
import type { LabTrace } from './lab-trace';
import type { ViewBox } from './viewport';

/** Whose goals the KPIs are held to; a build without any says so instead of a dock that is always green. */
export type DockGoals = { kind: 'mission' | 'yours'; goals: ScenarioGoals } | { kind: 'none' };

/**
 * What the desktop Lab's dock and canvas overlay read from and ask of the Lab page. They load only from 1024px, so the
 * page hands itself over as an input whose type alone is imported (as the rail's `RailHost` does) and phones never fetch
 * them.
 */
export interface LabHost {
  result: Signal<SimResult>;
  dockGoals: Signal<DockGoals>;
  controls: Signal<WorkloadControls | null>;
  workload: Signal<Workload>;
  objectShare: Signal<number>;
  objectShareLabel: Signal<string>;
  canTrace: Signal<boolean>;
  view: Signal<ViewBox>;
  canvasSize: Signal<{ w: number; h: number }>;
  placedNodes: Signal<readonly PlacedNode[]>;
  edges: Signal<readonly SysEdgeView[]>;
  /** How much secondary text grows on a zoomed-out canvas (LabView.textScale). */
  textScale: Signal<number>;
  trace: Signal<LabTrace | null>;
  nodeName(id: string): string;
  insights: Signal<readonly Insight[]>;
  trafficControl: Signal<{ id: string; range: WorkloadControls['traffic']; keep: readonly number[] } | null>;
  setReadRatio(pct: number): void;
  setBotRps(rps: number): void;
  setObjectShare(pct: number): void;
  setTraffic(rps: number): void;
  startTrace(): void;
  focusInsight(nodeId?: string): void;
}
